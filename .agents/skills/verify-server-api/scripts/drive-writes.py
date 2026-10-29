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
        for _ in range(1200):
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
        reader = request('POST', '/auth/tokens', 200, {'name': 's05-reader', 'profile': 'work', 'scope': 'read-only'}, session)['credential']
        writer = request('POST', '/auth/tokens', 200, {'name': 's05-writer', 'profile': 'work', 'scope': 'read-write'}, session)['credential']
        personal_writer = request('POST', '/auth/tokens', 200, {'name': 's05-personal', 'profile': 'personal', 'scope': 'read-write'}, session)['credential']
        stale_move_latest = request('PATCH', '/profiles/work/tasks/inbox', 200, {'from_version': 1, 'changes': {'title': 'Keep stale move unchanged'}}, writer)
        assert request('POST', '/profiles/work/tasks/inbox/move', 409, {'from_version': 1, 'destination_profile': 'personal'}, session) == {'_tag': 'Conflict', 'latest': stale_move_latest}
        target = '/profiles/work/tasks/inbox-project' 
        before = request('GET', target, 200, credential=session)
        for invalid in [{'title': ' \t'}, {'title': 'Task', 'source': 'other'}]:
            request('POST', '/profiles/work/tasks', 400, invalid, writer)
            request('PATCH', target, 400, {'from_version': 1, 'changes': invalid}, writer)
        with sqlite3.connect(scratch / 'scratch.db') as database:
            invalid_history = database.execute("SELECT reason,from_version,json_extract(event,'$.attempted_kind') FROM op_log WHERE outcome='rejected' AND reason='validation' ORDER BY seq").fetchall()
            assert invalid_history == [('validation', None, 'TaskCreated'), ('validation', 1, 'TaskEdited'), ('validation', None, 'TaskCreated'), ('validation', 1, 'TaskEdited')]
        (evidence / 'canonical-validation-history.json').write_text(json.dumps(invalid_history, indent=2) + '\n')
        move = {'from_version': 1, 'destination_profile': 'personal'}
        request('POST', target + '/move', 401, move)
        request('POST', target + '/move', 403, move, reader)
        request('POST', target + '/move', 403, move, writer)
        request('POST', target + '/move', 403, move, personal_writer)
        request('POST', target + '/move', 400, {'destination_profile': 'personal'}, session)
        request('POST', target + '/move', 422, {**move, 'destination_profile': 'missing'}, session)
        stale = request('POST', target + '/move', 409, {**move, 'from_version': 2}, session)
        assert stale == {'_tag': 'Conflict', 'latest': before}
        moved = request('POST', target + '/move', 200, move, session)
        assert [moved['id'], moved['profile_id'], moved['row_version'], moved['occurrence']] == ['inbox-project', 'personal', 2, None]
        assert [p['name'] for p in request('GET', '/profiles/personal/projects', 200, credential=session) if p['id'] == moved['project_id']] == ['Work Project']
        assert [t['name'] for t in request('GET', '/profiles/personal/tags', 200, credential=session) if t['id'] in moved['tags']] == ['work-tag']
        assert moved['title'] == 'Inbox with Project'
        request('GET', target, 404, credential=reader)
        destination = '/profiles/personal/tasks/inbox-project'
        assert request('GET', destination, 200, credential=session) == moved
        request('GET', destination, 403, credential=writer)
        old_history = request('GET', target + '/history', 200, credential=reader)
        new_history = request('GET', destination + '/history', 200, credential=session)
        assert old_history[-1]['event']['kind'] == 'TaskMovedOut'
        assert [e['event']['kind'] for e in new_history] == ['TaskMovedIn']
        assert 'personal' not in json.dumps(old_history)
        move_seq = new_history[-1]['seq']
        revert_move = {'from_version': 2, 'seq': move_seq}
        request('POST', destination + '/revert', 403, revert_move, personal_writer)
        restored = request('POST', destination + '/revert', 200, revert_move, session)
        assert [restored['profile_id'], restored['row_version'], restored['project_id'], restored['tags']] == ['work', 3, 'work-project', ['work-tag']]
        request('GET', destination, 404, credential=session)
        assert request('GET', target, 200, credential=reader) == restored
        edited = request('PATCH', target, 200, {'from_version': 3, 'changes': {'title': 'Edited before Revert'}}, writer)
        history = request('GET', target + '/history', 200, credential=reader)
        seq = history[-1]['seq']
        revert = {'from_version': 4, 'seq': seq}
        request('POST', target + '/revert', 401, revert)
        request('POST', target + '/revert', 403, revert, reader)
        assert request('POST', target + '/revert', 409, {**revert, 'from_version': 3}, writer) == {'_tag': 'Conflict', 'latest': edited}
        request('POST', '/profiles/personal/tasks/personal/revert', 422, {'from_version': 1, 'seq': seq}, session)
        reverted = request('POST', target + '/revert', 200, revert, writer)
        assert [reverted['title'], reverted['row_version']] == ['Inbox with Project', 5]
        assert request('POST', target + '/revert', 409, {'from_version': 5, 'seq': seq}, writer) == {'_tag': 'Conflict', 'latest': reverted}
        deleted = request('DELETE', target + '?from_version=5', 200, credential=writer)
        seq_delete = request('GET', target + '/history', 200, credential=reader)[-1]['seq']
        recovered = request('POST', target + '/revert', 200, {'from_version': 6, 'seq': seq_delete}, writer)
        assert [deleted['row_version'], recovered['row_version'], recovered['deleted_at']] == [6, 7, None]
        rule = {'dtstart': {'kind': 'date', 'date': '2026-10-27'}, 'rrule': 'FREQ=DAILY;COUNT=4', 'exdate': []}
        create = {'task': {'title': 'Daily Series', 'project_id': 'work-project', 'tags': ['work-tag']}, 'recurrence': rule}
        request('POST', '/profiles/work/series', 401, create)
        request('POST', '/profiles/work/series', 403, create, reader)
        request('POST', '/profiles/personal/series', 403, create, writer)
        request('POST', '/profiles/work/series', 422, {**create, 'recurrence': {**rule, 'rrule': 'FREQ=INVALID'}}, writer)
        request('POST', '/profiles/work/series', 422, {**create, 'task': {'title': 'Foreign definitions', 'project_id': 'personal-project', 'tags': ['personal-tag']}}, writer)
        first = request('POST', '/profiles/work/series', 200, create, writer)
        assert [first['row_version'], first['occurrence']['date'], first['scheduled_at'], first['project_id'], first['tags']] == [1, '2026-10-27', {'kind': 'date', 'date': '2026-10-27'}, 'work-project', ['work-tag']]
        occurrence = '/profiles/work/tasks/' + first['id']
        rule2 = {**rule, 'rrule': 'FREQ=WEEKLY;COUNT=3', 'exdate': [{'kind': 'date', 'date': '2026-11-03'}]}
        edit = {'from_version': 1, 'changes': {'title': 'Weekly Series'}, 'recurrence': rule2}
        request('PATCH', occurrence + '/series', 403, edit, reader)
        request('PATCH', occurrence.replace('/work/', '/personal/') + '/series', 404, edit, session)
        request('PATCH', occurrence + '/series', 400, {'changes': {}, 'recurrence': rule2}, writer)
        request('PATCH', occurrence + '/series', 422, {**edit, 'recurrence': {**rule, 'rrule': 'BAD'}}, writer)
        series_edit = request('PATCH', occurrence + '/series', 200, edit, writer)
        assert [series_edit['title'], series_edit['row_version']] == ['Weekly Series', 2]
        assert request('PATCH', occurrence + '/series', 409, edit, writer) == {'_tag': 'Conflict', 'latest': series_edit}
        request('POST', occurrence + '/skip', 401, {'from_version': 2})
        request('POST', occurrence + '/skip', 403, {'from_version': 2}, reader)
        request('POST', occurrence.replace('/work/', '/personal/') + '/skip', 404, {'from_version': 2}, session)
        assert request('POST', occurrence + '/skip', 409, {'from_version': 1}, writer) == {'_tag': 'Conflict', 'latest': series_edit}
        skipped = request('POST', occurrence + '/skip', 200, {'from_version': 2}, writer)
        assert [skipped['status'], skipped['row_version']] == ['cancelled', 3]
        assert request('POST', occurrence + '/skip', 409, {'from_version': 2}, writer) == {'_tag': 'Conflict', 'latest': skipped}
        request('POST', occurrence + '/skip', 422, {'from_version': 3}, writer)
        successors = [t for t in request('GET', '/profiles/work/tasks', 200, credential=writer) if t['occurrence'] and t['occurrence']['series_id'] == first['occurrence']['series_id'] and t['status'] == 'open']
        assert len(successors) == 1
        successor = successors[0]
        assert [successor['title'], successor['occurrence']['date'], successor['project_id'], successor['tags']] == ['Weekly Series', '2026-11-10', 'work-project', ['work-tag']]
        request('POST', target + '/skip', 422, {'from_version': 7}, writer)
        request('PATCH', target + '/series', 422, {**edit, 'from_version': 7}, writer)
        private = request('GET', '/profiles/personal/tasks/personal', 200, credential=session)
        assert [private['title'], private['row_version']] == ['Private', 1]
        streamed_moves = {}
        for profile, credential in [('work', reader), ('personal', personal_writer)]:
            stream = subprocess.run(['curl', '--silent', '--show-error', '--no-buffer', '--max-time', '1', '-H', 'Authorization: Bearer ' + credential, base + '/profiles/' + profile + '/events'], capture_output=True, text=True)
            assert stream.returncode == 28, stream.stderr
            (evidence / (profile + '.sse')).write_text(stream.stdout)
            frames = [json.loads(line[6:]) for line in stream.stdout.splitlines() if line.startswith('data: ') and line[6:] != 'null']
            assert all(frame['profile'] == profile for frame in frames)
            moves = [frame['event'] for frame in frames if frame['event']['kind'] in ('TaskMovedOut', 'TaskMovedIn')]
            streamed_moves[profile] = [event['kind'] for event in moves]
            assert all(event['task']['profile_id'] == profile for event in moves)
            if profile == 'work':
                assert 'Sensitive personal' not in stream.stdout and 'Private' not in stream.stdout
            else:
                assert all(len(event['task']['tags']) == 1 for event in moves)
        assert streamed_moves == {'work': ['TaskMovedOut', 'TaskMovedIn'], 'personal': ['TaskMovedIn', 'TaskMovedOut']}
        contract = request('GET', '/openapi.json', 200)
        assert contract == json.loads(Path('packages/api/openapi.json').read_text())
        with sqlite3.connect(scratch / 'scratch.db') as database:
            tasks = database.execute('SELECT id, profile_id, title, row_version, status FROM tasks ORDER BY id').fetchall()
            series = [json.loads(row[0]) for row in database.execute('SELECT payload FROM series')]
            assert len(tasks) == 13
            assert [(s['row_version'], s['recurrence']) for s in series] == [(2, rule2)]
            moves = database.execute("SELECT profile, json_extract(event, '$.kind') FROM op_log WHERE json_extract(event, '$.kind') IN ('TaskMovedOut', 'TaskMovedIn') ORDER BY seq").fetchall()
            assert moves == [('work', 'TaskMovedOut'), ('personal', 'TaskMovedIn'), ('personal', 'TaskMovedOut'), ('work', 'TaskMovedIn')]
        (evidence / 'durable-state.json').write_text(json.dumps({'tasks': tasks, 'series': series, 'moves': moves}, indent=2) + '\n')
        named = request('POST', '/profiles/work/tasks', 200, {'title': 'P02 names', 'project_name': 'P02 Project', 'tag_names': ['FOCUS', 'focus', 'Ready,FOCUS']}, session)
        reused = request('PATCH', '/profiles/work/tasks/inbox', 200, {'from_version': stale_move_latest['row_version'], 'changes': {'project_name': 'P02 Project', 'tag_names': ['ready', 'FOCUS']}}, session)
        assert reused['project_id'] == named['project_id']
        assert sorted(reused['tags']) == sorted(named['tags'])
        project_reads = request('GET', '/profiles/work/projects', 200, credential=session)
        tag_reads = request('GET', '/profiles/work/tags', 200, credential=session)
        assert [p['name'] for p in project_reads if p['id'] == named['project_id']] == ['P02 Project']
        assert sorted(t['name'] for t in tag_reads if t['id'] in named['tags']) == ['focus', 'ready']
        stream = subprocess.run(['curl', '--silent', '--show-error', '-N', '--max-time', '1', '-H', 'Authorization: Bearer ' + session, base + '/profiles/work/events'], text=True, capture_output=True)
        assert stream.returncode == 28
        (evidence / 'metadata.sse').write_text(stream.stdout)
        frames = [json.loads(line[6:]) for line in stream.stdout.splitlines() if line.startswith('data: {')]
        created_event = next(frame['event'] for frame in frames if frame['event'].get('task', {}).get('id') == named['id'])
        assert created_event['project']['name'] == 'P02 Project'
        assert [tag['name'] for tag in created_event['tags']] == ['focus', 'ready']
        with sqlite3.connect(scratch / 'scratch.db') as database:
            assert database.execute("select count(*) from projects where name='P02 Project'").fetchone() == (1,)
            assert database.execute("select count(*) from tags where name in ('focus','ready')").fetchone() == (2,)
        (evidence / 'metadata.json').write_text(json.dumps({'created': named, 'reused': reused, 'projects': project_reads, 'tags': tag_reads, 'sseDefinitions': created_event}, indent=2) + '\n')
        source_before = request('GET', '/profiles/work/tasks', 200, credential=session)
        copy_source = request('POST', '/profiles/work/tasks', 200, {'title': 'C10 copy source', 'project_name': 'ARG', 'tag_names': ['transfer'], 'description': 'Copy all fields', 'priority': 'P1', 'source': 'agent'}, session)
        copy_source = request('POST', '/profiles/work/tasks/' + copy_source['id'] + '/transition', 200, {'from_version': 1, 'action': 'complete'}, session)
        copy_path = '/profiles/work/tasks/' + copy_source['id'] + '/copy'
        copy_payload = {'from_version': 2, 'destination_profile': 'personal'}
        request('POST', copy_path, 400, {**copy_payload, 'from_version': 0}, session)
        request('POST', copy_path, 422, {**copy_payload, 'destination_profile': 'missing-profile'}, session)
        copy_rejections = request('GET', '/profiles/work/tasks/' + copy_source['id'] + '/history', 200, credential=session)
        assert [(entry['reason'], entry['event'].get('attempted_kind')) for entry in copy_rejections if entry['outcome'] == 'rejected'] == [('validation', 'TaskCreated'), ('validation', 'TaskCreated')]
        request('POST', copy_path, 403, copy_payload, writer)
        request('POST', copy_path, 409, {**copy_payload, 'from_version': 1}, session)
        copied = request('POST', copy_path, 200, copy_payload, session)
        assert copied['id'] != copy_source['id']
        assert [copied[key] for key in ['title', 'description', 'priority', 'source', 'status', 'created_at', 'completed_at']] == [copy_source[key] for key in ['title', 'description', 'priority', 'source', 'status', 'created_at', 'completed_at']]
        assert copied['occurrence'] is None and copied['row_version'] == 1
        assert request('GET', '/profiles/work/tasks/' + copy_source['id'], 200, credential=session) == copy_source
        history_copy = request('GET', '/profiles/personal/tasks/' + copied['id'] + '/history', 200, credential=session)
        assert history_copy[0]['event']['copied_from'] == {'profile_id': 'work', 'profile_name': 'work', 'source_task_id': copy_source['id']}
        request('POST', '/profiles/work/tasks/' + copy_source['id'] + '/move', 200, copy_payload, session)
        assert request('GET', '/profiles/work/tasks', 200, credential=session) == source_before
        (evidence / 'copy.json').write_text(json.dumps({'source': copy_source, 'copied': copied, 'history': history_copy, 'untouchedSourceTasks': source_before}, indent=2) + '\n')
        (evidence / 'result.json').write_text(json.dumps({'result': 'PASS', 'requests': len(actions), 'move_revert_version': 3, 'revert_version': 7, 'successor': successor}, indent=2) + '\n')
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
        (evidence / 'actions.json').write_text(json.dumps(actions, indent=2) + '\n')
