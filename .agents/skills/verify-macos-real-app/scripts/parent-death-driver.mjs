import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { command, environment, run } from './process-policy.mjs';
import { reservedPorts } from './boundary-profiles.mjs';
import { qualifyParentDeath } from './parent-death.mjs';

process.umask(0o077);
const evidence = process.argv[2]; assert(path.isAbsolute(evidence) && !fs.existsSync(evidence));
fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
const tools = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-parent-tools-'));
fs.mkdirSync(tools + '/home'); fs.mkdirSync(tools + '/tmp');
const env = environment(tools + '/home', tools + '/tmp'), commands = [];
function checked(argv, label) {
  const value = run(argv, { env, encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 });
  commands.push({ argv: command(argv), environment: env, exit: value.status, signal: value.signal });
  fs.writeFileSync(evidence + '/' + label + '.log', value.stdout + value.stderr); assert.equal(value.status, 0, value.stderr); return value.stdout;
}
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let result = { status: 'FAIL', completeRecipe: false, SwiftStarted: false };
try {
  const sourceHead = checked(['git', 'rev-parse', 'HEAD'], 'head').trim(); result.sourceHead = sourceHead;
  result.development = Boolean(checked(['git', 'status', '--porcelain', '--untracked-files=normal'], 'status').trim());
  checked(['sh', 'scripts/disk-guard.sh'], 'disk');
  checked(['bun', 'build', '--compile', '.agents/skills/verify-macos-real-app/scripts/server-entry.mjs', '--define', 'TODO_BUILD_ID=' + JSON.stringify(sourceHead.slice(0, 8)), '--outfile', tools + '/todo-server'], 'build-server');
  checked(['xcrun', 'clang', '-dynamiclib', 'apps/macos/VerificationApp/CredentialTrap.c', 'apps/macos/VerificationApp/ChildProof.c', 'apps/macos/VerificationApp/BoundaryProof.c', '-framework', 'Security', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-framework', 'Foundation', '-install_name', '@rpath/libCredentialTrap.dylib', '-o', tools + '/boundary.dylib'], 'build-library');
  checked(['xcrun', 'clang', '.agents/skills/verify-macos-real-app/scripts/ParentRelay.c', '-o', tools + '/parent-relay'], 'build-relay');
  result.binaries = Object.fromEntries(['todo-server', 'boundary.dylib', 'parent-relay'].map(name => [name, hash(tools + '/' + name)]));
  const fixture = async () => {
    const directory = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-parent-case-'));
    fs.mkdirSync(directory + '/home'); fs.mkdirSync(directory + '/tmp');
    for (const name of ['todo-server', 'boundary.dylib']) fs.copyFileSync(tools + '/' + name, directory + '/' + name, fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL);
    const outside = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-parent-outside-'));
    fs.writeFileSync(outside + '/sentinel', 'synthetic only', { mode: 0o600 });
    const ports = await reservedPorts();
    const manifest = { root: directory, home: directory + '/home', ownerHome: os.userInfo().homedir, database: directory + '/scratch.db', serverPath: directory + '/todo-server', boundaryPath: directory + '/boundary.dylib', serverURL: 'http://127.0.0.1:' + ports.port, outsideSentinel: outside + '/sentinel', probePort: ports.otherPort };
    fs.writeFileSync(directory + '/manifest.json', JSON.stringify(manifest), { mode: 0o600 });
    return { directory, manifest, dispose: () => { ports.close(); fs.rmSync(directory, { recursive: true }); fs.rmSync(outside, { recursive: true }); } };
  };
  const proof = await qualifyParentDeath({ evidence: evidence + '/control', fixture, relay: tools + '/parent-relay', sourceHead, before: process.argv.includes('--before') });
  result.status = proof.status;
} catch (error) { result.error = error.stack; process.exitCode = 1; }
finally {
  const closed = run(['/usr/sbin/lsof', '-Fpcn', '+D', tools], { env, encoding: 'utf8' });
  result.cleanup = { exit: closed.status, stdout: closed.stdout, stderr: closed.stderr };
  if (closed.status === 1 && !closed.stdout.trim() && !closed.stderr.trim()) fs.rmSync(tools, { recursive: true });
  else { result.retainedTools = tools; result.status = 'FAIL'; process.exitCode = 1; }
  fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2)); fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
