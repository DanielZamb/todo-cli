#!/usr/bin/env python3
"""The Mac gate cycle: HOLD and the 18 gates, in order, on the checked-out head.

Usage: python3 .agents/skills/verify-macos/scripts/gates.py
       (GATE_DISCOVERY_SWIFT_REUSE=<docs/evidence/discovery-formal/swift-*> reuses a discovery build)

Inputs: .scratch/bin/build.json from `bun .agents/skills/verify-cli/scripts/cache-binaries.ts`; the
run stops if apps/server, apps/cli or packages changed since that build's head. Every command asserts
the same head and a clean tree, waits while free disk is under 35 GiB (one WAITING-DISK line), and
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
    'sse': 'integ/server 2a840b55 verify-sse qualification (docs/evidence/ui-speed/integ-server; reports/integ-server.md: all 37 stream scenarios and the restore/Purge integration pass). This head carries the same apps/server, apps/cli and packages bytes: this side changes none of them relative to 6b167266, and integ/server none of apps/macos',
}
commands = []
def wait_for_disk(name):
    # Coordinator, 2026-11-13: under 35 GiB free a stage does not start; say so and wait.
    said = False
    while True:
        stat = os.statvfs('/System/Volumes/Data'); free = stat.f_bavail * stat.f_frsize
        if free >= 35 * 1024 ** 3: return
        if not said: print(f'WAITING-DISK before {name}: {free / 1024 ** 3:.1f} GiB free, under 35 GiB', flush=True); said = True
        time.sleep(30)
def run(name, args, timeout=7200, extra=None):
    wait_for_disk(name)
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() == head
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
def keychain_summary():
    # From every guard receipt the gates wrote, never a constant; None if a gate wrote none.
    receipts = sorted(evidence.rglob('*keychain-guard*.json'))
    values = {str(r.relative_to(evidence)): json.loads(r.read_text())['keychainLinked'] for r in receipts if r.read_text().strip() != 'null'}
    return dict(anyLinked=any(values.values()) if values else None, receipts=values)
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
    for made in sorted(set((root / 'docs/evidence/discovery-formal').glob('swift-*')) - before):
        if (made / 'swift-build').exists():
            audit = state_package.guard(made / 'swift-build'); state_package.write(audit, evidence / f'discovery-{made.name}-keychain-guard.json')
            assert not audit['keychainLinked'], ('discovery Swift products link the Keychain', audit['keychainSymbols'])
    run('task-search-formal', ['bun', '.agents/skills/verify-task-search-formal/check.ts'])
    run('root', ['scripts/swift-slot.sh', '/usr/bin/lockf', '-k', '/tmp/todo-pnpm-check.lock', 'pnpm', 'check'])
    run('doc-links', ['node', 'scripts/check-doc-links.mjs', 'HEAD'])
    result = dict(result='PASS', errors=0, head=head, gates=len(commands), carried=carried, excluded_uncommitted=sorted(allowed_dirty), signed=False, app_launched=False, keychain_linked=keychain_summary(), pushed=False)
except BaseException as error:
    result = dict(result='FAIL', errors=1, head=head, gates_finished=len(commands), reason=repr(error), carried=carried)
    raise
finally:
    (evidence / 'result.json').write_text(json.dumps(result, indent=2))
