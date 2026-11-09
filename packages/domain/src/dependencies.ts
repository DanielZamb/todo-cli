import { Schema } from "effect";
import { Task } from "./entities.ts";
import { ProfileId, TaskId, Version } from "./ids.ts";
import { Instant } from "./time.ts";

export const Edge = Schema.Struct({
  profile_id: ProfileId,
  dependent_id: TaskId,
  blocker_id: TaskId,
});
export type Edge = typeof Edge.Type;
export const VersionChange = Schema.Struct({
  id: TaskId,
  from_version: Version,
  to_version: Version,
  updated_at: Instant,
});
export type VersionChange = typeof VersionChange.Type;
export const DependencyChanges = Schema.Struct({
  added: Schema.Array(Edge),
  removed: Schema.Array(Edge),
  versions: Schema.Array(VersionChange),
});
export type DependencyChanges = typeof DependencyChanges.Type;
export const emptyDependencies = (): DependencyChanges => ({
  added: [],
  removed: [],
  versions: [],
});
const errorFields = { generated_at: Instant, message: Schema.NonEmptyString };
export const DependencyError = Schema.Union([
  Schema.Struct({
    ...errorFields,
    code: Schema.Literal("dependency_cycle"),
    details: Schema.Struct({
      dependent_id: TaskId,
      blocker_id: TaskId,
      path: Schema.Array(TaskId),
    }),
  }),
  Schema.Struct({
    ...errorFields,
    code: Schema.Literal("too_many_dependencies"),
    details: Schema.Struct({
      dependent_id: TaskId,
      count: Schema.Int,
      limit: Schema.Literal(13),
    }),
  }),
  Schema.Struct({
    ...errorFields,
    code: Schema.Literal("blocked"),
    details: Schema.Struct({ task_id: TaskId, blockers: Schema.Array(Task) }),
  }),
  Schema.Struct({
    ...errorFields,
    code: Schema.Literal("blocks_done_task"),
    details: Schema.Struct({
      task_id: TaskId,
      done_dependents: Schema.Array(Task),
      follow_up_depends_on: TaskId,
    }),
  }),
  Schema.Struct({
    ...errorFields,
    code: Schema.Literal("has_dependencies"),
    details: Schema.Struct({
      task_id: TaskId,
      dependencies: Schema.Array(Edge),
      flag: Schema.Literal("--with-dependencies"),
    }),
  }),
  Schema.Struct({
    ...errorFields,
    code: Schema.Literal("dependency_profile_mismatch"),
    details: Schema.Struct({
      dependent_id: TaskId,
      blocker_id: TaskId,
      profile_id: ProfileId,
    }),
  }),
]);
export type DependencyError = typeof DependencyError.Type;
export const RejectionDetails = Schema.Union([
  Schema.Struct({
    witness: DependencyError,
    truncated: Schema.Literal(false),
    total: Schema.Int,
  }),
  Schema.Struct({
    witness: Schema.Null,
    truncated: Schema.Literal(true),
    total: Schema.Int,
  }),
]);
