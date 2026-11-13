import "./sqlite-progress-preload.ts";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir, loadavg } from "node:os";
import { join, resolve } from "node:path";
import { RecordingDatabase } from "../../../../packages/domain/src/recordings-sqlite.ts";
import { DiagnosticRecordings } from "../../../../packages/domain/src/recordings.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
import { validateRecordingBatch } from "../../../../packages/domain/src/diagnostic-recordings.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-sql-progress/progress",
);
mkdirSync(evidence, { recursive: true });
const rows = [];
for (const mode of ["slow", "stop"]) {
  const root = await mkdtemp(join(tmpdir(), "todo-read-progress-")),
    native = new RecordingDatabase(root),
    seed = modelBatch();
  for (let n = 0; n < 32; n++)
    assert.equal(
      native.ingest(
        validateRecordingBatch({
          ...seed,
          batch_id: crypto.randomUUID(),
          events: Array.from({ length: 128 }, (_, i) => ({
            ...seed.events[0],
            sequence: n * 128 + i + 1,
            monotonic_ms: n * 128 + i + 1,
            action_id: crypto.randomUUID(),
          })),
        }),
        Date.now(),
      ).accepted,
      true,
    );
  native.close();
  const s = await DiagnosticRecordings.open(root),
    load = loadavg(),
    start = performance.now();
  try {
    await writeFile(join(root, "read-mode"), mode);
    const result = await s.show(seed.run.run_id).catch((e) => e);
    assert.equal(result.reason, "rpc_deadline");
    const settled_ms = performance.now() - start;
    assert.ok(settled_ms < 8000);
    assert.equal(s.health().condition, "available");
    const limit = performance.now() + 15000;
    if (mode === "slow") {
      while (Reflect.get(s, "active") && performance.now() < limit)
        await Bun.sleep(50);
      assert.equal(Reflect.get(s, "active"), undefined);
      assert.equal(s.health().condition, "available");
      await writeFile(join(root, "read-mode"), "");
      assert.equal((await s.ingest(modelBatch())).accepted, true);
      assert.equal(
        (await s.show(seed.run.run_id).catch((e) => e)).reason,
        "rpc_capacity",
      );
      const rateClient = await DiagnosticRecordings.open(root);
      try {
        await rateClient.show(seed.run.run_id);
        const offers = await Promise.all(
          Array.from({ length: 224 }, () =>
            rateClient.show(seed.run.run_id).catch((e) => e),
          ),
        );
        assert.ok(offers.some((e) => e.reason === "rpc_capacity"));
        assert.equal(rateClient.health().condition, "available");
      } finally {
        await rateClient.close();
      }
    } else {
      assert.ok(existsSync(join(root, "read-stopped")));
      const admissionStarted = performance.now();
      assert.equal((await s.ingest(modelBatch())).accepted, false);
      assert.ok(performance.now() - admissionStarted < 1000);
      while (
        s.health().condition !== "unavailable" &&
        performance.now() < limit
      )
        await Bun.sleep(50);
      assert.equal(s.health().condition, "unavailable");
      assert.equal(s.status().queued_bytes, 0);
    }
    rows.push({
      mode,
      settled_ms,
      elapsed_ms: performance.now() - start,
      max_step_ms: Reflect.get(s, "maxStepMs"),
      health: s.health(),
      load_start: load,
      load_end: loadavg(),
    });
  } finally {
    await s.close();
    await rm(root, { recursive: true, force: true });
  }
}
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify({ result: "PASS", rows }, null, 2),
);
