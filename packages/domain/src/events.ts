import { Schema } from "effect";
import { Occurrence, Profile, Project, Series, Tag, Task } from "./entities.ts";
import { ActorId, ProfileId, Sequence, TaskId, Version } from "./ids.ts";
import { Instant } from "./time.ts";

const eventFields = {
  entity_version: Schema.Literal(1),
  occurred_at: Instant,
};

export const TaskCreated = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("TaskCreated"),
  copied_from: Schema.optionalKey(
    Schema.Struct({
      profile_id: ProfileId,
      profile_name: Schema.String,
      source_task_id: TaskId,
    }),
  ),
  task: Task,
  series: Schema.NullOr(Series),
  project: Schema.NullOr(Project),
  tags: Schema.Array(Tag),
});
export type TaskCreated = typeof TaskCreated.Type;

export const TaskEdited = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("TaskEdited"),
  before: Task,
  after: Task,
  series_before: Schema.NullOr(Series),
  series_after: Schema.NullOr(Series),
  project_before: Schema.NullOr(Project),
  project_after: Schema.NullOr(Project),
  tags_before: Schema.Array(Tag),
  tags_after: Schema.Array(Tag),
});
export type TaskEdited = typeof TaskEdited.Type;

export const TaskCompleted = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("TaskCompleted"),
  before: Task,
  after: Task,
  next_occurrences: Schema.Array(Occurrence),
});
export type TaskCompleted = typeof TaskCompleted.Type;

export const TaskCancelled = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("TaskCancelled"),
  before: Task,
  after: Task,
  next_occurrences: Schema.Array(Occurrence),
});
export type TaskCancelled = typeof TaskCancelled.Type;

export const TaskReopened = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("TaskReopened"),
  before: Task,
  after: Task,
});
export type TaskReopened = typeof TaskReopened.Type;

export const TaskDeleted = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("TaskDeleted"),
  before: Task,
  after: Task,
});
export type TaskDeleted = typeof TaskDeleted.Type;

export const AttachmentAdded = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("AttachmentAdded"),
  before: Task,
  after: Task,
});
export const AttachmentRemoved = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("AttachmentRemoved"),
  before: Task,
  after: Task,
});

export const TaskPurged = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("TaskPurged"),
  task_id: TaskId,
  before: Task,
});
export type TaskPurged = typeof TaskPurged.Type;

export const TaskReverted = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("TaskReverted"),
  original_seq: Sequence,
  tasks: Schema.Array(
    Schema.Struct({ before: Schema.NullOr(Task), after: Schema.NullOr(Task) }),
  ),
  series: Schema.Array(
    Schema.Struct({
      before: Schema.NullOr(Series),
      after: Schema.NullOr(Series),
    }),
  ),
});
export type TaskReverted = typeof TaskReverted.Type;

export const TaskMovedOut = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("TaskMovedOut"),
  move_id: Schema.NonEmptyString,
  original_seq: Schema.NullOr(Sequence),
  task: Task,
});
export const TaskMovedIn = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("TaskMovedIn"),
  project: Schema.optionalKey(Schema.NullOr(Project)),
  tags: Schema.optionalKey(Schema.Array(Tag)),
  move_id: Schema.NonEmptyString,
  original_seq: Schema.NullOr(Sequence),
  task: Task,
});

export const Event = Schema.Union([
  AttachmentAdded,
  AttachmentRemoved,
  TaskMovedOut,
  TaskMovedIn,
  TaskCreated,
  TaskEdited,
  TaskCompleted,
  TaskCancelled,
  TaskReopened,
  TaskDeleted,
  TaskPurged,
  TaskReverted,
]);
export type Event = typeof Event.Type;

export const TaskMutationKind = Schema.Union(
  Event.members.map((event) => event.fields.kind),
);
export type TaskMutationKind = typeof TaskMutationKind.Type;

export const RejectionViolation = Schema.Struct({
  field: Schema.NonEmptyString,
  received: Schema.Json,
  code: Schema.NonEmptyString,
});
export type RejectionViolation = typeof RejectionViolation.Type;

