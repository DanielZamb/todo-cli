#!/usr/bin/env python3
"""Press against release on the production Task list, per source variant.

Usage: press_release.py <fresh evidence dir> [--hold 300] [--samples 12] [--visible]
       [--variants head-drag,head-nodrag,base-predrag] [--ref HEAD] [--base c86f87be]

Each variant is a git archive of apps/macos with one trace call inserted at the
selection onChange. head-nodrag removes only the row .itemProvider (onDrop
stays); base-predrag is the commit before native Task Dependencies added row drag.
No Todo.app, signing, Keychain, server or owner data is used.
"""
import argparse, hashlib, io, json, os, re, shutil, subprocess, tarfile, time
from pathlib import Path

ROOT = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
import sys
sys.path.insert(0, str(ROOT / 'apps/macos/scripts'))
import state_package  # the vault swap and the Keychain guard every runner uses
HERE = ROOT / 'apps/macos/PerfMeasurement'
parser = argparse.ArgumentParser()
parser.add_argument('evidence')
parser.add_argument('--hold', type=int, default=300)
parser.add_argument('--samples', type=int, default=12)
parser.add_argument('--visible', action='store_true')
parser.add_argument('--delivery', choices=['post', 'send'], default='post')
parser.add_argument('--policy', choices=['default', 'regular'], default='default')
parser.add_argument('--reuse-build', action='store_true')
parser.add_argument('--variants', default='head-drag,head-nodrag,base-predrag')
parser.add_argument('--ref', default='HEAD')
parser.add_argument('--base', default='c86f87be')
args = parser.parse_args()
evidence = Path(args.evidence).resolve()
evidence.mkdir(parents=True, exist_ok=False)
subprocess.run(['sh', str(ROOT / 'scripts/disk-guard.sh')], check=True)
refs = {'head': subprocess.check_output(['git', 'rev-parse', args.ref], cwd=ROOT, text=True).strip(),
        'base': subprocess.check_output(['git', 'rev-parse', args.base], cwd=ROOT, text=True).strip()}
MARKER = '.onChange(of: selection) { old, id in'
commands, provenance = [], {}

def run(argv, log, env=None):
    started = time.time()
    with (evidence / log).open('w') as output:
        code = subprocess.run([str(a) for a in argv], cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT).returncode
    commands.append(dict(argv=[str(a) for a in argv], exit=code, log=log, seconds=round(time.time() - started, 1), load1m=os.getloadavg()[0]))
    (evidence / 'commands.json').write_text(json.dumps(commands, indent=2) + '\n')
    return code

def prepare(variant):
    sha = refs['base' if variant == 'base-predrag' else 'head']
    target = ROOT / '.scratch/mac-press' / variant
    if target.exists(): shutil.rmtree(target / 'apps/macos/Sources', ignore_errors=True); shutil.rmtree(target / 'apps/macos/StateTests', ignore_errors=True)
    archive = subprocess.check_output(['git', 'archive', '--format=tar', sha, 'apps/macos/Sources', 'apps/macos/StateTests', 'apps/macos/API', 'apps/macos/Package.swift', 'apps/macos/Package.resolved', 'apps/macos/Tests', 'apps/macos/DesignSnapshots'], cwd=ROOT)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar: tar.extractall(target, filter='data')
    package = target / 'apps/macos'
    views = package / 'Sources/AppViews.swift'
    text = views.read_text(); assert text.count(MARKER) == 1, (variant, 'selection marker')
    views.write_text(text.replace(MARKER, MARKER + '\n                        PressReleaseTrace.handled()'))
    if variant == 'head-nodrag':
        drag = package / 'Sources/DependencyDrag.swift'
        text = drag.read_text()
        start = text.index('            .itemProvider {'); end = text.index('            .accessibilityIdentifier("dependency-drag-source-')
        drag.write_text(text[:start] + text[end:])
        assert '.itemProvider' not in drag.read_text()
    if variant == 'base-predrag':
        joined = ''.join(p.read_text() for p in (package / 'Sources').glob('*.swift'))
        assert '.itemProvider' not in joined and '.onDrag' not in joined, 'base must have no row drag'
    probe = package / 'PressProbe'
    shutil.rmtree(probe, ignore_errors=True); probe.mkdir()
    for source in (package / 'Sources').glob('*.swift'):
        if source.name != 'TodoApp.swift': shutil.copyfile(source, probe / source.name)
    state_package.swap_vault(probe)  # the in-memory vault, never the production one
    shutil.copyfile(HERE / 'PressReleaseTrace.swift', probe / 'PressReleaseTrace.swift')
    main = (HERE / 'PressRelease.swift').read_text()
    # Trees with catalog environment triggers get private notification centers, so the probe
    # window's activation does not start a refresh against the absent server.
    has_triggers = 'catalogNotifications: NotificationCenter' in (package / 'Sources/TodoModel.swift').read_text()
    main = main.replace('/*MODEL_INIT_EXTRA*/', ', catalogNotifications: NotificationCenter(), wakeNotifications: NotificationCenter()' if has_triggers else '')
    (probe / 'main.swift').write_text(main)
    manifest = package / 'Package.swift'
    text = manifest.read_text(); assert text.count('    targets: [') == 1
    manifest.write_text(text.replace('    targets: [', '    targets: [\n        .executableTarget(name: "PressProbe", dependencies: [.product(name: "TodoAPI", package: "API")], path: "PressProbe"),', 1))
    provenance[variant] = dict(commit=sha, sources={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(probe.glob('*.swift'))}, probe=hashlib.sha256((HERE / 'PressRelease.swift').read_bytes()).hexdigest())
    (evidence / 'provenance.json').write_text(json.dumps(dict(refs=refs, variants=provenance, hold_ms=args.hold, visible=args.visible, physical_input=False, app_launched=False, keychainGuard='keychain-guard-<variant>.json'), indent=2) + '\n')
    return package

results, keychain = {}, {}
for variant in args.variants.split(','):
    package = prepare(variant)
    scratch = ROOT / '.scratch/mac-press' / variant / 'build'
    env = {k: v for k, v in os.environ.items() if not k.startswith(('TODO_', 'MAC_'))}
    env.update(MAC_PRESS_OUTPUT=str(evidence / f'{variant}.json'), MAC_PRESS_HOLD_MS=str(args.hold), MAC_PRESS_SAMPLES=str(args.samples), MAC_PRESS_DELIVERY=args.delivery, **({'MAC_PRESS_POLICY': 'regular'} if args.policy == 'regular' else {}), **({'MAC_PRESS_VISIBLE': '1'} if args.visible else {}))
    code = run([ROOT / 'scripts/swift-slot.sh', 'swift', 'build', '-c', 'release', '--package-path', package, '--scratch-path', scratch, '--disable-automatic-resolution', '--jobs', '2', '--product', 'PressProbe'], f'{variant}-build.log')
    if code == 0:
        binary = scratch / 'release/PressProbe'
        keychain[variant] = state_package.checked(binary, evidence / f'keychain-guard-{variant}.json')['keychainLinked']
        code = run([binary], f'{variant}.log', env)
    results[variant] = code
(evidence / 'result.json').write_text(json.dumps(dict(exits=results, keychainLinked=keychain, status='PASS' if all(v == 0 for v in results.values()) else 'FAIL'), indent=2) + '\n')
raise SystemExit(0 if all(v == 0 for v in results.values()) else 1)
