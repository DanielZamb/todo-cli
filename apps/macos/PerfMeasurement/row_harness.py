#!/usr/bin/env python3
"""Follow-up 80's row-selection harness: keyboard selection measured as the owner's journal measures it.

Usage: row_harness.py <new evidence dir> [--commit REV] [--rounds N] [--rows N] [--rich] [--height PT]

1. Waits until the owner is away, because the harness window is on screen and frontmost: neither
   Todo app frontmost, no input at the Mac for a minute, and a 1-minute load under 30, all held for
   two minutes.
2. Builds REV (default HEAD) from `git archive`, with the current RowSelectionHarnessTests.swift laid
   over so a base commit without it measures the same way (paired runs), under scripts/swift-slot.sh
   and the state package's Keychain guard, with a time limit on each Swift invocation.
3. Runs RowSelectionHarnessTests outside the slot, without parallelism, and writes result.json: the
   cumulative times from the input and the three steps (native commit to handler, handler to
   publication, publication to layout), median and p90, from the journal's own events.

Calibration (candidate 14, on 370f6485, at 800 pt with --rich): total median 110.8 ms against the
owner's journal's 107 ms; publication to layout 58.5 ms against 56.8 ms. The plain fixture leaves
out what the owner's rows carry (Dependencies, due dates, several Tags, long descriptions) and
measures less. Pair runs: base and change alternately, same rounds, owner away for each.

Never launches Todo.app, signs or touches Keychain; the model has no network (a refusing transport)
and a synthetic credential.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / 'apps/macos/scripts'))
import state_package  # the vault swap and the Keychain guard every runner uses

TODO_BUNDLES = ('local.todo.Todo', 'dev.todo.electron')


def owner_away():
    front = subprocess.run(['lsappinfo', 'front'], capture_output=True, text=True).stdout.strip()
    bundle = subprocess.run(['lsappinfo', 'info', '-only', 'bundleid', front], capture_output=True, text=True).stdout.split('=')[-1].strip().strip('"')
    idle = next((int(line.split('=')[-1]) / 1e9 for line in subprocess.run(['ioreg', '-c', 'IOHIDSystem'], capture_output=True, text=True).stdout.splitlines() if 'HIDIdleTime' in line), 0)
    return dict(frontmost=bundle, idle_seconds=round(idle), load_1m=os.getloadavg()[0],
                away=bundle not in TODO_BUNDLES and idle >= 60 and os.getloadavg()[0] < 30)


def wait_for_owner_away(receipt):
    since = None
    started = time.monotonic()
    while True:
        status = owner_away()
        since = (since or time.monotonic()) if status['away'] else None
        status.update(held_seconds=round(time.monotonic() - since) if since else 0, waited_seconds=round(time.monotonic() - started))
        receipt.write_text(json.dumps(status, indent=2) + '\n')
        if since and time.monotonic() - since >= 120:
            return status
        time.sleep(10)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('evidence')
    parser.add_argument('--commit', default='HEAD')
    parser.add_argument('--rounds', type=int, default=120)
    parser.add_argument('--rows', type=int, default=150)
    parser.add_argument('--rich', action='store_true')
    parser.add_argument('--height', type=int, default=800)
    parser.add_argument('--timeout', type=int, default=2400, help='seconds for each Swift invocation')
    args = parser.parse_args()
    evidence = Path(args.evidence).resolve()
    evidence.mkdir(parents=True, exist_ok=False)
    commit = subprocess.check_output(['git', 'rev-parse', args.commit], cwd=ROOT, text=True).strip()
    package_root = Path(tempfile.mkdtemp(prefix='row-harness-'))
    try:
        archive = subprocess.run(['git', 'archive', commit, 'apps/macos'], cwd=ROOT, capture_output=True, check=True).stdout
        subprocess.run(['tar', '-x', '-C', str(package_root)], input=archive, check=True)
        package = package_root / 'apps/macos'
        if (ROOT / 'apps/macos/API/.build').exists():
            shutil.copytree(ROOT / 'apps/macos/API/.build', package / 'API/.build', symlinks=True)
        state_package.swap_vault(package / 'Sources')
        shutil.copyfile(ROOT / 'apps/macos/StateTests/RowSelectionHarnessTests.swift', package / 'StateTests/RowSelectionHarnessTests.swift')
        scratch = str(ROOT / 'apps/macos/DerivedData/RowHarness')
        common = ['--package-path', str(package), '--scratch-path', scratch, '--disable-automatic-resolution', '--jobs', '4']
        env = dict(os.environ, STATE_PACKAGE_TIMEOUT=str(args.timeout))
        with (evidence / 'build.log').open('w') as out:
            code = subprocess.run([str(ROOT / 'scripts/swift-slot.sh'), sys.executable, str(ROOT / 'apps/macos/scripts/state_package.py'), 'swift', 'build', '--build-tests', *common],
                                  cwd=ROOT, stdout=out, stderr=subprocess.STDOUT, env=dict(env, STATE_PACKAGE_RECEIPT=str(evidence / 'guard-build.json'))).returncode
        if code:
            (evidence / 'result.json').write_text(json.dumps(dict(commit=commit, passed=False, failed='build', exit=code), indent=2) + '\n')
            return code
        away = wait_for_owner_away(evidence / 'owner-away.json')
        out_file = evidence / 'harness.json'
        run_env = dict(env, STATE_PACKAGE_RECEIPT=str(evidence / 'guard-run.json'), ROW_HARNESS_OUT=str(out_file), ROW_HARNESS_ROUNDS=str(args.rounds),
                       ROW_HARNESS_ROWS=str(args.rows), ROW_HARNESS_HEIGHT=str(args.height), ROW_HARNESS_RICH='1' if args.rich else '0')
        with (evidence / 'tests.log').open('w') as out:
            code = subprocess.run([sys.executable, str(ROOT / 'apps/macos/scripts/state_package.py'), 'swift', 'test', '--skip-build', '--no-parallel', *common, '--filter', 'RowSelectionHarnessTests'],
                                  cwd=ROOT, stdout=out, stderr=subprocess.STDOUT, env=run_env).returncode
        log = (evidence / 'tests.log').read_text()
        # A test process that ends early can exit 0 without a summary line; that is not a pass.
        completed = 'Test run with' in log and out_file.exists()
        result = dict(commit=commit, passed=code == 0 and completed, exit=code, completed=completed, ownerAway=away,
                      loadAfter=os.getloadavg(), harness=json.loads(out_file.read_text()) if out_file.exists() else None)
        (evidence / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result, indent=2))
        return 0 if result['passed'] else (code or 1)
    finally:
        shutil.rmtree(package_root, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
