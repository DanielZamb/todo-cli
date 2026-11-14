import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const [binary, warmEvidence, output] = process.argv.slice(2);
assert.ok(binary && warmEvidence && output);
const cases = JSON.parse(readFileSync(join(warmEvidence, 'mutation-flags.json'))).map(row => ({ command: row.command, flag: row.flag, args: row.args, stderr: row.expected_stderr }));
assert.equal(cases.length, 64);
cases.push({ command: 'detach', flag: 'label', args: ['detach', 'missing-task', 'missing-attachment', '--label', 'Ignored', '--expected-version', '1'], stderr: '# Error\n\nerror 2 - validation or usage\n\n- code: invalid_args\n- message: Unrecognized flag: --label in command todo detach\n' });
const rows = [];
for (const item of cases) for (const format of ['md', 'json']) {
  const directory = mkdtempSync(join(tmpdir(), 'todo-integ-early-'));
  try {
    mkdirSync(join(directory, '.todo-cli'));
    writeFileSync(join(directory, '.todo-cli', '.first_run_disclaimer_seen'), 'fixture\n');
    const before = readdirSync(directory, { recursive: true });
    const result = spawnSync(resolve(binary), ['--db', join(directory, 'scratch.db'), '--format', format, ...item.args], { env: { ...process.env, HOME: directory, NO_COLOR: '1' }, encoding: 'utf8', input: '', timeout: 30000 });
    assert.equal(result.status, 2, `${item.command} --${item.flag}: ${result.stdout}${result.stderr}`);
    if (format === 'md') assert.equal(result.stderr, item.stderr);
    else {
      const {generated_at, ...body} = JSON.parse(result.stdout);
      assert.equal(Number.isFinite(Date.parse(generated_at)), true);
      const message = item.stderr.split('- message: ')[1]?.trimEnd();
      assert.deepEqual(body, { code: 'invalid_args', message, exit_code: 2, exit_meaning: 'validation or usage' });
    }
    assert.deepEqual(readdirSync(directory, { recursive: true }), before, 'unsupported flag must refuse before auth or store creation');
    assert.equal(readFileSync(join(directory, '.todo-cli', '.first_run_disclaimer_seen'), 'utf8'), 'fixture\n');
    rows.push({ command: item.command, flag: item.flag, format, exit: result.status, files: [], stdout: result.stdout, stderr: result.stderr });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'result.json'), JSON.stringify({ cases: rows.length, rows }, null, 2));
console.log(JSON.stringify({ cases: rows.length, status: 'PASS' }));
