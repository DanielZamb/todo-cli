import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { environment } from './process-policy.mjs';

export async function runRegressions(c) {
  const { tools, native, evidence, base, execute, must, asynchronous, fixture, pause, stages, build, childObject } = c;
  const rows = [];
  async function check(name, edit, expected = 78, program = native + '/guard', args = []) {
    const f = await fixture();
    try {
      const env = await edit?.(f) ?? f.env;
      const value = execute([program, ...args], name, env);
      assert.equal(value.status, expected, name + ': ' + value.stderr);
      rows.push({ name, expected, exit: value.status });
    } finally { f.dispose(); }
  }
  await check('valid-owned-child', undefined, 0);
  await check('public-task-readback', undefined, 0, native + '/boundary', ['read-tasks']);
  await check('missing-manifest', f => environment(f.directory + '/home', f.directory + '/tmp'));
  await check('wrong-home', f => ({ ...f.env, HOME: tools + '/home' }));
  await check('wrong-fixed-home', f => ({ ...f.env, CFFIXED_USER_HOME: tools + '/home' }));
  await check('wrong-temporary', f => ({ ...f.env, TMPDIR: tools + '/tmp' }));
  await check('public-manifest', f => { fs.chmodSync(f.file, 0o644); });
  for (const [name, edit] of [
    ['non-loopback', m => m.serverURL = 'http://192.0.2.1:1'],
    ['no-port', m => m.serverURL = 'http://127.0.0.1'],
    ['url-credentials', m => m.serverURL = m.serverURL.replace('http://', 'http://user:password@')],
    ['url-query', m => m.serverURL += '?url=http://192.0.2.1'],
    ['server-hash', m => m.serverSHA256 = '0'.repeat(64)],
    ['cli-hash', m => m.cliSHA256 = '0'.repeat(64)],
    ['wrong-contract', m => m.contract = 'wrong'],
    ['wrong-build', m => m.build = 'wrong'],
    ['existing-server-pid', m => m.serverPID = process.pid],
    ['relative-database', m => m.database = 'scratch.db'],
    ['dotdot-database', m => m.database = m.root + '/home/../scratch.db'],
    ['outside-database', m => m.database = tools + '/outside.db'],
    ['invalid-session', m => m.session = 'tok_not_a_session'],
  ]) await check(name, f => { edit(f.manifest); f.write(); });
  await check('changed-binary-and-self-declared-hash', f => {
    fs.appendFileSync(f.manifest.serverPath, 'changed'); f.manifest.serverSHA256 = c.binaryProvenance.sha256.cli; f.write();
  });
  const regulars = ['manifest.json', 'todo-server', 'todo', 'scratch.db', 'scratch.db-wal', 'scratch.db-shm'];
  for (const name of regulars) {
    await check('hardlink-' + name, f => {
      const file = f.directory + '/' + name; if (!fs.existsSync(file)) fs.writeFileSync(file, '');
      fs.linkSync(file, f.directory + '/second-name');
    });
    await check('symlink-' + name, f => {
      const file = f.directory + '/' + name; if (!fs.existsSync(file)) fs.writeFileSync(file, '');
      fs.renameSync(file, file + '.owned'); fs.symlinkSync(file + '.owned', file);
    });
  }
  for (const name of ['home', 'tmp']) await check('symlink-component-' + name, f => { fs.renameSync(f.directory + '/' + name, f.directory + '/' + name + '.owned'); fs.symlinkSync(f.directory + '/' + name + '.owned', f.directory + '/' + name); });
  await check('nested-component-symlink', f => { fs.mkdirSync(f.directory + '/real'); fs.renameSync(f.manifest.database, f.directory + '/real/data'); fs.symlinkSync(f.directory + '/real', f.directory + '/alias'); f.manifest.database = f.directory + '/alias/data'; f.write(); });
  await check('directory-instead-of-database', f => { fs.rmSync(f.manifest.database); fs.mkdirSync(f.manifest.database); });
  for (const name of [...regulars, 'home', 'tmp']) {
    const f = await fixture();
    try {
      const target = f.directory + '/' + name;
      const directory = ['home', 'tmp'].includes(name);
      if (!fs.existsSync(target)) fs.writeFileSync(target, 'owned');
      const child = await asynchronous([native + '/files', f.directory, target, '--wait', '--protect', ...(directory ? ['--directory'] : []), ...(['manifest.json', 'todo', 'todo-server'].includes(name) ? ['--immutable'] : [])], 'swap-protected-' + name, f.env);
      for (let n = 0; n < 500 && !child.output().includes('descriptor opened'); n++) { assert.equal(child.child.exitCode, null); await pause(10); }
      assert(child.output().includes('descriptor opened'));
      let denied = false;
      try { fs.renameSync(target, target + '.replacement'); } catch (error) { denied = ['EPERM', 'EACCES'].includes(error.code); }
      assert(denied, 'A pinned path could be replaced: ' + name);
      fs.writeFileSync(f.directory + '/continue-file-test', 'continue');
      const value = await child.done; assert.equal(value.status, 0, value.stderr);
      rows.push({ name: 'swap-after-check-' + name, swapDeniedByKernel: true, exit: value.status });
    } finally { f.dispose(); }
  }
  {
    const f = await fixture(); try {
      const child = await asynchronous([native + '/files', f.directory, f.manifest.database, '--wait'], 'unprotected-swap-detector', f.env);
      for (let n = 0; n < 500 && !child.output().includes('descriptor opened'); n++) { assert.equal(child.child.exitCode, null); await pause(10); }
      assert(child.output().includes('descriptor opened'));
      fs.renameSync(f.manifest.database, f.manifest.database + '.old'); fs.writeFileSync(f.manifest.database, 'replaced');
      fs.writeFileSync(f.directory + '/continue-file-test', 'continue');
      const value = await child.done; assert.equal(value.status, 78); rows.push({ name: 'open-descriptor-replacement-detected-independently', exit: 78 });
    } finally { f.dispose(); }
  }
  await check('symlink-run-root', f => {
    const actual = f.directory + '.owned'; fs.renameSync(f.directory, actual); fs.symlinkSync(actual, f.directory);
    const dispose = f.dispose; f.dispose = () => { dispose(); fs.rmSync(actual, { recursive: true }); };
  });
  { const f = await fixture(); try { fs.linkSync(f.directory + '/home/.todo-cli/session_verify.json', f.directory + '/session-alias'); const value = execute([native + '/bootstrap', f.directory, 'session'], 'hardlink-bootstrap-session', f.env); assert.equal(value.status, 78); rows.push({ name: 'hardlink-bootstrap-session', exit: value.status }); } finally { f.dispose(); } }
  const outside = tools + '/outside'; fs.mkdirSync(outside); fs.writeFileSync(outside + '/synthetic-private-data', 'S1 SYNTHETIC PRIVATE FILE CONTENT');
  const hits = [];
  const server = http.createServer((request, response) => {
    const chunks = []; request.on('data', x => chunks.push(x)); request.on('end', () => {
      hits.push({ path: request.url, method: request.method, body: Buffer.concat(chunks).toString(), authorization: request.headers.authorization, cookie: request.headers.cookie });
      if (request.url === '/redirect') { response.writeHead(302, { Location: 'http://127.0.0.1:' + server.address().port + '/outside-manifest' }); response.end(); }
      else if (request.url === '/challenge') { response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="scratch"' }); response.end(); }
      else { response.writeHead(200, { 'Set-Cookie': 'synthetic=private' }); response.end('scratch'); }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  fs.writeFileSync(outside + '/.curlrc', 'url = "' + url + '/outside-manifest"\ndata-binary = "@' + outside + '/synthetic-private-data"\nnext\n');
  try {
    const poison = { CURL_HOME: outside, CURL_CA_BUNDLE: outside + '/not-a-ca', NETRC: outside + '/.netrc', HTTP_PROXY: url, HTTPS_PROXY: url, ALL_PROXY: url, NO_PROXY: '', http_proxy: url, https_proxy: url, all_proxy: url, no_proxy: '', SSLKEYLOGFILE: outside + '/ssl-log', XDG_CONFIG_HOME: outside, XDG_CACHE_HOME: outside };
    const f = await fixture(); try {
      fs.writeFileSync(f.directory + '/home/.netrc', 'machine 127.0.0.1 login synthetic password synthetic');
      const child = await asynchronous([native + '/guard'], 'ambient-config-attack', { ...f.env, ...poison }, true);
      const value = await child.done; assert.equal(value.status, 0, value.stderr); assert.deepEqual(hits, []);
      assert(!fs.existsSync(outside + '/ssl-log'));
      rows.push({ name: 'ambient-config-and-file-post', exit: value.status, outsideRequests: 0, leakedBytes: 0 });
    } finally { f.dispose(); }
    for (const endpoint of ['/redirect', '/challenge']) {
      const child = await asynchronous([native + '/http', url + endpoint], 'http' + endpoint);
      const value = await child.done; assert.equal(value.status, 78, value.stderr);
      assert(!hits.some(hit => hit.path === '/outside-manifest')); assert(hits.every(hit => !hit.authorization && !hit.cookie && !hit.body));
      rows.push({ name: endpoint, exit: value.status, followedRedirect: false, sentCredential: false });
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
  const occupied = await fixture(); const foreignHits = [];
  const foreign = http.createServer((req, res) => { foreignHits.push(req.url); res.end('foreign'); });
  await new Promise(resolve => foreign.listen(new URL(occupied.manifest.serverURL).port, '127.0.0.1', resolve));
  try { const value = execute([native + '/guard'], 'foreign-listener', occupied.env); assert.equal(value.status, 78); assert.deepEqual(foreignHits, []); rows.push({ name: 'foreign-listener', exit: value.status, requests: 0 }); }
  finally { await new Promise(resolve => foreign.close(resolve)); occupied.dispose(); }
  for (const place of ['environment', 'arguments', 'working-directory', 'executable-path']) {
    const f = await fixture(); let foreignChild;
    try {
      const owned = tools + '/foreign-' + place; fs.mkdirSync(owned); fs.mkdirSync(owned + '/home'); fs.mkdirSync(owned + '/tmp');
      fs.copyFileSync(f.manifest.database, owned + '/other.db', fs.constants.COPYFILE_EXCL);
      const marker = 'HOME=' + f.manifest.home + ' TODO_DB=' + f.manifest.database + ' ';
      const placement = {}; let executable = f.manifest.serverPath;
      const env = environment(owned + '/home', owned + '/tmp', { TODO_DB: owned + '/other.db', TODO_PORT: new URL(f.manifest.serverURL).port });
      if (place === 'environment') env.REVIEW_EXPECTED_MARKERS = marker;
      if (place === 'arguments') placement.argv0 = marker;
      if (place === 'working-directory') { placement.cwd = owned + '/' + marker; fs.mkdirSync(placement.cwd, { recursive: true }); }
      if (place === 'executable-path') { executable = owned + '/' + marker + '/server'; fs.mkdirSync(path.dirname(executable), { recursive: true }); fs.copyFileSync(f.manifest.serverPath, executable, fs.constants.COPYFILE_EXCL); }
      foreignChild = await asynchronous([executable], 'foreign-process-' + place, env, false, placement);
      // A public health response proves this is a running compiled server, not inert marker text.
      let ready = false;
      for (let n = 0; n < 500 && !ready; n++) {
        assert.equal(foreignChild.child.exitCode, null, foreignChild.output());
        ready = await new Promise(resolve => { const req = http.get(f.manifest.serverURL + '/health', res => { res.resume(); resolve(res.statusCode === 200); }); req.on('error', () => resolve(false)); });
        if (!ready) await pause(10);
      }
      assert(ready); assert.notEqual(fs.statSync(owned + '/other.db').ino, fs.statSync(f.manifest.database).ino);
      f.manifest.serverPID = foreignChild.child.pid; f.write();
      const value = execute([native + '/guard'], 'forged-markers-' + place, f.env); assert.equal(value.status, 78, value.stderr);
      rows.push({ name: 'forged-markers-' + place, foreignPID: foreignChild.child.pid, actualHOME: env.HOME, actualDatabase: env.TODO_DB, markerLocation: place, exit: value.status });
    } finally { if (foreignChild && foreignChild.child.exitCode === null) { foreignChild.child.kill('SIGTERM'); await foreignChild.done; } f.dispose(); }
  }
  const replaced = await fixture(); let replacement;
  try {
    const child = await asynchronous([native + '/boundary', 'replaced-server'], 'server-replaced', replaced.env);
    for (let n = 0; n < 1000 && !child.output().includes('owned server stopped'); n++) { assert.equal(child.child.exitCode, null); await pause(10); }
    assert(child.output().includes('owned server stopped'));
    let requests = 0; replacement = http.createServer((request, response) => { requests++; response.end(JSON.stringify({ service: 'todo-server', contract: replaced.manifest.contract, build: replaced.manifest.build })); });
    await new Promise(resolve => replacement.listen(new URL(replaced.manifest.serverURL).port, '127.0.0.1', resolve));
    fs.writeFileSync(replaced.directory + '/continue-test', 'continue');
    const value = await child.done; assert.equal(value.status, 78); assert.equal(requests, 0); rows.push({ name: 'server-replaced-before-request', exit: value.status, requests });
  } finally { if (replacement) await new Promise(resolve => replacement.close(resolve)); replaced.dispose(); }
  for (const [name, mode] of [['defaults', 'defaults'], ['http-config', 'config'], ['all-input-types', 'input-mask']]) { must([native + '/boundary', mode], name); rows.push({ name, exit: 0 }); }
  const busy = execute([native + '/boundary', 'busy-main'], 'busy-main'); assert.equal(busy.status, 80); rows.push({ name: 'busy-main-HID-signal', exit: busy.status });
  const inputDriver = path.join(tools, 'InputCoverageProbe.swift');
  fs.copyFileSync('.agents/skills/verify-macos-real-app/scripts/InputCoverageProbe.swift', inputDriver);
  build([c.guardFile, 'apps/macos/VerificationApp/OwnerIdle.swift', inputDriver], native + '/input-types', 'build-delivered-input');
  for (const type of ['key', 'modifier']) { const value = execute([native + '/input-types', tools + '/input-request', type], 'delivered-' + type); assert.equal(value.status, 80, value.stderr); assert(value.stderr.includes('posted test input detected (type ' + (type === 'modifier' ? 12 : 10) + ')')); rows.push({ name: 'delivered-' + type, exit: value.status }); }
  const hold = await fixture(); try {
    const first = await asynchronous([native + '/boundary', 'hold'], 'first-instance', hold.env);
    for (let n = 0; n < 1000 && !first.output().includes('manifest accepted'); n++) { assert.equal(first.child.exitCode, null); await pause(10); }
    assert(first.output().includes('manifest accepted'));
    const second = execute([native + '/guard'], 'second-instance', hold.env); assert.equal(second.status, 78);
    assert.equal((await first.done).status, 0);
    const reused = execute([native + '/guard'], 'reused-run', hold.env); assert.equal(reused.status, 78);
    rows.push({ name: 'second-and-reused-instance', first: 0, second: 78, reused: 78 });
  } finally { hold.dispose(); }
  const machine = await asynchronous([native + '/boundary', 'machine-lock'], 'machine-first');
  for (let n = 0; n < 1000 && !machine.output().includes('machine lock accepted'); n++) { assert.equal(machine.child.exitCode, null); await pause(10); }
  assert(machine.output().includes('machine lock accepted'));
  const other = execute([native + '/boundary', 'machine-lock'], 'machine-second'); assert.equal(other.status, 78);
  assert.equal((await machine.done).status, 0); rows.push({ name: 'machine-visible-lock-without-window', first: 0, second: 78 });
  await check('credential-service-denial-and-sandbox-http', undefined, 0, native + '/boundary', ['policy']);
  stages.guardMatrix = true; stages.inputBoundary = true; stages.instanceLocks = true;
  fs.writeFileSync(evidence + '/guard-matrix.json', JSON.stringify({ sourceHead: c.sourceHead, controls: rows, HTTPObservations: hits, originalCredentialCalls: false }, null, 2));
}
