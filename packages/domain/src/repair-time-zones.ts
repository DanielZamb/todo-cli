// Q14, answered by the owner on 2026-11-16 ("A, repair them once"): before follow-up 86 the CLI
// stored a typed due or scheduled time with the time zone UTC instead of the zone of the machine it
// was typed on. This repair gives each such stored value the machine's zone.
//
// Two readings, chosen by the owner (server seat F3): a time typed bare ("2026-11-16 21:00") was
// stored as that clock time in UTC, five hours early for Bogotá; a time typed with an offset or `Z`
// was stored at the right instant with the wrong zone. History cannot tell them apart.
// - "moment" keeps the stored instant: right for a time typed with an offset or Z.
// - "clock" keeps the clock time as typed, in the machine's zone, so the instant moves by the
//   offset: right for a time typed bare. A clock time the zone skips or repeats is refused for that
//   Task, as follow-up 86 refuses it.
// The dry run shows each value under both readings; `--task` limits a run to named Tasks, so one
// reading can go to some Tasks and the other to the rest.
//
// History does not say which client set a value: an entry's actor is a credential id, and the
// credentials table records only its kind (Session or Access Token) and, for a token, its name. The
// CLI and both apps sign in with Sessions. So every UTC-zoned due or scheduled instant is a
// candidate, and the dry run is the owner's check.
//
// The plan is pure (planTimeZoneRepair). A run is bound to it (checkPlan, server seat F1): every
// item must still be stored as that instant with the zone UTC and equal what a fresh dry run with
// the plan's options makes, in the same order, or the whole plan is refused before any Snapshot or
// write. Applying it (applyTimeZoneRepair) edits each Task through TaskCommands.edit, the one write
// path, with the Version the dry run read: one History entry per Task, revertable with Revert,
// refused as a Conflict when the Task changed since the dry run.
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
export const RepairReading = Schema.Literals(["moment", "clock"]);
export type RepairReading = typeof RepairReading.Type;
/** A local date and time, "YYYY-MM-DD HH:MM", in a named zone. */
const LocalTime = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
);

/** One stored value the repair changes, with what it shows under each reading. */
export const TimeZoneRepairItem = Schema.Struct({
  task_id: TaskId,
  profile_id: ProfileId,
  title: Schema.String,
  status: Schema.String,
  field: RepairField,
  stored_utc: Instant,
  from_zone: Schema.Literal("UTC"),
  to_zone: TimeZoneId,
  /** What a client shows today: the stored instant in its stored zone, UTC. */
  shown_before: LocalTime,
  /** "same moment": the stored instant, in the machine's zone. */
  as_moment: LocalTime,
  /** "same clock time": the hours and minutes as stored, in the machine's zone. */
  as_clock: LocalTime,
  keep: RepairReading,
  new_utc: Instant,
  day_before: CalendarDate,
  day_after: CalendarDate,
  from_version: Version,
});
export type TimeZoneRepairItem = typeof TimeZoneRepairItem.Type;

/** A UTC-zoned value the repair leaves as it is, and why. */
export const TimeZoneRepairUnchanged = Schema.Struct({
  reason: Schema.Literals([
    "closed_task",
    "series_template",
    "clock_time_does_not_exist",
    "clock_time_repeats",
  ]),
  task_id: Schema.optionalKey(TaskId),
  series_id: Schema.optionalKey(Schema.String),
  profile_id: ProfileId,
  field: RepairField,
  stored_utc: Instant,
  message: Schema.optionalKey(Schema.String),
});
export type TimeZoneRepairUnchanged = typeof TimeZoneRepairUnchanged.Type;

