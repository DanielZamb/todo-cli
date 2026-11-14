#!/usr/bin/env python3
"""A stopped Swift run leaves no process behind (coordinator, candidate 11).

Usage: python3 .agents/skills/verify-macos/scripts/verify-runner-cleanup.py <fresh evidence dir>

Builds the state package's tests, then runs RunnerCleanupProbeTests.hangsOnPurpose (a test that
never ends) through apps/macos/scripts/state_package.py twice:
- at a time limit (STATE_PACKAGE_TIMEOUT=20): the run must end with 124;
- stopped from outside (SIGTERM to state_package.py alone, as a harness or an owner stops it).
After each, no process of that run may remain: nothing whose command line names the run's test
bundle or swiftpm-testing-helper in this checkout and that was not running before. A third case,
pidIdentity (MAC-C11-S1-6), needs no build: the runner signals a process only when its pid and its
start time both match (a live `sleep` is spared under another start time and stopped under its own),
and a child that is already reaped gets no signal at all. Writes result.json; exit 0 only when every
case holds. A process this script started is stopped by it at the end whatever happens.

For a red run on an older runner: RUNNER_CLEANUP_STATE_PACKAGE=<a copy of an older
state_package.py inside apps/macos/scripts> and RUNNER_CLEANUP_CASES=stopped (an older runner has
no time limit, so only the stop from outside can be shown); pidIdentity also runs against an older
runner, which signals by pid alone.
"""
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
os.chdir(ROOT)
evidence = Path(sys.argv[1]).resolve()
evidence.mkdir(parents=True, exist_ok=False)
SCRATCH = 'apps/macos/DerivedData/StateProof'
RUNNER = os.environ.get('RUNNER_CLEANUP_STATE_PACKAGE', 'apps/macos/scripts/state_package.py')
CASES = os.environ.get('RUNNER_CLEANUP_CASES', 'pidIdentity,timeLimit,stopped').split(',')
BASE = [sys.executable, RUNNER, 'swift', 'test', '--package-path', 'apps/macos', '--scratch-path', SCRATCH,
        '--disable-automatic-resolution', '--jobs', '2', '--no-parallel', '--filter', 'RunnerCleanupProbeTests']


def run_processes():
    rows = subprocess.run(['/bin/ps', '-axo', 'pid=,command='], capture_output=True, text=True, check=True).stdout.splitlines()
    found = {}
    for row in rows:
        pid, _, command = row.strip().partition(' ')
        # Only this checkout's run: other units build the same package in their own worktrees.
        mine = str(ROOT) in command
        if mine and ('swiftpm-testing-helper' in command or 'TodoStateProofPackageTests' in command or 'RunnerCleanupProbeTests' in command) and int(pid) != os.getpid():
            found[int(pid)] = command[:200]
    return found


def wait_for_probe(before, seconds=120):
    """The run's own test helper is running (not one that was there before)."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if any(('swiftpm-testing-helper' in c or 'TodoStateProofPackageTests' in c) and pid not in before for pid, c in run_processes().items()):
            return True
        time.sleep(0.5)
    return False


cases = {}
started = []
leftovers = set()
before = set()
try:
    if 'pidIdentity' in CASES:
        # 3. Processes are named by pid and start time; a reaped child is not touched (MAC-C11-S1-6).
        import importlib
        sys.path.insert(0, str(ROOT / Path(RUNNER).parent))
        package = importlib.import_module(Path(RUNNER).stem)
        starts = getattr(package, '_starts', lambda pids: {pid: None for pid in pids})  # an older runner has none
        sleeper = subprocess.Popen(['/bin/sleep', '60'], start_new_session=True)
        started.append(sleeper)
        time.sleep(0.2)
        own = starts([sleeper.pid])
        package._signal({sleeper.pid: 'Thu Jan  1 00:00:00 1970'}, signal.SIGTERM)  # the same pid under another start time
        time.sleep(0.3)
        spared = sleeper.poll() is None
        package._signal(own, signal.SIGTERM)
        try: sleeper.wait(timeout=5)
        except subprocess.TimeoutExpired: pass
        stopped_own = sleeper.returncode == -signal.SIGTERM
        quick = subprocess.Popen(['/usr/bin/true'])
        quick.wait()
        sent = []
        real_kill = package.os.kill
        package.os.kill = lambda pid, sig: sent.append([pid, int(sig)])
        try: package._stop_tree(quick)
        finally: package.os.kill = real_kill
        cases['pidIdentity'] = dict(otherStartSpared=spared, ownStartStopped=stopped_own, reapedChildSignals=sent, passed=spared and stopped_own and not sent)
    # The other cases need the built probe; pidIdentity alone does not.
    build = subprocess.run([sys.executable, 'apps/macos/scripts/state_package.py', 'swift', 'build', '--build-tests', '--package-path', 'apps/macos', '--scratch-path', SCRATCH,
                            '--disable-automatic-resolution', '--jobs', '2'], stdout=open(evidence / 'build.log', 'w'), stderr=subprocess.STDOUT) if {'timeLimit', 'stopped'} & set(CASES) else None
    if build is not None and build.returncode:
        raise SystemExit(f'build failed: {build.returncode}')
    env = dict(os.environ, RUNNER_HANG_PROBE='1', STATE_PACKAGE_RECEIPT=str(evidence / 'keychain-guard.json'))
    if 'timeLimit' in CASES:
        # 1. The time limit.
        before = set(run_processes())
        start = time.monotonic()
        limited = subprocess.Popen([*BASE, '--skip-build'], env=dict(env, STATE_PACKAGE_TIMEOUT='20'), stdout=open(evidence / 'time-limit.log', 'w'), stderr=subprocess.STDOUT, start_new_session=True)
        started.append(limited)
        code = limited.wait(timeout=120)
        time.sleep(2)
        left = {pid: c for pid, c in run_processes().items() if pid not in before}
        leftovers |= set(left)
        cases['timeLimit'] = dict(exit=code, seconds=round(time.monotonic() - start, 1), leftover=left, passed=code == 124 and not left)
    if 'stopped' in CASES:
        # 2. Stopped from outside: SIGTERM to the runner only, once the hanging test runs.
        before = set(run_processes())
        stopped = subprocess.Popen([*BASE, '--skip-build'], env=env, stdout=open(evidence / 'stopped.log', 'w'), stderr=subprocess.STDOUT, start_new_session=True)
        started.append(stopped)
        probe_running = wait_for_probe(before)
        os.kill(stopped.pid, signal.SIGTERM)
        code = stopped.wait(timeout=30)
        time.sleep(2)
        left = {pid: c for pid, c in run_processes().items() if pid not in before}
        leftovers |= set(left)
        cases['stoppedFromOutside'] = dict(probeWasRunning=probe_running, exit=code, leftover=left, passed=probe_running and code == 128 + signal.SIGTERM and not left)
finally:
    # Leave nothing of ours behind whatever happened above.
    for process in started:
        try: os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError: pass
    for pid in leftovers:
        try: os.kill(pid, signal.SIGKILL)
        except ProcessLookupError: pass
result = dict(cases=cases, passed=bool(cases) and all(c['passed'] for c in cases.values()))
(evidence / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
sys.exit(0 if result['passed'] else 1)
