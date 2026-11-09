import { expect, it } from "@effect/vitest";
import { filterTaskRecords } from "../src/task-filters.ts";
import { task } from "./store-fixtures.ts";

it("refuses cumulative search work without publishing partial rows", () => {
  const tasks = Array.from({ length: 50 }, () => ({
    ...task,
    title: "Ready",
    description: "a ".repeat(50000),
  }));
  expect(() =>
    filterTaskRecords(tasks, { text: "zzzz" }, { projects: [], tags: [] }),
  ).toThrowError(
    "Search is too broad. Narrow the search with a Project, Tag or Status filter, use fewer or shorter words, or quote a phrase.",
  );
}, 30_000);

import {
  fieldWords,
  matchTaskSearch,
  type PreparedField,
  parseTaskSearch,
  SearchTooBroad,
  type TaskSearchExecution,
  TaskSearchWork,
} from "../src/task-search.ts";

it("charges folded units and banded cells once per distinct field word", () => {
  const work = new TaskSearchWork();
  expect(
    matchTaskSearch(
      { title: "abcde", description: "abxde abxde" },
      parseTaskSearch("abcde"),
      { work, prepare: fieldWords },
    ),
  ).toEqual({
    accepted: true,
    matches: [
      { field: "title", start: 0, end: 5 },
      { field: "description", start: 0, end: 5 },
      { field: "description", start: 6, end: 11 },
    ],
  });
  expect({
    preparedUnits: work.preparedUnits,
    cells: work.damerauCells,
    visits: work.clauseVisits,
    units: work.units,
  }).toEqual({ preparedUnits: 16, cells: 13, visits: 3, units: 17.6 });
});
it("has identical acceptance, refusal and totals cold, warm and uncached", () => {
  const values = ["abcde", "abxde abxde"];
  const stored = new Map<string, PreparedField>();
  for (const value of values) {
    const steps = fieldWords(value);
    let step = steps.next();
    while (!step.done) step = steps.next();
    stored.set(value, step.value);
  }
  for (const limit of [17.5, 17.6]) {
    const outcomes = [];
    for (const mode of ["cold", "warm", "uncached"]) {
      const work = new TaskSearchWork(limit);
      const prepare: TaskSearchExecution["prepare"] = function* (value) {
        const cached = mode === "warm" ? stored.get(value) : undefined;
        if (cached) return cached;
        return yield* fieldWords(value);
      };
      try {
        const result = matchTaskSearch(
          { title: values[0] ?? "", description: values[1] ?? "" },
          parseTaskSearch("abcde"),
          { work, prepare },
        );
        outcomes.push({
          result,
          preparedUnits: work.preparedUnits,
          cells: work.damerauCells,
          visits: work.clauseVisits,
          units: work.units,
        });
      } catch (error) {
        if (!(error instanceof SearchTooBroad)) throw error;
        outcomes.push({
          code: error.code,
          work: error.work,
          preparedUnits: work.preparedUnits,
          cells: work.damerauCells,
          visits: work.clauseVisits,
          units: work.units,
        });
      }
    }
    expect(outcomes[0]).toEqual(outcomes[1]);
    expect(outcomes[1]).toEqual(outcomes[2]);
    if (limit === 17.5)
      expect(outcomes[0]).toEqual({
        code: "search_too_broad",
        work: 17.6,
        preparedUnits: 16,
        cells: 13,
        visits: 3,
        units: 17.6,
      });
    else expect("result" in (outcomes[0] ?? {})).toBe(true);
  }
});
it("does not charge Tasks rejected by non-text filters", () => {
  const tasks = Array.from({ length: 50 }, () => ({
    ...task,
    status: "done" as const,
    title: "Ready",
    description: "a ".repeat(50000),
  }));
  const work = new TaskSearchWork();
  expect(
    filterTaskRecords(
      [...tasks, { ...task, title: "Ready", description: null }],
      { text: "zzzz", status: "open" },
      { projects: [], tags: [] },
      { work, prepare: fieldWords },
    ),
  ).toEqual([]);
  expect(work.units).toBe(5.1);
});
it("is deterministic across seeded refusal inputs and stored preparation", () => {
  let seed = 0x1b0d6e7;
  const next = (n: number) => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % n;
  };
  const observed = new Set<string>();
  for (let index = 0; index < 128; index++) {
    const title =
      ["abcde", "Straße", "ﷺﷺ", "Cafe\u0301", "𐐀abc"][next(5)] ?? "abcde";
    const description = `${title} abxde abxde ready`;
    const limit = next(100);
    const query =
      ["abcde", "abxde -draft", "cafe", "strasse", '"ready', "صلى"][next(6)] ??
      "abcde";
    const stored = new Map<string, PreparedField>();
    for (const text of [title, description]) {
      const steps = fieldWords(text);
      let step = steps.next();
      while (!step.done) step = steps.next();
      stored.set(text, step.value);
    }
    const run = (warm: boolean) => {
      const work = new TaskSearchWork(limit);
      const prepare: TaskSearchExecution["prepare"] = function* (text) {
        const hit = warm ? stored.get(text) : undefined;
        if (hit) return hit;
        return yield* fieldWords(text);
      };
      try {
        const result = matchTaskSearch(
          { title, description },
          parseTaskSearch(query),
          { work, prepare },
        );
        observed.add("pass");
        return {
          result,
          units: work.units,
          cells: work.damerauCells,
          visits: work.clauseVisits,
        };
      } catch (error) {
        if (!(error instanceof SearchTooBroad)) throw error;
        observed.add("search_too_broad");
        return {
          code: error.code,
          units: error.work,
          cells: work.damerauCells,
          visits: work.clauseVisits,
        };
      }
    };
    expect(run(false)).toEqual(run(true));
    expect(run(false)).toEqual(run(false));
  }
  expect([...observed].sort()).toEqual(["pass", "search_too_broad"]);
});

it("counts visits through every word and phrase sign and phrase kind", () => {
  for (const [text, accepted, cells, units] of [
    ["abcde", true, 13, 17.6],
    ["-abxde", false, 0, 16.3],
    ["-absent", true, 0, 16.3],
    ['"abxde abxde"', true, 0, 16.3],
    ['"abxde abx', true, 0, 16.3],
    ['-"abxde abxde"', false, 0, 16.3],
    ['-"abxde abx', false, 0, 16.3],
  ] as const) {
    const work = new TaskSearchWork();
    const result = matchTaskSearch(
      { title: "abcde", description: "abxde abxde" },
      parseTaskSearch(text),
      { work, prepare: fieldWords },
    );
    expect(result.accepted).toBe(accepted);
    expect({
      prepared: work.preparedUnits,
      cells: work.damerauCells,
      visits: work.clauseVisits,
      units: work.units,
    }).toEqual({ prepared: 16, cells, visits: 3, units });
  }
});
