#!/usr/bin/env python3
"""Follow-up 91's control: a gate never builds in a folder that has seen another source tree.

Usage:
  python3 .agents/skills/verify-macos/scripts/verify-build-stamp.py <new evidence dir>
  python3 .agents/skills/verify-macos/scripts/verify-build-stamp.py <new evidence dir> --sequence <before> <after>

Mechanics (always; no build, scratch folders only), against state_package.fresh_build_folder:
1. a build folder without a stamp (built before the rule) is removed and stamped;
2. the same stamp keeps it, with its files (two gates of one head share a folder);
3. another source tree removes it, and the receipt names what changed;
4. a folder that holds files but is not a build folder is refused, never removed;
5. `state_package.py swift test --skip-build` refuses a folder whose stamp is not the package's (exit 8);
6. STATE_PACKAGE_INCREMENTAL=1 keeps the folder and says so (a worker's own loop), and gates.py
   lists it among the variables it refuses.

Sequence (--sequence; switches this checkout, so it runs from a copy in scratch and switches back):
the candidate 14 reproduction with the rule. apps/macos/.build must be absent. At <before> (a
commit without the rule, e.g. 14803682) verify-client-diagnostics --retirement-stress builds the
release folder and passes. At <after> (a commit with the rule and another client) the same runner
finds the unstamped folder, removes it, builds clean and passes; a second run at <after> neither
removes the folder nor recompiles. Without the rule the <after> runs crash (SIGBUS destroying the
generated signIn output: reports/mac-c14-f8cad9ef/stale-build-repro).
"""
import json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
evidence = Path(sys.argv[1]).resolve()
sequence = sys.argv[2:5] if len(sys.argv) > 2 and sys.argv[2] == '--sequence' else None

if sequence and os.environ.get('BUILD_STAMP_CONTROL_COPY') != '1':
    # The sequence switches commits; run from a copy so this file is not switched away under it.
    copy = ROOT / '.scratch/verify-build-stamp-control.py'
    copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(__file__, copy)
    os.execve(sys.executable, [sys.executable, str(copy), *sys.argv[1:]], dict(os.environ, BUILD_STAMP_CONTROL_COPY='1'))

evidence.mkdir(parents=True, exist_ok=False)
sys.path.insert(0, str(ROOT / 'apps/macos/scripts'))
import state_package

steps, result = [], dict(passed=False)


