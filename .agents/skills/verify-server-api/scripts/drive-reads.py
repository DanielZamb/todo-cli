#!/usr/bin/env python3
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time

scratch, evidence = map(Path, sys.argv[1:])
actions = []

def redacted(value):
    if isinstance(value, dict):
        return {key: '<redacted>' if key in ('credential', 'passphrase') else redacted(val) for key, val in value.items()}
    if isinstance(value, list):
        return [redacted(val) for val in value]
    return value

with (evidence / 'server.log').open('w') as log:
    server = subprocess.Popen([str(scratch / 'server')], env={**os.environ, 'TODO_DB': str(scratch / 'scratch.db'), 'TODO_PORT': '0', 'NO_COLOR': '1'}, stdout=log, stderr=log)
    try:
        base = None
        for _ in range(100):
            match = re.search(r'http://127\.0\.0\.1:\d+', (evidence / 'server.log').read_text())
            if match:
                base = match.group()
                break
            if server.poll() is not None:
                raise RuntimeError('Server exited before ready')
            time.sleep(0.05)
        assert base, 'No listen address'
        (evidence / 'listener.txt').write_text(subprocess.check_output(['lsof', '-nP', '-a', '-p', str(server.pid), '-iTCP', '-sTCP:LISTEN'], text=True))
        listeners = (evidence / 'listener.txt').read_text()
        assert '127.0.0.1:' in listeners and '*:' not in listeners and '[::]' not in listeners

        def request(method, path, status, payload=None, credential=None):
            cmd = ['curl', '--silent', '--show-error', '--max-time', '10', '-X', method, '-w', '\n%{http_code}', base + path]
            if payload is not None:
                cmd += ['-H', 'Content-Type: application/json', '--data-binary', json.dumps(payload)]
            if credential:
                cmd += ['-H', 'Authorization: Bearer ' + credential]
            body, code = subprocess.check_output(cmd, text=True).rsplit('\n', 1)
            value = json.loads(body) if body else None
            actions.append({'method': method, 'path': path, 'request': redacted(payload), 'credential_kind': credential[:4] if credential else None, 'status': int(code), 'response': redacted(value)})
            assert int(code) == status, (path, code, value)
            return value

        assert request('GET', '/health', 200) == {'service': 'todo-server'}
        session = request('POST', '/auth/sessions', 200, {'passphrase': 'scratch verification passphrase'})['credential']
        reader = request('POST', '/auth/tokens', 200, {'name': 's04-reader', 'profile': 'work', 'scope': 'read-only'}, session)['credential']
        writer = request('POST', '/auth/tokens', 200, {'name': 's04-writer', 'profile': 'work', 'scope': 'read-write'}, session)['credential']
        profiles = request('GET', '/profiles', 200, credential=reader)
        assert [(p['id'], p['open_task_count'], p['inbox_task_count']) for p in profiles] == [('work', 6, 2)]
        all_profiles = request('GET', '/profiles', 200, credential=session)
        assert [(p['id'], p['open_task_count'], p['inbox_task_count']) for p in all_profiles] == [('personal', 1, 1), ('work', 6, 2)]
        projects = request('GET', '/profiles/work/projects', 200, credential=reader)
        assert [(p['id'], p['name'], p['open_task_count']) for p in projects] == [('work-project', 'Work Project', 3)]
        tags = request('GET', '/profiles/work/tags', 200, credential=reader)
        assert [(t['id'], t['name'], t['open_task_count']) for t in tags] == [('work-tag', 'work-tag', 2)]
        expected = {
            'today': [['Overdue', ['Overdue']], ['Due today', ['Due today']], ['Scheduled today', ['Scheduled today']]],
            'overdue': [['Overdue', ['Overdue']]],
            'scheduled': [['Scheduled', ['Future scheduled', 'Overdue', 'Scheduled today']]],
            'inbox': [['Inbox', ['Inbox with Project', 'Inbox without Project']]],
        }
        for name, groups in expected.items():
            view = request('GET', '/profiles/work/views/' + name + '?now=2026-10-27T14:00:00Z', 200, credential=reader)
            assert [view['name'], view['now']] == [name, '2026-10-27T14:00:00Z']
            assert [[g['name'], sorted(t['title'] for t in g['tasks'])] for g in view['groups']] == groups
        for path in ['/profiles', '/profiles/work/projects', '/profiles/work/tags', '/profiles/work/views/today', '/profiles/work/tasks/inbox/history']:
            request('GET', path, 401)
        for suffix in ['projects', 'tags', 'views/today', 'tasks/personal/history']:
            request('GET', '/profiles/personal/' + suffix, 403, credential=reader)
        request('GET', '/profiles/work/views/today?now=invalid', 400, credential=reader)
        draft_input = {'text': 'Ship tomorrow scheduled:fri 10am p1 #Launch #launch @Client', 'now': '2026-10-27T02:00:00Z', 'time_zone': 'America/Bogota'}
        draft = request('POST', '/profiles/work/quick-add/parse', 200, draft_input, reader)
        assert draft == {'title': 'Ship', 'due_at': {'kind': 'date', 'date': '2026-10-27'}, 'scheduled_at': {'kind': 'instant', 'utc': '2026-10-30T15:00:00Z', 'time_zone': 'America/Bogota'}, 'priority': 'P1', 'tags': ['launch'], 'project': 'Client'}
        assert request('POST', '/profiles/work/quick-add/parse', 200, draft_input, reader) == draft
        request('POST', '/profiles/personal/quick-add/parse', 403, draft_input, reader)
        request('POST', '/profiles/work/quick-add/parse', 401, draft_input)
        request('POST', '/profiles/work/quick-add/parse', 400, {**draft_input, 'time_zone': 'invalid'}, reader)
        request('POST', '/profiles/work/quick-add/parse', 422, {**draft_input, 'text': 'tomorrow p1'}, reader)
        assert request('POST', '/profiles/work/quick-add/parse', 422, {**draft_input, 'text': 'Meet tomorrow 10:60am'}, reader) == {'_tag': 'InvalidTask', 'message': 'Minute must be between 0 and 59'}
        request('PATCH', '/profiles/work/tasks/inbox', 200, {'from_version': 1, 'changes': {'title': 'Edited Inbox'}}, writer)
        request('PATCH', '/profiles/work/tasks/inbox', 409, {'from_version': 1, 'changes': {'title': 'Stale'}}, writer)
        request('PATCH', '/profiles/work/tasks/inbox', 422, {'from_version': 2, 'changes': {'project_id': 'personal-project', 'tags': ['personal-tag']}}, writer)
        history = request('GET', '/profiles/work/tasks/inbox/history', 200, credential=reader)
        assert [(e['outcome'], e['event']['kind'], e['reason']) for e in history] == [('committed', 'TaskCreated', None), ('committed', 'TaskEdited', None), ('rejected', 'TaskAttemptRejected', 'conflict'), ('rejected', 'TaskAttemptRejected', 'validation')]
        assert 'Sensitive personal Project' not in json.dumps(history)
        assert 'Sensitive personal Tag' not in json.dumps(history)
        rejected = history[-1]['event']['violations'][0]['received']
        assert [rejected['project_before'], rejected['project_after'], rejected['tags_before'], rejected['tags_after']] == [None, None, [], []]
        assert request('GET', '/profiles/work/tasks/personal/history', 200, credential=reader) == []
        assert request('GET', '/profiles/personal/tasks/inbox/history', 200, credential=session) == []
        private = request('POST', '/profiles/work/tasks', 200, {'title': 'P01 HTTP private title', 'description': 'P01 HTTP private description'}, writer)
        private_path = '/profiles/work/tasks/' + private['id']
        request('PATCH', private_path, 409, {'from_version': 9, 'changes': {'title': 'P01 HTTP rejected title'}}, writer)
        request('DELETE', private_path + '?from_version=1', 200, credential=writer)
        purge = json.loads(subprocess.check_output([str(scratch / 'seed'), str(scratch), 'purge', private['id']], text=True))
        actions.append({'command': ['seed', '<scratch>', 'purge', private['id']], 'exit': 0, 'response': purge})
        private_history = request('GET', private_path + '/history', 200, credential=reader)
        assert [(e['event']['kind'], e['event']['original_kind'], e['outcome'], e['from_version'], e['to_version']) for e in private_history] == [
            ('TaskHistoryRedacted', 'TaskCreated', 'committed', None, 1),
            ('TaskHistoryRedacted', 'TaskAttemptRejected', 'rejected', 9, None),
            ('TaskHistoryRedacted', 'TaskDeleted', 'committed', 1, 2),
            ('TaskHistoryRedacted', 'TaskPurged', 'committed', 2, None),
        ]
        for content in ['P01 HTTP private title', 'P01 HTTP private description', 'P01 HTTP rejected title']:
            assert content not in json.dumps(private_history)
        request('GET', private_path, 404, credential=reader)
        assert request('POST', private_path + '/revert', 422, {'from_version': 2, 'seq': private_history[0]['seq']}, writer) == {'_tag': 'InvalidTask', 'message': 'task_purged'}
        assert request('GET', '/profiles/personal/tasks/' + private['id'] + '/history', 200, credential=session) == []
        (evidence / 'purge-history.json').write_text(json.dumps(private_history, indent=2) + '\n')
        contract = request('GET', '/openapi.json', 200)
        assert contract == json.loads(Path('packages/api/openapi.json').read_text())
        with sqlite3.connect(scratch / 'scratch.db') as database:
            state = database.execute("SELECT id, title, row_version FROM tasks WHERE id='inbox'").fetchall()
            assert state == [('inbox', 'Edited Inbox', 2)]
            total = database.execute('SELECT COUNT(*) FROM tasks').fetchone()[0]
            assert total == 11
        (evidence / 'durable-state.json').write_text(json.dumps({'task': state, 'total_tasks': total, 'history': history}, indent=2) + '\n')
        (evidence / 'result.json').write_text(json.dumps({'result': 'PASS', 'requests': len(actions), 'draft': draft, 'profile_counts': profiles}, indent=2) + '\n')
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
        (evidence / 'actions.json').write_text(json.dumps(actions, indent=2) + '\n')
