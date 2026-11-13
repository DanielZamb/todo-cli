#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { command, environment, run as safeRun, start as safeStart } from './process-policy.mjs';
import { undefinedSymbolNames } from './mach-o-imports.mjs';
const [app, evidence, production] = process.argv.slice(2);
assert(app && evidence, 'audit.mjs <verification-app> <evidence> [production-executable]');
const commands = [];
function record(argv, value) {
  commands.push({ argv: command(argv), environment: clean, exit: value.status, signal: value.signal, error: value.error?.message });
  fs.writeFileSync(path.join(evidence, 'audit-commands.json'), JSON.stringify(commands, null, 2));
}
const scratch = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-audit-'));
fs.mkdirSync(scratch + '/home', { mode: 0o700 }); fs.mkdirSync(scratch + '/tmp', { mode: 0o700 });
const clean = environment(scratch + '/home', scratch + '/tmp');
process.on('exit', () => fs.rmSync(scratch, { recursive: true, force: true }));
function safeExec(program, args, options = {}) {
  let argv = [program, ...args];
  if (program === 'xcrun' && args[0].startsWith('swift')) {
    assert(!fs.existsSync(path.join(evidence, 'swift-hold')), 'Coordinator holds new Swift jobs');
    argv = ['/bin/sh', path.resolve('scripts/swift-slot.sh'), ...command(argv)];
  }
  const value = safeRun(argv, { ...options, env: clean, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  record(argv, value); assert.equal(value.status, 0, value.stderr); return value.stdout;
}
const binary = path.join(app, 'Contents/MacOS/TodoVerification');
const library = path.join(app, 'Contents/Frameworks/libCredentialTrap.dylib');
const run = (command, args) => safeExec(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const symbols = run('xcrun', ['nm', '-j', '-u', binary]);
const linked = run('xcrun', ['otool', '-L', binary]);
fs.writeFileSync(path.join(evidence, 'verification-imports.txt'), symbols);
fs.writeFileSync(path.join(evidence, 'verification-linked.txt'), linked);
const sdk = run('xcrun', ['--show-sdk-path']).trim();
const securityTBD = fs.readFileSync(path.join(sdk, 'System/Library/Frameworks/Security.framework/Versions/A/Security.tbd'), 'utf8');
const exportedSecurity = new Set([...securityTBD.matchAll(/_([A-Za-z0-9_$]+)/g)].map(row => row[1]));
const importedCredentials = value => undefinedSymbolNames(value).filter(name => exportedSecurity.has(name));

assert.deepEqual(importedCredentials(symbols), [], 'Verification app imports a credential function outside the credential trap');
assert(linked.includes('@rpath/libCredentialTrap.dylib'));
const bindings = new Set([...fs.readFileSync('apps/macos/VerificationApp/CredentialSymbols.inc', 'utf8').matchAll(/TRAP\((\w+)\)/g)].map(row => row[1]));
const trapImports = run('xcrun', ['nm', '-j', '-u', library]);
const credentialImports = [...new Set(importedCredentials(trapImports))].sort();
const locallyDeniedAnalytics = ['SecTrustReportNetworkingAnalytics'];
for (const name of credentialImports) assert(bindings.has(name) || locallyDeniedAnalytics.includes(name), 'Unaccounted Security import: ' + name);
for (const name of [...bindings, ...locallyDeniedAnalytics]) assert(credentialImports.includes(name), 'An expected trap import is absent from the actual binary audit: ' + name);
for (const name of ['SecPKCS12Import', 'SecKeyCreateRandomKey', 'SecKeyGeneratePair']) assert(bindings.has(name));
const analyticsAssembly = run('xcrun', ['otool', '-tvV', library]).split('_deny_networking_analytics:\n')[1]?.split(/\n_[^\n]+:/)[0];
assert(analyticsAssembly && /\bret(?:q|ab)?\b/.test(analyticsAssembly));
assert(!/\t(?:bl\w*|br\w*|b(?:\.[a-z]+)?|call\w*|jmp\w*|svc|syscall|sysenter)\b/.test(analyticsAssembly), 'Networking analytics denial must not call or forward to a service');
fs.writeFileSync(path.join(evidence, 'analytics-denial-disassembly.txt'), analyticsAssembly);
run('xcrun', ['clang', '.agents/skills/verify-macos-real-app/scripts/NetworkingAnalyticsProbe.c', '-L' + path.dirname(library), '-lCredentialTrap', '-framework', 'Security', '-Wl,-rpath,' + path.dirname(library), '-o', scratch + '/analytics-probe']);
run(scratch + '/analytics-probe', []);
fs.writeFileSync(path.join(evidence, 'credential-import-audit.json'), JSON.stringify({ credentialImports, locallyDeniedAnalytics, analyticsBindingAndFalseReturnChecked: true, analyticsHasNoCallsOrSystemCalls: true, everyImportedCredentialHasTrap: true, originalCalls: false }, null, 2));
const verificationSources = fs.readdirSync('apps/macos/VerificationApp').filter(file => file.endsWith('.swift')).map(file => fs.readFileSync('apps/macos/VerificationApp/' + file, 'utf8')).join('\n');
assert(!/URLSession\.shared|URLSessionConfiguration\.default|NSUbiquitousKeyValueStore|CKContainer|ASAuthorization|SecRequestSharedWebCredential/.test(verificationSources));
assert(verificationSources.includes('URLSessionConfiguration.ephemeral'));
assert(verificationSources.includes('clientFactory: { server, credential in factory.client('));
assert(fs.existsSync(library));
async function relevant(file) {
  const argv = ['xcrun', 'nm', '-j', file];
  const child = safeStart(argv, { env: clean });
  const lines = readline.createInterface({ input: child.stdout });
  const selected = [];
  let stderr = ''; child.stderr.on('data', value => stderr += value);
  const exit = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (status, signal) => { record(argv, { status, signal }); status === 0 ? resolve() : reject(new Error('nm failed: ' + status + ': ' + stderr)); }); });
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
