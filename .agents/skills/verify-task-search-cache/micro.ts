import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { performance } from "node:perf_hooks";
import { Effect, Schema } from "effect";
import { ProfileId } from "../../../packages/domain/src/ids.ts";
import { runTaskRecordSteps } from "../../../packages/domain/src/task-filters.ts";
import type { TaskRead } from "../../../packages/domain/src/task-read.ts";
import { TaskSearchCache } from "../../../packages/domain/src/task-search-cache.ts";
import {
  fieldWords,
  type PreparedField,
} from "../../../packages/domain/src/task-search.ts";
const profile = Schema.decodeUnknownSync(ProfileId)("micro");
function prepare(
  provider: (text: string) => Generator<void, PreparedField>,
  text: string,
) {
  const captured: PreparedField[] = [];
  function* steps(): Generator<void, TaskRead[]> {
    captured.push(yield* provider(text));
    return [];
  }
  return runTaskRecordSteps(steps(), Effect.void).pipe(
    Effect.map(() => {
      const value = captured[0];
      assert.ok(value);
      return value;
    }),
  );
}
const samples = [];
const cases = [
  "Café invoice tomorrow",
  "rent café ".repeat(10000),
  "a ".repeat(50000),
];
for (let run = 0; run < 5; run++) {
  for (const text of cases) {
    const cache = new TaskSearchCache();
    const read = cache.read(profile);
    const expected = await Effect.runPromise(prepare(fieldWords, text));
    assert.deepEqual(
      await Effect.runPromise(
        prepare((value) => cache.words(read, value), text),
      ),
      expected,
    );
    const retained = cache.usage.entries === 1;
    for (const mode of ["uncached", "memo"]) {
      const times = [];
      const cpu = [];
      const loads = [];
      let wordCount = 0;
      for (let index = 0; index < 25; index++) {
        const freshText = Buffer.from(text, "utf8").toString("utf8");
        const provider =
          mode === "memo"
            ? (value: string) => cache.words(read, value)
            : fieldWords;
        loads.push(loadavg());
        const cpuBefore = process.cpuUsage();
        const started = performance.now();
        const value = await Effect.runPromise(prepare(provider, freshText));
        times.push(performance.now() - started);
        cpu.push(process.cpuUsage(cpuBefore));
        wordCount += value.words.length;
        assert.deepEqual(value, expected);
      }
      samples.push({
        run,
        length: text.length,
        mode:
          mode === "memo"
            ? retained
              ? "actual-hit"
              : "oversize-uncached"
            : mode,
        times,
        cpu,
        loads,
        wordCount,
        preparedUnits: expected.preparedUnits,
        usage: cache.usage,
      });
    }
    cache.close();
  }
}
Bun.gc(true);
const before = process.memoryUsage();
const cache = new TaskSearchCache();
const read = cache.read(profile);
for (let index = 0; index < 4097; index++)
  await Effect.runPromise(
    prepare((value) => cache.words(read, value), `Café invoice ${index}`),
  );
Bun.gc(true);
const after = process.memoryUsage();
writeFileSync(
  process.argv[2] ?? "micro.json",
  JSON.stringify(
    {
      samples,
      heap: { before, after, usage: cache.usage },
      limits:
        "Same real SEC runner on both paths; fresh equal UTF-8-decoded input before each interval. Full payload validation is outside measured interval. Actual hit includes 100k exact-key construction/hash/lookup and runner cost. Deterministic accounting is not RSS. Oversized dense fields are explicitly uncached.",
    },
    null,
    2,
  ),
);
cache.close();
