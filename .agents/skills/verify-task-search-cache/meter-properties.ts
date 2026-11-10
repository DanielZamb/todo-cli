import assert from "node:assert/strict";
import { Effect } from "effect";
import {
  filterTaskRecordsEffect,
  runTaskRecordSteps,
} from "./packages/domain/src/task-filters.ts";
import type { TaskRead } from "./packages/domain/src/task-read.ts";
import { TaskSearchCache } from "./packages/domain/src/task-search-cache.ts";
import {
  fieldWords,
  TaskSearchWork,
  taskSearchWorkLimits,
} from "./packages/domain/src/task-search.ts";
import { profile, task } from "./packages/domain/test/store-fixtures.ts";

type Mode =
  | "cold"
  | "partial-title"
  | "partial-description"
  | "warm"
  | "uncached";
const modes: readonly Mode[] = [
  "cold",
  "partial-title",
  "partial-description",
  "warm",
  "uncached",
];
async function run(
  records: readonly TaskRead[],
  text: string,
  limit: number,
  mode: Mode,
) {
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  if (mode !== "cold" && mode !== "uncached") {
    function* warm(): Generator<void, TaskRead[]> {
      for (const record of records) {
        if (mode !== "partial-description")
          yield* cache.words(read, record.title);
        if (mode !== "partial-title")
          yield* cache.words(read, record.description ?? "");
      }
      return [];
    }
    await Effect.runPromise(runTaskRecordSteps(warm(), Effect.void));
  }
  const work = new TaskSearchWork(limit);
  const response = await Effect.runPromise(
    filterTaskRecordsEffect(
      records,
      { text },
      { projects: [], tags: [] },
      {
        work,
        prepare:
          mode === "uncached"
            ? fieldWords
            : (value) => cache.words(read, value),
      },
    ).pipe(
      Effect.map((records) => ({ json: JSON.stringify(records) })),
      Effect.catch((error) =>
        Effect.succeed({ code: error.code, chargedAtRefusal: error.work }),
      ),
    ),
  );
  assert.equal(
    cache.usage.pending,
    0,
    "meter completion/refusal leaves no pending admission",
  );
  cache.close();
  return {
    response,
    preparedUnits: work.preparedUnits,
    damerauCells: work.damerauCells,
    clauseVisits: work.clauseVisits,
    units: work.units,
  };
}
const literal = [{ ...task, title: "abcde", description: "abxde abxde" }];
for (const mode of modes) {
  assert.deepEqual(await run(literal, "abcde", 17.5, mode), {
    response: { code: "search_too_broad", chargedAtRefusal: 17.6 },
    preparedUnits: 16,
    damerauCells: 13,
    clauseVisits: 3,
    units: 17.6,
  });
  assert.deepEqual(await run(literal, "abcde", 17.6, mode), {
    response: {
      json: JSON.stringify([
        {
          ...literal[0],
          search_matches: [
            { field: "title", start: 0, end: 5 },
            { field: "description", start: 0, end: 5 },
            { field: "description", start: 6, end: 11 },
          ],
        },
      ]),
    },
    preparedUnits: 16,
    damerauCells: 13,
    clauseVisits: 3,
    units: 17.6,
  });
  assert.deepEqual(await run(literal, "abcde", 4.9, mode), {
    response: { code: "search_too_broad", chargedAtRefusal: 5 },
    preparedUnits: 5,
    damerauCells: 0,
    clauseVisits: 0,
    units: 5,
  });
  assert.deepEqual(await run(literal, "abcde", 15.9, mode), {
    response: { code: "search_too_broad", chargedAtRefusal: 16 },
    preparedUnits: 16,
    damerauCells: 0,
    clauseVisits: 0,
    units: 16,
  });
  assert.deepEqual(
    await run(
      [{ ...task, title: "ﷺ A!\n", description: null }],
      "absent",
      21.9,
      mode,
    ),
    {
      response: { code: "search_too_broad", chargedAtRefusal: 22 },
      preparedUnits: 22,
      damerauCells: 0,
      clauseVisits: 0,
      units: 22,
    },
  );
}
let state = 0x5ea2c001;
const next = (limit: number) => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) % limit;
};
const strings = [
  "abcde",
  "abxde abxde",
  "Straße",
  "ﷺ A!\n",
  "Cafe\u0301",
  "𐐀abc",
  "pay rent rent",
  "!!!",
];
const queries = [
  "abcde",
  "abxde -draft",
  "cafe",
  "strasse",
  '"pay rent"',
  '"pay re',
  "-rent",
  "",
  "صلى",
];
const observed = new Set<string>();
for (let index = 0; index < 256; index++) {
  const records = Array.from({ length: 1 + next(3) }, () => ({
    ...task,
    title: strings[next(strings.length)] ?? "",
    description: strings[next(strings.length)] ?? "",
  }));
  const query = queries[next(queries.length)] ?? "";
  const complete = await run(
    records,
    query,
    taskSearchWorkLimits.budget,
    "uncached",
  );
  for (const limit of [
    Math.max(0, complete.units - 0.1),
    complete.units,
    complete.units + 0.1,
  ]) {
    const oracle = await run(records, query, limit, "uncached");
    observed.add("code" in oracle.response ? "refused" : "accepted");
    for (const mode of modes)
      assert.deepEqual(
        await run(records, query, limit, mode),
        oracle,
        `same-source budget equality seed/index=${index} mode=${mode}`,
      );
  }
}
assert.deepEqual([...observed].sort(), ["accepted", "refused"]);
const large = Array.from({ length: 50 }, () => ({
  ...task,
  title: "Ready",
  description: "a".repeat(100000),
}));
for (const mode of modes) {
  assert.deepEqual(await run(large, "z", taskSearchWorkLimits.budget, mode), {
    response: { code: "search_too_broad", chargedAtRefusal: 5000259.8 },
    preparedUnits: 5000250,
    damerauCells: 0,
    clauseVisits: 98,
    units: 5000259.8,
  });
  assert.deepEqual(
    await run(large.slice(0, 49), "z", taskSearchWorkLimits.budget, mode),
    {
      response: { json: "[]" },
      preparedUnits: 4900245,
      damerauCells: 0,
      clauseVisits: 98,
      units: 4900254.8,
    },
  );
}
console.log(
  JSON.stringify({
    status: "PASS",
    seed: "0x5ea2c001",
    generated: 256,
    limitsPerInput: 3,
    modes,
    defaultBudget: 5000000,
    defaultAcceptedUnits: 4900254.8,
    defaultRefusedUnits: 5000259.8,
    literalBoundary: [17.5, 17.6],
    scope:
      "same-source real memo and SEC work meter; full ordered JSON and exact refusal counters",
  }),
);
