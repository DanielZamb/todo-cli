import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-sqlite/expiry",
);
mkdirSync(evidence, { recursive: true });
const f = await diagnosticFixture(true, 0, [
    resolve(".scratch/bin/sqlite-clock-server"),
  ]),
  headers = {
    Authorization: "Bearer " + f.credential,
    "Content-Type": "application/json",
  },
  batch = modelBatch(),
  rows: { elapsed_ms: number; failures: number; task_ms: number }[] = [];
try {
  assert.equal(
    (
      await fetch(f.url + "/diagnostics/profiler/ingest", {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      })
    ).status,
    200,
  );
  const db = new Database(
    join(f.scratch, "diagnostic-recordings", "recordings.db"),
  );
  db.exec(
    "CREATE TRIGGER fail_expiry BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'controlled persistent deletion failure');END;",
  );
  db.close();
  writeFileSync(join(f.scratch, "identity-clock-days"), "8");
  const began = performance.now();
  for (let i = 0; i < 64; i++) {
    const r = await fetch(f.url + "/diagnostics/profiler/runs", { headers });
    assert.equal(r.status, 200);
    const value = await r.json(),
      elapsed = performance.now() - began;
    assert.equal(value.runs.length, 0);
    assert.equal(
      value.status.loss.storage_failures,
      elapsed < 59000
        ? 1
        : elapsed >= 62000
          ? 2
          : value.status.loss.storage_failures,
    );
    assert.ok(value.status.loss.storage_failures <= 2);
    const t = performance.now(),
      created = await fetch(f.url + "/profiles/work/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "Task through persistent expiry failure " + i,
          source: "manual",
        }),
      });
    assert.equal(created.status, 200);
    assert.equal((await created.json()).row_version, 1);
    rows.push({
      elapsed_ms: elapsed,
      failures: value.status.loss.storage_failures,
      task_ms: performance.now() - t,
    });
    await Bun.sleep(1000);
  }
  const repaired = new Database(
    join(f.scratch, "diagnostic-recordings", "recordings.db"),
  );
  repaired.exec("DROP TRIGGER fail_expiry");
  repaired.close();
  const retry = await fetch(f.url + "/diagnostics/profiler/ingest", {
    method: "POST",
    headers,
    body: JSON.stringify(modelBatch()),
  });
  assert.equal(retry.status, 200);
  const final = await (
    await fetch(f.url + "/diagnostics/profiler/runs", { headers })
  ).json();
  assert.equal(final.status.loss.expired_events, 3);
  assert.equal(final.runs.length, 1);
  const failures = rows.filter(
    (r, i) => i === 0 || r.failures !== rows[i - 1]?.failures,
  );
  assert.equal(failures.length, 2);
  const [first, second] = failures;
  assert.ok(first && second);
  assert.ok(second.elapsed_ms - first.elapsed_ms >= 60000);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({ result: "PASS", rows, final }, null, 2),
  );
} finally {
  await f.close();
}
