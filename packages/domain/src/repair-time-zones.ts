// Q14, answered by the owner on 2026-11-16 ("A, repair them once"): before follow-up 86 the CLI
// stored a typed due or scheduled time with the time zone UTC instead of the zone of the machine it
// was typed on. This repair gives each such stored instant the machine's zone. The instant stays the
// same; only the zone, and with it the calendar day the time falls on, changes.
//
// History does not say which client set a value: an entry's actor is a credential id, and the
// credentials table records only its kind (Session or Access Token) and, for a token, its name. The
// CLI and both apps sign in with Sessions. So every UTC-zoned due or scheduled instant is a
// candidate, and the dry run is the owner's check.
//
// The plan is pure (planTimeZoneRepair). Applying it (applyTimeZoneRepair) edits each Task through
// TaskCommands.edit, the one write path, with the Version the dry run read: one History entry per
// Task, revertable with Revert, refused as a Conflict when the Task changed since the dry run.
import { Effect, Schema } from "effect";
import { Temporal } from "temporal-polyfill";
import { readTasks, TaskCommands } from "./commands.ts";
import type { Series, Task } from "./entities.ts";
import { ProfileId, TaskId, Version } from "./ids.ts";
import type { OperationStore } from "./store/store.ts";
import {
  CalendarDate,
  Instant,
  TimeZoneId,
  type ZonedInstant,
} from "./time.ts";

export const RepairField = Schema.Literals(["due_at", "scheduled_at"]);
export type RepairField = typeof RepairField.Type;

/** One stored value the repair changes: the same instant, from the zone UTC to `to_zone`. */
export const TimeZoneRepairItem = Schema.Struct({
  task_id: TaskId,
  profile_id: ProfileId,
  title: Schema.String,
  status: Schema.String,
  field: RepairField,
  utc: Instant,
  from_zone: Schema.Literal("UTC"),
  to_zone: TimeZoneId,
  day_before: CalendarDate,
  day_after: CalendarDate,
  from_version: Version,
});
export type TimeZoneRepairItem = typeof TimeZoneRepairItem.Type;

/** A UTC-zoned value the repair leaves as it is, and why. */
export const TimeZoneRepairUnchanged = Schema.Struct({
  reason: Schema.Literals(["closed_task", "series_template"]),
  task_id: Schema.optionalKey(TaskId),
  series_id: Schema.optionalKey(Schema.String),
  profile_id: ProfileId,
  field: RepairField,
  utc: Instant,
});
export type TimeZoneRepairUnchanged = typeof TimeZoneRepairUnchanged.Type;

/** The dry run's report, and the run's input (`--plan`). */
export const TimeZoneRepairPlan = Schema.Struct({
  generated_at: Schema.String,
  dry_run: Schema.Literal(true),
  time_zone: TimeZoneId,
  profiles: Schema.Array(ProfileId),
  include_closed: Schema.Boolean,
  items: Schema.Array(TimeZoneRepairItem),
  not_changed: Schema.Array(TimeZoneRepairUnchanged),
  totals: Schema.Struct({
    tasks: Schema.Int,
    values: Schema.Int,
    not_changed: Schema.Int,
  }),
});
export type TimeZoneRepairPlan = typeof TimeZoneRepairPlan.Type;

export const TimeZoneRepairOutcome = Schema.Literals([
  "changed",
  "already_repaired",
  "conflict",
  "not_found",
  "rejected",
]);
export type TimeZoneRepairOutcome = typeof TimeZoneRepairOutcome.Type;

export const TimeZoneRepairReport = Schema.Struct({
  generated_at: Schema.String,
  dry_run: Schema.Literal(false),
  time_zone: TimeZoneId,
  snapshot_id: Schema.NullOr(Schema.String),
  items: Schema.Array(
    Schema.Struct({
      ...TimeZoneRepairItem.fields,
      outcome: TimeZoneRepairOutcome,
      to_version: Schema.NullOr(Version),
      current_version: Schema.NullOr(Version),
    }),
  ),
  totals: Schema.Struct({
    changed: Schema.Int,
    already_repaired: Schema.Int,
    conflict: Schema.Int,
    not_found: Schema.Int,
    rejected: Schema.Int,
  }),
});
export type TimeZoneRepairReport = typeof TimeZoneRepairReport.Type;

const FIELDS = ["due_at", "scheduled_at"] as const;
const dayIn = (utc: string, zone: string) =>
  Schema.decodeUnknownSync(CalendarDate)(
    Temporal.Instant.from(utc)
      .toZonedDateTimeISO(zone)
      .toPlainDate()
      .toString(),
  );
const utcZoned = (value: Task["due_at"]): value is ZonedInstant =>
  value?.kind === "instant" && value.time_zone === "UTC";
/** The Task states Today and Overdue show; done and cancelled Tasks only with includeClosed. */
const isOpen = (task: Task) =>
  task.status === "open" || task.status === "snoozed";

/**
 * Every due or scheduled instant stored with the zone UTC, in the Tasks given (never deleted or
 * purged ones: the caller passes what an authorized read returns), as the same instant in `zone`.
 * A machine whose own zone is UTC has nothing to repair.
 */
