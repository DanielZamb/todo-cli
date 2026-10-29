import { Effect, Schema } from "effect";
import { RRuleTemporal } from "rrule-temporal";
import { Temporal } from "temporal-polyfill";
import {
  Occurrence,
  Project,
  Recurrence,
  Series,
  Tag,
  Task,
  type TaskDetails,
} from "./entities.ts";
import { ActorId, OccurrenceId, ProfileId, TaskId, Version } from "./ids.ts";
import { CalendarDate, Instant, TaskTime } from "./time.ts";

export const StartSeries = Schema.Struct({
  external_id: Task.fields.external_id,
  actor: ActorId,
  profile: ProfileId,
  series: Series,
  project: Schema.optionalKey(Schema.NullOr(Project)),
  tags: Schema.optionalKey(Schema.Array(Tag)),
  task_id: TaskId,
  occurrence_id: OccurrenceId,
  occurred_at: Instant,
});
export type StartSeries = typeof StartSeries.Type;

export const FinishTask = Schema.Struct({
  actor: ActorId,
  profile: ProfileId,
  task_id: TaskId,
  from_version: Version,
  action: Schema.Literals(["complete", "cancel"]),
  occurred_at: Instant,
  next_task_id: TaskId,
  next_occurrence_id: OccurrenceId,
});
export type FinishTask = typeof FinishTask.Type;

export class RecurrenceError extends Error {
  readonly _tag = "RecurrenceError";
  constructor(override readonly cause: unknown) {
    super(String(cause));
  }
}

const zoned = (value: TaskTime) =>
  value.kind === "date"
    ? Temporal.PlainDate.from(value.date).toZonedDateTime("UTC")
    : Temporal.Instant.from(value.utc).toZonedDateTimeISO(value.time_zone);

const compact = (value: string) => value.replace(/[-:]/g, "");
const property = (name: string, value: TaskTime) => {
  if (value.kind === "date") return `${name};VALUE=DATE:${compact(value.date)}`;
  const local = zoned(value).toPlainDateTime();
  if (local.millisecond || local.microsecond || local.nanosecond)
    throw new Error("RFC 5545 recurrence times require whole seconds");
  if (name === "EXDATE")
    return `${name}:${compact(zoned(value).toInstant().toString())}`;
  if (
    local.toZonedDateTime(value.time_zone).epochNanoseconds !==
    zoned(value).epochNanoseconds
  )
    throw new Error(
      "DTSTART must use the first instant of an ambiguous local time",
    );
  return `${name};TZID=${value.time_zone}:${compact(local.toString({ smallestUnit: "second" }))}`;
};

function rule(input: Recurrence) {
  const value = Schema.decodeUnknownSync(Recurrence)(input);
  const body = value.rrule.replace(/^RRULE:/i, "").toUpperCase();
  const names = new Set<string>();
  for (const part of body.split(";")) {
    if (!/^[A-Z]+=[A-Z0-9,+-]+$/.test(part))
      throw new Error("Expected one RFC 5545 RRULE");
    const name = part.slice(0, part.indexOf("="));
    if (names.has(name)) throw new Error(`Repeated RRULE part: ${name}`);
    names.add(name);
  }
  if (!names.has("FREQ")) throw new Error("RRULE requires FREQ");
  if (
    value.dtstart.kind === "date" &&
    /(?:^|;)(?:FREQ=(?:HOURLY|MINUTELY|SECONDLY)|BYHOUR=|BYMINUTE=|BYSECOND=)/.test(
      body,
    )
  )
    throw new Error("Date recurrence cannot select times");
  for (const excluded of value.exdate)
    if (excluded.kind !== value.dtstart.kind)
      throw new Error("EXDATE must have the DTSTART value kind");
  return new RRuleTemporal({
    temporal: Temporal,
    rruleString: [
      property("DTSTART", value.dtstart),
      `RRULE:${body}`,
      ...value.exdate.map((date) => property("EXDATE", date)),
    ].join("\n"),
    strict: true,
    maxIterations: 100_000,
    maxCandidateEvaluations: 1_000_000,
  });
}

