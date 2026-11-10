import { Schema } from "effect";
import {
  DependencyAdvice,
  DependencyError,
  Edge,
  VersionChange,
} from "./dependencies.ts";
import { Task } from "./entities.ts";
import { exitStatusFields } from "./exit-status.ts";
import { Sequence, TaskId, Version } from "./ids.ts";
import { limitedItems, TaskIdInput } from "./limits.ts";
import { Instant } from "./time.ts";

export const DependRequest = Schema.Struct({
  blocker_id: TaskIdInput,
  from_version: Version,
});
export const UndependRequest = DependRequest;
export type DependRequest = typeof DependRequest.Type;
export const DependencyWarning = Schema.Union([
  Schema.Struct({
    code: Schema.Literal("many_dependencies"),
    message: DependencyAdvice,
    dependent_id: TaskId,
    count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  Schema.Struct({
    code: Schema.Literal("redundant_dependency"),
    message: Schema.NonEmptyString,
    dependent_id: TaskId,
    blocker_id: TaskId,
    path: Schema.Array(TaskId).check(Schema.isMinLength(3)),
  }),
]);
export type DependencyWarning = typeof DependencyWarning.Type;
export const EdgeReport = Schema.Struct({
  generated_at: Instant,
  outcome: Schema.Literals(["added", "removed", "unchanged"]),
  dependent_id: TaskId,
  blocker_id: TaskId,
  from_version: Version,
  to_version: Version,
  seq: Schema.NullOr(Sequence),
  warnings: Schema.Array(DependencyWarning),
  dry_run: Schema.optionalKey(Schema.Boolean),
});
export type EdgeReport = typeof EdgeReport.Type;
export const BatchEdgeItem = Schema.Struct({
  action: Schema.Literals(["depend", "undepend"]),
  dependent_id: TaskIdInput,
  ...DependRequest.fields,
});
export const BatchEdgeRequest = Schema.Struct({
  items: limitedItems(BatchEdgeItem).check(Schema.isMinLength(1)),
  dry_run: Schema.optionalKey(Schema.Boolean),
});
export type BatchEdgeRequest = typeof BatchEdgeRequest.Type;
export const EdgeFailure = Schema.Union([
  DependencyError,
  ...([1, 2, 3, 4] as const).map((exit) =>
    Schema.Struct({
      ...exitStatusFields(exit),
      generated_at: Instant,
      code: Schema.Literals([
        "conflict",
        "not_found",
        "invalid_args",
        "auth_required",
        "forbidden",
        "runtime",
      ]),
      message: Schema.String,
      details: Schema.optionalKey(
        Schema.Struct({ current_version: Schema.NullOr(Version) }),
      ),
    }),
  ),
]);
export type EdgeFailure = typeof EdgeFailure.Type;
export const BatchEdgeReport = Schema.Struct({
  generated_at: Instant,
  dry_run: Schema.Boolean,
  results: Schema.Array(
    Schema.Union([
      Schema.Struct({
        index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
        result: EdgeReport,
      }),
      Schema.Struct({
        index: Schema.Int,
        error: EdgeFailure,
        exit_code: Schema.Literals([1, 2, 3, 4]),
      }),
    ]),
  ),
});
export type BatchEdgeReport = typeof BatchEdgeReport.Type;
export const DeleteTask = Schema.Struct({
  from_version: Version,
  with_dependencies: Schema.optionalKey(Schema.Boolean),
  dry_run: Schema.optionalKey(Schema.Boolean),
  dependency_fingerprint: Schema.optionalKey(
    Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  ),
});
export type DeleteTask = typeof DeleteTask.Type;
export const DeleteReport = Schema.Struct({
  generated_at: Instant,
  task: Task,
  removed_dependencies: Schema.Array(Edge),
  affected_versions: Schema.Array(VersionChange),
  dependency_fingerprint: Schema.String,
  dry_run: Schema.Boolean,
});
export type DeleteReport = typeof DeleteReport.Type;
