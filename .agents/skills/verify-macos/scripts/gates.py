#!/usr/bin/env python3
"""The Mac gate cycle: HOLD and the 18 gates, in order, on the checked-out head.

Usage: python3 .agents/skills/verify-macos/scripts/gates.py
       (verify-dag-formal's public check needs its preserved before-binary,
       .scratch/bin/dag-f-todo-1aa1db7f…, with its provenance; the check verifies its digest)
       (GATE_DISCOVERY_SWIFT_REUSE=<docs/evidence/discovery-formal/swift-*> reuses a discovery build)

Inputs: .scratch/bin/build.json from `bun .agents/skills/verify-cli/scripts/cache-binaries.ts`; the
run stops if apps/server, apps/cli or packages changed since that build's head. Every command asserts
the same head and a clean tree, waits while free disk is under 40 GiB (one WAITING-DISK line) and
until neither Todo app is frontmost with no input for a minute (one WAITING-OWNER line), and
stops on the first non-zero exit. Evidence: docs/evidence/mac-perf/c4/controls-final-<head>, with
result.json, commands.json and one log per gate. Keychain: every runner builds through
apps/macos/scripts/state_package.py, and result.json copies keychain_linked from the guard receipts.
SSE is carried, not run: see `carried` below; update it whenever the server changes.
Nothing is signed, launched or pushed.
"""
import hashlib, json, os, subprocess, sys, time
from pathlib import Path
root = Path(__file__).resolve().parents[4]
os.chdir(root)
sys.path.insert(0, str(root / '.agents/skills/verify-macos-lifecycle/scripts'))
from owned_process import OwnedCommands
sys.path.insert(0, str(root / 'apps/macos/scripts'))
import state_package
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
evidence = root / f'docs/evidence/mac-perf/c4/controls-final-{head[:8]}'
evidence.mkdir(parents=True, exist_ok=False)
owned = OwnedCommands(evidence / 'command-unsafe')
env = {k: v for k, v in os.environ.items() if not k.startswith(('TODO_', 'MAC_PERF_'))}
# The merged head's own server, CLI and seed (integ/server 2a840b55 merged): the server the owner gets.
build = json.loads((root / '.scratch/bin/build.json').read_text())
# Reused, not rebuilt: valid only if the server, CLI and packages are unchanged since the build's head.
assert subprocess.run(['git', 'diff', '--quiet', build['head'], head, '--', 'apps/server', 'apps/cli', 'packages']).returncode == 0, ('binaries built from other server sources', build['head'], head)
env.update(TODO_SERVER_BINARY=build['server'], TODO_CLI_BINARY=build['cli'], TODO_SEED_BINARY=build['seed'])
# The gate head must be clean: nothing uncommitted is excluded.
allowed_dirty = set()
carried = {
    'sse': 'integ/c9-server 675aab82 verify-sse qualification (docs/decisions/ui-speed/c9-server-integration.md, evidence docs/evidence/ui-speed/integ-wake c9-*): verify-sse 0 (71 focused tests, three wire witnesses, 3,696 compiled compositions, CLI fallback 253-256 ms) and the 37 gated stream scenarios 37/37. This head carries the same apps/server, apps/cli and packages bytes (merge 64fb5f16); update this whenever the server changes'
}
commands = []
def wait_for_disk(name):
    # Coordinator (candidate 9): under 40 GiB free a stage does not start; say so and wait.
    said = False
    while True:
        stat = os.statvfs('/System/Volumes/Data'); free = stat.f_bavail * stat.f_frsize
        if free >= 40 * 1024 ** 3: return
        if not said: print(f'WAITING-DISK before {name}: {free / 1024 ** 3:.1f} GiB free, under 40 GiB', flush=True); said = True
        time.sleep(30)
def quarantine_leftovers(name):
    # A gate's own Bun compile (the CLI tests' `bun build --compile`) can leave a `.*.bun-build`
    # file in the tree; it is moved to a quarantine outside the checkout before the next clean-tree check
    # instead of stopping the run (MAC-C1-S1-28). Anything else uncommitted still stops it.
    moved = subprocess.run(['sh', '.agents/skills/verify-macos/scripts/quarantine-bun-build.sh'], capture_output=True, text=True)
    (evidence / f'quarantine-before-{name}.log').write_text(moved.stdout + moved.stderr)
    assert moved.returncode == 0, ('a Bun leftover is still held by a process', name, moved.stdout)
