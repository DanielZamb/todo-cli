import assert from 'node:assert/strict';
import { qualifyPreservation } from './production-qualification.mjs';
const outcomes = [{ id: 'offscreen/0/renderScreens', outcome: 'passed' }, { id: 'state/0/modelReload', outcome: 'passed' }];
const recipes = [{ stage: 'offscreen', exit: 0 }, { stage: 'state', exit: 0 }];
const arm = (name, pid, guarded = false) => ({ name, guarded, outcomes, recipes, descriptorAudit: [{ pid, finished: true, protectedDescriptor: false }], kernel: { pids: [pid], observedProtectedDenials: [] } });
const nesting = { exit: 65, output: 'sandbox-exec: sandbox_apply: Operation not permitted\n', log: 'deny-only-nesting.log' };
const unguarded = () => [arm('base-unguarded', 11), arm('candidate-unguarded', 12)];

const accepted = qualifyPreservation(unguarded(), nesting);
assert.equal(accepted.denyOnlyRetained, false, 'Without guarded arms that ran, the record must say false');
assert.deepEqual(accepted.denyOnlyCause, { exit: 65, refusal: 'sandbox_apply: Operation not permitted', log: 'deny-only-nesting.log' });
assert.equal(accepted.plain.sameOutcomes, true);

assert.throws(() => qualifyPreservation(unguarded(), null), /recorded nested-sandbox refusal/, 'A dropped guard needs its cause');
assert.throws(() => qualifyPreservation(unguarded(), { ...nesting, exit: 0 }), /recorded nested-sandbox refusal/);
assert.throws(() => qualifyPreservation(unguarded(), { ...nesting, output: 'other failure' }), /recorded nested-sandbox refusal/);

const idle = [...unguarded(), { ...arm('base-deny-only', 13, true), recipes: [], outcomes: [] }, { ...arm('candidate-deny-only', 14, true), recipes: [], outcomes: [] }];
assert.throws(() => qualifyPreservation(idle, nesting), /Guarded arm did not run/, 'true needs a guarded arm that ran');
const retained = qualifyPreservation([...unguarded(), arm('base-deny-only', 13, true), arm('candidate-deny-only', 14, true)], null);
assert.equal(retained.denyOnlyRetained, true);

const noKernel = unguarded(); delete noKernel[1].kernel;
assert.throws(() => qualifyPreservation(noKernel, nesting), /Missing kernel query/, 'A missing kernel query fails qualification');
const noAudit = unguarded(); noAudit[0].descriptorAudit = [];
assert.throws(() => qualifyPreservation(noAudit, nesting), /Missing descriptor audit/, 'A missing descriptor audit fails qualification');
const unfinished = unguarded(); unfinished[0].descriptorAudit[0].finished = false;
assert.throws(() => qualifyPreservation(unfinished, nesting), /Incomplete descriptor audit/);
const uncovered = unguarded(); uncovered[1].kernel.pids = [99];
assert.throws(() => qualifyPreservation(uncovered, nesting), /cover every audited host/);
const denied = unguarded(); denied[0].kernel.observedProtectedDenials = [{ pid: 11 }];
assert.throws(() => qualifyPreservation(denied, nesting), /production-suite finding/);
const changed = unguarded(); changed[1].outcomes = [{ ...outcomes[0], outcome: 'failed' }, outcomes[1]]; changed[1].recipes = [{ stage: 'offscreen', exit: 1 }, recipes[1]];
assert.throws(() => qualifyPreservation(changed, nesting), /outcomes differ/);
assert.throws(() => qualifyPreservation([arm('base-unguarded', 11)], nesting), /Both unguarded arms/);
console.log('PASS: deny-only false needs its cause, true needs guarded arms that ran, kernel query and descriptor audit required');
