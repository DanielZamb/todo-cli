import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { event } from "../../../../packages/domain/test/fixtures/diagnostic-recording.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-completeness/fault",
);
mkdirSync(evidence, { recursive: true });
const f = await diagnosticFixture(true, 0),
  root = join(f.scratch, "diagnostic-recordings"),
  id = randomUUID(),
  headers = {
    Authorization: `Bearer ${f.credential}`,
    "Content-Type": "application/json",
  };
const body = {
  schema_version: 1,
  batch_id: randomUUID(),
  run: {
    run_id: id,
    app: "macos",
    build_id: event.build_id,
    contract_id: event.contract_id,
  },
  events: [{ ...event, run_id: id }],
};
try {
  assert.equal(
    (
      await fetch(f.url + "/diagnostics/profiler/ingest", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
    ).status,
    200,
  );
  const conflict = {
      ...body,
      batch_id: randomUUID(),
      events: [{ ...event, run_id: id, action_id: randomUUID() }],
    },
    file = join(f.scratch, "conflict.json");
  writeFileSync(file, JSON.stringify(conflict));
  const fault = new Database(join(root, "recordings.db"));
  fault.exec(
    "CREATE TRIGGER test_write_failure BEFORE UPDATE OF admission ON runs BEGIN SELECT RAISE(ABORT,'controlled storage failure'); END;",
  );
  fault.close();
  const response = await fetch(f.url + "/diagnostics/profiler/ingest", {
    method: "POST",
    headers,
    body: JSON.stringify(conflict),
  });
  const error = await response.json();
  assert.equal(response.status, 500);
  const cli = spawnSync(
    resolve(".scratch/bin/todo"),
    [
      "--profile",
      "work",
      "diagnostics",
      "import",
      "--file",
      file,
      "--server",
      f.url,
      "--format",
      "json",
    ],
    { env: f.env, encoding: "utf8" },
  );
  const report = JSON.parse(cli.stdout);
  assert.equal(cli.status, 1);
  assert.equal(cli.stderr, "");
  const task = await fetch(f.url + "/profiles/work/tasks", {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "Exactly once", source: "manual" }),
  });
  assert.equal(task.status, 200);
  assert.equal((await task.json()).title, "Exactly once");
  const tasks = await (
    await fetch(f.url + "/profiles/work/tasks", { headers })
  ).json();
  assert.equal(tasks.length, 1);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        http_status: response.status,
        error,
        cli_status: cli.status,
        report,
        task_count: tasks.length,
      },
      null,
      2,
    ),
  );
  assert.equal(
    report.message,
    "Whole batch was not admitted and its uncertainty could not be persisted. Keep the entire batch and retry when storage is available.",
  );
} finally {
  const repaired = new Database(join(root, "recordings.db"));
  repaired.exec("DROP TRIGGER IF EXISTS test_write_failure");
  repaired.close();
  await f.close();
}
