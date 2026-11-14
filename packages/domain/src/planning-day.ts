// Which calendar day a planning view is about, and which day a Task's due or
// scheduled time falls on. One rule for planning views, counts and the
// Catalog.
//
// Without a time zone the rule is the one every client has had: today is the
// UTC date of `now`, and an instant falls on its UTC date. With the client's
// time zone, today is the date of `now` there, and an instant falls on its
// date in the zone stored with it (ADR-0006: an instant keeps the zone the
// person meant). A date is a calendar date either way.
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

export type PlanningDay = {
  /** YYYY-MM-DD */
  readonly today: string;
  /** Whether instants fall on their date in their own zone (a zone was given). */
  readonly zoned: boolean;
};

export const planningDay = (now: Instant, timeZone?: string): PlanningDay =>
  timeZone === undefined
    ? { today: now.slice(0, 10), zoned: false }
    : { today: dateIn(now, timeZone), zoned: true };

export const taskDay = (time: TaskTime | null, day: PlanningDay) =>
  time === null
    ? null
    : time.kind === "date"
      ? time.date
      : day.zoned
        ? dateIn(time.utc, time.time_zone)
        : time.utc.slice(0, 10);

export type PlanningTask = Pick<Task, "status" | "due_at" | "scheduled_at">;

/** The planning views an open Task belongs to on a day. */
export const planningMembership = (task: PlanningTask, day: PlanningDay) => {
  const open = task.status === "open";
  const due = taskDay(task.due_at, day);
  const scheduled = taskDay(task.scheduled_at, day);
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
