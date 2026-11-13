import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { command, environment, executable, run } from './process-policy.mjs';
import { compareOutcomes } from './production-outcomes.mjs';
process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const scripts = path.join(root, '.agents/skills/verify-macos-real-app/scripts');
const baselineHead = '8b9be429751165d4ecef11f3f23d1844384e54b4';
const [evidence, nativeEvidence] = process.argv.slice(2);
assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
const proof = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-production-'));
fs.mkdirSync(proof + '/home'); fs.mkdirSync(proof + '/tmp');
const env = environment(proof + '/home', proof + '/tmp'), commands = [];
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function execute(argv, label, values = env, cwd = root) {
 const value = run(argv, { cwd, env: values, encoding: 'utf8', timeout: 7200000, maxBuffer: 128 * 1024 ** 2 });
 fs.writeFileSync(evidence + '/' + label + '.log', value.stdout + value.stderr);
 commands.push({ argv: command(argv), cwd, environment: values, exit: value.status, signal: value.signal, error: value.error?.message, log: label + '.log' });
 fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); return value;
}
function checked(argv, label, values = env, cwd = root) {
 const value = execute(argv, label, values, cwd); assert.equal(value.status, 0, label + ': ' + value.stderr.slice(-1800)); return value.stdout;
}
function disk(label, reserveGiB = 2) {
 const space = fs.statfsSync(root), freeBytes = space.bavail * space.bsize;
 const receipt = { label, freeBytes, floorBytes: 30 * 1024 ** 3, reserveBytes: reserveGiB * 1024 ** 3 };
 fs.appendFileSync(evidence + '/disk.jsonl', JSON.stringify(receipt) + '\n'); assert(freeBytes - receipt.reserveBytes >= receipt.floorBytes, 'DISK STOP: ' + label);
}
let result = { status: 'FAIL', appLaunched: false, developerSigned: false, originalCredentialCalls: false, strictAppProfileUsedForProduction: false, baselineHead };
try {
 disk('production comparison'); checked(['sh', 'scripts/disk-guard.sh'], 'disk');
 const head = checked(['git', 'rev-parse', 'HEAD'], 'head').trim();
 const dirty = checked(['git', 'status', '--porcelain', '--untracked-files=normal'], 'status').trim();
 assert(!dirty || process.argv.includes('--development')); result.sourceHead = head; result.development = Boolean(dirty);
 const native = JSON.parse(fs.readFileSync(nativeEvidence + '/binary-provenance.json', 'utf8'));
 assert(native.sourceHead === head || process.argv.includes('--development')); result.nativeBinarySourceHead = native.sourceHead;
 const baseline = root + '/.scratch/production-base-' + baselineHead.slice(0, 8);
 if (!fs.existsSync(baseline)) {
  checked(['git', 'clone', '--shared', '--no-checkout', '--', root, baseline], 'base-clone');
  checked(['git', 'checkout', '--detach', baselineHead], 'base-checkout', env, baseline);
 }
 assert.equal(checked(['git', 'rev-parse', 'HEAD'], 'base-head', env, baseline).trim(), baselineHead);
 checked(['git', 'diff', '--exit-code', 'HEAD'], 'base-clean', env, baseline);
 if (!fs.existsSync(baseline + '/node_modules')) fs.symlinkSync(root + '/node_modules', baseline + '/node_modules');
 for (const location of ['apps/cli', 'apps/server', 'packages/api', 'packages/domain']) {
  const installed = root + '/' + location + '/node_modules', target = baseline + '/' + location + '/node_modules';
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(installed)) {
   if (entry === '@todo') {
    fs.mkdirSync(target + '/@todo', { recursive: true });
    for (const name of fs.readdirSync(installed + '/@todo')) if (!fs.existsSync(target + '/@todo/' + name)) fs.symlinkSync(baseline + '/packages/' + name, target + '/@todo/' + name);
   } else if (!fs.existsSync(target + '/' + entry)) fs.symlinkSync(fs.realpathSync(installed + '/' + entry), target + '/' + entry);
  }
 }
 const sources = ['apps/macos/VerificationApp/CredentialTrap.c', 'apps/macos/VerificationApp/CredentialSymbols.inc', '.agents/skills/verify-macos-real-app/scripts/ProductionIsolation.m'];
 const flags = ['-dynamiclib', '-DTODO_CREDENTIAL_TRAPS_ONLY', '-Iapps/macos/VerificationApp', ...sources.filter(file => !file.endsWith('.inc')), '-framework', 'Security'];
 const libraryHash = createHash('sha256').update(JSON.stringify(flags)).update(checked(['xcrun', 'clang', '--version'], 'clang-version'));
 for (const file of sources) libraryHash.update(file).update(fs.readFileSync(file));
 const directory = root + '/.scratch/production-isolation/' + libraryHash.digest('hex'); fs.mkdirSync(directory, { recursive: true });
 const library = directory + '/libProductionAudit.dylib', provenance = directory + '/provenance.json';
 const old = fs.existsSync(provenance) ? JSON.parse(fs.readFileSync(provenance)) : null;
 if (!fs.existsSync(library) || (!result.development && old?.development)) {
  checked(['xcrun', 'clang', ...flags, '-install_name', library, '-o', library], 'build-credential-audit');
  fs.writeFileSync(provenance, JSON.stringify({ builtFromHead: head, development: result.development, sourceSHA256: Object.fromEntries(sources.map(file => [file, digest(file)])), librarySHA256: digest(library) }, null, 2));
 }
 const libraryProvenance = JSON.parse(fs.readFileSync(provenance)); assert.equal(digest(library), libraryProvenance.librarySHA256);
 result.libraryProvenance = libraryProvenance;
 const syntheticOwner = proof + '/audit-owner'; fs.mkdirSync(syntheticOwner); fs.mkdirSync(syntheticOwner + '/.todo-cli');
 const syntheticFile = syntheticOwner + '/.todo-cli/sentinel'; fs.writeFileSync(syntheticFile, 'synthetic; no bytes read');
 const auditSource = fs.readFileSync(scripts + '/ProductionIsolation.m', 'utf8');
 assert(auditSource.includes('if (protected_path(value.pvip.vip_path))'));
 const mutantSource = proof + '/audit-mutant.m'; fs.writeFileSync(mutantSource, auditSource.replace('if (protected_path(value.pvip.vip_path))', 'if (0)'));
 const mutantLibrary = proof + '/libAuditMutant.dylib';
 checked(['xcrun', 'clang', '-dynamiclib', '-DTODO_CREDENTIAL_TRAPS_ONLY', '-Iapps/macos/VerificationApp', 'apps/macos/VerificationApp/CredentialTrap.c', mutantSource, '-framework', 'Security', '-install_name', mutantLibrary, '-o', mutantLibrary], 'build-audit-mutant');
 const auditControls = [];
 for (const [label, linked, held, expected] of [['ordinary', library, false, 0], ['protected-synthetic', library, true, 78], ['audit-removed', mutantLibrary, true, 0]]) {
  const audit = evidence + '/audit-control-' + label; fs.mkdirSync(audit);
  const binary = proof + '/audit-probe-' + label;
  checked(['xcrun', 'clang', scripts + '/ProductionAuditProbe.c', linked, '-o', binary], 'build-audit-probe-' + label);
  const actual = execute([binary, ...(held ? [syntheticFile] : [])], 'audit-control-' + label, { ...env, TODO_PROOF_AUDIT: audit, TODO_PROOF_OWNER_HOME: syntheticOwner });
  assert.equal(actual.status, expected); auditControls.push({ label, exit: actual.status, matchingProtectedDescriptorTestExit: held ? actual.status === 78 ? 0 : 1 : null });
 }
 assert.equal(auditControls.at(-1).matchingProtectedDescriptorTestExit, 1);
 fs.writeFileSync(evidence + '/audit-controls.json', JSON.stringify(auditControls, null, 2));
 const lateProbe = proof + '/late-probe', lateAudit = evidence + '/audit-control-late'; fs.mkdirSync(lateAudit);
 checked(['xcrun', 'clang', scripts + '/ProductionLateProbe.c', '-o', lateProbe], 'build-late-probe');
 const late = execute([lateProbe, library], 'audit-control-late', { ...env, TODO_PROOF_AUDIT: lateAudit, TODO_PROOF_OWNER_HOME: syntheticOwner });
 fs.writeFileSync(evidence + '/late-binding-control.json', JSON.stringify({ observedExit: late.status, expectedExit: 0, matchingTestExit: late.status === 0 ? 0 : 1, originalCalled: false }, null, 2));
 assert.equal(late.status, 0, 'Late-loaded test credential bindings are not established; do not run a production suite');
 const owner = os.userInfo().homedir;
 const protectedPaths = [owner + '/.todo-cli', owner + '/Library/Keychains', '/System/Volumes/Data' + owner + '/.todo-cli', '/System/Volumes/Data' + owner + '/Library/Keychains', '/Library/Keychains', '/System/Library/Keychains', '/private/var/Keychains', '/var/Keychains'];
 const services = ['com.apple.securityd', 'com.apple.securityd.xpc', 'com.apple.secd', 'com.apple.security.agent', 'com.apple.SecurityServer', 'com.apple.security.authhost', 'com.apple.security.authorizationhost'];
 const fileDenial = '(deny file-read* file-write* ' + protectedPaths.map(file => '(subpath ' + JSON.stringify(file) + ')').join(' ') + ')';
 const serviceDenial = '(deny mach-lookup (global-name ' + services.map(name => JSON.stringify(name)).join(' ') + '))';
 const denyProfile = proof + '/deny-only.sb'; fs.writeFileSync(denyProfile, '(version 1)(allow default)' + fileDenial + serviceDenial);
 fs.copyFileSync(denyProfile, evidence + '/deny-only.sb');
 const probe = proof + '/guard-probe', sentinel = proof + '/ordinary-file'; fs.writeFileSync(sentinel, 'synthetic');
 checked(['xcrun', 'clang', scripts + '/ProductionGuardProbe.c', '-o', probe], 'build-policy-probe');
 const guardControls = [];
 for (const [label, policy, expected] of [['baseline', fileDenial + serviceDenial, 0], ['file-denial-removed', serviceDenial, 1], ['service-denial-removed', fileDenial, 1]]) {
  const profile = proof + '/' + label + '.sb'; fs.writeFileSync(profile, '(version 1)(allow default)' + policy);
  const actual = execute(['/usr/bin/sandbox-exec', '-f', profile, probe, sentinel, ...protectedPaths], 'policy-' + label);
  assert.equal(actual.status, expected); guardControls.push({ label, exit: actual.status });
 }
 fs.writeFileSync(evidence + '/guard-controls.json', JSON.stringify(guardControls, null, 2));
 if (process.argv.includes('--probe-controls')) result.status = 'DIAGNOSTIC_ONLY';
 else {
 const python = ['/opt/homebrew/bin/python3', '/usr/bin/python3'].find(file => fs.existsSync(file)); assert(python);
 const tools = { sh: '/bin/sh', ps: '/bin/ps', xcrun: '/usr/bin/xcrun', swift: '/usr/bin/swift', node: executable('node'), bun: executable('bun'), python3: fs.realpathSync(python) };
 function binaries(repository, sourceHead, reuse) {
  const cache = root + '/.scratch/production-binaries/' + sourceHead; fs.mkdirSync(cache, { recursive: true });
  for (const [source, name] of [['apps/cli/src/main.ts', 'todo'], ['apps/server/src/main.ts', 'todo-server'], ['apps/server/scripts/seed-verification.ts', 'seed'], ['.agents/skills/verify-task-search/seed-recovery.ts', 'search-recovery']]) {
   if (!fs.existsSync(cache + '/' + name)) {
    if (reuse && ['todo', 'todo-server'].includes(name)) fs.copyFileSync(reuse + '/' + (name === 'todo' ? name : 'todo-server-production'), cache + '/' + name, fs.constants.COPYFILE_EXCL);
    else checked(['bun', 'build', '--compile', path.join(repository, source), '--define', 'TODO_BUILD_ID=' + JSON.stringify(sourceHead.slice(0, 8)), '--outfile', cache + '/' + name], 'compile-' + sourceHead.slice(0, 8) + '-' + name, env, repository);
   }
  }
  const runtime = proof + '/binaries-' + sourceHead.slice(0, 8); fs.mkdirSync(runtime);
  for (const name of ['todo', 'todo-server', 'seed', 'search-recovery']) fs.copyFileSync(cache + '/' + name, runtime + '/' + name, fs.constants.COPYFILE_EXCL);
  const inputs = checked(['git', 'ls-files', 'apps/cli', 'apps/server', 'packages', 'pnpm-lock.yaml', '.agents/skills/verify-task-search/seed-recovery.ts'], 'inputs-' + sourceHead.slice(0, 8), env, repository).trim().split('\n');
  checked(['git', 'diff', '--exit-code', 'HEAD', '--', ...inputs], 'inputs-clean-' + sourceHead.slice(0, 8), env, repository);
  const binaryProvenance = { sourceHead, nativeCLIAndServerSourceHead: reuse ? native.sourceHead : sourceHead, repository, inputs: Object.fromEntries(inputs.map(file => [file, digest(repository + '/' + file)])), files: Object.fromEntries(['todo', 'todo-server', 'seed', 'search-recovery'].map(name => [name, { cache: cache + '/' + name, sha256: digest(runtime + '/' + name) }])) };
  fs.writeFileSync(evidence + '/binaries-' + sourceHead.slice(0, 8) + '.json', JSON.stringify(binaryProvenance, null, 2));
  return runtime;
 }
 const baseBinaries = binaries(baseline, baselineHead);
 const candidateBinaries = binaries(root, head, path.resolve(root, native.cache));
 const arms = [];
 for (const [name, repository, sourceHead, binaryDirectory, guarded] of [
  ['base-unguarded', baseline, baselineHead, baseBinaries, false],
  ['candidate-unguarded', root, head, candidateBinaries, false],
  ['base-deny-only', baseline, baselineHead, baseBinaries, true],
  ['candidate-deny-only', root, head, candidateBinaries, true],
 ]) {
  disk(name); if (process.argv.includes('--probe-base') && arms.length) break;
  const arm = evidence + '/' + name; fs.mkdirSync(arm); fs.mkdirSync(arm + '/audit');
  const values = { ...env, TODO_SERVER_BINARY: binaryDirectory + '/todo-server', TODO_CLI_BINARY: binaryDirectory + '/todo', TODO_SEED_BINARY: binaryDirectory + '/seed', SEC_SEARCH_RECOVERY_SEED: binaryDirectory + '/search-recovery', TODO_SWIFT_BUILD_PATH: repository + '/apps/macos/DerivedData/V01Proof' };
  const entry = { name, sourceHead, guarded, hostLoad: os.loadavg(), recipes: [], outcomes: [] };
  for (const [script, stage] of [['verify-write-state.py', 'state'], ['verify-design.py', 'offscreen']]) {
   if (process.argv.includes('--probe-base') && stage === 'offscreen') break;
   const driver = arm + '/' + stage + '-driver'; fs.mkdirSync(driver);
   const configuration = proof + '/configuration.json';
   fs.writeFileSync(configuration, JSON.stringify({ root: repository, proof, evidence: driver, library, tools, environment: values, hold: evidence + '/swift-hold', parentHold: path.dirname(evidence) + '/swift-hold', audit: arm + '/audit', ownerHome: owner, denyProfile: guarded ? denyProfile : null, graphCopier: scripts + '/bundle-graph.mjs' }));
   const actual = execute([tools.python3, '-I', '-S', scripts + '/production-recipe.py', repository + '/apps/macos/scripts/' + script, arm + '/' + stage, configuration], name + '-' + stage, values, repository);
   assert([0, 1].includes(actual.status), 'Production recipe aborted or timed out');
   const expanded = JSON.parse(fs.readFileSync(driver + '/expanded-commands.json'));
   let tests = 0;
   for (const row of expanded.filter(row => row.testXML)) {
    assert(Array.isArray(row.outcomes), 'Missing per-test XML results: ' + row.testXML);
    for (const test of row.outcomes) entry.outcomes.push({ id: stage + '/' + tests + '/' + test.id, outcome: test.outcome });
    tests++;
   }
   assert(tests > 0); entry.recipes.push({ stage, exit: actual.status, hostLoadAfter: os.loadavg() });
   assert(!fs.readFileSync(evidence + '/' + name + '-' + stage + '.log', 'utf8').includes('Security credential call trapped:'), 'A production test reached a credential binding');
  }
  const auditFiles = fs.readdirSync(arm + '/audit'); assert(auditFiles.length > 0);
  entry.descriptorAudit = auditFiles.map(file => {
   const rows = fs.readFileSync(arm + '/audit/' + file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
   assert(rows.every(row => row.protectedDescriptor === false && row.credentialBindingsChecked === 1638));
   assert(rows[0].started && rows.at(-1).finished); return { file, ...rows.at(-1) };
  });
  fs.writeFileSync(arm + '/outcomes.json', JSON.stringify(entry, null, 2)); arms.push(entry);
 }
 if (process.argv.includes('--probe-base')) { result.status = 'DIAGNOSTIC_ONLY'; result.arms = arms; }
 else {
  const plain = compareOutcomes(arms[0].outcomes, arms[1].outcomes), guarded = compareOutcomes(arms[2].outcomes, arms[3].outcomes);
  const guardOnBase = compareOutcomes(arms[0].outcomes, arms[2].outcomes);
  result = { ...result, arms, comparison: { plain, guarded, guardOnBase }, denyOnlyRetained: guardOnBase.sameOutcomes };
  assert(plain.sameOutcomes, 'Base/candidate production outcomes differ');
  if (result.denyOnlyRetained) assert(guarded.sameOutcomes, 'Guarded base/candidate production outcomes differ');
  assert.equal(checked(['git', 'rev-parse', 'HEAD'], 'head-after').trim(), head);
  result.status = 'PASS_PRESERVATION';
 }
 }
} catch (error) { result.error = error.stack; process.exitCode = 1; }
finally {
 const closed = run(['/usr/sbin/lsof', '-Fpcn', '+D', proof], { env, encoding: 'utf8' }); result.cleanup = { exit: closed.status, stdout: closed.stdout, stderr: closed.stderr };
 if (closed.status === 1 && !closed.stdout.trim() && !closed.stderr.trim()) {
  const files = {};
  function retainHashes(folder) {
   for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name), name = path.relative(proof, file);
    if (entry.isDirectory()) retainHashes(file);
    else if (entry.isFile()) files[name] = { bytes: fs.statSync(file).size, sha256: digest(file) };
    else if (entry.isSymbolicLink()) files[name] = { symlink: fs.readlinkSync(file) };
   }
  }
  retainHashes(proof); fs.writeFileSync(evidence + '/retired-proof-hashes.json', JSON.stringify({ sourceHead: result.sourceHead, files }, null, 2));
  fs.rmSync(proof, { recursive: true }); result.scratchRemoved = true;
 }
 else { result.retainedScratch = proof; result.status = 'FAIL'; process.exitCode = 1; }
 fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify({ status: result.status, sourceHead: result.sourceHead, error: result.error }));
}
