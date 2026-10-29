#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

scratch, evidence = map(Path, sys.argv[1:])
root = Path(__file__).resolve().parents[4]
home = scratch / 'home'
home.mkdir()
env = {**os.environ, 'HOME': str(home), 'TODO_DB': ''}
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
