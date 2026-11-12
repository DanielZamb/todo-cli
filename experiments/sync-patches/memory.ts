import { heapStats } from "bun:jsc";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { stats } from "./stats.ts";
const samples = JSON.parse(
    readFileSync("docs/evidence/sync-experiment/samples.json", "utf8"),
  ),
  result = [];
for (const kind of ["description", "batch", "complete"]) {
  const s = samples.find((x: { kind: string }) => x.kind === kind),
    text = JSON.stringify(s.whole),
    baseline = JSON.stringify(s.after),
    rings = [],
    replicas = [];
  for (let pair = 0; pair < 5; pair++) {
    Bun.gc(true);
    const before = heapStats().heapSize;
    const ring = Array.from({ length: 256 }, () => JSON.parse(text));
    Bun.gc(true);
    rings.push(heapStats().heapSize - before);
    assert.equal(ring.length, 256);
    Bun.gc(true);
    const start = heapStats().heapSize;
    const replicas256 = Array.from({ length: 256 }, () => JSON.parse(baseline));
    Bun.gc(true);
    replicas.push((heapStats().heapSize - start) / 256);
    assert.equal(replicas256[0].cursor, s.after.cursor);
  }
  result.push({
    kind,
    ring_heap_delta_bytes: stats(rings),
    replica_heap_delta_per_copy_bytes: stats(replicas),
    encoded_ring_bytes: Buffer.byteLength(text) * 256,
  });
}
writeFileSync(
  "docs/evidence/sync-experiment/memory.json",
  JSON.stringify(result, null, 2),
);
console.log("memory", result.length);
