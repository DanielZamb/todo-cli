#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { environment, run as safeRun, start as safeStart } from './process-policy.mjs';
const scratch = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-audit-'));
fs.mkdirSync(scratch + '/home', { mode: 0o700 }); fs.mkdirSync(scratch + '/tmp', { mode: 0o700 });
const clean = environment(scratch + '/home', scratch + '/tmp');
process.on('exit', () => fs.rmSync(scratch, { recursive: true, force: true }));
function safeExec(program, args, options = {}) { const value = safeRun([program, ...args], { ...options, env: clean, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); assert.equal(value.status, 0, value.stderr); return value.stdout; }
const [app, evidence, production] = process.argv.slice(2);
assert(app && evidence, 'audit.mjs <verification-app> <evidence> [production-executable]');
const binary = path.join(app, 'Contents/MacOS/TodoVerification');
const library = path.join(app, 'Contents/Frameworks/libCredentialTrap.dylib');
const run = (command, args) => safeExec(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const symbols = run('xcrun', ['nm', '-u', binary]);
const linked = run('xcrun', ['otool', '-L', binary]);
fs.writeFileSync(path.join(evidence, 'verification-imports.txt'), symbols);
fs.writeFileSync(path.join(evidence, 'verification-linked.txt'), linked);
const isCredential = name => /^(SecAccess|SecACL|SecItem|SecIdentity|SecKey|SecPassword|SecPKCS12|SecCertificate|SecTrust|SecImport|SecExport|SecCopyErrorMessageString|Authorization|SOS)/.test(name) || (/^Sec/.test(name) && /Credential|Keychain|Password|Passkey|PassKey/.test(name));
const importedCredentials = value => [...value.matchAll(/\b_([A-Za-z][A-Za-z0-9_]*)/g)].map(row => row[1]).filter(isCredential);
assert.deepEqual(importedCredentials(symbols), [], 'Verification app imports a credential function outside the credential trap');
assert(linked.includes('@rpath/libCredentialTrap.dylib'));
const bindings = new Set([...fs.readFileSync('apps/macos/VerificationApp/CredentialSymbols.inc', 'utf8').matchAll(/TRAP\((\w+)\)/g)].map(row => row[1]));
const trapImports = run('xcrun', ['nm', '-u', library]);
const credentialImports = [...new Set(importedCredentials(trapImports))].sort();
for (const name of credentialImports) assert(bindings.has(name), 'Untrapped linked credential entry: ' + name);
for (const name of ['SecPKCS12Import', 'SecKeyCreateRandomKey', 'SecKeyGeneratePair']) assert(bindings.has(name));
fs.writeFileSync(path.join(evidence, 'credential-import-audit.json'), JSON.stringify({ credentialImports, everyImportedCredentialHasTrap: true, originalCalls: false }, null, 2));
const verificationSources = fs.readdirSync('apps/macos/VerificationApp').filter(file => file.endsWith('.swift')).map(file => fs.readFileSync('apps/macos/VerificationApp/' + file, 'utf8')).join('\n');
assert(!/URLSession\.shared|URLSessionConfiguration\.default|NSUbiquitousKeyValueStore|CKContainer|ASAuthorization|SecRequestSharedWebCredential/.test(verificationSources));
assert(verificationSources.includes('URLSessionConfiguration.ephemeral'));
assert(verificationSources.includes('clientFactory: { server, credential in factory.client('));
assert(fs.existsSync(library));
async function relevant(file) {
  const child = safeStart(['xcrun', 'nm', '-j', file], { env: clean });
  const lines = readline.createInterface({ input: child.stdout });
  const selected = [];
  const exit = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('nm failed: ' + code))); });
  for await (const line of lines) if (/MemorySessionVault|VerificationManifest|ServerLifecycle|configureVerificationKeychain|SessionVault|ScratchSandbox|credentialTrapReady|TodoVerificationApp/.test(line)) selected.push(line);
  await exit;
  return selected.join('\n');
}
const demangled = safeExec('xcrun', ['swift-demangle'], { input: await relevant(binary), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
fs.writeFileSync(path.join(evidence, 'verification-symbols.txt'), demangled);
assert(!demangled.includes('configureVerificationKeychain'));
assert(!demangled.includes('ServerLifecycle'));
assert(demangled.includes('MemorySessionVault'));
assert(demangled.includes('VerificationManifest'));
assert(!fs.existsSync(path.join(app, 'Contents/Resources/Server')));
const id = run('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleIdentifier', path.join(app, 'Contents/Info.plist')]).trim();
assert.equal(id, 'local.todo.verification');
if (production) {
  const output = safeExec('xcrun', ['swift-demangle'], { input: await relevant(production), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(evidence, 'production-symbols.txt'), output);
  assert(output.includes('SessionVault'));
  for (const name of ['VerificationManifest', 'MemorySessionVault', 'ScratchSandbox', 'credentialTrapReady', 'TodoVerificationApp']) assert(!output.includes(name), `${name} leaked into production`);
}
fs.writeFileSync(path.join(evidence, 'audit.json'), JSON.stringify({ status: 'PASS', bundleID: id, noApplicationCredentialImports: true, trapLibraryEmbedded: true, managedServerAbsent: true, productionSymbolsChecked: Boolean(production) }, null, 2));
