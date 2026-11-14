import { Schema, Struct } from "effect";
import { AttachmentInput } from "./attachments.ts";
import { Recurrence, Task, TaskDetails } from "./entities.ts";
import { ProfileId, Sequence, TagId, type TaskId, Version } from "./ids.ts";
import {
  DescriptionInput,
  ExternalIdInput,
  inputLimits,
  limitedItems,
  NameInput,
  TagNamesInput,
  TaskIdInput,
  TaskTimeInput,
  TitleInput,
} from "./limits.ts";
import type { Instant } from "./time.ts";

const TaskInput = Schema.Struct({
  ...TaskDetails.fields,
  description: Schema.NullOr(DescriptionInput),
  scheduled_at: Schema.NullOr(TaskTimeInput),
  due_at: Schema.NullOr(TaskTimeInput),
  external_id: Schema.NullOr(ExternalIdInput),
  project_name: NameInput,
  tag_names: TagNamesInput,
  tags: limitedItems(TagId, inputLimits.tagsPerTask),
  title: TitleInput,
  source: Schema.Literals(["manual", "agent", "import"]),
});
export const TaskPatch = TaskInput.mapFields(Struct.map(Schema.optionalKey));
export const CreateTask = Schema.Struct({
  depends_on: Schema.optionalKey(
    limitedItems(TaskIdInput, 13).check(
      Schema.makeFilter(
        (ids) =>
          new Set(ids).size === ids.length ||
          "Each Dependency must occur once.",
      ),
    ),
  ),
  attachments: Schema.optionalKey(
    limitedItems(AttachmentInput, inputLimits.attachmentsPerTask),
  ),
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
// The stored Recurrence is not limited; what a client submits is.
export const RecurrenceInput = Schema.Struct({
  ...Recurrence.fields,
  rrule: Schema.NonEmptyString.check(Schema.isMaxLength(inputLimits.rrule)),
  dtstart: TaskTimeInput,
  exdate: limitedItems(TaskTimeInput, inputLimits.exdates),
});
// An edit resends the stored exclusion dates, which an older Series may hold
// past the limit; the store refuses growth past it instead.
export const RecurrenceEditInput = Schema.Struct({
  ...RecurrenceInput.fields,
  exdate: Schema.Array(TaskTimeInput),
});
export const CreateSeries = Schema.Struct({
  task: CreateTask,
  recurrence: RecurrenceInput,
});
export type CreateSeries = typeof CreateSeries.Type;
export const EditSeries = Schema.Struct({
  from_version: Version,
  changes: TaskPatch,
  recurrence: RecurrenceEditInput,
});
export type EditSeries = typeof EditSeries.Type;

export function resolveTaskCreation(
  input: CreateTask,
  profile: ProfileId,
  id: TaskId,
  occurred_at: Instant,
  attachments?: Task["attachments"],
): Task {
  const { attachments: _references, ...facts } = input;
  return Schema.decodeUnknownSync(Task)({
    description: null,
    project_id: null,
    priority: "P3",
    scheduled_at: null,
    due_at: null,
    energy: null,
    estimate_min: null,
    source: "manual",
    tags: [],
    ...facts,
    ...(attachments === undefined ? {} : { attachments }),
    id,
    profile_id: profile,
    entity_version: 1,
    row_version: 1,
    status: "open",
    occurrence: null,
    created_at: occurred_at,
    updated_at: occurred_at,
    completed_at: null,
    deleted_at: null,
  });
}
