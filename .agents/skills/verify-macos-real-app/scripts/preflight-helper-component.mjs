import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { command, environment, run } from './process-policy.mjs';
import { reservedPorts } from './boundary-profiles.mjs';

export async function qualifyPreflightHelper(evidence) {
  assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const tools = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-preflight-tools-'));
  fs.mkdirSync(tools + '/home'); fs.mkdirSync(tools + '/tmp');
  const env = environment(tools + '/home', tools + '/tmp'), commands = [], controls = [];
  const source = '.agents/skills/verify-macos-real-app/scripts/OwnerPreflightHelper.m';
  const text = fs.readFileSync(source, 'utf8');
  const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  function execute(argv, label, values = env) {
    const value = run(argv, { env: values, encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 });
    commands.push({ argv: command(argv), environment: values, pid: value.pid, exit: value.status, signal: value.signal });
    fs.writeFileSync(evidence + '/' + label + '.log', value.stdout + value.stderr); return value;
  }
  let result = { status: 'FAIL', completeRecipe: false, SwiftStarted: false, appLaunched: false, sourceSHA256: digest(source) };
  try {
    const head = execute(['git', 'rev-parse', 'HEAD'], 'head'); assert.equal(head.status, 0);
    result.sourceHead = head.stdout.trim();
    const status = execute(['git', 'status', '--porcelain', '--untracked-files=normal'], 'status'); assert.equal(status.status, 0);
    result.development = Boolean(status.stdout.trim());
    const library = tools + '/libCredentialTrap.dylib';
    assert.equal(execute(['xcrun', 'clang', '-dynamiclib', 'apps/macos/VerificationApp/CredentialTrap.c', 'apps/macos/VerificationApp/ChildProof.c', 'apps/macos/VerificationApp/BoundaryProof.c', '-framework', 'Security', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-framework', 'Foundation', '-install_name', '@rpath/libCredentialTrap.dylib', '-o', library], 'build-library').status, 0);
    for (const [label, mutate, expected] of [
      ['fixed-query-baseline', value => value, 0],
      ['LaunchServices-removed', value => value.replace('com.apple.coreservices.launchservicesd', 'local.todo.denied-launchservices'), 78],
      ['network-denial-removed', value => value.replace('(deny network-outbound)', '(allow network-outbound)'), 78],
      ['broker-denial-removed', value => value.replace('(deny mach-lookup)', '(allow mach-lookup)'), 78],
    ]) {
      const input = tools + '/' + label + '.m', program = tools + '/' + label;
      const edited = mutate(text); assert(label === 'fixed-query-baseline' || edited !== text); fs.writeFileSync(input, edited);
      const compiled = execute(['xcrun', 'clang', '-fobjc-arc', input, '-L' + tools, '-lCredentialTrap', '-Wl,-rpath,@executable_path', '-framework', 'AppKit', '-framework', 'ApplicationServices', '-o', program], 'build-' + label);
      assert.equal(compiled.status, 0, compiled.stderr);
      const root = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-preflight-case-'));
      const outside = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-preflight-outside-'));
      const ports = await reservedPorts();
      try {
        fs.mkdirSync(root + '/home'); fs.mkdirSync(root + '/tmp'); fs.writeFileSync(outside + '/sentinel', 'synthetic', { mode: 0o600 });
        fs.copyFileSync(library, root + '/libCredentialTrap.dylib', fs.constants.COPYFILE_EXCL);
        fs.copyFileSync(program, root + '/owner-preflight', fs.constants.COPYFILE_EXCL);
        const manifest = { root, home: root + '/home', ownerHome: os.userInfo().homedir, outsideSentinel: outside + '/sentinel', probePort: ports.otherPort, serverURL: 'http://127.0.0.1:' + ports.port };
        fs.writeFileSync(root + '/manifest.json', JSON.stringify(manifest), { mode: 0o600 });
        const values = { HOME: root + '/home', CFFIXED_USER_HOME: root + '/home', TMPDIR: root + '/tmp', LANG: 'C', LC_ALL: 'C' };
        const value = execute([root + '/owner-preflight'], label, values);
        assert.equal(value.status, expected, value.stdout + value.stderr);
        const matching = execute(['node', '-e', 'require("node:assert/strict").equal(Number(process.argv[1]), 0)', String(value.status)], label + '-matching-test');
        assert.equal(matching.status, expected === 0 ? 0 : 1);
        const rows = value.stdout.split('\n').filter(line => line.startsWith('boundary-proof ')).map(line => JSON.parse(line.slice(15)));
        assert(rows.length > 30 && rows.every(row => row.role === 'driver'));
        if (['fixed-query-baseline', 'LaunchServices-removed'].includes(label)) assert(rows.every(row => row.passed));
        if (label === 'network-denial-removed') assert(rows.some(row => row.label === 'off-loopback' && !row.passed));
        if (label === 'broker-denial-removed') assert(rows.some(row => row.label === 'broker' && !row.passed));
        const record = value.stdout.split('\n').find(line => line.startsWith('owner-preflight '));
        const state = record && JSON.parse(record.slice(16));
        if (label === 'LaunchServices-removed') assert.equal(state.frontmostBundleID, 'unknown');
        const logs = execute(['/usr/bin/log', 'show', '--last', '1m', '--style', 'json', '--info', '--debug', '--predicate', 'eventMessage CONTAINS "owner-preflight(' + value.pid + ')"'], label + '-own-pid-kernel', env);
        assert.equal(logs.status, 0, logs.stderr);
        controls.push({ label, exit: value.status, matchingTestExit: matching.status, state, kernelRows: rows, helperSHA256: digest(root + '/owner-preflight'), librarySHA256: digest(root + '/libCredentialTrap.dylib') });
      } finally { ports.close(); fs.rmSync(root, { recursive: true }); fs.rmSync(outside, { recursive: true }); }
    }
    result.status = 'PASS_COMPONENT';
  } catch (error) { result.error = error.stack; process.exitCode = 1; }
  finally {
    Object.assign(result, { controls });
    fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2));
    fs.rmSync(tools, { recursive: true });
  }
  console.log(JSON.stringify({ status: result.status, error: result.error, controls: controls.map(row => ({ label: row.label, exit: row.exit, matchingTestExit: row.matchingTestExit, frontmost: row.state?.frontmostBundleName, idle: row.state?.idleSeconds })) }));
  return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { process.umask(0o077); await qualifyPreflightHelper(process.argv[2]); }
