import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { command, environment, run, start } from './process-policy.mjs';
import { sandboxProfile } from './boundary-profiles.mjs';

export async function qualifyServerBoundary({ evidence, fixture, sourceHead, development }) {
  assert(path.isAbsolute(evidence) && !fs.existsSync(evidence));
  fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
  const controls = [], commands = [];
  const variants = [
    ['literal-baseline', value => value, true],
    ['literal-removed', value => value.replace('(allow file-read-data (literal "/"))', ''), false],
    ['literal-widened-subpath', value => value.replace('(allow file-read-data (literal "/"))', '(allow file-read-data (subpath "/"))'), false],
    ['literal-widened-read-star', value => value.replace('(allow file-read-data (literal "/"))', '(allow file-read* (literal "/"))'), false],
  ];
  let result = { status: 'FAIL', sourceHead, development, completeRecipe: false, SwiftStarted: false };
  try {
    for (const [label, edit, expected] of variants) {
      const f = await fixture();
      let child, stopped, stdout = '', stderr = '';
      const env = Object.fromEntries(['HOME', 'CFFIXED_USER_HOME', 'TMPDIR', 'LANG', 'LC_ALL'].map(key => [key, f.env[key]]));
      env.TODO_DB = f.manifest.database;
      env.TODO_PORT = String(new URL(f.manifest.serverURL).port);
      try {
        const original = sandboxProfile(f.directory, f.manifest.serverPath, Number(env.TODO_PORT));
        const policy = edit(original);
        assert(label === 'literal-baseline' || policy !== original);
        fs.writeFileSync(evidence + '/' + label + '.sb', policy);
        const argv = ['/usr/bin/sandbox-exec', '-p', policy, f.manifest.serverPath];
        child = start(argv, { cwd: f.directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', value => stdout += value);
        child.stderr.on('data', value => stderr += value);
        stopped = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (status, signal) => resolve({ status, signal })); });
        for (let i = 0; i < 1000 && child.exitCode === null && child.signalCode === null && !stdout.includes('Listening on '); i++) await new Promise(resolve => setTimeout(resolve, 10));
        const rows = stdout.split('\n').filter(line => line.startsWith('boundary-proof ')).map(line => JSON.parse(line.slice(15)));
        const finished = stdout.split('\n').find(line => line.startsWith('boundary-complete '));
        const complete = finished && JSON.parse(finished.slice(18));
        const passed = Boolean(complete?.role === 'server' && complete.failures === 0 && rows.length > 30 && rows.every(row => row.role === 'server' && row.pid === child.pid && row.passed) && stdout.includes('Listening on ') && child.exitCode === null && child.signalCode === null);
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        const exit = await stopped;
        fs.writeFileSync(evidence + '/' + label + '.log', stdout + stderr);
        commands.push({ argv: command(argv), environment: env, pid: child.pid, exit: exit.status, signal: exit.signal, intentionalTermination: passed, log: label + '.log' });
        const matchingArgv = ['node', '-e', 'require("node:assert/strict").equal(process.argv[1], "true")', String(passed)];
        const tools = environment(f.directory + '/home', f.directory + '/tmp');
        const matching = run(matchingArgv, { env: tools, encoding: 'utf8' });
        commands.push({ argv: command(matchingArgv), environment: tools, exit: matching.status, signal: matching.signal });
        fs.writeFileSync(evidence + '/' + label + '-matching-test.log', matching.stdout + matching.stderr);
        const logArgv = ['/usr/bin/log', 'show', '--last', '1m', '--style', 'json', '--info', '--debug', '--predicate', 'eventMessage CONTAINS "todo-server(' + child.pid + ')"'];
        const logs = run(logArgv, { env: tools, encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 });
        commands.push({ argv: command(logArgv), environment: tools, exit: logs.status, signal: logs.signal });
        fs.writeFileSync(evidence + '/' + label + '-own-pid-kernel.json', logs.stdout);
        fs.writeFileSync(evidence + '/' + label + '-own-pid-kernel.stderr', logs.stderr);
        assert.equal(logs.status, 0, logs.stderr);
        const unifiedDenials = JSON.parse(logs.stdout).filter(row => row.eventMessage.startsWith('Sandbox:')).map(row => row.eventMessage);
        assert.equal(passed, expected, stdout + stderr);
        assert.equal(matching.status, expected ? 0 : 1);
        if (label === 'literal-widened-subpath') assert(rows.some(row => row.label === 'Users' && !row.passed));
        if (label === 'literal-widened-read-star') assert(rows.some(row => row.label === 'root-attributes' && !row.passed));
        if (label === 'literal-removed') assert.equal(exit.signal, 'SIGABRT');
        controls.push({ label, pid: child.pid, passed, matchingTestExit: matching.status, exit: exit.status, signal: exit.signal, kernelRows: rows, unifiedDenials, unifiedLogMayBeRateLimited: unifiedDenials.length === 0 });
      } finally {
        if (child && child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await stopped; }
        f.dispose();
      }
    }
    result.status = 'PASS_COMPONENT';
  } catch (error) { result.error = error.stack; throw error; }
  finally {
    Object.assign(result, { controls });
    fs.writeFileSync(evidence + '/commands.json', JSON.stringify(commands, null, 2));
    fs.writeFileSync(evidence + '/result.json', JSON.stringify(result, null, 2));
  }
  return result;
}
