import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import signal
import time

from native_guard import run_once, finish_focused, stop_group, process_token, process_path, signal_process


class NativeGuardTests(unittest.TestCase):
    def assert_stopped(self, pid):
        state = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='], capture_output=True, text=True).stdout.strip()
        self.assertTrue(not state or state.startswith('Z'), state)

    def test_cancellation_during_successful_cleanup_blocks_next_launch(self):
        for signum in (signal.SIGTERM, signal.SIGINT):
            with self.subTest(signal=signum), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                script = '''import json,os,pathlib,signal,sys
import native_guard as guard
previous={name:signal.getsignal(name) for name in (signal.SIGTERM,signal.SIGINT)}
original=guard.stop_group
def cancel_during_cleanup(*args,**kwargs):
    os.kill(os.getpid(),SIGNUM)
    original(*args,**kwargs)
guard.stop_group=cancel_during_cleanup
with open('log','w') as log:
    code=guard.run_once([sys.executable,'-c','pass'],cwd=pathlib.Path.cwd(),log=log,failure_path=pathlib.Path('fault'))
if code == 0: pathlib.Path('launched').touch()
guard.finish_focused(pathlib.Path.cwd(),completed=code == 0)
pathlib.Path('result').write_text(json.dumps({'code':code,'restored':all(signal.getsignal(name)==handler for name,handler in previous.items())}))
'''.replace('SIGNUM', str(int(signum)))
                (root / 'ui-proof.json').write_text('{"passed":true}')
                result = subprocess.run([sys.executable, '-c', script], cwd=root,
                                        env={**os.environ, 'PYTHONPATH': str(Path(__file__).parent)},
                                        capture_output=True, text=True, timeout=5)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads((root / 'result').read_text()), {'code': 130, 'restored': True})
                self.assertFalse((root / 'launched').exists())
                self.assertFalse((root / 'finish-proof').exists())
                self.assertTrue((root / 'abort-proof').exists())

    def test_run_once_restores_handlers_after_spawn_and_cleanup_errors(self):
        previous = {name: signal.getsignal(name) for name in (signal.SIGTERM, signal.SIGINT)}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (root / 'log').open('w') as log:
                with self.assertRaises(FileNotFoundError):
                    run_once(['/does/not/exist'], cwd=root, log=log, failure_path=root / 'fault')
                self.assertEqual({name: signal.getsignal(name) for name in previous}, previous)
                with patch('native_guard.stop_group', side_effect=RuntimeError('cleanup failed')):
                    with self.assertRaisesRegex(RuntimeError, 'cleanup failed'):
                        run_once([sys.executable, '-c', 'pass'], cwd=root, log=log, failure_path=root / 'fault')
                self.assertEqual({name: signal.getsignal(name) for name in previous}, previous)

    def test_stale_process_identity_cannot_signal_a_live_pid(self):
        child = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(30)'])
        try:
            token = process_token(child.pid)
            self.assertIsNotNone(process_path(token))
            stale = (*token[:7], token[7] ^ 1)
            self.assertIsNone(process_path(stale))
            signal_process(stale, signal.SIGKILL)
            self.assertIsNone(child.poll())
        finally:
            child.kill()
            child.wait(timeout=2)

    def test_stubborn_child_is_killed_even_if_group_leader_exits(self):
        for exits in (False, True):
            with self.subTest(leader_exits=exits), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                child = 'import os,pathlib,signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);pathlib.Path("child-ready").write_text(str(os.getpid()));time.sleep(30)'
                script = 'import pathlib,subprocess,sys,time\nsubprocess.Popen([sys.executable,"-c",' + repr(child) + '])\nwhile not pathlib.Path("child-ready").exists(): time.sleep(.01)\n'
                script += 'sys.exit(0)\n' if exits else 'pathlib.Path("fault").write_text("cancelled")\ntime.sleep(30)\n'
                with (root / 'log').open('w') as log:
                    code = run_once([sys.executable, '-c', script], cwd=root, log=log, failure_path=root / 'fault', timeout=5)
                self.assertEqual(code, 0 if exits else 78)
                self.assert_stopped(int((root / 'child-ready').read_text()))

    def test_sigterm_outside_build_runs_cleanup_and_resumes_owned_driver(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            child = 'import os,pathlib,signal,time;signal.signal(signal.SIGCONT,lambda *_: pathlib.Path("resumed").touch());pathlib.Path("child-ready").write_text(str(os.getpid()));time.sleep(30)'
            script = '''import json,os,pathlib,signal,subprocess,sys,time
from native_guard import install_cancellation_handler,cleanup_scope,stop_process
install_cancellation_handler()
child=subprocess.Popen([sys.executable,'-c',CHILD])
try:
    while not pathlib.Path('child-ready').exists(): time.sleep(.01)
    os.kill(child.pid,signal.SIGSTOP)
    pathlib.Path('ready').touch()
    time.sleep(30)
finally:
    with cleanup_scope():
        os.kill(child.pid,signal.SIGCONT)
        deadline=time.monotonic()+1
        while not pathlib.Path('resumed').exists() and time.monotonic()<deadline: time.sleep(.01)
        stop_process(child)
        pathlib.Path('cleanup').write_text(json.dumps({'resumed':pathlib.Path('resumed').exists(),'stopped':child.poll() is not None}))
'''.replace('CHILD', repr(child))
            with (root / 'log').open('w') as log:
                run = subprocess.Popen([sys.executable, '-c', script], cwd=root, env={**os.environ, 'PYTHONPATH': str(Path(__file__).parent)}, stdout=log, stderr=log, start_new_session=True)
                try:
                    deadline = time.monotonic() + 3
                    while not (root / 'ready').exists() and time.monotonic() < deadline:
                        time.sleep(.01)
                    self.assertTrue((root / 'ready').exists())
                    run.terminate()
                    self.assertNotEqual(run.wait(timeout=3), 0)
                    self.assertEqual(json.loads((root / 'cleanup').read_text()), {'resumed': True, 'stopped': True})
                finally:
                    stop_group(run.pid)
                    run.wait(timeout=2)

    def test_focused_cleanup_escalates_detached_child_and_resumes_driver(self):
        self.focused_cleanup('success')

    def test_focused_failures_abort_and_resume_driver(self):
        for outcome in ('survivor', 'export', 'cancel', 'timeout', 'late-term', 'late-int'):
            with self.subTest(outcome=outcome):
                self.focused_cleanup(outcome)

    def test_stored_process_reuse_is_rejected_before_pause_or_build(self):
        for outcome in ('reused-app', 'reused-driver', 'driver-exit'):
            with self.subTest(outcome=outcome):
                self.focused_cleanup(outcome)

    def focused_cleanup(self, outcome):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scripts = root / '.agents/skills/verify-macos/scripts'
            scripts.mkdir(parents=True)
            source = Path(__file__).with_name('run-ui-tests.py').read_text().replace('import json', 'import json\nimport os', 1)
            source = source.replace("app_binary = str(root / 'dist/signed.noindex/macos/Todo.app/Contents/MacOS/Todo')", "app_binary = process_path(process_token(os.getpid()))")
            (scripts / 'run-ui-tests.py').write_text(source)
            derived = root / 'apps/macos/DerivedData'
            derived.mkdir(parents=True)
            evidence = root / 'evidence'
            evidence.mkdir()
            (evidence / 'ui-proof.json').write_text('{"passed":true}')
            child = "import os,pathlib,signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);pathlib.Path('child-ready').write_text(str(os.getpid()));time.sleep(30)"
            driver = "import json,pathlib,signal,time;signal.signal(signal.SIGCONT,lambda *_: pathlib.Path('resumed').write_text(json.dumps({'finish':pathlib.Path('evidence/finish-proof').exists(),'abort':pathlib.Path('evidence/abort-proof').exists()})));pathlib.Path('driver-ready').touch();time.sleep(30)"
            owned = subprocess.Popen([sys.executable, '-c', child], cwd=root, start_new_session=True)
            unrelated = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(30)'])
            original_app = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(30)'])
            paused = subprocess.Popen([sys.executable, '-c', driver], cwd=root)
            try:
                deadline = time.monotonic() + 3
                while not all((root / name).exists() for name in ('child-ready', 'driver-ready')) and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertTrue((root / 'child-ready').exists())
                self.assertTrue((root / 'driver-ready').exists())
                config = {'appPid': str(unrelated.pid if outcome == 'reused-app' else original_app.pid), 'db': str(root / 'scratch/db'), 'evidence': str(evidence), 'keychainService': 'synthetic', 'server': 'synthetic'}
                (derived / 'verification.json').write_text(json.dumps(config))
                signed = root / 'dist/signed.noindex/macos'
                signed.mkdir(parents=True)
                (signed / 'Todo.xctestrun').write_text('synthetic')
                script = '''import pathlib,runpy,subprocess,sys
from unittest.mock import patch
import native_guard,os,signal,time
previous={name:signal.getsignal(name) for name in (signal.SIGTERM,signal.SIGINT)}
root=pathlib.Path.cwd()
entry=root/'.agents/skills/verify-macos/scripts/run-ui-tests.py'
checks=0
original=subprocess.check_output
stop=native_guard.stop_native_processes
send=native_guard.signal_process
identify=native_guard.process_token
checked_driver=False
def signal_process(token,signum):
    if OUTCOME == 'driver-exit' and signum == signal.SIGSTOP:
        os.kill(DRIVER,signal.SIGKILL)
        deadline=time.monotonic()+1
        while native_guard.process_path(token) is not None and time.monotonic()<deadline: time.sleep(.01)
    if OUTCOME in ('late-term','late-int') and signum == signal.SIGCONT:
        os.kill(os.getpid(),signal.SIGTERM if OUTCOME == 'late-term' else signal.SIGINT)
    sent=send(token,signum)
    if signum == signal.SIGCONT:
        deadline=time.monotonic()+1
        while not (root/'resumed').exists() and time.monotonic()<deadline: time.sleep(.01)
    return sent
def process_token(pid):
    if OUTCOME == 'reused-driver' and pid == DRIVER and checked_driver: return identify(UNRELATED)
    return identify(pid)
def cleanup(tokens):
    if OUTCOME == 'survivor': raise TimeoutError('synthetic survivor')
    if OUTCOME == 'cancel': os.kill(os.getpid(),signal.SIGTERM)
    stop(tokens)
def run_once(command,**kwargs):
    (root/'build-called').touch()
    if OUTCOME == 'export':
        bundle=pathlib.Path(command[command.index('-resultBundlePath')+1])
        bundle.mkdir()
        (bundle/'Info.plist').touch()
    return 124 if OUTCOME == 'timeout' else 0
def build(command,**kwargs):
    if OUTCOME == 'export' and command[0] == 'xcrun': raise subprocess.CalledProcessError(1,command)
def check_output(command,**kwargs):
    global checks,checked_driver
    if command == ['ps','-axo','pid=,comm=']:
        checks+=1
        binary=native_guard.process_path(identify(OWNED))
        baseline='' if OUTCOME == 'reused-app' else str(UNRELATED)+' '+binary+'\\n'
        return baseline+str(APP if checks == 1 else OWNED)+' '+binary+'\\n'
    if command[:2] == ['ps','-p']:
        checked_driver=True
        return str(entry.with_name('drive.py'))+' '+str(root/'scratch')
    return original(command,**kwargs)
with patch.object(native_guard,'require_consent'), patch.object(native_guard,'run_once',side_effect=run_once), patch.object(native_guard,'stop_native_processes',side_effect=cleanup), patch.object(native_guard,'signal_process',side_effect=signal_process), patch.object(native_guard,'process_token',side_effect=process_token), patch.object(subprocess,'check_output',side_effect=check_output), patch.object(subprocess,'run',side_effect=build):
    sys.argv=[str(entry),'unit',str(DRIVER)]
    try:
        runpy.run_path(str(entry),run_name='__main__')
    finally:
        (root/'handlers-restored').write_text(str(all(signal.getsignal(name)==handler for name,handler in previous.items())))
'''.replace('OWNED', str(owned.pid)).replace('DRIVER', str(paused.pid)).replace('UNRELATED', str(unrelated.pid)).replace('OUTCOME', repr(outcome)).replace('APP', str(original_app.pid))
                result = subprocess.run([sys.executable, '-c', script], cwd=root,
                                        env={**os.environ, 'PYTHONPATH': str(Path(__file__).parent)},
                                        capture_output=True, text=True, timeout=8)
                rejected = outcome in ('reused-app', 'reused-driver', 'driver-exit')
                self.assertEqual(result.returncode, 130 if outcome in ('cancel', 'late-term', 'late-int') else 1 if outcome in ('survivor', 'export', 'timeout') or rejected else 0, result.stderr)
                if rejected:
                    self.assertIsNone(owned.poll())
                    self.assertIsNone(original_app.poll())
                    self.assertIsNone(unrelated.poll())
                    self.assertEqual((root / 'handlers-restored').read_text(), 'True')
                    self.assertFalse((root / 'resumed').exists())
                    self.assertFalse((root / 'build-called').exists())
                    self.assertFalse((evidence / 'finish-proof').exists())
                    return
                if outcome == 'survivor':
                    self.assertIsNone(owned.poll())
                else:
                    self.assert_stopped(owned.pid)
                self.assertEqual((root / 'handlers-restored').read_text(), 'True')
                deadline = time.monotonic() + 1
                while not (root / 'resumed').exists() and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertTrue((root / 'resumed').exists())
                self.assertEqual(json.loads((root / 'resumed').read_text()), {'finish': outcome == 'success', 'abort': outcome != 'success'})
                self.assertIsNone(unrelated.poll())
                self.assertEqual((evidence / 'finish-proof').exists(), outcome == 'success')
                self.assertEqual((evidence / 'abort-proof').exists(), outcome != 'success')
            finally:
                if paused.poll() is None:
                    os.kill(paused.pid, signal.SIGCONT)
                for process in (owned, unrelated, paused, original_app):
                    if process.poll() is None:
                        process.kill()
                    process.wait(timeout=2)

    def test_failed_export_cannot_finish_an_existing_core_proof(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'ui-proof.json').write_text('{"passed":true}')
            finish_focused(root, completed=False)
            self.assertTrue((root / 'abort-proof').exists())
            self.assertFalse((root / 'finish-proof').exists())
            (root / 'abort-proof').unlink()
            finish_focused(root, completed=True)
            self.assertTrue((root / 'finish-proof').exists())
            self.assertFalse((root / 'abort-proof').exists())

    def test_default_denial_starts_no_helpers_and_creates_no_evidence_or_scratch(self):
        root = Path(__file__).resolve().parents[4]
        with tempfile.TemporaryDirectory(prefix='todo-native-guard-test-') as directory:
            fixture = Path(directory)
            commands = fixture / 'bin'
            commands.mkdir()
            calls = fixture / 'called'
            for name in ('dirname', 'mkdir', 'mktemp', 'pnpm', 'bun', 'python3', 'xcodebuild', 'security'):
                stub = commands / name
                stub.write_text('#!/bin/sh\nprintf called >> "$GUARD_TRIPWIRE"\nexit 99\n')
                stub.chmod(0o755)
            env = {**os.environ, 'PATH': str(commands), 'GUARD_TRIPWIRE': str(calls),
                   'TODO_VERIFY_NATIVE_UI': '0', 'PYTHONDONTWRITEBYTECODE': '1', 'TMPDIR': str(fixture)}
            entries = [
                root / '.agents/skills/verify-macos/scripts/verify.sh',
                root / '.agents/skills/verify-electron/scripts/verify.sh',
                *[root / '.agents/skills/verify-macos/scripts' / name for name in ('drive.py', 'run-ui-tests.py', 'actions.py')],
            ]
            for index, entry in enumerate(entries):
                evidence = fixture / ('evidence-' + str(index))
                command = [sys.executable, str(entry)] if entry.suffix == '.py' else [str(entry)]
                result = subprocess.run([*command, str(evidence)], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 78, str(entry) + result.stderr)
                self.assertIn('current user consent', result.stderr)
                self.assertFalse(evidence.exists())
                self.assertFalse(calls.exists())
            self.assertEqual(sorted(p.name for p in fixture.iterdir()), ['bin'])

    def test_existing_keychain_failure_does_not_start_a_process(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            failure = root / 'keychain-failure.json'
            failure.write_text('{"status":-25308}')
            with (root / 'log').open('w') as log:
                code = run_once(['/does/not/exist'], cwd=root, log=log, failure_path=failure)
            self.assertEqual(code, 78)

    def test_keychain_cancellation_stops_one_owned_process_without_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            failure = root / 'keychain-failure.json'
            pid_file = root / 'pid'
            script = 'import os,pathlib,time;pathlib.Path("pid").write_text(str(os.getpid()));pathlib.Path("keychain-failure.json").write_text("{\\"status\\":-128}");time.sleep(30)'
            with (root / 'log').open('w') as log:
                code = run_once([sys.executable, '-c', script], cwd=root, log=log, failure_path=failure, timeout=5)
            self.assertEqual(code, 78)
            with self.assertRaises(ProcessLookupError):
                os.kill(int(pid_file.read_text()), 0)
            self.assertEqual(json.loads(failure.read_text()), {'status': -128})


if __name__ == '__main__':
    unittest.main()
