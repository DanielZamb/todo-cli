#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn as adversarialSpawn } from 'node:child_process';
import { command, environment, executable, run, start } from './process-policy.mjs';
import { receipt } from './receipt-stages.mjs';
import { generateGuardMutants } from './guard-mutants.mjs';
import { runRegressions } from './regressions.mjs';
import { runClassReds } from './class-reds.mjs';

process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
if (!process.argv.includes('--slot-owned')) {
  const bootstrap = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-tool-'));
  fs.mkdirSync(bootstrap + '/home'); fs.mkdirSync(bootstrap + '/tmp');
  const result = run(['/bin/sh', root + '/scripts/swift-slot.sh', executable('node'), ...process.argv.slice(1), '--slot-owned'], { cwd: root, env: environment(bootstrap + '/home', bootstrap + '/tmp'), stdio: 'inherit' });
  fs.rmSync(bootstrap, { recursive: true }); process.exit(result.status ?? 1);
}
const evidence = process.argv[2];
assert(evidence && path.isAbsolute(evidence) && !fs.existsSync(evidence), 'Pass a fresh absolute evidence directory');
fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
const tools = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-tools-'));
fs.mkdirSync(tools + '/home'); fs.mkdirSync(tools + '/tmp');
const base = environment(tools + '/home', tools + '/tmp');
const commands = [], stages = {}, fixtures = new Set(), activeChildren = new Set();
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let sourceHead, template, result = { status: 'FAIL', visibleLaunchHeld: true, visibleReadback: false, appLaunchAttempted: false };
function record(argv, name, env, value, secret = false) {
  name = name.replace(/[^A-Za-z0-9_.-]/g, '_');
  fs.writeFileSync(path.join(evidence, name + '.log'), secret ? '[scratch credential redacted]\n' : (value.stdout ?? '') + (value.stderr ?? ''));
  commands.push({ argv: command(argv), environment: env, exit: value.status, signal: value.signal, error: value.error?.message, log: name + '.log' });
  fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2));
  return value;
}
function execute(argv, name, env = base, input, secret = false) {
  const value = run(argv, { cwd: root, env, input, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 1200000 });
  return record(argv, name, env, value, secret);
}
function must(argv, name, env = base, input, secret = false) {
  const value = execute(argv, name, env, input, secret); assert.equal(value.status, 0, name + ': ' + value.stderr?.slice(-1800)); return value.stdout;
}
async function asynchronous(argv, name, env = base, adversarial = false, placement = {}) {
  const expanded = command(argv);
  if (adversarial) assert([native + '/guard', native + '/http'].includes(expanded[0]), 'Only compiled safety probes accept deliberate hostile configuration');
  const options = { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], ...placement };
  assert(Object.keys(placement).every(key => ['cwd', 'argv0'].includes(key)));
  const child = adversarial ? adversarialSpawn(expanded[0], expanded.slice(1), options) : start(argv, options);
  activeChildren.add(child);
  let stdout = '', stderr = '';
  child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (status, signal) => (() => { activeChildren.delete(child); try { resolve(record(argv, name, env, { status, signal, stdout, stderr })); } catch (error) { reject(error); } })()); });
  return { child, done, output: () => stdout + stderr };
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() { const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve)); const value = listener.address().port; await new Promise(resolve => listener.close(resolve)); return value; }
const native = path.join(tools, 'native'); fs.mkdirSync(native);
const arch = os.arch() === 'arm64' ? 'arm64' : 'x86_64';
const swift = ['xcrun', 'swiftc', '-swift-version', '6', '-target', arch + '-apple-macosx26.0', '-parse-as-library'];
const guardFile = 'apps/macos/VerificationApp/LaunchGuard.swift', bindings = 'apps/macos/VerificationApp/BuildBindings.generated.swift';
const childObject = native + '/child.o', policyObject = native + '/policy.o';
function build(sources, output, name, objects = [], overrides = {}) {
  if (!sources.includes('apps/macos/VerificationApp/ScratchSandbox.swift')) sources = [...sources, 'apps/macos/VerificationApp/ScratchSandbox.swift'];
  if (!sources.includes('apps/macos/VerificationApp/VerificationDefaults.swift')) sources = [...sources, 'apps/macos/VerificationApp/VerificationDefaults.swift'];
  sources = sources.map(source => overrides[source] ?? source);
  must([...swift, ...sources, ...objects.filter(value => value !== childObject), '-L' + tools, '-lCredentialTrap', '-Xlinker', '-u', '-Xlinker', '_todo_verification_trap_ready', '-Xlinker', '-rpath', '-Xlinker', tools, '-framework', 'IOKit', '-o', output], name); }
