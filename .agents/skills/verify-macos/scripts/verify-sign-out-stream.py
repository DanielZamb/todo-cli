#!/usr/bin/env python3
"""Sign-out transitions through the production Mac model on a compiled scratch server.

Usage: verify-sign-out-stream.py <fresh absolute evidence dir> [source commit]

Copies the model sources at the commit into a scratch package with the in-memory
SessionVault fixture (no Keychain), starts the compiled scratch server and a
fault proxy that only touches DELETE /auth/session, and runs
SignOutStreamTests. No Todo.app, signing, Keychain or owner data is used.
"""
import hashlib
import http.client
import http.server
import json
import os
from pathlib import Path
import re
import select
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time

root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
evidence = Path(sys.argv[1])
source = subprocess.check_output(['git', 'rev-parse', sys.argv[2] if len(sys.argv) > 2 else 'HEAD'], cwd=root, text=True).strip()
if not evidence.is_absolute() or evidence.exists():
    raise SystemExit('Pass a fresh absolute evidence directory')
subprocess.run(['sh', str(root / 'scripts/disk-guard.sh')], check=True)
evidence.mkdir(parents=True)
fixtures = root / '.agents/skills/verify-macos/fixtures'
sys.path.insert(0, str(root / '.agents/skills/verify-macos-lifecycle/scripts'))
from owned_process import OwnedCommands
owned = OwnedCommands(evidence / 'command-unsafe')
commands = []
server = None
proxy = None
exit_code = 1
scratch = Path(tempfile.mkdtemp(prefix='todo-s01-verify-sign-out-stream-'))
env = {key: value for key, value in os.environ.items() if not key.startswith('TODO_')}
env.update(HOME=str(scratch / 'home'), TODO_DB=str(scratch / 'scratch.db'), TODO_PORT='0')
(scratch / 'home').mkdir()

def cancelled(signum, frame):
    raise SystemExit(128 + signum)

signal.signal(signal.SIGTERM, cancelled)
signal.signal(signal.SIGINT, cancelled)

def run(argv, log, environment=env, stdin=None):
    with (evidence / log).open('w') as output:
        process = subprocess.Popen(argv, cwd=root, env=environment, stdout=output, stderr=subprocess.STDOUT, stdin=subprocess.PIPE if stdin else None, start_new_session=True, text=bool(stdin))
        try:
            if stdin: process.communicate(stdin)
            code = process.wait()
        finally:
            owned.stop(process)
    commands.append({'argv': [str(x) for x in argv], 'exit': code, 'log': log})
    (evidence / 'commands.json').write_text(json.dumps(commands, indent=2) + '\n')
    return code

