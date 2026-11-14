#!/usr/bin/env python3
"""The one place every verification runner gets its Swift state package from.

Coordinator ruling, 2026-11-13: no test run links or calls the Keychain.

- `swap_vault(sources)` replaces a copied package's Sources/SessionVault.swift with the in-memory
  adapter (.agents/skills/verify-macos/fixtures/auth-epoch/SessionVault.swift). Product code is
  never edited; only copies are.
- `prepare()` mirrors apps/macos into .scratch/state-package/apps/macos (mtimes kept, so builds stay
  incremental) and swaps the vault there. Runners that used `--package-path apps/macos` use it.
- `guard(path)` reads every built Mach-O product under `path` (or the one file) with `nm -u` and
  reports any Security item or keychain call it links. A runner stops when `keychainLinked` is true,
  and a receipt's keychain field is copied from this result, never written as a constant.

CLI:
  state_package.py swift <swift args...>    the args may say --package-path apps/macos; a test run is
                                            split into build, guard, then test with --skip-build
  state_package.py guard <path> [receipt]   exit 3 if a keychain call is linked, 4 if no product was
                                            found, 2 if the path is empty or not a build product
  state_package.py prepare [--production-vault <dir>]   the mirror path; the production vault is
                                            only for the guard's own control

Control (the guard can fail): `prepare --production-vault <scratch dir>`, `swift build --build-tests`
that package into a scratch path, then `guard <scratch path>` exits 3 and names _SecItemAdd,
_SecItemCopyMatching, _SecItemUpdate, _SecItemDelete and _SecKeychainSetUserInteractionAllowed in
TodoStateProofPackageTests. The same build with the in-memory vault exits 0 and links no Security.
"""
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / '.agents/skills/verify-macos/fixtures/auth-epoch/SessionVault.swift'
MIRROR = ROOT / '.scratch/state-package/apps/macos'
# The Security item family the production vault uses, and the rest of the keychain API.
KEYCHAIN = re.compile(r'^_(SecItem|SecKeychain|SecAccess|SecTrustedApplication|SecACL|SecIdentity)')
MACHO = {b'\xcf\xfa\xed\xfe', b'\xce\xfa\xed\xfe', b'\xca\xfe\xba\xbe', b'\xbe\xba\xfe\xca'}


def swap_vault(sources: Path, production: bool = False) -> None:
    """Puts the in-memory vault in a copied package's Sources (written only when it differs)."""
    target = Path(sources) / 'SessionVault.swift'
    assert target.resolve() != (ROOT / 'apps/macos/Sources/SessionVault.swift').resolve(), 'never edit product code'
    wanted = (ROOT / 'apps/macos/Sources/SessionVault.swift' if production else FIXTURE).read_bytes()
    if not target.exists() or target.read_bytes() != wanted:
        target.write_bytes(wanted)


def prepare(mirror: Path = MIRROR, production_vault: bool = False) -> Path:
    """The state package as runners build it: apps/macos mirrored, with the in-memory vault."""
    mirror.mkdir(parents=True, exist_ok=True)
    subprocess.run(['rsync', '-a', '--delete', '--exclude', '.build', '--exclude', 'DerivedData', '--exclude', '.swiftpm',
                    '--exclude', 'Todo.xcodeproj', '--exclude', '/Sources/SessionVault.swift',
                    str(ROOT / 'apps/macos') + '/', str(mirror) + '/'], check=True)
    swap_vault(mirror / 'Sources', production=production_vault)
    # Failing-first and mutation runs: files from STATE_PACKAGE_OVERRIDE_DIR (paths relative to
    # apps/macos) replace the mirror's copies. Product code is never touched; the next prepare()
    # without it restores the mirror. SessionVault.swift cannot be overridden.
    overrides = os.environ.get('STATE_PACKAGE_OVERRIDE_DIR')
    if overrides:
        for source in sorted(Path(overrides).rglob('*')):
            if source.is_file():
                relative = source.relative_to(overrides)
                assert relative.name != 'SessionVault.swift', 'the vault is never overridden'
                (mirror / relative).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, mirror / relative)
                print(f'state_package: override {relative}', file=sys.stderr)
    return mirror


def products(path: Path) -> list:
    path = Path(path)
    candidates = [path] if path.is_file() else [p for p in path.rglob('*') if p.is_file() and not p.is_symlink() and os.access(p, os.X_OK)]
    found = []
    for candidate in candidates:
        if '.dSYM' in str(candidate) or candidate.suffix in ('.o', '.a', '.swiftmodule', '.json', '.sh', '.py'):
            continue
        with candidate.open('rb') as handle:
            if handle.read(4) in MACHO:
                found.append(candidate)
    return sorted(found)


BUILD_DIRECTORIES = {'.build', 'DerivedData', 'swift-build', 'build'}


class GuardRefused(SystemExit):
    pass


