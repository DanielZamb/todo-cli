import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-sqlite/identity",
);
mkdirSync(evidence, { recursive: true });
const f = await diagnosticFixture(true, 1, [
    resolve(".scratch/bin/sqlite-clock-server"),
  ]),
  headers = {
    Authorization: "Bearer " + f.credential,
    "Content-Type": "application/json",
  },
  a = modelBatch();
const post = async (value: unknown) => {
  const r = await fetch(f.url + "/diagnostics/profiler/ingest", {
    method: "POST",
    headers,
    body: JSON.stringify(value),
  });
  return { status: r.status, body: await r.json() };
};
const get = async (path: string) => {
  const r = await fetch(f.url + path, { headers });
  return { status: r.status, body: await r.json() };
};
try {
  const first = await post(a);
  assert.equal(first.status, 200);
  assert.equal(first.body.accepted, true);
  const before = await get(
    "/diagnostics/profiler/runs/" + a.run.run_id + "/export",
  );
  assert.equal(before.status, 200);
  assert.equal(before.body.batches[0].events.length, 3);
  const exportedId = before.body.batches[0].batch_id;
  writeFileSync(join(f.scratch, "identity-clock-days"), "6");
  const b = { ...modelBatch(), batch_id: exportedId },
    second = await post(b);
  assert.equal(second.status, 200);
  assert.equal(second.body.accepted, true);
  writeFileSync(join(f.scratch, "identity-clock-days"), "8");
  const expired = await get("/diagnostics/profiler/runs");
  assert.ok(
    !expired.body.runs.some(
      (r: { run: { run_id: string } }) => r.run.run_id === a.run.run_id,
    ),
  );
  const retry = await post(a);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.accepted, true);
  assert.equal(retry.body.durability, "stored");
  const after = await get(
      "/diagnostics/profiler/runs/" + a.run.run_id + "/export",
    ),
    show = await get("/diagnostics/profiler/runs/" + a.run.run_id),
    task = await get("/profiles/work/tasks");
  assert.equal(task.status, 200);
  assert.deepEqual(
    task.body.map((t: { title: string }) => t.title),
    ["Benchmark Task 000"],
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        first,
        before,
        publicly_exported_segment_id_reused_as_batch_id: exportedId,
        second,
        expired,
        retry,
        after,
        show,
        task_read_passed: true,
      },
      null,
      2,
    ),
  );
  assert.equal(
    after.status,
    200,
    "HTTP accepted=true/durability=stored retry must export its three events after an unrelated batch used its public segment id",
  );
  assert.equal(after.body.batches[0].events.length, 3);
} finally {
  await f.close();
}
