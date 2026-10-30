#!/usr/bin/env python3
import json
import os
import plistlib
import platform
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
evidence = Path(sys.argv[1]).resolve()
evidence.mkdir(parents=True, exist_ok=False)
commands = []

def run(command, log, env=None):
    with (evidence / log).open('w') as output:
        result = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
    commands.append({'argv': command, 'exit': result.returncode, 'log': log})
    (evidence / 'commands.json').write_text(json.dumps(commands, indent=2) + '\n')
    if result.returncode:
        raise SystemExit(result.returncode)

run(['sh', 'scripts/disk-guard.sh'], 'disk-guard.log')
run(['python3', 'apps/macos/scripts/check-design-identifiers.py', str(evidence / 'accessibility.json')], 'accessibility.log')
run(['swift', 'build', '--package-path', 'apps/macos', '--scratch-path', 'apps/macos/DerivedData/StateProof', '--disable-automatic-resolution', '--build-tests', '--jobs', '2'], 'build.log')
run(['swift', 'test', '--package-path', 'apps/macos', '--scratch-path', 'apps/macos/DerivedData/StateProof', '--skip-build', '--filter', 'PresentationTests|WindowLayoutTests|TaskFilterTests'], 'presentation.log')
binary = subprocess.check_output(['swift', 'build', '--package-path', 'apps/macos', '--scratch-path', 'apps/macos/DerivedData/StateProof', '--show-bin-path'], cwd=root, text=True).strip()
run([
    'xcrun', 'swiftc', '-typecheck', '-parse-as-library', '-swift-version', '6',
    '-target', f'{platform.machine()}-apple-macosx26.0', '-I', str(Path(binary) / 'Modules'),
    *[str(path) for path in sorted((root / 'apps/macos/Sources').glob('*.swift'))]
], 'app-typecheck.log')
resources = Path(binary) / 'TodoStateProofPackageTests.xctest' / 'Contents' / 'Resources'
resources.mkdir(parents=True, exist_ok=True)
(resources.parent / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'local.todo.design-proof', 'CFBundleName': 'TodoStateProofPackageTests', 'CFBundleExecutable': 'TodoStateProofPackageTests', 'CFBundlePackageType': 'BNDL'}))
run(['xcrun', 'actool', str(root / 'design/macos/Assets.xcassets'), '--compile', str(resources), '--platform', 'macosx', '--minimum-deployment-target', '26.0'], 'assets.log')
assert (resources / 'Assets.car').is_file(), 'actool did not compile the production color assets'
environment = dict(os.environ, TODO_SNAPSHOT_DIR=str(evidence))
run(['swift', 'test', '--package-path', 'apps/macos', '--scratch-path', 'apps/macos/DerivedData/StateProof', '--skip-build', '--filter', 'Snapshots'], 'render.log', environment)
manifest = json.loads((evidence / 'manifest.json').read_text())
assert len(manifest['files']) == (2 if os.environ.get('TODO_SNAPSHOT_QUICK_ONLY') == '1' else 278)
assert all((evidence / name).is_file() for name in manifest['files'])
(evidence / 'result.json').write_text(json.dumps({'status': 'PASS', 'pngs': len(manifest['files']), 'appLaunched': False, 'signed': False, 'keychainAccess': False, 'nativeGlassVerified': False}, indent=2) + '\n')
print(f"PASS: {len(manifest['files'])} offscreen PNGs in {evidence}")
