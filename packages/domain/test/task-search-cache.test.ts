import { expect, it } from "@effect/vitest";
import { filterTaskRecords } from "../src/task-filters.ts";
import { TaskSearchCache } from "../src/task-search-cache.ts";
import { profile, task } from "./store-fixtures.ts";

it("accounts exact field keys and folded words, keeps hits and evicts matching text", () => {
  const cache = new TaskSearchCache();
  const words = cache.words(profile, "Café");
  expect(words).toEqual([{ text: "cafe", start: 0, end: 4 }]);
  expect(cache.usage).toEqual({ entries: 1, chargedBytes: 260 });
  expect(cache.words(profile, "Café")).toBe(words);
  cache.evict(profile, "Café");
  expect(cache.usage).toEqual({ entries: 0, chargedBytes: 0 });
});
it("does not prepare absent or empty search clauses", () => {
  const cache = new TaskSearchCache();
  const definitions = { projects: [], tags: [] };
  expect(filterTaskRecords([task], {}, definitions, cache.words)).toEqual([
    task,
  ]);
  expect(
    filterTaskRecords([task], { text: " - " }, definitions, cache.words),
  ).toEqual([{ ...task, search_matches: [] }]);
  expect(cache.usage).toEqual({ entries: 0, chargedBytes: 0 });
});
