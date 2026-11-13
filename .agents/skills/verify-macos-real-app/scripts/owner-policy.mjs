import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { command, commandTimeout, environment, run } from './process-policy.mjs';
process.umask(0o077);
const evidence = process.argv[2], red = process.argv.includes('--red');
assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
const tools = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-owner-policy-'));
fs.mkdirSync(tools + '/home'); fs.mkdirSync(tools + '/tmp');
const env = environment(tools + '/home', tools + '/tmp'), commands = [], controls = [];
function execute(argv, label, swift = false) {
    if (swift) {
        assert(!fs.existsSync(evidence + '/swift-hold'), 'Coordinator holds new Swift jobs');
        argv = ['/bin/sh', path.resolve('scripts/swift-slot.sh'), ...command(argv)];
    }
    const value = run(argv, { env, encoding: 'utf8', timeout: commandTimeout(argv), maxBuffer: 16 * 1024 ** 2 });
    commands.push({ argv: command(argv), environment: env, exit: value.status, signal: value.signal });
    fs.writeFileSync(evidence + '/' + label + '.log', value.stdout + value.stderr); return value;
}
let result = { status: 'FAIL', completeRecipe: false, appLaunched: false, controls };
try {
    assert.equal(execute(['xcrun', 'clang', '-dynamiclib', 'apps/macos/VerificationApp/CredentialTrap.c', 'apps/macos/VerificationApp/ChildProof.c', 'apps/macos/VerificationApp/BoundaryProof.c', '-framework', 'Security', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-framework', 'Foundation', '-install_name', '@rpath/libCredentialTrap.dylib', '-o', tools + '/libCredentialTrap.dylib'], 'library').status, 0);
    const compiled = execute(['xcrun', 'swiftc', '-parse-as-library', '-swift-version', '6', 'apps/macos/VerificationApp/LaunchGuard.swift', 'apps/macos/VerificationApp/ScratchSandbox.swift', 'apps/macos/VerificationApp/VerificationDefaults.swift', 'apps/macos/VerificationApp/OwnerIdle.swift', '.agents/skills/verify-macos-real-app/scripts/OwnerPolicyProbe.swift', '-L' + tools, '-lCredentialTrap', '-Xlinker', '-rpath', '-Xlinker', tools, '-o', tools + '/owner-policy'], 'compile', true);
    assert.equal(compiled.status, 0, compiled.stderr);
    for (const [mode, expected] of [['valid', 0], ['recent', 78], ['unknown', 78], ['stale', 78], ['future', 78], ['expired', 78], ['renamed-mac', 78], ['renamed-electron', 78]]) {
        const value = execute([tools + '/owner-policy', mode], mode, true);
        const matching = execute(['node', '-e', 'require("node:assert/strict").equal(Number(process.argv[1]), Number(process.argv[2]))', String(value.status), String(expected)], mode + '-matching-test');
        const expectedRed = red && mode.startsWith('renamed-');
        assert.equal(value.status, expectedRed ? 0 : expected, value.stderr);
        assert.equal(matching.status, expectedRed ? 1 : 0);
        controls.push({ mode, expectedExit: expected, observedExit: value.status, matchingTestExit: matching.status });
    }
    result.status = red ? 'EXPECTED_RED' : 'PASS_COMPONENT';
} catch (error) { result.error = error.stack; process.exitCode = 1; }
finally {
    const closed = run(['/usr/sbin/lsof', '-Fpcn', '+D', tools], { env, encoding: 'utf8' });
    result.cleanup = { exit: closed.status, stdout: closed.stdout, stderr: closed.stderr };
    if (closed.status === 1 && !closed.stdout.trim() && !closed.stderr.trim()) fs.rmSync(tools, { recursive: true });
    else { result.retainedTools = tools; result.status = 'FAIL'; process.exitCode = 1; }
    fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
