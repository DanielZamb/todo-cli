import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import {
  filterTaskRecordsEffect,
  runTaskRecordSteps,
} from "../src/task-filters.ts";
import type { TaskRead } from "../src/task-read.ts";
import {
  fieldWords,
  type PreparedField,
  TaskSearchWork,
} from "../src/task-search.ts";
import { TaskSearchCache } from "../src/task-search-cache.ts";
import { profile, task } from "./store-fixtures.ts";

function prepare(
  cache: TaskSearchCache,
  read: ReturnType<TaskSearchCache["read"]>,
  values: readonly string[],
  checkpoint = Effect.void,
) {
  return Effect.suspend(() => {
    const captured: PreparedField[] = [];
    function* steps(): Generator<void, TaskRead[]> {
      for (const value of values)
        captured.push(yield* cache.words(read, value));
      return [];
    }
    return runTaskRecordSteps(steps(), checkpoint).pipe(
      Effect.map(() => captured),
    );
  });
}

function gate() {
  const arrived = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  let first = true;
  return {
    arrived: arrived.promise,
    release: () => released.resolve(),
    checkpoint: Effect.suspend(() => {
      if (!first) return Effect.void;
      first = false;
      arrived.resolve();
      return Effect.promise(() => released.promise);
    }),
  };
}

it("accounts exact keys, containers and words and reuses complete hits", async () => {
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const [prepared] = await Effect.runPromise(prepare(cache, read, ["Café"]));
  expect(prepared).toEqual({
    words: [{ text: "cafe", start: 0, end: 4 }],
    preparedUnits: 4,
  });
  expect(cache.usage).toEqual({
    entries: 1,
    pending: 0,
    retainedBytes: 324,
    pendingBytes: 0,
    chargedBytes: 324,
    generationProfiles: 0,
    generationBytes: 0,
    closed: false,
  });
  let checkpoints = 0;
  const hit = await Effect.runPromise(
    prepare(
      cache,
      read,
      ["Café"],
      Effect.sync(() => {
        checkpoints++;
      }),
    ),
  );
  expect(hit[0]).toBe(prepared);
  expect(checkpoints).toBe(0);
  cache.evict(profile, "Café");
  expect([cache.usage.entries, cache.usage.chargedBytes]).toEqual([0, 0]);
});

it("does not prepare absent or empty search clauses", async () => {
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const execution = {
    work: new TaskSearchWork(),
    prepare: (text: string) => cache.words(read, text),
  };
  const definitions = { projects: [], tags: [] };
  expect(
    await Effect.runPromise(
      filterTaskRecordsEffect([task], {}, definitions, execution),
    ),
  ).toEqual([task]);
  expect(
    await Effect.runPromise(
      filterTaskRecordsEffect([task], { text: " - " }, definitions, execution),
    ),
  ).toEqual([{ ...task, search_matches: [] }]);
  expect([
    cache.usage.entries,
    cache.usage.pending,
    cache.usage.chargedBytes,
  ]).toEqual([0, 0, 0]);
});

it("revokes suspended and late-field admission on Purge, Profile delete and close", async () => {
  for (const action of ["purge", "profile", "close"]) {
    const cache = new TaskSearchCache();
    const read = cache.read(profile);
    const pause = gate();
    const text = "Café ".repeat(200);
    const running = Effect.runPromise(
      prepare(cache, read, [text, "Late field B"], pause.checkpoint),
    );
    await pause.arrived;
    expect([cache.usage.pending, cache.usage.pendingBytes]).toEqual([1, 2148]);
    if (action === "purge") cache.clearAll();
    else if (action === "profile") cache.evictProfile(profile);
    else cache.close();
    pause.release();
    const values = await running;
    expect(values[0]?.preparedUnits).toBe(1000);
    expect(values[1]).toEqual({
      words: [
        { text: "late", start: 0, end: 4 },
        { text: "field", start: 5, end: 10 },
        { text: "b", start: 11, end: 12 },
      ],
      preparedUnits: 12,
    });
    expect([
      cache.usage.entries,
      cache.usage.pending,
      cache.usage.chargedBytes,
    ]).toEqual([0, 0, 0]);
    cache.close();
  }
});

