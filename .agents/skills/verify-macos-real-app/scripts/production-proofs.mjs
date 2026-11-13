import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { command, environment, executable, run } from './process-policy.mjs';
process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const [evidence, nativeEvidence] = process.argv.slice(2);
assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
const proof = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-production-'));
fs.mkdirSync(proof + '/home'); fs.mkdirSync(proof + '/tmp'); fs.mkdirSync(proof + '/binaries');
const env = environment(proof + '/home', proof + '/tmp'), commands = [];
function checked(argv, label, values = env) {
 const value = run(argv, { cwd: root, env: values, encoding: 'utf8', timeout: ['state', 'offscreen'].includes(label) ? 3600000 : 1800000, maxBuffer: 128 * 1024 ** 2 });
 fs.writeFileSync(evidence + '/' + label + '.log', value.stdout + value.stderr); commands.push({ argv: command(argv), environment: values, exit: value.status, signal: value.signal, log: label + '.log' });
 fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); assert.equal(value.status, 0, label + ': ' + value.stderr.slice(-1600)); return value.stdout;
}
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let result = { status: 'FAIL', appLaunched: false, developerSigned: false, originalCredentialCalls: false };
try {
 checked(['sh', 'scripts/disk-guard.sh'], 'disk');
 const head = checked(['git', 'rev-parse', 'HEAD'], 'head').trim();
 const dirty = checked(['git', 'status', '--porcelain', '--untracked-files=normal'], 'status').trim();
 assert(!dirty || process.argv.includes('--development')); result.sourceHead = head; result.development = Boolean(dirty);
 const native = JSON.parse(fs.readFileSync(nativeEvidence + '/binary-provenance.json', 'utf8')); assert.equal(native.sourceHead, head);
 const cache = path.resolve(root, native.cache);
 for (const [source, name] of [['apps/server/scripts/seed-verification.ts', 'seed'], ['.agents/skills/verify-task-search/seed-recovery.ts', 'search-recovery']]) {
  const output = proof + '/binaries/' + name;
  checked(['bun', 'build', '--compile', source, '--define', 'TODO_BUILD_ID=' + JSON.stringify(head.slice(0, 8)), '--outfile', output], 'compile-' + name);
 }
 for (const [source, destination] of [['todo', 'todo'], ['todo-server-production', 'todo-server']]) fs.copyFileSync(cache + '/' + source, proof + '/binaries/' + destination, fs.constants.COPYFILE_EXCL);
 const isolationSources = ['apps/macos/VerificationApp/CredentialTrap.c', 'apps/macos/VerificationApp/CredentialSymbols.inc', 'apps/macos/VerificationApp/ChildProof.c', '.agents/skills/verify-macos-real-app/scripts/ProductionIsolation.m'];
 const sdk = checked(['xcrun', '--show-sdk-path'], 'sdk').trim();
 const isolationHash = createHash('sha256').update(sdk).update(checked(['xcrun', 'clang', '--version'], 'clang-version'));
 for (const file of isolationSources) isolationHash.update(file).update(fs.readFileSync(file));
 const isolationDirectory = path.join(root, '.scratch/production-isolation', isolationHash.digest('hex')); fs.mkdirSync(isolationDirectory, { recursive: true });
 const library = isolationDirectory + '/libProductionIsolation.dylib';
 const priorIsolation = fs.existsSync(isolationDirectory + '/provenance.json') ? JSON.parse(fs.readFileSync(isolationDirectory + '/provenance.json', 'utf8')) : null;
 if (!fs.existsSync(library) || (!result.development && priorIsolation?.development)) {
  checked(['xcrun', 'clang', '-dynamiclib', '-fobjc-arc', 'apps/macos/VerificationApp/CredentialTrap.c', 'apps/macos/VerificationApp/ChildProof.c', '.agents/skills/verify-macos-real-app/scripts/ProductionIsolation.m', '-framework', 'Security', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-framework', 'Foundation', '-install_name', library, '-o', library], 'build-linked-isolation');
  fs.writeFileSync(isolationDirectory + '/provenance.json', JSON.stringify({ builtFromHead: head, development: result.development, sourceSHA256: Object.fromEntries(isolationSources.map(file => [file, digest(file)])), librarySHA256: digest(library) }, null, 2));
 }
 const isolationProvenance = JSON.parse(fs.readFileSync(isolationDirectory + '/provenance.json', 'utf8')); assert.equal(digest(library), isolationProvenance.librarySHA256);
 const python = ['/opt/homebrew/bin/python3', '/usr/bin/python3'].find(file => fs.existsSync(file)); assert(python);
 const tools = { sh: '/bin/sh', ps: '/bin/ps', xcrun: '/usr/bin/xcrun', swift: '/usr/bin/swift', node: executable('node'), bun: executable('bun'), python3: fs.realpathSync(python) };
 const values = { ...env, TODO_SERVER_BINARY: proof + '/binaries/todo-server', TODO_CLI_BINARY: proof + '/binaries/todo', TODO_SEED_BINARY: proof + '/binaries/seed', SEC_SEARCH_RECOVERY_SEED: proof + '/binaries/search-recovery', TODO_SWIFT_BUILD_PATH: root + '/apps/macos/DerivedData/V01Proof' };
 const settings = { root, proof, evidence, library, tools, environment: values, hold: evidence + '/swift-hold', parentHold: path.dirname(evidence) + '/swift-hold' };
 const configuration = proof + '/configuration.json'; fs.writeFileSync(configuration, JSON.stringify(settings), { mode: 0o600 });
 fs.writeFileSync(evidence + '/provenance.json', JSON.stringify({ sourceHead: head, librarySHA256: digest(library), isolationProvenance, binaries: Object.fromEntries(fs.readdirSync(proof + '/binaries').map(name => [name, digest(proof + '/binaries/' + name)])), recipeSources: Object.fromEntries(['verify-write-state.py', 'verify-design.py'].map(name => [name, digest(root + '/apps/macos/scripts/' + name)])), noDYLDInjection: true, noProductionSourceSubstitution: true }, null, 2));
 for (const [script, name] of [['verify-write-state.py', 'state'], ['verify-design.py', 'offscreen']]) {
  checked([tools.python3, '-I', '-S', root + '/.agents/skills/verify-macos-real-app/scripts/production-recipe.py', root + '/apps/macos/scripts/' + script, evidence + '/' + name, configuration], name, values);
 }
 assert.equal(checked(['git', 'rev-parse', 'HEAD'], 'head-after').trim(), head); result.status = 'PASS';
} catch (error) { result.error = error.stack; process.exitCode = 1; }
finally {
 const closed = run(['/usr/sbin/lsof', '-Fpcn', '+D', proof], { env, encoding: 'utf8' });
 result.cleanup = { exit: closed.status, stdout: closed.stdout, stderr: closed.stderr };
 if (closed.status === 1 && !closed.stdout.trim() && !closed.stderr.trim()) { fs.rmSync(proof, { recursive: true }); result.scratchRemoved = true; }
 else { result.retainedScratch = proof; result.status = 'FAIL'; process.exitCode = 1; }
 fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
