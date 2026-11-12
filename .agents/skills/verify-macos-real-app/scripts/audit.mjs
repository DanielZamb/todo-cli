#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import readline from 'node:readline';
const [app, evidence, production] = process.argv.slice(2);
assert(app && evidence, 'audit.mjs <verification-app> <evidence> [production-executable]');
const binary = path.join(app, 'Contents/MacOS/TodoVerification');
const library = path.join(app, 'Contents/Frameworks/libCredentialTrap.dylib');
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const symbols = run('xcrun', ['nm', '-u', binary]);
const linked = run('xcrun', ['otool', '-L', binary]);
fs.writeFileSync(path.join(evidence, 'verification-imports.txt'), symbols);
fs.writeFileSync(path.join(evidence, 'verification-linked.txt'), linked);
assert(!/\b_Sec\w+/.test(symbols), 'Verification app imports a Security function outside the credential trap');
assert(linked.includes('@rpath/libCredentialTrap.dylib'));
assert(fs.existsSync(library));
async function relevant(file) {
  const child = spawn('xcrun', ['nm', '-j', file]);
  const lines = readline.createInterface({ input: child.stdout });
  const selected = [];
  const exit = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('nm failed: ' + code))); });
  for await (const line of lines) if (/MemorySessionVault|VerificationManifest|ServerLifecycle|configureVerificationKeychain|SessionVault|ScratchSandbox|credentialTrapReady|TodoVerificationApp/.test(line)) selected.push(line);
  await exit;
  return selected.join('\n');
}
const demangled = execFileSync('xcrun', ['swift-demangle'], { input: await relevant(binary), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
fs.writeFileSync(path.join(evidence, 'verification-symbols.txt'), demangled);
assert(!demangled.includes('configureVerificationKeychain'));
assert(!demangled.includes('ServerLifecycle'));
assert(demangled.includes('MemorySessionVault'));
assert(demangled.includes('VerificationManifest'));
assert(!fs.existsSync(path.join(app, 'Contents/Resources/Server')));
const id = run('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleIdentifier', path.join(app, 'Contents/Info.plist')]).trim();
assert.equal(id, 'local.todo.verification');
if (production) {
  const output = execFileSync('xcrun', ['swift-demangle'], { input: await relevant(production), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(evidence, 'production-symbols.txt'), output);
  assert(output.includes('SessionVault'));
  for (const name of ['VerificationManifest', 'MemorySessionVault', 'ScratchSandbox', 'credentialTrapReady', 'TodoVerificationApp']) assert(!output.includes(name), `${name} leaked into production`);
}
fs.writeFileSync(path.join(evidence, 'audit.json'), JSON.stringify({ status: 'PASS', bundleID: id, noApplicationCredentialImports: true, trapLibraryEmbedded: true, managedServerAbsent: true, productionSymbolsChecked: Boolean(production) }, null, 2));
