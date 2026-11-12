import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { command, start } from './process-policy.mjs';

// This entire group, including the app and its AX reader, occupies one Swift
// slot. A nested slot would deadlock while the visible app remained running.
process.umask(0o077);
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
assert(config.frozenSource === true && config.guardMatrixGreen === true && config.artifactAudit === true && config.parentDeathQualified === true);
const { evidence, app, reader, preflightRoot, root } = config;
assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(digest(app), config.appSHA256); assert.equal(digest(reader), config.readerSHA256);
const jobs = new Set(), commands = [];
let application;
let result = { sourceHead: config.sourceHead, status: 'FAIL', completeRecipe: false, appLaunchAttempted: false, ownerPreflight: false, visibleLaunch: false, accessibilityReadback: false, visibleInputStop: false };
const save = () => fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2));
save();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function launch(argv, env, label) {
  const child = start(argv, { env, stdio: ['ignore', 'pipe', 'pipe'], cwd: config.repository });
  jobs.add(child); let stdout = '', stderr = '';
  child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (exit, signal) => {
      jobs.delete(child);
      fs.writeFileSync(evidence + '/' + label + '.log', stdout + stderr);
      const receipt = { argv: command(argv), environment: env, pid: child.pid, exit, signal, stdout, stderr };
      commands.push(receipt); fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); resolve(receipt);
    });
  });
  return { child, done, output: () => stdout + stderr };
}
async function execute(argv, env, label, milliseconds = 5000) {
  const job = launch(argv, env, label);
  const timeout = setTimeout(() => { if (job.child.exitCode === null && job.child.signalCode === null) job.child.kill('SIGTERM'); }, milliseconds);
  try { return await job.done; } finally { clearTimeout(timeout); }
}
function requireQuiet(state) {
  assert(state.frontmostBundleID && state.frontmostBundleID !== 'unknown' && state.frontmostBundleName && state.frontmostBundleName !== 'unknown', 'Frontmost identity unavailable');
  assert(!['local.todo.Todo', 'dev.todo.electron'].includes(state.frontmostBundleID) && !['Todo.app', 'Todo Electron.app'].includes(state.frontmostBundleName), 'The owner\'s Todo app is frontmost');
  assert(state.idleSeconds >= 60 && state.hidIdleSeconds >= 60, 'Owner input in the last minute');
}
function ownedAppAlive() { assert(application && application.child.exitCode === null && application.child.signalCode === null, 'The verification app stopped; do not retry'); }
async function betweenSteps(label) {
  ownedAppAlive();
  const idle = await execute([reader, '--idle-only'], config.appEnvironment, label);
  assert.equal(idle.exit, 0, 'Owner input or unavailable HID signal between steps'); ownedAppAlive();
  fs.writeFileSync(evidence + '/' + label + '.json', idle.stdout);
}
function capturePolicy() {
  const quote = JSON.stringify;
  return `(version 1)(allow default)(deny file-read*)(allow file-read-data (literal "/"))(deny file-write*)
(allow file-read* (subpath "/System") (subpath "/usr/lib") (subpath "/usr/share") (subpath "/Library/Apple") (subpath "/Library/Fonts"))
(deny file-read* file-write* (subpath "/Library/Keychains") (subpath "/System/Library/Keychains") (subpath "/private/var/Keychains") (subpath ${quote(os.userInfo().homedir)}))
(allow file-read* (literal "/dev/null" "/dev/random" "/dev/urandom" "/usr/sbin/screencapture"))(allow file-write-data (literal "/dev/null"))
(allow file-read* file-write* (subpath ${quote(root)}))(deny network-outbound)(deny process-exec)(allow process-exec (literal "/usr/sbin/screencapture"))
(deny mach-lookup)(allow mach-lookup (global-name "com.apple.windowserver.active" "com.apple.windowserver" "com.apple.FontObjectsServer" "com.apple.tccd.system"))`;
}
try {
  const permissions = await execute([reader, '--permission-only'], config.preflightEnvironment, 'readback-permissions');
  assert.equal(permissions.exit, 0, 'Readback/capture permission unavailable; no prompt requested');
  const preflight = await execute([preflightRoot + '/owner-preflight'], config.preflightEnvironment, 'owner-preflight');
  assert.equal(preflight.exit, 0, 'The fixed metadata helper refused');
  const states = preflight.stdout.split('\n').filter(line => line.startsWith('owner-preflight ')); assert.equal(states.length, 1);
  const state = JSON.parse(states[0].slice(16)); result.preflight = state;
  fs.writeFileSync(evidence + '/owner-preflight.json', JSON.stringify(state, null, 2));
  try { requireQuiet(state); } catch (error) { result.status = 'HELD_OWNER_PREFLIGHT'; throw error; }
  result.ownerPreflight = true;
  result.appLaunchAttempted = true;
  save();
  application = launch([app], config.appEnvironment, 'verification-app');
  let rows, readback;
  for (let attempt = 0; attempt < 30; attempt++) {
    ownedAppAlive();
    await betweenSteps('idle-before-read-' + attempt);
    readback = await execute([reader, String(application.child.pid)], config.appEnvironment, 'own-window-read-' + attempt);
    ownedAppAlive();
    if (readback.exit === 0) {
      rows = JSON.parse(readback.stdout);
      const text = rows.map(row => Object.values(row).join(' ')).join('\n');
      if (text.includes('V01 seeded Task alpha') && text.includes('V01 seeded Task beta')) break;
    } else assert.equal(readback.exit, 2, readback.stderr);
    rows = undefined; await pause(100);
  }
  assert(rows, 'Both seeded Tasks were not read from the owned verification window');
  assert(rows.some(row => row.bundleIdentifier === 'local.todo.verification' && row.pid === String(application.child.pid)));
  result.visibleLaunch = true; result.accessibilityReadback = true;
  save();
  fs.writeFileSync(evidence + '/accessibility.json', JSON.stringify(rows, null, 2));
  const ids = [...new Set(rows.filter(row => row.role === 'CGWindow').map(row => Number(row.CGWindowID)))];
  assert.equal(ids.length, 1); assert(Number.isSafeInteger(ids[0]) && ids[0] > 0);
  await betweenSteps('idle-before-own-window-capture');
  const policy = capturePolicy(); fs.writeFileSync(evidence + '/capture.sb', policy);
  const image = root + '/own-verification-window.png';
  const captured = await execute(['/usr/bin/sandbox-exec', '-p', policy, '/usr/sbin/screencapture', '-x', '-o', '-l' + ids[0], image], config.appEnvironment, 'capture-own-window');
  assert.equal(captured.exit, 0, captured.stderr); ownedAppAlive();
  const png = fs.readFileSync(image); assert(png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')));
  fs.copyFileSync(image, evidence + '/verification-window.png', fs.constants.COPYFILE_EXCL);
  result.captureSHA256 = digest(evidence + '/verification-window.png');
  await betweenSteps('idle-before-posted-input-control');
  fs.writeFileSync(root + '/interruption-control', '', { mode: 0o600, flag: 'wx' });
  const stopped = await Promise.race([application.done, pause(5000).then(() => { throw new Error('Posted input did not stop the verification app'); })]);
  assert.equal(stopped.exit, 80);
  assert(stopped.stderr.includes('posted test input detected (type 10)'), 'An unrelated refusal is not the posted-input control');
  result.visibleInputStop = true; result.status = 'PASS_VISIBLE_COMPONENT';
  fs.writeFileSync(evidence + '/interruption.json', JSON.stringify({ api: 'NSApplication.postEvent', delivery: 'marked in-process test input; no physical or WindowServer delivery claim', eventType: 10, appExit: stopped.exit }, null, 2));
} catch (error) { result.error = error.stack; process.exitCode = 1; }
finally {
  for (const job of jobs) if (job.exitCode === null && job.signalCode === null) job.kill('SIGTERM');
  if (application) await application.done;
  // The parent owns and disposes both fixtures only after this group exits.
  result.remainingOwnedChildren = jobs.size;
  if (jobs.size) { result.status = 'FAIL'; process.exitCode = 1; }
  fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
