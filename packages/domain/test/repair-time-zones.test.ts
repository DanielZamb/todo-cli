// Q14 (the owner, 2026-11-16) and the server seat's F1 and F3 on d5af970d: the repair plan for due
// and scheduled instants stored with the zone UTC, under both readings, and the binding of a run
// to the plan.
// - "moment" keeps the stored instant; "clock" keeps the stored clock time in the machine's zone.
// - Only open and snoozed Tasks unless closed ones are asked for; never a date, a value already
//   zoned, a deleted Task; Series templates listed, not changed; a clock time the zone skips or
//   repeats refused for that Task.
// - checkPlan refuses any plan that is not exactly a dry run made now with the plan's options.
import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { Series, Task } from "../src/entities.ts";
import {
  checkPlan,
  planTimeZoneRepair,
  type RepairOptions,
  TimeZoneRepairPlan,
} from "../src/repair-time-zones.ts";

const utc = (at: string) => ({ kind: "instant", utc: at, time_zone: "UTC" });
const task = (id: string, extra: Record<string, unknown>) =>
  Schema.decodeUnknownSync(Task)({
    id,
    profile_id: "fixture-profile",
    entity_version: 1,
    row_version: 3,
    title: id,
    description: null,
    project_id: null,
    priority: "P3",
    status: "open",
    scheduled_at: null,
    due_at: null,
    energy: null,
    estimate_min: null,
    source: "cli",
    tags: [],
    attachments: [],
    external_id: null,
    occurrence: null,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    completed_at: null,
    deleted_at: null,
    ...extra,
  });
// Typed bare in Bogotá before follow-up 86, so stored as that clock time in UTC.
const tasks = [
  task("evening", { due_at: utc("2026-11-16T21:00:00.000Z") }), // typed 2026-11-16 21:00
  task("night", { due_at: utc("2026-11-17T03:00:00.000Z") }), // typed 2026-11-17 03:00
  task("both", {
    due_at: utc("2026-11-18T02:00:00.000Z"),
    scheduled_at: utc("2026-11-17T01:30:00.000Z"),
  }),
  task("dated", { due_at: { kind: "date", date: "2026-11-16" } }),
  task("already", {
    due_at: {
      kind: "instant",
      utc: "2026-11-17T02:00:00.000Z",
      time_zone: "America/Bogota",
    },
  }),
  task("done", {
    status: "done",
    completed_at: "2026-11-15T00:00:00.000Z",
    due_at: utc("2026-11-15T01:00:00.000Z"),
  }),
  task("deleted", {
    deleted_at: "2026-11-15T00:00:00.000Z",
    due_at: utc("2026-11-15T01:00:00.000Z"),
  }),
];
const series = [
  Schema.decodeUnknownSync(Series)({
    id: "fixture-series",
    profile_id: "fixture-profile",
    entity_version: 1,
    row_version: 1,
    recurrence: {
      dtstart: {
        kind: "instant",
        utc: "2026-11-17T02:00:00.000Z",
        time_zone: "America/Bogota",
      },
      rrule: "FREQ=DAILY",
      exdate: [],
    },
    task: {
      title: "Template",
      description: null,
      project_id: null,
      priority: "P3",
      scheduled_at: null,
      due_at: utc("2026-11-16T21:00:00.000Z"),
      energy: null,
      estimate_min: null,
      source: "cli",
      tags: [],
    },
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    deleted_at: null,
  }),
];
const options = (
  zone: string,
  keep: "moment" | "clock",
  extra: Partial<RepairOptions> = {},
) => ({
  zone,
  keep,
  includeClosed: false,
  tasks: null,
  ...extra,
});
const lines = (
  zone: string,
  keep: "moment" | "clock",
  extra: Partial<RepairOptions> = {},
) => {
  const plan = planTimeZoneRepair({
    tasks,
    series,
    options: options(zone, keep, extra),
  });
  return {
    items: plan.items.map(
      (item) =>
        `${item.task_id} ${item.field}: shown ${item.shown_before} UTC | moment ${item.as_moment} | clock ${item.as_clock} | ${item.keep} -> ${item.new_utc} ${item.to_zone}, day ${item.day_before}->${item.day_after}`,
    ),
    not_changed: plan.not_changed.map(
      (row) =>
        `${row.reason} ${row.task_id ?? row.series_id} ${row.field} ${row.stored_utc}`,
    ),
    totals: plan.totals,
  };
};

