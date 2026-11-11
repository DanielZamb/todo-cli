#!/usr/bin/env python3
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = Path(sys.argv[1]).resolve()
EVIDENCE.mkdir(parents=True, exist_ok=False)
os.umask(0o077)
sys.path.insert(0, str(ROOT / '.agents/skills/verify-macos-lifecycle/scripts'))
from owned_process import OwnedCommands
sys.path.insert(0, str(ROOT / 'apps/macos/PerfMeasurement'))
from fixture import owner_items, witness
owned = OwnedCommands(EVIDENCE / 'command-unsafe')
commands = []
base = {key: value for key, value in os.environ.items() if not key.startswith(('TODO_', 'MAC_PERF_'))}

def run(argv, name, environment=base, input=None):
    result = subprocess.run([str(value) for value in argv], cwd=ROOT, env=environment, input=input, text=True, capture_output=True, timeout=1200)
    (EVIDENCE / (name + '.log')).write_text(result.stdout + result.stderr)
    commands.append(dict(command=[str(value) for value in argv], exit=result.returncode, log=name + '.log'))
    (EVIDENCE / 'commands.json').write_text(json.dumps(commands, indent=2))
    assert result.returncode == 0, f'{name} exited {result.returncode}'
    return result.stdout

files = run(['git', 'ls-files', '--cached', '--others', '--exclude-standard', 'apps/cli', 'apps/server', 'packages', 'pnpm-lock.yaml'], 'binary-inputs').splitlines()
digest = hashlib.sha256()
for name in sorted(set(files)):
    digest.update(name.encode()); digest.update((ROOT / name).read_bytes())
source_hash = digest.hexdigest()
bin_dir = ROOT / '.scratch/client-diagnostics-bin' / source_hash[:12]
bin_dir.mkdir(parents=True, exist_ok=True)
for entry, name in [('apps/cli/src/main.ts', 'todo'), ('apps/server/src/main.ts', 'todo-server'), ('apps/server/scripts/seed-verification.ts', 'seed')]:
    if not (bin_dir / name).exists(): run(['bun', 'build', '--compile', entry, '--outfile', bin_dir / name], 'build-' + name)
(EVIDENCE / 'binaries.json').write_text(json.dumps(dict(source_hash=source_hash, sha256={name: hashlib.sha256((bin_dir / name).read_bytes()).hexdigest() for name in ['todo', 'todo-server', 'seed']}), indent=2))
swift_files = sorted([*ROOT.glob('apps/macos/Sources/*.swift'), *ROOT.glob('apps/macos/API/Sources/TodoAPI/*.swift'), ROOT / 'apps/macos/StateTests/ClientDiagnosticsTests.swift', ROOT / 'apps/macos/Package.swift', Path(__file__).resolve()])
(EVIDENCE / 'sources.json').write_text(json.dumps({str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in swift_files}, indent=2))
scratch = Path(tempfile.mkdtemp(prefix='todo-s01-verify-client-diagnostics-'))
home = scratch / 'home'; home.mkdir()
environment = dict(base, HOME=str(home), CFFIXED_USER_HOME=str(home), TODO_DB=str(scratch / 'scratch.db'), TODO_PORT='0')
server = None
result = dict(result='FAIL', errors=1)
try:
    run([bin_dir / 'seed', scratch], 'seed', environment)
    log = (EVIDENCE / 'server.log').open('w')
    server = subprocess.Popen([str(bin_dir / 'todo-server')], env=environment, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    port = None
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        assert server.poll() is None, 'owned server stopped'
        match = re.search(r'Listening on http://127.0.0.1:(\d+)', (EVIDENCE / 'server.log').read_text())
        if match: port = int(match[1]); break
        time.sleep(.05)
    assert port, 'owned server readiness deadline'
    def request(method, path, payload=None, credential='', expected=200):
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=30)
        try:
            connection.request(method, path, json.dumps(payload) if payload is not None else None, {'content-type': 'application/json', 'authorization': 'Bearer ' + credential})
            response = connection.getresponse(); data = response.read()
            assert response.status == expected, (method, path, response.status)
            return json.loads(data) if data else None
        finally: connection.close()
    health = request('GET', '/health')
    assert health['service'] == 'todo-server'
    contract_source = (ROOT / 'apps/macos/API/Sources/TodoAPI/ContractIdentity.swift').read_text()
    assert health['contract'] in contract_source, 'scratch server contract differs from Swift client'
    owner = request('POST', '/auth/sessions', {'passphrase': 'scratch verification passphrase'})['credential']
    token = request('POST', '/auth/tokens', {'name': 'client diagnostics scratch', 'scope': 'read-only', 'profile': 'work'}, owner, 200)['credential']
    request('GET', '/diagnostics', credential=token, expected=403)
    environment['TODO_SERVER_URL'] = f'http://127.0.0.1:{port}'
    run([bin_dir / 'todo', 'login', '--password-stdin', '--profile', 'work', '--format', 'json'], 'login', environment, 'scratch verification passphrase\n')
    fixture = scratch / 'items.json'; fixture.write_text(json.dumps(owner_items('work')))
    run([bin_dir / 'todo', 'import', fixture, '--profile', 'work', '--format', 'json'], 'import', environment)
    tasks = request('GET', '/profiles/work/tasks', credential=owner)
    shape = witness(tasks); assert shape['total'] == 178 and shape['descriptionChars'] == 222312 and shape['attachments'] == 108
    (EVIDENCE / 'fixture.json').write_text(json.dumps(shape, indent=2))
    environment.update(TODO_CLIENT_DIAGNOSTICS_SERVER=f'http://127.0.0.1:{port}', TODO_CLIENT_DIAGNOSTICS_TOKEN=token, TODO_CLIENT_DIAGNOSTICS_EVIDENCE=str(EVIDENCE), TODO_CLIENT_DIAGNOSTICS_JOURNAL=str(scratch / 'journal'))
    (EVIDENCE / 'host.json').write_text(json.dumps(dict(load=os.getloadavg(), cores=os.cpu_count(), at=time.time())))
    run([ROOT / 'scripts/swift-slot.sh', 'swift', 'test', '--configuration', 'release', '--no-parallel', '--disable-automatic-resolution', '--jobs', '2', '--package-path', 'apps/macos', '--filter', 'ClientDiagnosticsTests|ClientDiagnosticsLiveTests|ClientDiagnosticsPanelTests'], 'swift', environment)
    artifact = ROOT / 'apps/macos/.build/release/TodoStateProofPackageTests.xctest/Contents/MacOS/TodoStateProofPackageTests'
    (EVIDENCE / 'swift-artifact.json').write_text(json.dumps(dict(sha256=hashlib.sha256(artifact.read_bytes()).hexdigest(), configuration='release'), indent=2))
    live = json.loads((EVIDENCE / 'live.json').read_text())
    assert live['errors'] == 0 and live['refreshes'] == 30 and live['enabled_requests'] == 120
    assert not list((scratch / 'journal').iterdir()), 'sign-out state did not clear journal'
    result = dict(result='PASS', errors=0, refreshes=30, requests_recorded=120, tasks=178, keychain_called=False, app_launched=False, signed=False, pushed=False, native_input_proven=False)
finally:
    if server is not None: owned.stop(server)
    shutil.rmtree(scratch)
    result['scratch_removed'] = not scratch.exists()
    result['owned_server_stopped'] = server is None or server.poll() is not None
    (EVIDENCE / 'result.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
