// Q14 (the owner, 2026-11-16): the repair plan for due and scheduled instants stored with the zone
// UTC. The same instant, the machine's zone; only open and snoozed Tasks unless closed ones are
// asked for; never a date, a value already zoned, a deleted Task; Series templates listed, not
// changed.
import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { Series, Task } from "../src/entities.ts";
import { planTimeZoneRepair } from "../src/repair-time-zones.ts";

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
const tasks = [
  // 21:00 in Bogotá on the 16th, typed before follow-up 86: stored 02:00Z on the 17th, zone UTC.
  task("evening", { due_at: utc("2026-11-17T02:00:00.000Z") }),
  // 05:00 in Tokyo on the 17th: stored 20:00Z on the 16th.
  task("tokyo-morning", { due_at: utc("2026-11-16T20:00:00.000Z") }),
  // Noon UTC is the same day in Bogotá and in Tokyo.
  task("noon", {
    due_at: utc("2026-11-16T12:00:00.000Z"),
    scheduled_at: utc("2026-11-16T09:00:00.000Z"),
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
    due_at: utc("2026-11-18T03:00:00.000Z"),
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
      due_at: utc("2026-11-17T02:00:00.000Z"),
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
const rows = (zone: string, includeClosed = false) => {
  const plan = planTimeZoneRepair({ tasks, series, zone, includeClosed });
  return {
    items: plan.items.map(
      (item) =>
        `${item.task_id} ${item.field} ${item.utc} ${item.from_zone}->${item.to_zone} ${item.day_before}->${item.day_after} v${item.from_version}`,
    ),
    not_changed: plan.not_changed.map(
      (row) =>
        `${row.reason} ${row.task_id ?? row.series_id} ${row.field} ${row.utc}`,
    ),
    totals: plan.totals,
  };
};

it("Bogotá: the evening time moves back a day, noon keeps its day, the rest is left", () => {
  expect(rows("America/Bogota")).toEqual({
    items: [
      "evening due_at 2026-11-17T02:00:00.000Z UTC->America/Bogota 2026-11-17->2026-11-16 v3",
      "tokyo-morning due_at 2026-11-16T20:00:00.000Z UTC->America/Bogota 2026-11-16->2026-11-16 v3",
      "noon due_at 2026-11-16T12:00:00.000Z UTC->America/Bogota 2026-11-16->2026-11-16 v3",
      "noon scheduled_at 2026-11-16T09:00:00.000Z UTC->America/Bogota 2026-11-16->2026-11-16 v3",
      "snoozed due_at 2026-11-18T03:00:00.000Z UTC->America/Bogota 2026-11-18->2026-11-17 v3",
    ],
    not_changed: [
      "closed_task done due_at 2026-11-15T01:00:00.000Z",
      "series_template fixture-series due_at 2026-11-17T02:00:00.000Z",
    ],
    totals: { tasks: 4, values: 5, not_changed: 2 },
  });
});

it("Tokyo (east of UTC): the evening UTC time moves forward a day", () => {
  expect(rows("Asia/Tokyo").items).toEqual([
    "evening due_at 2026-11-17T02:00:00.000Z UTC->Asia/Tokyo 2026-11-17->2026-11-17 v3",
    "tokyo-morning due_at 2026-11-16T20:00:00.000Z UTC->Asia/Tokyo 2026-11-16->2026-11-17 v3",
    "noon due_at 2026-11-16T12:00:00.000Z UTC->Asia/Tokyo 2026-11-16->2026-11-16 v3",
    "noon scheduled_at 2026-11-16T09:00:00.000Z UTC->Asia/Tokyo 2026-11-16->2026-11-16 v3",
    "snoozed due_at 2026-11-18T03:00:00.000Z UTC->Asia/Tokyo 2026-11-18->2026-11-18 v3",
  ]);
});

it("closed Tasks only when asked for; a deleted Task never; a UTC machine has nothing to repair", () => {
  expect(rows("America/Bogota", true).items).toContain(
    "done due_at 2026-11-15T01:00:00.000Z UTC->America/Bogota 2026-11-15->2026-11-14 v3",
  );
  expect(
    rows("America/Bogota", true).items.some((row) => row.startsWith("deleted")),
  ).toBe(false);
  expect(rows("UTC")).toEqual({
    items: [],
    not_changed: [
      "closed_task done due_at 2026-11-15T01:00:00.000Z",
      "series_template fixture-series due_at 2026-11-17T02:00:00.000Z",
    ],
    totals: { tasks: 0, values: 0, not_changed: 2 },
  });
});
