import { Database } from "bun:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
const config = JSON.parse(
    readFileSync(".scratch/sync-patches/owner/fixture.json", "utf8"),
  ),
  db = new Database(config.path, { readonly: true });
const sleep = (n: number) => new Promise((r) => setTimeout(r, n)),
  results = [];
for (let pair = 0; pair < 5; pair++)
  for (const subscribers of [1, 2, 5])
    for (const arm of pair % 2
      ? ["shared20", "per-subscription250"]
      : ["per-subscription250", "shared20"]) {
      const timers = [],
        period = arm === "shared20" ? 20 : 250,
        count = arm === "shared20" ? 1 : subscribers;
      let wakes = 0;
      for (let i = 0; i < count; i++)
        timers.push(
          setInterval(() => {
            wakes++;
            db.query(
              arm === "shared20"
                ? "PRAGMA data_version"
                : "SELECT coalesce(max(seq),0) FROM op_log",
            ).get();
          }, period),
        );
      const cpu = process.cpuUsage(),
        t = performance.now(),
        load = loadavg();
      await sleep(1000);
      const use = process.cpuUsage(cpu);
      for (const timer of timers) clearInterval(timer);
      results.push({
        pair,
        subscribers,
        arm,
        load,
        elapsed_ms: performance.now() - t,
        cpu_ms: (use.user + use.system) / 1000,
        wakes,
      });
    }
db.close();
writeFileSync(
  "docs/evidence/sync-experiment/idle.json",
  JSON.stringify(results, null, 2),
);
console.log("idle", results.length);
