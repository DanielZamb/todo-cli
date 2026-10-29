import { Schema, Struct } from "effect";
import { Recurrence, TaskDetails } from "./entities.ts";
import { ProfileId, Sequence, Version } from "./ids.ts";

const TaskInput = Schema.Struct({
  ...TaskDetails.fields,
  external_id: Schema.NullOr(
    Schema.NonEmptyString.check(Schema.isPattern(/\S/)),
  ),
  project_name: Schema.String,
  tag_names: Schema.Array(Schema.String),
  title: Schema.NonEmptyString.check(Schema.isPattern(/\S/)),
  source: Schema.Literals(["manual", "agent", "import"]),
});
export const TaskPatch = TaskInput.mapFields(Struct.map(Schema.optionalKey));
export const CreateTask = Schema.Struct({
  ...TaskPatch.fields,
  title: TaskInput.fields.title,
});
export type CreateTask = typeof CreateTask.Type;
export const EditTask = Schema.Struct({
  from_version: Version,
  changes: TaskPatch,
});
export type EditTask = typeof EditTask.Type;
export const ExpectedVersion = Schema.Struct({ from_version: Version });
export type ExpectedVersion = typeof ExpectedVersion.Type;
export const TransitionTask = Schema.Struct({
  from_version: Version,
  action: Schema.Literals(["complete", "cancel", "reopen"]),
});
export type TransitionTask = typeof TransitionTask.Type;

export const MoveTask = Schema.Struct({
  from_version: Version,
  destination_profile: ProfileId,
});
export type MoveTask = typeof MoveTask.Type;
export const RevertTask = Schema.Struct({
  from_version: Version,
  seq: Sequence,
});
export type RevertTask = typeof RevertTask.Type;
export const CreateSeries = Schema.Struct({
  task: CreateTask,
  recurrence: Recurrence,
});
export type CreateSeries = typeof CreateSeries.Type;
export const EditSeries = Schema.Struct({
  from_version: Version,
  changes: TaskPatch,
  recurrence: Recurrence,
});
export type EditSeries = typeof EditSeries.Type;
