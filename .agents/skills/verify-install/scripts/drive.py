#!/usr/bin/env python3
import hashlib
import json
import os
import plistlib
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import time

scratch, evidence = map(Path, sys.argv[1:])
root = Path(__file__).resolve().parents[4]
home = scratch / 'home'
home.mkdir()
env = {**os.environ, 'HOME': str(home), 'TODO_DB': ''}
env.update(TODO_CHECK_MACOS_APP=str(scratch / 'absent/Todo.app'),
           TODO_CHECK_ELECTRON_APP=str(scratch / 'absent/Electron.app'),
           TODO_CHECK_AGENT_PLIST=str(scratch / 'absent/agent.plist'))
database = home / '.todo-cli' / 'todo.db'
database.parent.mkdir()
sentinel = b'R01 installation must preserve this database byte for byte.\n'
database.write_bytes(sentinel)
initial_files = sorted(str(path.relative_to(database.parent)) for path in database.parent.rglob('*'))
actions = []

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

with (evidence / 'commands.log').open('w') as log:
    def run(args, expected=0, extra_env=None, timeout=None):
        args = [str(arg) for arg in args]
        log.write('$ ' + shlex.join(args) + '\n')
        log.flush()
        result = subprocess.run(args, cwd=scratch, env={**env, **(extra_env or {})}, stdout=log, stderr=log, timeout=timeout)
        log.write('exit=' + str(result.returncode) + '\n')
        log.flush()
        actions.append({'command': args, 'exit': result.returncode})
        assert result.returncode == expected, (args, result.returncode, expected)

    installer = root / 'scripts/install.sh'
    run([installer, '--help'])
    run([installer, '--install-dir'], expected=2)
    run([installer, '--install-dir', ''], expected=2)
    run([installer, '--unknown'], expected=2)
    assert sorted(home.iterdir()) == [database.parent]
    dry_run = subprocess.run(['make', '-n', '-C', str(root), 'sign-desktop'], capture_output=True, text=True, check=True)
    (evidence / 'sign-desktop-dry-run.txt').write_text(dry_run.stdout)
    assert 'bun scripts/check-package-age.ts 7' in dry_run.stdout
    assert 'CODE_SIGNING_ALLOWED=YES' in dry_run.stdout
    assert 'CODE_SIGN_IDENTITY="Apple Development"' in dry_run.stdout
    assert 'build --sign --output' in dry_run.stdout
    assert 'signing-receipt.py' in dry_run.stdout
    assert 'unregister-desktop-builds.py' in dry_run.stdout
    assert 'dist/signed.noindex/macos' in dry_run.stdout
    assert 'dist/signed.noindex/electron/Todo.app' in dry_run.stdout
    assert 'dist/signed.noindex/DerivedData' in dry_run.stdout
    assert 'dist/signed/' not in dry_run.stdout
    assert 'TODO_SIGNING_TEAM' in dry_run.stdout
    assert 'TODO_SIGNING_IDENTITY' in dry_run.stdout
    run(['make', '-C', root, 'check-signing-config', 'TODO_SIGNING_TEAM=', 'TODO_SIGNING_IDENTITY='], expected=2)
    run(['make', '-C', root, 'check-signing-config', 'TODO_SIGNING_TEAM=TESTTEAM01', 'TODO_SIGNING_IDENTITY='], expected=2)
    run(['make', '-C', root, 'check-signing-config', 'TODO_SIGNING_TEAM=TESTTEAM01', 'TODO_SIGNING_IDENTITY=Example Development Identity'])
    notices_path = evidence / 'THIRD_PARTY_NOTICES.txt'
    run(['bun', root / 'scripts/third-party-notices.ts', 'relative-notices.txt'], expected=1)
    assert not (scratch / 'relative-notices.txt').exists()
    run(['bun', root / 'scripts/third-party-notices.ts', notices_path])
    notices = notices_path.read_text()
    contract_scratch = scratch / 'contract-check'
    api_scratch = contract_scratch / 'packages/api'
    for directory in ['src', 'scripts']:
        shutil.copytree(root / 'packages/api' / directory, api_scratch / directory)
    shutil.copy2(root / 'packages/api/openapi.json', api_scratch / 'openapi.json')
    (api_scratch / 'node_modules').symlink_to(root / 'packages/api/node_modules', target_is_directory=True)
    swift_identity = contract_scratch / 'apps/macos/API/Sources/TodoAPI/ContractIdentity.swift'
    swift_identity.parent.mkdir(parents=True)
    shutil.copy2(root / 'apps/macos/API/Sources/TodoAPI/ContractIdentity.swift', swift_identity)
    identity_ts = api_scratch / 'src/contract.ts'
    run(['bun', api_scratch / 'scripts/openapi.ts', '--check'])
    identity_ts.write_text(re.sub(r'[a-f0-9]{64}', '0' * 64, identity_ts.read_text()))
    run(['bun', api_scratch / 'scripts/openapi.ts', '--check'], expected=1)
    shutil.copy2(root / 'packages/api/src/contract.ts', identity_ts)
    swift_identity.write_text(re.sub(r'[a-f0-9]{64}', '0' * 64, swift_identity.read_text()))
    run(['bun', api_scratch / 'scripts/openapi.ts', '--check'], expected=1)
    for required in ['Copyright (c) 2026 DanielZamb', 'effect 4.0.5', 'react 19.3.1', 'Copyright (c) 2023 shadcn', 'swift-openapi-runtime', 'JavaScriptCore']:
        assert required in notices, required
    assert '/Users/' not in notices
    assert str(root) not in notices
    fake_bin = scratch / 'invalid-inventory-bin'
    fake_bin.mkdir()
    invalid_inventory = fake_bin / 'inventory.json'
    invalid_inventory.write_text(json.dumps({'MIT': [{'name': 'broken', 'versions': 'not-an-array', 'paths': [], 'license': 'MIT'}]}))
    fake_pnpm = fake_bin / 'pnpm'
    fake_pnpm.write_text('#!/bin/sh\nexec /bin/cat ' + shlex.quote(str(invalid_inventory)) + '\n')
    fake_pnpm.chmod(0o700)
    rejected_notices = evidence / 'rejected-notices.txt'
    run(['bun', root / 'scripts/third-party-notices.ts', rejected_notices], expected=1, extra_env={'PATH': str(fake_bin) + os.pathsep + os.environ['PATH']})
    assert not rejected_notices.exists()
    swift_slot = root / 'scripts/swift-slot.sh'
    run([swift_slot], expected=2, timeout=10)
    run([swift_slot, '/bin/sh', '-c', 'exit 23'], expected=23, timeout=10)
    run([swift_slot, '/bin/sh', '-c', 'exit 75'], expected=75, timeout=10)
    slot_output = evidence / 'swift-slot-argument.txt'
    run([swift_slot, '/bin/sh', '-c', 'printf "%s" "$2" > "$1"', 'sh', slot_output, 'two words $literal'], timeout=10)
    assert slot_output.read_text() == 'two words $literal'
    run(['make', '-C', root, 'build'])
    run([installer])
    default_bin = home / '.local/bin'
    for name, build in [('todo', 'apps/cli/dist/todo'), ('todo-server', 'apps/server/dist/todo-server')]:
        assert os.access(default_bin / name, os.X_OK)
        assert digest(default_bin / name) == digest(root / build)
    run(['make', '-C', root, 'install', 'INSTALL_DIR=' + str(scratch / 'make bin')])
    run([installer, '--install-dir', 'custom bin'])
    custom_bin = scratch / 'custom bin'
    binaries = []
    for directory in [default_bin, scratch / 'make bin', custom_bin]:
        for name, build in [('todo', 'apps/cli/dist/todo'), ('todo-server', 'apps/server/dist/todo-server')]:
            path = directory / name
            assert os.access(path, os.X_OK), path
            assert digest(path) == digest(root / build), path
            binaries.append({'path': str(path), 'sha256': digest(path), 'executable': True})
    assert database.read_bytes() == sentinel
    assert sorted(str(path.relative_to(database.parent)) for path in database.parent.rglob('*')) == initial_files
    checker = root / 'scripts/check-installed.sh'
    def check_installed(name, expected, *arguments, extra_env=None):
        result = subprocess.run([str(checker), '--install-dir', str(default_bin), *arguments], env={**env, **(extra_env or {})}, capture_output=True, text=True)
        (evidence / (name + '.txt')).write_text(result.stdout + result.stderr)
        actions.append(dict(command=[str(checker), *arguments], exit=result.returncode, evidence=name + '.txt'))
        assert result.returncode == expected, result.stdout + result.stderr
        return result.stdout
    absent = check_installed('cli-only', 0, '--require', 'cli,server-bin')
    assert 'not installed' in absent and 'WARNING' not in absent
    run(['bun', root / 'scripts/compile.ts', root / 'apps/server/src/main.ts', scratch / 'stale-server'], extra_env={'TODO_BUILD_ID': 'verify-stale'})
    original_server = scratch / 'matching-server'
    shutil.copy2(default_bin / 'todo-server', original_server)
    shutil.copy2(scratch / 'stale-server', default_bin / 'staged-server')
    os.replace(default_bin / 'staged-server', default_bin / 'todo-server')
    mismatch = check_installed('required-mismatch', 1, '--require', 'cli,server-bin')
    assert 'server-bin' in mismatch and 'MISMATCH' in mismatch and 'verify-stale' in mismatch
    shutil.copy2(original_server, default_bin / 'staged-server')
    os.replace(default_bin / 'staged-server', default_bin / 'todo-server')
    macos = scratch / 'Todo.app'
    helper = macos / 'Contents/Resources/Server/todo-server'
    helper.parent.mkdir(parents=True)
    shutil.copy2(scratch / 'stale-server', helper)
    warning = check_installed('optional-mismatch', 0, '--require', 'cli,server-bin', '--macos-app', str(macos))
    assert 'WARNING macos-app:' in warning and 'scripts/upgrade-local.sh' in warning
    check_installed('upgrade-mismatch', 1, '--require', 'cli,server-bin', '--require-present', '--macos-app', str(macos))
    helper.unlink()
    shutil.copy2(default_bin / 'todo-server', helper)
    check_installed('matching-scratch', 0, '--require', 'cli,server-bin,macos-app', '--macos-app', str(macos))
    electron = scratch / 'Todo Electron.app'
    identity_file = electron / 'Contents/Resources/app/identity.json'
    identity_file.parent.mkdir(parents=True)
    version = subprocess.check_output([str(default_bin / 'todo-server'), '--version'], text=True, env=env)
    identity = {key: re.search(key + r'=(\S+)', version)[1] for key in ['build', 'contract']}
    identity_file.write_text(json.dumps(identity))
    agent = scratch / 'guardrails.plist'
    agent.write_bytes(plistlib.dumps(dict(ProgramArguments=[str(default_bin / 'todo-server')], EnvironmentVariables=dict(TODO_PORT='0'))))
    with (evidence / 'check-live-server.log').open('w') as health_log:
        health_server = subprocess.Popen([str(default_bin / 'todo-server')], env={**env, 'TODO_DB': str(scratch / 'check-health.db'), 'TODO_PORT': '0'}, stdout=health_log, stderr=health_log)
        try:
            deadline = time.monotonic() + 60
            address = None
            while time.monotonic() < deadline:
                assert health_server.poll() is None, 'Owned health server exited'
                found = re.search(r'Listening on (http://127\.0\.0\.1:\d+)', (evidence / 'check-live-server.log').read_text())
                if found:
                    address = found[1]
                    break
                time.sleep(.1)
            assert address, 'Owned health server did not listen'
            full_args = ['--agent-plist', str(agent), '--health-url', address + '/health', '--macos-app', str(macos), '--electron-app', str(electron)]
            matching = check_installed('all-components-match', 0, '--require', 'cli,server-bin,managed-server,macos-app,electron-app', *full_args)
            assert matching.count('OK') == 6
            identity_file.write_text(json.dumps({**identity, 'contract': 'verify-stale-contract'}))
            warning = check_installed('electron-optional-mismatch', 0, '--require', 'cli,server-bin', *full_args)
            assert 'WARNING electron-app:' in warning
            strict = check_installed('electron-required-mismatch', 1, '--require', 'electron-app', *full_args)
            assert 'electron-app' in strict and 'MISMATCH' in strict
        finally:
            health_server.terminate()
            try:
                health_server.wait(timeout=2)
            except subprocess.TimeoutExpired:
                health_server.kill()
                health_server.wait()
    run([root / '.agents/skills/verify-cli/scripts/verify.sh', evidence / 'cli'],
        extra_env={'TODO_CLI_BINARY': str(default_bin / 'todo')})
    run([root / '.agents/skills/verify-server-api/scripts/verify.sh', evidence / 'server'],
        extra_env={'TODO_SERVER_BINARY': str(custom_bin / 'todo-server')})
    assert database.read_bytes() == sentinel
    assert sorted(str(path.relative_to(database.parent)) for path in database.parent.rglob('*')) == initial_files

goldens = []
baseline = json.loads((root / 'apps/cli/test/fixtures/golden-baseline.json').read_text())
assert len(baseline['files']) == 5
directory = root / 'apps/cli/test/golden'
assert sorted(path.name for path in directory.iterdir()) == sorted(row['name'] for row in baseline['files'])
for row in baseline['files']:
    path = directory / row['name']
    original = subprocess.check_output(['git', 'show', baseline['base'] + ':legacy/go/test/integration/testdata/' + row['name']], cwd=root)
    assert path.read_bytes() == original
    assert digest(path) == row['sha256']
    assert path.stat().st_size == row['bytes']
    goldens.append({**row, 'byte_identical_to_base': True})
assert not (root / 'legacy/go').exists()
(evidence / 'golden-move.json').write_text(json.dumps(goldens, indent=2) + '\n')
(evidence / 'result.json').write_text(json.dumps({
    'result': 'PASS', 'home': str(home), 'binaries': binaries, 'commands': actions,
    'database_sha256': digest(database), 'database_unchanged': True,
    'database_directory_unchanged': True, 'legacy_go_absent': True,
}, indent=2) + '\n')