def wait_for_quiet(name):
    # The owner may be at the Mac: a gate loads the CPU (and a few show offscreen work), so it starts
    # only when neither Todo app is frontmost and there has been no input for a minute.
    said = False
    while True:
        front = subprocess.run(['lsappinfo', 'front'], capture_output=True, text=True).stdout.strip()
        bundle = subprocess.run(['lsappinfo', 'info', '-only', 'bundleid', front], capture_output=True, text=True).stdout.split('=')[-1].strip().strip('"')
        idle = next((int(line.split('=')[-1]) / 1e9 for line in subprocess.run(['ioreg', '-c', 'IOHIDSystem'], capture_output=True, text=True).stdout.splitlines() if 'HIDIdleTime' in line), 0)
        if bundle not in ('local.todo.Todo', 'dev.todo.electron') and idle >= 60: return
        if not said: print(f'WAITING-OWNER before {name}: {bundle} in front, idle {idle:.0f} s', flush=True); said = True
        time.sleep(30)
def run(name, args, timeout=7200, extra=None):
    wait_for_disk(name)
    wait_for_quiet(name)
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == head
    quarantine_leftovers(name)
    dirty = set(subprocess.check_output(['git', 'status', '--porcelain'], text=True).splitlines())
    assert dirty <= allowed_dirty, ('Gate head is dirty', sorted(dirty - allowed_dirty))
    stat = os.statvfs(root)
    assert stat.f_bavail * stat.f_frsize >= 25_000_000_000, 'Disk below 25 GB floor'
    start = time.time(); load = os.getloadavg()
    result = owned.run([str(a) for a in args], dict(env, **(extra or {})), timeout=timeout)
    (evidence / (name + '.log')).write_text(result.stdout + result.stderr)
    commands.append(dict(name=name, command=[str(a) for a in args], exit=result.returncode, started=start, finished=time.time(), load_at_start=load, load_at_finish=os.getloadavg(), head=head))
    (evidence / 'commands.json').write_text(json.dumps(commands, indent=2))
    print(name, result.returncode, flush=True)
    assert result.returncode == 0, name
# The guard receipt each gate that builds Swift must write (the discovery audit is added when it runs).
expected_guards = {'hold': 'hold/keychain-guard.json', 'sign-out-stream': 'sign-out-stream/keychain-guard.json',
                   'stress': 'stress/keychain-guard.json', 'race': 'race/keychain-guard.json',
                   'connections': 'connections/keychain-guard.json', 'sockets': 'sockets/keychain-guard.json',
                   'restart': 'restart/keychain-guard.json', 'design': 'design/keychain-guard.json',
                   'state': 'state-keychain-guard.json', 'diagnostics': 'diagnostics/keychain-guard.json',
                   'idle': 'idle/keychain-guard.json', 'subscribers': 'subscribers/keychain-guard.json'}
def keychain_summary():
    # From the guard receipts, never a constant. A gate that ran but whose guard did not (no receipt,
    # or a null one) is unknown, and one unknown makes the whole answer unknown (MAC-C1-S1-28).
    ran = {c['name'] for c in commands}
    values = {}
    for gate, receipt in expected_guards.items():
        if gate not in ran: continue
        path = evidence / receipt
        content = json.loads(path.read_text()) if path.exists() and path.read_text().strip() else None
        values[receipt] = content.get('keychainLinked') if isinstance(content, dict) else None
    for extra in sorted(evidence.glob('discovery-*-keychain-guard.json')):
        content = json.loads(extra.read_text()) if extra.read_text().strip() else None
        values[extra.name] = content.get('keychainLinked') if isinstance(content, dict) else None
    if 'discovery-formal' in ran and not any(k.startswith('discovery-') for k in values):
        values['discovery-formal: no new swift-build to audit'] = None
    unknown = sorted(k for k, v in values.items() if v is None)
    answer = None if unknown or not values else any(values.values())
    return dict(anyLinked=answer, unknown=unknown, receipts=values)
