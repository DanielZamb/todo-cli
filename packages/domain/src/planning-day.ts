// Which calendar day a planning view is about, and which day a Task's due or
// scheduled time falls on. One rule for planning views, counts, the Catalog
// and the CLI's Today and Overdue (ADR-0006, amended 2026-11-13):
//
// Today is the date of `now` in the zone sent with the read, or, when none is
// sent, in the reader's own zone: the server process's zone for HTTP, the
// machine's zone for the CLI (processTimeZone). An instant falls on its date
// in the zone stored with it (an instant keeps the zone the person meant). A
// date is a calendar date.
import { Schema } from "effect";
import type { Task } from "./entities.ts";
import { type Instant, type TaskTime, TimeZoneId } from "./time.ts";

/** A time zone that is not an IANA name the runtime knows. Exit 2, invalid_args. */
export class UnknownTimeZone extends Error {
  readonly _tag = "UnknownTimeZone";
  readonly code = "invalid_args";
  constructor(readonly timeZone: string) {
    super(
      `Unknown time zone ${JSON.stringify(timeZone)}; send an IANA name such as America/Bogota.`,
    );
  }
}
export const checkTimeZone = (timeZone: string | undefined) =>
  timeZone === undefined || Schema.is(TimeZoneId)(timeZone)
    ? undefined
    : new UnknownTimeZone(timeZone);

const formatters = new Map<string, Intl.DateTimeFormat>();
const dateIn = (utc: string, timeZone: string) => {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, format);
  }
  return format.format(new Date(utc));
};

/**
 * The IANA zone of this process: what Intl resolves, which is the TZ
 * environment variable when set and the system zone otherwise. A value the
 * runtime cannot name (Etc/Unknown, an offset string) falls back to UTC.
 */
export const processTimeZone = (): string => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof zone === "string" && Schema.is(TimeZoneId)(zone) ? zone : "UTC";
};

export type PlanningDay = {
  /** YYYY-MM-DD */
  readonly today: string;
  /** The zone today was taken in: the one sent, or the reader's own. */
  readonly timeZone: string;
};

/** Today in the sent zone, or in the reader's own zone when none is sent. */
export const planningDay = (
  now: Instant,
  sent: string | undefined,
  own: string,
): PlanningDay => {
  const timeZone = sent ?? own;
  return { today: dateIn(now, timeZone), timeZone };
};

/** The calendar day a due or scheduled time falls on. */
export const taskDay = (time: TaskTime | null) =>
  time === null
    ? null
    : time.kind === "date"
      ? time.date
      : dateIn(time.utc, time.time_zone);

/** The day of each Task's due and scheduled times, by id, for the CLI's flat views. */
export type PlanningClock = {
  readonly day: PlanningDay;
  readonly days: ReadonlyMap<
    string,
    { readonly due: string | null; readonly scheduled: string | null }
  >;
};
export const planningClock = (
  tasks: readonly Pick<Task, "id" | "due_at" | "scheduled_at">[],
  day: PlanningDay,
): PlanningClock => ({
  day,
  days: new Map(
    tasks.map((task) => [
      task.id,
      { due: taskDay(task.due_at), scheduled: taskDay(task.scheduled_at) },
    ]),
  ),
});

export type PlanningTask = Pick<Task, "status" | "due_at" | "scheduled_at">;

/** The planning views an open Task belongs to on a day. */
export const planningMembership = (task: PlanningTask, day: PlanningDay) => {
  const open = task.status === "open";
  const due = taskDay(task.due_at);
  const scheduled = taskDay(task.scheduled_at);
  const overdue = open && due !== null && due < day.today;
  const dueToday = open && due === day.today;
  const scheduledToday = open && scheduled === day.today;
  return {
    open,
    overdue,
    dueToday,
    scheduledToday,
    today: overdue || dueToday || scheduledToday,
    scheduled: open && task.scheduled_at !== null,
    inbox: open && task.due_at === null && task.scheduled_at === null,
  };
};
export type PlanningMembership = ReturnType<typeof planningMembership>;
