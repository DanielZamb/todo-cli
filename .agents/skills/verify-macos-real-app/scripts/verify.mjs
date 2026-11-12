#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const evidence = path.resolve(process.argv[2] ?? '');
assert(process.argv[2] && !fs.existsSync(evidence), 'Pass a fresh absolute evidence directory');
assert(path.isAbsolute(process.argv[2]));
fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
process.umask(0o077);
const commands = [];
const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TODO_') && !key.startsWith('DYLD_')));
const scratch = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-'));
const home = path.join(scratch, 'home');
fs.mkdirSync(home);
fs.mkdirSync(path.join(scratch, 'tmp'));
const env = { ...base, HOME: home, CFFIXED_USER_HOME: home, TODO_DB: path.join(scratch, 'scratch.db'), TODO_PORT: '0', TMPDIR: path.join(scratch, 'tmp') };
let server;
let app;
let decoy;
let outside;
let cancelled = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { cancelled = true; app?.kill("SIGTERM"); server?.kill("SIGTERM"); });
let result = { status: 'FAIL', visible: false };
function run(argv, name, environment = base, input) {
  assert(!cancelled, "Verification cancelled");
  const value = spawnSync(argv[0], argv.slice(1), { cwd: root, env: environment, input, encoding: 'utf8', timeout: 1200000, maxBuffer: 128 * 1024 * 1024 });
  fs.writeFileSync(path.join(evidence, `${name}.log`), `${value.stdout ?? ''}${value.stderr ?? ''}`);
  commands.push({ argv, exit: value.status, signal: value.signal, error: value.error?.message, log: `${name}.log` });
  fs.writeFileSync(path.join(evidence, 'commands.json'), JSON.stringify(commands, null, 2));
  return value;
}
function must(argv, name, environment = base, input) {
  const value = run(argv, name, environment, input);
  assert.equal(value.status, 0, `${name}: ${value.stderr?.slice(-800)}`);
  return value.stdout;
}
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++) await pause(100);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++) await pause(100);
  assert(child.exitCode !== null || child.signalCode !== null, 'Owned child did not stop');
}
try {
  must(['sh', 'scripts/disk-guard.sh'], 'disk');
  const available = fs.statfsSync(root);
  assert(available.bavail * available.bsize >= 30 * 1024 ** 3, 'DISK STOP below 30 GB');
  const sourceHead = must(['git', 'rev-parse', 'HEAD'], 'checkout-head').trim();
  const inputs = must(['git', 'ls-files', 'apps/cli', 'apps/server', 'packages', 'pnpm-lock.yaml'], 'binary-inputs').trim().split('\n').sort();
  const digest = createHash('sha256').update(sourceHead);
  for (const file of inputs) digest.update(file).update(fs.readFileSync(path.join(root, file)));
  const sourceHash = digest.digest('hex');
  const cache = path.join('.scratch/bin', sourceHash);
  fs.mkdirSync(path.join(root, cache), { recursive: true });
  for (const [entry, name] of [['apps/cli/src/main.ts', 'todo'], ['apps/server/src/main.ts', 'todo-server']]) {
    const destination = path.join(cache, name);
    if (!fs.existsSync(path.join(root, destination))) must(['bun', 'scripts/compile.ts', entry, destination], 'compile-' + name);
    fs.copyFileSync(path.join(root, destination), path.join(scratch, name));
  }
  fs.writeFileSync(path.join(evidence, 'binary-provenance.json'), JSON.stringify({ sourceHead, sourceHash, cache, sha256: { cli: hash(path.join(scratch, 'todo')), server: hash(path.join(scratch, 'todo-server')) } }, null, 2));
  const cli = path.join(scratch, 'todo');
  const serverPath = path.join(scratch, 'todo-server');
  const cliArgs = ['--profile', 'verify', '--format', 'json'];
  must([cli, 'init', '--password-stdin', ...cliArgs], 'init', env, 'scratch verification passphrase\n');
  must([cli, 'login', '--password-stdin', ...cliArgs], 'login', env, 'scratch verification passphrase\n');
  for (const title of ['V01 seeded Task alpha', 'V01 seeded Task beta']) must([cli, 'add', title, ...cliArgs], title.endsWith('alpha') ? 'seed-alpha' : 'seed-beta', env);
  const log = fs.openSync(path.join(evidence, 'server.log'), 'w');
  server = spawn(serverPath, [], { env, stdio: ['ignore', log, log] });
  let url;
  for (let i = 0; i < 600; i++) {
    assert.equal(server.exitCode, null, 'Scratch server stopped');
    const match = fs.readFileSync(path.join(evidence, 'server.log'), 'utf8').match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/);
    if (match) { url = match[1]; break; }
    await pause(100);
  }
  assert(url, '60-second scratch server readiness deadline');
  const health = await (await fetch(`${url}/health`)).json();
  assert.equal(health.service, 'todo-server');
  const session = await (await fetch(`${url}/auth/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passphrase: 'scratch verification passphrase' }) })).json();
  assert(session.credential.startsWith('ses_'));
  const manifest = { root: scratch, home, serverURL: url, serverPath, cliPath: cli, serverSHA256: hash(serverPath), cliSHA256: hash(cli), serverPID: server.pid, database: env.TODO_DB, contract: health.contract, build: health.build, profile: 'verify', session: session.credential };
  fs.writeFileSync(path.join(evidence, 'ownership.json'), JSON.stringify({ serverPID: server.pid, scratch, home, database: env.TODO_DB, serverURL: url, serverSHA256: manifest.serverSHA256, cliSHA256: manifest.cliSHA256, health }, null, 2));
  const manifestPath = path.join(scratch, 'manifest.json');
  const manifestEnv = { ...env, TODO_VERIFICATION_MANIFEST: manifestPath };
  const appPath = path.join(root, '.scratch/mac-verification/DerivedData/Build/Products/Release/TodoVerification.app');
  const executable = path.join(appPath, 'Contents/MacOS/TodoVerification');
  const matrix = [];
  const probe = path.join(scratch, 'guard-probe');
  must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-swift-version', '6', '-parse-as-library', 'apps/macos/VerificationApp/LaunchGuard.swift', '.agents/skills/verify-macos-real-app/scripts/GuardProbe.swift', '-o', probe], 'compile-guard');
  function check(name, edit, environment, expectedExit, expectedMessage) {
    const candidate = { ...manifest };
    edit?.(candidate);
    fs.writeFileSync(manifestPath, JSON.stringify(candidate), { mode: 0o600 });
    const value = run([probe], `guard-${name}`, environment ?? manifestEnv);
    assert.equal(value.status, expectedExit, name);
    assert((value.stdout + value.stderr).includes(expectedMessage), name);
    matrix.push({ name, exit: value.status, expectedMessage });
    fs.writeFileSync(path.join(evidence, 'guards.json'), JSON.stringify(matrix, null, 2));
  }
  check('valid', null, null, 0, 'manifest accepted');
  decoy = net.createServer(socket => socket.end());
  await new Promise(resolve => decoy.listen(0, '127.0.0.1', resolve));
  const decoyPort = decoy.address().port;
  check('unrelated-listener', value => { value.serverURL = 'http://127.0.0.1:' + decoyPort; }, null, 78, 'loopback port must belong only to the scratch server PID');
  const linkPath = path.join(scratch, 'manifest-link.json');
  fs.symlinkSync(manifestPath, linkPath);
  check('manifest-symlink', null, { ...manifestEnv, TODO_VERIFICATION_MANIFEST: linkPath }, 78, 'manifest must not use a symbolic link');
  fs.chmodSync(manifestPath, 0o644);
  const publicManifest = run([probe], 'guard-public-manifest', manifestEnv);
  assert.equal(publicManifest.status, 78);
  assert(publicManifest.stderr.includes('must be private and owned'));
  matrix.push({ name: 'public-manifest', exit: 78, expectedMessage: 'must be private and owned' });
  fs.chmodSync(manifestPath, 0o600);
  check('missing-manifest', null, env, 78, 'A private launch manifest is required.');
  check('wrong-home', null, { ...manifestEnv, HOME: scratch }, 78, 'HOME and CFFIXED_USER_HOME must name');
  check('missing-home', null, Object.fromEntries(Object.entries(manifestEnv).filter(([key]) => key !== 'HOME')), 78, 'HOME and CFFIXED_USER_HOME must name');
  check('non-loopback', value => { value.serverURL = 'http://192.0.2.1:4310'; }, null, 78, 'explicit http://127.0.0.1');
  check('default-port-without-owner', value => { value.serverPID = process.pid; }, null, 78, 'compiled scratch server process');
  check('server-hash', value => { value.serverSHA256 = '0'.repeat(64); }, null, 78, 'hash does not match');
  check('cli-hash', value => { value.cliSHA256 = '0'.repeat(64); }, null, 78, 'hash does not match');
  check('database-escape', value => { value.database = path.join(root, '.scratch/forbidden.db'); }, null, 78, 'Every launch path must stay');
  fs.writeFileSync(path.join(scratch, 'other.db'), '');
  check('wrong-database', value => { value.database = path.join(scratch, 'other.db'); }, null, 78, 'scratch HOME and database');
  check('wrong-build', value => { value.build = 'wrong'; }, null, 78, 'identity does not match');
  check('wrong-contract', value => { value.contract = 'wrong'; }, null, 78, 'identity does not match');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  must(['xcrun', 'clang', '-dynamiclib', 'apps/macos/VerificationApp/CredentialTrap.c', '-framework', 'Security', '-install_name', '@rpath/libCredentialTrap.dylib', '-o', path.join(scratch, 'libCredentialTrap.dylib')], 'build-trap');
  const trapProbe = path.join(scratch, 'trap-probe');
  must(['xcrun', 'clang', '.agents/skills/verify-macos-real-app/scripts/TrapProbe.c', '-L' + scratch, '-lCredentialTrap', '-framework', 'Security', '-Wl,-rpath,@executable_path', '-o', trapProbe], 'build-trap-probe');
  const names = [...fs.readFileSync(path.join(root, 'apps/macos/VerificationApp/CredentialSymbols.inc'), 'utf8').matchAll(/TRAP\((\w+)\)/g)].map(match => match[1]);
  names.push('SecCopyErrorMessageString');
  const traps = names.map(name => {
    const value = run([trapProbe, name], 'trap-' + name);
    assert.equal(value.status, 79, name);
    return { name, exit: value.status };
  });
  fs.writeFileSync(path.join(evidence, 'traps.json'), JSON.stringify(traps, null, 2));
  const protocolSource = fs.readFileSync(path.join(root, 'apps/macos/Sources/TodoModel.swift'), 'utf8').match(/protocol SessionStorage \{[\s\S]*?extension SessionVault: SessionStorage \{\}/)[0];
  const protocolPath = path.join(scratch, 'SessionStorage.swift');
  fs.writeFileSync(protocolPath, protocolSource);
  const memoryProbe = path.join(scratch, 'memory-probe');
  must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-swift-version', '6', '-parse-as-library', protocolPath, 'apps/macos/VerificationApp/MemorySessionVault.swift', '.agents/skills/verify-macos-real-app/scripts/MemoryProbe.swift', '-o', memoryProbe], 'build-memory-probe');
  must([memoryProbe], 'memory-session', env);
  const sandboxProbe = path.join(scratch, 'sandbox-probe');
  must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-swift-version', '6', '-parse-as-library', 'apps/macos/VerificationApp/LaunchGuard.swift', 'apps/macos/VerificationApp/ScratchSandbox.swift', '.agents/skills/verify-macos-real-app/scripts/SandboxProbe.swift', '-o', sandboxProbe], 'build-sandbox-probe');
  outside = path.join(root, '.scratch', 'v01-denied-' + path.basename(scratch));
  fs.writeFileSync(outside, 'owned sentinel');
  const sandbox = JSON.parse(must([sandboxProbe, outside, String(decoyPort)], 'sandbox', manifestEnv));
  assert.equal(fs.readFileSync(outside, 'utf8'), 'owned sentinel');
  fs.writeFileSync(path.join(evidence, 'sandbox.json'), JSON.stringify(sandbox, null, 2));
  if (!process.argv.includes('--guards-only')) {
    const resolvedDirectory = path.join(root, 'apps/macos/VerificationApp/TodoVerification.xcodeproj/project.xcworkspace/xcshareddata/swiftpm');
    fs.mkdirSync(resolvedDirectory, { recursive: true });
    fs.copyFileSync(path.join(root, 'apps/macos/Todo.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'), path.join(resolvedDirectory, 'Package.resolved'));
    must(['sh', 'scripts/disk-guard.sh'], 'disk-before-xcode');
    must(['scripts/swift-slot.sh', 'xcodebuild', '-project', 'apps/macos/VerificationApp/TodoVerification.xcodeproj', '-scheme', 'TodoVerification', '-configuration', 'Release', '-destination', 'platform=macOS', '-derivedDataPath', '.scratch/mac-verification/DerivedData', '-disableAutomaticPackageResolution', '-skipPackageUpdates', 'build', 'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'ONLY_ACTIVE_ARCH=YES'], 'build-app');
    assert(!/^CodeSign /m.test(fs.readFileSync(path.join(evidence, 'build-app.log'), 'utf8')), 'An app signing action ran');
    must(['node', '.agents/skills/verify-macos-real-app/scripts/audit.mjs', appPath, evidence], 'audit-app');
    must([executable, '--check-manifest'], 'app-valid-manifest', manifestEnv);
    const appCases = [
      ['missing-manifest', null, env, 'A private launch manifest is required.'],
      ['wrong-home', null, { ...manifestEnv, HOME: scratch }, 'HOME and CFFIXED_USER_HOME must name'],
      ['missing-home', null, Object.fromEntries(Object.entries(manifestEnv).filter(([key]) => key !== 'HOME')), 'HOME and CFFIXED_USER_HOME must name'],
      ['non-loopback', value => { value.serverURL = 'http://192.0.2.1:4310'; }, manifestEnv, 'explicit http://127.0.0.1'],
      ['server-hash', value => { value.serverSHA256 = '0'.repeat(64); }, manifestEnv, 'hash does not match'],
      ['cli-hash', value => { value.cliSHA256 = '0'.repeat(64); }, manifestEnv, 'hash does not match'],
      ['unrelated-listener', value => { value.serverURL = 'http://127.0.0.1:' + decoyPort; }, manifestEnv, 'loopback port must belong only'],
      ['wrong-contract', value => { value.contract = 'wrong'; }, manifestEnv, 'manifest contract does not match this client']
    ];
    const appGuards = [];
    for (const [name, edit, environment, reason] of appCases) {
      const candidate = { ...manifest };
      edit?.(candidate);
      fs.writeFileSync(manifestPath, JSON.stringify(candidate), { mode: 0o600 });
      const value = run([executable, '--check-manifest'], 'app-guard-' + name, environment);
      assert.equal(value.status, 78, name);
      assert(value.stderr.includes(reason), name);
      appGuards.push({ name, exit: value.status, expectedMessage: reason });
    }
    fs.writeFileSync(path.join(evidence, 'app-guards.json'), JSON.stringify(appGuards, null, 2));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
    must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-parse-as-library', '.agents/skills/verify-macos-real-app/scripts/AXRead.swift', '-o', path.join(scratch, 'ax-read')], 'build-ax');
    const appTrapProbe = path.join(scratch, 'app-trap-probe');
    must(['xcrun', 'clang', '.agents/skills/verify-macos-real-app/scripts/TrapProbe.c', '-L' + path.join(appPath, 'Contents/Frameworks'), '-lCredentialTrap', '-framework', 'Security', '-Wl,-rpath,' + path.join(appPath, 'Contents/Frameworks'), '-o', appTrapProbe], 'build-embedded-trap-probe');
    assert.equal(run([appTrapProbe, 'SecItemCopyMatching'], 'embedded-trap').status, 79);
    const appLog = fs.openSync(path.join(evidence, 'app.log'), 'w');
    app = spawn(executable, [], { env: manifestEnv, stdio: ['ignore', appLog, appLog] });
    let observed;
    for (let i = 0; i < 100; i++) {
      assert.equal(app.exitCode, null, 'Verification app refused or stopped; see app.log');
      const read = run([path.join(scratch, 'ax-read'), String(app.pid)], 'accessibility');
      if (read.status === 78) throw new Error('Accessibility permission unavailable; no prompt requested');
      if (read.stdout.includes('V01 seeded Task alpha') && read.stdout.includes('V01 seeded Task beta')) { observed = JSON.parse(read.stdout); break; }
      await pause(100);
    }
    assert(observed, 'Seeded Tasks were not independently read through accessibility');
    fs.writeFileSync(path.join(evidence, 'accessibility.json'), JSON.stringify(observed, null, 2));
    const window = observed.find(row => row.CGWindowID);
    assert(window, 'The app has no visible WindowServer window');
    must(['/usr/sbin/screencapture', '-x', '-o', '-l', window.CGWindowID, path.join(evidence, 'window.png')], 'window-capture');
    result.visible = true;
  }
  result.status = 'PASS';
  result.sourceHead = must(['git', 'rev-parse', 'HEAD'], 'source-head').trim();
} catch (error) {
  result.error = error.stack;
  process.exitCode = 1;
} finally {
  try {
    await stop(app);
    await stop(server);
  } catch (error) {
    result.cleanupError = error.message;
    result.retainedScratch = scratch;
    result.status = 'FAIL';
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    throw error;
  }
  if (decoy) await new Promise(resolve => decoy.close(resolve));
  if (outside) fs.rmSync(outside, { force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
  result.cleaned = !fs.existsSync(scratch);
  result.commands = commands.length;
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
