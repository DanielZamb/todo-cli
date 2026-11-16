// Follow-up 88: the Markdown review puts every open Task with a due date in at most one of Overdue
// and Scheduled, by its due day in its stored zone and today in the reader's zone, as the Today view
// does. Weekly Scheduled is due from today through the sixth day after it; daily Scheduled is due or
// scheduled today.
import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { Task } from "../src/entities.ts";
import { planningClock, planningDay } from "../src/planning-day.ts";
import { renderReview, taskView } from "../src/presentation.ts";

type Due =
  | { kind: "date"; date: string }
  | { kind: "instant"; utc: string; time_zone: string };
const task = (
  id: string,
  due: Due | null,
  extra: Record<string, unknown> = {},
) =>
  Schema.decodeUnknownSync(Task)({
    id,
    profile_id: "fixture-profile",
    entity_version: 1,
    row_version: 1,
    title: id,
    description: null,
    project_id: "fixture-project",
    priority: "P3",
    status: "open",
    scheduled_at: null,
    due_at: due,
    energy: null,
    estimate_min: null,
    source: "agent",
    tags: [],
    attachments: [],
    external_id: null,
    occurrence: null,
    created_at: "2026-11-10T00:00:00.000Z",
    updated_at: "2026-11-10T00:00:00.000Z",
    completed_at: null,
    deleted_at: null,
    ...extra,
  });
const project = {
  id: "fixture-project",
  profile_id: "fixture-profile",
  name: "work",
  created_at: "2026-11-10T00:00:00.000Z",
  updated_at: "2026-11-10T00:00:00.000Z",
};
/** The titles under each heading of the review, by heading. */
const review = (
  tasks: ReturnType<typeof task>[],
  period: "daily" | "weekly",
  now: string,
  zone: string,
) => {
  const markdown = renderReview(
    tasks.map((t) => taskView(t, [project as never], [])),
    period,
    "md",
    now,
    planningClock(tasks, planningDay(now as never, undefined, zone)),
  );
  const groups: Record<string, string[]> = {};
  let current = "";
  for (const line of markdown.split("\n")) {
    const heading = /^## (.+)$/.exec(line);
    if (heading?.[1]) {
      current = heading[1];
      groups[current] = [];
    }
    const row = /^- \[ \] \[P\d\] (\S+) \(id:/.exec(line);
    if (row?.[1] && current) groups[current]?.push(row[1]);
  }
  return groups;
};

it("weekly: a date-only Task due today is Scheduled; one due in exactly seven days is outside the week", () => {
  // The review's own example: 12:00 UTC on 16 November, an open Task with a Project due that day.
  const tasks = [
    task("due-today", { kind: "date", date: "2026-11-16" }),
    task("due-in-six", { kind: "date", date: "2026-11-22" }),
    task("due-in-seven", { kind: "date", date: "2026-11-23" }),
    task("due-yesterday", { kind: "date", date: "2026-11-15" }),
  ];
  expect(review(tasks, "weekly", "2026-11-16T12:00:00.000Z", "UTC")).toEqual({
    Overdue: ["due-yesterday"],
    Scheduled: ["due-in-six", "due-today"],
    "Stale Inbox": [],
    "Missing Metadata": [],
  });
});

it("weekly and daily agree on a timed Task due earlier today: due today, not Overdue", () => {
  // 18:00 in Bogota on 16 November; one Task due at 09:00 that day, one at 21:00.
  const now = "2026-11-16T23:00:00.000Z";
  const tasks = [
    task("earlier-today", {
      kind: "instant",
      utc: "2026-11-16T14:00:00.000Z",
      time_zone: "America/Bogota",
    }),
    task("later-today", {
      kind: "instant",
      utc: "2026-11-17T02:00:00.000Z",
      time_zone: "America/Bogota",
    }),
  ];
  expect([
    review(tasks, "weekly", now, "America/Bogota"),
    review(tasks, "daily", now, "America/Bogota"),
  ]).toEqual([
    {
      Overdue: [],
      Scheduled: ["earlier-today", "later-today"],
      "Stale Inbox": [],
      "Missing Metadata": [],
    },
    { Overdue: [], Scheduled: ["earlier-today", "later-today"], Inbox: [] },
  ]);
});

it("daily: a Task overdue and also scheduled today is in Overdue only", () => {
  const tasks = [
    task(
      "overdue-scheduled-today",
      { kind: "date", date: "2026-11-15" },
      { scheduled_at: { kind: "date", date: "2026-11-16" } },
    ),
  ];
  expect(review(tasks, "daily", "2026-11-16T12:00:00.000Z", "UTC")).toEqual({
    Overdue: ["overdue-scheduled-today"],
    Scheduled: [],
    Inbox: [],
  });
});

// The property: for every open Task due in the past or within the window (weekly: through the
// sixth day after today; daily: through today), exactly one of Overdue and Scheduled holds; a Task
// due after the window is in neither. Date-only and timed, a reader at 00:00, 12:00 and 23:59
// local, in Bogota (west of UTC) and Tokyo (east of it).
it("no Task due in the window falls between Overdue and Scheduled, or into both", () => {
  const offsets = {
    "America/Bogota": "-05:00",
    "Asia/Tokyo": "+09:00",
  } as const;
  const day = (base: string, days: number) =>
    new Date(Date.parse(`${base}T00:00:00Z`) + days * 86400000)
      .toISOString()
      .slice(0, 10);
  const cases: string[] = [];
  let checked = 0;
  for (const [zone, offset] of Object.entries(offsets)) {
    const today = "2026-11-16";
    for (const clock of ["00:00", "12:00", "23:59"]) {
      const now = new Date(`${today}T${clock}:00${offset}`).toISOString();
      const tasks = [];
      for (let delta = -3; delta <= 9; delta++) {
        const date = day(today, delta);
        tasks.push(task(`date${delta}`, { kind: "date", date }));
        for (const at of ["00:30", "12:00", "23:30"])
          tasks.push(
            task(`time${delta}at${at.replace(":", "")}`, {
              kind: "instant",
              utc: new Date(`${date}T${at}:00${offset}`).toISOString(),
              time_zone: zone,
            }),
          );
      }
      for (const period of ["weekly", "daily"] as const) {
        const groups = review(tasks, period, now, zone);
        for (const t of tasks) {
          const delta = Number(/-?\d+/.exec(t.id)?.[0]);
          const inWindow = delta <= (period === "weekly" ? 6 : 0);
          const memberships = [
            (groups.Overdue ?? []).includes(t.id),
            (groups.Scheduled ?? []).includes(t.id),
          ].filter(Boolean).length;
          checked++;
          if (memberships !== (inWindow ? 1 : 0))
            cases.push(`${zone} ${clock} ${period} ${t.id}: ${memberships}`);
          if (inWindow && (groups.Overdue ?? []).includes(t.id) !== delta < 0)
            cases.push(
              `${zone} ${clock} ${period} ${t.id}: Overdue is ${(groups.Overdue ?? []).includes(t.id)}`,
            );
        }
      }
    }
  }
  expect({ checked, cases }).toEqual({
    checked: 2 * 3 * 2 * 13 * 4,
    cases: [],
  });
});
