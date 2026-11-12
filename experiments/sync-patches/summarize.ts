import { readFileSync } from "node:fs";
import { stats } from "./stats.ts";
const read = (s: string) =>
  JSON.parse(
    readFileSync("docs/evidence/sync-experiment/" + s + ".json", "utf8"),
  );
if (process.argv[2] === "wake") {
  const rows = read("wake");
  for (const arm of [...new Set(rows.map((r: { arm: string }) => r.arm))]) {
    const a = rows.filter((r: { arm: string }) => r.arm === arm);
    console.log(
      arm,
      JSON.stringify({
        apply: stats(a.flatMap((r: { latencies: number[] }) => r.latencies)),
        burst: a.map((r: { burst: unknown }) => r.burst),
        missed: a.map((r: { missed_ms: number }) => r.missed_ms),
        idle: a[0].idle,
      }),
    );
  }
} else {
  const { results } = read("bench");
  for (const fixture of ["owner", "large"])
    for (const arm of ["off", "stored", "memory"]) {
      const r = results.filter(
        (r: { fixture: string; arm: string; kind: string }) =>
          r.fixture === fixture && r.arm === arm && r.kind !== "midnight",
      );
      console.log(
        fixture,
        arm,
        JSON.stringify(
          Object.fromEntries(
            [
              "command_ms",
              "reply_ms",
              "cpu_ms",
              "wal_bytes",
              "replica_json_bytes",
              "ring_bytes",
            ].map((k) => [
              k,
              stats(r.map((x: Record<string, number>) => x[k] ?? 0)),
            ]),
          ),
        ),
      );
    }
}
