import assert from 'node:assert/strict';
import { receipt, requiredStages } from './receipt-stages.mjs';
const all = Object.fromEntries(requiredStages.map(key => [key, true]));
assert.equal(receipt(all, 'visible', true).completeRecipe, true);
assert.equal(receipt(all, 'guards-only', true).completeRecipe, false);
assert.equal(receipt(all, 'headless', true).completeRecipe, true);
const visible = ['ownerPreflight', 'visibleLaunch', 'accessibilityReadback', 'visibleInputStop'];
const headless = { ...all, ...Object.fromEntries(visible.map(stage => [stage, false])) };
assert.equal(receipt(headless, 'headless', true).completeRecipe, true);
assert.equal(receipt(headless, 'headless', true).completeVisibleRecipe, false);
assert.deepEqual(receipt(headless, 'headless', true).owedStages, visible);
for (const key of requiredStages) {
  assert.equal(receipt({ ...all, [key]: false }, 'visible', true).completeRecipe, false, key);
  assert.equal(receipt({ ...all, [key]: false }, 'headless', true).completeRecipe, visible.includes(key), key);
}
for (const scope of ['headless', 'visible', 'guards-only', 'failed']) {
  assert.equal(receipt(all, scope, false).completeRecipe, false, scope);
  assert.equal(receipt(all, scope).completeRecipe, false, scope);
}
assert.equal(receipt({ guardMatrix: true, guardRedControls: true, cleanup: true }, 'guards-only', true).completeRecipe, false);
assert.equal(receipt({}, 'failed', true).completeRecipe, false);
console.log('PASS: all required stages and successful exit control each scope; visible work stays owed');
