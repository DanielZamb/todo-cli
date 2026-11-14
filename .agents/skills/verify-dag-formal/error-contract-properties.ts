import assert from "node:assert/strict";
import { Schema } from "effect";
import { checkDependencyAddition, DependencyError, TaskAttemptRejected } from "@todo/domain";
import { task, time } from "@candidate-fixtures";
const error = checkDependencyAddition({
  edge: { profile_id: task.profile_id, dependent_id: task.id, blocker_id: task.id },
  tasks: new Map([[task.id, task]]),
  traversal: { upstream: () => [], hasDependents: () => false },
  occurred_at: time,
});
assert.ok(error);
assert.equal(error.exit_code, 2, "DAG error exit pair");
assert.equal(error.exit_meaning, "validation or usage", "DAG error exit meaning");
assert.equal(error.code, "dependency_cycle");
const { exit_code, exit_meaning, ...legacy } = error;
assert.equal(Schema.is(DependencyError)(legacy), false, "DAG public schema requires exit pair");
assert.equal(Schema.is(DependencyError)({ ...error, exit_meaning: "success" }), false);
const old = Schema.decodeUnknownSync(TaskAttemptRejected)({
  entity_version: 1, kind: "TaskAttemptRejected", occurred_at: time,
  attempted_kind: "DependencyAdded", task_id: task.id, violations: [],
  details: { witness: legacy, truncated: false, total: 1 },
});
assert.deepEqual(old.details?.witness, error, "Legacy stored witness receives the exit pair");
console.log(JSON.stringify({ passed: true, exit_code, exit_meaning }));
