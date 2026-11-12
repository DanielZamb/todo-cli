#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const evidence = path.resolve(process.argv[2]);
const nativeEvidence = path.resolve(process.argv[3]);
assert(!fs.existsSync(evidence));
fs.mkdirSync(evidence, { recursive: true });
const commands = [];
const scratch = fs.mkdtempSync('/tmp/todo-v01-production-');
const home = path.join(scratch, 'home'); fs.mkdirSync(home);
const temporary = path.join(scratch, 'tmp'); fs.mkdirSync(temporary);
const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TODO_') && !key.startsWith('DYLD_')));
const environment = { ...base, HOME: home, CFFIXED_USER_HOME: home, TMPDIR: temporary };
function run(argv, name, env = environment) {
  if (argv[0] === 'scripts/swift-slot.sh' || argv[0] === 'bun') {
    const space = fs.statfsSync(root);
    assert(space.bavail * space.bsize >= 30 * 1024 ** 3, 'DISK STOP below 30 GB');
  }
  const value = spawnSync(argv[0], argv.slice(1), { cwd: root, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 3600000 });
  fs.writeFileSync(path.join(evidence, name + '.log'), (value.stdout ?? '') + (value.stderr ?? ''));
  commands.push({ argv, exit: value.status, signal: value.signal, error: value.error?.message, log: name + '.log' });
  fs.writeFileSync(path.join(evidence, 'commands.json'), JSON.stringify(commands, null, 2));
  assert.equal(value.status, 0, name + ' failed; read its log');
  return value.stdout;
}
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let result = { status: 'FAIL' };
try {
  const sourceHead = run(['git', 'rev-parse', 'HEAD'], 'head').trim();
  assert.equal(run(['git', 'status', '--porcelain', '--untracked-files=no'], 'status').trim(), '');
  const native = JSON.parse(fs.readFileSync(path.join(nativeEvidence, 'binary-provenance.json')));
  assert.equal(native.sourceHead, sourceHead);
  result.sourceHead = sourceHead;
  const bins = path.resolve(root, native.cache);
  run(['sh', 'scripts/disk-guard.sh'], 'disk');
  for (const [entry, name] of [['apps/server/scripts/seed-verification.ts', 'seed'], ['.agents/skills/verify-task-search/seed-recovery.ts', 'search-recovery']]) {
    if (!fs.existsSync(path.join(bins, name))) run(['bun', 'scripts/compile.ts', entry, path.join(bins, name)], 'compile-' + name);
  }
  const trap = path.join(root, '.scratch/mac-verification/DerivedData/Build/Products/Release/TodoVerification.app/Contents/Frameworks/libCredentialTrap.dylib');
  const env = { ...environment, DYLD_INSERT_LIBRARIES: trap, TODO_SERVER_BINARY: path.join(bins, 'todo-server'), TODO_CLI_BINARY: path.join(bins, 'todo'), TODO_SEED_BINARY: path.join(bins, 'seed'), SEC_SEARCH_RECOVERY_SEED: path.join(bins, 'search-recovery'), TODO_SWIFT_BUILD_PATH: path.join(root, 'apps/macos/DerivedData/V01Proof') };
  fs.writeFileSync(path.join(evidence, 'provenance.json'), JSON.stringify({ sourceHead, memoryAdapterSubstituted: false, fatalCredentialTrap: digest(trap), binaries: Object.fromEntries(['todo', 'todo-server', 'seed', 'search-recovery'].map(name => [name, digest(path.join(bins, name))])) }, null, 2));
  run(['scripts/swift-slot.sh', 'apps/macos/scripts/verify-write-state.py', path.join(evidence, 'state')], 'state', env);
  run(['scripts/swift-slot.sh', 'apps/macos/scripts/verify-design.py', path.join(evidence, 'offscreen')], 'offscreen', env);
  assert.equal(run(['git', 'rev-parse', 'HEAD'], 'head-after').trim(), sourceHead);
  result.status = 'PASS';
} catch (error) { result.error = error.message; process.exitCode = 1; }
finally {
  const unsafe = commands.some(command => command.exit === null) || fs.existsSync(path.join(evidence, 'state/command-unsafe'));
  if (unsafe) { result.retainedScratch = scratch; result.status = 'FAIL'; process.exitCode = 1; }
  else fs.rmSync(scratch, { recursive: true, force: true });
  result.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
