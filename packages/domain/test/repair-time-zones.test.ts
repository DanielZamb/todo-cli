// Q14 and Q17 (the owner, 2026-11-16: repair once, always the same moment) and the server seat's
// F1 on d5af970d: the repair plan for due and scheduled instants stored with the zone UTC, and the
// binding of a run to the plan.
// - Each value keeps its instant and gets the machine's zone; the plan shows what it shows today
//   and after, in local time.
// - Only open and snoozed Tasks unless closed ones are asked for; never a date, a value already
//   zoned, a deleted Task; Series templates listed, not changed.
// - checkPlan refuses any plan that is not exactly a dry run made now with the plan's options.
import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { Series, Task } from "../src/entities.ts";
import {
  checkPlan,
  planTimeZoneRepair,
  REPAIR_KEEPS_THE_MOMENT,
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
  task("snoozed", {
    status: "snoozed",
    due_at: utc("2026-11-18T12:00:00.000Z"),
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
const options = (zone: string, extra: Partial<RepairOptions> = {}) => ({
  zone,
  includeClosed: false,
  tasks: null,
  ...extra,
});
const lines = (zone: string, extra: Partial<RepairOptions> = {}) => {
  const plan = planTimeZoneRepair({
    tasks,
    series,
    options: options(zone, extra),
  });
  return {
    items: plan.items.map(
      (item) =>
        `${item.task_id} ${item.field} ${item.utc}: shows ${item.shown_before} UTC today, ${item.shown_after} ${item.to_zone} after, day ${item.day_before}->${item.day_after}`,
    ),
    not_changed: plan.not_changed.map(
      (row) =>
        `${row.reason} ${row.task_id ?? row.series_id} ${row.field} ${row.utc}`,
    ),
    totals: plan.totals,
  };
};

it("Bogotá: typed 21:00 shows 16:00 after; typed 03:00 shows 22:00 the day before; the note says so", () => {
  expect(lines("America/Bogota")).toEqual({
    items: [
      "evening due_at 2026-11-16T21:00:00.000Z: shows 2026-11-16 21:00 UTC today, 2026-11-16 16:00 America/Bogota after, day 2026-11-16->2026-11-16",
      "both scheduled_at 2026-11-17T01:30:00.000Z: shows 2026-11-17 01:30 UTC today, 2026-11-16 20:30 America/Bogota after, day 2026-11-17->2026-11-16",
      "night due_at 2026-11-17T03:00:00.000Z: shows 2026-11-17 03:00 UTC today, 2026-11-16 22:00 America/Bogota after, day 2026-11-17->2026-11-16",
      "both due_at 2026-11-18T02:00:00.000Z: shows 2026-11-18 02:00 UTC today, 2026-11-17 21:00 America/Bogota after, day 2026-11-18->2026-11-17",
      "snoozed due_at 2026-11-18T12:00:00.000Z: shows 2026-11-18 12:00 UTC today, 2026-11-18 07:00 America/Bogota after, day 2026-11-18->2026-11-18",
    ],
    not_changed: [
      "closed_task done due_at 2026-11-15T01:00:00.000Z",
      "series_template fixture-series due_at 2026-11-16T21:00:00.000Z",
    ],
    totals: { tasks: 4, values: 5, not_changed: 2, series_templates: 1 },
  });
  expect(
    planTimeZoneRepair({ tasks, series, options: options("America/Bogota") })
      .note,
  ).toBe(REPAIR_KEEPS_THE_MOMENT);
  expect(REPAIR_KEEPS_THE_MOMENT).toBe(
    "This repair keeps the moment each reminder has always fired at, not the clock time that was typed: a time typed as 21:00 in Bogotá before the fix shows 16:00 after it, and one typed between 00:00 and 04:59 shows on the day before.",
  );
});

it("Tokyo (east of UTC): the same moment shows the next morning", () => {
  expect(lines("Asia/Tokyo").items[0]).toBe(
    "evening due_at 2026-11-16T21:00:00.000Z: shows 2026-11-16 21:00 UTC today, 2026-11-17 06:00 Asia/Tokyo after, day 2026-11-16->2026-11-17",
  );
});

it("--task limits the plan; closed Tasks only when asked for; never a deleted Task or a date; a UTC machine has nothing to do", () => {
  expect(lines("America/Bogota", { tasks: ["night" as never] }).items).toEqual([
    "night due_at 2026-11-17T03:00:00.000Z: shows 2026-11-17 03:00 UTC today, 2026-11-16 22:00 America/Bogota after, day 2026-11-17->2026-11-16",
  ]);
  const closed = lines("America/Bogota", { includeClosed: true }).items;
  expect(closed.some((row) => row.startsWith("done due_at"))).toBe(true);
  expect(
    closed.some((row) => row.startsWith("deleted") || row.startsWith("dated")),
  ).toBe(false);
  expect(lines("UTC").items).toEqual([]);
});

// Server seat F1: a plan is bound to what is stored and to a dry run made now.
const fresh = () =>
  planTimeZoneRepair({ tasks, series, options: options("America/Bogota") });
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
type Editable = { items: Record<string, unknown>[] };
const at = (p: Editable, index: number) =>
  p.items[index] as Record<string, unknown>;
const check = (edit: (p: Editable) => unknown) => {
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
      at(p, 0).utc = "2026-11-16T22:00:00.000Z";
    }),
    check((p) => {
      at(p, 0).to_zone = "Asia/Tokyo";
    }),
    check((p) => {
      p.items.push({
        ...at(p, 0),
        task_id: "already",
        utc: "2030-01-01T00:00:00.000Z",
      });
    }),
    check((p) => {
      p.items.push({ ...at(p, 0), task_id: "dated", field: "scheduled_at" });
    }),
    // Reordered, truncated, from another database, a shown time edited.
    check((p) => {
      p.items.reverse();
    }),
    check((p) => {
      p.items.pop();
    }),
    check((p) => {
      for (const entry of p.items) entry.task_id = `other-${entry.task_id}`;
    }),
    check((p) => {
      at(p, 1).shown_after = "2026-11-17 01:30";
    }),
  ]).toEqual([
    null,
    "item 1 (Task evening, due_at) is not stored as 2026-11-16T22:00:00.000Z with the zone UTC.",
    "item 1 (Task evening, due_at) names the zone Asia/Tokyo, not the plan's America/Bogota.",
    "item 6 (Task already, due_at) is not stored as 2030-01-01T00:00:00.000Z with the zone UTC.",
    "item 6 (Task dated, scheduled_at) is not stored as 2026-11-16T21:00:00.000Z with the zone UTC.",
    "item 1 (Task snoozed, due_at) is not where a dry run made now has it (there: Task evening, due_at).",
    "A dry run made now also lists Task snoozed, due_at, which the plan does not.",
    "item 1 (Task other-evening, due_at) is not stored as 2026-11-16T21:00:00.000Z with the zone UTC.",
    "item 2 (Task both, scheduled_at) differs from a dry run made now in shown_after.",
  ]);
});

it("a plan already applied is accepted and writes nothing; another machine's zone is refused", () => {
  const applied = new Map(
    tasks.map((t) => [
      `${t.profile_id}/${t.id}`,
      t.id === "evening"
        ? {
            ...t,
            due_at: {
              kind: "instant",
              utc: "2026-11-16T21:00:00.000Z",
              time_zone: "America/Bogota",
            },
          }
        : t,
    ]),
  ) as unknown as Map<string, (typeof tasks)[number]>;
  const afterwards = planTimeZoneRepair({
    tasks: [...applied.values()],
    series,
    options: options("America/Bogota"),
  });
  expect(checkPlan(plan(), "America/Bogota", afterwards, applied)).toBe(null);
  expect(checkPlan(plan(), "Europe/Berlin", fresh(), current)).toBe(
    "The plan was made for the time zone America/Bogota; this machine's is Europe/Berlin. Make a new dry run here.",
  );
});
