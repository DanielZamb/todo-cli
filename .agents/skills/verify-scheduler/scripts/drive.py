#!/usr/bin/env python3
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.request

scratch, evidence = map(lambda p: Path(p).resolve(), sys.argv[1:3])
assert scratch.name.startswith('todo-s03-verify-') and scratch != evidence
binary, fixture = str(scratch / 'todo-server'), str(scratch / 'fixture')
home = scratch / 'home'
home.mkdir()
label = f'com.todo-cli.server.verify-{os.getpid()}'
env = {**os.environ, 'HOME': str(home), 'TODO_SERVICE_LABEL': label, 'TODO_DB': str(scratch / 'scratch.db'), 'TODO_PORT': '0'}
actions, servers, logs, streams = [], [], [], []
launchd_attempted = False
marker = scratch / 'launchd-active'


def save(name, value):
    (evidence / name).write_text(json.dumps(value, indent=2) + '\n')


def sql(query, parameters=()):
    with sqlite3.connect(f'file:{scratch}/scratch.db?mode=ro', uri=True) as db:
        return db.execute(query, parameters).fetchall()


def reminders():
    return [(row[0], json.loads(row[1])) for row in sql("SELECT seq,event FROM op_log WHERE outcome='committed' AND json_extract(event,'$.kind')='ReminderFired' ORDER BY seq")]


def wait_for(check, seconds=12):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if value := check():
            return value
        time.sleep(.05)
    raise AssertionError('Timed out waiting for expected observable state')


def request(base, method, path, body=None, credential=None):
    headers = {'Content-Type': 'application/json'}
    if credential:
        headers['Authorization'] = f'Bearer {credential}'
    req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=5) as response:
        result = json.load(response)
        public = {key: value for key, value in result.items() if key != 'credential'} if isinstance(result, dict) else result
        actions.append({'action': 'HTTP', 'method': method, 'path': path, 'request': '[redacted]' if path == '/auth/sessions' else body, 'status': response.status, 'response': public})
        return result


def frames(path):
    result = []
    for block in path.read_text().split('\n\n')[:-1]:
        fields = dict(line.split(': ', 1) for line in block.splitlines() if ': ' in line)
        if 'data' in fields:
            fields['data'] = json.loads(fields['data'])
            result.append(fields)
    return result


def connect(base, credential, name, cursor=None):
    path = evidence / f'{name}.sse'
    output = path.open('w')
    errors = (evidence / f'{name}.stderr').open('w')
    logs.extend([output, errors])
    command = ['curl', '--silent', '--show-error', '--no-buffer', '-H', 'Authorization: Bearer ' + credential, base + '/profiles/work/events']
    if cursor is not None:
        command.extend(['-H', 'Last-Event-ID: ' + str(cursor)])
    process = subprocess.Popen(command, stdout=output, stderr=errors)
    streams.append(process)
    actions.append({'action': 'authenticated SSE connect', 'pid': process.pid, 'name': name, 'lastEventId': cursor})
    wait_for(lambda: any(frame['event'] == 'ready' for frame in frames(path)))
    return process, path


def streamed_reminders(path):
    return [frame['data'] for frame in frames(path) if frame['event'] == 'operation' and frame['data']['event']['kind'] == 'ReminderFired']


def start(name):
    path = evidence / f'{name}.log'
    log = path.open('w')
    logs.append(log)
    process = subprocess.Popen([binary], env=env, stdout=log, stderr=subprocess.STDOUT)
    servers.append(process)
    actions.append({'action': 'start compiled server', 'name': name, 'pid': process.pid, 'database': env['TODO_DB'], 'home': str(home)})
    def ready():
        assert process.poll() is None, path.read_text()
        matches = re.findall(r'Listening on http://127\.0\.0\.1:(\d+)', path.read_text())
        return f'http://127.0.0.1:{matches[-1]}' if matches else None
    base = wait_for(ready)
    assert request(base, 'GET', '/health') == {'service': 'todo-server'}
    return process, base


