import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export function productionScratchRoot(repository) {
 assert.equal(fs.realpathSync(repository), repository);
 const scratch = path.join(repository, '.scratch');
 fs.mkdirSync(scratch, { recursive: true, mode: 0o700 });
 assert.equal(fs.realpathSync(scratch), scratch);
 return fs.realpathSync(fs.mkdtempSync(path.join(scratch, 'v01-production-')));
}

export function recipeEvidence(repository, arm, stage, runName) {
 assert.equal(fs.realpathSync(repository), repository);
 assert(['offscreen', 'state'].includes(stage));
 assert(/^v01-production-[A-Za-z0-9]+$/.test(runName));
 const output = path.join(repository, 'docs', 'evidence', 'mac-verification-app', runName, path.basename(arm), stage);
 fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
 assert(!fs.existsSync(output));
 fs.symlinkSync(output, path.join(arm, stage));
 return output;
}
