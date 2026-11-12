import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { command, environment, run } from './process-policy.mjs';

export function qualifyNetworkingAnalytics(evidence) {
 assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
 const temporary = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-analytics-'));
 fs.mkdirSync(temporary + '/home'); fs.mkdirSync(temporary + '/tmp');
 const env = environment(temporary + '/home', temporary + '/tmp'), commands = [], controls = [];
 const library = temporary + '/libCredentialTrap.dylib', program = temporary + '/probe';
 const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 function execute(argv, label) {
  const result = run(argv, { env, encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 });
  fs.writeFileSync(evidence + '/' + label + '.log', result.stdout + result.stderr);
  commands.push({ argv: command(argv), environment: env, exit: result.status, signal: result.signal, log: label + '.log' }); return result;
 }
 let result = { status: 'FAIL', originalCalls: false, SwiftStarted: false };
 try {
  const stat = fs.statfsSync(temporary); assert(stat.bavail * stat.bsize >= 30.25 * 1024 ** 3);
  const head = execute(['git', 'rev-parse', 'HEAD'], 'head'); assert.equal(head.status, 0); result.sourceHead = head.stdout.trim();
  const state = execute(['git', 'status', '--porcelain', '--untracked-files=normal'], 'source-status'); assert.equal(state.status, 0); result.development = Boolean(state.stdout.trim());
  const source = fs.readFileSync('apps/macos/VerificationApp/CredentialTrap.c', 'utf8');
  const start = source.indexOf('__attribute__'), end = source.indexOf('\n};', start) + 4, binding = source.slice(start, end);
  assert(binding.includes('networking_analytics_denial') && source.includes('return false;'));
  fs.copyFileSync('apps/macos/VerificationApp/CredentialSymbols.inc', temporary + '/CredentialSymbols.inc');
  for (const [label, changed, expected, message] of [
   ['baseline', source, 0, 'Networking analytics denied locally'],
   ['binding-removed', source.replace(binding, ''), 1, 'No original call attempted.'],
   ['deny-result-inverted', source.replace('return false;', 'return true;'), 1, 'unexpectedly reported success'],
  ]) {
   fs.writeFileSync(temporary + '/CredentialTrap.c', changed);
   const build = execute(['xcrun', 'clang', '-Os', '-dynamiclib', temporary + '/CredentialTrap.c', 'apps/macos/VerificationApp/ChildProof.c', 'apps/macos/VerificationApp/BoundaryProof.c', '-framework', 'Security', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-framework', 'Foundation', '-install_name', '@rpath/libCredentialTrap.dylib', '-o', library], label + '-library'); assert.equal(build.status, 0, build.stderr);
   if (label === 'baseline') {
    assert.equal(execute(['xcrun', 'clang', '.agents/skills/verify-macos-real-app/scripts/NetworkingAnalyticsProbe.c', '-L' + temporary, '-lCredentialTrap', '-framework', 'Security', '-Wl,-rpath,' + temporary, '-o', program], 'build-probe').status, 0);
    assert.equal(execute(['xcrun', 'otool', '-tvV', library], 'baseline-disassembly').status, 0);
   }
   const observed = execute([program], label); assert.equal(observed.status, expected); assert((observed.stdout + observed.stderr).includes(message));
   const matching = execute(['node', '-e', 'require("node:assert/strict").equal(Number(process.argv[1]),0)', String(observed.status)], label + '-matching'); assert.equal(matching.status, expected);
   controls.push({ label, exit: observed.status, matchingTestExit: matching.status, librarySHA256: digest(library), probeSHA256: digest(program), originalCalled: false });
  }
  result.status = 'PASS_COMPONENT';
 } catch (error) { result.error = error.stack; process.exitCode = 1; }
 finally {
  const closed = execute(['/usr/sbin/lsof', '-Fpcn', '+D', temporary], 'cleanup');
  result.cleanup = { exit: closed.status, stdout: closed.stdout, stderr: closed.stderr };
  if (closed.status === 1 && !closed.stdout.trim() && !closed.stderr.trim()) fs.rmSync(temporary, { recursive: true });
  else { result.status = 'FAIL'; result.retainedScratch = temporary; process.exitCode = 1; }
  Object.assign(result, { controls }); fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2));
 }
 console.log(JSON.stringify(result)); return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { process.umask(0o077); qualifyNetworkingAnalytics(process.argv[2]); }
