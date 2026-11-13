import "./sqlite-watchdog-preload.ts";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DiagnosticRecordings } from "../../../../packages/domain/src/recordings.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ??
    "docs/evidence/ui-speed/recordings-sql-corrections/watchdog",
);
mkdirSync(evidence, { recursive: true });
const root = await mkdtemp(join(tmpdir(), "todo-rpc-watchdog-")),
  s = await DiagnosticRecordings.open(join(root, "db")),
  batch = modelBatch(),
  pending: Promise<unknown>[] = [];
try {
  await writeFile(join(root, "controlled-worker-mode"), "hang");
  const began = performance.now();
  pending.push(s.ingest(batch));
  while (
    !existsSync(join(root, "controlled-worker-held")) &&
    performance.now() - began < 5000
  )
    await Bun.sleep(5);
  assert.ok(existsSync(join(root, "controlled-worker-held")));
  for (let i = 0; i < 1100; i++) pending.push(s.runs().catch((e) => e));
  await Bun.sleep(100);
  const count = Reflect.get(s, "pending").size;
  assert.ok(count <= 1024);
  assert.ok(s.status().queued_bytes <= 1048576);
  await Promise.allSettled(pending);
  const elapsed = performance.now() - began;
  assert.ok(elapsed < 8000);
  assert.equal(s.health().condition, "unavailable");
  assert.ok(s.status().loss.storage_failures >= 3);
  assert.equal(s.status().loss.dropped_batches, 1);
  assert.equal(s.status().loss.dropped_events, 3);
  assert.equal(Reflect.get(s, "pending").size, 0);
  await writeFile(join(root, "controlled-worker-mode"), "recover");
  const until = performance.now() + 65000;
  while (s.health().condition !== "available" && performance.now() < until)
    await Bun.sleep(100);
  assert.equal(s.health().condition, "available");
  assert.equal((await s.ingest(batch)).accepted, true);
  assert.equal((await s.export(batch.run.run_id)).batches[0]?.events.length, 3);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        pending_bound: count,
        settled_ms: elapsed,
        health: s.health(),
        status: s.status(),
      },
      null,
      2,
    ),
  );
} finally {
  await s.close();
  await rm(root, { recursive: true, force: true });
}
