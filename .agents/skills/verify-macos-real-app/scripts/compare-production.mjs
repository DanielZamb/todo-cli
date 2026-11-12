#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import readline from 'node:readline';
import { environment, run as safeRun, start as safeStart } from './process-policy.mjs';
const scratch = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-audit-'));
fs.mkdirSync(scratch + '/home', { mode: 0o700 }); fs.mkdirSync(scratch + '/tmp', { mode: 0o700 });
const clean = environment(scratch + '/home', scratch + '/tmp');
process.on('exit', () => fs.rmSync(scratch, { recursive: true, force: true }));
function safeExec(program, args, options = {}) { const value = safeRun([program, ...args], { ...options, env: clean, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); assert.equal(value.status, 0, value.stderr); return value.stdout; }
const [current, baseline, evidence] = process.argv.slice(2);
fs.mkdirSync(evidence, { recursive: true });
const run = (args) => safeExec('xcrun', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const credentialImports = binary => run(['nm', '-u', binary]).split('\n').filter(line => /\b_Sec\w+/.test(line)).map(line => line.trim().replace(/^U\s+/, '')).sort();
async function storageSymbols(binary) {
  const child = safeStart(['xcrun', 'nm', '-j', binary], { env: clean });
  const completion = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('nm exited ' + code))); });
  const selected = [];
  for await (const line of readline.createInterface({ input: child.stdout })) if (/SessionVault|SessionStorage|VerificationManifest|MemorySessionVault|ScratchSandbox|TodoVerificationApp/.test(line)) selected.push(line);
  await completion;
  return safeExec('xcrun', ['swift-demangle'], { input: selected.join('\n'), encoding: 'utf8' }).split('\n').filter(Boolean).sort();
}
const oldSymbols = await storageSymbols(baseline);
const newSymbols = await storageSymbols(current);
const oldImports = credentialImports(baseline);
const newImports = credentialImports(current);
fs.writeFileSync(path.join(evidence, 'candidate6-storage-symbols.txt'), oldSymbols.join('\n'));
fs.writeFileSync(path.join(evidence, 'production-storage-symbols.txt'), newSymbols.join('\n'));
assert.deepEqual(newImports, oldImports, 'Production credential imports changed');
for (const name of ['VerificationManifest', 'MemorySessionVault', 'ScratchSandbox', 'TodoVerificationApp']) assert(!newSymbols.some(line => line.includes(name)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const oldSource = safeExec('git', ['show', '8b9be429751165d4ecef11f3f23d1844384e54b4:apps/macos/Sources/SessionVault.swift']);
const newSource = fs.readFileSync('apps/macos/Sources/SessionVault.swift');
assert.equal(hash(oldSource), hash(newSource));
const result = { status: 'PASS', sourceHead: safeExec('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), baselineSourceHead: '8b9be429751165d4ecef11f3f23d1844384e54b4', sourceUnchanged: true, sessionVaultSourceSHA256: hash(newSource), baselineBinarySHA256: hash(fs.readFileSync(baseline)), productionBinarySHA256: hash(fs.readFileSync(current)), credentialImports: newImports, symbolsAdded: newSymbols.filter(line => !oldSymbols.includes(line)), symbolsRemoved: oldSymbols.filter(line => !newSymbols.includes(line)) };
fs.writeFileSync(path.join(evidence, 'comparison.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, credentialImports: newImports, symbolsAdded: result.symbolsAdded.length, symbolsRemoved: result.symbolsRemoved.length }));
