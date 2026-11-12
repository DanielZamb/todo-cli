import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { command, environment, executable, run } from './process-policy.mjs';
import { bunCompileSafetyOptions } from './bun-policy.mjs';

process.umask(0o077);
const evidence = process.argv[2], before = process.argv.includes('--before');
assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
const root = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-bun-config-'));
for (const name of ['home', 'tmp', 'compile', 'runtime']) fs.mkdirSync(root + '/' + name);
const env = environment(root + '/home', root + '/tmp'), commands = [], controls = [];
const entry = root + '/compile/probe.mjs';
fs.writeFileSync(entry, 'console.log(JSON.stringify({runtime:process.env.VERIFY_RUNTIME_CONFIG_SENTINEL??"absent",compiler:process.env.VERIFY_COMPILER_CONFIG_SENTINEL??"absent"}));\n');
const options = before ? [] : bunCompileSafetyOptions;
function execute(argv, label, cwd) {
  const value = run(argv, { env, cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 ** 2 });
  commands.push({ argv: command(argv), environment: env, cwd, exit: value.status, signal: value.signal });
  fs.writeFileSync(evidence + '/' + label + '.log', value.stdout + value.stderr); return value;
}
function matches(value, label, expectedExit, expectedOutput) {
  const argv = ['node', '-e', 'const a=require("node:assert/strict");a.equal(Number(process.argv[1]),Number(process.argv[2]));if(process.argv[3]!=="skip")a.deepEqual(JSON.parse(process.argv[3]),JSON.parse(process.argv[4]));', String(value.status), String(expectedExit), expectedOutput ? value.stdout.trim() : 'skip', expectedOutput ? JSON.stringify(expectedOutput) : 'null'];
  const matching = execute(argv, label + '-matching-test', root);
  controls.push({ label, observedExit: value.status, matchingTestExit: matching.status, stdout: value.stdout });
  assert.equal(matching.status, before ? 1 : 0, label + ': ' + value.stdout + value.stderr);
}
let result = { status: 'FAIL', before, SwiftStarted: false, completeRecipe: false };
try {
  const built = execute([executable('bun'), 'build', '--compile', ...options, entry, '--outfile', root + '/runtime/probe'], 'compile-runtime-probe', root + '/compile');
  assert.equal(built.status, 0, built.stderr);
  result.probeSHA256 = createHash('sha256').update(fs.readFileSync(root + '/runtime/probe')).digest('hex');
  fs.writeFileSync(root + '/runtime/.env', 'VERIFY_RUNTIME_CONFIG_SENTINEL=synthetic-dotenv\n');
  matches(execute([root + '/runtime/probe'], 'runtime-dotenv', root + '/runtime'), 'runtime-dotenv', 0, { runtime: 'absent', compiler: 'absent' });
  fs.rmSync(root + '/runtime/.env');
  fs.writeFileSync(root + '/runtime/bunfig.toml', '[deliberately-unclosed\n');
  matches(execute([root + '/runtime/probe'], 'runtime-bunfig', root + '/runtime'), 'runtime-bunfig', 0);
  fs.rmSync(root + '/runtime/bunfig.toml');
  fs.writeFileSync(root + '/compile/.env', 'VERIFY_COMPILER_CONFIG_SENTINEL=synthetic-compiler-dotenv\n');
  const inline = execute([executable('bun'), 'build', '--compile', ...options, '--env=VERIFY_COMPILER_*', entry, '--outfile', root + '/runtime/compiler-probe'], 'compile-dotenv-probe', root + '/compile');
  assert.equal(inline.status, 0, inline.stderr);
  matches(execute([root + '/runtime/compiler-probe'], 'compiler-dotenv', root + '/runtime'), 'compiler-dotenv', 0, { runtime: 'absent', compiler: 'absent' });
  fs.rmSync(root + '/compile/.env');
  fs.writeFileSync(root + '/compile/bunfig.toml', '[deliberately-unclosed\n');
  matches(execute([executable('bun'), 'build', '--compile', ...options, entry, '--outfile', root + '/runtime/last-probe'], 'compiler-bunfig', root + '/compile'), 'compiler-bunfig', 0);
  result.status = before ? 'EXPECTED_RED' : 'PASS_COMPONENT';
} catch (error) { result.error = error.stack; process.exitCode = 1; }
finally {
  Object.assign(result, { controls });
  const closed = run(['/usr/sbin/lsof', '-Fpcn', '+D', root], { env, encoding: 'utf8' });
  result.cleanup = { exit: closed.status, stdout: closed.stdout, stderr: closed.stderr };
  if (closed.status === 1 && !closed.stdout.trim() && !closed.stderr.trim()) fs.rmSync(root, { recursive: true });
  else { result.retainedScratch = root; result.status = 'FAIL'; process.exitCode = 1; }
  fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