export function planTimeZoneRepair(input: {
  readonly tasks: readonly Task[];
  readonly series: readonly Series[];
  readonly zone: string;
  readonly includeClosed: boolean;
}) {
  const zone = Schema.decodeUnknownSync(TimeZoneId)(input.zone);
  const items: TimeZoneRepairItem[] = [];
  const not_changed: TimeZoneRepairUnchanged[] = [];
  for (const task of input.tasks) {
    if (task.deleted_at !== null) continue;
    for (const field of FIELDS) {
      const value = task[field];
      if (!utcZoned(value)) continue;
      if (!isOpen(task) && !input.includeClosed) {
        not_changed.push({
          reason: "closed_task",
          task_id: task.id,
          profile_id: task.profile_id,
          field,
          utc: value.utc,
        });
        continue;
      }
      if (zone === "UTC") continue;
      items.push({
        task_id: task.id,
        profile_id: task.profile_id,
        title: task.title,
        status: task.status,
        field,
        utc: value.utc,
        from_zone: "UTC",
        to_zone: zone,
        day_before: dayIn(value.utc, "UTC"),
        day_after: dayIn(value.utc, zone),
        from_version: task.row_version,
      });
    }
  }
  // A Series' template keeps the values its next Occurrences are made from. Changing it is a Series
  // edit, whose rebase rewrites the whole template from one Task; that is more than a zone, so the
  // repair lists UTC-zoned templates and leaves them.
  for (const series of input.series) {
    if (series.deleted_at !== null) continue;
    for (const field of FIELDS) {
      const value = series.task[field];
      if (utcZoned(value))
        not_changed.push({
          reason: "series_template",
          series_id: series.id,
          profile_id: series.profile_id,
          field,
          utc: value.utc,
        });
    }
  }
  return {
    time_zone: zone,
    items,
    not_changed,
    totals: {
      tasks: new Set(items.map((item) => item.task_id)).size,
      values: items.length,
      not_changed: not_changed.length,
    },
  };
}

/** The authorized Tasks and Series of one Profile, as an ordinary read sees them. */
export const readRepairInput = Effect.fn(function* (
  store: OperationStore,
  request: { readonly credential: string; readonly profile: ProfileId },
) {
  const data = yield* readTasks(store, request);
  return {
    tasks: data.tasks.filter((task) => task.profile_id === request.profile),
    series: data.series.filter(
      (series) => series.profile_id === request.profile,
    ),
    profiles: data.profiles,
  };
});

/**
 * Applies a reviewed plan. Values already in the plan's zone are left (already_repaired) without a
 * write, so a second run of the same plan changes nothing. The caller takes the Snapshot first and
 * passes it only when some item still needs a write (`needsWrite`).
 */
export const pendingRepairs = (
  plan: TimeZoneRepairPlan,
  current: ReadonlyMap<string, Task>,
) =>
  plan.items.filter((item) => {
    const task = current.get(`${item.profile_id}/${item.task_id}`);
    const value = task?.[item.field];
    return !(
      value?.kind === "instant" &&
      value.utc === item.utc &&
      value.time_zone === item.to_zone
    );
  });

export const applyTimeZoneRepair = Effect.fn(function* (
  store: OperationStore,
  credential: string,
  plan: TimeZoneRepairPlan,
  current: ReadonlyMap<string, Task>,
) {
  const commands = new TaskCommands(store);
  const pending = new Set(pendingRepairs(plan, current));
  const byTask = new Map<string, TimeZoneRepairItem[]>();
  for (const item of plan.items) {
    const key = `${item.profile_id}/${item.task_id}`;
    byTask.set(key, [...(byTask.get(key) ?? []), item]);
  }
  const rows: TimeZoneRepairReport["items"][number][] = [];
  for (const [key, items] of byTask) {
    const task = current.get(key);
    const toWrite = items.filter((item) => pending.has(item));
    for (const item of items)
      if (!pending.has(item))
        rows.push({
          ...item,
          outcome: "already_repaired",
          to_version: null,
          current_version: task?.row_version ?? null,
        });
    if (toWrite.length === 0) continue;
    const first = toWrite[0] as TimeZoneRepairItem;
    const changes = Object.fromEntries(
      toWrite.map((item) => [
        item.field,
        { kind: "instant", utc: item.utc, time_zone: item.to_zone },
      ]),
    );
    const result = yield* commands.edit(
      { credential, profile: first.profile_id, task_id: first.task_id },
      { from_version: first.from_version, changes },
    );
    for (const item of toWrite)
      rows.push(
        result.outcome === "not-found"
          ? {
              ...item,
              outcome: "not_found",
              to_version: null,
              current_version: null,
            }
          : result.outcome === "committed"
            ? {
                ...item,
                outcome: "changed",
                to_version: result.task.row_version,
                current_version: result.task.row_version,
              }
            : {
                ...item,
                outcome: result.reason === "conflict" ? "conflict" : "rejected",
                to_version: null,
                current_version: result.latest?.row_version ?? null,
              },
      );
  }
  const count = (outcome: TimeZoneRepairOutcome) =>
    rows.filter((row) => row.outcome === outcome).length;
  return {
    items: rows,
    totals: {
      changed: count("changed"),
      already_repaired: count("already_repaired"),
      conflict: count("conflict"),
      not_found: count("not_found"),
      rejected: count("rejected"),
    },
  };
});
