import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as pause } from 'node:timers/promises';
const [cli, server, output] = process.argv.slice(2);
assert.ok(cli && server && output);
const directory = mkdtempSync(join(tmpdir(), 'todo-restore-entry-'));
let child;
const actions = [];
try {
  const path = join(directory, 'scratch.db'), env = { ...process.env, HOME: directory, TODO_DB: path, TODO_PORT: '0', NO_COLOR: '1' };
  const run = (args, input = '') => {
    const r = spawnSync(resolve(cli), ['--format', 'json', ...args], { env, input, encoding: 'utf8', timeout: 30000 });
    actions.push({ args, exit: r.status, stdout: r.stdout, stderr: r.stderr });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return r;
  };
  run(['init', '--password-stdin'], 'integration restore scratch\n');
  run(['login', '--password-stdin'], 'integration restore scratch\n');
  run(['add', 'Restore entry Task']);
  const saved = JSON.parse(run(['snapshot', 'create']).stdout).snapshot;
  assert.equal(typeof saved.id, 'string');
  const restored = run(['snapshot', 'restore', saved.id]);
  assert.match(restored.stderr, /RESTORE_ENTRY_TRANSACTION false/);
  assert.equal(restored.stderr.includes('RESTORE_ENTRY_TRANSACTION true'), false);
  const credential = JSON.parse(readFileSync(join(directory, '.todo-cli', 'session_default.json'))).token;
  child = spawn(resolve(server), [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', bytes => { log += bytes; });
  child.stderr.on('data', bytes => { log += bytes; });
  const deadline = performance.now() + 30000;
  while (!/Listening on (http:\/\/127.0.0.1:\d+)/.test(log)) { assert.equal(child.exitCode, null, log); assert.ok(performance.now() < deadline, log); await pause(10); }
  const base = log.match(/Listening on (http:\/\/127.0.0.1:\d+)/)[1];
  const created = await fetch(base + '/snapshots', { method:'POST', headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify({reason:'HTTP restore entry fixture'}) });
  assert.equal(created.status,200);
  const httpSaved = await created.json();
  assert.equal(typeof httpSaved.id, 'string');
  const response = await fetch(base + '/snapshots/' + httpSaved.id + '/restore', { method: 'POST', headers: { Authorization: 'Bearer ' + credential, 'Content-Type': 'application/json' }, body: JSON.stringify({ dry_run: false }) });
  const body = await response.text();
  mkdirSync(output, {recursive:true});
  writeFileSync(join(output, "attempt.json"), JSON.stringify({saved,actions,log,status:response.status,body,cliList:run(["snapshot","list"]).stdout,httpList:await (await fetch(base+"/snapshots",{headers:{Authorization:"Bearer "+credential}})).text()},null,2));
  assert.equal(response.status, 200, body);
  assert.match(log, /RESTORE_ENTRY_TRANSACTION false/);
  assert.equal(log.includes('RESTORE_ENTRY_TRANSACTION true'), false);
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'result.json'), JSON.stringify({ cli: { exit: 0, transactionAtRestoreEntry: false }, http: { status: response.status, transactionAtRestoreEntry: false }, actions, server: log }, null, 2));
} finally {
  if (child && child.exitCode === null) { const done = new Promise(r => child.once('exit', r)); child.kill('SIGTERM'); await done; }
  rmSync(directory, { recursive: true, force: true });
}
