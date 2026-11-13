import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DiagnosticRecordings } from "../../../../packages/domain/src/recordings.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-sql-corrections/reader",
);
mkdirSync(evidence, { recursive: true });
const root = await mkdtemp(join(tmpdir(), "todo-reader-retry-"));
let now = Date.now();
const s = await DiagnosticRecordings.open(root, {
  totalBytes: 2097152,
  now: () => now,
});
await s.ingest(modelBatch());
const db = new Database(join(root, "recordings.db"));
db.exec("BEGIN");
db.query("SELECT count(*) FROM events").get();
try {
  let drops = 0;
  for (let i = 0; i < 200; i++)
    if (!(await s.ingest(modelBatch())).accepted) drops++;
  assert.ok(drops > 0);
  assert.equal(s.health().condition, "held_reader");
  assert.equal(s.status().loss.storage_failures, 0);
  assert.equal(s.status().loss.capacity_events, drops * 3);
  now += 8 * 86400000;
  await s.runs();
  const held = s.status();
  assert.equal(held.loss.storage_failures, 0);
  db.exec("ROLLBACK");
  const started = performance.now(),
    until = started + 70000;
  while (performance.now() < until) {
    const row = db
      .query<{ n: number }, []>("SELECT count(*) n FROM events")
      .get();
    if (row?.n === 0 && s.health().condition === "available") break;
    await Bun.sleep(250);
  }
  assert.deepEqual(db.query("SELECT count(*) n FROM events").get(), { n: 0 });
  assert.equal(s.health().condition, "available");
  const b = modelBatch();
  assert.equal((await s.ingest(b)).accepted, true);
  assert.equal(s.status().loss.storage_failures, 0);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        drops,
        held,
        recovery_ms: performance.now() - started,
        health: s.health(),
        status: s.status(),
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
  await s.close();
  await rm(root, { recursive: true, force: true });
}
