import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join, resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { RecordingDatabase } from "../../../../packages/domain/src/recordings-sqlite.ts";
import { validateRecordingBatch } from "../../../../packages/domain/src/diagnostic-recordings.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-sqlite/startup",
);
mkdirSync(evidence, { recursive: true });
const f = await diagnosticFixture(true, 1),
  root = join(f.scratch, "diagnostic-recordings"),
  headers = { Authorization: "Bearer " + f.credential },
  rows: object[] = [];
let server: ReturnType<typeof spawn> | undefined, lock: Database | undefined;
try {
  const ended = new Promise<void>((r) => f.server.once("exit", () => r()));
  f.server.kill("SIGTERM");
  await ended;
  const db = new RecordingDatabase(root),
    base = modelBatch();
  try {
    for (let i = 0; i < 4096; i++) {
      const b = modelBatch(base.run.run_id);
      const receipt = db.ingest(
        validateRecordingBatch({
          ...b,
          events: [
            {
              ...b.events[0],
              sequence: i + 1,
              name: "span.finished",
              stage: "ipc",
              duration_ms: 1,
              outcome: "completed",
            },
          ],
        }),
        Date.now(),
      );
      assert.equal(receipt.accepted, true);
    }
    assert.equal(db.status().segments, 4096);
  } finally {
    db.close();
  }
  for (let pair = 0; pair < 5; pair++)
    for (const full of pair % 2 ? [true, false] : [false, true]) {
      const before = loadavg(),
        t = performance.now(),
        opened = new RecordingDatabase(
          full ? root : join(f.scratch, "empty-recordings"),
        );
      const elapsed = performance.now() - t,
        status = opened.status();
      opened.close();
      rows.push({
        pair,
        full,
        open_ms: elapsed,
        load_start: before,
        load_end: loadavg(),
        status,
      });
    }
  lock = new Database(join(root, "recordings.db"));
  lock.exec("PRAGMA journal_mode=WAL;BEGIN IMMEDIATE");
  let log = "";
  const began = performance.now();
  server = spawn(resolve(".scratch/bin/todo-server"), [], {
    env: f.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (x) => (log += x));
  server.stderr?.on("data", (x) => (log += x));
  let url = "";
  const deadline = Date.now() + 60000;
  while (!url && Date.now() < deadline) {
    assert.equal(server.exitCode, null, log);
    url = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
    if (!url) await Bun.sleep(5);
  }
  assert.ok(url, log);
  const ready = performance.now() - began;
  const tasks = await fetch(url + "/profiles/work/tasks", { headers });
  assert.equal(tasks.status, 200);
  assert.deepEqual(
    (await tasks.json()).map((t: { title: string }) => t.title),
    ["Benchmark Task 000"],
  );
  const taskReady = performance.now() - began;
  let settled = false;
  const query = fetch(url + "/diagnostics/profiler/runs", { headers }).then(
    async (r) => {
      settled = true;
      assert.equal(r.status, 200);
      return r.json();
    },
  );
  await Bun.sleep(20);
  assert.equal(settled, false);
  lock.exec("ROLLBACK");
  lock.close();
  lock = undefined;
  const runs = await query;
  assert.equal(runs.runs[0]?.events, 4096);
  assert.equal(runs.status.segments, 4096);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        rows,
        server_ready_ms: ready,
        task_read_while_recordings_locked_ms: taskReady,
        recordings_ready_ms: performance.now() - began,
        status: runs.status,
      },
      null,
      2,
    ),
  );
  writeFileSync(join(evidence, "server.log"), log);
} finally {
  if (lock) {
    lock.exec("ROLLBACK");
    lock.close();
  }
  if (server && server.exitCode === null && server.signalCode === null) {
    const done = new Promise<void>((r) => server?.once("exit", () => r()));
    server.kill("SIGTERM");
    await done;
  }
  await f.close();
}
