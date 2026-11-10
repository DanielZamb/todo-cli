#!/usr/bin/env python3
import json
import hashlib
import os
import plistlib
import platform
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
evidence = Path(sys.argv[1]).resolve()
evidence.mkdir(parents=True, exist_ok=False)
source_files = sorted(path for pattern in ['Sources/*.swift', 'StateTests/*.swift', 'Tests/*.swift', 'DesignSnapshots/*.swift', 'API/Sources/TodoAPI/GeneratedSources/*.swift'] for path in (root / 'apps/macos').glob(pattern))
source_files += sorted((root / 'design/macos/Assets.xcassets').glob('search-highlight.colorset/Contents.json'))
(evidence / 'source-provenance.json').write_text(json.dumps({
    'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'sources': {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in source_files}
}, indent=2) + '\n')
build_path = Path(os.environ.get("TODO_SWIFT_BUILD_PATH", str(root / "apps/macos/DerivedData/StateProof"))).resolve()
if not build_path.is_relative_to(root / "apps/macos"):
    raise SystemExit("TODO_SWIFT_BUILD_PATH must stay under apps/macos")
commands = []
resolved_paths = subprocess.check_output(['git', 'ls-files', '--', ':(glob)**/Package.resolved', 'Package.resolved'], cwd=root, text=True).splitlines()

def package_state(name, phase):
    command = ['git', 'diff', '--exit-code', 'HEAD', '--', *resolved_paths]
    result = subprocess.run(command, cwd=root, capture_output=True, text=True)
    (evidence / f'{name}.packages-{phase}.json').write_text(json.dumps(dict(command=command, exit=result.returncode, stdout=result.stdout, stderr=result.stderr, hashes={path: hashlib.sha256((root / path).read_bytes()).hexdigest() for path in resolved_paths}), indent=2) + '\n')
    return result.returncode

def run(command, log, env=None, capture_stdout=False):
    swift = command[:2] in [['swift', 'build'], ['swift', 'run'], ['swift', 'test']]
    if swift:
        if '--disable-automatic-resolution' not in command:
            command = [*command[:2], '--disable-automatic-resolution', *command[2:]]
        if package_state(log, 'before'):
            raise SystemExit('Package.resolved changed before Swift invocation')
    with (evidence / log).open('w') as output:
        result = subprocess.run(command, cwd=root, env=env, stdout=subprocess.PIPE if capture_stdout else output, stderr=output if capture_stdout else subprocess.STDOUT, text=True)
        if capture_stdout:
            output.write(result.stdout)
    packages = package_state(log, 'after') if swift else None
    entry = {'argv': command, 'exit': result.returncode, 'log': log, 'packageResolvedDiffExit': packages}
    if capture_stdout:
        entry['stdout'] = result.stdout
    commands.append(entry)
    (evidence / 'commands.json').write_text(json.dumps(commands, indent=2) + '\n')
    if result.returncode or packages:
        raise SystemExit(result.returncode or packages)
    return result.stdout

run(['sh', 'scripts/disk-guard.sh'], 'disk-guard.log')
run(['python3', 'apps/macos/scripts/check-design-identifiers.py', str(evidence / 'accessibility.json')], 'accessibility.log')
run(['swift', 'build', '--package-path', 'apps/macos', '--scratch-path', str(build_path), '--disable-automatic-resolution', '--build-tests', '--jobs', '2'], 'build.log')
run(['swift', 'test', '--package-path', 'apps/macos', '--scratch-path', str(build_path), '--skip-build', '--disable-automatic-resolution', '--filter', 'PresentationTests|CompactFormattingTests|WindowLayoutTests|TaskFilterTests'], 'presentation.log')
binary = run(['swift', 'build', '--package-path', 'apps/macos', '--scratch-path', str(build_path), '--disable-automatic-resolution', '--show-bin-path'], 'show-bin-path.log', capture_stdout=True).strip()
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
run(['swift', 'test', '--package-path', 'apps/macos', '--scratch-path', str(build_path), '--skip-build', '--filter', 'Snapshots'], 'render.log', environment)
manifest = json.loads((evidence / 'manifest.json').read_text())
assert len(manifest['files']) == (116 if os.environ.get('TODO_SNAPSHOT_DISCOVERY_ONLY') == '1' else 60 if os.environ.get('TODO_SNAPSHOT_SEARCH_ONLY') == '1' else 2 if os.environ.get('TODO_SNAPSHOT_QUICK_ONLY') == '1' else 18 if os.environ.get('TODO_SNAPSHOT_PRIORITY_ONLY') == '1' else 28 if os.environ.get('TODO_SNAPSHOT_BATCH_EDIT_ONLY') == '1' else 358)
assert all((evidence / name).is_file() for name in manifest['files'])
(evidence / 'result.json').write_text(json.dumps({'status': 'PASS', 'pngs': len(manifest['files']), 'appLaunched': False, 'signed': False, 'keychainAccess': False, 'nativeGlassVerified': False}, indent=2) + '\n')
print(f"PASS: {len(manifest['files'])} offscreen PNGs in {evidence}")
