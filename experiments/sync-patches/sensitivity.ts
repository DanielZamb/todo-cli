import { Effect } from "effect";
import { readFileSync, writeFileSync } from "node:fs";
import { openStore } from "../../packages/domain/src/store/store.ts";
import { baseline, database } from "./baseline.ts";
import { difference } from "./patch.ts";
import { stats } from "./stats.ts";
import { loadavg } from "node:os";
const config = JSON.parse(
    readFileSync(".scratch/sync-patches/owner/fixture.json", "utf8"),
  ),
  store = await Effect.runPromise(openStore({ path: config.path })),
  db = database(store),
  id = db
    .query<{ id: string }, []>("SELECT id FROM credentials LIMIT 1")
    .get()?.id;
const results = [];
for (let pair = 0; pair < 5; pair++)
  for (const extra of pair % 2 ? [true, false] : [false, true]) {
    const times = [],
      memory = [];
    for (let i = 0; i < 100; i++) {
      let t = performance.now();
      const r = baseline(store, "p0", config.at, extra ? id : undefined);
      times.push(performance.now() - t);
      t = performance.now();
      const next = baseline(store, "p0", config.at, extra ? id : undefined);
      difference(r, next, "whole");
      memory.push(performance.now() - t);
    }
    results.push({
      pair,
      extra,
      load: loadavg(),
      baseline_ms: stats(times),
      memory_read_diff_ms: stats(memory),
    });
  }
await Effect.runPromise(store.close());
writeFileSync(
  "docs/evidence/sync-experiment/sensitivity.json",
  JSON.stringify(results, null, 2),
);
console.log("sensitivity", results.length);
