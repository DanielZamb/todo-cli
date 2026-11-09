import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import type { Edge } from "../src/dependencies.ts";
import { TaskId } from "../src/ids.ts";
import {
  filterTaskRecords,
  filterTaskRecordsEffect,
} from "../src/task-filters.ts";
import { fieldWords, TaskSearchWork } from "../src/task-search.ts";
import { task } from "./store-fixtures.ts";

const source = { ...task, title: "Ready", description: null };
const blocked = Array.from({ length: 50 }, (_, index) => ({
  ...task,
  id: Schema.decodeUnknownSync(TaskId)(`dependent-${index}`),
  description: "a ".repeat(50000),
}));
const edges: Edge[] = blocked.map((dependent) => ({
  profile_id: task.profile_id,
  dependent_id: dependent.id,
  blocker_id: source.id,
}));
const graph = { tasks: [source, ...blocked], edges };

it("does not charge blocked Tasks excluded by Ready before text matching", () => {
  const work = new TaskSearchWork();
  expect(
    filterTaskRecords(
      graph.tasks,
      { ready: true, text: "zzzz" },
      { projects: [], tags: [] },
      { work, prepare: fieldWords },
      graph,
    ),
  ).toEqual([]);
  expect(work.units).toBe(5.1);
});

it("preserves Dependency reads through the yielding search path", async () => {
  const rows = await Effect.runPromise(
    filterTaskRecordsEffect(
      graph.tasks,
      { ready: true, text: "ready" },
      { projects: [], tags: [] },
      undefined,
      graph,
    ),
  );
  expect(
    rows.map((row) => ({
      id: row.id,
      ready: row.ready,
      blocked: row.blocked,
      depends_on: row.depends_on,
      blocks: row.blocks?.length,
      matches: row.search_matches,
    })),
  ).toEqual([
    {
      id: source.id,
      ready: true,
      blocked: false,
      depends_on: [],
      blocks: 50,
      matches: [{ field: "title", start: 0, end: 5 }],
    },
  ]);
});
