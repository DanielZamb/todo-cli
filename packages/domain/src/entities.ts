import { Schema } from "effect";
import { Attachment } from "./attachments.ts";
import {
  OccurrenceId,
  ProfileId,
  ProjectId,
  SeriesId,
  TagId,
  TaskId,
  Version,
} from "./ids.ts";
import { CalendarDate, Instant, TaskTime } from "./time.ts";

export const TaskStatus = Schema.Literals([
  "open",
  "done",
  "cancelled",
  "snoozed",
]);
export type TaskStatus = typeof TaskStatus.Type;

export const TaskPriority = Schema.Literals(["P1", "P2", "P3", "P4"]);
export type TaskPriority = typeof TaskPriority.Type;

export const Profile = Schema.Struct({
  id: ProfileId,
  name: Schema.NonEmptyString,
  created_at: Instant,
  updated_at: Instant,
});
export type Profile = typeof Profile.Type;

export const Project = Schema.Struct({
  id: ProjectId,
  profile_id: ProfileId,
  name: Schema.NonEmptyString,
  created_at: Instant,
  updated_at: Instant,
});
export type Project = typeof Project.Type;

export const Tag = Schema.Struct({
  id: TagId,
  profile_id: ProfileId,
  name: Schema.NonEmptyString,
});
export type Tag = typeof Tag.Type;

export const Recurrence = Schema.Struct({
  dtstart: TaskTime,
  rrule: Schema.NonEmptyString,
  exdate: Schema.Array(TaskTime),
});
export type Recurrence = typeof Recurrence.Type;

export const TaskDetails = Schema.Struct({
  title: Schema.NonEmptyString,
  description: Schema.NullOr(Schema.String),
  project_id: Schema.NullOr(ProjectId),
  priority: TaskPriority,
  scheduled_at: Schema.NullOr(TaskTime),
  due_at: Schema.NullOr(TaskTime),
  energy: Schema.NullOr(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 })),
  ),
  estimate_min: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
  source: Schema.NonEmptyString,
  tags: Schema.Array(TagId),
});
export type TaskDetails = typeof TaskDetails.Type;

export const Series = Schema.Struct({
  id: SeriesId,
  profile_id: ProfileId,
  entity_version: Schema.Literal(1),
  row_version: Version,
  recurrence: Recurrence,
  task: TaskDetails,
  created_at: Instant,
  updated_at: Instant,
  deleted_at: Schema.NullOr(Instant),
});
export type Series = typeof Series.Type;

export const OccurrenceOrigin = Schema.Struct({
  id: OccurrenceId,
  series_id: SeriesId,
  date: CalendarDate,
  time: Schema.optionalKey(TaskTime),
});
export type OccurrenceOrigin = typeof OccurrenceOrigin.Type;

export const Task = Schema.Struct({
  ...TaskDetails.fields,
  attachments: Schema.optionalKey(Schema.Array(Attachment)),
  external_id: Schema.optionalKey(
    Schema.NullOr(Schema.NonEmptyString.check(Schema.isPattern(/\S/))),
  ),
  id: TaskId,
  profile_id: ProfileId,
  entity_version: Schema.Literal(1),
  row_version: Version,
  status: TaskStatus,
  occurrence: Schema.NullOr(OccurrenceOrigin),
  legacy_series_detached: Schema.optionalKey(Schema.Literal(true)),
  created_at: Instant,
  updated_at: Instant,
  completed_at: Schema.NullOr(Instant),
  deleted_at: Schema.NullOr(Instant),
});
export type Task = typeof Task.Type;

export const seriesForTask = (task: Task, series: readonly Series[]) => {
  const id =
    task.occurrence?.series_id ??
    (task.legacy_series_detached ? null : `legacy-series:${task.id}`);
  return (
    series.find(
      (series) => series.profile_id === task.profile_id && series.id === id,
    ) ?? null
  );
};

export const Occurrence = Schema.Struct({
  ...Task.fields,
  occurrence: OccurrenceOrigin,
});
export type Occurrence = typeof Occurrence.Type;
