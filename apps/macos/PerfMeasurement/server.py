#!/usr/bin/env python3
import argparse
import fcntl
import hashlib
import http.client
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import http_burst
import http_thread_burst

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument('evidence', type=Path)
parser.add_argument('--runs', type=int, default=5)
parser.add_argument('--cpu-workers', type=int, default=8)
parser.add_argument('--prepare-only', action='store_true')
parser.add_argument('--ref', action='append')
parser.add_argument('--scenario', action='append')
parser.add_argument('--owner-fixture', action='store_true')
parser.add_argument('--history-operations', type=int, default=925)
parser.add_argument('--connection-timings', action='store_true')
parser.add_argument('--burst-transport', choices=['async','threaded'], default='async')
args = parser.parse_args()
if args.runs < 1 or args.cpu_workers < 1: parser.error('runs and CPU workers must be positive')
measurement_lock = open('/tmp/todo-performance.lock', 'w')
fcntl.flock(measurement_lock, fcntl.LOCK_EX)
os.umask(0o077)
evidence = args.evidence.resolve()
evidence.mkdir(parents=True, exist_ok=False)
(evidence / 'settings.json').write_text(json.dumps({**vars(args), 'evidence': str(evidence), 'cores': os.cpu_count(), 'burstTransport':'preconnected-async'}, indent=2))
(evidence / 'harness.json').write_text(json.dumps({path.name:hashlib.sha256(path.read_bytes()).hexdigest() for path in Path(__file__).parent.glob('*.py')},indent=2))
base_env = {k: v for k, v in os.environ.items() if not k.startswith(('TODO_', 'MAC_PERF_'))}
from fixture import OWNER, owner_items, finish_owner_fixture
commands = []
sys.path.insert(0, str(ROOT / '.agents/skills/verify-macos-lifecycle/scripts'))
from owned_process import OwnedCommands
owned = OwnedCommands(evidence / 'command-unsafe')