it("Bogotá, same moment: 21:00 typed shows 16:00; 03:00 typed moves to 22:00 the day before", () => {
  expect(lines("America/Bogota", "moment")).toEqual({
    items: [
      "evening due_at: shown 2026-11-16 21:00 UTC | moment 2026-11-16 16:00 | clock 2026-11-16 21:00 | moment -> 2026-11-16T21:00:00.000Z America/Bogota, day 2026-11-16->2026-11-16",
      "both scheduled_at: shown 2026-11-17 01:30 UTC | moment 2026-11-16 20:30 | clock 2026-11-17 01:30 | moment -> 2026-11-17T01:30:00.000Z America/Bogota, day 2026-11-17->2026-11-16",
      "night due_at: shown 2026-11-17 03:00 UTC | moment 2026-11-16 22:00 | clock 2026-11-17 03:00 | moment -> 2026-11-17T03:00:00.000Z America/Bogota, day 2026-11-17->2026-11-16",
      "both due_at: shown 2026-11-18 02:00 UTC | moment 2026-11-17 21:00 | clock 2026-11-18 02:00 | moment -> 2026-11-18T02:00:00.000Z America/Bogota, day 2026-11-18->2026-11-17",
    ],
    not_changed: [
      "closed_task done due_at 2026-11-15T01:00:00.000Z",
      "series_template fixture-series due_at 2026-11-16T21:00:00.000Z",
    ],
    totals: { tasks: 3, values: 4, not_changed: 2, series_templates: 1 },
  });
});

it("Bogotá, same clock time: what was typed, at the instant five hours later", () => {
  expect(lines("America/Bogota", "clock").items).toEqual([
    "evening due_at: shown 2026-11-16 21:00 UTC | moment 2026-11-16 16:00 | clock 2026-11-16 21:00 | clock -> 2026-11-17T02:00:00.000Z America/Bogota, day 2026-11-16->2026-11-16",
    "both scheduled_at: shown 2026-11-17 01:30 UTC | moment 2026-11-16 20:30 | clock 2026-11-17 01:30 | clock -> 2026-11-17T06:30:00.000Z America/Bogota, day 2026-11-17->2026-11-17",
    "night due_at: shown 2026-11-17 03:00 UTC | moment 2026-11-16 22:00 | clock 2026-11-17 03:00 | clock -> 2026-11-17T08:00:00.000Z America/Bogota, day 2026-11-17->2026-11-17",
    "both due_at: shown 2026-11-18 02:00 UTC | moment 2026-11-17 21:00 | clock 2026-11-18 02:00 | clock -> 2026-11-18T07:00:00.000Z America/Bogota, day 2026-11-18->2026-11-18",
  ]);
});

it("Tokyo (east of UTC): the moment moves forward a day, the clock time stays", () => {
  expect([
    lines("Asia/Tokyo", "moment").items[0],
    lines("Asia/Tokyo", "clock").items[0],
  ]).toEqual([
    "evening due_at: shown 2026-11-16 21:00 UTC | moment 2026-11-17 06:00 | clock 2026-11-16 21:00 | moment -> 2026-11-16T21:00:00.000Z Asia/Tokyo, day 2026-11-16->2026-11-17",
    "evening due_at: shown 2026-11-16 21:00 UTC | moment 2026-11-17 06:00 | clock 2026-11-16 21:00 | clock -> 2026-11-16T12:00:00.000Z Asia/Tokyo, day 2026-11-16->2026-11-16",
  ]);
});

it("--task limits the plan; closed Tasks only when asked for; never a deleted Task; a UTC machine has nothing to do", () => {
  expect(
    lines("America/Bogota", "clock", { tasks: ["night" as never] }).items,
  ).toEqual([
    "night due_at: shown 2026-11-17 03:00 UTC | moment 2026-11-16 22:00 | clock 2026-11-17 03:00 | clock -> 2026-11-17T08:00:00.000Z America/Bogota, day 2026-11-17->2026-11-17",
  ]);
  const closed = lines("America/Bogota", "moment", {
    includeClosed: true,
  }).items;
  expect(closed.some((row) => row.startsWith("done due_at"))).toBe(true);
  expect(closed.some((row) => row.startsWith("deleted"))).toBe(false);
  expect(lines("UTC", "clock").items).toEqual([]);
});

it("same clock time refuses a time the zone skips or repeats, for that Task only", () => {
  const ny = [
    task("skipped", { due_at: utc("2027-03-14T02:30:00.000Z") }),
    task("repeated", { due_at: utc("2026-11-01T01:30:00.000Z") }),
  ];
  const plan = planTimeZoneRepair({
    tasks: ny,
    series: [],
    options: options("America/New_York", "clock"),
  });
  expect([plan.items, plan.not_changed]).toEqual([
    [],
    [
      {
        reason: "clock_time_does_not_exist",
        task_id: "skipped",
        profile_id: "fixture-profile",
        field: "due_at",
        stored_utc: "2027-03-14T02:30:00.000Z",
        message:
          "2027-03-14 02:30 does not exist in America/New_York: a daylight-saving change skips it on 2027-03-14. Repair this Task with --keep moment, or edit it by hand.",
      },
      {
        reason: "clock_time_repeats",
        task_id: "repeated",
        profile_id: "fixture-profile",
        field: "due_at",
        stored_utc: "2026-11-01T01:30:00.000Z",
        message:
          "2026-11-01 01:30 occurs twice in America/New_York: a daylight-saving change repeats it on 2026-11-01. Repair this Task with --keep moment, or edit it by hand.",
      },
    ],
  ]);
  expect(
    planTimeZoneRepair({
      tasks: ny,
      series: [],
      options: options("America/New_York", "moment"),
    }).items.map((item) => `${item.task_id} ${item.as_moment}`),
  ).toEqual(["repeated 2026-10-31 21:30", "skipped 2027-03-13 21:30"]);
});

