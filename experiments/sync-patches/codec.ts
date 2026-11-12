import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { Schema } from "effect";
import { Replica, Patch } from "./model.ts";
import { applyPatch } from "./patch.ts";
import { stats } from "./stats.ts";
const data = JSON.parse(
    readFileSync("docs/evidence/sync-experiment/bench.json", "utf8"),
  ),
  results = [];
for (let pair = 0; pair < 5; pair++)
  for (const sample of pair % 2 ? [...data.samples].reverse() : data.samples) {
    for (const kind of pair % 2
      ? ["edits", "whole", "baseline"]
      : ["baseline", "whole", "edits"]) {
      const value = kind === "baseline" ? sample.after : sample[kind],
        text = JSON.stringify(value),
        times: Record<"parse" | "validate" | "apply", number[]> = {
          parse: [],
          validate: [],
          apply: [],
        };
      for (let i = 0; i < 110; i++) {
        let t = performance.now();
        const parsed: unknown = JSON.parse(text);
        if (i >= 10) times.parse.push(performance.now() - t);
        t = performance.now();
        const decoded =
          kind === "baseline"
            ? Schema.decodeUnknownSync(Replica)(parsed)
            : Schema.decodeUnknownSync(Patch)(parsed);
        if (i >= 10) times.validate.push(performance.now() - t);
        t = performance.now();
        const replica =
          "from" in decoded ? applyPatch(sample.before, decoded) : decoded;
        if (i >= 10) times.apply.push(performance.now() - t);
        if (!process.env.SYNC_CODEC_PROFILE || i === 0)
          assert.deepEqual(replica, sample.after);
        else assert.equal(replica.cursor, sample.after.cursor);
      }
      results.push({
        pair,
        kind,
        operation: sample.kind,
        fixture: Object.keys(sample.after.profiles).length,
        load: loadavg(),
        bytes: Buffer.byteLength(text),
        parse: stats(times.parse),
        validate: stats(times.validate),
        apply: stats(times.apply),
      });
    }
  }
writeFileSync(
  "docs/evidence/sync-experiment/" +
    (process.env.SYNC_CODEC_PROFILE ? "codec-profiled" : "codec") +
    ".json",
  JSON.stringify(results, null, 2),
);
writeFileSync(
  "docs/evidence/sync-experiment/samples.json",
  JSON.stringify(data.samples),
);
console.log("codec", results.length);