def command(argv, name, env=None, cwd=ROOT, input=None):
    with (evidence / (name + '.log')).open('w') as output:
        process = subprocess.Popen([str(v) for v in argv], cwd=cwd, env=env, stdin=subprocess.PIPE if input is not None else None, text=True, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            process.communicate(input=input, timeout=1200)
            result = subprocess.CompletedProcess(argv, process.returncode)
        finally:
            try:
                owned.stop(process)
            except BaseException:
                (evidence / ('command-unsafe-' + name)).touch()
                raise
    commands.append(dict(command=[str(v) for v in argv], exit=result.returncode, log=name + '.log'))
    (evidence / 'commands.json').write_text(json.dumps(commands, indent=2))
    result.check_returncode()
    return (evidence / (name + '.log')).read_text()

refs = {ref: subprocess.check_output(['git', 'rev-parse', ref], cwd=ROOT, text=True).strip() for ref in (args.ref or ['225b512f', 'e69230f9'])}
(evidence / 'revisions.json').write_text(json.dumps(refs, indent=2))
binaries = {}
supports_text = {}
for ref, sha in refs.items():
    directory = ROOT / '.scratch/mac-server-perf' / sha
    if not (directory / 'package.json').exists():
        directory.mkdir(parents=True, exist_ok=True)
        archive = subprocess.check_output(['git', 'archive', sha], cwd=ROOT)
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            tar.extractall(directory, filter='data')
    lock = directory / 'pnpm-lock.yaml'
    supports_text[ref] = 'filters.text' in (directory / 'packages/domain/src/task-filters.ts').read_text()
    lock_hash = hashlib.sha256(lock.read_bytes()).hexdigest()
    if not (directory / 'node_modules').exists():
        command(['pnpm', 'install', '--offline', '--frozen-lockfile', '--ignore-scripts'], 'install-' + sha[:8], cwd=directory)
    keys = ['server', 'cli', 'seed'] if ref == next(iter(refs)) else ['server']
    paths = {key: directory / '.perf-bin' / (key+'-timings' if key=='server' and args.connection_timings else key) for key in keys}
    paths['server'].parent.mkdir(exist_ok=True)
    for key, source in [('server', 'apps/server/src/main.ts'), ('cli', 'apps/cli/src/main.ts'), ('seed', 'apps/server/scripts/seed-verification.ts')]:
        if key not in paths: continue
        if not paths[key].exists():
            command(['sh', ROOT / 'scripts/disk-guard.sh'], 'disk-' + sha[:8] + key)
            original=None
            timing_file=directory/'apps/server/src/server.ts'
            if key=='server' and args.connection_timings:
                original=timing_file.read_text()
                traced=original.replace('const start = performance.now();','const start = performance.now();\n      const perfStart = Date.now();\n      const perfID = request.headers["x-mac-perf-id"];',1)
                traced=traced.replace('const end = performance.now();','const end = performance.now();\n        if (perfID) console.log(JSON.stringify({ macPerfHTTP: true, id: perfID, startMS: perfStart, endMS: Date.now(), spanMS: end-start, status: response.status }));',1)
                assert traced!=original and 'macPerfHTTP' in traced
                timing_file.write_text(traced)
                (evidence/('timing-hook-'+sha[:8]+'.json')).write_text(json.dumps(dict(originalSHA256=hashlib.sha256(original.encode()).hexdigest(),instrumentedSHA256=hashlib.sha256(traced.encode()).hexdigest()),indent=2))
            try:
                command(['bun', 'build', '--compile', directory / source, '--define', 'TODO_BUILD_ID=' + json.dumps(sha[:8]), '--outfile', paths[key]], 'compile-' + sha[:8] + key, cwd=paths[key].parent)
            finally:
                if original is not None: timing_file.write_text(original)
    assert hashlib.sha256(lock.read_bytes()).hexdigest() == lock_hash
    binaries[ref] = paths
    (evidence / ('artifacts-' + sha[:8] + '.json')).write_text(json.dumps(dict(revision=sha, lockSHA256=lock_hash, binaries={key: dict(path=str(path), sha256=hashlib.sha256(path.read_bytes()).hexdigest()) for key, path in paths.items()}), indent=2))
if args.prepare_only:
    raise SystemExit(0)

scratch = Path(tempfile.mkdtemp(prefix='todo-s01-verify-server-perf-'))
home = scratch / 'home'
home.mkdir()
env = dict(base_env, HOME=str(home), CFFIXED_USER_HOME=str(home), TODO_DB=str(scratch / 'scratch.db'), TODO_PORT='0')
processes = []

def start_server(binary, label):
    log = (evidence / (label + '-server.log')).open('w')
    process = subprocess.Popen([str(binary)], env=env, stdout=log, stderr=subprocess.STDOUT)
    processes.append(process)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        match = re.search(r'Listening on http://127.0.0.1:(\d+)', (evidence / (label + '-server.log')).read_text())
        if match:
            return process, log, int(match[1])
        if process.poll() is not None: raise RuntimeError('server exited before readiness')
        time.sleep(.02)
    raise RuntimeError('server readiness deadline')

def stop(process, log):
    process.terminate()
    try: process.wait(timeout=5)
    except subprocess.TimeoutExpired: process.kill(); process.wait()
    log.close()

def exchange(port, method, path, credential='', payload=None):
    start = time.monotonic()
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=180)
    try:
        connection.request(method, path, json.dumps(payload) if payload is not None else None, {'authorization': 'Bearer ' + credential, 'content-type': 'application/json'})
        response = connection.getresponse()
        body = response.read()
        elapsed = (time.monotonic() - start) * 1000
        decode_start = time.monotonic()
        value = json.loads(body) if body else None
        return dict(path=path, status=response.status, elapsedMS=elapsed, decodeMS=(time.monotonic()-decode_start)*1000, bytes=len(body)), value
    finally:
        connection.close()

def successful(port, method, path, credential='', payload=None):
    row, value = exchange(port, method, path, credential, payload)
    assert row['status'] < 300, (row['status'], path, value)
    return value

def validate(row, value):
    assert row['status'] == 200, row
    path = row['path'].split('?')[0]
    if path.endswith('/tasks'):
        profile='work' if '/work/' in path else 'personal'
        expected=OWNER[profile]['total'] if args.owner_fixture else 180 if profile=='work' else 80
        assert len(value) == expected
        if not args.owner_fixture: assert all(task['status']=='open' for task in value)
    elif '/views/' in path:
        assert isinstance(value['groups'], list)
        assert all(task['title'] and task['status'] == 'open' for group in value['groups'] for task in group['tasks'])
    elif path.endswith('/tags'): assert len(value) == (OWNER['work' if '/work/' in path else 'personal']['tags'] if args.owner_fixture else 70)
    elif path.endswith('/projects'): assert len(value) == (OWNER['work' if '/work/' in path else 'personal']['projects'] if args.owner_fixture else 12)
    elif path == '/profiles': assert {'work','personal'}.issubset({profile['name'] for profile in value})

