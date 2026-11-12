import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { DiagnosticRecordings } from "../../../../packages/domain/src/store/diagnostic-recordings.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-manifest/ready",
);
mkdirSync(evidence, { recursive: true });
const f = await diagnosticFixture(true, 1),
  headers = {
    Authorization: "Bearer " + f.credential,
    "Content-Type": "application/json",
  };
let child: ReturnType<typeof spawn> | undefined;
try {
  const end = new Promise<void>((r) => f.server.once("exit", () => r()));
  f.server.kill("SIGTERM");
  await end;
  const store = await DiagnosticRecordings.open(
    join(f.scratch, "diagnostic-recordings"),
  );
  store.ingest(modelBatch());
  await store.flush();
  await store.close();
  let log = "";
  child = spawn(resolve(".scratch/bin/manifest-startup-server"), [], {
    env: f.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout!.on("data", (x) => (log += x));
  child.stderr!.on("data", (x) => (log += x));
  let url = "";
  const deadline = Date.now() + 60000;
  while (
    (!url || !existsSync(join(f.scratch, "manifest-recovery-held"))) &&
    Date.now() < deadline
  ) {
    assert.equal(child.exitCode, null, log);
    url = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
    await Bun.sleep(10);
  }
  assert.ok(url);
  assert.ok(existsSync(join(f.scratch, "manifest-recovery-held")));
  const batch = modelBatch(),
    upload = fetch(url + "/diagnostics/profiler/ingest", {
      method: "POST",
      headers,
      body: JSON.stringify(batch),
    });
  const task = await fetch(url + "/profiles/work/tasks", { headers });
  assert.equal(task.status, 200);
  assert.deepEqual(
    (await task.json()).map((t: { title: string }) => t.title),
    ["Benchmark Task 000"],
  );
  writeFileSync(join(f.scratch, "manifest-recovery-release"), "release");
  const response = await upload;
  assert.equal(response.status, 200);
  const receipt = await response.json();
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.durability, "stored");
  const shown = await (
    await fetch(url + "/diagnostics/profiler/runs/" + batch.run.run_id, {
      headers,
    })
  ).json();
  assert.equal(shown.summary[0].starts, 1);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      { result: "PASS", task_read_while_held: true, receipt },
      null,
      2,
    ),
  );
} finally {
  writeFileSync(join(f.scratch, "manifest-recovery-release"), "release");
  if (child && child.exitCode === null && child.signalCode === null) {
    const end = new Promise<void>((r) => child!.once("exit", () => r()));
    child.kill("SIGTERM");
    await end;
  }
  await f.close();
}