/** The dry run's report, and the run's input (`--plan`): its options bind the run. */
export const TimeZoneRepairPlan = Schema.Struct({
  generated_at: Schema.String,
  dry_run: Schema.Literal(true),
  time_zone: TimeZoneId,
  keep: RepairReading,
  profiles: Schema.Array(ProfileId),
  include_closed: Schema.Boolean,
  tasks: Schema.NullOr(Schema.Array(TaskId)),
  items: Schema.Array(TimeZoneRepairItem),
  not_changed: Schema.Array(TimeZoneRepairUnchanged),
  totals: Schema.Struct({
    tasks: Schema.Int,
    values: Schema.Int,
    not_changed: Schema.Int,
    series_templates: Schema.Int,
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
  keep: RepairReading,
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

export type RepairOptions = {
  readonly zone: string;
  readonly keep: RepairReading;
  readonly includeClosed: boolean;
  /** Only these Tasks, in any Profile planned; null for every Task. */
  readonly tasks: readonly TaskId[] | null;
};

const FIELDS = ["due_at", "scheduled_at"] as const;
const local = (zoned: Temporal.ZonedDateTime) =>
  `${zoned.toPlainDate().toString()} ${zoned.toPlainTime().toString({ smallestUnit: "minute" })}`;
const instantOf = (zoned: Temporal.ZonedDateTime) =>
  Schema.decodeUnknownSync(Instant)(
    zoned.toInstant().toString({ fractionalSecondDigits: 3 }),
  );
const utcZoned = (value: Task["due_at"]): value is ZonedInstant =>
  value?.kind === "instant" && value.time_zone === "UTC";
/** The Task states Today and Overdue show; done and cancelled Tasks only with includeClosed. */
const isOpen = (task: Task) =>
  task.status === "open" || task.status === "snoozed";

/**
 * The stored instant under both readings in `zone`. "Clock" reads the stored clock time (in UTC)
 * as a clock time in `zone`; a time the zone skips or repeats there is refused, as follow-up 86
 * refuses it when typed.
 */
export function readings(storedUtc: string, zone: string) {
  const stored = Temporal.Instant.from(storedUtc);
  const before = stored.toZonedDateTimeISO("UTC");
  const moment = stored.toZonedDateTimeISO(zone);
  const wall = before.toPlainDateTime();
  let clock: Temporal.ZonedDateTime | undefined;
  let refused:
    | {
        reason: "clock_time_does_not_exist" | "clock_time_repeats";
        message: string;
      }
    | undefined;
  try {
    clock = wall.toZonedDateTime(zone, { disambiguation: "reject" });
  } catch {
    const earlier = wall.toZonedDateTime(zone, { disambiguation: "earlier" });
    const skipped = !earlier.toPlainDateTime().equals(wall);
    const typed = local(before);
    refused = skipped
      ? {
          reason: "clock_time_does_not_exist",
          message: `${typed} does not exist in ${zone}: a daylight-saving change skips it on ${wall.toPlainDate()}. Repair this Task with --keep moment, or edit it by hand.`,
        }
      : {
          reason: "clock_time_repeats",
          message: `${typed} occurs twice in ${zone}: a daylight-saving change repeats it on ${wall.toPlainDate()}. Repair this Task with --keep moment, or edit it by hand.`,
        };
  }
  return {
    shown_before: local(before),
    as_moment: local(moment),
    // A refused clock reading shows the wall time it would have meant.
    as_clock: clock ? local(clock) : local(before),
    moment: { utc: instantOf(moment), day: moment.toPlainDate().toString() },
    clock: clock
      ? { utc: instantOf(clock), day: clock.toPlainDate().toString() }
      : undefined,
    refused,
    day_before: before.toPlainDate().toString(),
  };
}

/**
 * Every due or scheduled instant stored with the zone UTC, in the Tasks given (never deleted or
 * purged ones: the caller passes what an authorized read returns), with its new value under the
 * chosen reading in `zone`. A machine whose own zone is UTC has nothing to repair.
 */
export function planTimeZoneRepair(input: {
  readonly tasks: readonly Task[];
  readonly series: readonly Series[];
  readonly options: RepairOptions;
}) {
  const { options } = input;
  const zone = Schema.decodeUnknownSync(TimeZoneId)(options.zone);
  const wanted = options.tasks === null ? null : new Set(options.tasks);
  const items: TimeZoneRepairItem[] = [];
  const not_changed: TimeZoneRepairUnchanged[] = [];
  for (const task of input.tasks) {
    if (task.deleted_at !== null) continue;
    if (wanted && !wanted.has(task.id)) continue;
    for (const field of FIELDS) {
      const value = task[field];
      if (!utcZoned(value)) continue;
      const row = {
        task_id: task.id,
        profile_id: task.profile_id,
        field,
        stored_utc: value.utc,
      };
      if (!isOpen(task) && !options.includeClosed) {
        not_changed.push({ reason: "closed_task", ...row });
        continue;
      }
      if (zone === "UTC") continue;
      const read = readings(value.utc, zone);
      const chosen = options.keep === "moment" ? read.moment : read.clock;
      if (!chosen) {
        not_changed.push({
          ...row,
          ...(read.refused as NonNullable<typeof read.refused>),
        });
        continue;
      }
      items.push(
        Schema.decodeUnknownSync(TimeZoneRepairItem)({
          ...row,
          title: task.title,
          status: task.status,
          from_zone: "UTC",
          to_zone: zone,
          shown_before: read.shown_before,
          as_moment: read.as_moment,
          as_clock: read.as_clock,
          keep: options.keep,
          new_utc: chosen.utc,
          day_before: read.day_before,
          day_after: chosen.day,
          from_version: task.row_version,
        }),
      );
    }
  }
  // One order a later edit of a Task cannot change (the list order follows priority): by the stored
  // instant, then Profile, Task and field. A plan in another order is refused (checkPlan).
  items.sort((a, b) =>
    `${a.stored_utc} ${a.profile_id} ${a.task_id} ${a.field}`.localeCompare(
      `${b.stored_utc} ${b.profile_id} ${b.task_id} ${b.field}`,
    ),
  );
  // A Series' template keeps the values its next Occurrences are made from. Changing it is a Series
  // edit, whose rebase rewrites the whole template from one Task; that is more than a zone, so the
  // repair lists every UTC-zoned template and leaves it: a repaired Occurrence's next Occurrence
  // comes back with the zone UTC until its template is edited.
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
          stored_utc: value.utc,
        });
    }
  }
  return {
    time_zone: zone,
    keep: options.keep,
    include_closed: options.includeClosed,
    tasks: options.tasks === null ? null : [...options.tasks],
    items,
    not_changed,
    totals: {
      tasks: new Set(items.map((item) => item.task_id)).size,
      values: items.length,
      not_changed: not_changed.length,
      series_templates: not_changed.filter(
        (row) => row.reason === "series_template",
      ).length,
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
  };
});