let binaryProvenance;
async function fixture() {
  const directory = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-case-')); fixtures.add(directory);
  for (const name of ['todo', 'todo-server', 'scratch.db']) fs.copyFileSync(template + '/' + name, directory + '/' + name, fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL);
  fs.cpSync(template + '/home', directory + '/home', { recursive: true, errorOnExist: true, force: false }); fs.mkdirSync(directory + '/tmp');
  const chosen = await port();
  const manifest = { root: directory, home: directory + '/home', serverURL: 'http://127.0.0.1:' + chosen, serverPath: directory + '/todo-server', cliPath: directory + '/todo', serverSHA256: binaryProvenance.sha256.server, cliSHA256: binaryProvenance.sha256.cli, serverPID: 0, database: directory + '/scratch.db', contract: binaryProvenance.contract, build: sourceHead.slice(0, 8), profile: 'verify', session: fs.readFileSync(tools + '/session', 'utf8').trim() };
  const file = directory + '/manifest.json'; fs.writeFileSync(file, JSON.stringify(manifest), { mode: 0o600 });
  const env = environment(directory + '/home', directory + '/tmp', { TODO_VERIFICATION_MANIFEST: file });
  return { directory, manifest, file, env, write: () => fs.writeFileSync(file, JSON.stringify(manifest), { mode: 0o600 }), dispose: () => { fs.rmSync(directory, { recursive: true }); fixtures.delete(directory); } };
}
try {
  must(['sh', 'scripts/disk-guard.sh'], 'disk'); assert(fs.statfsSync(root).bavail * fs.statfsSync(root).bsize >= 30 * 1024 ** 3);
  sourceHead = must(['git', 'rev-parse', 'HEAD'], 'head').trim(); result.sourceHead = sourceHead;
  const dirty = must(['git', 'status', '--porcelain', '--untracked-files=normal'], 'status');
  assert(!dirty.trim() || process.argv.includes('--development'), 'Qualification requires a committed clean head');
  result.development = Boolean(dirty.trim()); stages.frozenSource = !result.development;
  const inputs = must(['git', 'ls-files', 'apps/cli', 'apps/server', 'packages', 'pnpm-lock.yaml'], 'binary-inputs').trim().split('\n');
  const digest = createHash('sha256').update(sourceHead); for (const file of inputs) digest.update(file).update(fs.readFileSync(file));
  const sourceHash = digest.digest('hex'), cache = path.join(root, '.scratch/bin', sourceHash); fs.mkdirSync(cache, { recursive: true });
  for (const [entry, name] of [['apps/cli/src/main.ts', 'todo'], ['apps/server/src/main.ts', 'todo-server']]) {
    if (!fs.existsSync(cache + '/' + name)) must(['bun', 'build', '--compile', path.join(root, entry), '--define', 'TODO_BUILD_ID=' + JSON.stringify(sourceHead.slice(0, 8)), '--outfile', cache + '/' + name], 'compile-' + name);
  }
  const contract = fs.readFileSync('packages/api/src/contract.ts', 'utf8').match(/CONTRACT_ID\s*=\s*"([a-f0-9]+)"/)[1];
  binaryProvenance = { sourceHead, sourceHash, cache: path.relative(root, cache), contract, sha256: { cli: hash(cache + '/todo'), server: hash(cache + '/todo-server') } };
  fs.writeFileSync(evidence + '/binary-provenance.json', JSON.stringify(binaryProvenance, null, 2));
  fs.writeFileSync(bindings, 'enum VerificationBuild { static let visibleAllowed = false; static let serverSHA256 = "' + binaryProvenance.sha256.server + '"; static let cliSHA256 = "' + binaryProvenance.sha256.cli + '"; static let contract = "' + contract + '" }\n');
  fs.writeFileSync(evidence + '/generated-bindings.json', JSON.stringify({ sourceHead, sha256: hash(bindings), ...binaryProvenance.sha256 }, null, 2)); stages.compiledBinaries = true;
  must(['xcrun', 'clang', '-dynamiclib', 'apps/macos/VerificationApp/CredentialTrap.c', 'apps/macos/VerificationApp/ChildProof.c', '-framework', 'Security', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-framework', 'Foundation', '-install_name', '@rpath/libCredentialTrap.dylib', '-o', tools + '/libCredentialTrap.dylib'], 'build-native-credential-trap');
  must(['xcrun', 'clang', '-c', 'apps/macos/VerificationApp/ChildProof.c', '-o', childObject], 'child-proof');
  must(['xcrun', 'clang', '-c', '.agents/skills/verify-macos-real-app/scripts/SandboxPolicyCheck.c', '-o', policyObject], 'policy-proof');
  build([guardFile, bindings, '.agents/skills/verify-macos-real-app/scripts/BootstrapProbe.swift'], native + '/bootstrap', 'build-bootstrap');
  build([guardFile, bindings, '.agents/skills/verify-macos-real-app/scripts/GuardProbe.swift'], native + '/guard', 'build-guard');
  build([guardFile, '.agents/skills/verify-macos-real-app/scripts/FileProbe.swift'], native + '/files', 'build-files');
  build([guardFile, '.agents/skills/verify-macos-real-app/scripts/HTTPProbe.swift'], native + '/http', 'build-http');
  build([guardFile, bindings, 'apps/macos/VerificationApp/OwnerIdle.swift', 'apps/macos/VerificationApp/ScratchSandbox.swift', 'apps/macos/VerificationApp/VerificationDefaults.swift', '.agents/skills/verify-macos-real-app/scripts/NativeBoundaryProbe.swift'], native + '/boundary', 'build-boundary', [childObject, policyObject]);
  build([guardFile, 'apps/macos/VerificationApp/OwnerIdle.swift', '.agents/skills/verify-macos-real-app/scripts/LocalInputProbe.swift'], native + '/input', 'build-input');
  template = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-template-')); fixtures.add(template);
  fs.mkdirSync(template + '/home'); fs.mkdirSync(template + '/tmp');
  for (const name of ['todo', 'todo-server']) fs.copyFileSync(cache + '/' + name, template + '/' + name, fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL);
  const templateEnv = environment(template + '/home', template + '/tmp');
  for (const name of ['init', 'login', 'alpha', 'beta']) must([native + '/bootstrap', template, name], 'bootstrap-' + name, templateEnv, name === 'init' || name === 'login' ? 'scratch verification passphrase\n' : undefined);
  const session = must([native + '/bootstrap', template, 'session'], 'bootstrap-session', templateEnv, undefined, true).trim();
  fs.writeFileSync(tools + '/session', session, { mode: 0o600 });
  await runRegressions({ root, tools, native, evidence, base, execute, must, asynchronous, fixture, port, pause, build, swift, childObject, policyObject, guardFile, bindings, stages, binaryProvenance, sourceHead });
  await runClassReds({ tools, native, evidence, base, execute, must, fixture, port, build, guardFile, bindings, policyObject, sourceHead });
  must(['node', '.agents/skills/verify-macos-real-app/scripts/node-reds.mjs', evidence + '/node-reds.json'], 'node-reds');
  if (process.argv.includes('--focus-regressions')) {
    assert(process.argv.includes('--development'));
    must(['node', '.agents/skills/verify-macos-real-app/scripts/receipt-stages.test.mjs'], 'receipt-stages');
  } else {
  const mutants = generateGuardMutants(root, tools);
  build([mutants.generated, bindings], native + '/mutants', 'build-guard-mutants');
  const red = [];
  for (const value of [{ index: 'baseline' }, ...mutants.variants]) {
    const f = await fixture();
    try {
      if (value.index === 'baseline') must([native + '/mutants', 'baseline'], 'mutant-baseline', f.env);
      else {
        const failure = execute(['node', '.agents/skills/verify-macos-real-app/scripts/expect-exit.mjs', '0', f.directory, native + '/mutants', String(value.index)], 'red-guard-' + value.index);
        assert.equal(failure.status, 1); const observed = JSON.parse(failure.stdout); assert.equal(observed.exit, 78);
        red.push({ ...value, matchingTestExit: failure.status, observed });
      }
    } finally { f.dispose(); }
  }
  fs.writeFileSync(evidence + '/guard-reds.json', JSON.stringify({ sourceHead, controls: red }, null, 2)); stages.guardRedControls = true;
  const sdk = must(['xcrun', '--show-sdk-path'], 'sdk').trim();
  must(['node', '.agents/skills/verify-macos-real-app/scripts/generate-credential-traps.mjs', sdk, tools + '/CredentialSymbols.inc', tools], 'credential-census');
  assert.equal(fs.readFileSync(tools + '/CredentialSymbols.inc', 'utf8'), fs.readFileSync('apps/macos/VerificationApp/CredentialSymbols.inc', 'utf8'), 'Review and commit changed SDK bindings before qualification');
  fs.copyFileSync(tools + '/credential-export-census.json', evidence + '/credential-export-census.json');
  const trapSource = fs.readFileSync('apps/macos/VerificationApp/CredentialTrap.c', 'utf8');
  fs.writeFileSync(tools + '/CredentialTrap.c', trapSource);
  const library = tools + '/libCredentialTrap.dylib';
  const trapBuild = () => must(['xcrun', 'clang', '-dynamiclib', tools + '/CredentialTrap.c', 'apps/macos/VerificationApp/ChildProof.c', '-framework', 'Security', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-framework', 'Foundation', '-install_name', '@rpath/libCredentialTrap.dylib', '-o', library], 'build-trap');
  trapBuild();
  must(['xcrun', 'clang', '.agents/skills/verify-macos-real-app/scripts/TrapProbe.c', '-L' + tools, '-lCredentialTrap', '-framework', 'Security', '-Wl,-rpath,' + tools, '-o', native + '/trap'], 'build-trap-probe');
  const names = [...fs.readFileSync(tools + '/CredentialSymbols.inc', 'utf8').matchAll(/TRAP\((\w+)\)/g)].map(x => x[1]);
  const traps = [];
  for (const name of names) { const value = execute([native + '/trap', name], 'trap-' + name); assert.equal(value.status, 79); traps.push({ name, exit: value.status }); }
  fs.writeFileSync(evidence + '/traps.json', JSON.stringify({ sourceHead, controls: traps }, null, 2)); stages.credentialBoundary = true;
  const trapRed = [];
  for (const name of names) {
    fs.writeFileSync(tools + '/CredentialSymbols.inc', names.filter(value => value !== name).map(value => 'TRAP(' + value + ')').join('\n') + '\n');
    trapBuild();
    const failure = execute(['node', '.agents/skills/verify-macos-real-app/scripts/expect-exit.mjs', '79', template, native + '/trap', name], 'red-trap-' + name);
    assert.equal(failure.status, 1); const observed = JSON.parse(failure.stdout); assert.equal(observed.exit, 1);
    trapRed.push({ removed: name, matchingTestExit: 1, observed, originalCredentialCall: false });
  }
  fs.writeFileSync(evidence + '/trap-reds.json', JSON.stringify({ sourceHead, controls: trapRed }, null, 2)); stages.credentialRedControls = true;
  must(['node', '.agents/skills/verify-macos-real-app/scripts/receipt-stages.test.mjs'], 'receipt-stages');
  if (!process.argv.includes('--guards-only')) {
    must(['sh', 'scripts/disk-guard.sh'], 'disk-before-build'); assert(fs.statfsSync(root).bavail * fs.statfsSync(root).bsize >= 30 * 1024 ** 3);
    const resolved = 'apps/macos/VerificationApp/TodoVerification.xcodeproj/project.xcworkspace/xcshareddata/swiftpm'; fs.mkdirSync(resolved, { recursive: true });
    fs.copyFileSync('apps/macos/Todo.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved', resolved + '/Package.resolved');
    must(['xcodebuild', '-project', 'apps/macos/VerificationApp/TodoVerification.xcodeproj', '-scheme', 'TodoVerification', '-configuration', 'Release', '-destination', 'platform=macOS', '-derivedDataPath', '.scratch/mac-verification/DerivedData', '-disableAutomaticPackageResolution', '-skipPackageUpdates', ...(process.argv.includes('--fresh-build') ? ['clean', 'build'] : ['build']), 'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'ONLY_ACTIVE_ARCH=YES', 'TODO_NODE_BINARY=' + executable('node')], 'build-app'); stages.builtApp = true;
    const app = path.join(root, '.scratch/mac-verification/DerivedData/Build/Products/Release/TodoVerification.app');
    must(['codesign', '--force', '--sign', '-', '--identifier', 'local.todo.verification', '--timestamp=none', app], 'adhoc-identity');
    must(['node', '.agents/skills/verify-macos-real-app/scripts/audit.mjs', app, evidence], 'audit'); stages.artifactAudit = true;
    const f = await fixture(); try {
      must([app + '/Contents/MacOS/TodoVerification', '--check-manifest'], 'built-app-guard', f.env);
      const held = execute([app + '/Contents/MacOS/TodoVerification'], 'visible-held', f.env); assert.equal(held.status, 78); assert(held.stderr.includes('Visible launches are held'));
    } finally { f.dispose(); }
  }
  }
  assert.equal(must(['git', 'rev-parse', 'HEAD'], 'head-after').trim(), sourceHead);
  result.status = process.argv.includes('--focus-regressions') ? 'PASS_DIAGNOSTIC' : 'PASS_HEADLESS';
} catch (error) { result.error = error.stack; process.exitCode = 1; }
finally {
  try {
    assert.equal(activeChildren.size, 0, 'An owned child is still running; retain scratch for explicit recovery');
    for (const directory of fixtures) fs.rmSync(directory, { recursive: true }); fs.rmSync(tools, { recursive: true }); stages.cleanup = true;
  }
  catch (error) { result.cleanupError = error.message; result.retainedTools = tools; result.status = 'FAIL'; process.exitCode = 1; }
  Object.assign(result, receipt(stages, process.argv.includes('--guards-only') ? 'guards-only' : 'headless'));
  result.commands = commands.length;
  fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
