#!/usr/bin/env python3
import argparse
import fcntl
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from fixture import OWNER, owner_items, finish_owner_fixture

ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument('evidence',type=Path)
parser.add_argument('--runs',type=int,default=1)
parser.add_argument('--refreshes',type=int,default=300)
parser.add_argument('--cpu-workers',type=int,default=8)
parser.add_argument('--nofile',type=int,default=256)
parser.add_argument('--client-ref',action='append')
parser.add_argument('--server-ref',action='append')
parser.add_argument('--policy',action='append',choices=['fresh','reused'])
parser.add_argument('--load',action='append',choices=['0','busy'])
parser.add_argument('--native-session',action='store_true')
parser.add_argument('--limit-trace',type=Path)
parser.add_argument('--row-selection',action='store_true')
parser.add_argument('--visible-row',action='store_true')
parser.add_argument('--row-runner',action='store_true')
parser.add_argument('--variant',default='production')
args=parser.parse_args()
os.umask(0o077)
lock=open('/tmp/todo-performance.lock','w');fcntl.flock(lock,fcntl.LOCK_EX)
evidence=args.evidence.resolve();evidence.mkdir(parents=True,exist_ok=False)
(evidence/'settings.json').write_text(json.dumps({**vars(args),'evidence':str(evidence),'limit_trace':str(args.limit_trace) if args.limit_trace else None},indent=2))
refs={ref:subprocess.check_output(['git','rev-parse',ref],cwd=ROOT,text=True).strip() for ref in set((args.client_ref or ['225b512f','e69230f9'])+(args.server_ref or ['225b512f','e69230f9']))}
(evidence/'revisions.json').write_text(json.dumps(refs,indent=2))
base_env={k:v for k,v in os.environ.items() if not k.startswith(('TODO_','MAC_PERF_'))}
sys.path.insert(0,str(ROOT/'.agents/skills/verify-macos-lifecycle/scripts'))
from owned_process import OwnedCommands
owned=OwnedCommands(evidence/'command-unsafe')
commands=[]
processes=[]

def command(argv,name,env=None,input=None,allow_failure=False):
    with (evidence/(name+'.log')).open('w') as log:
        process=subprocess.Popen([str(x) for x in argv],cwd=ROOT,env=env,stdin=subprocess.PIPE if input is not None else None,stdout=log,stderr=subprocess.STDOUT,text=True,start_new_session=True)
        entry=dict(command=[str(x) for x in argv],pid=process.pid,log=name+'.log',exit=None)
        commands.append(entry)
        try: process.communicate(input=input,timeout=1200)
        finally:
            try:owned.stop(process)
            except BaseException:
                (evidence/('command-unsafe-'+name)).touch();raise
            entry['exit']=process.returncode
            (evidence/'commands.json').write_text(json.dumps(commands,indent=2))
        if process.returncode and not allow_failure: raise RuntimeError(f'{name} exited {process.returncode}')
    return (evidence/(name+'.log')).read_text()

def stop(process,log):
    process.terminate()
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:process.kill();process.wait()
    log.close()

def start(binary,label,env):
    log=(evidence/(label+'-server.log')).open('w')
    process=subprocess.Popen([str(binary)],env=dict(env,TODO_PORT='0'),stdout=log,stderr=subprocess.STDOUT)
    processes.append(process)
    deadline=time.monotonic()+60
    while time.monotonic()<deadline:
        match=re.search(r'Listening on http://127.0.0.1:(\d+)',(evidence/(label+'-server.log')).read_text())
        if match:return process,log,int(match[1])
        if process.poll() is not None:raise RuntimeError('server exited before ready')
        time.sleep(.02)
    raise RuntimeError('server readiness timeout')

def request(port,method,path,credential='',payload=None):
    connection=http.client.HTTPConnection('127.0.0.1',port,timeout=60)
    try:
        connection.request(method,path,json.dumps(payload) if payload is not None else None,{'authorization':'Bearer '+credential,'content-type':'application/json'})
        response=connection.getresponse();body=response.read()
        assert response.status<300,(response.status,path,body)
        return json.loads(body) if body else None
    finally:connection.close()