try:
    helper = '.agents/skills/verify-client-diagnostics/scripts/verify.py'
    # HOLD (the live state tests against the scratch server) is a gate from now on, so a ruling
    # cannot leave them stale outside the cycle (coordinator ruling, 2026-11-13, point 5).
    run('hold', ['scripts/swift-slot.sh', 'apps/macos/scripts/verify-write-state.py', evidence / 'hold'])
    run('sign-out-stream', ['scripts/swift-slot.sh', '.agents/skills/verify-macos/scripts/verify-sign-out-stream.py', evidence / 'sign-out-stream', head])
    run('stress', [helper, evidence / 'stress', '--retirement-stress'])
    run('race', [helper, evidence / 'race', '--retirement-only'])
    run('connections', [helper, evidence / 'connections', '--connections-only'])
    run('sockets', [helper, evidence / 'sockets', '--sockets-only'])
    run('restart', [helper, evidence / 'restart', '--restart-only'])
    run('design', ['scripts/swift-slot.sh', 'apps/macos/scripts/verify-design.py', evidence / 'design'])
    run('state', ['scripts/swift-slot.sh', 'python3', 'apps/macos/scripts/state_package.py', 'swift', 'test', '--package-path', 'apps/macos', '--scratch-path', 'apps/macos/DerivedData/StateProof', '--disable-automatic-resolution', '--jobs', '2', '--no-parallel'], extra=dict(STATE_PACKAGE_RECEIPT=str(evidence / 'state-keychain-guard.json')))
    run('diagnostics', [helper, evidence / 'diagnostics'])
    run('unsigned', ['scripts/swift-slot.sh', 'xcodebuild', '-project', 'apps/macos/Todo.xcodeproj', '-scheme', 'Todo', '-configuration', 'Release', '-destination', 'platform=macOS', '-derivedDataPath', 'apps/macos/DerivedData/MacCandidate1', '-disableAutomaticPackageResolution', '-onlyUsePackageVersionsFromResolvedFile', 'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'ONLY_ACTIVE_ARCH=YES', 'ARCHS=arm64', 'build'])
    run('idle', [helper, evidence / 'idle', '--stream-only', '--long-idle'])
    run('subscribers', [helper, evidence / 'subscribers', '--subscribers-only'])
    run('discovery-prepare', ['bun', '.agents/skills/verify-discovery-formal/prepare-inputs.ts', head])
    run('discovery-quarantine-temporaries', ['sh', '.agents/skills/verify-macos/scripts/quarantine-bun-build.sh'])
    if os.environ.get('GATE_DISCOVERY_SWIFT_REUSE'): env['TODO_DISCOVERY_SWIFT_REUSE'] = os.environ['GATE_DISCOVERY_SWIFT_REUSE']
    before = set((root / 'docs/evidence/discovery-formal').glob('swift-*'))
    run('discovery-formal', ['bun', '.agents/skills/verify-discovery-formal/check.ts', head])
    # check-swift.ts is pinned by the Discovery mapping, so its guard is outside and after the run:
    # an audit of the products it built, not a stop before they ran.
    reused = {Path(os.environ['GATE_DISCOVERY_SWIFT_REUSE'])} if os.environ.get('GATE_DISCOVERY_SWIFT_REUSE') else set()
    for made in sorted((set((root / 'docs/evidence/discovery-formal').glob('swift-*')) - before) | reused):
        if (made / 'swift-build').exists():
            audit = state_package.guard(made / 'swift-build'); state_package.write(audit, evidence / f'discovery-{made.name}-keychain-guard.json')
            assert not audit['keychainLinked'], ('discovery Swift products link the Keychain', audit['keychainSymbols'])
    run('task-search-formal', ['bun', '.agents/skills/verify-task-search-formal/check.ts'])
    # The DAG mapping fences the Dependency client's Swift files (public-coverage.json): a Swift change
    # must never leave them stale again (coordinator, candidate 9). This runs the public check, which
    # asserts every fence against the product at public-pin.json's commit. The full check.mjs also
    # requires production-pin.json to name the same product; that pin certifies the server line's
    # product and is not moved by the Mac line.
    (root / 'docs/evidence/dag-formal').mkdir(parents=True, exist_ok=True)
    run('dag-public', ['bun', '.agents/skills/verify-dag-formal/public-check.mjs'])
    run('root', ['scripts/swift-slot.sh', '/usr/bin/lockf', '-k', '/tmp/todo-pnpm-check.lock', 'pnpm', 'check'])
    run('doc-links', ['node', 'scripts/check-doc-links.mjs', 'HEAD'])
    keychain = keychain_summary()
    assert keychain['anyLinked'] is False, ('Keychain answer is not a clean no', keychain)
    result = dict(result='PASS', errors=0, head=head, gates=len(commands), carried=carried, excluded_uncommitted=sorted(allowed_dirty), signed=False, app_launched=False, keychain_linked=keychain, pushed=False)
except BaseException as error:
    result = dict(result='FAIL', errors=1, head=head, gates_finished=len(commands), reason=repr(error), carried=carried)
    raise
finally:
    (evidence / 'result.json').write_text(json.dumps(result, indent=2))
