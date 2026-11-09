import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { Schema } from "effect";
import { ProfileId } from "../../../packages/domain/src/ids.ts";
import { TaskSearchCache } from "../../../packages/domain/src/task-search-cache.ts";
import { fieldWords } from "../../../packages/domain/src/task-search.ts";
const profile = Schema.decodeUnknownSync(ProfileId)("micro");
const samples = [];
const cache = new TaskSearchCache();
const cases = [
  "Café invoice tomorrow",
  "rent café ".repeat(10000),
  "a ".repeat(50000),
];
for (let run = 0; run < 5; run++) {
  for (const text of cases) {
    cache.clear();
    const expected = fieldWords(text);
    assert.deepEqual(cache.words(profile, text), expected);
    for (const mode of ["uncached", "cached"]) {
      const times = [];
      let wordCount = 0;
      for (let i = 0; i < 25; i++) {
        const started = performance.now();
        const words =
          mode === "cached" ? cache.words(profile, text) : fieldWords(text);
        times.push(performance.now() - started);
        wordCount += words.length;
        assert.deepEqual(words, expected);
      }
      samples.push({
        run,
        length: text.length,
        mode,
        times,
        wordCount,
        usage: cache.usage,
      });
    }
  }
}
cache.clear();
Bun.gc(true);
const before = process.memoryUsage();
for (let i = 0; i < 4097; i++) cache.words(profile, `Café invoice ${i}`);
Bun.gc(true);
const after = process.memoryUsage();
writeFileSync(
  process.argv[2] ?? "micro.json",
  JSON.stringify(
    {
      samples,
      heap: { before, after, usage: cache.usage },
      limits:
        "Accounting is deterministic; GC, string sharing, Map, allocator and runtime overhead make actual RSS different.",
    },
    null,
    2,
  ),
);
