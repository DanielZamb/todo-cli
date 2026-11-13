"""Isolation for the compiled Todo binaries the Mac runners spawn (candidate 10, group C).

The profile is the reference one from briefs/ISOLATION.md (profile.sb here), with the owner's real
data directory passed as REAL_TODO_HOME at run time, read from the account database (never from
HOME, which the runners point at a scratch home), so no machine path is tracked.

- `controls(evidence)` runs the brief's five node controls before any Todo binary runs under the
  profile, writes isolation-controls.json and raises unless all five hold:
  1. an owned listener on 14310: inside gets EPERM, outside connects (4310 is never probed);
  2. an external address (1.1.1.1:80) from inside: EPERM;
  3. a loopback listener on an ephemeral port from inside: connects;
  4. reading the real ~/.todo-cli from inside: EPERM;
  5. a child process inside inherits all four.
- `wrap(real, wrapper)` writes a shell wrapper that runs `real` under the profile; runners spawn the
  wrapper (from Python and, through the paths they pass, from Swift tests) and hash the real binary.
- `write_receipt(evidence, wrapped, reason)` writes isolation.json: which binaries ran under the
  profile. A Swift build or test process cannot be wrapped (SwiftPM sandboxes its manifest compile,
  and a sandbox cannot be applied inside a sandbox); the binaries it spawns are the wrappers.
"""
import hashlib
import json
import os
import pwd
import shlex
import socket
import subprocess
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROFILE = HERE / 'profile.sb'
PROBE = HERE / 'probe.cjs'
SANDBOX = '/usr/bin/sandbox-exec'


def real_todo_home() -> str:
    return os.path.join(pwd.getpwuid(os.getuid()).pw_dir, '.todo-cli')


def _sandboxed(argv: list) -> list:
    return [SANDBOX, '-D', f'REAL_TODO_HOME={real_todo_home()}', '-f', str(PROFILE), *argv]


class _Listener:
    """An owned loopback listener that accepts and closes connections."""
    def __init__(self, port: int):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.socket.bind(('127.0.0.1', port))
        self.socket.listen(8)
        self.port = self.socket.getsockname()[1]
        self.accepted = 0
        self.thread = threading.Thread(target=self._serve, daemon=True)
        self.thread.start()

    def _serve(self):
        while True:
            try:
                connection, _ = self.socket.accept()
            except OSError:
                return
            self.accepted += 1
            connection.close()

    def close(self):
        self.socket.close()


def controls(evidence: Path) -> dict:
    node = subprocess.run(['/usr/bin/which', 'node'], capture_output=True, text=True).stdout.strip()
    if not node:
        raise RuntimeError('isolation controls need node (bun reports a sandbox denial as ECONNREFUSED)')
    owned = _Listener(14310)
    loopback = _Listener(0)
    try:
        args = [node, str(PROBE), '{mode}', real_todo_home(), str(owned.port), str(loopback.port)]
        outer = json.loads(subprocess.run([a.format(mode='outer') for a in args], capture_output=True, text=True, timeout=30, check=True).stdout)
        inner = json.loads(subprocess.run(_sandboxed([a.format(mode='inner') for a in args]), capture_output=True, text=True, timeout=30, check=True).stdout)
    finally:
        owned.close()
        loopback.close()
    checks = {
        '1 owned 14310: inside EPERM, outside connects': inner['owned14310'] == 'EPERM' and outer['owned14310'] == 'CONNECTED',
        '2 external address from inside: EPERM': inner['external'] == 'EPERM',
        '3 loopback ephemeral from inside: connects': inner['loopback'] == 'CONNECTED' and outer['loopback'] == 'CONNECTED',
        '4 real ~/.todo-cli from inside: EPERM': inner['realHome'] == 'EPERM',
        '5 a child inside inherits all four': inner['child']['owned14310'] == 'EPERM' and inner['child']['external'] == 'EPERM'
            and inner['child']['loopback'] == 'CONNECTED' and inner['child']['realHome'] == 'EPERM',
    }
    record = {'profileSha256': hashlib.sha256(PROFILE.read_bytes()).hexdigest(), 'probeSha256': hashlib.sha256(PROBE.read_bytes()).hexdigest(),
              'node': node, 'outer': outer, 'inner': inner, 'checks': checks, 'passed': all(checks.values())}
    (evidence / 'isolation-controls.json').write_text(json.dumps(record, indent=2) + '\n')
    if not record['passed']:
        raise RuntimeError(f'isolation controls failed: {[k for k, v in checks.items() if not v]}')
    return record


def wrap(real: Path, wrapper: Path) -> Path:
    real = Path(real).resolve()
    wrapper.parent.mkdir(parents=True, exist_ok=True)
    wrapper.write_text('#!/bin/sh\nexec ' + ' '.join(shlex.quote(a) for a in _sandboxed([str(real)])) + ' "$@"\n')
    wrapper.chmod(0o755)
    return wrapper


def write_receipt(evidence: Path, wrapped: dict, controls_record: dict | None, reason: str | None = None) -> dict:
    """`wrapped`: name -> {'real': path, 'wrapper': path}. Empty when the runner spawns no Todo binary."""
    receipt = {
        'binariesUnderProfile': bool(wrapped) and bool(controls_record and controls_record['passed']),
        'spawnsTodoBinaries': bool(wrapped) or reason is None,
        'profileSha256': hashlib.sha256(PROFILE.read_bytes()).hexdigest(),
        'controlsPassed': bool(controls_record and controls_record['passed']),
        'binaries': {name: {'real': str(entry['real']), 'realSha256': hashlib.sha256(Path(entry['real']).read_bytes()).hexdigest(),
                            'wrapper': str(entry['wrapper'])} for name, entry in wrapped.items()},
        'notWrapped': reason,
        'swiftNotWrapped': 'Swift builds and test processes are not wrapped: SwiftPM sandboxes its manifest compile, and a sandbox cannot be applied inside one. The Todo binaries they spawn are the wrappers above.',
    }
    (evidence / 'isolation.json').write_text(json.dumps(receipt, indent=2) + '\n')
    return receipt
