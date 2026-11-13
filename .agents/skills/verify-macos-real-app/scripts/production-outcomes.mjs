import assert from 'node:assert/strict';

export function compareOutcomes(base, candidate) {
 function index(rows) {
  assert(Array.isArray(rows) && rows.length > 0, 'A preservation run needs actual test results');
  const result = new Map();
  for (const row of rows) {
   assert(typeof row.id === 'string' && row.id && ['passed', 'failed', 'skipped'].includes(row.outcome));
   assert(!result.has(row.id), 'Duplicate test identity: ' + row.id);
   result.set(row.id, row.outcome);
  }
  return result;
 }
 const before = index(base), after = index(candidate);
 const onlyBase = [...before.keys()].filter(id => !after.has(id)).sort();
 const onlyCandidate = [...after.keys()].filter(id => !before.has(id)).sort();
 const changed = [...before].filter(([id, outcome]) => after.has(id) && after.get(id) !== outcome).map(([id, outcome]) => ({ id, base: outcome, candidate: after.get(id) })).sort((a, b) => a.id.localeCompare(b.id));
 const sharedFailures = [...before].filter(([id, outcome]) => outcome === 'failed' && after.get(id) === 'failed').map(([id]) => id).sort();
 return { sameList: !onlyBase.length && !onlyCandidate.length, sameOutcomes: !onlyBase.length && !onlyCandidate.length && !changed.length, onlyBase, onlyCandidate, changed, sharedFailures, tests: before.size };
}
