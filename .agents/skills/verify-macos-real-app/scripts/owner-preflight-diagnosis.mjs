import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { command, environment, run } from './process-policy.mjs';
import { sandboxProfile } from './boundary-profiles.mjs';

process.umask(0o077);
const evidence = process.argv[2];
assert(evidence && path.isAbsolute(evidence) && !fs.existsSync(evidence));
fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
const scratch = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-preflight-'));
fs.mkdirSync(scratch + '/home'); fs.mkdirSync(scratch + '/tmp');
const env = environment(scratch + '/home', scratch + '/tmp'), commands = [], controls = [];
function execute(argv, label, input) {
  const value = run(argv, { env, input, encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 });
  commands.push({ argv: command(argv), environment: env, pid: value.pid, exit: value.status, signal: value.signal });
  fs.writeFileSync(evidence + '/' + label + '.log', value.stdout + value.stderr);
  assert.equal(value.status, 0, value.stderr); return value;
}
const inputs = ['apps/macos/VerificationApp/ScratchSandbox.swift', 'apps/macos/VerificationApp/CredentialSymbols.inc', '.agents/skills/verify-macos-real-app/scripts/OwnerPreflightProbe.m'];
let result = { status: 'FAIL', SwiftStarted: false, completeRecipe: false, originalCredentialCalls: false, visibleLaunch: false, applicationProfileChanged: false };
try {
  result.sourceHead = execute(['git', 'rev-parse', 'HEAD'], 'head').stdout.trim();
  result.development = Boolean(execute(['git', 'status', '--porcelain', '--untracked-files=normal'], 'status').stdout.trim());
  result.sources = Object.fromEntries(inputs.map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  execute(['xcrun', 'clang', '-dynamiclib', 'apps/macos/VerificationApp/CredentialTrap.c', 'apps/macos/VerificationApp/ChildProof.c', 'apps/macos/VerificationApp/BoundaryProof.c', '-framework', 'Security', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-framework', 'Foundation', '-install_name', scratch + '/lib.dylib', '-o', scratch + '/lib.dylib'], 'library');
  execute(['xcrun', 'clang', '.agents/skills/verify-macos-real-app/scripts/OwnerPreflightProbe.m', scratch + '/lib.dylib', '-framework', 'AppKit', '-framework', 'ApplicationServices', '-o', scratch + '/preflight'], 'compile');
  const profile = sandboxProfile(scratch, scratch + '/never-exec', 1);
  for (const [label, extra] of [
    ['strict', ''],
    ['TCC-only-diagnostic', '(allow mach-lookup (global-name "com.apple.tccd.system"))'],
    ['TCC-and-LaunchServices-diagnostic', '(allow mach-lookup (global-name "com.apple.tccd.system" "com.apple.coreservices.launchservicesd"))'],
  ]) {
    const policy = profile + '\n' + extra;
    fs.writeFileSync(evidence + '/' + label + '.sb', policy);
    const value = execute([scratch + '/preflight'], label, policy);
    const metadata = JSON.parse(value.stdout);
    const logs = execute(['/usr/bin/log', 'show', '--last', '1m', '--style', 'json', '--info', '--debug', '--predicate', 'eventMessage CONTAINS "preflight(' + value.pid + ')"'], label + '-own-pid-kernel');
    const denials = JSON.parse(logs.stdout).map(row => row.eventMessage).filter(line => line.startsWith('Sandbox:'));
    controls.push({ label, exit: value.status, metadata, denials });
    if (label === 'strict') {
      assert.equal(metadata.frontmostBundleID, 'unknown');
      assert.equal(metadata.axTrusted, 0); assert.equal(metadata.listenTrusted, false);
    }
  }
  result.status = 'PASS_DIAGNOSTIC_ONLY';
} catch (error) { result.error = error.stack; process.exitCode = 1; }
finally {
  const closed = run(['/usr/sbin/lsof', '-Fpcn', '+D', scratch], { env, encoding: 'utf8' });
  result.cleanup = { argv: ['/usr/sbin/lsof', '-Fpcn', '+D', scratch], environment: env, exit: closed.status, stdout: closed.stdout, stderr: closed.stderr };
  if (closed.status === 1 && !closed.stdout.trim() && !closed.stderr.trim()) { fs.rmSync(scratch, { recursive: true }); result.scratchRemoved = true; }
  else { result.retainedScratch = scratch; result.status = 'FAIL'; process.exitCode = 1; }
  Object.assign(result, { controls });
  fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2));
  fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, controls: controls.map(({ label, metadata }) => ({ label, metadata })), error: result.error, SwiftStarted: false }));
}