export const TaskAttemptRejected = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("TaskAttemptRejected"),
  attempted_kind: TaskMutationKind,
  task_id: Schema.NullOr(TaskId),
  violations: Schema.Array(RejectionViolation),
});
export type TaskAttemptRejected = typeof TaskAttemptRejected.Type;

export const ReminderFired = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("ReminderFired"),
  task_id: TaskId,
  due_at: Instant,
  task_version: Version,
  title: Schema.NonEmptyString,
});
export type ReminderFired = typeof ReminderFired.Type;

export const DatabaseRestored = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("DatabaseRestored"),
  generation: Schema.NonEmptyString,
  snapshot_id: Schema.NonEmptyString,
});

export const AuthAction = Schema.Literals([
  "setupOwner",
  "signIn",
  "authenticate",
  "issueToken",
  "listTokens",
  "revokeToken",
  "signOut",
  "read",
  "append",
  "revert",
  "mutate",
  "startSeries",
  "finishTask",
  "cleanupExpired",
  "deleteProfile",
]);
export type AuthAction = typeof AuthAction.Type;

export const AuthChanged = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("AuthChanged"),
  action: AuthAction,
  credential_id: Schema.NullOr(Schema.NonEmptyString),
});
export const AuthAttemptRejected = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("AuthAttemptRejected"),
  action: AuthAction,
  code: Schema.Literal("auth"),
  detail: Schema.Literals([
    "invalid_request",
    "owner_exists",
    "invalid_passphrase",
    "invalid_credential",
    "expired",
    "revoked",
    "profile_scope",
    "write_scope",
    "owner_required",
    "profile_deleted",
  ]),
});
export type AuthAttemptRejected = typeof AuthAttemptRejected.Type;

export const TaskHistoryRedacted = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("TaskHistoryRedacted"),
  original_kind: Schema.Union([
    TaskMutationKind,
    Schema.Literals(["TaskAttemptRejected", "ReminderFired"]),
  ]),
  attempted_kind: Schema.NullOr(TaskMutationKind),
  task_ids: Schema.Array(TaskId),
  replay: Schema.Struct({
    tasks: TaskReverted.fields.tasks,
    series: TaskReverted.fields.series,
    projects: Schema.Array(Project),
    tags: Schema.Array(Tag),
    versions: Schema.Array(Schema.Struct({ id: TaskId, version: Version })),
    series_versions: Schema.Array(
      Schema.Struct({ id: Series.fields.id, version: Version }),
    ),
  }),
});
export type TaskHistoryRedacted = typeof TaskHistoryRedacted.Type;

export const ProfileDeleted = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("ProfileDeleted"),
  profile: Profile,
  access_token_ids: Schema.Array(Schema.String),
});
export const ProfileDeletionRejected = Schema.Struct({
  ...eventFields,
  kind: Schema.Literal("ProfileDeletionRejected"),
  code: Schema.String,
  visible_task_count: Schema.Int,
});

const opLogFields = {
  seq: Sequence,
  actor: ActorId,
  profile: Schema.NullOr(ProfileId),
  from_version: Schema.NullOr(Version),
};

export const OpLogEntry = Schema.Union([
  Schema.Struct({
    ...opLogFields,
    event: Schema.Union([
      Event,
      AuthChanged,
      ProfileDeleted,
      ReminderFired,
      DatabaseRestored,
      TaskHistoryRedacted,
    ]),
    to_version: Schema.NullOr(Version),
    outcome: Schema.Literal("committed"),
    reason: Schema.Null,
  }),
  Schema.Struct({
    ...opLogFields,
    event: Schema.Union([
      TaskAttemptRejected,
      AuthAttemptRejected,
      ProfileDeletionRejected,
      TaskHistoryRedacted,
    ]),
    to_version: Schema.Null,
    outcome: Schema.Literal("rejected"),
    reason: Schema.NonEmptyString,
  }),
]);
export type OpLogEntry = typeof OpLogEntry.Type;
