import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { productionScratchRoot, recipeEvidence } from './production-paths.mjs';
const repository = fs.realpathSync(process.cwd());
fs.mkdirSync(repository + '/.scratch', { recursive: true });
const workspace = fs.mkdtempSync(repository + '/.scratch/production-path-test-');
let proof;
try {
 proof = productionScratchRoot(workspace);
 assert.equal(path.relative(workspace, proof).split(path.sep)[0], '.scratch', 'Scratch root must stay inside the workspace');
 assert.equal(fs.realpathSync(proof), proof);
 assert.equal(fs.statSync(proof).mode & 0o777, 0o700);
 const base = workspace + '/base', arm = workspace + '/receipts/base-unguarded';
 fs.mkdirSync(base); fs.mkdirSync(arm, { recursive: true });
 const output = recipeEvidence(base, arm, 'offscreen', path.basename(proof));
 fs.mkdirSync(output); fs.writeFileSync(output + '/marker', 'literal base artifact');
 assert.equal(path.relative(base, fs.realpathSync(arm + '/offscreen')).split(path.sep)[0], 'docs', 'Recipe evidence must resolve inside its source repository');
 assert.equal(fs.readFileSync(arm + '/offscreen/marker', 'utf8'), 'literal base artifact');
 assert.throws(() => recipeEvidence(base, arm, 'offscreen', path.basename(proof)));
 assert.throws(() => recipeEvidence(base, arm, '../escape', path.basename(proof)));
 console.log('PASS: canonical workspace scratch and recipe-local artifacts readable from the primary receipt path');
} finally {
 for (const root of [proof, workspace].filter(Boolean)) {
  assert(root.startsWith(workspace) || root.startsWith('/private/tmp/todo-mac-production-'));
  const closed = spawnSync('/usr/sbin/lsof', ['-Fpcn', '+D', root], { env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C' }, encoding: 'utf8' });
  assert(closed.status === 1 && !closed.stdout.trim() && !closed.stderr.trim());
  fs.rmSync(root, { recursive: true });
 }
}
