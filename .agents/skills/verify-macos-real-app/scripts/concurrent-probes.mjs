import assert from 'node:assert/strict';
import fs from 'node:fs';
import { command, environment, start, run } from './process-policy.mjs';
const [kind, root, boundary, guard] = process.argv.slice(2);
assert(['root', 'machine'].includes(kind));
const env = environment(root + '/home', root + '/tmp', kind === 'root' ? { TODO_VERIFICATION_MANIFEST: root + '/manifest.json' } : {});
const records = [];
function launch(argv) {
 const child = start(argv, { env, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = '', stderr = '';
 child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x);
 const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (exit, signal) => { const r = { argv: command(argv), environment: env, exit, signal, stdout, stderr }; records.push(r); resolve(r); }); });
 return { child, done, output: () => stdout + stderr };
}
const first = launch([boundary, kind === 'root' ? 'hold' : 'machine-lock']);
const marker = kind === 'root' ? 'manifest accepted' : 'machine lock accepted';
for (let n = 0; n < 1000 && !first.output().includes(marker); n++) { assert.equal(first.child.exitCode, null, first.output()); await new Promise(r => setTimeout(r, 10)); }
assert(first.output().includes(marker), first.output());
const other = kind === 'root' ? [guard] : [boundary, 'machine-lock'];
const second = run(other, { env, encoding: 'utf8' }); records.push({ argv: command(other), environment: env, exit: second.status, signal: second.signal, stdout: second.stdout, stderr: second.stderr });
assert.equal(second.status, 78, second.stderr); assert.equal((await first.done).exit, 0);
if (kind === 'root') { const reused = run([guard], { env, encoding: 'utf8' }); records.push({ argv: command([guard]), environment: env, exit: reused.status, signal: reused.signal, stdout: reused.stdout, stderr: reused.stderr }); assert.equal(reused.status, 78); }
console.log(JSON.stringify({ kind, records }));
