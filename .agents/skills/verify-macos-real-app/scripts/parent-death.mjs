import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { command, environment, run, start } from './process-policy.mjs';
import { sandboxProfile } from './boundary-profiles.mjs';

// The caller supplies a fresh, owned fixture and compiled relay. This component
// has no window and signals only the process group it created itself.
export async function qualifyParentDeath({ evidence, fixture, relay, sourceHead, before = false }) {
  assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const f = await fixture(), commands = [];
  const env = { HOME: f.manifest.home, CFFIXED_USER_HOME: f.manifest.home, TMPDIR: f.directory + '/tmp', TODO_DB: f.manifest.database, TODO_PORT: String(new URL(f.manifest.serverURL).port), LANG: 'C', LC_ALL: 'C' };
  const policy = sandboxProfile(f.directory, f.manifest.serverPath, Number(env.TODO_PORT));
  const argv = [relay, policy, f.manifest.serverPath];
  const parent = start(argv, { env, cwd: f.directory, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', closed = false;
  parent.stdout.on('data', data => stdout += data); parent.stderr.on('data', data => stderr += data);
  const done = new Promise((resolve, reject) => { parent.on('error', reject); parent.on('close', (exit, signal) => { closed = true; resolve({ exit, signal }); }); });
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  let result = { sourceHead, status: 'FAIL', completeRecipe: false, SwiftStarted: false, before };
  try {
    for (let n = 0; n < 1000 && !stdout.includes('Listening on '); n++) {
      assert.equal(parent.exitCode, null, stdout + stderr); assert.equal(parent.signalCode, null, stdout + stderr); await pause(10);
    }
    assert(stdout.includes('Listening on '), stdout + stderr);
    const row = JSON.parse(stdout.split('\n').find(line => line.startsWith('owned-relay ')).slice(12));
    assert.equal(row.parentPID, parent.pid); assert.equal(row.groupPID, parent.pid);
    result.ownedRelay = row;
    assert(parent.kill('SIGKILL'));
    for (let n = 0; n < 200 && !closed; n++) await pause(5);
    result.serverPipeClosedAfterParentDeath = closed;
    const assertion = ['node', '-e', 'require("node:assert/strict").equal(process.argv[1], "true")', String(closed)];
    const tools = environment(f.manifest.home, f.directory + '/tmp');
    const matching = run(assertion, { env: tools, encoding: 'utf8' });
    commands.push({ argv: command(assertion), environment: tools, exit: matching.status, stdout: matching.stdout, stderr: matching.stderr });
    assert.equal(closed, !before); assert.equal(matching.status, before ? 1 : 0);
    if (!before) assert((stdout + stderr).includes('parent-exit-watch stopped: expected parent exited'), 'An unrelated early server exit is not the parent-death proof');
    result.matchingTestExit = matching.status; result.status = before ? 'EXPECTED_RED' : 'PASS_COMPONENT';
  } catch (error) { result.error = error.stack; throw error; }
  finally {
    // A baseline orphan remains in our relay's dedicated group. Never select
    // a process by name or inspect any owner process to clean this control.
    if (!closed) { try { process.kill(-parent.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    const exit = await done;
    commands.push({ argv: command(argv), environment: env, pid: parent.pid, ...exit, intentionallyKilledOwnedParent: true, log: 'relay-and-server.log' });
    fs.writeFileSync(evidence + '/relay-and-server.log', stdout + stderr);
    fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2));
    f.dispose();
  }
  return result;
}
