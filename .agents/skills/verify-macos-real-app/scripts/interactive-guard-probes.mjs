import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { command, environment, start } from './process-policy.mjs';
const [mode, root, program, evidence, name, ...flags] = process.argv.slice(2);
assert(['file-protected', 'file-replaced', 'server-replaced'].includes(mode));
assert(root.startsWith('/private/tmp/todo-mac-verify-case-') && fs.realpathSync(root) === root);
assert(path.isAbsolute(program) && path.isAbsolute(evidence));
if (mode !== 'server-replaced') assert(name && path.basename(name) === name);
const env = environment(root + '/home', root + '/tmp', { TODO_VERIFICATION_MANIFEST: root + '/manifest.json' });
const signal = root + (mode === 'server-replaced' ? '/continue-test' : '/continue-file-test');
const argv = mode === 'server-replaced' ? [program, 'replaced-server'] : [program, root, root + '/' + name, '--wait', ...(mode === 'file-protected' ? ['--protect', ...flags] : [])];
const child = start(argv, { env, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '', stderr = '', replacement, requests = 0, error, record, result;
child.stdout.on('data', value => stdout += value); child.stderr.on('data', value => stderr += value);
const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (exit, signal) => { record = { argv: command(argv), environment: env, exit, signal, stdout, stderr }; resolve(record); }); });
done.catch(() => {});
try {
 const marker = mode === 'server-replaced' ? 'owned server stopped' : 'descriptor opened';
 const deadline = Date.now() + 90000;
 while (!stdout.includes(marker) && Date.now() < deadline) {
  assert(child.exitCode === null && child.signalCode === null, stdout + stderr);
  await new Promise(resolve => setTimeout(resolve, 10));
 }
 assert(stdout.includes(marker), 'Guard probe readiness expired after acquiring the Swift slot: ' + stdout + stderr);
 if (mode === 'server-replaced') {
  const manifest = JSON.parse(fs.readFileSync(root + '/manifest.json', 'utf8'));
  replacement = http.createServer((request, response) => { requests++; response.end(JSON.stringify({ service: 'todo-server', contract: manifest.contract, build: manifest.build })); });
  await new Promise((resolve, reject) => { replacement.once('error', reject); replacement.listen(new URL(manifest.serverURL).port, '127.0.0.1', resolve); });
 } else if (mode === 'file-protected') {
  let denied = false;
  try { fs.renameSync(root + '/' + name, root + '/' + name + '.replacement'); } catch (value) { denied = ['EPERM', 'EACCES'].includes(value.code); }
  assert(denied, 'A pinned path could be replaced: ' + name);
 } else {
  fs.renameSync(root + '/' + name, root + '/' + name + '.old'); fs.writeFileSync(root + '/' + name, 'replaced');
 }
 fs.writeFileSync(signal, 'continue');
 const observed = await done;
 assert.equal(observed.exit, mode === 'file-protected' ? 0 : 78, observed.stderr);
 assert.equal(requests, 0);
 result = { exit: observed.exit, ...(mode === 'file-protected' ? { swapDeniedByKernel: true } : {}), ...(mode === 'server-replaced' ? { requests } : {}) };
} catch (value) { error = value; }
finally {
 try { fs.writeFileSync(signal, 'continue'); await done; } catch (value) { error ??= value; }
 if (replacement) await new Promise(resolve => replacement.close(resolve));
 fs.writeFileSync(evidence, JSON.stringify({ mode, result, record, error: error?.stack, readinessBeginsInsideSwiftSlot: true, childClosedBeforeReturn: Boolean(record) }, null, 2));
}
if (error) throw error;
console.log(JSON.stringify(result));
