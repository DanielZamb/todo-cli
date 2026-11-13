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
  for (const [module, test, before, after, expectedFailure] of [
    ['receipt-stages.mjs', 'receipt-stages.test.mjs', 'successful && needed.length > 0 && needed.every(stage => result[stage])', 'true'],
    ['receipt-stages.mjs', 'receipt-stages.test.mjs', 'completeRecipe: successful && ', 'completeRecipe: '],
    ['process-policy.mjs', 'process-policy.test.mjs', 'const result = { HOME:', 'const result = { ...process.env, HOME:'],
    ['mach-o-imports.mjs', 'mach-o-imports.test.mjs', "return names.map(name => name.startsWith('_') ? name.slice(1) : name);", 'return [];'],
    ['production-outcomes.mjs', 'production-outcomes.test.mjs', 'sameOutcomes: !onlyBase.length && !onlyCandidate.length && !changed.length', 'sameOutcomes: true'],
    ['production-outcomes.mjs', 'production-outcomes.test.mjs', 'run.recipes.map(({ stage, exit })', '[].map(({ stage, exit })', 'Whole-recipe failures must not disappear'],
    ['production-paths.mjs', 'production-paths.test.mjs', "path.join(repository, 'docs'", "path.join(arm, 'docs'", 'Recipe evidence must resolve inside its source repository'],
    ['production-paths.mjs', 'production-paths.test.mjs', "fs.mkdtempSync(path.join(scratch, 'v01-production-'))", "fs.mkdtempSync('/tmp/todo-mac-production-')", 'Scratch root must stay inside the workspace'],
    ['production-denials.mjs', 'production-denials.test.mjs', 'return result;', 'return [];'],
    ['production-qualification.mjs', 'production-qualification.test.mjs', 'denyOnlyRetained: false, denyOnlyCause: {', 'denyOnlyRetained: true, denyOnlyCause: {', 'Without guarded arms that ran, the record must say false'],
    ['production-qualification.mjs', 'production-qualification.test.mjs', ' && ran(guardedBase) && ran(guardedCandidate)', '', 'true needs a guarded arm that ran'],
    ['production-qualification.mjs', 'production-qualification.test.mjs', "assert(arm.kernel && Array.isArray(arm.kernel.pids) && arm.kernel.pids.length > 0 && Array.isArray(arm.kernel.observedProtectedDenials), 'Missing kernel query: ' + arm.name);", '', 'A missing kernel query fails qualification'],
    ['production-qualification.mjs', 'production-qualification.test.mjs', 'arm.descriptorAudit.length > 0', 'true', 'A missing descriptor audit fails qualification'],
    ['production-qualification.mjs', 'production-qualification.test.mjs', "assert(nesting && nesting.exit !== 0 && typeof nesting.output === 'string' && nesting.output.includes(NESTED_SANDBOX_REFUSAL), 'Deny-only not retained needs its recorded nested-sandbox refusal');", '', 'A dropped guard needs its cause'],
  ]) {
    if (module === 'process-policy.mjs') fs.copyFileSync(path.resolve('.agents/skills/verify-macos-real-app/scripts/bun-policy.mjs'), directory + '/bun-policy.mjs');
    if (module === 'production-qualification.mjs') fs.copyFileSync(path.resolve('.agents/skills/verify-macos-real-app/scripts/production-outcomes.mjs'), directory + '/production-outcomes.mjs');
    const sourcePath = path.resolve('.agents/skills/verify-macos-real-app/scripts', module);
    const source = fs.readFileSync(sourcePath, 'utf8'); assert(source.includes(before));
    const mutant = directory + '/' + module; fs.writeFileSync(mutant, source.replace(before, after));
    const testPath = path.resolve('.agents/skills/verify-macos-real-app/scripts', test);
    const original = run(['node', testPath], { env, encoding: 'utf8' }); assert.equal(original.status, 0, original.stderr);
    const changed = directory + '/' + test;
    fs.writeFileSync(changed, fs.readFileSync(testPath, 'utf8').replace("'./" + module + "'", JSON.stringify(pathToFileURL(mutant).href)));
    const red = run(['node', changed], { env, encoding: 'utf8' }); assert.equal(red.status, 1, red.stderr);
    if (expectedFailure) assert(red.stderr.includes(expectedFailure), red.stderr);
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
