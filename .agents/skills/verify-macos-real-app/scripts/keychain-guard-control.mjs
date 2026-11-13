#!/usr/bin/env node
// Coordinator ruling, 2026-11-13: rerun candidate 8's Keychain link guard red control on this head.
// The state package is mirrored with the production SessionVault (prepare --production-vault), its
// tests are built through the shared Swift slot, and the guard must exit 3 naming the vault's
// Keychain calls. The green half is every production recipe's own keychain-guard.json
// (in-memory vault, keychainLinked false), which qualification already requires. Nothing is run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { command, environment, run } from './process-policy.mjs';
import { productionScratchRoot } from './production-paths.mjs';
process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const [evidence, hold] = process.argv.slice(2);
assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
const scratch = productionScratchRoot(root); fs.mkdirSync(scratch + '/home'); fs.mkdirSync(scratch + '/tmp');
const env = environment(scratch + '/home', scratch + '/tmp'), commands = [];
const python = ['/opt/homebrew/bin/python3', '/usr/bin/python3'].find(file => fs.existsSync(file)); assert(python);
// The production vault's Keychain calls, as candidate 8's control named them.
const EXPECTED = ['_SecItemAdd', '_SecItemCopyMatching', '_SecItemDelete', '_SecItemUpdate', '_SecKeychainSetUserInteractionAllowed'];
function execute(argv, label, timeout = 1200000) {
 const value = run(argv, { cwd: root, env, encoding: 'utf8', timeout, maxBuffer: 256 * 1024 ** 2 });
 fs.writeFileSync(evidence + '/' + label + '.log', (value.stdout ?? '') + (value.stderr ?? ''));
 commands.push({ argv: command(argv), environment: env, exit: value.status, signal: value.signal, error: value.error?.message, log: label + '.log' });
 fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); return value;
}
let result = { status: 'FAIL', appLaunched: false, testsRun: false };
try {
 result.sourceHead = execute(['git', 'rev-parse', 'HEAD'], 'head').stdout.trim();
 const mirror = scratch + '/production-vault/apps/macos', build = scratch + '/production-vault-build';
 const prepared = execute([python, '-I', root + '/apps/macos/scripts/state_package.py', 'prepare', '--production-vault', mirror], 'prepare-production-vault');
 assert.equal(prepared.status, 0, prepared.stderr);
 const vault = fs.readFileSync(mirror + '/Sources/SessionVault.swift'), product = fs.readFileSync(root + '/apps/macos/Sources/SessionVault.swift');
 assert(vault.equals(product), 'The control must build the production SessionVault');
 result.productionVaultSHA256 = createHash('sha256').update(vault).digest('hex');
 assert(!fs.existsSync(hold), 'Coordinator holds new Swift jobs');
 const space = fs.statfsSync(root); assert(space.bavail * space.bsize >= 40 * 1024 ** 3, 'DISK STOP before the guard control build: under 40 GiB');
 const built = execute(['/bin/sh', root + '/scripts/swift-slot.sh', '/usr/bin/xcrun', 'swift', 'build', '--build-tests', '--jobs', '2', '--package-path', mirror, '--scratch-path', build, '--disable-automatic-resolution', '--disable-keychain', '--disable-netrc'], 'build-production-vault', 5400000);
 assert.equal(built.status, 0, 'build-production-vault: ' + (built.stderr ?? '').slice(-1800));
 const receipt = evidence + '/keychain-guard-production-vault.json';
 const guarded = execute([python, '-I', root + '/apps/macos/scripts/state_package.py', 'guard', build, receipt], 'guard-production-vault');
 const observed = JSON.parse(fs.readFileSync(receipt, 'utf8'));
 const linked = [...new Set(Object.values(observed.keychainSymbols).flat())].sort();
 result = { ...result, guardExit: guarded.status, keychainLinked: observed.keychainLinked, products: observed.products, linkedSymbols: linked, linkingProducts: Object.keys(observed.keychainSymbols) };
 assert.equal(guarded.status, 3, 'The guard must refuse a production-vault build');
 assert.equal(observed.keychainLinked, true);
 assert.deepEqual(linked, EXPECTED, 'The guard must name the production vault\'s Keychain calls');
 result.status = 'PASS_RED_CONTROL';
} catch (error) { result.error = error.stack; process.exitCode = 1; }
finally {
 const open = run(['/usr/sbin/lsof', '-Fpcn', '+D', scratch], { env, encoding: 'utf8' });
 if (open.status === 1 && !open.stdout.trim() && !open.stderr.trim()) { fs.rmSync(scratch, { recursive: true }); result.scratchRemoved = true; }
 else { result.retainedScratch = scratch; process.exitCode = 1; }
 fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2));
 console.log(JSON.stringify({ status: result.status, sourceHead: result.sourceHead, error: result.error }));
}