rows = []
try:
    fixture_ref = next(iter(refs))
    fixture = binaries[fixture_ref]
    command([fixture['seed'], scratch], 'seed', env=env)
    server, server_log, port = start_server(fixture['server'], 'fixture')
    credential = successful(port, 'POST', '/auth/sessions', payload={'passphrase':'scratch verification passphrase'})['credential']
    for profile, count in [('work',180),('personal',80)]:
        command([fixture['cli'], 'login', '--password-stdin', '--profile', profile, '--format', 'json'], 'login-' + profile, env=env, input='scratch verification passphrase\n')
        items = [dict(external_id=f'perf-{i}', title=f'Measurement Task {i:03}', description='Ordinary description for planning and follow-up. ' * 3, priority=['P1','P2','P3','P4'][i%4], project_name=f'Project {i%12:02}', tag_names=[f'Tag {i%70:02}',f'Tag {(i+13)%70:02}'], energy=i%5+1, estimate_min=25, **({'due_at':{'kind':'date','date':'2026-11-09'}} if i%3==0 else {})) for i in range(count)]
        if args.owner_fixture: items=owner_items(profile)
        path = scratch / (profile + '.json'); path.write_text(json.dumps(items))
        command([fixture['cli'], 'import', path, '--profile', profile, '--format', 'json'], 'import-' + profile, env=env)
    shape=finish_owner_fixture(command,lambda method,path,payload=None:successful(port,method,path,credential,payload),fixture['cli'],scratch,env,'fixture') if args.owner_fixture else None
    target = successful(port, 'GET', '/profiles/work/tasks', credential)[0]
    with sqlite3.connect(scratch / 'scratch.db') as db: history = db.execute('select max(seq) from op_log').fetchone()[0]
    assert history <= args.history_operations, (history,args.history_operations)
    for i in range(args.history_operations-history):
        successful(port, 'PATCH', f"/profiles/work/tasks/{target['id']}", credential, {'from_version':target['row_version'], 'changes':{'title':f'History warmup {i}'}})
        target['row_version'] += 1
    stop(server, server_log)
    with sqlite3.connect(scratch / 'scratch.db') as db, sqlite3.connect(scratch / 'fixture.db') as backup:
        db.backup(backup)
        assert db.execute('select max(seq) from op_log').fetchone()[0] == args.history_operations
    (evidence / 'workload.json').write_text(json.dumps(dict(tasks={p:OWNER[p]['total'] for p in OWNER} if args.owner_fixture else {'work':180,'personal':80}, history=args.history_operations, ownerFixture=shape, dependencies=0, fixtureRevision=refs[fixture_ref]), indent=2))
    for iteration in range(args.runs):
        order = [(ref,workers) for ref in refs for workers in [0,args.cpu_workers]]
        if iteration%2: order.reverse()
        for ref, workers in order:
            label=f'{iteration}-{refs[ref][:8]}-cpu{workers}'
            for suffix in ['', '-wal', '-shm']:
                path=scratch / ('scratch.db'+suffix)
                if path.exists(): path.unlink()
            shutil.copyfile(scratch / 'fixture.db', scratch / 'scratch.db')
            server, server_log, port = start_server(binaries[ref]['server'], label)
            health=successful(port,'GET','/health')
            assert health['service']=='todo-server'
            assert re.fullmatch('[0-9a-f]{64}',health['contract'])
            if 'build' in health: assert health['build']==refs[ref][:8], health
            (evidence / (label + '-health.json')).write_text(json.dumps(health,indent=2))
            credentials=successful(port,'POST','/auth/sessions',payload={'passphrase':'scratch verification passphrase'})['credential']
            cpu=[]
            try:
                for _ in range(workers):
                    worker=subprocess.Popen([sys.executable,'-c','while True: pass'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    processes.append(worker);cpu.append(worker)
                if cpu: time.sleep(1)
                paths=[f'/profiles/{p}/{tail}' for p in ['work','personal'] for tail in ['tasks','views/today','views/overdue','views/scheduled','views/inbox','tags','projects']]+['/profiles']
                for path in paths: validate(*exchange(port,'GET',path,credentials))
                scenarios=[('serial', paths * 20, False)]
                for profile in ['work','personal']:
                    mac=[f'/profiles/{profile}/{tail}' for tail in ['tasks','views/today','views/overdue','views/scheduled','views/inbox','tags','projects']]+['/profiles']
                    scenarios.extend([(f'mac-{profile}',mac,True),(f'list20-{profile}',[f'/profiles/{profile}/tasks']*20,True),(f'list60-{profile}',[f'/profiles/{profile}/tasks']*60,True)])
                    empty_path=f'/profiles/{profile}/tasks' + ('?text=' if supports_text[ref] else '')
                    scenarios.extend([(f'empty20-{profile}',[empty_path]*20,True),(f'empty60-{profile}',[empty_path]*60,True)])
                    mixed=mac + [empty_path]
                    scenarios.append((f'mixed30-{profile}',mixed*30,True))
                    electron=mac + ([empty_path] if supports_text[ref] else [])
                    scenarios.append((f'electron30-{profile}',electron*30,True))
                for scenario, paths, parallel in scenarios:
                    if args.scenario and scenario not in args.scenario: continue
                    load_start=os.getloadavg()
                    begin=time.monotonic()
                    def read(path):
                        began=time.monotonic()
                        row=dict(path=path,status=0,bytes=0,decodeMS=0)
                        try:
                            row,value=exchange(port,'GET',path,credentials)
                            validate(row,value)
                        except Exception as error:
                            row.update(error=repr(error),elapsedMS=(time.monotonic()-began)*1000)
                        return row
                    if parallel:
                        generator=http_burst if args.burst_transport=='async' else http_thread_burst
                        requests,wall,setup=generator.run(port,paths,credentials,validate)
                    else:
                        requests=[read(path) for path in paths]
                        wall=(time.monotonic()-begin)*1000
                        setup=0
                    errors=sum('error' in r or r['status']>=400 for r in requests)
                    rows.append(dict(iteration=iteration,revision=refs[ref],ref=ref,cpuWorkers=workers,scenario=scenario,emptyTextSupported=supports_text[ref],wallMS=wall,connectionSetupMS=setup,loadStart=load_start,loadEnd=os.getloadavg(),requests=requests,errors=errors))
                    (evidence / 'measurements.json').write_text(json.dumps(rows,indent=2))
                    if errors: raise RuntimeError(f'{label} {scenario}: {errors} failed requests; retained measurements')
            finally:
                for worker in cpu: stop(worker, open(os.devnull,'w'))
                stop(server,server_log)
finally:
    for process in processes:
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill();process.wait()
    if not list(evidence.glob('command-unsafe-*')): shutil.rmtree(scratch)
    (evidence / 'cleanup.json').write_text(json.dumps(dict(scratchRemoved=not scratch.exists(),processes=[dict(pid=p.pid,exit=p.returncode) for p in processes]),indent=2))
    if sys.exc_info()[0] is not None:
        failure=dict(error=repr(sys.exc_info()[1]),errors=max(1,sum(row['errors'] for row in rows)),requests=sum(len(row['requests']) for row in rows),bursts=len(rows))
        (evidence / 'failure.json').write_text(json.dumps(failure,indent=2))
        print(json.dumps(failure))

def quantile(values,p):
    values=sorted(values)
    return values[max(0,math.ceil(p*len(values))-1)]
summary=[]
for ref in refs:
    for workers in [0,args.cpu_workers]:
        selected=[row for row in rows if row['ref']==ref and row['cpuWorkers']==workers]
        for scenario in dict.fromkeys(row['scenario'] for row in selected):
            runs=[row for row in selected if row['scenario']==scenario]
            routes=sorted({request['path'] for row in runs for request in row['requests']})
            for path in routes:
                requests=[request for row in runs for request in row['requests'] if request['path']==path]
                elapsed=[request['elapsedMS'] for request in requests]
                burst_p99=[quantile([request['elapsedMS'] for request in row['requests'] if request['path']==path],.99) for row in runs]
                summary.append(dict(ref=ref,cpuWorkers=workers,scenario=scenario,path=path,runs=len(runs),requests=len(requests),errors=sum(request['status']>=400 for request in requests),p50MS=quantile(elapsed,.5),p90MS=quantile(elapsed,.9),p99MS=quantile(elapsed,.99),maxMS=max(elapsed),burstP99MS=burst_p99,medianBurstP99MS=quantile(burst_p99,.5),burstWallMS=[row['wallMS'] for row in runs],loadStart=[row['loadStart'][0] for row in runs],bytes=sum(request['bytes'] for request in requests),clientDecodeMS=sum(request['decodeMS'] for request in requests)))
(evidence / 'summary.json').write_text(json.dumps(summary,indent=2))
work=dict(errors=sum(row['errors'] for row in rows),requests=sum(len(row['requests']) for row in rows),bytes=sum(request['bytes'] for row in rows for request in row['requests']),bursts=len(rows),primary=[row for row in summary if row['scenario'] in ['list60-personal','empty60-personal'] and row['cpuWorkers']==args.cpu_workers])
(evidence / 'work.json').write_text(json.dumps(work,indent=2))
print(json.dumps(work,indent=2))
