#!/usr/bin/env python3
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
import uuid
import urllib.request
from native_guard import require_consent, keychain_environment, install_cancellation_handler, cleanup_scope, stop_process, cancellation_requested

require_consent()
install_cancellation_handler()

root, scratch, evidence = map(Path, sys.argv[1:])
home = scratch / 'home'
home.mkdir()
service = 'local.todo.verify.' + str(uuid.uuid4())
env = {**os.environ, 'HOME': str(home), 'TODO_DB': str(scratch / 'scratch.db'), 'TODO_PORT': '0'}
server = None
app = None
result = {'passed': False, 'deferred': ['S05 Move to Profile, Revert and Series']}
try:
    with (evidence / 'server.log').open('w') as log:
        server = subprocess.Popen([str(scratch / 'server')], env=env, stdout=log, stderr=log)
        base = None
        for _ in range(200):
            match = re.search(r'http://127\.0\.0\.1:\d+', (evidence / 'server.log').read_text())
            if match:
                base = match.group()
                break
            assert server.poll() is None, 'Server exited before ready'
            time.sleep(.05)
        assert base, 'No loopback listener'
        with urllib.request.urlopen(base + '/health', timeout=5) as response:
            assert json.load(response) == {'service': 'todo-server'}
        listeners = subprocess.check_output(['lsof', '-nP', '-a', '-p', str(server.pid), '-iTCP', '-sTCP:LISTEN'], text=True)
        assert '127.0.0.1:' in listeners and '*:' not in listeners
        (evidence / 'listener.txt').write_text(listeners)
        login = subprocess.run([str(scratch / 'todo'), '--db', str(scratch / 'scratch.db'), '--profile', 'work', 'login', '--password-stdin'], input='scratch verification passphrase\n', env=env, text=True, capture_output=True, timeout=10)
        assert login.returncode == 0, login.stderr
        (evidence / 'restarted-server.log').touch()
        config = {'serverPid': str(server.pid), 'serverBinary': str(scratch / 'server'), 'port': base.rsplit(':', 1)[1], 'restartLog': str(evidence / 'restarted-server.log'), 'server': base, 'keychainService': service, 'cli': str(scratch / 'todo'), 'db': str(scratch / 'scratch.db'), 'home': str(home), 'evidence': str(evidence)}
        (root / 'apps/macos/DerivedData/verification.json').write_text(json.dumps(config))
        app_bundle = root / 'dist/signed.noindex/macos/Todo.app'
        subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app_bundle)], check=True)
        result['nativeTests'] = 'Deferred. Native sessions drive the user-built signed Release app without rebuilding or signing.'
        app_path = app_bundle / 'Contents/MacOS/Todo'
        with (evidence / 'app.log').open('w') as app_log:
            app = subprocess.Popen([str(app_path), '--server', base, '--profile', 'work', '--keychain-service', service], env=keychain_environment(root), stdout=app_log, stderr=app_log)
            config['appPid'] = str(app.pid)
            (root / 'apps/macos/DerivedData/verification.json').write_text(json.dumps(config))
            print('READY FOR NATIVE UI DRIVE: ' + str(evidence), flush=True)
            try:
                deadline = time.monotonic() + 7200
                while not (evidence / 'finish-proof').exists():
                    assert not (root / 'apps/macos/DerivedData/keychain-failure.json').exists(), 'Keychain interaction unavailable or cancelled; native verification stopped'
                    assert not (evidence / 'abort-proof').exists(), 'Native verification cancelled; no automatic relaunch'
                    for action in ('relaunch-app', 'relaunch-dark', 'relaunch-light', 'stop-server', 'restart-server'):
                        marker = evidence / action
                        if not marker.exists():
                            continue
                        marker.unlink()
                        if action in ('relaunch-app', 'relaunch-dark', 'relaunch-light'):
                            app.terminate()
                            app.wait(timeout=10)
                            appearance = ['-AppleInterfaceStyle', action.split('-')[1].capitalize()] if action in ('relaunch-dark', 'relaunch-light') else []
                            app = subprocess.Popen([str(app_path), '--server', base, '--profile', 'work', '--keychain-service', service, *appearance], env=keychain_environment(root), stdout=app_log, stderr=app_log)
                            config['appPid'] = str(app.pid)
                        elif action == 'stop-server':
                            server.kill()
                            server.wait(timeout=10)
                            result['serverDropExit'] = server.returncode
                        else:
                            assert server.poll() is not None, 'Stop the owned server before restarting'
                            restart_env = {**env, 'TODO_PORT': config['port']}
                            server = subprocess.Popen([str(scratch / 'server')], env=restart_env, stdout=log, stderr=log)
                            config['serverPid'] = str(server.pid)
                        (root / 'apps/macos/DerivedData/verification.json').write_text(json.dumps(config))
                        (evidence / (action + '.done')).write_text('done')
                    assert app.poll() is None, 'Compiled app exited during drive'
                    assert time.monotonic() < deadline, 'Native UI drive timed out'
                    time.sleep(.5)
                proof = json.loads((evidence / 'ui-proof.json').read_text())
                assert proof['passed'] is True
                for name in ('01-sign-in', '02-quick-add-glass', '03-editor', '05-conflict-unselected', '06-live-cli-write', '07-keychain-restored', '08-resumed-delivery', '10-domain-inbox', '11-domain-today', '12-profile-isolation', '13-overdue', '14-scheduled', '15-menu-bar-quick-add'):
                    assert (evidence / (name + '.png')).stat().st_size > 1000, 'Missing native screenshot: ' + name
                    assert (evidence / (name + '.txt')).stat().st_size > 10, 'Missing accessibility capture: ' + name
                result['uiProof'] = proof
            finally:
                with cleanup_scope():
                    stop_process(app)
        with sqlite3.connect(scratch / 'scratch.db') as db:
            result['tasks'] = db.execute('select title,status,row_version from tasks order by created_at').fetchall()
            result['operations'] = db.execute('select seq,outcome,event from op_log order by seq').fetchall()
            (evidence / 'database.sql').write_text('\n'.join(db.iterdump()))
            assert db.execute("select title,status,row_version from tasks where title='Your conflict resolution'").fetchall() == [('Your conflict resolution', 'open', 7)]
            assert db.execute("select title,status,row_version from tasks where title in ('CLI live write','CLI while disconnected') order by title").fetchall() == [('CLI live write', 'open', 1), ('CLI while disconnected', 'open', 1)]
            assert db.execute("select count(*) from op_log where outcome='rejected'").fetchone()[0] >= 1
            assert db.execute("select priority,due_at from tasks where title='Menu bar task'").fetchall() == [('P1', None)]
            fired = db.execute("select seq from op_log where outcome='committed' and json_extract(event,'$.kind')='ReminderFired'").fetchall()
            assert len(fired) == 1, fired
            reminder = json.loads((evidence / 'native-reminder.json').read_text())
            if reminder['status'] == 'delivered':
                assert reminder['committedSeq'] == fired[0][0]
                assert 'Reminder sequence ' + str(fired[0][0]) + ': Your conflict resolution' == reminder['deliveredReceipt']
            else:
                assert reminder['status'] == 'blocked' and reminder['reason']
            result['nativeReminder'] = reminder
            recovery = json.loads((evidence / 'sse-recovery.json').read_text())
            offline = db.execute("select seq from op_log where outcome='committed' and json_extract(event,'$.kind')='TaskCreated' and json_extract(event,'$.task.title')='CLI while disconnected'").fetchone()[0]
            assert recovery['readOnlyObserved'] is True and recovery['reconnects'] > 0
            assert recovery['resumeCursor'] < offline <= recovery['liveSequence']
            assert recovery['resumeCursor'] < fired[0][0] <= recovery['liveSequence']
            result['sseRecovery'] = recovery
        result['passed'] = True
finally:
    with cleanup_scope():
        stop_process(app)
        stop_process(server)
        result['keychainCleanup'] = {'status': 'manual', 'service': service, 'account': locals().get('base', ''), 'reason': 'No automatic Keychain cleanup or UI after a run'}
        if (scratch / 'scratch.db').exists() and not (evidence / 'database.sql').exists():
            with sqlite3.connect(scratch / 'scratch.db') as db:
                (evidence / 'database.sql').write_text('\n'.join(db.iterdump()))
        if cancellation_requested():
            result['passed'] = False
            result['cancelled'] = True
        (evidence / 'result.json').write_text(json.dumps(result, indent=2))