def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    actions.append({'action': 'stop own server', 'pid': process.pid, 'exit': process.returncode})


def lifecycle(command):
    result = subprocess.run([binary, command], env=env, capture_output=True, text=True, timeout=20)
    actions.append({'action': command, 'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
    assert result.returncode == 0, actions[-1]
    return json.loads(result.stdout)


try:
    subprocess.run([fixture, str(scratch), 'seed'], check=True)
    metadata = json.loads((scratch / 'fixture.json').read_text())
    save('fixture.json', metadata)
    first, first_base = start('before-restart')
    session = request(first_base, 'POST', '/auth/sessions', {'passphrase': 'scratch scheduler passphrase'})['credential']
    initial, initial_path = connect(first_base, session, 'initial')
    wait_for(lambda: len([frame for frame in frames(initial_path) if frame['event'] == 'operation']) == 6)
    cursor = max(int(frame['id']) for frame in frames(initial_path) if frame['event'] == 'operation')
    assert not reminders()
    stop(initial)
    stop(first)
    deadline = datetime.datetime.fromisoformat(metadata['due'].replace('Z', '+00:00')).timestamp()
    assert time.time() < deadline, 'Initial process must stop mid-wait'
    actions.append({'action': 'restart mid-wait', 'due': metadata['due'], 'stoppedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'receipts': reminders()})
    while time.time() <= deadline + .1:
        time.sleep(.05)
    second, base = start('competitor-a')
    third, _ = start('competitor-b')
    wait_for(lambda: len(reminders()) == 2)
    assert [(event['task_id'], event['due_at']) for _, event in reminders()] == [('remind', metadata['due']), ('wake', metadata['due'])]
    assert sql("SELECT status,row_version FROM tasks WHERE id='wake'") == [('open', 2)]
    save('restart-and-competition.json', {'receipts': reminders(), 'wake': sql("SELECT status,row_version FROM tasks WHERE id='wake'"), 'pids': [second.pid, third.pid]})
    resumed, resumed_path = connect(base, session, 'resumed', cursor)
    wait_for(lambda: len(streamed_reminders(resumed_path)) == 2)
    expires = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=2)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    token = request(base, 'POST', '/auth/tokens', {'name': 'short-lived', 'profile': 'work', 'scope': 'read-only', 'expires_at': expires}, session)
    assert sql('SELECT count(*) FROM credentials WHERE id=?', (token['id'],)) == [(1,)]
    wait_for(lambda: sql('SELECT count(*) FROM credentials WHERE id=?', (token['id'],)) == [(0,)])
    assert sql("SELECT count(*) FROM op_log WHERE json_extract(event,'$.action')='cleanupExpired' AND outcome='committed'") == [(1,)]
    assert request(base, 'GET', '/auth/tokens', credential=session) == []
    save('credential-cleanup.json', {'expiredTokenId': token['id'], 'rowsAfter': sql('SELECT count(*) FROM credentials WHERE id=?', (token['id'],)), 'remainingSessions': sql("SELECT count(*) FROM credentials WHERE kind='session'")})
    changed = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=2)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    request(base, 'PATCH', '/profiles/work/tasks/remind', {'from_version': 1, 'changes': {'due_at': {'kind': 'instant', 'utc': changed, 'time_zone': 'UTC'}}}, session)
    assert second.poll() is None and third.poll() is None
    assert len(reminders()) == 2
    wait_for(lambda: len(reminders()) == 3)
    request(base, 'PATCH', '/profiles/work/tasks/remind', {'from_version': 2, 'changes': {'title': 'Receipt survives title edits'}}, session)
    time.sleep(1.2)
    assert len(reminders()) == 3
    assert sql("SELECT status,row_version FROM tasks WHERE id='date-snooze'") == [('snoozed', 1)]
    save('changed-due.json', {'receipts': reminders(), 'dateSnooze': sql("SELECT status,row_version FROM tasks WHERE id='date-snooze'")})
    wait_for(lambda: len(streamed_reminders(resumed_path)) == 3)
    received = streamed_reminders(resumed_path)
    expected = reminders()
    assert [entry['seq'] for entry in received] == [seq for seq, _ in expected]
    assert [entry['event'] for entry in received] == [event for _, event in expected]
    assert len({entry['seq'] for entry in received}) == 3
    assert all(entry['event']['task_id'] not in ['date', 'date-snooze', 'done', 'deleted'] for entry in received)
    decoded = subprocess.run([fixture, str(scratch), 'decode-sse', str(resumed_path)], check=True, capture_output=True, text=True)
    decoded_contract = json.loads(decoded.stdout)
    assert [entry['seq'] for entry in decoded_contract['reminders']] == [seq for seq, _ in expected]
    save('shared-contract.json', decoded_contract)
    with urllib.request.urlopen(base + '/openapi.json', timeout=5) as response:
        published = json.load(response)
    source = json.loads((Path(__file__).resolve().parents[4] / 'packages/api/openapi.json').read_text())
    assert published == source
    assert 'ReminderFired' in json.dumps(published) and 'cleanupExpired' in json.dumps(published)
    save('openapi.json', published)
    save('authenticated-sse.json', {'cursorBeforeRestart': cursor, 'received': received, 'durableReceipts': expected, 'duplicates': 0, 'dateOnlyReminders': 0})
    stop(resumed)
    stop(second)
    stop(third)
    replay = subprocess.run([fixture, str(scratch), 'replay'], check=True, capture_output=True, text=True)
    save('replay.json', json.loads(replay.stdout))
    assert lifecycle('status')['loaded'] is False
    marker.touch()
    launchd_attempted = True
    installed = lifecycle('install')
    assert installed['installed'] and installed['loaded']
    shutil.copyfile(installed['path'], evidence / 'agent.plist')
    stdout = home / 'Library' / 'Logs' / label / 'stdout.log'
    def agent_ready():
        matches = re.findall(r'Listening on http://127\.0\.0\.1:(\d+)', stdout.read_text() if stdout.exists() else '')
        if not matches:
            return None
        try:
            return request(f'http://127.0.0.1:{matches[-1]}', 'GET', '/health') == {'service': 'todo-server'}
        except OSError:
            return None
    wait_for(agent_ready)
    assert lifecycle('install')['loaded']
    wait_for(agent_ready)
    assert lifecycle('status')['installed']
    removed = lifecycle('uninstall')
    assert not removed['installed'] and not removed['loaded']
    assert lifecycle('uninstall')['loaded'] is False
    marker.unlink()
    launchd_attempted = False
    shutil.copyfile(stdout, evidence / 'launchd-stdout.log')
    stderr = stdout.with_name('stderr.log')
    if stderr.exists():
        shutil.copyfile(stderr, evidence / 'launchd-stderr.log')
    assert len(reminders()) == 3
    with sqlite3.connect(scratch / 'scratch.db') as db:
        (evidence / 'database.sql').write_text('\n'.join(db.iterdump()))
    save('result.json', {'passed': True, 'compiledServer': True, 'restartMidWait': True, 'competingProcesses': True, 'uniqueReminders': 3, 'dateOnlyIgnored': True, 'cleanup': True, 'realLaunchctl': True, 'authenticatedSse': True, 'sharedContractDecoded': True, 'openapiExpanded': True, 'label': label, 'scratchHome': str(home), 'realDatabaseTouched': False})
finally:
    for process in streams + servers:
        if process.poll() is None:
            stop(process)
    for log in logs:
        log.close()
    try:
        if launchd_attempted:
            removed = lifecycle('uninstall')
            assert not removed['loaded'] and not removed['installed']
            marker.unlink(missing_ok=True)
    finally:
        save('actions.json', actions)
