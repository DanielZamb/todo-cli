import assert from 'node:assert/strict';

export const SEAM_FILE = 'apps/macos/Sources/TodoModel.swift';

// The added and removed lines of a unified diff, without file headers, context or line numbers.
export function seamLines(diff) {
 return diff.split('\n').filter(line => /^[-+]/.test(line) && !/^(\+\+\+|---) /.test(line));
}

// Product code may differ from the installed base only by the reviewed Session storage seam.
export function checkSeam({ changedFiles, reviewedDiff, currentDiff }) {
 assert.deepEqual([...changedFiles].sort(), [SEAM_FILE], 'Product code may differ from the installed base only by the Session storage seam');
 const reviewed = seamLines(reviewedDiff), current = seamLines(currentDiff);
 assert(reviewed.length > 0, 'The reviewed seam diff is empty');
 assert.deepEqual(current, reviewed, 'The seam must match the reviewed seam line for line');
 return { files: [SEAM_FILE], changedLines: current.length };
}
