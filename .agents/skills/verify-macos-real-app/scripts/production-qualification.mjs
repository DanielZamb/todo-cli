import assert from 'node:assert/strict';
import { compareProductionOutcomes } from './production-outcomes.mjs';

// macOS refuses sandbox_apply inside a sandboxed process; SwiftPM applies its
// own manifest sandbox, so an outer deny-only profile cannot wrap the recipes.
export const NESTED_SANDBOX_REFUSAL = 'sandbox_apply: Operation not permitted';

function observed(arm) {
 assert(Array.isArray(arm.descriptorAudit) && arm.descriptorAudit.length > 0, 'Missing descriptor audit: ' + arm.name);
 for (const row of arm.descriptorAudit) assert(row.finished === true && row.protectedDescriptor === false && Number.isInteger(row.pid), 'Incomplete descriptor audit: ' + arm.name);
 assert(arm.kernel && Array.isArray(arm.kernel.pids) && arm.kernel.pids.length > 0 && Array.isArray(arm.kernel.observedProtectedDenials), 'Missing kernel query: ' + arm.name);
 assert.deepEqual([...arm.kernel.pids].sort(), arm.descriptorAudit.map(row => row.pid).sort(), 'Kernel query must cover every audited host: ' + arm.name);
 assert.equal(arm.kernel.observedProtectedDenials.length, 0, 'Protected-access denial is a production-suite finding: ' + arm.name);
}
function ran(arm) {
 return Array.isArray(arm.recipes) && ['offscreen', 'state'].every(stage => arm.recipes.some(row => row.stage === stage)) && arm.outcomes?.length > 0;
}

export function qualifyPreservation(arms, nesting) {
 const named = name => arms.find(arm => arm.name === name);
 const base = named('base-unguarded'), candidate = named('candidate-unguarded');
 assert(base && candidate && !base.guarded && !candidate.guarded, 'Both unguarded arms are required');
 for (const arm of arms) observed(arm);
 const plain = compareProductionOutcomes(base, candidate);
 assert(plain.sameOutcomes, 'Base/candidate production outcomes differ');
 const guardedBase = named('base-deny-only'), guardedCandidate = named('candidate-deny-only');
 if (guardedBase || guardedCandidate) {
  assert(guardedBase && guardedCandidate && ran(guardedBase) && ran(guardedCandidate), 'Guarded arm did not run');
  const guardOnBase = compareProductionOutcomes(base, guardedBase);
  assert(guardOnBase.sameOutcomes, 'Deny-only policy changed base outcomes; stop without widening or fallback');
  const guarded = compareProductionOutcomes(guardedBase, guardedCandidate);
  assert(guarded.sameOutcomes, 'Guarded base/candidate production outcomes differ');
  return { plain, guarded, guardOnBase, denyOnlyRetained: true, denyOnlyCause: null };
 }
 assert(nesting && nesting.exit !== 0 && typeof nesting.output === 'string' && nesting.output.includes(NESTED_SANDBOX_REFUSAL), 'Deny-only not retained needs its recorded nested-sandbox refusal');
 return { plain, guarded: null, guardOnBase: null, denyOnlyRetained: false, denyOnlyCause: { exit: nesting.exit, refusal: NESTED_SANDBOX_REFUSAL, log: nesting.log } };
}
