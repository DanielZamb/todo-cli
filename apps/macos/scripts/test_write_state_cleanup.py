#!/usr/bin/env python3
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / '.agents/skills/verify-macos-lifecycle/scripts'))
from owned_process import OwnedCommands


class CancellationTests(unittest.TestCase):
    def check_cancellation(self, phase):
        with tempfile.TemporaryDirectory(prefix='w06-cancellation-') as directory:
            case = Path(directory)
            ready = case / 'ready.json'
            shim = case / ('bun' if phase == 'compile' else 'swift')
            shim.write_text(f'''#!{sys.executable}
import json, os, signal, subprocess, sys, time
from pathlib import Path
signal.signal(signal.SIGTERM, signal.SIG_IGN)
child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(300)'], preexec_fn=os.setpgrp)
Path(os.environ['W06_READY']).write_text(json.dumps(dict(session=os.getsid(0), scratch=str(Path.cwd()) if {phase!r} == 'compile' else os.environ.get('TODO_W06_SCRATCH'), server=os.environ.get('TODO_W06_SERVER'), child=child.pid)))
time.sleep(300)
''')
            shim.chmod(0o755)
            evidence = case / 'evidence'
            env = dict(os.environ, PATH=str(case) + os.pathsep + os.environ['PATH'], W06_READY=str(ready))
            process = subprocess.Popen([sys.executable, str(root / 'apps/macos/scripts/verify-write-state.py'), str(evidence)], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
            session = None
            try:
                deadline = time.monotonic() + 60
                while not ready.exists() and time.monotonic() < deadline:
                    if process.poll() is not None:
                        self.fail(process.communicate()[0].decode())
                    time.sleep(0.05)
                self.assertTrue(ready.exists(), 'Shim readiness timed out')
                state = json.loads(ready.read_text())
                session = state['session']
                self.assertGreaterEqual(len(OwnedCommands.groups(session)), 2)
                process.send_signal(signal.SIGTERM)
                output, _ = process.communicate(timeout=15)
                self.assertEqual(process.returncode, 143, output.decode())
                self.assertEqual(OwnedCommands.groups(session), set())
                self.assertFalse(Path(state['scratch']).exists())
                self.assertFalse((evidence / 'command-unsafe').exists())
                self.assertFalse((evidence / 'result.json').exists())
                if state['server']:
                    port = int(state['server'].rsplit(':', 1)[1])
                    with socket.socket() as connection:
                        self.assertNotEqual(connection.connect_ex(('127.0.0.1', port)), 0)
                    self.assertTrue(json.loads((evidence / 'cleanup.json').read_text())['serverStopped'])
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate(timeout=5)
                if session is not None:
                    OwnedCommands.signal_groups(OwnedCommands.groups(session), signal.SIGKILL)

    def test_sigterm_during_compilation_reaps_descendant_groups(self):
        self.check_cancellation('compile')

    def test_sigterm_during_tests_stops_server_and_descendant_groups(self):
        self.check_cancellation('tests')


if __name__ == '__main__':
    unittest.main()
