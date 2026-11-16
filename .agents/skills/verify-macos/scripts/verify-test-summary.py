#!/usr/bin/env python3
"""Follow-up 90's control: a Swift test run that ends mid-test must not pass.

Usage: python3 .agents/skills/verify-macos/scripts/verify-test-summary.py <new evidence dir>

A test process that ends mid-test (here a test that calls exit(0)) lets `swift test` exit 0 with no
"Test run with … passed" line. Every Mac runner now refuses that: state_package.py itself (exit 7),
and verify-design.py, verify-write-state.py and check-swift.ts, which run `swift test` without it,
by the same pattern; gates.py scans its evidence folder for a run that started and never ended.

The control builds a scratch Foundation-only package with two Swift Testing tests, `passes` and
`endsMidTest` (exit(0) inside the test), under scripts/swift-slot.sh, and asserts:
1. red hazard: plain `swift test --filter endsMidTest` exits 0 and prints no summary line;
2. red control: state_package.py on the same run exits 7 and says why;
3. green: state_package.py on `passes` exits 0 with the passing line;
4. the patterns the other three runners use (state_package.PASSING_SUMMARY, the regex in
   check-swift.ts read from that file and run under node, and gates.py's start/end scan) find no
   passing line in log 1 and find one in log 3, and the scan reports log 1 as unfinished.
It never touches apps/macos, a server, Todo.app or Keychain. Every step's exit is in result.json.
"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'apps/macos/scripts'))
import state_package

evidence = Path(sys.argv[1]).resolve()
evidence.mkdir(parents=True, exist_ok=False)
package = ROOT / '.scratch/test-summary-control'
shutil.rmtree(package, ignore_errors=True)
(package / 'Tests/SummaryControlTests').mkdir(parents=True)
(package / 'Package.swift').write_text('''// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "SummaryControl", platforms: [.macOS(.v14)],
                      targets: [.testTarget(name: "SummaryControlTests")])
''')
(package / 'Tests/SummaryControlTests/SummaryControlTests.swift').write_text('''import Foundation
import Testing

@Suite struct SummaryControlTests {
    @Test func passes() { #expect(1 + 1 == 2) }
    /// A test process that ends mid-test: the run never reaches its summary.
    @Test func endsMidTest() { print("SUMMARY-CONTROL: ending the test process mid-test"); exit(0) }
}
''')
scratch = package / '.build'
env = dict(os.environ, STATE_PACKAGE_TIMEOUT='900')
steps = []

def run(name, argv, slot=False):
    argv = (['scripts/swift-slot.sh'] if slot else []) + argv
    with (evidence / f'{name}.log').open('w') as out:
        code = subprocess.run(argv, cwd=ROOT, stdout=out, stderr=subprocess.STDOUT, env=env).returncode
    steps.append(dict(step=name, argv=argv, exit=code))
    return code, (evidence / f'{name}.log').read_text(errors='replace')

result = dict(passed=False)
try:
    build, _ = run('build', [sys.executable, 'apps/macos/scripts/state_package.py', 'swift', 'build', '--build-tests', '--package-path', str(package), '--scratch-path', str(scratch)], slot=True)
    assert build == 0, 'the control package did not build'
    base = ['--package-path', str(package), '--scratch-path', str(scratch), '--skip-build', '--no-parallel']
    hazard, hazard_log = run('1-plain-swift-test-ends-mid-test', ['python3', '-c', 'import subprocess, sys; sys.exit(subprocess.run(sys.argv[1:]).returncode)', 'swift', 'test', *base, '--filter', 'endsMidTest'])
    assert 'SUMMARY-CONTROL: ending the test process mid-test' in hazard_log, 'the test did not run'
    assert hazard == 0 and not state_package.PASSING_SUMMARY.search(hazard_log), ('the hazard did not reproduce', hazard)
    red, red_log = run('2-state-package-ends-mid-test', [sys.executable, 'apps/macos/scripts/state_package.py', 'swift', 'test', *base, '--filter', 'endsMidTest'])
    assert red == state_package.NO_SUMMARY_EXIT and 'follow-up 90' in red_log, ('state_package.py did not refuse', red)
    green, green_log = run('3-state-package-passes', [sys.executable, 'apps/macos/scripts/state_package.py', 'swift', 'test', *base, '--filter', 'passes'])
    assert green == 0 and state_package.PASSING_SUMMARY.search(green_log), ('the passing run did not pass', green)
    # The other runners' patterns, on the same two logs.
    source = (ROOT / '.agents/skills/verify-discovery-formal/check-swift.ts').read_text()
    ts = re.search(r'const summarized = (/.+?/)\.test\(', source, re.S)
    assert ts, 'check-swift.ts has no summary pattern'
    node = subprocess.run(['node', '-e', f'const re = {ts.group(1)}; const fs = require("fs"); console.log(JSON.stringify(process.argv.slice(1).map((f) => re.test(fs.readFileSync(f, "utf8")))))',
                           str(evidence / '1-plain-swift-test-ends-mid-test.log'), str(evidence / '3-state-package-passes.log')], capture_output=True, text=True)
    steps.append(dict(step='4-check-swift-pattern', exit=node.returncode, matches=node.stdout.strip()))
    assert node.returncode == 0 and json.loads(node.stdout) == [False, True], ('check-swift.ts pattern', node.stdout, node.stderr)
    gates = (ROOT / '.agents/skills/verify-macos/scripts/gates.py').read_text()
    started = re.compile(re.search(r"STARTED = re\.compile\(r'(.+?)'\)", gates).group(1))
    ended = re.compile(re.search(r"ENDED = re\.compile\(r'(.+?)'\)", gates).group(1))
    scan = {name: dict(started=len(started.findall(text)), ended=len(ended.findall(text))) for name, text in (('ends-mid-test', hazard_log), ('passes', green_log))}
    steps.append(dict(step='4-gates-scan', scan=scan))
    assert scan['ends-mid-test']['started'] == 1 and scan['ends-mid-test']['ended'] == 0, scan
    assert scan['passes']['started'] == 1 and scan['passes']['ended'] == 1, scan
    result = dict(passed=True, hazardExit=hazard, stateExit=red, greenExit=green)
finally:
    shutil.rmtree(package, ignore_errors=True)
    result.update(steps=steps, scratchRemoved=not package.exists(), appLaunched=False, keychain='no Security symbol: a Foundation-only package; state_package.py guards each build')
    (evidence / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'steps'}))
