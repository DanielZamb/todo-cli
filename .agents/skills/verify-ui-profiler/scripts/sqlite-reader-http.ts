import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadavg } from "node:os";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ??
    "docs/evidence/ui-speed/recordings-sql-corrections/reader-http",
);
mkdirSync(evidence, { recursive: true });
const f = await diagnosticFixture(true, 1),
  headers = {
    Authorization: "Bearer " + f.credential,
    "Content-Type": "application/json",
  },
  seeds = [modelBatch(), modelBatch(), modelBatch()],
  read_ms: number[] = [],
  write_ms: number[] = [],
  uploads: object[] = [],
  load = loadavg();
let reader: Database | undefined;
let admittedLoss:
  | { dropped_batches: number; dropped_events: number }
  | undefined;
const make = (n: number) => {
  const p = n % 3,
    seed = seeds[p]!,
    app = ["macos", "electron", "cli"][p]!,
    role = p === 1 ? "electron.renderer" : app;
  return {
    ...seed,
    batch_id: crypto.randomUUID(),
    run: { ...seed.run, app },
    events: Array.from({ length: 128 }, (_, i) => ({
      ...seed.events[0],
      process_role: role,
      sequence: Math.floor(n / 3) * 128 + i + 1,
      monotonic_ms: Math.floor(n / 3) * 128 + i + 1,
      name: "span.finished",
      stage: "ipc",
      duration_ms: 1,
      outcome: "completed",
    })),
  };
};
const upload = async (b: unknown) => {
  const at = performance.now(),
    r = await fetch(f.url + "/diagnostics/profiler/ingest", {
      method: "POST",
      headers,
      body: JSON.stringify(b),
    }),
    body = await r.json();
  return { status: r.status, body, elapsed_ms: performance.now() - at };
};
let tasks = 1,
  firstFailure = -1;
try {
  assert.equal((await upload(make(0))).status, 200);
  reader = new Database(
    join(f.scratch, "diagnostic-recordings", "recordings.db"),
  );
  reader.exec("BEGIN");
  reader.query("SELECT count(*) FROM events").get();
  for (let n = 1; n < 1000; n++) {
    const incoming = upload(make(n));
    if (n >= 240) {
      const at = performance.now(),
        r = await fetch(f.url + "/profiles/work/tasks", { headers });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).length, tasks);
      read_ms.push(performance.now() - at);
      const t = performance.now(),
        created = await fetch(f.url + "/profiles/work/tasks", {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: "Task during guarded checkpoint " + n,
          }),
        });
      assert.equal(created.status, 200);
      assert.equal((await created.json()).row_version, 1);
      tasks++;
      write_ms.push(performance.now() - t);
    }
    const result = await incoming;
    if (n >= 240) uploads.push({ n, ...result });
    if (result.status !== 200) {
      assert.equal(result.status, 500);
      firstFailure = n;
      break;
    }
    admittedLoss = result.body.status.loss;
  }
  assert.ok(firstFailure >= 240);
  for (let i = 0; i < 8; i++) {
    const b = make(firstFailure + 1 + i),
      at = performance.now(),
      p = upload(b),
      r = await fetch(f.url + "/profiles/work/tasks", { headers });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).length, tasks);
    read_ms.push(performance.now() - at);
    uploads.push({ n: firstFailure + 1 + i, ...(await p) });
  }
  const diag = await (await fetch(f.url + "/diagnostics", { headers })).json();
  const final = await (
    await fetch(f.url + "/diagnostics/profiler/runs", { headers })
  ).json();
  assert.ok(admittedLoss);
  assert.equal(
    final.status.loss.dropped_batches - admittedLoss.dropped_batches,
    9,
  );
  assert.equal(
    final.status.loss.dropped_events - admittedLoss.dropped_events,
    1152,
  );
  const expectedCode = `Recording storage held open by another reader; dropped batches: ${admittedLoss.dropped_batches + 9}; dropped events: ${admittedLoss.dropped_events + 1152}`;
  writeFileSync(
    join(evidence, "diagnostics.json"),
    JSON.stringify(diag, null, 2),
  );
  writeFileSync(
    join(evidence, "uploads.json"),
    JSON.stringify(uploads, null, 2),
  );
  assert.ok(diag.errors.some((e: { code: string }) => e.code === expectedCode));
  reader.exec("ROLLBACK");
  const retry = make(firstFailure + 20),
    attempts = [];
  for (let i = 0; i < 3; i++) {
    const r = await upload(retry);
    attempts.push(r.status);
    if (r.status === 200) break;
  }
  assert.ok(attempts.includes(200));
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        firstFailure,
        read_ms,
        write_ms,
        uploads,
        retry_statuses: attempts,
        admittedLoss,
        finalLoss: final.status.loss,
        load_start: load,
        load_end: loadavg(),
        notes:
          "Descriptive latency under physical-guard/checkpoint failures; not a paired regression estimate. Native busy_timeout remains 1 ms.",
      },
      null,
      2,
    ),
  );
} finally {
  reader?.close();
  await f.close();
}
