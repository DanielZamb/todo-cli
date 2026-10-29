#!/usr/bin/env python3
from concurrent.futures import ThreadPoolExecutor
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
streams = []
home = scratch / 'home'
home.mkdir()
env = {**os.environ, 'HOME': str(home), 'TODO_DB': str(scratch / 'scratch.db'), 'NO_COLOR': '1'}

def redacted(value):
    if isinstance(value, dict):
        return {key: '<redacted>' if key in ('credential', 'passphrase', 'token') else redacted(val) for key, val in value.items()}
    if isinstance(value, list):
        return [redacted(val) for val in value]
    return value

def save(name, value):
    (evidence / name).write_text(json.dumps(value, indent=2) + '\n')

def read_frames(path):
    blocks = path.read_text().split('\n\n')[:-1]
    result = []
    for block in blocks:
        fields = dict(line.split(': ', 1) for line in block.splitlines() if ': ' in line)
        if 'data' in fields:
            fields['data'] = json.loads(fields['data'])
            result.append(fields)
    return result

with (evidence / 'server.log').open('w') as log:
    server = subprocess.Popen([str(scratch / 'server')], env={**env, 'TODO_PORT': '0'}, stdout=log, stderr=log)
    try:
        base = None
        for _ in range(100):
            match = re.search(r'http://127\.0\.0\.1:\d+', (evidence / 'server.log').read_text())
            if match:
                base = match.group()
                break
            assert server.poll() is None, 'Server exited before ready'
            time.sleep(0.05)
        assert base, 'No loopback listen address'
        listeners = subprocess.check_output(['lsof', '-nP', '-a', '-p', str(server.pid), '-iTCP', '-sTCP:LISTEN'], text=True)
        (evidence / 'listener.txt').write_text(listeners)
        assert '127.0.0.1:' in listeners and '*:' not in listeners and '[::]' not in listeners

        def request(method, path, status=200, payload=None, credential=None, cursor=None):
            cmd = ['curl', '--silent', '--show-error', '--max-time', '10', '-X', method, '-w', '\n%{http_code}', base + path]
            if payload is not None:
                cmd += ['-H', 'Content-Type: application/json', '--data-binary', json.dumps(payload)]
            if credential is not None:
                cmd += ['-H', 'Authorization: Bearer ' + credential]
            if cursor is not None:
                cmd += ['-H', 'Last-Event-ID: ' + cursor]
            raw = subprocess.check_output(cmd, text=True)
            body, code = raw.rsplit('\n', 1)
            value = json.loads(body) if body else None
            actions.append({'method': method, 'path': path, 'request': redacted(payload), 'credential_kind': credential[:4] if credential else None, 'cursor': cursor, 'status': int(code), 'response': redacted(value)})
            assert int(code) == status, (method, path, code, value)
            return value

        def connect(name, credential, cursor=None):
            path = evidence / (name + '.sse')
            output = path.open('w')
            errors = (evidence / (name + '.stderr')).open('w')
            cmd = ['curl', '--silent', '--show-error', '--no-buffer', '--max-time', '30', '-D', str(evidence / (name + '.headers')), '-H', 'Authorization: Bearer ' + credential, base + '/profiles/work/events']
            if cursor is not None:
                cmd += ['-H', 'Last-Event-ID: ' + str(cursor)]
            child = subprocess.Popen(cmd, stdout=output, stderr=errors)
            streams.append((child, output, errors))
            actions.append({'action': 'connect', 'name': name, 'pid': child.pid, 'last_event_id': cursor, 'credential_kind': credential[:4]})
            wait_for(path, lambda frames: any(frame['event'] == 'ready' for frame in frames))
            return child, path

        def wait_for(path, predicate, timeout=5):
            until = time.monotonic() + timeout
            while time.monotonic() < until:
                frames = read_frames(path)
                if predicate(frames):
                    return frames
                time.sleep(0.01)
            raise AssertionError(('SSE deadline', path.name, read_frames(path)))

        def ops(path):
            return [frame for frame in read_frames(path) if frame['event'] == 'operation']

        def cli(*args, stdin=None):
            cmd = [str(scratch / 'todo'), '--db', str(scratch / 'scratch.db'), '--profile', 'work', '--format', 'json', *args]
            started = time.monotonic()
            result = subprocess.run(cmd, env=env, input=stdin, capture_output=True, text=True, timeout=10)
            value = json.loads(result.stdout) if result.stdout.strip().startswith('{') else result.stdout
            actions.append({'action': 'compiled-cli', 'args': list(args), 'home': str(home), 'exit': result.returncode, 'output': redacted(value), 'stderr': result.stderr, 'duration_ms': round((time.monotonic() - started) * 1000, 3)})
            assert result.returncode == 0, (args, result.stdout, result.stderr)
            return value

        assert request('GET', '/health') == {'service': 'todo-server'}
        session = request('POST', '/auth/sessions', payload={'passphrase': 'scratch verification passphrase'})['credential']
        reader = request('POST', '/auth/tokens', payload={'name': 'sse-reader', 'profile': 'work', 'scope': 'read-only'}, credential=session)['credential']
        cli('login', '--password-stdin', stdin='scratch verification passphrase\n')
        assert (home / '.todo-cli/session_work.json').is_file()
        request('GET', '/profiles/work/events', 401)
        request('GET', '/profiles/work/events', 401, credential='tok_invalid')
        request('GET', '/profiles/personal/events', 403, credential=reader)
        for cursor in ['-1', '1.5', '1e2', '9007199254740992', 'abc']:
            request('GET', '/profiles/work/events', 400, credential=session, cursor=cursor)
        initial, first_path = connect('initial', reader)
        created = request('POST', '/profiles/work/tasks', payload={'title': 'First streamed task'}, credential=session)
        first_frames = wait_for(first_path, lambda frames: any(frame['event'] == 'operation' and frame['data']['event']['kind'] == 'TaskCreated' for frame in frames))
        first_ops = [frame for frame in first_frames if frame['event'] == 'operation']
        assert [frame['data']['event']['kind'] for frame in first_ops] == ['AuthChanged', 'TaskCreated']
        first = first_ops[-1]
        assert [first['data']['outcome'], first['data']['event']['kind'], first['data']['event']['task']['title']] == ['committed', 'TaskCreated', 'First streamed task']
        cursor = int(first['id'])
        initial.kill()
        initial.wait(timeout=5)
        assert initial.returncode == -9
        actions.append({'action': 'kill-live-sse', 'pid': initial.pid, 'signal': 'SIGKILL', 'last_event_id': cursor, 'exit': initial.returncode})
        task_path = '/profiles/work/tasks/' + created['id']
        request('PATCH', task_path, payload={'from_version': 1, 'changes': {'title': 'Edited while disconnected'}}, credential=session)
        request('PATCH', task_path, 409, {'from_version': 1, 'changes': {'title': 'Rejected stale edit'}}, session)
        cli('add', 'CLI while disconnected')
        request('POST', '/profiles/personal/tasks', payload={'title': 'Personal must stay private'}, credential=session)
        resumed, resumed_path = connect('resumed', reader, cursor)
        wait_for(resumed_path, lambda frames: len([frame for frame in frames if frame['event'] == 'operation']) == 2)
        idle_started = time.monotonic()
        time.sleep(12)
        idle_seconds = time.monotonic() - idle_started
        idle_exit = resumed.poll()
        actions.append({'action': 'wait-without-writes', 'duration_seconds': round(idle_seconds, 3), 'stream_pid': resumed.pid, 'stream_exit': idle_exit})
        assert idle_seconds > 10 and idle_exit is None
        after_idle = request('POST', '/profiles/work/tasks', payload={'title': 'After twelve idle seconds'}, credential=session)
        assert [after_idle['title'], after_idle['status'], after_idle['row_version']] == ['After twelve idle seconds', 'open', 1]
        wait_for(resumed_path, lambda frames: any(frame['event'] == 'operation' and frame['data']['event'].get('task', {}).get('title') == 'After twelve idle seconds' for frame in frames))
        assert resumed.poll() is None
        observed_latencies = []
        for number in range(3):
            title = f'Live CLI task {number}'
            started = time.monotonic()
            cli('add', title)
            wait_for(resumed_path, lambda frames: any(frame['event'] == 'operation' and frame['data']['event'].get('task', {}).get('title') == title for frame in frames), timeout=1)
            latency = (time.monotonic() - started) * 1000
            assert latency < 1000, latency
            observed_latencies.append(round(latency, 3))
        with ThreadPoolExecutor(max_workers=2) as pool:
            cli_write = pool.submit(cli, 'add', 'Concurrent CLI write')
            http_write = pool.submit(request, 'POST', '/profiles/work/tasks', 200, {'title': 'Concurrent HTTP write'}, session)
            cli_write.result()
            http_write.result()
        wait_for(resumed_path, lambda frames: len([frame for frame in frames if frame['event'] == 'operation']) == 8)
        all_ops = first_ops + ops(resumed_path)
        with sqlite3.connect(scratch / 'scratch.db') as db:
            durable = [{'seq': row[0], 'profile': row[1], 'outcome': row[2], 'reason': row[3], 'event': json.loads(row[4])} for row in db.execute('SELECT seq,profile,outcome,reason,event FROM op_log ORDER BY seq')]
        save('durable-history.json', durable)
        expected = [row['seq'] for row in durable if row['outcome'] == 'committed' and row['profile'] == 'work']
        actual = [int(frame['id']) for frame in all_ops]
        assert actual == expected, (actual, expected)
        assert actual == sorted(set(actual))
        assert all(frame['data']['seq'] == int(frame['id']) and frame['data']['outcome'] == 'committed' and frame['data']['profile'] == 'work' for frame in all_ops)
        assert all(row['seq'] not in actual for row in durable if row['outcome'] == 'rejected' or row['profile'] != 'work')
        assert [row['reason'] for row in durable if row['reason'] == 'conflict'] == ['conflict']
        titles = [frame['data']['event'].get('task', {}).get('title') for frame in all_ops if frame['data']['event']['kind'] == 'TaskCreated']
        assert sorted(titles) == sorted(['First streamed task', 'CLI while disconnected', 'After twelve idle seconds', 'Live CLI task 0', 'Live CLI task 1', 'Live CLI task 2', 'Concurrent CLI write', 'Concurrent HTTP write'])
        request('DELETE', '/auth/tokens/sse-reader', 204, credential=session)
        wait_for(resumed_path, lambda frames: any(frame['event'] == 'effect/http-api/stream/failure' for frame in frames))
        resumed.wait(timeout=5)
        assert resumed.returncode == 0
        request('GET', '/profiles/work/events', 401, credential=reader)
        headers = (evidence / 'resumed.headers').read_text().lower()
        assert 'text/event-stream' in headers and 'cache-control: no-store' in headers
        request('DELETE', '/auth/session', 204, credential=session)
        request('GET', '/profiles/work/events', 401, credential=session)
        save('result.json', {'status': 'PASS', 'killed_connection_exit': initial.returncode, 'resume_after': cursor, 'streamed_sequences': actual, 'durable_committed_work_sequences': expected, 'external_cli_delivery_ms_from_process_start': observed_latencies, 'rejected_ops_streamed': 0, 'foreign_profile_ops_streamed': 0, 'revoked_stream_closed': True, 'idle_seconds_before_http_write': round(idle_seconds, 3), 'idle_stream_exit_before_write': idle_exit, 'post_idle_task_delivered_on_original_connection': True, 'scratch_home': str(home), 'scratch_database': str(scratch / 'scratch.db')})
    finally:
        for child, output, errors in streams:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=5)
            output.close()
            errors.close()
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
        save('actions.json', actions)
        save('cleanup.json', {
            'server_pid': server.pid,
            'server_exit': server.returncode,
            'streams': [{'pid': child.pid, 'exit': child.returncode} for child, _, _ in streams],
            'all_owned_processes_exited': server.poll() is not None and all(child.poll() is not None for child, _, _ in streams),
        })
