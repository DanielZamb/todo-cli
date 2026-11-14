#!/usr/bin/env python3
import json
import hashlib
import os
import plistlib
import platform
import shutil
import tempfile
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / 'apps/macos/scripts'))
import state_package  # the state package with the in-memory vault, and the Keychain guard
package = state_package.prepare()
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
        # Candidate 11: the whole process group of the command is stopped if this runner is
        # stopped, so no test helper is left orphaned (state_package.grouped_run).
        code, stdout = state_package.grouped_run(command, cwd=root, env=env, stdout=subprocess.PIPE if capture_stdout else output, stderr=output if capture_stdout else subprocess.STDOUT, text=True)
        result = subprocess.CompletedProcess(command, code, stdout, None)
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
run(['swift', 'build', '--package-path', str(package), '--scratch-path', str(build_path), '--disable-automatic-resolution', '--build-tests', '--jobs', '2'], 'build.log')
keychain = state_package.checked(build_path, evidence / 'keychain-guard.json')  # stops if a Keychain call is linked
run(['swift', 'test', '--package-path', str(package), '--scratch-path', str(build_path), '--skip-build', '--disable-automatic-resolution', '--filter', 'PresentationTests|CompactFormattingTests|WindowLayoutTests|TaskFilterTests'], 'presentation.log')
binary = run(['swift', 'build', '--package-path', str(package), '--scratch-path', str(build_path), '--disable-automatic-resolution', '--show-bin-path'], 'show-bin-path.log', capture_stdout=True).strip()
run([
    'xcrun', 'swiftc', '-typecheck', '-parse-as-library', '-swift-version', '6',
    '-target', f'{platform.machine()}-apple-macosx26.0', '-I', str(Path(binary) / 'Modules'),
    # TodoAPI imports the stall sampler's C module (candidate 8); SwiftPM keeps its module map apart.
    '-Xcc', f"-fmodule-map-file={Path(binary) / 'ClientStallSampling.build' / 'module.modulemap'}",
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
graph_refresh = os.environ.get('TODO_SNAPSHOT_GRAPH_REFRESH_ONLY') == '1'
assert not (viewport_resize and graph_refresh), 'Choose one focused WK proof'
if viewport_resize:
    environment['TODO_GRAPH_RESIZE_EVIDENCE'] = str(evidence.relative_to(root))
if graph_refresh:
    environment['TODO_GRAPH_REFRESH_BINARIES'] = str(root / '.scratch/bin/build.json')
    environment['TODO_GRAPH_REFRESH_HEAD'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    graph_home = tempfile.mkdtemp(prefix='todo-s01-verify-graph-refresh-home-')
    environment.update(HOME=graph_home, CFFIXED_USER_HOME=graph_home)
try:
    render_exit = run(['swift', 'test', '--no-parallel', '--package-path', str(package), '--scratch-path', str(build_path), '--skip-build', '--filter', 'DependencyGraphRefreshTests' if graph_refresh else 'DependencyViewportResizeTests' if viewport_resize else 'Snapshots'], 'render.log', environment, allow_failure=True)
finally:
    if graph_refresh:
        shutil.rmtree(graph_home)
        (evidence / 'home-cleanup.json').write_text(json.dumps({'scratchHomeRemoved': not Path(graph_home).exists()}) + '\n')
if graph_refresh:
    if (evidence / 'disk-stop.json').is_file():
        assert json.loads((evidence / 'disk-stop.json').read_text())['exit'] == 3
        render_exit = 3
    if render_exit == 0:
        proof = json.loads((evidence / 'wk-refresh-proof.json').read_text())
        assert len(proof['cases']) == 2
        assert json.loads((evidence / 'wk-refresh-cleanup.json').read_text()) == {'serverStopped': True, 'scratchRemoved': True}
    (evidence / 'result.json').write_text(json.dumps({'status': 'PASS' if render_exit == 0 else 'FAIL', 'exit': render_exit, 'scope': 'WK_SSE_REFRESH_ONLY', 'appLaunched': False, 'signed': False, 'keychainAccess': keychain['keychainLinked'], 'keychainGuard': 'keychain-guard.json'}, indent=2) + '\n')
    print(f'WK SSE refresh only; actual exit {render_exit}; {evidence}')
    raise SystemExit(render_exit)
if viewport_resize:
    if render_exit == 0:
        proof = json.loads((evidence / 'wk-resize-proof.json').read_text())
        assert len(proof['phases']) == 6
    (evidence / 'result.json').write_text(json.dumps({'status': 'PASS' if render_exit == 0 else 'FAIL', 'exit': render_exit, 'scope': 'WK_VIEWPORT_RESIZE_ONLY', 'appLaunched': False, 'signed': False, 'keychainAccess': keychain['keychainLinked'], 'keychainGuard': 'keychain-guard.json'}, indent=2) + '\n')
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
# Candidates 9, 10 and 11's states, both appearances (part of the full suite, or alone with TODO_SNAPSHOT_C9_ONLY=1).
C9_IMAGES = 58
assert len(manifest['files']) == (C9_IMAGES if os.environ.get('TODO_SNAPSHOT_C9_ONLY') == '1' else 52 if os.environ.get('TODO_SNAPSHOT_C8_ONLY') == '1' else 22 if os.environ.get('TODO_SNAPSHOT_C7_ONLY') == '1' else 8 if os.environ.get('TODO_SNAPSHOT_SC1_ONLY') == '1' else 32 if os.environ.get('TODO_SNAPSHOT_DAG_CHECKPOINT2') == '1' else 24 if os.environ.get('TODO_SNAPSHOT_DAG_CHECKPOINT1') == '1' else 394 if os.environ.get('TODO_SNAPSHOT_DAG_ONLY') == '1' else 116 if os.environ.get('TODO_SNAPSHOT_DISCOVERY_ONLY') == '1' else 60 if os.environ.get('TODO_SNAPSHOT_SEARCH_ONLY') == '1' else 2 if os.environ.get('TODO_SNAPSHOT_QUICK_ONLY') == '1' else 18 if os.environ.get('TODO_SNAPSHOT_PRIORITY_ONLY') == '1' else 28 if os.environ.get('TODO_SNAPSHOT_BATCH_EDIT_ONLY') == '1' else 872 + C9_IMAGES)
assert all((evidence / name).is_file() for name in manifest['files'])
settle_rows = [json.loads(line) for line in (evidence / 'settle.jsonl').read_text().splitlines()] if (evidence / 'settle.jsonl').is_file() else []
settle_histogram = {}
for row in settle_rows:
    settle_histogram[str(row['captures'])] = settle_histogram.get(str(row['captures']), 0) + 1
settle = {
    'renders': len(settle_rows),
    'capture_limit': 3,
    'captures_histogram': dict(sorted(settle_histogram.items(), key=lambda item: int(item[0]))),
    'over_limit': [{'sequence': row['sequence'], 'name': row['name'], 'captures': row['captures'], 'changes': row['changes']} for row in settle_rows if row['captures'] > 3],
    'late_changes': [{'sequence': row['sequence'], 'name': row['name'], 'captures': row['captures'], 'changes': row['changes']} for row in settle_rows if row['captures'] > 2],
    'stale_on_first_layout': [{'sequence': row['sequence'], 'name': row['name'], 'appearance': row['appearance'], 'controls': row.get('staleControls', [])} for row in settle_rows if row['staleOnFirstLayout']],
    'verdict_image': 'natural layout; the forced re-measure is a detector only',
}
if settle['over_limit']:
    render_exit = render_exit or 4
(evidence / 'result.json').write_text(json.dumps({'status': 'PASS' if render_exit == 0 else 'FAIL', 'exit': render_exit, 'pngs': len(manifest['files']), 'render': {'scale': 2, 'drawing_colour_space': 'calibratedRGB (generic)', 'png_colour_space': 'sRGB', 'independent_of_host_display': True, 'settle': 'pending constraints, layout and CATransaction applied; two consecutive identical captures 100 ms apart'}, 'settle': settle, 'appLaunched': False, 'signed': False, 'keychainAccess': keychain['keychainLinked'], 'keychainGuard': 'keychain-guard.json', 'nativeGlassVerified': False}, indent=2) + '\n')
print(f"{'PASS' if render_exit == 0 else 'FAIL'}: {len(manifest['files'])} offscreen PNGs; actual render exit {render_exit}; {evidence}")
raise SystemExit(render_exit)
