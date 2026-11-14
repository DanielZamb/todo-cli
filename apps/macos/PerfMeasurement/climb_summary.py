#!/usr/bin/env python3
import collections
import json
from pathlib import Path
import statistics
import sys

root = Path(sys.argv[1])
commands = json.loads((root / 'commands.json').read_text())
successful = {row['log'] for row in commands if row['exit'] == 0}
settings = json.loads((root / 'settings.json').read_text())
steps = ['first-load', 'stream-ready', 'cli-operation-0']
steps += ['profile-switch-backlog-' + str(value) for value in settings['climb_backlogs']]
steps += ['own-complete-with-echo', 'burst-20-cli', 'idle-end-reconnect']
runs = collections.defaultdict(list)
errors = sum(row['exit'] != 0 for row in commands)

def spread(values):
    return dict(median=statistics.median(values), minimum=min(values), maximum=max(values))

for variant in sorted(root.glob('*/variant.json')):
    folder = variant.parent
    if 'session-' + folder.name + '.log' not in successful:
        errors += 1
        continue
    identity = json.loads(variant.read_text())
    rows = json.loads((folder / 'measurement.json').read_text())
    by_name = {row['step']: row for row in rows}
    missing = set(steps) - set(by_name)
    assert not missing, ('missing scripted work', missing)
    selected = [by_name[name] for name in steps]
    samples = [json.loads(line) for line in (folder / 'load.ndjson').read_text().splitlines()]
    requests = [request for row in rows for request in row['requests']]
    active_start = min(request['started'] for request in requests)
    active_end = max(request['started'] + request.get('elapsedMS', 0) / 1000 for request in requests)
    loads = [sample['load'][0] for sample in samples if active_start <= sample['monotonic'] <= active_end]
    assert loads, 'no load samples during client request activity'
    errors += sum(request['status'] >= 400 for row in rows for request in row['requests'])
    expected_operations = 22 + sum(settings['climb_backlogs'])
    operations = sum(len(row['operationEvents']) for row in selected)
    assert operations == expected_operations, ('consumed operations', operations, expected_operations)
    assert all('endMS' in refresh for row in selected for refresh in row['refreshes']), 'unfinished catalog read'
    assert json.loads((folder / 'cleanup.json').read_text())['scratchRemoved'], 'owned scratch retained'
    runs[identity['ref']].append(dict(
        identity=identity, requests=sum(len(row['requests']) for row in selected),
        catalog_reads=sum(len(row['refreshes']) for row in selected), operations=operations,
        actor_gap_ms=max(row['actorHeartbeat']['longestUnservicedMS'] for row in selected),
        load=spread(loads), cell_load_including_setup_and_lock_wait=spread([sample['load'][0] for sample in samples]),
        load_window=dict(start_monotonic=active_start, end_monotonic=active_end, samples=len(loads)),
        actions={row['step']: dict(
            catalog_reads=len(row['refreshes']), requests=len(row['requests']),
            model_action_ms=row['actionFinishedMS'], settled_ms=row['elapsedMS'],
            busy_ms=row['busyMS'], not_writable_ms=row['notWritableMS'], loading_ms=row['loadingMS'],
            fresh_full_layout_ms=row['fullLayoutMS'],
            **(dict(switch_to_live_ms=row['switchToLiveMS'], switch_to_current_ms=row['switchToCurrentMS'], replay_drain_ms=row['actionFinishedMS']) if 'switchToCurrentMS' in row else {})) for row in selected}))

result = dict(errors=errors, native_input_qualified=False,
              metric_scope='selected scripted table steps through production model and unordered RootView; fixture, sign-in and return-to-work setup excluded; model-action timing excludes count settling, not native input latency',
              baseline_reference=dict(commit='e69230f9', full_refreshes=379, requests=3043), variants={})
for ref, values in runs.items():
    assert len(values) == settings['runs'], ('missing successful runs', ref, len(values), settings['runs'])
    result['variants'][ref] = dict(
        runs=len(values), work=dict(consumed_operations=sum(row['operations'] for row in values),
                                   requests=sum(row['requests'] for row in values),
                                   full_catalog_reads=sum(row['catalog_reads'] for row in values)),
        requests=spread([row['requests'] for row in values]),
        full_catalog_reads=spread([row['catalog_reads'] for row in values]),
        worst_actor_gap_ms=spread([row['actor_gap_ms'] for row in values]),
        actions={name: {key: spread([row['actions'][name][key] for row in values])
                        for key in values[0]['actions'][name]} for name in steps}, raw=values)
assert result['variants'], 'no measured work'
(root / 'climb-summary.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
raise SystemExit(1 if errors else 0)
