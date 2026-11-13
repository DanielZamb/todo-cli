#!/usr/bin/env python3
import hashlib
import http.client
import http.server
import threading
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
subscribers_only = '--subscribers-only' in sys.argv[2:]
restart_only = '--restart-only' in sys.argv[2:]
retirement_only = '--retirement-only' in sys.argv[2:]
retirement_stress = '--retirement-stress' in sys.argv[2:]
sockets_only = '--sockets-only' in sys.argv[2:]
connections_only = '--connections-only' in sys.argv[2:] or sockets_only or restart_only or retirement_only or retirement_stress
stream_only = '--stream-only' in sys.argv[2:] or subscribers_only
configuration = 'debug' if '--debug' in sys.argv[2:] else 'release'
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
    result = subprocess.run([str(value) for value in argv], cwd=ROOT, env=environment, input=input, text=True, capture_output=True, timeout=1200) if input is not None else owned.run([str(value) for value in argv], environment, timeout=3600 if retirement_stress else 1200)
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
swift_files = sorted([*ROOT.glob('apps/macos/Sources/*.swift'), *ROOT.glob('apps/macos/API/Sources/TodoAPI/*.swift'), *ROOT.glob('apps/macos/StateTests/*.swift'), ROOT / 'apps/macos/Package.swift', Path(__file__).resolve()])
(EVIDENCE / 'sources.json').write_text(json.dumps({str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in swift_files}, indent=2))
scratch = Path(tempfile.mkdtemp(prefix='todo-s01-verify-client-diagnostics-'))
home = scratch / 'home'; home.mkdir()
environment = dict(base, HOME=str(home), CFFIXED_USER_HOME=str(home), TODO_DB=str(scratch / 'scratch.db'), TODO_PORT='0')
server = None
proxy = None
restart_proxy = None
restart_lock = threading.Lock()
closing = threading.Event()
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
    # O3's stop/switch sequence switches to a Profile of its own (the subscribers test deletes personal); it sorts after work, so a deleted Profile still falls back to work.
    if subscribers_only: run([bin_dir / 'todo', 'init', '--profile', 'zo3switch', '--credential-profile', 'work', '--format', 'json'], 'init-zo3switch', environment)
    tasks = request('GET', '/profiles/work/tasks', credential=owner)
    shape = witness(tasks); assert shape['total'] == 178 and shape['descriptionChars'] == 222312 and shape['attachments'] == 108
    (EVIDENCE / 'fixture.json').write_text(json.dumps(shape, indent=2))
    environment.update(TODO_CLIENT_DIAGNOSTICS_SERVER=f'http://127.0.0.1:{port}', TODO_CLIENT_DIAGNOSTICS_TOKEN=token, TODO_CLIENT_DIAGNOSTICS_EVIDENCE=str(EVIDENCE), TODO_CLIENT_DIAGNOSTICS_JOURNAL=str(scratch / 'journal'), TODO_MAC_NATIVE_HOOK_EVIDENCE=str(EVIDENCE / 'native-hook.json'))
    if stream_only or connections_only:
        if sockets_only: environment['TODO_MAC_SOCKET_PROBE'] = '1'
        if subscribers_only: environment['TODO_IDLE_SUBSCRIBERS'] = '1'
        diagnostics = request('GET', '/diagnostics', credential=owner)
        environment['TODO_IDLE_START_CURSOR'] = str(max(row['seq'] for row in diagnostics['operations']['recent']))
        environment['TODO_IDLE_START_GENERATION'] = diagnostics['storage']['restore_generation']
        if '--long-idle' in sys.argv[2:]:
            environment['TODO_IDLE_LONG_MS'] = '300000'
        class DelayedHealth(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_GET(self):
                if self.path == '/counts/health':
                    count = (EVIDENCE / 'server.log').read_text().count('"http.url": "/health",')
                    data = json.dumps(dict(count=count)).encode()
                    self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers()
                    self.wfile.write(data)
                    return
                time.sleep(.5)
                connection = http.client.HTTPConnection('127.0.0.1', port, timeout=10)
                try:
                    connection.request('GET', '/health')
                    response = connection.getresponse(); data = response.read()
                    self.send_response(response.status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers()
                    try: self.wfile.write(data)
                    except (BrokenPipeError, ConnectionResetError): pass
                finally: connection.close()
        proxy = http.server.ThreadingHTTPServer(('127.0.0.1', 0), DelayedHealth)
        threading.Thread(target=proxy.serve_forever, daemon=True).start()
        environment.update(TODO_IDLE_NATIVE_SERVER=f'http://127.0.0.1:{port}', TODO_IDLE_DELAYED_SERVER=f'http://127.0.0.1:{proxy.server_port}')
    if restart_only:
        restart_receipts = []
        class RestartServer(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_POST(self):
                global server
                status = 200
                try:
                    with restart_lock:
                        assert not closing.is_set(), 'helper is closing'
                        old = server.pid; owned.stop(server)
                        assert not closing.is_set(), 'helper closed during restart'
                        offset = (EVIDENCE / 'server.log').stat().st_size
                        server = subprocess.Popen([str(bin_dir / 'todo-server')], env=dict(environment, TODO_PORT=str(port)), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                        deadline = time.monotonic() + 30
                        while time.monotonic() < deadline:
                            assert server.poll() is None, 'restarted owned server exited'
                            text = (EVIDENCE / 'server.log').read_text()[offset:]
                            if f'Listening on http://127.0.0.1:{port}' in text: break
                            time.sleep(.02)
                        else: raise AssertionError('restart readiness deadline')
                        assert request('GET', '/health')['contract'] == health['contract']
                        restart_receipts.append(dict(before=old, after=server.pid, ready=True))
                        (EVIDENCE / 'server-restarts.json').write_text(json.dumps(restart_receipts, indent=2))
                except Exception:
                    status = 500
                self.send_response(status); self.send_header('Content-Length', '0'); self.end_headers()
        restart_proxy = http.server.ThreadingHTTPServer(('127.0.0.1', 0), RestartServer)
        restart_proxy.daemon_threads = True
        threading.Thread(target=restart_proxy.serve_forever, daemon=True).start()
        environment['TODO_MAC_RESTART_CONTROL'] = f'http://127.0.0.1:{restart_proxy.server_port}/restart'
    (EVIDENCE / 'host.json').write_text(json.dumps(dict(load=os.getloadavg(), cores=os.cpu_count(), at=time.time())))
    if retirement_only: environment['TODO_MAC_RETIREMENT_RACE'] = '1'
    if retirement_stress:
        environment['TODO_MAC_RETIREMENT_STRESS'] = '1'
        environment['TODO_MAC_RETIREMENT_COUNTER'] = f'http://127.0.0.1:{proxy.server_port}/counts/health'
    selected = 'MacRetirementStressTests' if retirement_stress else 'productionRefreshCredentialReplacementRaceDoesNotAbort' if retirement_only else 'reusedProductionPoolSurvivesRestartBeforeTheFirstReadAndEachWrite' if restart_only else 'productionModelHoldsAtMostSixteenSocketsAfterThreeHundredRefreshes' if sockets_only else 'MacConnectionReuseGuard' if connections_only else 'productionModelCancelsIdleSubscribersAtEveryLifecycleBoundary|stoppingTheStreamEndsItsServerSubscriptionPromptly' if subscribers_only else 'StreamIdleTests|StreamIdleTransportTests' if stream_only else 'ClientDiagnosticsTests|ClientDiagnosticsLiveTests|ClientDiagnosticsPanelTests|ClientNativeSelectionHookTests'
    # No test run links or calls the Keychain: state_package builds the mirrored package (in-memory
    # vault), checks its products and only then runs them (coordinator ruling, 2026-11-13).
    keychain_receipt = EVIDENCE / 'keychain-guard.json'
    run([ROOT / 'scripts/swift-slot.sh', 'python3', ROOT / 'apps/macos/scripts/state_package.py', 'swift', 'test', '--configuration', configuration, '--no-parallel', '--disable-automatic-resolution', '--jobs', '2', '--package-path', 'apps/macos', '--scratch-path', ROOT / 'apps/macos/.build', '--filter', selected], 'swift', dict(environment, STATE_PACKAGE_RECEIPT=str(keychain_receipt)))
    keychain_linked = json.loads(keychain_receipt.read_text())['keychainLinked']
    artifact = ROOT / f'apps/macos/.build/{configuration}/TodoStateProofPackageTests.xctest/Contents/MacOS/TodoStateProofPackageTests'
    (EVIDENCE / 'swift-artifact.json').write_text(json.dumps(dict(sha256=hashlib.sha256(artifact.read_bytes()).hexdigest(), configuration=configuration), indent=2))
    if connections_only:
        if retirement_stress:
            proof = json.loads((EVIDENCE / 'retirement-stress.json').read_text())
            late = json.loads((EVIDENCE / 'retired-client.json').read_text())
            assert proof['iterations'] == 3000 and proof['writes_started'] == 3000 and proof['polls_started'] == 3000
            assert proof['refreshes_started'] >= 3000 and proof['retired_calls_cancelled'] == 3000
            assert proof['tasks'] == 178 and proof['canonical_rows_match'] and proof['final_writable']
            assert proof['retired_server_health_delta'] == 0
            assert proof['iterations_with_unfinished_requests'] == 3000 and proof['unexpected_scope_iterations'] == 0
            assert late['rejected_retired_requests'] == 20 and late['retired_server_health_delta'] == 0
            assert late['new_scope_server_health_delta'] == 1 and late['new_scope_recorded_requests'] == 1
        elif retirement_only:
            proof = json.loads((EVIDENCE / 'retirement-model-race.json').read_text())
            assert proof['iterations'] == 200 and proof['tasks'] == 178 and proof['final_writable'] and not proof['crashed']
        elif restart_only:
            proof = json.loads((EVIDENCE / 'restart-transport.json').read_text())
            assert proof['restarts'] == 3 and proof['first_get_succeeded']
            assert proof['complete_history_delta'] == 1 and proof['complete_reported_success']
            assert proof['new_tasks'] == 1 and proof['created_history_records'] == 1
        elif sockets_only:
            proof = json.loads((EVIDENCE / 'sockets-after-300.json').read_text())
            assert proof['refreshes'] == 300 and proof['requests'] == 2400 and proof['sockets'] <= 16
        else:
            proof = json.loads((EVIDENCE / 'connections-after-two.json').read_text())
            assert proof['refreshes'] == 2 and proof['requests'] == 16 and proof['reused_connections'] >= 8
            assert proof['credential_scope_requests'] == 8 and proof['credential_scope_new_connections'] >= 1
            assert json.loads((EVIDENCE / 'credential-request-cancel.json').read_text())['cancelled']
        result = dict(result='PASS', errors=0, production_transport=proof, keychain_called=keychain_linked, keychain_guard='keychain-guard.json', app_launched=False, signed=False, pushed=False)
    elif stream_only:
        native = json.loads((EVIDENCE / ('stream-subscribers.json' if subscribers_only else 'stream-native.json')).read_text())
        if subscribers_only:
            assert native['counts'] == [0, 1, 1, 1, 1, 1, 1, 0]
            # O3: open server subscriptions 400 ms after stop, reconnect, Profile switch and final stop.
            for setup in ('production-session', 'client-factory'):
                stop = json.loads((EVIDENCE / f'stream-stop-subscribers-{setup}.json').read_text())
                assert stop['counts'] == [0, 1, 1, 0] and stop['before'] == 0, (setup, stop['counts'], stop['before'])
                assert stop['resumed_from'] == stop['stopped_at'] and stop['event_written_while_stopped_delivered'], setup
                native[f'stop_{setup}'] = stop
        else: assert native['stream_survived_idle'] and native['ordinary_timeout_observed'] and native['operations_received'] == 1
        result = dict(result='PASS', errors=0, native=native, keychain_called=keychain_linked, keychain_guard='keychain-guard.json', app_launched=False, signed=False, pushed=False)
    else:
        live = json.loads((EVIDENCE / 'live.json').read_text())
        assert live['errors'] == 0 and live['refreshes'] == 30 and live['enabled_requests'] == 120
        assert not list((scratch / 'journal').iterdir()), 'sign-out state did not clear journal'
        result = dict(result='PASS', errors=0, refreshes=30, requests_recorded=120, tasks=178, keychain_called=keychain_linked, keychain_guard='keychain-guard.json', app_launched=False, signed=False, pushed=False, native_input_proven=False)

finally:
    closing.set()
    if restart_proxy is not None: restart_proxy.shutdown(); restart_proxy.server_close()
    if proxy is not None: proxy.shutdown(); proxy.server_close()
    with restart_lock:
        if server is not None: owned.stop(server)
    shutil.rmtree(scratch)
    result['scratch_removed'] = not scratch.exists()
    result['owned_server_stopped'] = server is None or server.poll() is not None
    (EVIDENCE / 'result.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
