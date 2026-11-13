import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recording-initialization-server",
);
mkdirSync(evidence, { recursive: true });
const f = await diagnosticFixture(true, 1);
let held: ChildProcess | undefined, restarted: ChildProcess | undefined;
const stop = async (c: ChildProcess | undefined) => {
  if (!c || c.exitCode !== null || c.signalCode !== null) return;
  const done = new Promise<void>((r) => c.once("exit", () => r()));
  c.kill("SIGTERM");
  await done;
};
try {
  await stop(f.server);
  await rm(join(f.scratch, "diagnostic-recordings"), {
    recursive: true,
    force: true,
  });
  held = spawn(
    resolve(".scratch/bin/sqlite-initialization"),
    ["child", f.scratch, "server-held"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const end = Date.now() + 60000;
  while (!existsSync(join(f.scratch, "server-held-ready")) && Date.now() < end)
    await Bun.sleep(5);
  assert.ok(existsSync(join(f.scratch, "server-held-ready")));
  restarted = spawn(resolve(".scratch/bin/todo-server"), [], {
    env: f.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  restarted.stdout?.on("data", (x) => (log += x));
  restarted.stderr?.on("data", (x) => (log += x));
  let url = "";
  const listening = Date.now() + 60000;
  while (!url && Date.now() < listening) {
    assert.equal(restarted.exitCode, null, log);
    url = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
    if (!url) await Bun.sleep(5);
  }
  assert.ok(url, log);
  const headers = {
    Authorization: "Bearer " + f.credential,
    "Content-Type": "application/json",
  };
  const tasks = await fetch(url + "/profiles/work/tasks", { headers });
  assert.equal(tasks.status, 200);
  assert.deepEqual(
    (await tasks.json()).map((t: { title: string }) => t.title),
    ["Benchmark Task 000"],
  );
  const created = await fetch(url + "/profiles/work/tasks", {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Task during excluded recording initialization",
    }),
  });
  assert.equal(created.status, 200);
  assert.equal((await created.json()).row_version, 1);
  assert.equal(existsSync(join(f.scratch, "server-held-resume")), false);
  writeFileSync(join(f.scratch, "server-held-resume"), "");
  const ready = Date.now() + 60000;
  let upload = 0;
  while (Date.now() < ready) {
    const r = await fetch(url + "/diagnostics/profiler/ingest", {
      method: "POST",
      headers,
      body: JSON.stringify(modelBatch()),
    });
    upload = r.status;
    if (upload === 200) break;
    await Bun.sleep(100);
  }
  assert.equal(upload, 200);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        task_read: 200,
        task_create: 200,
        recording_ingest_after_release: 200,
        log,
      },
      null,
      2,
    ),
  );
} finally {
  if (held && !existsSync(join(f.scratch, "server-held-resume")))
    writeFileSync(join(f.scratch, "server-held-resume"), "");
  await stop(restarted);
  await stop(held);
  await f.close();
}
