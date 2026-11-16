import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ??
    "docs/evidence/ui-speed/recordings-sql-corrections/factory",
);
mkdirSync(evidence, { recursive: true });
const f = await diagnosticFixture(true, 1, [
    resolve(".scratch/bin/sqlite-factory-server"),
  ]),
  headers = {
    Authorization: "Bearer " + f.credential,
    "Content-Type": "application/json",
  };
try {
  assert.ok(existsSync(join(f.scratch, "factory-failed")));
  const tasks = await fetch(f.url + "/profiles/work/tasks", { headers });
  assert.equal(tasks.status, 200);
  assert.deepEqual(
    (await tasks.json()).map((t: { title: string }) => t.title),
    ["Benchmark Task 000"],
  );
  const diag = await (await fetch(f.url + "/diagnostics", { headers })).json();
  writeFileSync(
    join(evidence, "initial-diagnostics.json"),
    JSON.stringify(diag, null, 2),
  );
  assert.ok(
    diag.errors.some(
      (e: { code: string }) =>
        e.code ===
        "Recordings unavailable; failures: 1; dropped batches: 0; dropped events: 0",
    ),
  );
  assert.equal(
    (await fetch(f.url + "/diagnostics/profiler/runs", { headers })).status,
    400,
  );
  const task = await fetch(f.url + "/profiles/work/tasks", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Task through factory failure",
      source: "manual",
    }),
  });
  assert.equal(task.status, 200);
  assert.equal((await task.json()).row_version, 1);
  writeFileSync(join(f.scratch, "factory-repaired"), "repaired");
  const until = Date.now() + 65000;
  let recovered = false;
  while (Date.now() < until) {
    if (
      (await fetch(f.url + "/diagnostics/profiler/runs", { headers }))
        .status === 200
    ) {
      recovered = true;
      break;
    }
    await Bun.sleep(250);
  }
  assert.equal(recovered, true);
  const b = modelBatch();
  assert.equal(
    (
      await fetch(f.url + "/diagnostics/profiler/ingest", {
        method: "POST",
        headers,
        body: JSON.stringify(b),
      })
    ).status,
    200,
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      { result: "PASS", diag, task_status: 200, recovered },
      null,
      2,
    ),
  );
} finally {
  await f.close();
}
