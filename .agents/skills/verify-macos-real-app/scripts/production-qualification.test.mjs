import assert from 'node:assert/strict';
import { qualifyPreservation } from './production-qualification.mjs';
const outcomes = [{ id: 'offscreen/0/renderScreens', outcome: 'passed' }, { id: 'state/0/modelReload', outcome: 'passed' }];
const clean = { products: 4, keychainLinked: false, keychainSymbols: {} };
const recipes = () => [{ stage: 'offscreen', exit: 0, keychainGuard: { ...clean } }, { stage: 'state', exit: 0, keychainGuard: { ...clean } }];
const arm = (name, pid, guarded = false) => ({ name, guarded, outcomes, recipes: recipes(), descriptorAudit: [{ pid, finished: true, protectedDescriptor: false }], ...(guarded ? { kernel: { pids: [pid], observedProtectedDenials: [] } } : {}) });
const nesting = { exit: 71, output: 'sandbox-exec: sandbox_apply: Operation not permitted\n', log: 'deny-only-nesting.log' };
const unguarded = () => [arm('base-unguarded', 11), arm('candidate-unguarded', 12)];
const guardedArms = () => [arm('base-deny-only', 13, true), arm('candidate-deny-only', 14, true)];

const accepted = qualifyPreservation(unguarded(), nesting);
assert.equal(accepted.denyOnlyRetained, false, 'Without guarded arms that ran, the record must say false');
assert.deepEqual(accepted.denyOnlyCause, { exit: 71, refusal: 'sandbox_apply: Operation not permitted', log: 'deny-only-nesting.log' });
assert.equal(accepted.plain.sameOutcomes, true);

assert.throws(() => qualifyPreservation(unguarded(), null), /recorded nested-sandbox refusal/, 'A dropped guard needs its cause');
assert.throws(() => qualifyPreservation(unguarded(), { ...nesting, exit: 0 }), /recorded nested-sandbox refusal/);
assert.throws(() => qualifyPreservation(unguarded(), { ...nesting, output: 'other failure' }), /recorded nested-sandbox refusal/);

const idle = [...unguarded(), ...guardedArms().map(item => ({ ...item, recipes: [], outcomes: [] }))];
assert.throws(() => qualifyPreservation(idle, nesting), /Guarded arm did not run/, 'true needs a guarded arm that ran');
assert.equal(qualifyPreservation([...unguarded(), ...guardedArms()], null).denyOnlyRetained, true);

const unkerneled = [...unguarded(), ...guardedArms()]; delete unkerneled[2].kernel;
assert.throws(() => qualifyPreservation(unkerneled, null), /Missing kernel query/, 'A guarded arm needs its kernel query');
const uncovered = [...unguarded(), ...guardedArms()]; uncovered[3].kernel.pids = [99];
assert.throws(() => qualifyPreservation(uncovered, null), /cover every audited host/);
const denied = [...unguarded(), ...guardedArms()]; denied[2].kernel.observedProtectedDenials = [{ pid: 13 }];
assert.throws(() => qualifyPreservation(denied, null), /production-suite finding/);

const noAudit = unguarded(); noAudit[0].descriptorAudit = [];
assert.throws(() => qualifyPreservation(noAudit, nesting), /Missing descriptor audit/, 'A missing descriptor audit fails qualification');
const unfinished = unguarded(); unfinished[0].descriptorAudit[0].finished = false;
assert.throws(() => qualifyPreservation(unfinished, nesting), /Incomplete descriptor audit/);

const noReceipt = unguarded(); delete noReceipt[1].recipes[1].keychainGuard;
assert.throws(() => qualifyPreservation(noReceipt, nesting), /Missing Keychain guard receipt: candidate-unguarded\/state/, 'A missing Keychain guard receipt fails qualification');
const emptyReceipt = unguarded(); emptyReceipt[0].recipes[0].keychainGuard.products = 0;
assert.throws(() => qualifyPreservation(emptyReceipt, nesting), /Missing Keychain guard receipt/);
const linked = unguarded(); linked[0].recipes[0].keychainGuard = { products: 4, keychainLinked: true, keychainSymbols: { TodoStateProofPackageTests: ['_SecItemDelete'] } };
assert.throws(() => qualifyPreservation(linked, nesting), /Keychain call linked in test products: base-unguarded\/offscreen/, 'A linked Keychain call fails qualification');

const changed = unguarded(); changed[1].outcomes = [{ ...outcomes[0], outcome: 'failed' }, outcomes[1]]; changed[1].recipes[0].exit = 1;
assert.throws(() => qualifyPreservation(changed, nesting), /outcomes differ/);
assert.throws(() => qualifyPreservation([arm('base-unguarded', 11)], nesting), /Both unguarded arms/);
console.log('PASS: Keychain guard receipts required and unlinked; kernel query required only under a guard sandbox; deny-only cause and descriptor audits required');
