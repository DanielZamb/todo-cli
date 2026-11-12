import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { command, environment, run } from './process-policy.mjs';

export function sandboxProfile(root, executable, port, bundle = root) {
    const source = fs.readFileSync('apps/macos/VerificationApp/ScratchSandbox.swift', 'utf8');
    let profile = source.split('let profile = """')[1].split('"""')[0].split('\n').map(value => value.trim()).join('\n');
    for (const [from, to] of [['\\(literal(home))', JSON.stringify(os.userInfo().homedir)], ['\\(literal(Bundle.main.bundlePath))', JSON.stringify(bundle)], ['\\(literal(root))', JSON.stringify(root)], ['\\(literal(executable))', JSON.stringify(executable)], ['\\(port)', String(port)]]) profile = profile.split(from).join(to);
    assert(!profile.includes('\\(')); return profile;
}
export async function reservedPorts() {
    const create = () => net.createServer(socket => { socket.on('error', () => {}); socket.destroy(); });
    const listen = (server, options) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(options, resolve); });
    for (let attempt = 0; attempt < 20; attempt++) {
        const ipv6 = create(), ipv4 = create();
        await listen(ipv6, { host: '::1', port: 0, ipv6Only: true });
        const port = ipv6.address().port;
        try { await listen(ipv4, { host: '127.0.0.1', port }); }
        catch { ipv6.close(); continue; }
        await new Promise(resolve => ipv4.close(resolve));
        const other = create(); await listen(other, { host: '127.0.0.1', port: 0 });
        return { port, otherPort: other.address().port, close: () => { ipv6.close(); other.close(); } };
    }
    throw new Error('Could not reserve owned loopback control listeners');
}
export async function qualifyBoundaryProfiles(evidence, before = false) {
    assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
    const tools = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-boundary-tools-'));
    fs.mkdirSync(tools + '/home'); fs.mkdirSync(tools + '/tmp');
    const env = environment(tools + '/home', tools + '/tmp'), commands = [], controls = [];
    const program = tools + '/boundary';
    function execute(argv, label, options = {}) {
        const value = run(argv, { env, encoding: 'utf8', ...options });
        commands.push({ argv: command(argv), environment: env, exit: value.status, signal: value.signal, log: label + '.log' });
        fs.writeFileSync(evidence + '/' + label + '.log', value.stdout + value.stderr); return value;
    }
    let result = { status: 'FAIL', qualification: false, completeRecipe: false, SwiftStarted: false };
    try {
        const compiled = execute(['xcrun', 'clang', 'apps/macos/VerificationApp/BoundaryProof.c', '.agents/skills/verify-macos-real-app/scripts/BoundaryDriver.c', '-o', program], 'compile'); assert.equal(compiled.status, 0, compiled.stderr);
        const variants = before ? [['before-literal-rule', value => value, 78]] : [
            ['literal-baseline', value => value, 0],
            ['literal-removed', value => value.replace('(allow file-read-data (literal "/"))', ''), 78],
            ['literal-widened-subpath', value => value.replace('(allow file-read-data (literal "/"))', '(allow file-read-data (subpath "/"))'), 78],
            ['literal-widened-read-star', value => value.replace('(allow file-read-data (literal "/"))', '(allow file-read* (literal "/"))'), 78],
        ];
        for (const [label, edit, expected] of variants) {
            const root = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-boundary-case-'));
            const outside = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-boundary-outside-'));
            fs.writeFileSync(outside + '/sentinel', 'synthetic only', { mode: 0o600 });
            const ports = await reservedPorts();
            try {
                const original = sandboxProfile(root, program, ports.port), policy = edit(original);
                if (!before && label !== 'literal-baseline') assert.notEqual(policy, original);
                fs.writeFileSync(evidence + '/' + label + '.sb', policy);
                const value = execute([program, root, os.userInfo().homedir, outside + '/sentinel', String(ports.port), String(ports.otherPort)], label, { input: policy });
                assert.equal(value.status, expected, value.stdout + value.stderr);
                const match = execute(['node', '-e', 'require("node:assert/strict").equal(Number(process.argv[1]), 0)', String(value.status)], label + '-matching-test');
                assert.equal(match.status, expected === 0 ? 0 : 1);
                const rows = value.stdout.split('\n').filter(line => line.startsWith('boundary-proof ')).map(line => JSON.parse(line.slice(15)));
                controls.push({ label, expectedExit: expected, exit: value.status, matchingTestExit: match.status, kernelRows: rows });
            } finally { ports.close(); fs.rmSync(root, { recursive: true }); fs.rmSync(outside, { recursive: true }); }
        }
        result.status = before ? 'EXPECTED_RED' : 'PASS_COMPONENT';
    } catch (error) { result.error = error.stack; process.exitCode = 1; }
    finally { fs.rmSync(tools, { recursive: true }); Object.assign(result, { controls, profileSourceSHA256: createHash('sha256').update(fs.readFileSync('apps/macos/VerificationApp/ScratchSandbox.swift')).digest('hex') }); fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2)); }
    console.log(JSON.stringify({ status: result.status, error: result.error, observations: controls.map(row => ({ label: row.label, exit: row.exit, matchingTestExit: row.matchingTestExit, failedRows: row.kernelRows.filter(row => !row.passed).map(row => row.label) })) }));
    return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { process.umask(0o077); await qualifyBoundaryProfiles(process.argv[2], process.argv.includes('--before')); }
