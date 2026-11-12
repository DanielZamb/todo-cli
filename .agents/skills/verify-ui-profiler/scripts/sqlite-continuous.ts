import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir, loadavg } from "node:os";
import { join, resolve } from "node:path";
import { DiagnosticRecordings } from "../../../../packages/domain/src/recordings.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-sqlite/continuous",
);
mkdirSync(evidence, { recursive: true });
const p = await mkdtemp(join(tmpdir(), "todo-sql-serial-")),
  s = await DiagnosticRecordings.open(p, { appBytes: 49152 }),
  start = performance.now(),
  load = loadavg();
try {
  for (let i = 0; i < 1001; i++) {
    const b = modelBatch(),
      r = await s.ingest(b);
    assert.equal(r.accepted, true);
    assert.equal(r.durability, "stored");
    assert.equal(r.status.segments, 1);
    assert.ok(r.status.bytes + r.status.admission_bytes <= 49152);
    assert.deepEqual(
      (await s.export(b.run.run_id)).batches[0]?.events,
      b.events,
    );
  }
  assert.equal(s.status().queued_bytes, 0);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        batches: 1001,
        events: 3003,
        all_acknowledged_facts_retrieved: true,
        elapsed_ms: performance.now() - start,
        load_start: load,
        load_end: loadavg(),
      },
      null,
      2,
    ),
  );
} finally {
  await s.close();
  await rm(p, { recursive: true, force: true });
}