def checked_path(path) -> Path:
    """The guard reads only built products: a Mach-O file, or a directory inside a build directory.
    An empty argument, the checkout or any directory outside a build tree is refused (MAC-C1-S1-28)."""
    if path is None or str(path).strip() == '':
        raise GuardRefused('guard: no path given')
    path = Path(path).resolve()
    if not path.exists():
        raise GuardRefused(f'guard: {path} does not exist')
    if path.is_file():
        with path.open('rb') as handle:
            if handle.read(4) not in MACHO:
                raise GuardRefused(f'guard: {path} is not a built product')
        return path
    if not BUILD_DIRECTORIES & set(path.parts) or path == ROOT or path in ROOT.parents:
        raise GuardRefused(f'guard: {path} is not inside a build directory')
    return path


def guard(path: Path) -> dict:
    """What the built products link from Security; `keychainLinked` stops a run."""
    path = checked_path(path)
    keychain, other, frameworks = {}, {}, {}
    built = products(path)
    for product in built:
        symbols = subprocess.run(['nm', '-u', '-j', str(product)], capture_output=True, text=True).stdout.split()
        name = str(product.relative_to(ROOT)) if product.is_relative_to(ROOT) else str(product)
        linked = sorted({s for s in symbols if KEYCHAIN.match(s)})
        security = sorted({s for s in symbols if s.startswith('_Sec') and not KEYCHAIN.match(s)})
        if linked: keychain[name] = linked
        if security: other[name] = security
        libraries = subprocess.run(['otool', '-L', str(product)], capture_output=True, text=True).stdout
        frameworks[name] = 'Security.framework' in libraries
    return dict(products=len(built), keychainLinked=bool(keychain), keychainSymbols=keychain,
                otherSecuritySymbols=other, securityFrameworkLinked=sorted(k for k, v in frameworks.items() if v))


def write(result: dict, receipt) -> None:
    if receipt:
        Path(receipt).write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')


def checked(path: Path, receipt=None) -> dict:
    """guard() that stops the run when a keychain call is linked."""
    result = guard(path)
    write(result, receipt)
    if result['keychainLinked']:
        raise SystemExit(f"KEYCHAIN LINKED in test products: {result['keychainSymbols']}")
    if result['products'] == 0:
        raise SystemExit(f'no built product to check under {path}')
    return result


def _descendants(root: int) -> list:
    """Every live process under `root`, by parent id (a child may be in a group of its own:
    swift test starts swiftpm-testing-helper in a new process group)."""
    rows = subprocess.run(['/bin/ps', '-axo', 'pid=,ppid='], capture_output=True, text=True).stdout.split('\n')
    children = {}
    for row in rows:
        parts = row.split()
        if len(parts) == 2:
            children.setdefault(int(parts[1]), []).append(int(parts[0]))
    found, queue = [], [root]
    while queue:
        for child in children.get(queue.pop(), []):
            found.append(child); queue.append(child)
    return found


def _starts(pids) -> dict:
    """Each live pid's start time (ps lstart), so a process is told from a later one that reuses
    its pid (MAC-C11-S1-6). A zombie still has its start time; a pid that is gone is left out."""
    pids = sorted(set(pids))
    if not pids:
        return {}
    rows = subprocess.run(['/bin/ps', '-o', 'pid=,lstart=', '-p', ','.join(map(str, pids))], capture_output=True, text=True).stdout.splitlines()
    starts = {}
    for row in rows:
        pid, _, start = row.strip().partition(' ')
        if pid.isdigit():
            starts[int(pid)] = start.strip()
    return starts


def _signal(known: dict, sig) -> None:
    """Signals each process in `known` (pid -> start time) that is still that process."""
    current = _starts(known)
    for pid, start in known.items():
        if current.get(pid) != start:
            continue  # gone, or a later process that reuses the pid
        try:
            os.kill(pid, sig)
        except (ProcessLookupError, PermissionError):
            pass


def _alive(known: dict) -> list:
    """The processes in `known` that are still running as themselves (not zombies)."""
    if not known:
        return []
    current = _starts(known)
    rows = subprocess.run(['/bin/ps', '-o', 'pid=,stat=', '-p', ','.join(map(str, sorted(known)))], capture_output=True, text=True).stdout.splitlines()
    zombies = {int(r.split()[0]) for r in rows if len(r.split()) == 2 and r.split()[1].startswith('Z')}
    return [pid for pid, start in known.items() if current.get(pid) == start and pid not in zombies]