try:
    package = scratch / 'package'
    sources = package / 'Sources/TodoState'
    tests = package / 'Tests/SignOutStreamTests'
    sources.mkdir(parents=True)
    tests.mkdir(parents=True)
    files = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', source, 'apps/macos/Sources'], cwd=root, text=True).splitlines()
    hashes = {}
    for file in files:
        if not file.endswith('.swift') or Path(file).name in ['TodoApp.swift', 'SessionVault.swift']:
            continue
        data = subprocess.check_output(['git', 'show', f'{source}:{file}'], cwd=root)
        (sources / Path(file).name).write_bytes(data)
        hashes[file] = hashlib.sha256(data).hexdigest()
    shutil.copyfile(fixtures / 'auth-epoch/SessionVault.swift', sources / 'SessionVault.swift')
    for name in ['SignOutStreamTests.swift', 'SignOutNoticeTests.swift', 'SeatSignOutNoticeTests.swift']:
        shutil.copyfile(fixtures / 'sign-out-stream' / name, tests / name)
    shutil.copyfile(root / 'apps/macos/Package.resolved', package / 'Package.resolved')
    api = str(root / 'apps/macos/API')
    (package / 'Package.swift').write_text('''// swift-tools-version: 6.2
import PackageDescription
let package = Package(name: "SignOutStreamProof", platforms: [.macOS(.v26)], dependencies: [.package(path: ''' + json.dumps(api) + ''')], targets: [
.target(name: "TodoState", dependencies: [.product(name: "TodoAPI", package: "API")]),
.testTarget(name: "SignOutStreamTests", dependencies: ["TodoState", .product(name: "TodoAPI", package: "API")])
])
''')
    api_hashes = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in (root / 'apps/macos/API/Sources/TodoAPI').rglob('*.swift')}
    cache = json.loads((root / '.scratch/bin/build.json').read_text())
    (evidence / 'source-provenance.json').write_text(json.dumps({'source': source, 'sources': hashes, 'apiSources': api_hashes, 'memorySessionAdapter': hashlib.sha256((sources / 'SessionVault.swift').read_bytes()).hexdigest(), 'tests': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(tests.glob('*.swift'))}, 'harness': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'compiledServer': cache, 'binaries': {k: hashlib.sha256(Path(cache[k]).read_bytes()).hexdigest() for k in ['cli', 'server', 'seed']}, 'nativeApp': False, 'keychain': False}, indent=2) + '\n')
    if run([cache['seed'], str(scratch), 'diagnostics'], 'seed.log'):
        raise RuntimeError('Provisioner failed')
    with (evidence / 'server.log').open('w') as output:
        server = subprocess.Popen([cache['server']], cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
    deadline = time.monotonic() + 60
    url = None
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise RuntimeError('Server exited before readiness')
        match = re.search(r'Listening on (http://127\.0\.0\.1:(\d+))', (evidence / 'server.log').read_text())
        if match:
            url, port = match[1], int(match[2])
            break
        time.sleep(0.1)
    if not url:
        raise RuntimeError('Server readiness timed out')
    if run([cache['cli'], 'login', '--password-stdin', '--profile', 'work', '--format', 'json'], 'login.log', dict(env, TODO_SERVER_URL=url), 'scratch verification passphrase\n'):
        raise RuntimeError('CLI login failed')

    lock = threading.Lock()
    fault = {'mode': None, 'held': False, 'release': threading.Event()}
    requests = []
    streams = []

    def upstream_request(method, path, body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=120)
        connection.request(method, path, body, headers or {})
        return connection, connection.getresponse()

    class Handler(http.server.BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'
        disable_nagle_algorithm = True
        def log_message(self, *args): pass
        def do_POST(self): self.forward()
        def do_PATCH(self): self.forward()
        def do_PUT(self): self.forward()
        def do_DELETE(self): self.forward()
        def reply(self, value, status=200):
            data = json.dumps(value).encode()
            self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
        def do_GET(self):
            if not self.path.startswith('/__ctl/'):
                return self.forward()
            parts = self.path[len('/__ctl/'):].split('/')
            if parts[0] == 'fault':
                with lock: fault.update(mode=parts[1], held=False); fault['release'] = threading.Event()
                return self.reply({'mode': parts[1]})
            if parts[0] == 'state':
                with lock: return self.reply({'mode': fault['mode'], 'held': fault['held']})
            if parts[0] == 'release':
                fault['release'].set(); return self.reply({'released': True})
            if parts[0] == 'write':
                titles = [f'Sign-out window {parts[2]} {i}' for i in range(int(parts[1]))]
                for i, title in enumerate(titles):
                    if run([cache['cli'], 'add', title, '--profile', 'work', '--format', 'json'], f'write-{parts[2]}-{i}.log', dict(env, TODO_SERVER_URL=url)):
                        return self.reply({'error': 'cli'}, 500)
                return self.reply({'titles': titles})
            if parts[0] == 'ops':
                with sqlite3.connect(f'file:{scratch / "scratch.db"}?mode=ro', uri=True) as db:
                    ids = [str(row[0]) for row in db.execute("select seq from op_log where outcome = 'committed' and profile = ? and seq > ? order by seq", (parts[1], int(parts[2])))]
                return self.reply({'ids': ids})
            if parts[0] == 'delivered':
                with lock: ids = [i for s in streams if s['path'].startswith('/profiles/work/events') for i in s['ids'] if int(i) > int(parts[1])]
                return self.reply({'ids': ids})
            if parts[0] == 'unauthorized':
                with lock: return self.reply({'count': sum(1 for r in requests if r['status'] == 401)})
            if parts[0] == 'probe':
                connection, response = upstream_request('GET', '/profiles', headers={'Authorization': 'Bearer ' + self.headers['X-Probe-Credential']})
                response.read(); connection.close()
                return self.reply({'status': response.status})
            return self.reply({'error': 'unknown'}, 404)
        def forward(self):
            length = int(self.headers.get('Content-Length') or 0)
            body = self.rfile.read(length) if length else None
            headers = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'connection', 'content-length')}
            record = {'method': self.command, 'path': self.path, 'status': None, 'at': time.monotonic(), 'fault': None}
            with lock: requests.append(record)
            mode = None
            if self.command == 'DELETE' and self.path == '/auth/session':
                with lock: mode, fault['mode'] = fault['mode'], None
                record['fault'] = mode
            if mode in ('reject', 'drop'):
                with lock: fault['held'] = True
                fault['release'].wait(120)
                record['status'] = 'not-forwarded'
                if mode == 'reject':
                    return self.reply({'error': {'code': 'unavailable', 'message': 'Scratch sign-out fault'}}, 503)
                self.close_connection = True
                return
            connection, response = upstream_request(self.command, self.path, body, headers)
            record['status'] = response.status
            if mode == 'revoke-drop':
                response.read(); connection.close()
                with lock: fault['held'] = True
                fault['release'].wait(120)
                self.close_connection = True
                return
            self.send_response(response.status)
            for key in ('Content-Type', 'Cache-Control'):
                if response.getheader(key): self.send_header(key, response.getheader(key))
            if self.path.split('?')[0].endswith('/events') and response.status == 200:
                stream = {'path': self.path, 'cursor': headers.get('last-event-id') or headers.get('Last-Event-ID'), 'ids': [], 'opened': time.monotonic(), 'closed': None}
                with lock: streams.append(stream)
                self.send_header('Connection', 'close'); self.end_headers()
                stop = threading.Event()
                def watch():
                    while not stop.is_set():
                        try:
                            readable, _, _ = select.select([self.connection], [], [], .1)
                            if readable and not self.connection.recv(1, socket.MSG_PEEK):
                                response.fp.raw._sock.shutdown(socket.SHUT_RD); return
                        except (OSError, ValueError, AttributeError):
                            try: response.fp.raw._sock.shutdown(socket.SHUT_RD)
                            except (OSError, AttributeError): pass
                            return
                watcher = threading.Thread(target=watch, daemon=True); watcher.start()
                pending = b''
                try:
                    response.fp.raw._sock.settimeout(None)
                    while True:
                        chunk = response.read1(65536)
                        if not chunk: break
                        pending += chunk
                        while b'\n\n' in pending:
                            frame, pending = pending.split(b'\n\n', 1)
                            if b'event: operation' in frame:
                                found = re.search(rb'id: (\d+)', frame)
                                if found:
                                    with lock: stream['ids'].append(found[1].decode())
                        self.wfile.write(chunk); self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, http.client.HTTPException, OSError): pass
                finally:
                    stop.set(); watcher.join(timeout=1); stream['closed'] = time.monotonic(); connection.close()
                self.close_connection = True
                return
            data = response.read(); connection.close()
            self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    class Proxy(http.server.ThreadingHTTPServer):
        request_queue_size = 1024
        daemon_threads = True
    proxy = Proxy(('127.0.0.1', 0), Handler)
    threading.Thread(target=proxy.serve_forever, daemon=True).start()
    proxy_url = f'http://127.0.0.1:{proxy.server_port}'
    (evidence / 'endpoints.json').write_text(json.dumps({'server': url, 'proxy': proxy_url, 'database': str(scratch / 'scratch.db')}) + '\n')
    test_env = dict(env, TODO_SIGN_OUT_STREAM='1', TODO_SIGN_OUT_PROXY=proxy_url, TODO_SIGN_OUT_SERVER=url, TODO_SIGN_OUT_EVIDENCE=str(evidence), SEAT_SERVER=url, SEAT_EVIDENCE=str(evidence))
    exit_code = run(['swift', 'test', '--package-path', str(package), '--scratch-path', str(root / 'apps/macos/DerivedData/SignOutStreamProof'), '--jobs', '2', '--disable-automatic-resolution', '--no-parallel', '--filter', 'SignOutStreamTests', '--skip', 'SeatSignOutNoticeTests'], 'tests.log', test_env)
    # The seat's unchanged probe runs alone: its teardown invalidates its URLSession while
    # the model can still reconnect, and an exception there would hide the other suites.
    seat_exit = run(['swift', 'test', '--package-path', str(package), '--scratch-path', str(root / 'apps/macos/DerivedData/SignOutStreamProof'), '--jobs', '2', '--disable-automatic-resolution', '--no-parallel', '--filter', 'SeatSignOutNoticeTests'], 'seat-tests.log', test_env)
    exit_code = exit_code or seat_exit
    with lock:
        (evidence / 'proxy-requests.json').write_text(json.dumps(requests, indent=1) + '\n')
        (evidence / 'proxy-streams.json').write_text(json.dumps(streams, indent=1) + '\n')
finally:
    if proxy is not None:
        proxy.shutdown()
    if server is not None:
        owned.stop(server)
    safe = not (evidence / 'command-unsafe').exists()
    if safe:
        shutil.rmtree(scratch)
    (evidence / 'cleanup.json').write_text(json.dumps({'serverStopped': server is None or server.poll() is not None, 'scratchRemoved': not scratch.exists()}) + '\n')
    (evidence / 'result.json').write_text(json.dumps({'source': source, 'exit': exit_code, 'status': 'PASS' if exit_code == 0 else 'FAIL', 'nativeAppLaunched': False, 'keychainAccess': False}) + '\n')
raise SystemExit(exit_code)
