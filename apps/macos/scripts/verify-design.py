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
source_files = sorted(path for pattern in ['Sources/*.swift', 'StateTests/*.swift', 'Tests/*.swift', 'DesignSnapshots/*.swift', 'API/Sources/TodoAPI/*.swift', 'API/Sources/TodoAPI/GeneratedSources/*.swift', 'scripts/*.py', 'scripts/*.mjs', 'scripts/*.ts', 'scripts/*.rb'] for path in (root / 'apps/macos').glob(pattern))
source_files += sorted((root / 'apps/electron/graph-browser').glob('*'))
source_files += [root / 'apps/electron/scripts/build-graph-browser.ts']
source_files += sorted((root / 'design/macos/Assets.xcassets').glob('search-highlight.colorset/Contents.json'))
(evidence / 'source-provenance.json').write_text(json.dumps({
    'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'sources': {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in source_files}
}, indent=2) + '\n')
build_path = Path(os.environ.get("TODO_SWIFT_BUILD_PATH", str(root / "apps/macos/DerivedData/StateProof"))).resolve()
if not build_path.is_relative_to(root / "apps/macos"):
    raise SystemExit("TODO_SWIFT_BUILD_PATH must stay under apps/macos")
commands = []
resolved_paths = subprocess.check_output(['git', 'ls-files', '--', ':(glob)**/Package.resolved', 'Package.resolved', 'pnpm-lock.yaml'], cwd=root, text=True).splitlines()

def package_state(name, phase):
    command = ['git', 'diff', '--exit-code', 'HEAD', '--', *resolved_paths]
    result = subprocess.run(command, cwd=root, capture_output=True, text=True)
    (evidence / f'{name}.packages-{phase}.json').write_text(json.dumps(dict(command=command, exit=result.returncode, stdout=result.stdout, stderr=result.stderr, hashes={path: hashlib.sha256((root / path).read_bytes()).hexdigest() for path in resolved_paths}), indent=2) + '\n')
    return result.returncode

def run(command, log, env=None, capture_stdout=False, allow_failure=False):
    if command[0] in ['swift', 'xcrun', 'bun']:
        subprocess.run(['sh', str(root / 'scripts/disk-guard.sh')], cwd=root, check=True)
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
    if packages or result.returncode and not allow_failure:
        raise SystemExit(result.returncode or packages)
    return result.stdout if capture_stdout else result.returncode

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
run(['node', 'apps/macos/scripts/graph-resources.mjs', str(resources / 'graph-browser')], 'graph-resources.log')
assert (resources / 'Assets.car').is_file(), 'actool did not compile the production color assets'
environment = dict(os.environ, TODO_SNAPSHOT_DIR=str(evidence))
viewport_resize = os.environ.get('TODO_SNAPSHOT_GRAPH_RESIZE_ONLY') == '1'
if viewport_resize:
    environment['TODO_GRAPH_RESIZE_EVIDENCE'] = str(evidence.relative_to(root))
render_exit = run(['swift', 'test', '--no-parallel', '--package-path', 'apps/macos', '--scratch-path', str(build_path), '--skip-build', '--filter', 'DependencyViewportResizeTests' if viewport_resize else 'Snapshots'], 'render.log', environment, allow_failure=True)
if viewport_resize:
    if render_exit == 0:
        proof = json.loads((evidence / 'wk-resize-proof.json').read_text())
        assert len(proof['phases']) == 6
    (evidence / 'result.json').write_text(json.dumps({'status': 'PASS' if render_exit == 0 else 'FAIL', 'exit': render_exit, 'scope': 'WK_VIEWPORT_RESIZE_ONLY', 'appLaunched': False, 'signed': False, 'keychainAccess': False}, indent=2) + '\n')
    print(f'WK viewport resize only; actual exit {render_exit}; {evidence}')
    raise SystemExit(render_exit)
for dag_manifest_path in evidence.glob('dag*-capture-manifest.json'):
    for row in json.loads(dag_manifest_path.read_text()):
        if row.get('behavior_status') == 'pending':
            assert row.get('behavior_receipt') is None, 'Pending behavior cannot name a future receipt'
            continue
        receipt_path = (evidence / row['behavior_receipt']).resolve(strict=True)
        assert receipt_path.is_relative_to(evidence.resolve()), 'Behavior receipt must stay inside capture evidence'
        receipt = json.loads(receipt_path.read_text())
        assert receipt['exit'] == 0 and receipt['command'], 'Behavior requires an actual successful command'
        log_path = (evidence / receipt['log']).resolve(strict=True)
        assert log_path.is_relative_to(evidence.resolve()) and log_path.is_file()
if any(evidence.glob('dag*-capture-manifest.json')):
    validation = ['bun', 'apps/macos/scripts/validate-dependency-captures.ts', str(evidence.relative_to(root))]
    if state_command := os.environ.get('TODO_DAG_STATE_COMMAND'):
        validation.append(state_command)
    run(validation, 'capture-inputs.log')
manifest = json.loads((evidence / 'manifest.json').read_text())
assert len(manifest['files']) == (8 if os.environ.get('TODO_SNAPSHOT_SC1_ONLY') == '1' else 32 if os.environ.get('TODO_SNAPSHOT_DAG_CHECKPOINT2') == '1' else 24 if os.environ.get('TODO_SNAPSHOT_DAG_CHECKPOINT1') == '1' else 394 if os.environ.get('TODO_SNAPSHOT_DAG_ONLY') == '1' else 116 if os.environ.get('TODO_SNAPSHOT_DISCOVERY_ONLY') == '1' else 60 if os.environ.get('TODO_SNAPSHOT_SEARCH_ONLY') == '1' else 2 if os.environ.get('TODO_SNAPSHOT_QUICK_ONLY') == '1' else 18 if os.environ.get('TODO_SNAPSHOT_PRIORITY_ONLY') == '1' else 28 if os.environ.get('TODO_SNAPSHOT_BATCH_EDIT_ONLY') == '1' else 856)
assert all((evidence / name).is_file() for name in manifest['files'])
(evidence / 'result.json').write_text(json.dumps({'status': 'PASS' if render_exit == 0 else 'FAIL', 'exit': render_exit, 'pngs': len(manifest['files']), 'appLaunched': False, 'signed': False, 'keychainAccess': False, 'nativeGlassVerified': False}, indent=2) + '\n')
print(f"{'PASS' if render_exit == 0 else 'FAIL'}: {len(manifest['files'])} offscreen PNGs; actual render exit {render_exit}; {evidence}")
raise SystemExit(render_exit)
