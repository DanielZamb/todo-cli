#!/usr/bin/env python3
"""The Series sheet's default action in a real key window (Mac UI review 2, item 4).

Usage: series-key-window.py <fresh absolute evidence dir>

It shows a window of this test process for a few seconds and makes it key, so it starts only if
neither Todo app is frontmost and there has been no keyboard or pointer input for a minute; it
re-checks both just before the window appears. It never launches Todo.app, never signs, and its
test product is built and checked by apps/macos/scripts/state_package.py (no Keychain call linked).
The test (StateTests/SeriesKeyWindowTests.swift) measures "Create Series" against the app's
primary colour and the system accent, presses Return, and records whether the Series write starts.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
TODO_APPS = {'local.todo.Todo', 'dev.todo.electron'}


def frontmost() -> str:
    front = subprocess.run(['lsappinfo', 'front'], capture_output=True, text=True).stdout.strip()
    info = subprocess.run(['lsappinfo', 'info', '-only', 'bundleid', front], capture_output=True, text=True).stdout
    return info.split('=')[-1].strip().strip('"') if '=' in info else ''


def idle_seconds() -> float:
    output = subprocess.run(['ioreg', '-c', 'IOHIDSystem'], capture_output=True, text=True).stdout
    for line in output.splitlines():
        if 'HIDIdleTime' in line:
            return int(line.split('=')[-1].strip()) / 1e9
    return 0.0


def precondition() -> dict:
    state = dict(frontmost=frontmost(), idle_seconds=round(idle_seconds(), 1))
    state['met'] = state['frontmost'] not in TODO_APPS and state['idle_seconds'] >= 60
    return state


evidence = Path(sys.argv[1])
assert evidence.is_absolute() and not evidence.exists(), 'Pass a fresh absolute evidence directory'
evidence.mkdir(parents=True)
before = precondition()
(evidence / 'precondition.json').write_text(json.dumps(before, indent=2) + '\n')
if not before['met']:
    print(f'NOT STARTED: {before}'); sys.exit(11)
build = ROOT / 'apps/macos/DerivedData/StateProof'
env = dict(os.environ, STATE_PACKAGE_RECEIPT=str(evidence / 'keychain-guard.json'))
built = subprocess.run([sys.executable, str(ROOT / 'apps/macos/scripts/state_package.py'), 'swift', 'build', '--build-tests', '--jobs', '2',
                        '--disable-automatic-resolution', '--package-path', 'apps/macos', '--scratch-path', str(build)],
                       cwd=ROOT, env=env, capture_output=True, text=True)
(evidence / 'build.log').write_text(built.stdout + built.stderr)
assert built.returncode == 0, 'build failed'
# The build can take minutes: the owner may have come back. Check again just before the window.
again = precondition()
(evidence / 'precondition-before-window.json').write_text(json.dumps(again, indent=2) + '\n')
if not again['met']:
    print(f'NOT STARTED: {again}'); sys.exit(11)
env.update(TODO_SERIES_KEY_WINDOW='1', TODO_SERIES_KEY_WINDOW_EVIDENCE=str(evidence))
test = subprocess.run([sys.executable, str(ROOT / 'apps/macos/scripts/state_package.py'), 'swift', 'test', '--skip-build', '--jobs', '2', '--no-parallel',
                       '--disable-automatic-resolution', '--package-path', 'apps/macos', '--scratch-path', str(build),
                       '--filter', 'SeriesKeyWindowTests'], cwd=ROOT, env=env, capture_output=True, text=True, timeout=600)
(evidence / 'test.log').write_text(test.stdout + test.stderr)
guard = json.loads((evidence / 'keychain-guard.json').read_text())
receipt = json.loads((evidence / 'series-key-window.json').read_text()) if (evidence / 'series-key-window.json').exists() else None
result = dict(status='PASS' if test.returncode == 0 else 'FAIL', exit=test.returncode, precondition=[before, again], receipt=receipt,
              keychainLinked=guard['keychainLinked'], keychainGuard='keychain-guard.json', todoAppLaunched=False, signed=False)
(evidence / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(status=result['status'], evidence=str(evidence))))
sys.exit(test.returncode)
