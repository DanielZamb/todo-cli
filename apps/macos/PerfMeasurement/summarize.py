#!/usr/bin/env python3
import collections
import json
from pathlib import Path
import statistics
import sys
import re
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('evidence', type=Path, nargs='+')
parser.add_argument('--output', type=Path)
args = parser.parse_args()
evidence = args.output or args.evidence[0]
evidence.mkdir(parents=True, exist_ok=True)
revisions = json.loads((args.evidence[0] / 'revisions.json').read_text())
for source in args.evidence:
    assert json.loads((source / 'revisions.json').read_text()) == revisions, 'cannot merge different revision sets'
(evidence / 'summary-inputs.json').write_text(json.dumps([str(path.resolve()) for path in args.evidence], indent=2))
successful = {source: {entry['log'] for entry in json.loads((source / 'commands.json').read_text()) if entry.get('exit') == 0} for source in args.evidence}
data = {}
loads = {}
for ref, sha in revisions.items():
    paths = sorted(path for source in args.evidence for path in source.glob('*-' + sha[:8] + '/measurement.json') if 'session-' + path.parent.name + '.log' in successful[source])
    modes = {json.loads((path.parent / 'workload.json').read_text()).get('diagnostics', False) for path in paths if (path.parent / 'workload.json').exists()}
    delays = {json.loads((path.parent / 'workload.json').read_text()).get('replyDelayMS', 0) for path in paths if (path.parent / 'workload.json').exists()}
    for path in paths:
        mode = json.loads((path.parent / 'workload.json').read_text()).get('diagnostics', False) if (path.parent / 'workload.json').exists() else False
        key = ref + (' / Diagnostics ' + ('open' if mode else 'closed') if len(modes) > 1 else '')
        if len(delays) > 1: key += ' / delay ' + str(json.loads((path.parent / 'workload.json').read_text()).get('replyDelayMS', 0)) + 'ms'
        data.setdefault(key, []).append(json.loads(path.read_text()))
        samples = path.parent / 'load.ndjson'
        loads.setdefault(key, []).append([json.loads(line)['load'][0] for line in samples.read_text().splitlines()] if samples.exists() else [])

def summary(values):
    return dict(median=statistics.median(values), minimum=min(values), maximum=max(values))

def routes(row):
    return dict(collections.Counter(request['method'] + ' ' + re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':task', request['path'].split('?')[0].replace('/profiles/work/', '/profiles/:profile/').replace('/profiles/personal/', '/profiles/:profile/')) for request in row['requests']))

result = {}
work = {}
for ref, runs in data.items():
    sha = revisions[ref.split(' / ')[0]]
    if not runs: continue
    result[ref] = dict(sha=sha, runs=len(runs), steps={})
    result[ref]['loads'] = [summary(samples) if samples else None for samples in loads[ref]]
    work[ref] = dict(runs=len(runs), medianWorstActorGapMS=statistics.median(max(row['actorHeartbeat']['longestUnservicedMS'] for row in run) for run in runs), errorCount=sum(request['status'] >= 400 for run in runs for row in run for request in row['requests']), requests=sum(len(row['requests']) for run in runs for row in run), refreshes=sum(len(row['refreshes']) for run in runs for row in run), consumedOperations=sum(len(row['operationEvents']) for run in runs for row in run))
    for initial in runs[0]:
        rows = [next(row for row in run if row['step'] == initial['step']) for run in runs]
        result[ref]['steps'][initial['step']] = {
            **{key: summary([row[key] for row in rows]) for key in ['elapsedMS', 'compactLayoutMS', 'fullLayoutMS', 'notWritableMS', 'loadingMS', 'busyMS']},
            **{key: summary([row['mainLoop'][key] for row in rows]) for key in ['longestBusyMS', 'totalBusyMS']},
            'longestUnservicedMS': summary([row['actorHeartbeat']['longestUnservicedMS'] for row in rows]) if 'actorHeartbeat' in rows[0] else None,
            'requestCounts': [routes(row) for row in rows],
            'nonSuccessResponses': sum(request['status'] >= 400 for row in rows for request in row['requests']),
            'refreshCount': summary([len(row['refreshes']) for row in rows]),
            'operationCount': summary([len(row['operationEvents']) for row in rows]),
            'refreshTiming': [],
        }
        if all('switchToLiveMS' in row for row in rows): result[ref]['steps'][initial['step']]['switchToLiveMS'] = summary([row['switchToLiveMS'] for row in rows])
        for key in ['listEmptyMS', 'searchPendingMS', 'pickerLoadingMS', 'unusableMS']:
            if all(key in row for row in rows): result[ref]['steps'][initial['step']][key] = summary([row[key] for row in rows])
        for row in rows:
            for refresh in row['refreshes']:
                if 'endMS' not in refresh: continue
                intervals = sorted((request['started'] * 1000, request['started'] * 1000 + request['elapsedMS']) for request in row['requests'] if request.get('refresh') == str(int(refresh['id'])) and 'elapsedMS' in request)
                union = []
                for start, end in intervals:
                    if union and start <= union[-1][1]: union[-1][1] = max(end, union[-1][1])
                    else: union.append([start, end])
                wall = refresh['endMS'] - refresh['startMS']
                http = sum(end - start for start, end in union)
                result[ref]['steps'][initial['step']]['refreshTiming'].append(dict(wallMS=wall, httpUnionMS=http, mainDecodeMS=refresh['decodeMS'], offMainDecodeMS=refresh['decodeOffMainMS'], residualMS=wall-http-refresh['decodeMS']))
(evidence / 'summary.json').write_text(json.dumps(result, indent=2))
(evidence / 'work.json').write_text(json.dumps(work, indent=2))
print('| Step | ' + ' | '.join(result) + ' |')
print('| --- | ' + ' | '.join(['---'] * len(result)) + ' |')
if result:
    names = list(dict.fromkeys(name for value in result.values() for name in value['steps']))
    for name in names:
        cells = []
        for ref, value in result.items():
            step = value['steps'].get(name)
            if step is None:
                cells.append('unavailable')
                continue
            def number(key): return f"{step[key]['median']:.1f}"
            count = sum(step['requestCounts'][0].values())
            cells.append(f"{number('longestBusyMS')} / {number('totalBusyMS')}; {count}; {number('compactLayoutMS')} / {number('fullLayoutMS')}")
            if name.endswith('-unavailable'): cells[-1] = 'unavailable'
        print('| ' + name + ' | ' + ' | '.join(cells) + ' |')