// Server seat F1: a plan is bound to what is stored and to a dry run made now.
const fresh = () =>
  planTimeZoneRepair({
    tasks,
    series,
    options: options("America/Bogota", "clock"),
  });
const plan = () =>
  Schema.decodeUnknownSync(TimeZoneRepairPlan)(
    JSON.parse(
      JSON.stringify({
        generated_at: "2026-11-16T12:00:00.000Z",
        dry_run: true,
        profiles: ["fixture-profile"],
        ...fresh(),
      }),
    ),
  );
const current = new Map(tasks.map((t) => [`${t.profile_id}/${t.id}`, t]));
const check = (edit: (p: ReturnType<typeof plan>) => unknown) => {
  const edited = JSON.parse(JSON.stringify(plan()));
  edit(edited);
  return checkPlan(
    Schema.decodeUnknownSync(TimeZoneRepairPlan)(edited),
    "America/Bogota",
    fresh(),
    current,
  );
};

it("accepts the plan a dry run made, and refuses every edited one, naming the first item that differs", () => {
  expect([
    check(() => {}),
    // The seat's four edited plans.
    check((p) => {
      p.items[0].stored_utc = "2026-11-16T22:00:00.000Z";
      p.items[0].new_utc = "2026-11-17T03:00:00.000Z";
    }),
    check((p) => {
      p.items[0].to_zone = "Asia/Tokyo";
    }),
    check((p) => {
      p.items.push({
        ...p.items[0],
        task_id: "already",
        stored_utc: "2026-11-17T02:00:00.000Z",
        new_utc: "2030-01-01T00:00:00.000Z",
      });
    }),
    check((p) => {
      p.items.push({
        ...p.items[0],
        task_id: "dated",
        field: "scheduled_at",
        new_utc: "2026-11-20T12:00:00.000Z",
      });
    }),
    // Reordered, truncated, from another database.
    check((p) => {
      p.items.reverse();
    }),
    check((p) => {
      p.items.pop();
    }),
    check((p) => {
      for (const item of p.items) item.task_id = `other-${item.task_id}`;
    }),
    check((p) => {
      p.items[1].new_utc = "2026-11-17T09:00:00.000Z";
    }),
  ]).toEqual([
    null,
    "item 1 (Task evening, due_at) is not stored as 2026-11-16T22:00:00.000Z with the zone UTC.",
    "item 1 (Task evening, due_at) names the zone Asia/Tokyo or the reading clock, not the plan's America/Bogota and clock.",
    "item 5 (Task already, due_at) is not stored as 2026-11-17T02:00:00.000Z with the zone UTC.",
    "item 5 (Task dated, scheduled_at) is not stored as 2026-11-16T21:00:00.000Z with the zone UTC.",
    "item 1 (Task both, due_at) is not where a dry run made now has it (there: Task evening, due_at).",
    "A dry run made now also lists Task both, due_at, which the plan does not.",
    "item 1 (Task other-evening, due_at) is not stored as 2026-11-16T21:00:00.000Z with the zone UTC.",
    "item 2 (Task both, scheduled_at) differs from a dry run made now in new_utc.",
  ]);
});

it("a plan already applied is accepted and writes nothing; another machine's zone is refused", () => {
  const applied = new Map(
    tasks.map((t) => {
      const item = plan().items.find(
        (i) => i.task_id === t.id && i.field === "due_at",
      );
      return [
        `${t.profile_id}/${t.id}`,
        item
          ? {
              ...t,
              due_at: {
                kind: "instant",
                utc: item.new_utc,
                time_zone: item.to_zone,
              },
            }
          : t,
      ] as const;
    }),
  ) as unknown as Map<string, (typeof tasks)[number]>;
  const afterwards = planTimeZoneRepair({
    tasks: [...applied.values()],
    series,
    options: options("America/Bogota", "clock"),
  });
  // Only "both scheduled_at" is still UTC: the plan's other items are applied, that one is pending.
  expect(checkPlan(plan(), "America/Bogota", afterwards, applied)).toBe(null);
  expect(checkPlan(plan(), "Europe/Berlin", fresh(), current)).toBe(
    "The plan was made for the time zone America/Bogota; this machine's is Europe/Berlin. Make a new dry run here.",
  );
});
