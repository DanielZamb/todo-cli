#!/usr/bin/env python3
import json
import os
from pathlib import Path
import re
import subprocess
import sqlite3
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
    server = subprocess.Popen([os.environ.get('TODO_SERVER_BINARY', str(scratch / 'server'))], env={**os.environ, 'TODO_DB': str(scratch / 'scratch.db'), 'TODO_PORT': '0', 'NO_COLOR': '1'}, stdout=log, stderr=log)
    try:
        base = None
        for _ in range(1200):
            match = re.search(r'http://127\.0\.0\.1:\d+', (evidence / 'server.log').read_text())
            if match:
                base = match.group()
                break
            if server.poll() is not None:
                raise RuntimeError('Server exited before ready')
            time.sleep(0.05)
        assert base, 'No loopback listen address'
        (evidence / 'listener.txt').write_text(subprocess.check_output(['lsof', '-nP', '-a', '-p', str(server.pid), '-iTCP', '-sTCP:LISTEN'], text=True))
        listeners = (evidence / 'listener.txt').read_text()
        assert '127.0.0.1:' in listeners and '*:' not in listeners and '[::]' not in listeners

        def request(method, path, status, payload=None, credential=None):
            cmd = ['curl', '--silent', '--show-error', '--max-time', '10', '-X', method, '-w', '\n%{http_code}', base + path]
            if payload is not None:
                cmd += ['-H', 'Content-Type: application/json', '--data-binary', json.dumps(payload)]
            if credential is not None:
                cmd += ['-H', 'Authorization: Bearer ' + credential]
            raw = subprocess.check_output(cmd, text=True)
            body, code = raw.rsplit('\n', 1)
            value = json.loads(body) if body else None
            actions.append({'method': method, 'path': path, 'request': redacted(payload), 'credential_kind': credential[:4] if credential else None, 'status': int(code), 'response': redacted(value)})
            assert int(code) == status, (method, path, code, status, value)
            return value

        assert request('GET', '/health', 200) == {'service': 'todo-server'}
        request('GET', '/profiles/work/tasks', 401)
        request('POST', '/auth/sessions', 401, {'passphrase': 'wrong'})
        session = request('POST', '/auth/sessions', 200, {'passphrase': 'scratch verification passphrase'})['credential']
        assert session.startswith('ses_')
        created = request('POST', '/profiles/work/tasks', 200, {'title': 'Prove the HTTP API'}, session)
        task = created['id']
        path = '/profiles/work/tasks/' + task
        assert [created['title'], created['status'], created['row_version'], created['priority'], created['source']] == ['Prove the HTTP API', 'open', 1, 'P3', 'manual']
        assert request('GET', path, 200, credential=session) == created
        edited = request('PATCH', path, 200, {'from_version': 1, 'changes': {'title': 'Ship the HTTP API'}}, session)
        conflict = request('PATCH', path, 409, {'from_version': 1, 'changes': {'title': 'Stale edit'}}, session)
        assert conflict == {'_tag': 'Conflict', 'latest': edited}
        reader = request('POST', '/auth/tokens', 200, {'name': 'reader', 'profile': 'work', 'scope': 'read-only'}, session)['credential']
        writer = request('POST', '/auth/tokens', 200, {'name': 'writer', 'profile': 'work', 'scope': 'read-write'}, session)['credential']
        assert request('GET', '/profiles/work/tasks', 200, credential=reader) == [edited]
        request('POST', '/profiles/work/tasks', 403, {'title': 'Denied'}, reader)
        request('GET', '/profiles/personal/tasks', 403, credential=reader)
        request('GET', '/auth/tokens', 403, credential=writer)
        completed = request('POST', path + '/transition', 200, {'from_version': 2, 'action': 'complete'}, writer)
        assert [completed['status'], completed['row_version']] == ['done', 3]
        request('POST', path + '/transition', 409, {'from_version': 2, 'action': 'cancel'}, writer)
        reopened = request('POST', path + '/transition', 200, {'from_version': 3, 'action': 'reopen'}, session)
        assert [reopened['status'], reopened['row_version'], reopened['completed_at']] == ['open', 4, None]
        cancelled = request('POST', path + '/transition', 200, {'from_version': 4, 'action': 'cancel'}, writer)
        assert [cancelled['status'], cancelled['row_version']] == ['cancelled', 5]
        request('DELETE', path + '?from_version=4', 409, credential=session)
        deleted = request('DELETE', path + '?from_version=5', 200, credential=session)
        assert deleted['deleted_at'] and deleted['row_version'] == 6
        assert request('GET', '/profiles/work/tasks', 200, credential=session) == []
        request('GET', path, 404, credential=session)
        request('DELETE', '/auth/tokens/writer', 204, credential=session)
        request('GET', '/profiles/work/tasks', 401, credential=writer)
        request('DELETE', '/auth/session', 204, credential=session)
        request('GET', '/profiles/work/tasks', 401, credential=session)
        contract = request('GET', '/openapi.json', 200)
        assert contract['paths']['/profiles/{profile}/tasks/{task}']['patch']['responses']['409']
        assert contract == json.loads(Path('packages/api/openapi.json').read_text())
        with sqlite3.connect(scratch / 'scratch.db') as database:
            tasks = database.execute("SELECT json_extract(payload, '$.title'), json_extract(payload, '$.status'), json_extract(payload, '$.row_version'), json_extract(payload, '$.deleted_at') IS NOT NULL FROM tasks").fetchall()
            assert tasks == [('Ship the HTTP API', 'cancelled', 6, 1)], tasks
            history = database.execute("SELECT json_extract(event, '$.kind'), outcome, reason FROM op_log WHERE json_extract(event, '$.kind') LIKE 'Task%' ORDER BY seq").fetchall()
            assert history == [
                ('TaskCreated', 'committed', None), ('TaskEdited', 'committed', None),
                ('TaskAttemptRejected', 'rejected', 'conflict'), ('TaskCompleted', 'committed', None),
                ('TaskAttemptRejected', 'rejected', 'conflict'), ('TaskReopened', 'committed', None),
                ('TaskCancelled', 'committed', None), ('TaskAttemptRejected', 'rejected', 'conflict'),
                ('TaskDeleted', 'committed', None),
            ], history
        (evidence / 'durable-state.json').write_text(json.dumps({'tasks': tasks, 'history': history}, indent=2) + '\n')
        (evidence / 'result.json').write_text(json.dumps({'task': deleted, 'requests': len(actions), 'host': '127.0.0.1', 'result': 'PASS'}, indent=2) + '\n')
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
        (evidence / 'actions.json').write_text(json.dumps(actions, indent=2) + '\n')
