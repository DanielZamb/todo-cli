#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time

root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
evidence = Path(sys.argv[1])
source = sys.argv[2] if len(sys.argv) > 2 else 'HEAD'
source = subprocess.check_output(['git', 'rev-parse', source], cwd=root, text=True).strip()
if not evidence.is_absolute() or evidence.exists():
    raise SystemExit('Pass a fresh absolute evidence directory')
subprocess.run(['sh', str(root / 'scripts/disk-guard.sh')], check=True)
evidence.mkdir(parents=True)
fixtures = root / '.agents/skills/verify-macos/fixtures/auth-epoch'
sys.path.insert(0, str(root / '.agents/skills/verify-macos-lifecycle/scripts'))
from owned_process import OwnedCommands
owned = OwnedCommands(evidence / 'command-unsafe')
commands = []
server = None
exit_code = 1
scratch = Path(tempfile.mkdtemp(prefix='todo-s01-verify-auth-epoch-'))
env = {key: value for key, value in os.environ.items() if not key.startswith('TODO_')}
env.update(HOME=str(scratch / 'home'), TODO_DB=str(scratch / 'scratch.db'), TODO_PORT='0')
(scratch / 'home').mkdir()

def cancelled(signum, frame):
    raise SystemExit(128 + signum)

signal.signal(signal.SIGTERM, cancelled)
signal.signal(signal.SIGINT, cancelled)

def run(argv, log, environment=env):
    with (evidence / log).open('w') as output:
        process = subprocess.Popen(argv, cwd=root, env=environment, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = process.wait()
        finally:
            owned.stop(process)
    commands.append({'argv': [str(x) for x in argv], 'exit': code, 'log': log})
    (evidence / 'commands.json').write_text(json.dumps(commands, indent=2) + '\n')
    return code

try:
    package = scratch / 'package'
    sources = package / 'Sources/TodoState'
    tests = package / 'Tests/AuthEpochTests'
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
    shutil.copyfile(fixtures / 'SessionVault.swift', sources / 'SessionVault.swift')
    shutil.copyfile(fixtures / 'AuthEpochTests.swift', tests / 'AuthEpochTests.swift')
    shutil.copyfile(root / 'apps/macos/Package.resolved', package / 'Package.resolved')
    api = str(root / 'apps/macos/API')
    (package / 'Package.swift').write_text('''// swift-tools-version: 6.2
import PackageDescription
let package = Package(name: "AuthEpochProof", platforms: [.macOS(.v26)], dependencies: [.package(path: ''' + json.dumps(api) + ''')], targets: [
.target(name: "TodoState", dependencies: [.product(name: "TodoAPI", package: "API")]),
.testTarget(name: "AuthEpochTests", dependencies: ["TodoState", .product(name: "TodoAPI", package: "API")])
])
''')
    api_hashes = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in (root / 'apps/macos/API/Sources/TodoAPI').rglob('*.swift')}
    cache = json.loads((root / '.scratch/bin/build.json').read_text())
    (evidence / 'source-provenance.json').write_text(json.dumps({'source': source, 'sources': hashes, 'apiSources': api_hashes, 'memorySessionAdapter': hashlib.sha256((sources / 'SessionVault.swift').read_bytes()).hexdigest(), 'test': hashlib.sha256((tests / 'AuthEpochTests.swift').read_bytes()).hexdigest(), 'compiledServer': cache, 'nativeApp': False, 'keychain': False}, indent=2) + '\n')
    if run([cache['seed'], str(scratch), 'diagnostics'], 'seed.log'):
        raise RuntimeError('Provisioner failed')
    with (evidence / 'server.log').open('w') as output:
        server = subprocess.Popen([cache['server']], cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
    (evidence / 'server.json').write_text(json.dumps({'pid': server.pid, 'database': str(scratch / 'scratch.db')}) + '\n')
    deadline = time.monotonic() + 60
    url = None
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise RuntimeError('Server exited before readiness')
        match = re.search(r'Listening on (http://127\.0\.0\.1:\d+)', (evidence / 'server.log').read_text())
        if match:
            url = match[1]
            break
        time.sleep(0.1)
    if not url:
        raise RuntimeError('Server readiness timed out')
    test_env = dict(env, TODO_AUTH_EPOCH_MEMORY_VAULT='1', TODO_AUTH_EPOCH_SERVER=url, TODO_AUTH_EPOCH_RECEIPT=str(evidence / 'receipt.json'))
    exit_code = run(['swift', 'test', '--package-path', str(package), '--scratch-path', str(root / 'apps/macos/DerivedData/AuthEpochProof'), '--jobs', '2', '--disable-automatic-resolution', '--no-parallel', '--filter', 'AuthEpochTests'], 'tests.log', test_env)
finally:
    if server is not None:
        owned.stop(server)
    safe = not (evidence / 'command-unsafe').exists()
    if safe:
        shutil.rmtree(scratch)
    (evidence / 'cleanup.json').write_text(json.dumps({'serverStopped': server is None or server.poll() is not None, 'scratchRemoved': not scratch.exists()}) + '\n')
    (evidence / 'result.json').write_text(json.dumps({'exit': exit_code, 'status': 'PASS' if exit_code == 0 else 'FAIL', 'nativeAppLaunched': False, 'keychainAccess': False}) + '\n')
raise SystemExit(exit_code)
