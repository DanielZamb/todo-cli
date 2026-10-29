#!/usr/bin/env python3
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import signal
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request

root = Path(__file__).resolve().parents[3]
evidence = Path(sys.argv[1])
snapshots_only = '--snapshots-only' in sys.argv[2:]
shared_receipt = os.environ.get('TODO_F13_SERVER_RECEIPT')
shared = json.loads(Path(shared_receipt).read_text()) if shared_receipt and snapshots_only else None
if not evidence.is_absolute() or evidence.exists():
    raise SystemExit('Pass a fresh absolute evidence directory')
subprocess.run([str(root / 'scripts/disk-guard.sh')], check=True)
evidence.mkdir(parents=True)
sys.path.insert(0, str(root / '.agents/skills/verify-macos-lifecycle/scripts'))
from owned_process import OwnedCommands

unsafe = evidence / 'command-unsafe'
owned = OwnedCommands(unsafe)

def cancelled(signum, frame):
    raise SystemExit(128 + signum)

signal.signal(signal.SIGTERM, cancelled)
signal.signal(signal.SIGINT, cancelled)

@contextmanager
def deferring_cancellation():
    pending = []
    previous = {sig: signal.signal(sig, lambda signum, frame: pending.append(signum)) for sig in (signal.SIGTERM, signal.SIGINT)}
    try:
        yield
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)
    if pending:
        raise SystemExit(128 + pending[0])

@contextmanager
def scratch_directory():
    directory = Path(tempfile.mkdtemp(prefix='todo-s01-verify-'))
    try:
        yield directory
    finally:
        with deferring_cancellation():
            if not unsafe.exists():
                shutil.rmtree(directory)

def stop(process):
    with deferring_cancellation():
        previous_failure = unsafe.exists()
        unsafe.touch()
        owned.stop(process)
        if not previous_failure:
            unsafe.unlink()

