import { Effect, Schema } from "effect";
import { Task } from "./entities.ts";
import { exitStatusFields } from "./exit-status.ts";
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
export const DependencyAdvice = Schema.String.check(
  Schema.isPattern(
    /^This Task depends on [0-9]+ Tasks[.] That's a lot for one Task[.] It might be a whole Project, or it might be clearer split under a few more parent Tasks[.]$/u,
  ),
);
const errorFields = {
  generated_at: Instant,
  message: Schema.NonEmptyString,
  ...exitStatusFields(2),
};
export const DependencyError = Schema.Union([
  Schema.Struct({
    ...errorFields,
    code: Schema.Literal("dependency_cycle"),
    details: Schema.Struct({
      dependent_id: TaskId,
      blocker_id: TaskId,
      path: Schema.Array(TaskId).check(Schema.isMinLength(2)),
    }),
  }),
  Schema.Struct({
    ...errorFields,
    code: Schema.Literal("too_many_dependencies"),
    message: DependencyAdvice,
    details: Schema.Struct({
      dependent_id: TaskId,
      count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      limit: Schema.Literal(13),
    }),
  }),
  Schema.Struct({
    ...errorFields,
    code: Schema.Literal("blocked"),
    details: Schema.Struct({
      task_id: TaskId,
      blockers: Schema.Array(Task).check(Schema.isMinLength(1)),
    }),
  }),
  Schema.Struct({
    ...errorFields,
    code: Schema.Literal("blocks_done_task"),
    details: Schema.Struct({
      task_id: TaskId,
      done_dependents: Schema.Array(Task).check(Schema.isMinLength(1)),
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
]).annotate({ identifier: "DependencyError" });
export type DependencyError = typeof DependencyError.Type;
const StoredDependencyError = Schema.Union(
  DependencyError.members.map((member) =>
    Schema.Struct({
      ...member.fields,
      exit_code: Schema.Literal(2).pipe(
        Schema.withDecodingDefaultKey(Effect.succeed(2)),
      ),
      exit_meaning: Schema.Literal("validation or usage").pipe(
        Schema.withDecodingDefaultKey(Effect.succeed("validation or usage")),
      ),
    }),
  ),
).annotate({ identifier: "StoredDependencyError" });
export const RejectionDetails = Schema.Union([
  Schema.Struct({
    witness: StoredDependencyError,
    truncated: Schema.Literal(false),
    total: Schema.Int,
  }),
  Schema.Struct({
    witness: Schema.Null,
    truncated: Schema.Literal(true),
    total: Schema.Int,
  }),
]);
