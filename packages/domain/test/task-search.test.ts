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
it("executes each distinct normalized expansion clause once", () => {
  const text = "\ufdfa".repeat(200);
  expect(text.length).toBe(200);
  expect(Schema.is(TaskFilters)({ text })).toBe(true);
  expect(parseTaskSearch(text)).toEqual([
    { kind: "word", word: "صلى" },
    { kind: "word", word: "الله" },
    { kind: "word", word: "عليه" },
    { kind: "word", word: "وسلمصلى" },
    { kind: "word", word: "وسلم" },
  ]);
});
it("deduplicates whole clauses while retaining signs, phrase kinds and word order", () => {
  expect(
    parseTaskSearch(
      'CAFÉ cafe -cafe -CAFÉ "pay pay" "PAY PAY" -"pay pay" -"PAY PAY" "pay" "pay rent" "rent pay" "pay re',
    ),
  ).toEqual([
    { kind: "word", word: "cafe" },
    { kind: "exclude-word", word: "cafe" },
    { kind: "phrase", words: ["pay", "pay"] },
    {
      kind: "exclude-phrase",
      phrase: { kind: "phrase", words: ["pay", "pay"] },
    },
    { kind: "phrase", words: ["pay"] },
    { kind: "phrase", words: ["pay", "rent"] },
    { kind: "phrase", words: ["rent", "pay"] },
    { kind: "open-phrase", words: ["pay", "re"] },
  ]);
});
it("keeps repeated normalized clauses behaviorally equivalent", () => {
  for (const [single, repeated, title, expected] of [
    ["rent", "rent RENT rent", "Rent", [{ field: "title", start: 0, end: 4 }]],
    [
      '"pay pay"',
      '"pay pay" "PAY PAY"',
      "Pay pay",
      [
        { field: "title", start: 0, end: 3 },
        { field: "title", start: 4, end: 7 },
      ],
    ],
    ["-draft", "-draft -DRAFT", "Ready", []],
    ["-draft", "-draft -DRAFT", "Draft", null],
    [
      "abxde -abxde",
      "abxde abxde -abxde -ABXDE",
      "abcde",
      [{ field: "title", start: 0, end: 5 }],
    ],
    ["pay -pay", "pay pay -pay -PAY", "Pay", null],
    ["ffi", "ﬃ FFI ﬃ", "ﬃ", [{ field: "title", start: 0, end: 1 }]],
  ] as const) {
    for (const text of [single, repeated])
      expect(
        matchTaskSearch({ title, description: null }, parseTaskSearch(text)),
      ).toEqual(
        expected === null
          ? { accepted: false, matches: [] }
          : { accepted: true, matches: expected },
      );
  }
});
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