actions = []
server = None
with scratch_directory() as temporary:
    scratch = Path(temporary)
    home = scratch / 'home'
    home.mkdir()
    env = {key: value for key, value in os.environ.items() if not key.startswith('TODO_')}
    env.update(HOME=shared['home'] if shared else str(home))

    def run(command, name, environment=env, timeout=600):
        with (evidence / name).open('w') as log:
            working = scratch if command[:2] == ['bun', 'build'] else root
            process = None
            try:
                with deferring_cancellation():
                    process = subprocess.Popen(command, cwd=working, env=environment, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                code = process.wait(timeout=timeout)
            finally:
                if process is not None:
                    stop(process)
        actions.append(dict(command=[str(value) for value in command], exit=code))
        (evidence / 'commands.json').write_text(json.dumps(actions, indent=2) + '\n')
        if code:
            raise RuntimeError(f'{name} failed with exit {code}')

    try:
        if shared:
            url = shared['url']
        else:
            for override, name, source in [('TODO_SERVER_BINARY', 'server', 'apps/server/src/main.ts'), ('TODO_SEED_BINARY', 'seed', 'apps/server/scripts/seed-verification.ts')]:
                if binary := (os.environ.get(override) or (os.environ.get('TODO_PROVISIONER_BINARY') if name == 'seed' else None)):
                    target = Path(binary)
                    if not target.is_absolute() or not target.is_file():
                        raise RuntimeError(f'{override} must name an absolute compiled binary')
                    (scratch / name).symlink_to(target)
                    actions.append({'reuse_binary': str(target), 'target': name, 'exit': 0})
                    (evidence / 'commands.json').write_text(json.dumps(actions, indent=2) + '\n')
                else:
                    run(['bun', 'build', '--compile', str(root / source), '--outfile', str(scratch / name)], f'compile-{name}.log')
            run([str(scratch / 'seed'), str(scratch), 'diagnostics'], 'seed.log')
            if os.environ.get('TODO_CLI_BINARY'):
                shutil.copy2(os.environ['TODO_CLI_BINARY'], scratch / 'todo')
            else:
                run(['bun', 'build', '--compile', str(root / 'apps/cli/src/main.ts'), '--outfile', str(scratch / 'todo')], 'compile-cli.log')
            if not snapshots_only:
                run([str(scratch / 'todo'), '--profile', 'zzz-c11-import', '--format', 'json', 'init'], 'import-profile.log', dict(env, TODO_DB=str(scratch / 'scratch.db')))
            server_env = dict(env, TODO_DB=str(scratch / 'scratch.db'), TODO_PORT='0')
            with (evidence / 'server.log').open('w') as log:
                with deferring_cancellation():
                    server = subprocess.Popen([str(scratch / 'server')], cwd=root, env=server_env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            deadline = time.monotonic() + 60
            url = None
            while time.monotonic() < deadline:
                if server.poll() is not None:
                    raise RuntimeError('Scratch server exited before readiness')
                match = re.search(r'Listening on (http://127\.0\.0\.1:\d+)', (evidence / 'server.log').read_text())
                if match:
                    url = match[1]
                    break
                time.sleep(0.1)
            if not url:
                raise RuntimeError('Scratch server readiness timed out')
        with urllib.request.urlopen(url + '/health', timeout=3) as response:
            assert json.load(response) == {'service': 'todo-server'}
        test_env = dict(env, TODO_DB=str(scratch / "scratch.db"), TODO_F10_CLI=str(scratch / "todo"), TODO_W06_SERVER=url, TODO_W06_RECEIPT=str(evidence / 'http-receipt.json'), TODO_W06_PROVISIONER=str(scratch / 'seed'), TODO_W06_SCRATCH=str(scratch))
        if snapshots_only:
            test_env['TODO_F13_SNAPSHOTS'] = '1'
        build_path = Path(os.environ.get('TODO_SWIFT_BUILD_PATH', str(root / 'apps/macos/DerivedData/StateProof'))).resolve()
        if not build_path.is_relative_to(root / 'apps/macos'):
            raise RuntimeError('TODO_SWIFT_BUILD_PATH must stay under apps/macos')
        run(['swift', 'test', '--jobs', '2', '--package-path', 'apps/macos', '--scratch-path', str(build_path), '--disable-automatic-resolution'] + (['--filter', 'snapshotListCreateConfirmationRestoreAndReloadAgainstScratchServer|generatedSnapshotRestoreCodingKeepsLiteralReportAndDryRun|snapshotHumanReasonsAndTaskPluralization|snapshotReloadResetsAndScopesReminderReceipts|snapshotHistoryIncludesEveryEventKindWithoutAnyOfRecursion'] if snapshots_only else []), 'state-tests.log', test_env)
        if not snapshots_only:
            diagnostics_env = dict(env, TODO_DB=str(scratch / 'scratch.db'), TODO_F10_CLI=str(scratch / 'todo'), TODO_DIAGNOSTICS_SERVER=url, TODO_DIAGNOSTICS_SNAPSHOT=str(evidence / 'diagnostics-live.json'))
            run(['swift', 'test', '--jobs', '2', '--package-path', 'apps/macos', '--scratch-path', str(build_path), '--skip-build', '--filter', 'DiagnosticsStateTests'], 'diagnostics-state-tests.log', diagnostics_env)
            run(['swift', 'test', '--jobs', '2', '--package-path', 'apps/macos', '--scratch-path', str(build_path), '--skip-build', '--filter', 'GeneratedContractTests/testDiagnosticsReadPreservesNullableMetadata|GeneratedContractTests/testGeneratedStreamSendsResumeHeader'], 'diagnostics-contract-tests.log')
        database_path = Path(shared['database']) if shared else scratch / 'scratch.db'
        if snapshots_only:
            receipt = json.loads((evidence / 'snapshots-http.json').read_text())
            assert receipt == {'initialTasks': 0, 'afterCreate': 1, 'afterRestore': 0, 'reloads': 1, 'afterReloadWrite': 1}, receipt
            with sqlite3.connect(f'file:{database_path}?mode=ro', uri=True) as database:
                assert database.execute('select title from tasks').fetchall() == [('F13 Swift after reload',)]
            (evidence / 'http-receipt.json').write_text(json.dumps(receipt) + '\n')
        else:
            with sqlite3.connect(f'file:{database_path}?mode=ro', uri=True) as database:
                tasks = database.execute('select title, profile_id, row_version, status from tasks order by title, row_version').fetchall()
                history = database.execute('select outcome, reason from op_log order by seq').fetchall()
                compact = json.loads((evidence / 'u02-formatting-http.json').read_text())
                assert compact == {'version': 2, 'due': 'Today 9:00\u202fAM', 'scheduled': 'Tomorrow', 'count': '1 task'}, compact
                assert database.execute('select row_version, status from tasks where title = ?', ('U02 Compact formatting',)).fetchall() == [(2, 'open')]
                action_error = json.loads((evidence / 'u02-action-error-http.json').read_text())
                assert action_error == {'version': 2, 'status': 'cancelled', 'notice': 'The Task changed. Close and reopen it before trying that action again.', 'loadError': '', 'loaded': True}, action_error
                assert database.execute('select row_version, status from tasks where title = ?', ('U02 action error',)).fetchall() == [(2, 'cancelled')]
                profiles = json.loads((evidence / 'profile-deletion-http.json').read_text())
                assert database.execute('select title, row_version, deleted_at is not null from tasks where id=?', (profiles['deletedTask'],)).fetchone() == ('F10 recover from Snapshot', 2, 1)
                assert database.execute('select count(*) from profile_deletions where profile in (?,?,?)', profiles['deletedProfiles']).fetchone() == (3,)
                manifests = [json.loads(path.read_text()) for path in (scratch / 'snapshots').glob('*.json')]
                manifest = next(value for value in manifests if value['reason'] == 'before Profile delete f10-tasks')
                with sqlite3.connect(f"file:{manifest['path']}?mode=ro", uri=True) as recovery:
                    assert recovery.execute('select title, row_version, deleted_at from tasks where id=?', (profiles['deletedTask'],)).fetchone() == ('F10 recover from Snapshot', 1, None)
                navigation = json.loads((evidence / 'navigation-http.json').read_text())
                navigation_state = {key: database.execute('select title, profile_id, row_version, deleted_at is not null from tasks where id = ?', (task,)).fetchone() for key, task in navigation.items()}
                assert navigation_state == {
                    'movedTask': ('W07 saved before Move', 'personal', 4, 0),
                    'openDeletedTask': ('W07 destination task', 'work', 2, 1),
                    'otherDeletedTask': ('W07 other deleted', 'work', 2, 1)
                }, navigation_state
                transfers = json.loads((evidence / 'c10-transfer-http.json').read_text())
                transfer_state = {key: database.execute('select title, profile_id, row_version, status from tasks where id = ?', (task,)).fetchone() for key, task in transfers.items()}
                assert transfer_state == {'moved': ('C10 Swift copy', 'personal', 3, 'done'), 'copied': ('C10 Swift copy', 'personal', 1, 'done'), 'other': ('C10 unrelated Swift Task', 'work', 1, 'open')}, transfer_state
                (evidence / 'c10-transfer-durable.json').write_text(json.dumps(transfer_state, indent=2) + '\n')
                (evidence / 'navigation-durable.json').write_text(json.dumps(navigation_state, indent=2) + '\n')
                metadata = json.loads((evidence / 'metadata-http.json').read_text())
                metadata_state = []
                for case in metadata['matrix']:
                    if case['path'] != 'add-and-edit controls' or case['task'] == metadata['editedTask']:
                        continue
                    state = database.execute('select projects.name, tasks.row_version from tasks left join projects on projects.id = tasks.project_id where tasks.id = ?', (case['task'],)).fetchone()
                    tags = [row[0] for row in database.execute('select tags.name from tags join task_tags on tags.id = task_tags.tag_id where task_tags.task_id = ? order by tags.name', (case['task'],))]
                    assert state == (case['project'], case['version']), (case, state)
                    assert tags == case['tags'], (case, tags)
                    metadata_state.append(dict(task=case['task'], project=state[0], version=state[1], tags=tags))
                edited = database.execute('select projects.name, tasks.row_version, tasks.title from tasks left join projects on projects.id = tasks.project_id where tasks.id = ?', (metadata['editedTask'],)).fetchone()
                assert edited == ('Window Project', 4, 'Literal title @literal #821'), edited
                (evidence / 'metadata-durable.json').write_text(json.dumps(dict(matrix=metadata_state, edited=edited), indent=2) + '\n')
            assert ('F12 Swift edited', 'work', 3, 'open') in tasks, tasks
            assert (evidence / 'import-http.json').is_file()
            assert ('W06 original', 'personal', 2, 'open') in tasks, tasks
            assert ('W06 weekly', 'work', 4, 'open') in tasks, tasks
            assert any(outcome == 'rejected' and reason == 'conflict' for outcome, reason in history), history
            (evidence / 'durable-state.json').write_text(json.dumps(dict(tasks=tasks, history=history), indent=2) + '\n')
    finally:
        if server is not None:
            stop(server)
            (evidence / 'cleanup.json').write_text(json.dumps(dict(serverStopped=server.poll() is not None, scratchRemoved=True)) + '\n')
assert not scratch.exists()
assert (evidence / 'http-receipt.json').is_file()
(evidence / 'result.json').write_text(json.dumps(dict(status='PASS', nativeAppLaunched=False, keychainAccessed=False, scratchRemoved=True)) + '\n')
print('PASS; headless Swift state and compiled scratch HTTP; evidence survived cleanup')
