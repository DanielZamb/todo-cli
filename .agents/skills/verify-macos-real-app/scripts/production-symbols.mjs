#!/usr/bin/env node
// Coordinator ruling, 2026-11-13: re-derive the production storage-symbol comparison against the
// installed candidate 8. Two unsigned Release builds of the production app (base 20d592d3 and this
// head), CODE_SIGNING_ALLOWED=NO, through the shared Swift slot. Built, never launched.
// --check-phases runs only the two non-Swift build phases (graph resources, server bundle) for both
// checkouts, to prove their environment without a Swift build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { command, environment, executable, run } from './process-policy.mjs';
import { productionScratchRoot } from './production-paths.mjs';
import { compareSymbols } from './production-symbol-compare.mjs';
process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const baselineHead = '20d592d3ba50b38cf17c697d0645304e75334cc1';
const [evidence, nativeEvidence, sourcePackages, hold] = process.argv.slice(2);
const phasesOnly = process.argv.includes('--check-phases');
assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
const scratch = productionScratchRoot(root); fs.mkdirSync(scratch + '/home'); fs.mkdirSync(scratch + '/tmp');
const env = environment(scratch + '/home', scratch + '/tmp'), commands = [];
// The server bundle phase runs `pnpm licenses list`, which reads the package store this worktree was
// installed from. Name that store in the scratch HOME's .npmrc (read from node_modules/.modules.yaml)
// instead of using the real HOME or passing an unapproved environment setting.
const storeDir = fs.readFileSync(root + '/node_modules/.modules.yaml', 'utf8').match(/"?storeDir"?:\s*"?([^"\n]+)"?/)[1].trim();
assert(path.isAbsolute(storeDir) && /\/v\d+$/.test(storeDir) && fs.existsSync(storeDir), 'Unexpected pnpm store: ' + storeDir);
fs.writeFileSync(scratch + '/home/.npmrc', 'store-dir=' + path.dirname(storeDir) + '\n', { mode: 0o600 });
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function execute(argv, label, values = env, cwd = root, timeout = 1200000) {
 const value = run(argv, { cwd, env: values, encoding: 'utf8', timeout, maxBuffer: 256 * 1024 ** 2 });
 fs.writeFileSync(evidence + '/' + label + '.log', (value.stdout ?? '') + (value.stderr ?? ''));
 commands.push({ argv: command(argv), cwd, environment: values, exit: value.status, signal: value.signal, error: value.error?.message, log: label + '.log' });
 fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); return value;
}
function checked(argv, label, values = env, cwd = root, timeout) {
 const value = execute(argv, label, values, cwd, timeout); assert.equal(value.status, 0, label + ': ' + (value.stderr ?? '').slice(-1800)); return value.stdout;
}
function closed(directory, label) {
 const value = execute(['/usr/sbin/lsof', '-Fpcn', '+D', directory], label);
 assert(value.status === 1 && !value.stdout.trim() && !value.stderr.trim(), 'Open files remain under ' + directory);
}
function retire(directory, label) {
 if (!fs.existsSync(directory)) return null;
 closed(directory, label + '-open-files');
 const files = {};
 (function visit(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
   const file = path.join(folder, entry.name);
   if (entry.isDirectory()) visit(file); else if (entry.isFile()) files[path.relative(directory, file)] = digest(file);
  }
 })(directory);
 const before = fs.statfsSync(root);
 fs.writeFileSync(evidence + '/' + label + '-hashes.json', JSON.stringify({ directory, files }, null, 2));
 fs.rmSync(directory, { recursive: true });
 const after = fs.statfsSync(root);
 return { directory, files: Object.keys(files).length, freeBytesBefore: before.bavail * before.bsize, freeBytesAfter: after.bavail * after.bsize };
}
// The same base checkout production-proofs uses, with the worktree's installed packages linked in.
function baseline() {
 const directory = root + '/.scratch/production-base-' + baselineHead.slice(0, 8);
 if (!fs.existsSync(directory)) {
  checked(['git', 'clone', '--shared', '--no-checkout', '--', root, directory], 'base-clone');
  checked(['git', 'checkout', '--detach', baselineHead], 'base-checkout', env, directory);
 }
 assert.equal(checked(['git', 'rev-parse', 'HEAD'], 'base-head', env, directory).trim(), baselineHead);
 checked(['git', 'diff', '--exit-code', 'HEAD'], 'base-clean', env, directory);
 if (!fs.existsSync(directory + '/node_modules')) fs.symlinkSync(root + '/node_modules', directory + '/node_modules');
 for (const location of ['apps/cli', 'apps/server', 'apps/electron', 'packages/api', 'packages/domain']) {
  const installed = root + '/' + location + '/node_modules', target = directory + '/' + location + '/node_modules';
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(installed)) {
   if (entry === '@todo') {
    fs.mkdirSync(target + '/@todo', { recursive: true });
    for (const name of fs.readdirSync(installed + '/@todo')) if (!fs.existsSync(target + '/@todo/' + name)) fs.symlinkSync(directory + '/packages/' + name, target + '/@todo/' + name);
   } else if (!fs.existsSync(target + '/' + entry)) fs.symlinkSync(fs.realpathSync(installed + '/' + entry), target + '/' + entry);
  }
 }
 return directory;
}
const STORAGE = /SessionVault|SessionStorage|VerificationManifest|MemorySessionVault|ScratchSandbox|TodoVerificationApp/;
function credentialImports(binary, label) {
 const names = checked(['xcrun', 'nm', '-u', '-j', binary], 'imports-' + label).split('\n').map(line => line.trim()).filter(Boolean);
 assert(names.length > 0, 'nm returned no undefined symbols; the import audit cannot be trusted: ' + label);
 return names.filter(name => /^_Sec\w+$/.test(name)).sort();
}
// Same selection and demangling as the reviewed candidate 6 comparison (compare-production.mjs).
function storageSymbols(binary, label) {
 const selected = checked(['xcrun', 'nm', '-j', binary], 'symbols-' + label).split('\n').filter(line => STORAGE.test(line));
 assert(selected.length > 0, 'No storage symbols found; the filter cannot be trusted: ' + label);
 const demangled = run(['xcrun', 'swift-demangle'], { cwd: root, env, input: selected.join('\n'), encoding: 'utf8', maxBuffer: 64 * 1024 ** 2 });
 fs.writeFileSync(evidence + '/demangle-' + label + '.log', demangled.stdout + demangled.stderr);
 commands.push({ argv: command(['xcrun', 'swift-demangle']), cwd: root, environment: env, exit: demangled.status, log: 'demangle-' + label + '.log' });
 assert.equal(demangled.status, 0, 'swift-demangle failed: ' + label);
 return demangled.stdout.split('\n').filter(Boolean).sort();
}
let result = { status: 'FAIL', appLaunched: false, developerSigned: false, baselineHead, pnpmStoreRead: storeDir };
try {
 const head = checked(['git', 'rev-parse', 'HEAD'], 'head').trim(); result.sourceHead = head;
 const native = JSON.parse(fs.readFileSync(nativeEvidence + '/binary-provenance.json', 'utf8'));
 const server = path.resolve(root, native.cache, 'todo-server-production'); assert(fs.existsSync(server)); result.serverSHA256 = digest(server);
 const base = baseline();
 const checkouts = [['base', base], ['candidate', root]];
 const values = { ...env };
 if (phasesOnly) {
  // The two shell phases of the production target, as Xcode runs them, into scratch resources.
  result.phases = [];
  for (const [label, repository] of checkouts) {
   const resources = scratch + '/' + label + '-resources'; fs.mkdirSync(resources);
   const graph = execute(['node', repository + '/apps/macos/scripts/graph-resources.mjs', resources + '/graph-browser'], 'phase-graph-' + label, values, repository);
   const bundle = execute(['/bin/sh', repository + '/apps/macos/scripts/bundle-server.sh', resources + '/Server'], 'phase-server-' + label, environment(scratch + '/home', scratch + '/tmp', { TODO_SERVER_BINARY: server }), repository);
   result.phases.push({ label, graphExit: graph.status, serverExit: bundle.status });
  }
  assert(result.phases.every(row => row.graphExit === 0 && row.serverExit === 0), 'A production build phase failed outside Xcode');
  result.status = 'DIAGNOSTIC_ONLY';
 } else {
  assert(fs.existsSync(sourcePackages + '/checkouts'), 'Reuse the verification build\'s resolved packages; no network resolution');
  const binaries = {};
  for (const [label, repository] of checkouts) {
   assert(!fs.existsSync(hold), 'Coordinator holds new Swift jobs');
   const derived = root + '/.scratch/production-symbols/' + label;
   const space = fs.statfsSync(root); assert(space.bavail * space.bsize >= 40 * 1024 ** 3, 'DISK STOP before the ' + label + ' production build: under 40 GiB');
   checked(['/bin/sh', root + '/scripts/swift-slot.sh', '/usr/bin/xcodebuild', '-project', repository + '/apps/macos/Todo.xcodeproj', '-scheme', 'Todo', '-configuration', 'Release', '-destination', 'platform=macOS', '-derivedDataPath', derived, '-clonedSourcePackagesDirPath', sourcePackages, '-disableAutomaticPackageResolution', '-skipPackageUpdates', 'clean', 'build', 'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'ONLY_ACTIVE_ARCH=YES', 'TODO_SERVER_BINARY=' + server], 'build-production-' + label, environment(scratch + '/home', scratch + '/tmp', { TODO_SERVER_BINARY: server }), repository, 5400000);
   checked(['git', 'diff', '--exit-code', 'HEAD', '--', 'apps/macos/Package.resolved', 'apps/macos/API/Package.resolved', 'apps/macos/Todo.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'], 'resolved-unchanged-' + label, env, repository);
   const binary = derived + '/Build/Products/Release/Todo.app/Contents/MacOS/Todo'; assert(fs.existsSync(binary));
   const signature = execute(['/usr/bin/codesign', '-dv', binary], 'signature-' + label);
   binaries[label] = { binary, sha256: digest(binary), imports: credentialImports(binary, label), symbols: storageSymbols(binary, label), developerSigned: /Authority=/.test(signature.stderr ?? '') };
   fs.writeFileSync(evidence + '/' + label + '-storage-symbols.txt', binaries[label].symbols.join('\n') + '\n');
   assert.equal(binaries[label].developerSigned, false, 'A production build carried a developer signature');
  }
  const reviewed = JSON.parse(fs.readFileSync(root + '/docs/evidence/mac-verification-app/symbols-ab989410/comparison.json', 'utf8'));
  result = { ...result, binaries: Object.fromEntries(Object.entries(binaries).map(([key, value]) => [key, { sha256: value.sha256, credentialImports: value.imports, storageSymbols: value.symbols.length }])), reviewedCandidate6Added: reviewed.symbolsAdded.length };
  Object.assign(result, compareSymbols({ base: binaries.base, candidate: binaries.candidate, reviewed }));
  result.retired = ['base', 'candidate'].map(label => retire(root + '/.scratch/production-symbols/' + label, 'retire-production-symbols-' + label));
  result.status = 'PASS_SYMBOLS';
 }
} catch (error) { result.error = error.stack; process.exitCode = 1; }
finally {
 try { closed(scratch, 'scratch-closed'); fs.rmSync(scratch, { recursive: true }); result.scratchRemoved = true; } catch (error) { result.retainedScratch = scratch; result.cleanupError = String(error); process.exitCode = 1; }
 fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2));
 console.log(JSON.stringify({ status: result.status, sourceHead: result.sourceHead, error: result.error }));
}
