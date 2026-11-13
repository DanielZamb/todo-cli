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
    ['receipt-stages.mjs', 'receipt-stages.test.mjs', 'successful && needed.length > 0 && needed.every(stage => result[stage])', 'true'],
    ['receipt-stages.mjs', 'receipt-stages.test.mjs', 'completeRecipe: successful && ', 'completeRecipe: '],
    ['process-policy.mjs', 'process-policy.test.mjs', 'const result = { HOME:', 'const result = { ...process.env, HOME:'],
    ['mach-o-imports.mjs', 'mach-o-imports.test.mjs', "return names.map(name => name.startsWith('_') ? name.slice(1) : name);", 'return [];'],
    ['production-outcomes.mjs', 'production-outcomes.test.mjs', 'sameOutcomes: !onlyBase.length && !onlyCandidate.length && !changed.length', 'sameOutcomes: true'],
    ['production-denials.mjs', 'production-denials.test.mjs', 'return result;', 'return [];'],
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
  const pythonModule = path.resolve('.agents/skills/verify-macos-real-app/scripts/production-results.py');
  const pythonTest = path.resolve('.agents/skills/verify-macos-real-app/scripts/production-results-test.py');
  const pythonSource = fs.readFileSync(pythonModule, 'utf8');
  const before = "if sum(row['id'].startswith(framework + '/') for row in outcomes) < minimum:";
  assert(pythonSource.includes(before));
  fs.writeFileSync(directory + '/production-results.py', pythonSource.replace(before, 'if False:'));
  const pythonOriginal = run(['/usr/bin/python3', '-I', '-S', pythonTest], { env, encoding: 'utf8' }); assert.equal(pythonOriginal.status, 0, pythonOriginal.stderr);
  const pythonRed = run(['/usr/bin/python3', '-I', '-S', pythonTest, directory + '/production-results.py'], { env, encoding: 'utf8' }); assert.equal(pythonRed.status, 1, pythonRed.stderr);
  rows.push({ module: 'production-results.py', originalTestExit: pythonOriginal.status, matchingMutationTestExit: pythonRed.status, mutation: { before, after: 'if False:' } });
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ controls: rows, SwiftStarted: false }, null, 2));
  console.log(JSON.stringify(rows));
} finally { fs.rmSync(directory, { recursive: true }); }
