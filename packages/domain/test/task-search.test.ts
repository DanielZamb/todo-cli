import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { filterTaskRecords, TaskFilters } from "../src/task-filters.ts";
import {
  matchTaskSearch,
  normalizeTaskSearch,
  parseTaskSearch,
} from "../src/task-search.ts";
import { task } from "./store-fixtures.ts";
import { searchCases } from "./task-search-cases.ts";

for (const entry of searchCases) {
  it(`matches ${JSON.stringify(entry.text)} against ${JSON.stringify(entry.title)}`, () => {
    const result = matchTaskSearch(
      {
        title: entry.title,
        description: "description" in entry ? entry.description : null,
      },
      parseTaskSearch(entry.text),
    );
    expect(result).toEqual(
      entry.matches === null
        ? { accepted: false, matches: [] }
        : { accepted: true, matches: entry.matches },
    );
  });
}
it("enforces UTF-16 text and literal prefix boundaries", () => {
  for (const text of [" ", "", "x".repeat(200), "😀".repeat(100)])
    expect(Schema.is(TaskFilters)({ text })).toBe(true);
  for (const text of ["x".repeat(201), "😀".repeat(101)])
    expect(Schema.is(TaskFilters)({ text })).toBe(false);
  for (const prefix of ["6AA2", "-", "a".repeat(36)])
    expect(Schema.is(TaskFilters)({ prefix })).toBe(true);
  for (const prefix of ["", "zz", " a", "a".repeat(37)])
    expect(Schema.is(TaskFilters)({ prefix })).toBe(false);
});
it("uses full default folding and idempotent compatibility normalization", () => {
  expect(normalizeTaskSearch("İı Straße ﬃ ςΣ 𐐀")).toBe("iı strasse ffi σσ 𐐨");
  expect(normalizeTaskSearch(normalizeTaskSearch("İı Straße ﬃ ςΣ 𐐀"))).toBe(
    "iı strasse ffi σσ 𐐨",
  );
});
it("keeps order, evaluates spans once, and keeps response metadata out of stored Tasks", () => {
  const first = {
    ...task,
    id: Schema.decodeUnknownSync(TaskId)(
      "6aa2647d-1111-4111-8111-111111111111",
    ),
    title: "Renew passport",
  };
  const last = { ...task, title: "Other" };
  const records = filterTaskRecords(
    [first, last, first],
    { text: "renew", prefix: "6AA2", priority: "P2" },
    { projects: [], tags: [] },
  );
  expect(
    records.map(({ title, search_matches }) => ({ title, search_matches })),
  ).toEqual([
    {
      title: "Renew passport",
      search_matches: [{ field: "title", start: 0, end: 5 }],
    },
    {
      title: "Renew passport",
      search_matches: [{ field: "title", start: 0, end: 5 }],
    },
  ]);
  expect("search_matches" in first).toBe(false);
  expect(
    filterTaskRecords(
      [first],
      { text: "renew", priority: "P1" },
      { projects: [], tags: [] },
    ),
  ).toEqual([]);
  expect(
    "search_matches" in
      (filterTaskRecords([first], {}, { projects: [], tags: [] })[0] ?? {}),
  ).toBe(false);
});

import { TaskId } from "../src/ids.ts";
