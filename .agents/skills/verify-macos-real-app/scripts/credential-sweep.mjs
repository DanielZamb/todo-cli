import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, environment, run } from './process-policy.mjs';

export function credentialSweep(evidence, sample = false) {
 assert(path.isAbsolute(evidence) && !fs.existsSync(evidence)); fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
 const temporary = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-credential-'));
 fs.mkdirSync(temporary + '/home'); fs.mkdirSync(temporary + '/tmp');
 const env = environment(temporary + '/home', temporary + '/tmp'), commands = [], traps = [], removals = [];
 const names = [...fs.readFileSync('apps/macos/VerificationApp/CredentialSymbols.inc', 'utf8').matchAll(/TRAP\((\w+)\)/g)].map(row => row[1]);
 const library = temporary + '/libCredentialTrap.dylib', program = temporary + '/trap';
 function execute(argv, label) {
  const value = run(argv, { env, encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 });
  fs.writeFileSync(evidence + '/' + label + '.log', value.stdout + value.stderr);
  commands.push({ argv: command(argv), environment: env, exit: value.status, signal: value.signal, log: label + '.log' });
  return value;
 }
 fs.copyFileSync('apps/macos/VerificationApp/CredentialTrap.c', temporary + '/CredentialTrap.c');
 const build = () => {
  const stat = fs.statfsSync(temporary), freeBytes = stat.bavail * stat.bsize;
  assert(freeBytes >= 30.25 * 1024 ** 3, 'DISK STOP before credential compilation: below the 30 GiB floor plus 0.25 GiB budget');
  const value = execute(['xcrun', 'clang', '-dynamiclib', temporary + '/CredentialTrap.c', 'apps/macos/VerificationApp/ChildProof.c', 'apps/macos/VerificationApp/BoundaryProof.c', '-framework', 'Security', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-framework', 'Foundation', '-install_name', '@rpath/libCredentialTrap.dylib', '-o', library], 'build-library'); assert.equal(value.status, 0, value.stderr);
 };
 let result = { status: 'FAIL', scope: sample ? 'development-credential-sample' : 'credential-component', completeRecipe: false, SwiftStarted: false, originalCredentialCalls: false };
 const progress = phase => fs.writeFileSync(evidence + '/progress.json', JSON.stringify({ phase, positiveBindings: traps.length, removalControls: removals.length, totalBindings: names.length, completeRecipe: false }, null, 2));
 try {
  const head = execute(['git', 'rev-parse', 'HEAD'], 'head'); assert.equal(head.status, 0); result.sourceHead = head.stdout.trim();
  progress('building');
  fs.writeFileSync(temporary + '/CredentialSymbols.inc', names.map(name => 'TRAP(' + name + ')').join('\n') + '\n'); build();
  const compiled = execute(['xcrun', 'clang', '.agents/skills/verify-macos-real-app/scripts/TrapProbe.c', '-L' + temporary, '-lCredentialTrap', '-framework', 'Security', '-Wl,-rpath,' + temporary, '-o', program], 'build-probe'); assert.equal(compiled.status, 0, compiled.stderr);
  for (const name of names) {
   const value = execute([program, name], 'trap-' + name); assert.equal(value.status, 79, name + ': ' + value.stderr);
   assert(value.stderr.includes('Security credential call trapped: ' + name + '\n'), name + ' failed at an unrelated binding'); traps.push({ name, exit: value.status });
   if (traps.length % 64 === 0) progress('positive-bindings');
  }
  const selected = sample ? ['SecItemAdd', 'SecItemCopyMatching', 'SecItemUpdate', 'SecItemDelete', 'SecPKCS12Import', 'SecKeyCreateRandomKey', 'SecKeyGeneratePair', 'SecCmsSignedDataImportCerts', 'SecCodeSignerCreate'] : names;
  for (const name of selected) {
   assert(names.includes(name)); fs.writeFileSync(temporary + '/CredentialSymbols.inc', names.filter(value => value !== name).map(value => 'TRAP(' + value + ')').join('\n') + '\n'); build();
   const value = execute([program, name], 'removed-' + name); assert.equal(value.status, 1, name); assert(value.stderr.includes('No original call attempted.'));
   const match = execute(['node', '-e', 'require("node:assert/strict").equal(Number(process.argv[1]),79)', String(value.status)], 'matching-' + name); assert.equal(match.status, 1);
   removals.push({ name, probeExit: value.status, matchingTestExit: match.status, originalCalled: false });
   if (removals.length % 16 === 0) progress('individual-removals');
  }
  result.status = 'PASS_COMPONENT';
  progress('finished');
 } catch (error) { result.error = error.stack; process.exitCode = 1; }
 finally {
  Object.assign(result, { traps, removals });
  const closed = execute(['/usr/sbin/lsof', '-Fpcn', '+D', temporary], 'cleanup-open-files');
  result.cleanup = { exit: closed.status, stdout: closed.stdout, stderr: closed.stderr };
  if (closed.status === 1 && !closed.stdout.trim() && !closed.stderr.trim()) fs.rmSync(temporary, { recursive: true });
  else { result.retainedScratch = temporary; result.status = 'FAIL'; process.exitCode = 1; }
  fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2));
 }
 console.log(JSON.stringify({ status: result.status, positiveBindings: traps.length, removalControls: removals.length, error: result.error, SwiftStarted: false })); return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { process.umask(0o077); credentialSweep(process.argv[2], process.argv.includes('--sample')); }
