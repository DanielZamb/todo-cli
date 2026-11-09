import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { filterTaskRecordsEffect, TaskFilters } from "../src/task-filters.ts";
import { task } from "./store-fixtures.ts";

it("lets the event loop run before a large search publishes its snapshot", async () => {
  const seen: string[] = [];
  const timer = setTimeout(() => seen.push("event-loop"), 0);
  try {
    const rows = await Effect.runPromise(
      filterTaskRecordsEffect(
        [{ ...task, title: "Ready", description: "q ".repeat(50000) }],
        TaskFilters.make({ text: "ready" }),
        { projects: [], tags: [] },
      ).pipe(Effect.tap(() => Effect.sync(() => seen.push("published")))),
    );
    expect(seen).toEqual(["event-loop", "published"]);
    expect(
      rows.map(({ title, search_matches }) => ({ title, search_matches })),
    ).toEqual([
      {
        title: "Ready",
        search_matches: [{ field: "title", start: 0, end: 5 }],
      },
    ]);
  } finally {
    clearTimeout(timer);
  }
});
