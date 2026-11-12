import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { command, environment, run, start } from './process-policy.mjs';

process.umask(0o077);
const evidence = process.argv[2];
assert(evidence && path.isAbsolute(evidence) && !fs.existsSync(evidence), 'Pass a fresh absolute evidence directory');
fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
const scratch = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-denial-'));
fs.mkdirSync(scratch + '/home'); fs.mkdirSync(scratch + '/tmp');
const tools = environment(scratch + '/home', scratch + '/tmp');
const commands = [];
function checked(argv, label) {
    const result = run(argv, { env: tools, encoding: 'utf8', maxBuffer: 8 * 1024 ** 2 });
    commands.push({ argv: command(argv), environment: tools, exit: result.status, signal: result.signal });
    fs.writeFileSync(evidence + '/' + label + '.log', result.stdout + result.stderr);
    assert.equal(result.status, 0, result.stderr); return result.stdout;
}
const sourceHead = checked(['git', 'rev-parse', 'HEAD'], 'head').trim();
const binary = scratch + '/todo-server';
let result = { sourceHead, SwiftStarted: false, applicationProfileChanged: false, completeRecipe: false, qualification: false, status: 'FAIL' };
try {
    result.serverInputsClean = checked(['git', 'status', '--porcelain', '--untracked-files=normal', '--', 'apps/server', 'packages', 'pnpm-lock.yaml'], 'server-input-status').trim() === '';
    assert(result.serverInputsClean, 'Diagnostic server inputs must match the committed head');
    result.diagnosticSources = Object.fromEntries(['.agents/skills/verify-macos-real-app/scripts/diagnose-server-sandbox.mjs', '.agents/skills/verify-macos-real-app/scripts/RootDirectoryProbe.c', 'apps/macos/VerificationApp/ScratchSandbox.swift'].map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
    checked(['sh', 'scripts/disk-guard.sh'], 'disk');
    checked(['bun', 'build', '--compile', 'apps/server/src/main.ts', '--define', 'TODO_BUILD_ID=' + JSON.stringify(sourceHead.slice(0, 8)), '--outfile', binary], 'compile');
    result.binarySHA256 = createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
    checked(['/usr/bin/codesign', '--verify', '--verbose=4', binary], 'signature');
    const rootProbe = scratch + '/root-probe';
    checked(['xcrun', 'clang', '.agents/skills/verify-macos-real-app/scripts/RootDirectoryProbe.c', '-o', rootProbe], 'build-root-probe');
    const listener = net.createServer();
    await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    const original = fs.readFileSync('apps/macos/VerificationApp/ScratchSandbox.swift', 'utf8');
    let profile = original.split('let profile = """')[1].split('"""')[0].split('\n').map(value => value.trim()).join('\n');
    for (const [from, to] of [['\\(literal(home))', JSON.stringify(os.userInfo().homedir)], ['\\(literal(Bundle.main.bundlePath))', JSON.stringify(scratch)], ['\\(literal(root))', JSON.stringify(scratch)], ['\\(literal(executable))', JSON.stringify(binary)], ['\\(port)', String(port)]]) profile = profile.split(from).join(to);
    assert(!profile.includes('\\('));
    const childEnvironment = { HOME: scratch + '/home', CFFIXED_USER_HOME: scratch + '/home', TMPDIR: scratch + '/tmp', TODO_DB: scratch + '/scratch.db', TODO_PORT: String(port), LANG: 'C', LC_ALL: 'C' };
    fs.writeFileSync(evidence + '/original-profile.sb', profile);
    result.rootOpenControls = [];
    for (const [label, extra, expectedExit] of [['strict-root-open', '', 78], ['literal-root-open-diagnostic', '\n(allow file-read-data (literal "/"))', 0]]) {
        const policy = profile.split(JSON.stringify(binary)).join(JSON.stringify(rootProbe)) + extra;
        const argv = [rootProbe];
        const value = run(argv, { input: policy, env: childEnvironment, cwd: scratch, encoding: 'utf8' });
        const control = { label, expectedExit, exit: value.status, signal: value.signal, stdout: value.stdout, stderr: value.stderr, argv, environment: childEnvironment };
        result.rootOpenControls.push(control); commands.push(control);
        assert.equal(value.status, expectedExit, value.stderr);
        const matchingCommand = ['node', '-e', 'require("node:assert/strict").equal(Number(process.argv[1]), 78)', String(value.status)];
        const matching = run(matchingCommand, { env: tools, encoding: 'utf8' });
        control.matchingRefusalTestExit = matching.status;
        commands.push({ argv: command(matchingCommand), environment: tools, exit: matching.status, stdout: matching.stdout, stderr: matching.stderr });
        assert.equal(matching.status, expectedExit === 78 ? 0 : 1);
    }
    result.controls = [];
    for (const [label, policy, expectedReady] of [
        ['outside-sandbox-baseline', null, true],
        ['strict', profile, false],
        ['ancestor-metadata-only', profile + '\n(allow file-read-metadata (literal "/" "/private" "/private/tmp"))', false],
        ['literal-root-data-diagnostic', profile + '\n(allow file-read-data (literal "/"))', true],
    ]) {
        const argv = policy ? ['/usr/bin/sandbox-exec', '-p', policy, binary] : [binary];
        const child = start(argv, { env: childEnvironment, cwd: scratch, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        child.stdout.on('data', value => stdout += value); child.stderr.on('data', value => stderr += value);
        const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (exit, signal) => resolve({ exit, signal })); });
        let ready = false;
        for (let n = 0; n < 200 && !ready && child.exitCode === null && !child.signalCode; n++) {
            ready = await new Promise(resolve => {
                const request = http.get('http://127.0.0.1:' + port + '/health', response => { response.resume(); resolve(response.statusCode === 200); });
                request.on('error', () => resolve(false)); request.setTimeout(100, () => { request.destroy(); resolve(false); });
            });
            if (!ready) await new Promise(resolve => setTimeout(resolve, 10));
        }
        if (child.exitCode === null && !child.signalCode) child.kill('SIGTERM');
        const stopped = await done;
        const receipt = { label, pid: child.pid, expectedReady, ready, ...stopped, argv, environment: childEnvironment, stdout, stderr, intentionalTermination: ready };
        result.controls.push(receipt); commands.push(receipt);
        fs.writeFileSync(evidence + '/' + label + '.log', stdout + stderr);
        assert.equal(ready, expectedReady, label);
        if (!ready) assert.equal(stopped.signal, 'SIGABRT', label);
    }
    const pid = result.controls.find(control => control.label === 'ancestor-metadata-only').pid;
    const logs = checked(['/usr/bin/log', 'show', '--last', '2m', '--style', 'json', '--info', '--debug', '--predicate', 'eventMessage CONTAINS "todo-server(' + pid + ')"'], 'own-pid-unified-log');
    result.denials = JSON.parse(logs).map(value => value.eventMessage).filter(value => /deny\(1\) file-read-data \/(?:\n|$)/.test(value));
    // macOS may suppress repeated reports. The deterministic open/errno control
    // above proves the operation even when this optional own-PID log is empty.
    result.unifiedLogMayBeRateLimited = result.denials.length === 0;
    result.requiredButUnacceptableAllowance = '(allow file-read-data (literal "/"))';
    result.status = 'PASS_DIAGNOSTIC_ONLY';
} catch (error) { result.error = error.stack; process.exitCode = 1; }
finally {
    fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2));
    const sentinel = scratch + '/held-sentinel';
    const heldFD = fs.openSync(sentinel, 'wx', 0o600);
    let held, directoryWhileHeld;
    try {
        held = run(['/usr/sbin/lsof', '-Fpcn', sentinel], { env: tools, encoding: 'utf8' });
        directoryWhileHeld = run(['/usr/sbin/lsof', '-Fpcn', '+D', scratch], { env: tools, encoding: 'utf8' });
    }
    finally { fs.closeSync(heldFD); }
    result.cleanupOpenControl = { exit: held.status, stdout: held.stdout, stderr: held.stderr, expectedPID: process.pid };
    result.cleanupDirectoryWhileOpen = { exit: directoryWhileHeld.status, stdout: directoryWhileHeld.stdout, stderr: directoryWhileHeld.stderr };
    const includesOwnFD = value => !value.stderr.trim() && value.stdout.includes('p' + process.pid + '\n') && value.stdout.includes('n' + sentinel + '\n');
    const observedOwnOpenFD = held.status === 0 && includesOwnFD(held) && [0, 1].includes(directoryWhileHeld.status) && includesOwnFD(directoryWhileHeld);
    const closed = run(['/usr/sbin/lsof', '-Fpcn', '+D', scratch], { env: tools, encoding: 'utf8' });
    result.cleanupProbe = { exit: closed.status, stdout: closed.stdout, stderr: closed.stderr };
    if (observedOwnOpenFD && closed.status === 1 && !closed.stdout.trim() && !closed.stderr.trim()) { fs.rmSync(scratch, { recursive: true }); result.scratchRemoved = true; }
    else { result.retainedScratch = scratch; result.status = 'FAIL'; process.exitCode = 1; }
    fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ status: result.status, exactDeniedOperation: result.denials, requiredButUnacceptableAllowance: result.requiredButUnacceptableAllowance, SwiftStarted: false, scratchRemoved: result.scratchRemoved }));
}
