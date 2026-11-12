import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { serialize } from "node:v8";
import { loadavg } from "node:os";
import { Schema } from "effect";
import { Replica, Patch } from "./model.ts";
import { applyPatch, bytes } from "./patch.ts";
import { stats } from "./stats.ts";
const samples = JSON.parse(
    readFileSync("docs/evidence/sync-experiment/bench.json", "utf8"),
  ).samples,
  results = [];
for (const s of samples) {
  const p = Schema.decodeUnknownSync(Patch)(s.whole),
    b = Buffer.from(JSON.stringify(p)),
    replica = Schema.decodeUnknownSync(Replica)(s.after);
  const ring = Array.from({ length: 256 }, () => JSON.parse(b.toString()));
  const raw = 256 * b.byteLength,
    encoded = raw,
    decoded = serialize(ring).byteLength;
  let retained = 256,
    total = raw;
  while (total > 1048576 && retained > 0) {
    total -= b.byteLength;
    retained--;
  }
  const reconnect = [];
  for (const seconds of [1, 10, 60, 3600]) {
    const missed = Math.ceil(seconds),
      catchup = missed <= retained && missed * b.byteLength < bytes(replica);
    const times = [];
    for (let n = 0; n < 100; n++) {
      const t = performance.now();
      if (catchup) {
        let current = s.before;
        for (let i = 0; i < missed; i++) {
          const patch = Schema.decodeUnknownSync(Patch)(
            JSON.parse(b.toString()),
          );
          current = applyPatch({ ...current, cursor: patch.from }, patch);
        }
        assert.equal(current.cursor, p.to);
      } else {
        const r = Schema.decodeUnknownSync(Replica)(
          JSON.parse(JSON.stringify(replica)),
        );
        assert.equal(r.cursor, replica.cursor);
      }
      times.push(performance.now() - t);
    }
    reconnect.push({
      seconds,
      assumed_operations_per_second: 1,
      missed,
      choice: catchup ? "ring" : "baseline",
      bytes: catchup ? missed * b.byteLength : bytes(replica),
      time_ms: stats(times),
    });
  }
  results.push({
    operation: s.kind,
    load: loadavg(),
    patch_bytes: b.byteLength,
    raw_bytes: raw,
    encoded_bytes: encoded,
    decoded_serialized_bytes: decoded,
    baseline_bytes: bytes(replica),
    count_at_1mib: retained,
    retained_bytes: total,
    one_inflight_bytes: b.byteLength,
    reconnect,
  });
}
writeFileSync(
  "docs/evidence/sync-experiment/retention.json",
  JSON.stringify(results, null, 2),
);
console.log("retention", results.length);