const key = (item: { profile_id: string; task_id: string; field: string }) =>
  `${item.profile_id}/${item.task_id}/${item.field}`;
/** What binds an item to the stored data: everything but the descriptive title and status and the Version (a Task changed since the dry run is a Conflict, not a different plan). */
const BINDING = [
  "task_id",
  "profile_id",
  "field",
  "stored_utc",
  "from_zone",
  "to_zone",
  "shown_before",
  "as_moment",
  "as_clock",
  "keep",
  "new_utc",
  "day_before",
  "day_after",
] as const;
const alreadyApplied = (
  item: TimeZoneRepairItem,
  current: ReadonlyMap<string, Task>,
) => {
  const value = current.get(`${item.profile_id}/${item.task_id}`)?.[item.field];
  return (
    value?.kind === "instant" &&
    value.utc === item.new_utc &&
    value.time_zone === item.to_zone
  );
};

/**
 * Server seat F1: a run applies exactly the dry run the owner read. `fresh` is a dry run made now
 * with the plan's own options from the same stored data. Items already applied (stored as their new
 * value) are left; every other item must be stored as that instant with the zone UTC and equal the
 * fresh item at the same place, and the fresh dry run must have nothing more. Returns null when the
 * plan holds, or the reason naming the first item that differs.
 */
export function checkPlan(
  plan: TimeZoneRepairPlan,
  zone: string,
  fresh: ReturnType<typeof planTimeZoneRepair>,
  current: ReadonlyMap<string, Task>,
): string | null {
  if (plan.time_zone !== zone)
    return `The plan was made for the time zone ${plan.time_zone}; this machine's is ${zone}. Make a new dry run here.`;
  const pending = plan.items.filter((item) => !alreadyApplied(item, current));
  for (const [index, item] of plan.items.entries()) {
    const name = `item ${index + 1} (Task ${item.task_id}, ${item.field})`;
    if (item.to_zone !== plan.time_zone || item.keep !== plan.keep)
      return `${name} names the zone ${item.to_zone} or the reading ${item.keep}, not the plan's ${plan.time_zone} and ${plan.keep}.`;
    if (alreadyApplied(item, current)) continue;
    const value = current.get(`${item.profile_id}/${item.task_id}`)?.[
      item.field
    ];
    if (
      !(
        value?.kind === "instant" &&
        value.utc === item.stored_utc &&
        value.time_zone === "UTC"
      )
    )
      return `${name} is not stored as ${item.stored_utc} with the zone UTC.`;
  }
  for (const [index, item] of pending.entries()) {
    const expected = fresh.items[index];
    const name = `item ${plan.items.indexOf(item) + 1} (Task ${item.task_id}, ${item.field})`;
    if (!expected)
      return `${name} is not in a dry run made now with the plan's options.`;
    const differs = BINDING.filter((field) => item[field] !== expected[field]);
    if (differs.length)
      return key(expected) === key(item)
        ? `${name} differs from a dry run made now in ${differs.join(", ")}.`
        : `${name} is not where a dry run made now has it (there: Task ${expected.task_id}, ${expected.field}).`;
  }
  const extra = fresh.items[pending.length];
  if (extra)
    return `A dry run made now also lists Task ${extra.task_id}, ${extra.field}, which the plan does not.`;
  return null;
}

/** The items a run still writes: those not already stored as their new value. */
export const pendingRepairs = (
  plan: TimeZoneRepairPlan,
  current: ReadonlyMap<string, Task>,
) => plan.items.filter((item) => !alreadyApplied(item, current));
/** Pending items whose Task is still at the Version the dry run read: the only ones a run can write, so the Snapshot is taken only when there is one. */
export const writableRepairs = (
  plan: TimeZoneRepairPlan,
  current: ReadonlyMap<string, Task>,
) =>
  pendingRepairs(plan, current).filter(
    (item) =>
      current.get(`${item.profile_id}/${item.task_id}`)?.row_version ===
      item.from_version,
  );

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
    // Changed since the dry run: a Conflict, reported without an edit (nothing written). A change
    // between this read and the write is still refused by the edit's own Version check.
    if (task && task.row_version !== first.from_version) {
      for (const item of toWrite)
        rows.push({
          ...item,
          outcome: "conflict",
          to_version: null,
          current_version: task.row_version,
        });
      continue;
    }
    const changes = Object.fromEntries(
      toWrite.map((item) => [
        item.field,
        { kind: "instant", utc: item.new_utc, time_zone: item.to_zone },
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
