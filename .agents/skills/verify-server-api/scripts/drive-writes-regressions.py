#!/usr/bin/env python3
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

compiled, evidence = map(Path, sys.argv[1:])
evidence.mkdir()
scenarios = ['move-complete', 'move-cancel', 'round-trip-complete', 'round-trip-cancel', 'move-revert', 'legacy-skip', 'legacy-edit-skip', 'terminal-edit', 'reopened-edit']
for scenario in scenarios:
    output = evidence / scenario
    output.mkdir()
    actions = []
    with tempfile.TemporaryDirectory(prefix='todo-s01-verify-') as directory:
        scratch = Path(directory)
        subprocess.run([str(compiled / 'seed'), directory, 'client-writes-legacy'], check=True)
        with (output / 'server.log').open('w') as log:
            server = subprocess.Popen([str(compiled / 'server')], env={**os.environ, 'TODO_DB': str(scratch / 'scratch.db'), 'TODO_PORT': '0', 'NO_COLOR': '1'}, stdout=log, stderr=log)
            try:
                base = None
                for _ in range(1200):
                    match = re.search(r'http://127\.0\.0\.1:\d+', (output / 'server.log').read_text())
                    if match:
                        base = match.group()
                        break
                    assert server.poll() is None, 'Server exited before ready'
                    time.sleep(0.05)
                assert base, 'No listen address'
                credential = None

                def request(method, path, status, payload=None):
                    command = ['curl', '--silent', '--show-error', '--max-time', '10', '-X', method, '-w', '\n%{http_code}', base + path]
                    if payload is not None:
                        command += ['-H', 'Content-Type: application/json', '--data-binary', json.dumps(payload)]
                    if credential:
                        command += ['-H', 'Authorization: Bearer ' + credential]
                    body, code = subprocess.check_output(command, text=True).rsplit('\n', 1)
                    value = json.loads(body) if body else None
                    if path == '/auth/sessions':
                        recorded_request = {'passphrase': '<redacted>'}
                        recorded_response = {**value, 'credential': '<redacted>'}
                    else:
                        recorded_request, recorded_response = payload, value
                    actions.append({'method': method, 'path': path, 'request': recorded_request, 'status': int(code), 'response': recorded_response})
                    assert int(code) == status, (path, code, value)
                    return value

                credential = request('POST', '/auth/sessions', 200, {'passphrase': 'scratch verification passphrase'})['credential']
                target = '/profiles/work/tasks/legacy-1'
                rule = {'dtstart': {'kind': 'instant', 'utc': '2026-10-27T14:00:00.000Z', 'time_zone': 'UTC'}, 'rrule': 'FREQ=WEEKLY', 'exdate': []}
                if scenario.startswith('move-') or scenario.startswith('round-trip-'):
                    moved = request('POST', target + '/move', 200, {'from_version': 7, 'destination_profile': 'personal'})
                    assert [moved['profile_id'], moved['row_version'], moved['occurrence'], moved.get('legacy_series_detached')] == ['personal', 8, None, True]
                    destination = '/profiles/personal/tasks/legacy-1'
                    version = 8
                    if scenario.startswith('round-trip-'):
                        returned = request('POST', destination + '/move', 200, {'from_version': 8, 'destination_profile': 'work'})
                        assert returned.get('legacy_series_detached') is True
                        destination, version = target, 9
                    elif scenario == 'move-revert':
                        history = request('GET', destination + '/history', 200)
                        restored = request('POST', destination + '/revert', 200, {'from_version': 8, 'seq': history[-1]['seq']})
                        assert 'legacy_series_detached' not in restored
                        destination, version = target, 9
                    action = 'cancel' if scenario.endswith('cancel') else 'complete'
                    finished = request('POST', destination + '/transition', 200, {'from_version': version, 'action': action})
                    assert [finished['row_version'], finished['status']] == [version + 1, 'cancelled' if action == 'cancel' else 'done']
                    tasks = request('GET', '/profiles/work/tasks', 200) + request('GET', '/profiles/personal/tasks', 200)
                    successors = [task for task in tasks if task['occurrence']]
                    assert [task['occurrence']['date'] for task in successors] == (['2026-10-28'] if scenario == 'move-revert' else [])
                elif scenario.startswith('legacy-'):
                    version = 7
                    if scenario == 'legacy-edit-skip':
                        edited = request('PATCH', target + '/series', 200, {'from_version': 7, 'changes': {'title': 'Weekly legacy'}, 'recurrence': rule})
                        assert [edited['title'], edited['row_version']] == ['Weekly legacy', 8]
                        version = 8
                    skipped = request('POST', target + '/skip', 200, {'from_version': version})
                    assert [skipped['status'], skipped['row_version']] == ['cancelled', version + 1]
                    tasks = request('GET', '/profiles/work/tasks', 200)
                    assert [task['occurrence']['date'] for task in tasks if task['status'] == 'open'] == (['2026-11-03'] if version == 8 else ['2026-10-28'])
                else:
                    date_rule = {'dtstart': {'kind': 'date', 'date': '2030-01-01'}, 'rrule': 'FREQ=DAILY;COUNT=4', 'exdate': []}
                    first = request('POST', '/profiles/work/series', 200, {'task': {'title': 'Daily dates'}, 'recurrence': date_rule})
                    occurrence = '/profiles/work/tasks/' + first['id']
                    cancelled = request('POST', occurrence + '/skip', 200, {'from_version': 1})
                    version = 2
                    if scenario == 'reopened-edit':
                        cancelled = request('POST', occurrence + '/transition', 200, {'from_version': 2, 'action': 'reopen'})
                        version = 3
                    instant_rule = {**date_rule, 'dtstart': {'kind': 'instant', 'utc': '2030-01-01T09:00:00Z', 'time_zone': 'UTC'}}
                    request('PATCH', occurrence + '/series', 422, {'from_version': version, 'changes': {}, 'recurrence': instant_rule})
                    assert request('GET', occurrence, 200) == cancelled
                    tasks = request('GET', '/profiles/work/tasks', 200)
                    successor = next(task for task in tasks if task['status'] == 'open' and task['occurrence'] and task['occurrence']['date'] == '2030-01-02')
                    assert successor['occurrence']['date'] == '2030-01-02'
                    request('POST', '/profiles/work/tasks/' + successor['id'] + '/skip', 200, {'from_version': 1})
                    tasks = request('GET', '/profiles/work/tasks', 200)
                    assert sorted(task['occurrence']['date'] for task in tasks if task['status'] == 'open' and task['occurrence']) == (['2030-01-01', '2030-01-03'] if scenario == 'reopened-edit' else ['2030-01-03'])
            finally:
                server.terminate()
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait(timeout=5)
                (output / 'actions.json').write_text(json.dumps(actions, indent=2) + '\n')
                (output / 'cleanup.json').write_text(json.dumps({'server_pid': server.pid, 'server_exit': server.returncode, 'all_owned_processes_exited': server.poll() is not None}, indent=2) + '\n')
        with (output / 'replay.json').open('w') as replay:
            subprocess.run([str(compiled / 'seed'), directory, 'replay'], check=True, stdout=replay)
        assert json.loads((output / 'replay.json').read_text())['result'] == 'PASS'
    assert not scratch.exists()
    (output / 'result.json').write_text(json.dumps({'status': 'PASS', 'scenario': scenario, 'requests': len(actions), 'scratch_removed': True}, indent=2) + '\n')
(evidence / 'result.json').write_text(json.dumps({'status': 'PASS', 'scenarios': scenarios}, indent=2) + '\n')
