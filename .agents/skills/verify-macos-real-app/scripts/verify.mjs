#!/usr/bin/env node
import assert from 'node:assert/strict';
import { generateGuardMutants } from './guard-mutants.mjs';
import { generateSandboxMutants } from './sandbox-mutants.mjs';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const slotOwned = process.argv.includes('--swift-slot-owned');
if (!slotOwned) {
  const value = spawnSync(path.join(root, 'scripts/swift-slot.sh'), [process.execPath, ...process.argv.slice(1), '--swift-slot-owned'], { cwd: root, env: process.env, stdio: 'inherit' });
  process.exit(value.status ?? 1);
}
const slotParent = spawnSync('/bin/ps', ['-p', String(process.ppid), '-o', 'command='], { encoding: 'utf8' });
assert.equal(slotParent.status, 0);
assert(slotParent.stdout.trim().startsWith('/usr/bin/lockf -k /tmp/todo-swift-build-' + process.getuid() + '.lock '), 'Swift slot ownership must come from swift-slot.sh');
const evidence = path.resolve(process.argv[2] ?? '');
assert(process.argv[2] && !fs.existsSync(evidence), 'Pass a fresh absolute evidence directory');
assert(path.isAbsolute(process.argv[2]));
fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
process.umask(0o077);
const commands = [];
const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TODO_') && !key.startsWith('DYLD_')));
const scratch = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-'));
const privateAppLog = path.join(scratch, 'app.log');
const home = path.join(scratch, 'home');
fs.mkdirSync(home);
fs.mkdirSync(path.join(scratch, 'tmp'));
const env = { ...base, HOME: home, CFFIXED_USER_HOME: home, TODO_DB: path.join(scratch, 'scratch.db'), TODO_PORT: '0', TMPDIR: path.join(scratch, 'tmp') };
let server;
let app;
let decoy;
let outside;
let globalOutside;
let probeDirectory;
let cancelled = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { cancelled = true; app?.kill("SIGTERM"); server?.kill("SIGTERM"); });
let result = { status: 'FAIL', visibleReadback: false, appLaunchAttempted: false, swiftSlotParentPID: process.ppid };
function run(argv, name, environment = base, input) {
  assert(!cancelled, "Verification cancelled");
  if (argv[0] === "scripts/swift-slot.sh") argv = argv.slice(1);
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
  const dirty = must(['git', 'status', '--porcelain', '--untracked-files=normal'], 'source-status');
  assert(!dirty.trim() || process.argv.includes('--development'), 'Qualification requires a clean committed head');
  result.sourceHead = sourceHead;
  result.development = Boolean(dirty.trim());
  const sources = must(['git', 'ls-files', 'apps/macos', '.agents/skills/verify-macos-real-app'], 'swift-inputs').trim().split('\n');
  fs.writeFileSync(path.join(evidence, 'source-provenance.json'), JSON.stringify({ sourceHead, development: result.development, sources: Object.fromEntries(sources.map(file => [file, hash(path.join(root, file))])) }, null, 2));
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
  const visibleOnly = process.argv.includes('--visible-only');
  assert(!visibleOnly || process.argv.includes('--development'), 'A focused identity run cannot qualify V01');
  decoy = net.createServer(socket => socket.end());
  await new Promise(resolve => decoy.listen(0, '127.0.0.1', resolve));
  const decoyPort = decoy.address().port;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  if (!visibleOnly) {
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
  const mutants = generateGuardMutants(root, scratch);
  const mutantBinary = path.join(scratch, 'guard-mutants');
  must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-swift-version', '6', '-parse-as-library', mutants.generated, '-o', mutantBinary], 'build-guard-mutants');
  const expectedValid = ['node', '.agents/skills/verify-macos-real-app/scripts/expect-valid.mjs', mutantBinary];
  must([...expectedValid, 'baseline', health.contract], 'mutant-baseline', manifestEnv);
  const reds = mutants.variants.map(variant => {
    const value = run([...expectedValid, String(variant.index), health.contract], 'red-guard-' + variant.index, manifestEnv);
    assert.equal(value.status, 1, 'Mutant survived: ' + variant.index);
    const observed = JSON.parse(value.stdout);
    assert.equal(observed.exit, 78);
    return { ...variant, matchingTestExit: value.status, observed };
  });
  fs.writeFileSync(path.join(evidence, 'guard-reds.json'), JSON.stringify({ sourceHead, method: 'Each validation predicate inverted in an isolated source copy; the same valid-launch assertion must fail.', baselineExit: 0, controls: reds }, null, 2));
  const localProbe = path.join(scratch, 'local-input-probe');
  const localArgs = ['xcrun', 'swiftc', '-swift-version', '6', '-parse-as-library', 'apps/macos/VerificationApp/LaunchGuard.swift'];
  const localFixture = '.agents/skills/verify-macos-real-app/scripts/LocalInputProbe.swift';
  must([...localArgs, 'apps/macos/VerificationApp/OwnerIdle.swift', localFixture, '-o', localProbe], 'build-local-input');
  assert.equal(run([localProbe, path.join(scratch, 'local-control')], 'local-input', manifestEnv).status, 80);
  const localRedSource = path.join(scratch, 'OwnerIdleRed.swift');
  const ownerSource = fs.readFileSync(path.join(root, 'apps/macos/VerificationApp/OwnerIdle.swift'), 'utf8');
  const monitorStart = ownerSource.indexOf('        localMonitor = NSEvent.addLocalMonitorForEvents');
  const monitorEnd = ownerSource.indexOf('        return Timer.scheduledTimer', monitorStart);
  assert(monitorStart >= 0 && monitorEnd > monitorStart);
  fs.writeFileSync(localRedSource, ownerSource.slice(0, monitorStart) + ownerSource.slice(monitorEnd));
  const localRed = path.join(scratch, 'local-input-red');
  must([...localArgs, localRedSource, localFixture, '-o', localRed], 'build-local-input-red');
  const localFailure = run(['node', '.agents/skills/verify-macos-real-app/scripts/expect-exit.mjs', '80', localRed, path.join(scratch, 'local-control-red')], 'red-local-input', manifestEnv);
  assert.equal(localFailure.status, 1);
  assert.equal(JSON.parse(localFailure.stdout).exit, 1);
  fs.writeFileSync(path.join(evidence, 'local-input-red.json'), JSON.stringify({ sourceHead, removed: 'NSEvent local monitor', matchingTestExit: 1, observed: JSON.parse(localFailure.stdout) }, null, 2));
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
  const trapRedControls = [];
  const originalTrap = fs.readFileSync(path.join(root, 'apps/macos/VerificationApp/CredentialTrap.c'), 'utf8');
  const originalBindings = fs.readFileSync(path.join(root, 'apps/macos/VerificationApp/CredentialSymbols.inc'), 'utf8');
  must(['sh', 'scripts/disk-guard.sh'], 'disk-before-trap-red-batch');
  assert(fs.statfsSync(root).bavail * fs.statfsSync(root).bsize >= 30 * 1024 ** 3, 'DISK STOP below 30 GB');
  for (const name of names) {
    const trapRed = path.join(scratch, 'trap-red-' + name); fs.mkdirSync(trapRed);
    fs.writeFileSync(path.join(trapRed, 'CredentialTrap.c'), name === 'SecCopyErrorMessageString' ? originalTrap.replace('TRAP(SecCopyErrorMessageString)', '') : originalTrap);
    fs.writeFileSync(path.join(trapRed, 'CredentialSymbols.inc'), originalBindings.replace('TRAP(' + name + ')\n', ''));
    must(['xcrun', 'clang', '-dynamiclib', path.join(trapRed, 'CredentialTrap.c'), '-framework', 'Security', '-install_name', '@rpath/libCredentialTrap.dylib', '-o', path.join(trapRed, 'libCredentialTrap.dylib')], 'build-trap-red-' + name);
    must(['xcrun', 'clang', '.agents/skills/verify-macos-real-app/scripts/TrapProbe.c', '-L' + trapRed, '-lCredentialTrap', '-framework', 'Security', '-Wl,-rpath,@executable_path', '-o', path.join(trapRed, 'trap-probe')], 'build-trap-red-probe-' + name);
    const failure = run(['node', '.agents/skills/verify-macos-real-app/scripts/expect-exit.mjs', '79', path.join(trapRed, 'trap-probe'), name], 'red-trap-' + name);
    assert.equal(failure.status, 1);
    const observed = JSON.parse(failure.stdout);
    assert.equal(observed.exit, 1, 'Missing binding must be detected without invoking its original');
    trapRedControls.push({ removed: 'TRAP(' + name + ')', matchingTestExit: 1, observed, originalSecurityCallAttempted: false });
  }
  fs.writeFileSync(path.join(evidence, 'trap-reds.json'), JSON.stringify({ sourceHead, controls: trapRedControls }, null, 2));
  const protocolSource = fs.readFileSync(path.join(root, 'apps/macos/Sources/TodoModel.swift'), 'utf8').match(/(?:@MainActor )?protocol SessionStorage \{[\s\S]*?extension SessionVault: SessionStorage \{\}/)[0];
  const protocolPath = path.join(scratch, 'SessionStorage.swift');
  fs.writeFileSync(protocolPath, protocolSource);
  must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-swift-version', '6', '-typecheck', protocolPath, '.agents/skills/verify-macos/fixtures/auth-epoch/SessionVault.swift'], 'existing-memory-fixture-compatibility');
  const memoryProbe = path.join(scratch, 'memory-probe');
  must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-swift-version', '6', '-parse-as-library', protocolPath, 'apps/macos/VerificationApp/MemorySessionVault.swift', '.agents/skills/verify-macos-real-app/scripts/MemoryProbe.swift', '-o', memoryProbe], 'build-memory-probe');
  must([memoryProbe], 'memory-session', env);
  const memoryRedSource = path.join(scratch, 'MemoryRed.swift');
  fs.writeFileSync(memoryRedSource, fs.readFileSync(path.join(root, 'apps/macos/VerificationApp/MemorySessionVault.swift'), 'utf8').replace('func save(_ credential: String) throws { self.credential = credential }', 'func save(_ credential: String) throws {}'));
  const memoryRed = path.join(scratch, 'memory-red');
  must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-swift-version', '6', '-parse-as-library', protocolPath, memoryRedSource, '.agents/skills/verify-macos-real-app/scripts/MemoryProbe.swift', '-o', memoryRed], 'build-memory-red');
  const memoryFailure = run(['node', '.agents/skills/verify-macos-real-app/scripts/expect-exit.mjs', '0', memoryRed], 'red-memory', env);
  assert.equal(memoryFailure.status, 1);
  fs.writeFileSync(path.join(evidence, 'memory-red.json'), JSON.stringify({ sourceHead, removed: 'MemorySessionVault.save assignment', matchingTestExit: 1, observed: JSON.parse(memoryFailure.stdout) }, null, 2));
  const policyObject = path.join(scratch, 'sandbox-policy-check.o');
  must(['xcrun', 'clang', '-c', '.agents/skills/verify-macos-real-app/scripts/SandboxPolicyCheck.c', '-o', policyObject], 'build-policy-check');
  probeDirectory = path.join(root, '.scratch', 'v01-sandbox-' + path.basename(scratch));
  fs.mkdirSync(probeDirectory);
  const bundleMarker = path.join(probeDirectory, 'bundle-marker'); fs.writeFileSync(bundleMarker, 'owned bundle marker');
  const sandboxProbe = path.join(probeDirectory, 'sandbox-probe');
  must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-swift-version', '6', '-parse-as-library', 'apps/macos/VerificationApp/LaunchGuard.swift', 'apps/macos/VerificationApp/ScratchSandbox.swift', '.agents/skills/verify-macos-real-app/scripts/SandboxProbe.swift', policyObject, '-o', sandboxProbe], 'build-sandbox-probe');
  outside = path.join(root, '.scratch', 'v01-denied-' + path.basename(scratch));
  fs.writeFileSync(outside, 'owned sentinel');
  globalOutside = path.join('/private/tmp', 'v01-denied-' + path.basename(scratch));
  fs.writeFileSync(globalOutside, 'owned global sentinel');
  const sandbox = JSON.parse(must([sandboxProbe, outside, String(decoyPort), globalOutside, bundleMarker], 'sandbox', manifestEnv));
  assert.equal(fs.readFileSync(outside, 'utf8'), 'owned sentinel');
  fs.writeFileSync(path.join(evidence, 'sandbox.json'), JSON.stringify(sandbox, null, 2));
  const sandboxMutants = generateSandboxMutants(root, scratch);
  const sandboxMutantBinary = path.join(probeDirectory, 'sandbox-mutants');
  must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-swift-version', '6', '-parse-as-library', 'apps/macos/VerificationApp/LaunchGuard.swift', sandboxMutants.generated, policyObject, '-o', sandboxMutantBinary], 'build-sandbox-mutants');
  const sandboxTest = ['node', '.agents/skills/verify-macos-real-app/scripts/expect-exit.mjs', '0', sandboxMutantBinary, outside, String(decoyPort), globalOutside, bundleMarker];
  must([...sandboxTest, 'baseline'], 'sandbox-mutant-baseline', manifestEnv);
  const sandboxReds = sandboxMutants.variants.map(variant => {
    const value = run([...sandboxTest, String(variant.index)], 'red-sandbox-' + variant.index, manifestEnv);
    assert.equal(value.status, 1, 'Sandbox mutant survived: ' + variant.original);
    const observed = JSON.parse(value.stdout);
    assert([1, 78].includes(observed.exit), 'Sandbox mutant crashed instead of failing a behavior check');
    return { ...variant, matchingTestExit: value.status, observed };
  });
  fs.writeFileSync(path.join(evidence, 'sandbox-reds.json'), JSON.stringify({ sourceHead, baselineExit: 0, controls: sandboxReds }, null, 2));
  }
  if (!process.argv.includes('--guards-only')) {
    const resolvedDirectory = path.join(root, 'apps/macos/VerificationApp/TodoVerification.xcodeproj/project.xcworkspace/xcshareddata/swiftpm');
    fs.mkdirSync(resolvedDirectory, { recursive: true });
    fs.copyFileSync(path.join(root, 'apps/macos/Todo.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'), path.join(resolvedDirectory, 'Package.resolved'));
    must(['sh', 'scripts/disk-guard.sh'], 'disk-before-xcode');
    must(['scripts/swift-slot.sh', 'xcodebuild', '-project', 'apps/macos/VerificationApp/TodoVerification.xcodeproj', '-scheme', 'TodoVerification', '-configuration', 'Release', '-destination', 'platform=macOS', '-derivedDataPath', '.scratch/mac-verification/DerivedData', '-disableAutomaticPackageResolution', '-skipPackageUpdates', ...(process.argv.includes('--fresh-build') ? ['clean', 'build'] : ['build']), 'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'ONLY_ACTIVE_ARCH=YES'], 'build-app');
    {
      must(['/usr/bin/codesign', '--force', '--sign', '-', '--identifier', 'local.todo.verification', '--timestamp=none', appPath], 'adhoc-bundle-identity');
      const signature = run(['/usr/bin/codesign', '--display', '--verbose=4', appPath], 'adhoc-signature');
      assert.equal(signature.status, 0);
      assert(signature.stderr.includes('Identifier=local.todo.verification') && signature.stderr.includes('adhoc') && signature.stderr.includes('TeamIdentifier=not set') && !signature.stderr.includes('Authority='));
    }
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
    const axObject = path.join(scratch, 'ax-window.o');
    must(['xcrun', 'clang', '-c', '.agents/skills/verify-macos-real-app/scripts/AXWindowID.c', '-o', axObject], 'build-ax-window-id');
    must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-parse-as-library', '.agents/skills/verify-macos-real-app/scripts/AXRead.swift', axObject, '-framework', 'ApplicationServices', '-o', path.join(scratch, 'ax-read')], 'build-ax');
    const appTrapProbe = path.join(scratch, 'app-trap-probe');
    must(['xcrun', 'clang', '.agents/skills/verify-macos-real-app/scripts/TrapProbe.c', '-L' + path.join(appPath, 'Contents/Frameworks'), '-lCredentialTrap', '-framework', 'Security', '-Wl,-rpath,' + path.join(appPath, 'Contents/Frameworks'), '-o', appTrapProbe], 'build-embedded-trap-probe');
    assert.equal(run([appTrapProbe, 'SecItemCopyMatching'], 'embedded-trap').status, 79);
    const preflight = path.join(scratch, 'preflight');
    must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-swift-version', '6', '-parse-as-library', 'apps/macos/VerificationApp/LaunchGuard.swift', 'apps/macos/VerificationApp/OwnerIdle.swift', '.agents/skills/verify-macos-real-app/scripts/PreflightProbe.swift', '-o', preflight], 'build-preflight');
    must([preflight, '--input-policy'], 'input-policy-fixtures', manifestEnv);
    must([preflight, 'Finder.app', '120'], 'preflight-valid-fixture', manifestEnv);
    for (const [name, bundle, idle] of [['unknown-frontmost', 'unknown', '120'], ['frontmost-todo', 'Todo.app', '120'], ['frontmost-electron', 'Todo Electron.app', '120'], ['owner-active', 'Finder.app', '0']]) assert.equal(run([preflight, bundle, idle], name, manifestEnv).status, 78);
    must([preflight], 'visible-preflight', manifestEnv);
    const census = path.join(scratch, 'identity-census');
    must(['scripts/swift-slot.sh', 'xcrun', 'swiftc', '-parse-as-library', '.agents/skills/verify-macos-real-app/scripts/IdentityCensus.swift', '-o', census], 'build-identity-census');
    const appLog = fs.openSync(privateAppLog, 'w');
    result.appLaunchAttempted = true;
    const nativeEnvironment = { ...manifestEnv, PWD: scratch };
    delete nativeEnvironment.__CFBundleIdentifier;
    app = spawn(executable, [], { cwd: scratch, env: nativeEnvironment, stdio: ['ignore', appLog, appLog] });
    await pause(500);
    const cleanReader = Object.fromEntries(Object.entries(base).filter(([key]) => key !== 'CFFIXED_USER_HOME'));
    must([census, String(app.pid)], 'identity-scratch-reader', manifestEnv);
    must([census, String(app.pid)], 'identity-normal-reader', cleanReader);
    let observed;
    for (let i = 0; i < 100; i++) {
      assert.equal(app.exitCode, null, 'Verification app refused or stopped; see app.log');
      const read = run([path.join(scratch, 'ax-read'), String(app.pid)], 'accessibility');
      if (read.status === 2) { await pause(100); continue; }
      if (read.status === 0 && read.stdout && !fs.existsSync(path.join(evidence, 'launch-window.png'))) {
        const ownWindows = JSON.parse(read.stdout);
        const firstWindow = ownWindows.find(row => row.CGWindowID);
        if (firstWindow) must(['/usr/sbin/screencapture', '-x', '-o', '-l', firstWindow.CGWindowID, path.join(evidence, 'launch-window.png')], 'launch-capture');
      }
      if (read.status === 78) throw new Error('Accessibility permission unavailable; no prompt requested');
      if (read.stdout.includes('V01 seeded Task alpha') && read.stdout.includes('V01 seeded Task beta')) { observed = JSON.parse(read.stdout); break; }
      await pause(100);
    }
    assert(observed, 'Seeded Tasks were not independently read through accessibility');
    fs.writeFileSync(path.join(evidence, 'accessibility.json'), JSON.stringify(observed, null, 2));
    const window = observed.find(row => row.CGWindowID);
    assert(window, 'The app has no visible WindowServer window');
    must(['/usr/sbin/screencapture', '-x', '-o', '-l', window.CGWindowID, path.join(evidence, 'window.png')], 'window-capture');
    result.visibleReadback = true;
    fs.writeFileSync(path.join(scratch, 'interruption-control'), '', { mode: 0o600 });
    for (let i = 0; i < 100 && app.exitCode === null && app.signalCode === null; i++) await pause(50);
    assert.equal(app.exitCode, 80, 'Posted test input did not stop the verification app');
    assert(fs.readFileSync(privateAppLog, 'utf8').includes('posted test input detected'), 'Input was not received with the test marker');
    fs.writeFileSync(path.join(evidence, 'interruption.json'), JSON.stringify({ sourceHead, bundleIdentifier: 'local.todo.verification', api: 'NSApplication.postEvent (in-process event queue; scratch file requests the one marked stop control)' , event: 'F20 keyDown', markedTestInput: true, appExit: app.exitCode, originalOwnerInput: false, realInputBehavior: 'An unmarked event in this window uses the same local monitor; input elsewhere in the session is checked by the 100 ms idle timer.' }, null, 2));
  }
  assert.equal(must(['git', 'status', '--porcelain', '--untracked-files=normal'], 'source-status-after').trim(), dirty.trim(), 'Source changed during qualification');
  result.status = 'PASS';
  result.completeRecipe = !visibleOnly;
  assert.equal(must(['git', 'rev-parse', 'HEAD'], 'source-head').trim(), sourceHead, 'Head changed during qualification');
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
  if (fs.existsSync(privateAppLog)) fs.copyFileSync(privateAppLog, path.join(evidence, 'app.log'));
  if (decoy) await new Promise(resolve => decoy.close(resolve));
  if (outside) fs.rmSync(outside, { force: true });
  if (globalOutside) fs.rmSync(globalOutside, { force: true });
  if (probeDirectory) fs.rmSync(probeDirectory, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
  result.cleaned = !fs.existsSync(scratch);
  result.commands = commands.length;
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
