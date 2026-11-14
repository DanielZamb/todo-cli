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
import subprocess
import sys
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


def _option(args, *names):
    for index, arg in enumerate(args):
        if arg in names and index + 1 < len(args): return args[index + 1]
    return None


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
            code = subprocess.run(['swift'] + build).returncode
            if code: return code
            args.append('--skip-build')
        checked(scratch, receipt)
        return subprocess.run(['swift'] + args).returncode
    code = subprocess.run(['swift'] + args).returncode
    if code == 0 and '--build-tests' in args: checked(scratch, receipt)
    return code


if __name__ == '__main__':
    command, rest = sys.argv[1], sys.argv[2:]
    if command == 'swift':
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
