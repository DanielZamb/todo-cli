#!/usr/bin/env python3
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
from native_guard import require_consent

require_consent()

root = Path(__file__).resolve().parents[4]
config = json.loads((root / 'apps/macos/DerivedData/verification.json').read_text())
evidence = Path(config['evidence'])
env = {**os.environ, 'HOME': config['home'], 'NO_COLOR': '1'}


def record(action, result):
    with (evidence / 'external-actions.jsonl').open('a') as log:
        log.write(json.dumps({'action': action, 'result': result}) + '\n')


def cli(arguments):
    command = [config['cli'], '--db', config['db'], '--profile', 'work', '--format', 'json', *arguments]
    result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr
    value = json.loads(result.stdout)
    record(arguments, value)
    return value


def request(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {'Content-Type': 'application/json'}
    if path != '/auth/sessions':
        headers['Authorization'] = 'Bearer ' + credential
    req = urllib.request.Request(config['server'] + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.load(response)


action = sys.argv[1]
if action in ('relaunch-app', 'relaunch-dark', 'relaunch-light', 'stop-server', 'restart-server'):
    done = evidence / (action + '.done')
    done.unlink(missing_ok=True)
    (evidence / action).touch()
    deadline = time.monotonic() + 15
    while not done.exists():
        assert time.monotonic() < deadline, 'Native driver did not acknowledge control action'
        time.sleep(.1)
    record(action, 'acknowledged')
    print(action + ': acknowledged')
    sys.exit()

if action == 'live':
    cli(['add', 'CLI live write'])
elif action == 'disconnected':
    cli(['add', 'CLI while disconnected'])
elif action == 'compete':
    result = cli(['list'])
    tasks = result if isinstance(result, list) else result['tasks']
    task = next(task for task in tasks if task['title'] == 'Native UI edited')
    cli(['edit', task['id'], '--title', 'CLI competing edit', '--expected-version', str(task['row_version'])])
elif action in ('fixtures', 'reminder'):
    credential = request('POST', '/auth/sessions', {'passphrase': 'scratch verification passphrase'})['credential']
    if action == 'fixtures':
        today = datetime.datetime.now().astimezone().date()
        cli(['add', 'Gather project notes', '--project', 'Website', '--tag', 'writing'])
        project = next(value['id'] for value in request('GET', '/profiles/work/projects') if value['name'] == 'Website')
        tag = next(value['id'] for value in request('GET', '/profiles/work/tags') if value['name'] == 'writing')
        cases = []
        groups = [
            ('due_at', -1, ['Review launch plan', 'Approve final copy', 'Check release links', 'Confirm launch checklist']),
            ('due_at', 0, ['Send launch notes', 'Review welcome email', 'Publish release notes', 'Check accessibility']),
            ('scheduled_at', 0, ['Draft release message', 'Prepare product images', 'Outline next article', 'Plan project review']),
            ('scheduled_at', 1, ['Prepare next milestone', 'Review support feedback']),
        ]
        for field, offset, titles in groups:
            for index, title in enumerate(titles):
                cases.append({'title': title, 'priority': 'P' + str(index % 4 + 1), 'project_id': project, 'tags': [tag], field: {'kind': 'date', 'date': str(today + datetime.timedelta(days=offset))}})
        for body in cases:
            task = request('POST', '/profiles/work/tasks', body)
            record(action, task)
    else:
        task = next(task for task in request('GET', '/profiles/work/tasks') if task['title'] == 'Your conflict resolution')
        due = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=int(sys.argv[2]) if len(sys.argv) > 2 else -1)
        value = request('PATCH', '/profiles/work/tasks/' + task['id'], {'from_version': task['row_version'], 'changes': {'due_at': {'kind': 'instant', 'utc': due.isoformat(timespec='seconds').replace('+00:00', 'Z'), 'time_zone': 'America/Bogota'}}})
        record(action, value)
else:
    raise ValueError('Unknown action: ' + action)
print(action + ': passed')