old=refs.get('225b512f') or subprocess.check_output(['git','rev-parse','225b512f'],cwd=ROOT,text=True).strip()
old_bin=ROOT/'.scratch/mac-server-perf'/old/'.perf-bin'
assert all((old_bin/key).is_file() for key in ['server','cli','seed'])
scratch=Path(tempfile.mkdtemp(prefix='todo-s01-verify-connections-'))
home=scratch/'home';home.mkdir()
env=dict(base_env,HOME=str(home),CFFIXED_USER_HOME=str(home),TODO_DB=str(scratch/'scratch.db'))
results=[]
try:
    command([old_bin/'seed',scratch],'seed',env)
    server,server_log,port=start(old_bin/'server','fixture',env)
    credential=request(port,'POST','/auth/sessions',payload={'passphrase':'scratch verification passphrase'})['credential']
    for profile in OWNER:
        command([old_bin/'cli','login','--password-stdin','--profile',profile,'--format','json'],'login-'+profile,env,input='scratch verification passphrase\n')
        path=scratch/(profile+'.json');path.write_text(json.dumps(owner_items(profile)))
        command([old_bin/'cli','import',path,'--profile',profile,'--format','json'],'import-'+profile,env)
    shape=finish_owner_fixture(command,lambda method,path,payload=None:request(port,method,path,credential,payload),old_bin/'cli',scratch,env,'fixture')
    target=request(port,'GET','/profiles/work/tasks',credential)[0]
    with sqlite3.connect(scratch/'scratch.db') as db:seq=db.execute('select max(seq) from op_log').fetchone()[0]
    assert seq<=983,seq
    for index in range(983-seq):
        request(port,'PATCH',f"/profiles/work/tasks/{target['id']}",credential,{'from_version':target['row_version'],'changes':{'title':f'History warmup {index}'}})
        target['row_version']+=1
    stop(server,server_log)
    with sqlite3.connect(scratch/'scratch.db') as db,sqlite3.connect(scratch/'fixture.db') as target_db:db.backup(target_db)
    (evidence/'fixture.json').write_text(json.dumps(shape,indent=2))
    matrix=[(client,backend,policy,workers) for client in (args.client_ref or ['225b512f','e69230f9']) for backend in (args.server_ref or ['225b512f','e69230f9']) for policy in (args.policy or ['fresh','reused']) for workers in ([0,args.cpu_workers] if not args.load else [0 if value=='0' else args.cpu_workers for value in args.load])]
    for iteration in range(args.runs):
        order=list(matrix)
        if iteration%2:order.reverse()
        for client,backend,policy,workers in order:
            label=f'{iteration}-{refs[client][:8]}-{refs[backend][:8]}-{policy}-cpu{workers}'
            folder=evidence/label;folder.mkdir()
            for suffix in ['','-wal','-shm']:(scratch/('scratch.db'+suffix)).unlink(missing_ok=True)
            shutil.copyfile(scratch/'fixture.db',scratch/'scratch.db')
            binary=ROOT/'.scratch/mac-server-perf'/refs[backend]/'.perf-bin/server-timings'
            assert binary.is_file(),binary
            server,server_log,port=start(binary,label,env)
            health=request(port,'GET','/health')
            assert health['build']==refs[backend][:8],health
            credential=request(port,'POST','/auth/sessions',payload={'passphrase':'scratch verification passphrase'})['credential']
            cpu=[]
            try:
                for _ in range(workers):
                    process=subprocess.Popen([sys.executable,'-c','while True: pass'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                    cpu.append(process);processes.append(process)
                if cpu:time.sleep(1)
                package=ROOT/'.scratch/mac-perf'/refs[client]/'apps/macos'
                assert (package/'API/Sources/TodoAPI/PerfConnectionTrace.swift').is_file(),'Prepare the connection target first'
                (folder/'host.json').write_text(json.dumps(dict(load=os.getloadavg(),nofile=args.nofile),indent=2))
                argv=['/bin/sh','-c','ulimit -S -n "$1"; shift; exec "$@"','sh',str(args.nofile),ROOT/'scripts/swift-slot.sh','swift','test','--configuration','release','--package-path',package,'--disable-automatic-resolution','--skip-build','--filter','MacConnectionMeasurement']
                if args.row_runner:
                    argv=[package/'RowProbe.app/Contents/MacOS/RowProbeRunner']
                    (folder/'source-hashes.json').write_text(json.dumps({str(p.relative_to(package)):__import__('hashlib').sha256(p.read_bytes()).hexdigest() for p in list((package/'Sources').glob('*.swift'))+list((package/'RowRunner').glob('*.swift'))},indent=2))
                if args.limit_trace:
                    argv=[subprocess.check_output(['xcrun','--find','swift'],text=True).strip(),*argv[7:]]
                command(argv,'session-'+label,dict(env,**({'DYLD_INSERT_LIBRARIES':str(args.limit_trace.resolve())} if args.limit_trace else {}),MAC_PERF_SERVER=f'http://127.0.0.1:{port}',MAC_PERF_CREDENTIAL=credential,MAC_PERF_OUTPUT=str(folder/'measurement.json'),MAC_PERF_REFRESHES=str(args.refreshes),MAC_PERF_CONNECTION_POLICY=policy,MAC_PERF_NOFILE=str(args.nofile),MAC_PERF_ROW_SELECTION='1' if args.row_selection or args.visible_row else '0',MAC_PERF_VISIBLE_ROW='1' if args.visible_row else '0',MAC_PERF_VARIANT=args.variant,MAC_PERF_NATIVE_SESSION='1' if args.native_session else '0'),allow_failure=True)
                client_exit=commands[-1]['exit']
                native=json.loads((folder/'measurement.json').read_text())
                spans={}
                for line in (evidence/(label+'-server.log')).read_text().splitlines():
                    if line.startswith('{"macPerfHTTP":'):
                        row=json.loads(line);spans[row['id']]=row
                for row in native['requests']:
                    span=spans.get(row['id'])
                    if span:row['server']=span
                native.update(client=refs[client],server=refs[backend],policy=policy,workers=workers,matchedHandlers=sum('server' in row for row in native['requests']))
                expected_matches=sum(row.get('status')==200 for row in native['requests'])
                assert native['matchedHandlers']>=expected_matches,(native['matchedHandlers'],expected_matches)
                (folder/'joined.json').write_text(json.dumps(native,indent=2))
                results.append(dict(case=label,exit=client_exit,requests=len(native['requests']),checkpoints=native['checkpoints'],loadEnd=os.getloadavg()))
                (evidence/'work.json').write_text(json.dumps(dict(errors=sum(case['exit']!=0 for case in results),cases=results),indent=2))
            finally:
                for process in cpu:
                    process.terminate();process.wait(timeout=5)
                stop(server,server_log)
finally:
    for process in processes:
        if process.poll() is None:
            process.terminate()
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.kill();process.wait()
    unsafe=list(evidence.glob('command-unsafe-*'))
    if not unsafe:shutil.rmtree(scratch)
    (evidence/'cleanup.json').write_text(json.dumps(dict(scratchRemoved=not scratch.exists(),retainedScratch=str(scratch) if unsafe else None,processes=[dict(pid=p.pid,exit=p.returncode) for p in processes]),indent=2))
    if sys.exc_info()[0] is not None:
        failure=dict(errors=1,error=repr(sys.exc_info()[1]),cases=results)
        (evidence/'failure.json').write_text(json.dumps(failure,indent=2));print(json.dumps(failure))
print(json.dumps(dict(errors=sum(case['exit']!=0 for case in results),cases=len(results),requests=sum(case['requests'] for case in results))))
