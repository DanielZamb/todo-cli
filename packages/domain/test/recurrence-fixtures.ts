import { Schema } from "effect";
import {
  Instant,
  OccurrenceId,
  Recurrence,
  Series,
  TaskId,
  Version,
} from "../src/index.ts";
import { actor, profile, task, time } from "./store-fixtures.ts";

export const instant = Schema.decodeUnknownSync(Instant);
export const taskId = Schema.decodeUnknownSync(TaskId);
export const occurrenceId = Schema.decodeUnknownSync(OccurrenceId);
export const version = Schema.decodeUnknownSync(Version);
export const recurrence = Schema.decodeUnknownSync(Recurrence);
export const weekly = Schema.decodeUnknownSync(Series)({
  id: "weekdays",
  profile_id: profile,
  entity_version: 1,
  row_version: 1,
  recurrence: {
    dtstart: {
      kind: "instant",
      utc: "2026-03-06T14:00:00Z",
      time_zone: "America/New_York",
    },
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=4",
    exdate: [
      {
        kind: "instant",
        utc: "2026-03-10T13:00:00Z",
        time_zone: "America/New_York",
      },
    ],
  },
  task: { ...task, title: "Weekday review", due_at: null, scheduled_at: null },
  created_at: time,
  updated_at: time,
  deleted_at: null,
});
export const monthly = Schema.decodeUnknownSync(Series)({
  ...weekly,
  id: "monthly",
  task: { ...weekly.task, title: "Monthly review" },
  recurrence: {
    dtstart: { kind: "date", date: "2026-01-30" },
    rrule: "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3",
    exdate: [],
  },
});
export const start = (series: Series, id: string) => ({
  actor,
  profile,
  series,
  task_id: taskId(id),
  occurrence_id: occurrenceId(`occ-${id}`),
  occurred_at: time,
});
export const finish = (
  id: string,
  next: string,
  action: "complete" | "cancel" = "complete",
  from = 1,
) => ({
  actor,
  profile,
  task_id: taskId(id),
  from_version: version(from),
  action,
  occurred_at: time,
  next_task_id: taskId(next),
  next_occurrence_id: occurrenceId(`occ-${next}`),
});