def _stop_tree(process) -> None:
    """Stops the child and everything it started: freezes the whole tree (SIGSTOP until no new
    process appears), then SIGTERM and SIGCONT, up to 3 s, then SIGKILL for what is left.
    Every signal names a process by pid and start time (MAC-C11-S1-6). A child already reaped is
    not touched: its pid, and the processes under it, may belong to someone else by now. Not
    covered: a descendant whose parent ended before the freeze is re-parented to launchd and is
    not found, and a SIGKILL of this runner cannot be handled."""
    if process.poll() is not None:
        return
    frozen = {}
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        listed = _starts([process.pid] + _descendants(process.pid))
        current = {pid: start for pid, start in listed.items() if pid not in frozen}
        if not current:
            break
        _signal(current, signal.SIGSTOP)
        frozen.update(current)
    _signal(frozen, signal.SIGTERM)
    _signal(frozen, signal.SIGCONT)
    deadline = time.monotonic() + 3
    others = {pid: start for pid, start in frozen.items() if pid != process.pid}
    while time.monotonic() < deadline:
        process.poll()
        if not _alive(others) and process.returncode is not None:
            return
        time.sleep(0.05)
    # Once the child is reaped its pid is left out; every pid is checked against its start time.
    _signal(frozen if process.returncode is None else others, signal.SIGKILL)
    process.poll()


_running = None


def _stop_requested(signum, frame):
    """A stop sent to this process (a harness's time limit, an owner's cleanup) stops everything
    the running Swift command started before this process ends."""
    if _running is not None:
        _stop_tree(_running)
    raise SystemExit(128 + signum)


def grouped_run(argv, timeout=None, **popen):
    """Runs `argv` and, when this process is asked to stop (SIGTERM, SIGINT, SIGHUP) or the time
    limit passes, stops it and everything it started, so no test helper is left orphaned under
    launchd (coordinator, candidate 11: a stopped state-suite run left swiftpm-testing-helper for
    two hours). The child stays in this session, so an owner that stops the whole session still
    reaches it. Returns (exit code, stdout); 124 at the time limit."""
    global _running
    previous = {sig: signal.signal(sig, _stop_requested) for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP)}
    try:
        _running = subprocess.Popen(argv, **popen)
        try:
            stdout, _ = _running.communicate(timeout=timeout)
            return _running.returncode, stdout
        except subprocess.TimeoutExpired:
            print(f'state_package: time limit of {timeout} s reached; stopping the run and everything it started', file=sys.stderr, flush=True)
            _stop_tree(_running)
            stdout, _ = _running.communicate()
            return 124, stdout
    finally:
        _running = None
        for sig, handler in previous.items():
            signal.signal(sig, handler)


def _option(args, *names):
    for index, arg in enumerate(args):
        if arg in names and index + 1 < len(args): return args[index + 1]
    return None


def _limit():
    """STATE_PACKAGE_TIMEOUT: seconds for each Swift invocation; none when unset."""
    value = os.environ.get('STATE_PACKAGE_TIMEOUT')
    return float(value) if value else None


def swift(args: list) -> int:
    """`swift <args>` against the mirror; a test run is built, guarded, then run with --skip-build."""
    args = list(args)
    package = _option(args, '--package-path')
    if package in (None, 'apps/macos', str(ROOT / 'apps/macos')):
        mirror = prepare()
        if package is None: args += ['--package-path', str(mirror)]
        else: args[args.index('--package-path') + 1] = str(mirror)
    package = Path(_option(args, '--package-path'))
    scratch = Path(_option(args, '--scratch-path') or package / '.build')
    receipt = os.environ.get('STATE_PACKAGE_RECEIPT')
    if args[0] == 'test':
        if '--skip-build' not in args:
            keep = ('--package-path', '--scratch-path', '--configuration', '-c', '--jobs', '-j', '--sanitize')
            build = ['build', '--build-tests']
            for index, arg in enumerate(args):
                if arg in keep and index + 1 < len(args): build += [arg, args[index + 1]]
                elif arg in ('--disable-automatic-resolution', '--skip-update'): build.append(arg)
            # `swift test` makes release modules testable itself; a separate release build must ask.
            if (_option(args, '--configuration', '-c') or 'debug') == 'release': build += ['-Xswiftc', '-enable-testing']
            code = grouped_run(['swift'] + build, timeout=_limit())[0]
            if code: return code
            args.append('--skip-build')
        checked(scratch, receipt)
        return grouped_run(['swift'] + args, timeout=_limit())[0]
    code = grouped_run(['swift'] + args, timeout=_limit())[0]
    if code == 0 and '--build-tests' in args: checked(scratch, receipt)
    return code


if __name__ == '__main__':
    command, rest = sys.argv[1], sys.argv[2:]
    if command == 'swift':
        # A stop at any point of the run (also between its steps) ends it cleanly.
        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(sig, _stop_requested)
        sys.exit(swift(rest))
    if command == 'guard':
        try:
            result = guard(rest[0] if rest else None)
        except GuardRefused as refused:
            print(refused, file=sys.stderr); sys.exit(2)
        write(result, rest[1] if len(rest) > 1 else None)
        print(json.dumps(result, sort_keys=True))
        # 3: a Keychain call is linked; 4: nothing built to check, so nothing is known.
        sys.exit(3 if result['keychainLinked'] else 4 if result['products'] == 0 else 0)
    if command == 'prepare':
        production = '--production-vault' in rest
        mirror = Path(rest[rest.index('--production-vault') + 1]) if production else MIRROR
        print(prepare(mirror, production_vault=production))