export function resolveNextTime(
  input: Recurrence,
  after: TaskTime | null,
): TaskTime | null {
  if (after !== null && after.kind !== input.dtstart.kind)
    throw new Error("Recurrence cursor must have the DTSTART value kind");
  const next = rule(input).next(zoned(after ?? input.dtstart), after === null);
  if (!next) return null;
  return Schema.decodeUnknownSync(TaskTime)(
    input.dtstart.kind === "date"
      ? { kind: "date", date: next.toPlainDate().toString() }
      : {
          kind: "instant",
          utc: next.toInstant().toString(),
          time_zone: input.dtstart.time_zone,
        },
  );
}

export const nextOccurrenceTime = (
  input: Recurrence,
  after: TaskTime | null = null,
) =>
  Effect.try({
    try: () => resolveNextTime(input, after),
    catch: (cause) => new RecurrenceError(cause),
  });

export const occurrenceDate = (time: TaskTime): CalendarDate =>
  Schema.decodeUnknownSync(CalendarDate)(zoned(time).toPlainDate().toString());

export function occurrenceCursor(
  series: Series,
  occurrence: Occurrence["occurrence"],
): TaskTime {
  if (occurrence.time !== undefined) return occurrence.time;
  const start = series.recurrence.dtstart;
  return Schema.decodeUnknownSync(TaskTime)(
    start.kind === "date"
      ? { kind: "date", date: occurrence.date }
      : {
          kind: "instant",
          utc: Temporal.PlainDate.from(occurrence.date)
            .toPlainDateTime(zoned(start).toPlainTime())
            .toZonedDateTime(start.time_zone)
            .toInstant()
            .toString(),
          time_zone: start.time_zone,
        },
  );
}

function shift(
  value: TaskTime | null,
  start: TaskTime,
  next: TaskTime,
): TaskTime | null {
  if (value === null) return null;
  const before = zoned(start).toPlainDateTime();
  const after = zoned(next).toPlainDateTime();
  const duration = before.until(after, { largestUnit: "day" });
  const shifted =
    value.kind === "date"
      ? {
          kind: "date",
          date: Temporal.PlainDate.from(value.date)
            .add({ days: before.toPlainDate().until(after.toPlainDate()).days })
            .toString(),
        }
      : {
          kind: "instant",
          utc: zoned(value)
            .toPlainDateTime()
            .add(duration)
            .toZonedDateTime(value.time_zone)
            .toInstant()
            .toString(),
          time_zone: value.time_zone,
        };
  return Schema.decodeUnknownSync(TaskTime)(shifted);
}

export function rebaseTaskDetails(
  task: TaskDetails,
  from: TaskTime,
  to: TaskTime,
): TaskDetails {
  return {
    ...task,
    scheduled_at: shift(task.scheduled_at, from, to),
    due_at: shift(task.due_at, from, to),
  };
}

export function resolveOccurrence(input: {
  readonly external_id?: Task["external_id"];
  readonly series: Series;
  readonly time: TaskTime;
  readonly task_id: TaskId;
  readonly occurrence_id: OccurrenceId;
  readonly occurred_at: Instant;
}): Occurrence {
  const { series, time } = input;
  return Schema.decodeUnknownSync(Occurrence)({
    ...series.task,
    ...(input.external_id === undefined
      ? {}
      : { external_id: input.external_id }),
    id: input.task_id,
    profile_id: series.profile_id,
    entity_version: 1,
    row_version: 1,
    status: "open",
    occurrence: {
      id: input.occurrence_id,
      series_id: series.id,
      date: occurrenceDate(time),
      time,
    },
    scheduled_at:
      series.task.scheduled_at === null && series.task.due_at === null
        ? time
        : shift(series.task.scheduled_at, series.recurrence.dtstart, time),
    due_at: shift(series.task.due_at, series.recurrence.dtstart, time),
    created_at: input.occurred_at,
    updated_at: input.occurred_at,
    completed_at: null,
    deleted_at: null,
  });
}
