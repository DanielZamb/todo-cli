import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-sqlite/writers",
);
mkdirSync(evidence, { recursive: true });
const f = await diagnosticFixture(true, 1),
  b = spawn(resolve(".scratch/bin/todo-server"), [], {
    env: f.env,
    stdio: ["ignore", "pipe", "pipe"],
  }),
  headers = {
    Authorization: "Bearer " + f.credential,
    "Content-Type": "application/json",
  },
  batch = modelBatch();
let log = "";
b.stdout.on("data", (x) => (log += x));
b.stderr.on("data", (x) => (log += x));
try {
  let url = "";
  const end = Date.now() + 60000;
  while (!url && Date.now() < end) {
    assert.equal(b.exitCode, null, log);
    url = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
    if (!url) await Bun.sleep(5);
  }
  assert.ok(url);
  const replies = await Promise.all(
    Array.from({ length: 32 }, async (_, i) => {
      const r = await fetch(
        (i % 2 ? url : f.url) + "/diagnostics/profiler/ingest",
        { method: "POST", headers, body: JSON.stringify(batch) },
      );
      const body = await r.json();
      assert.ok([200, 500].includes(r.status));
      if (r.status === 200) {
        assert.equal(body.accepted, true);
        assert.equal(body.durability, "stored");
      }
      return { status: r.status, body };
    }),
  );
  assert.ok(replies.some((r) => r.status === 200));
  for (const base of [f.url, url]) {
    const response = await fetch(
      base + "/diagnostics/profiler/runs/" + batch.run.run_id + "/export",
      { headers },
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).batches[0]?.events.length, 3);
    const create = await fetch(base + "/profiles/work/tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Task from independent writer " + base,
        source: "manual",
      }),
    });
    assert.equal(create.status, 200);
    assert.equal((await create.json()).row_version, 1);
  }
  const tasks = await (
    await fetch(f.url + "/profiles/work/tasks", { headers })
  ).json();
  assert.equal(tasks.length, 3);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      { result: "PASS", replies, task_count: 3, event_count: 3 },
      null,
      2,
    ),
  );
} finally {
  if (b.exitCode === null && b.signalCode === null) {
    const done = new Promise<void>((r) => b.once("exit", () => r()));
    b.kill("SIGTERM");
    await done;
  }
  writeFileSync(join(evidence, "second-server.log"), log);
  await f.close();
}
