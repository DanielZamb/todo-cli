import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { environment, run } from './process-policy.mjs';
process.umask(0o077);
const directory = fs.realpathSync(fs.mkdtempSync('/tmp/todo-mac-verify-node-reds-'));
fs.mkdirSync(directory + '/home'); fs.mkdirSync(directory + '/tmp');
const env = environment(directory + '/home', directory + '/tmp'), rows = [];
try {
  for (const [module, test, before, after] of [
    ['receipt-stages.mjs', 'receipt-stages.test.mjs', "scope === 'visible' && requiredStages.every(stage => result[stage])", "scope !== 'visible-only'"],
    ['process-policy.mjs', 'process-policy.test.mjs', 'const result = { HOME:', 'const result = { ...process.env, HOME:'],
  ]) {
    if (module === 'process-policy.mjs') fs.copyFileSync(path.resolve('.agents/skills/verify-macos-real-app/scripts/bun-policy.mjs'), directory + '/bun-policy.mjs');
    const sourcePath = path.resolve('.agents/skills/verify-macos-real-app/scripts', module);
    const source = fs.readFileSync(sourcePath, 'utf8'); assert(source.includes(before));
    const mutant = directory + '/' + module; fs.writeFileSync(mutant, source.replace(before, after));
    const testPath = path.resolve('.agents/skills/verify-macos-real-app/scripts', test);
    const original = run(['node', testPath], { env, encoding: 'utf8' }); assert.equal(original.status, 0, original.stderr);
    const changed = directory + '/' + test;
    fs.writeFileSync(changed, fs.readFileSync(testPath, 'utf8').replace("'./" + module + "'", JSON.stringify(pathToFileURL(mutant).href)));
    const red = run(['node', changed], { env, encoding: 'utf8' }); assert.equal(red.status, 1, red.stderr);
    rows.push({ module, originalTestExit: original.status, matchingMutationTestExit: red.status, mutation: { before, after } });
  }
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ controls: rows, SwiftStarted: false }, null, 2));
  console.log(JSON.stringify(rows));
} finally { fs.rmSync(directory, { recursive: true }); }
