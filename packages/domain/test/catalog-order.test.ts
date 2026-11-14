import { describe, expect, it } from "vitest";
import { compareNames, compareTasks, taskOrder } from "../src/catalog-order.ts";
import type { Task } from "../src/entities.ts";
import names from "./fixtures/catalog/names.json" with { type: "json" };
import { readTasksComparator } from "./fixtures/extracted/pre-catalog-rules.ts";

type Ordered = Parameters<typeof compareTasks>[0];
const task = (value: {
  priority: Task["priority"];
  due_at: Task["due_at"];
  created_at: string | undefined;
  id: string;
}) => value as unknown as Ordered;
const at = (utc: string) =>
  ({ kind: "instant", utc, time_zone: "America/Bogota" }) as Task["due_at"];
const day = (date: string) => ({ kind: "date", date }) as Task["due_at"];
const dues: Task["due_at"][] = [
  null,
  day("2026-11-12"),
  day("2026-11-13"),
  at("2026-11-13T00:00:00Z"),
  at("2026-11-13T05:00:00Z"),
  at("2026-11-13T05:00:00.5Z"),
  at("2026-11-13T05:00:00.123Z"),
  at("2026-11-12T23:59:59.999Z"),
];
const created = [
  "2026-11-13T05:00:00Z",
  "2026-11-13T05:00:00.5Z",
  "2026-11-13T05:00:00.123Z",
  "2026-11-12T23:00:00Z",
];
// Real ids: crypto.randomUUID (lowercase hex) and short lowercase test ids.
const ids = [
  "0b3f7c1e-2a4d-4e6f-8a9b-0c1d2e3f4a5b",
  "0b3f7c1e-2a4d-4e6f-8a9b-0c1d2e3f4a5c",
  "f0000000-0000-4000-8000-000000000000",
  "9fffffff-ffff-4fff-bfff-ffffffffffff",
  "task-1",
  "task-10",
  "task-2",
];
const tasks: Ordered[] = [];
for (const priority of ["P1", "P2", "P3", "P4"] as const)
  for (const due_at of dues)
    for (const created_at of created)
      for (const id of ids)
        tasks.push(task({ priority, due_at, created_at, id }));

describe("compareTasks", () => {
  it("orders like readTasks did on every pair of real values", () => {
    expect(tasks.length).toBe(896);
    let pairs = 0;
    for (const a of tasks)
      for (const b of tasks) {
        expect(Math.sign(compareTasks(a, b))).toBe(
          Math.sign(readTasksComparator(a, b)),
        );
        pairs++;
      }
    expect(pairs).toBe(802_816);
  });

  const literal: Ordered[] = [
    task({
      priority: "P2",
      due_at: day("2026-11-13"),
      created_at: created[0],
      id: "a",
    }),
    task({
      priority: "P1",
      due_at: day("2026-11-20"),
      created_at: created[0],
      id: "b",
    }),
    task({ priority: "P1", due_at: null, created_at: created[0], id: "c" }),
    task({ priority: "P2", due_at: null, created_at: created[0], id: "d" }),
    task({
      priority: "P1",
      due_at: day("2026-11-12"),
      created_at: created[0],
      id: "e",
    }),
  ];
  it("puts undated Tasks first inside a priority (today's CLI order)", () => {
    expect([...literal].sort(taskOrder("first")).map((t) => t.id)).toEqual([
      "c",
      "e",
      "b",
      "d",
      "a",
    ]);
    expect([...literal].sort(compareTasks).map((t) => t.id)).toEqual([
      "c",
      "e",
      "b",
      "d",
      "a",
    ]);
  });
  it("puts undated Tasks last inside a priority when set to last", () => {
    expect([...literal].sort(taskOrder("last")).map((t) => t.id)).toEqual([
      "e",
      "b",
      "c",
      "a",
      "d",
    ]);
  });
  it("breaks a full tie by code units, never by locale", () => {
    const tie = {
      priority: "P1",
      due_at: null,
      created_at: created[0],
    } as const;
    expect(
      [
        task({ ...tie, id: "b" }),
        task({ ...tie, id: "B" }),
        task({ ...tie, id: "a" }),
      ]
        .sort(compareTasks)
        .map((t) => t.id),
    ).toEqual(["B", "a", "b"]);
  });
});

describe("compareNames", () => {
  it("orders the 22 names of the design note literally", () => {
    const items = names.input.map((name, index) => ({
      id: `id${String(names.input.length - index).padStart(2, "0")}`,
      name,
    }));
    expect(items.sort(compareNames).map((item) => item.name)).toEqual(
      names.ordered,
    );
  });
  it("breaks equal names by id", () => {
    expect(
      [
        { id: "b", name: "Home" },
        { id: "a", name: "Home" },
      ]
        .sort(compareNames)
        .map((item) => item.id),
    ).toEqual(["a", "b"]);
  });
});