it("fences pending and slotless old reads across a cache-wide clear", async () => {
  const cache = new TaskSearchCache();
  const oldRead = cache.read(profile);
  const text = "Café ".repeat(200);
  const pause = gate();
  const pending = Effect.runPromise(
    prepare(cache, oldRead, [text, "Late field"], pause.checkpoint),
  );
  await pause.arrived;
  cache.clearAll();
  expect([
    cache.usage.entries,
    cache.usage.pending,
    cache.usage.chargedBytes,
  ]).toEqual([0, 0, 0]);
  pause.release();
  await pending;
  await Effect.runPromise(prepare(cache, oldRead, ["No slot before clear"]));
  expect([
    cache.usage.entries,
    cache.usage.pending,
    cache.usage.chargedBytes,
  ]).toEqual([0, 0, 0]);
  expect(cache.read(profile).epoch).toBe(oldRead.epoch + 1);
  await Effect.runPromise(prepare(cache, cache.read(profile), ["Fresh read"]));
  expect(cache.usage.entries).toBe(1);
  cache.close();
});

it("cleans pending charges through the real runner on interruption", async () => {
  const cache = new TaskSearchCache();
  const pause = gate();
  const controller = new AbortController();
  const running = Effect.runPromiseExit(
    prepare(
      cache,
      cache.read(profile),
      ["Café ".repeat(200)],
      pause.checkpoint,
    ).pipe(Effect.catchDefect((error) => Effect.fail(String(error)))),
    { signal: controller.signal },
  );
  await pause.arrived;
  controller.abort();
  const exit = await running;
  expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(
    true,
  );
  expect([
    cache.usage.entries,
    cache.usage.pending,
    cache.usage.chargedBytes,
  ]).toEqual([0, 0, 0]);
  pause.release();
  cache.close();
});

it("keeps a newer completion when an evicted older miss finishes last", async () => {
  const cache = new TaskSearchCache();
  const read = cache.read(profile);
  const text = "Café ".repeat(200);
  const a = gate();
  const b = gate();
  const runningA = Effect.runPromise(
    prepare(cache, read, [text], a.checkpoint),
  );
  await a.arrived;
  cache.evict(profile, text);
  const runningB = Effect.runPromise(
    prepare(cache, read, [text], b.checkpoint),
  );
  await b.arrived;
  b.release();
  const [preparedB] = await runningB;
  a.release();
  const [preparedA] = await runningA;
  expect(preparedA).not.toBe(preparedB);
  const [hit] = await Effect.runPromise(prepare(cache, read, [text]));
  expect(hit).toBe(preparedB);
  expect(cache.usage.pending).toBe(0);
  cache.close();
});

it("uses the same exact budget boundary cold, partly warm, warm and uncached", async () => {
  const searched = { ...task, title: "abcde", description: "abxde abxde" };
  for (const limit of [17.5, 17.6]) {
    for (const mode of ["cold", "partial", "warm", "uncached"]) {
      const cache = new TaskSearchCache();
      const read = cache.read(profile);
      if (mode === "partial" || mode === "warm")
        await Effect.runPromise(prepare(cache, read, [searched.title]));
      if (mode === "warm")
        await Effect.runPromise(prepare(cache, read, [searched.description]));
      const work = new TaskSearchWork(limit);
      const response = await Effect.runPromise(
        filterTaskRecordsEffect(
          [searched],
          { text: "abcde" },
          { projects: [], tags: [] },
          {
            work,
            prepare:
              mode === "uncached"
                ? fieldWords
                : (text) => cache.words(read, text),
          },
        ).pipe(
          Effect.map((records) => ({ records })),
          Effect.catch((error) =>
            Effect.succeed({ code: error.code, work: error.work }),
          ),
        ),
      );
      expect({
        prepared: work.preparedUnits,
        cells: work.damerauCells,
        visits: work.clauseVisits,
        units: work.units,
      }).toEqual({ prepared: 16, cells: 13, visits: 3, units: 17.6 });
      expect(response).toEqual(
        limit === 17.5
          ? { code: "search_too_broad", work: 17.6 }
          : {
              records: [
                {
                  ...searched,
                  search_matches: [
                    { field: "title", start: 0, end: 5 },
                    { field: "description", start: 0, end: 5 },
                    { field: "description", start: 6, end: 11 },
                  ],
                },
              ],
            },
      );
      expect(cache.usage.pending).toBe(0);
      cache.close();
    }
  }
});