def mechanics():
    scratch = Path(tempfile.mkdtemp(prefix='build-stamp-control-'))
    try:
        package = scratch / 'package'
        (package / 'API/Sources/TodoAPI').mkdir(parents=True)
        (package / 'Package.swift').write_text('// a package\n')
        (package / 'API/generated-sources.json').write_text('{"files": 1}\n')
        (package / 'API/Sources/TodoAPI/ContractIdentity.swift').write_text('public enum ContractIdentity { public static let id = "' + '1' * 64 + '" }\n')
        folder = scratch / 'build'
        (folder / 'arm64-apple-macosx/debug').mkdir(parents=True)
        (folder / 'arm64-apple-macosx/debug/old.o').write_text('built before the rule')
        first = state_package.fresh_build_folder(folder, package)
        assert first['cleared'] and first['cleared'].startswith('no stamp'), first
        assert not (folder / 'arm64-apple-macosx').exists(), 'the unstamped folder was not emptied'
        steps.append(dict(step='1 unstamped folder removed', receipt=first['cleared']))
        (folder / 'arm64-apple-macosx/debug').mkdir(parents=True)
        (folder / 'arm64-apple-macosx/debug/kept.o').write_text('built for this tree')
        second = state_package.fresh_build_folder(folder, package)
        assert second['cleared'] is None and (folder / 'arm64-apple-macosx/debug/kept.o').exists(), second
        steps.append(dict(step='2 same stamp keeps the folder', kept=True))
        (package / 'API/generated-sources.json').write_text('{"files": 2}\n')
        third = state_package.fresh_build_folder(folder, package)
        assert third['cleared'] and 'generatedSources' in third['cleared'] and 'sourceTree' in third['cleared'], third
        assert not (folder / 'arm64-apple-macosx').exists()
        steps.append(dict(step='3 another source tree removes it', receipt=third['cleared']))
        other = scratch / 'not-a-build'
        other.mkdir()
        (other / 'notes.txt').write_text('keep me')
        try:
            state_package.fresh_build_folder(other, package)
            raise AssertionError('a folder that is not a build folder was accepted')
        except SystemExit as refused:
            assert (other / 'notes.txt').exists() and 'not a build folder' in str(refused)
        steps.append(dict(step='4 a non-build folder is refused', kept=True))
        (folder / 'arm64-apple-macosx').mkdir()
        (folder / state_package.BUILD_STAMP).write_text(json.dumps(dict(sourceTree='another tree')) + '\n')
        refused = subprocess.run([sys.executable, str(ROOT / 'apps/macos/scripts/state_package.py'), 'swift', 'test', '--skip-build',
                                  '--package-path', str(package), '--scratch-path', str(folder)], capture_output=True, text=True)
        assert refused.returncode == state_package.STALE_FOLDER_EXIT and 'follow-up 91' in refused.stderr, (refused.returncode, refused.stderr[-300:])
        steps.append(dict(step='5 --skip-build refuses a stale folder', exit=refused.returncode))
        os.environ['STATE_PACKAGE_INCREMENTAL'] = '1'
        try:
            kept = state_package.fresh_build_folder(folder, package)
        finally:
            del os.environ['STATE_PACKAGE_INCREMENTAL']
        assert kept['cleared'] is None and 'kept' in kept and (folder / 'arm64-apple-macosx').exists(), kept
        gates = (ROOT / '.agents/skills/verify-macos/scripts/gates.py').read_text()
        assert "'STATE_PACKAGE_INCREMENTAL'" in gates.split('REFUSED = ', 1)[1].split('\n', 1)[0], 'gates.py does not refuse the opt-out'
        steps.append(dict(step='6 the worker opt-out keeps the folder; gates.py refuses it', kept=True))
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def git(*args):
    return subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True, text=True, check=True).stdout.strip()


def stress(name):
    out = evidence / name
    code = subprocess.run([sys.executable, str(ROOT / '.agents/skills/verify-client-diagnostics/scripts/verify.py'), str(out), '--retirement-stress'],
                          cwd=ROOT, stdout=open(evidence / f'{name}.log', 'w'), stderr=subprocess.STDOUT, env=dict(os.environ, STATE_PACKAGE_TIMEOUT='2400')).returncode
    log = (out / 'swift.log').read_text(errors='replace') if (out / 'swift.log').exists() else ''
    row = dict(step=name, head=git('rev-parse', '--short', 'HEAD'), exit=code, passed='Test run with 2 tests in 1 suite passed' in log,
               removedFolder='removing build folder' in log, compiled=sum(1 for line in log.splitlines() if 'Compiling ' in line),
               signal=next((line.strip() for line in log.splitlines() if 'unexpected signal' in line), None))
    steps.append(row)
    return row


def run_sequence(before, after):
    assert git('status', '--porcelain') == '', 'the checkout must be clean'
    assert not (ROOT / 'apps/macos/.build').exists(), 'apps/macos/.build must be absent: the control owns it'
    origin = git('rev-parse', '--abbrev-ref', 'HEAD')
    origin = origin if origin != 'HEAD' else git('rev-parse', 'HEAD')
    try:
        git('switch', '-q', '--detach', before)
        a = stress('A-before-the-rule')
        assert a['exit'] == 0 and a['passed'], a
        git('switch', '-q', '--detach', after)
        b1 = stress('B1-after-unstamped-folder')
        assert b1['exit'] == 0 and b1['passed'] and b1['removedFolder'], b1
        b2 = stress('B2-after-same-head')
        assert b2['exit'] == 0 and b2['passed'] and not b2['removedFolder'], b2
    finally:
        git('switch', '-q', origin) if not all(c in '0123456789abcdef' for c in origin) else git('switch', '-q', '--detach', origin)


try:
    mechanics()
    if sequence:
        run_sequence(sequence[1], sequence[2])
    result = dict(passed=True)
finally:
    result.update(steps=steps, appLaunched=False, keychain='no Keychain: state_package.py guards every build')
    (evidence / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
