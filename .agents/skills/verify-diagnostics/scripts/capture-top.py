#!/usr/bin/env python3
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import signal
import struct
import subprocess
import sys
import termios
import time

binary, server, evidence_path = sys.argv[1:]
evidence = Path(evidence_path)
master, slave = pty.openpty()
original = termios.tcgetattr(slave)
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 44, 128, 0, 0))
process = subprocess.Popen([binary, '--profile', 'work', 'top', '--server', server], stdin=slave, stdout=slave, stderr=slave, env=dict(os.environ, TERM='xterm-256color'))
chunks = []
def collect(seconds):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        ready, _, _ = select.select([master], [], [], .05)
        if ready:
            chunks.append(os.read(master, 262144))

def frame():
    transcript = b''.join(chunks).decode(errors='replace')
    frames = transcript.split('\x1b[H')
    completed = [value.split('\x1b[J')[0] for value in frames[1:] if '\x1b[J' in value]
    return re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', completed[-1] if completed else '').replace('\r', '').strip()

try:
    for _ in range(600):
        collect(.1)
        if 'Connected clients' in frame():
            break
    assert 'TODO / diagnostics' in frame(), frame()
    assert 'Connected clients' in frame(), frame()
    assert 'Latency' in frame(), frame()
    for key in [b'\t', b'\t', b'\t', b'\x1b[B', b'\x1b[B']:
        os.write(master, key)
        collect(.1)
    previous = re.search(r'GET /health\s+n=(\d+)', frame())
    expected = int(previous.group(1)) + 1 if previous else 1
    health = subprocess.run(['curl', '--silent', '--show-error', '--max-time', '5', server + '/health'], capture_output=True, text=True)
    assert health.returncode == 0
    assert json.loads(health.stdout) == {'service': 'todo-server'}
    for _ in range(17):
        collect(.1)
        if re.search(r'GET /health\s+n=' + str(expected) + r'\b', frame()):
            break
    assert re.search(r'GET /health\s+n=' + str(expected) + r'\b', frame()), frame()
    for _ in range(3):
        os.write(master, b'\x1b[Z')
        collect(.1)
    evidence.joinpath('top-full.txt').write_text(frame())
    os.write(master, b'\t')
    collect(.2)
    assert '╔ Operations═' in frame(), frame()
    os.write(master, b'p')
    collect(.2)
    assert 'profile: personal' in frame().lower() or 'profile: work' in frame().lower(), frame()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 80, 0, 0))
    process.send_signal(signal.SIGWINCH)
    collect(.3)
    assert '╔ Operations═' in frame(), frame()
    evidence.joinpath('top-compact.txt').write_text(frame())
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 8, 20, 0, 0))
    process.send_signal(signal.SIGWINCH)
    collect(.2)
    assert 'q quit' in frame(), frame()
    os.write(master, b'q')
    collect(.2)
    assert process.wait(timeout=5) == 0
    restored = termios.tcgetattr(slave)
    assert bool(restored[3] & termios.ICANON) == bool(original[3] & termios.ICANON)
    assert bool(restored[3] & termios.ECHO) == bool(original[3] & termios.ECHO)
    transcript = b''.join(chunks)
    assert b'\x1b[?25h' in transcript
    assert b'\x1b[?1049l' in transcript
    evidence.joinpath('top.ansi').write_bytes(transcript)
    evidence.joinpath('top-proof.json').write_text(json.dumps(dict(exit=process.returncode, panes=True, profile=True, liveRefresh=True, resize=True, terminalRestored=True)) + '\n')
finally:
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    os.close(master)
    os.close(slave)
