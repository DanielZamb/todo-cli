import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  writeFileSync,
  openSync,
  writeSync,
  closeSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { Effect, Schema } from "effect";
import {
  ActorId,
  ProfileId,
  Task,
} from "../../../../packages/domain/src/index.ts";
import { openStore } from "../../../../packages/domain/src/store/store.ts";
import { validateRecordingBatch } from "../../../../packages/domain/src/diagnostic-recordings.ts";
import { event } from "../../../../packages/domain/test/fixtures/diagnostic-recording.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-sqlite/full-volume",
);
mkdirSync(evidence, { recursive: true });
const root = resolve(".scratch/recordings-sqlite-disk-full"),
  home = join(root, "home"),
  journal = join(root, "volume", "diagnostic-recordings");
mkdirSync(home, { recursive: true });
const env = {
  ...process.env,
  HOME: home,
  TODO_DB: join(root, "scratch.db"),
  TODO_PORT: "0",
};
const init = spawnSync(
  resolve(".scratch/bin/todo"),
  ["--profile", "work", "init", "--password-stdin"],
  { env, input: "isolated full disk\n", encoding: "utf8" },
);
assert.equal(init.status, 0, init.stderr);
let log = "";
const child = spawn(resolve(".scratch/bin/sqlite-full-server"), [], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (x) => (log += x));
child.stderr.on("data", (x) => (log += x));
let fill = false;
try {
  let url = "";
  const deadline = Date.now() + 60000;
  while (!url && Date.now() < deadline) {
    assert.equal(child.exitCode, null, log);
    url = log.match(/Listening on (http:\/\/127.0.0.1:\d+)/)?.[1] ?? "";
    if (!url) await Bun.sleep(20);
  }
  assert.ok(url, log);
  const signed = await (
    await fetch(url + "/auth/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "isolated full disk" }),
    })
  ).json();
  const headers = {
    Authorization: "Bearer " + signed.credential,
    "Content-Type": "application/json",
  };
  assert.equal(
    (await fetch(url + "/diagnostics/profiler/runs", { headers })).status,
    200,
    "Recording store must be available before the disk is filled",
  );
  const fd = openSync(join(journal, "fill"), "w");
  fill = true;
  let bytes = 0,
    code = "";
  try {
    for (let i = 0; i < 10000; i++) {
      const n = writeSync(fd, Buffer.alloc(4096));
      bytes += n;
      if (n === 0) break;
    }
  } catch (e) {
    if (e instanceof Error && "code" in e) code = String(e.code);
    else throw e;
  } finally {
    closeSync(fd);
  }
  assert.equal(code, "ENOSPC");
  const id = randomUUID();
  let batch = validateRecordingBatch({
    schema_version: 1,
    batch_id: randomUUID(),
    run: {
      run_id: id,
      app: "macos",
      build_id: event.build_id,
      contract_id: event.contract_id,
    },
    events: [{ ...event, run_id: id }],
  });
  let upload = await fetch(url + "/diagnostics/profiler/ingest", {
    method: "POST",
    headers,
    body: JSON.stringify(batch),
  });
  assert.ok([200, 500].includes(upload.status));
  let receipt = await upload.json();
  let attempts = 1;
  while (upload.status === 200 && receipt.accepted === true && attempts < 100) {
    const fresh = randomUUID();
    batch = validateRecordingBatch({
      ...batch,
      batch_id: randomUUID(),
      run: { ...batch.run, run_id: fresh },
      events: Array.from({ length: 128 }, (_, i) => ({
        ...event,
        run_id: fresh,
        sequence: i + 1,
        action_id: randomUUID(),
      })),
    });
    upload = await fetch(url + "/diagnostics/profiler/ingest", {
      method: "POST",
      headers,
      body: JSON.stringify(batch),
    });
    receipt = await upload.json();
    attempts++;
  }
  if (upload.status === 200) {
    assert.equal(receipt.accepted, false);
    assert.equal(receipt.durability, "dropped");
  } else
    assert.equal(
      receipt.message,
      "Whole batch was not admitted and its uncertainty could not be persisted. Keep the entire batch and retry when storage is available.",
    );
  const state = await (
    await fetch(url + "/diagnostics/profiler/runs", { headers })
  ).json();
  assert.ok(state.status.loss.storage_failures > 0);
  const created = await fetch(url + "/profiles/work/tasks", {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "Task survives recording ENOSPC" }),
  });
  assert.equal(created.status, 200);
  const task = await created.json();
  assert.equal(task.row_version, 1);
  const at = new Date(Date.now() - 5000).toISOString();
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* Effect.acquireRelease(
          openStore({ path: env.TODO_DB }),
          (s) => Effect.orDie(s.close()),
        );
        yield* store.append({
          actor: Schema.decodeUnknownSync(ActorId)("verification"),
          profile: Schema.decodeUnknownSync(ProfileId)("work"),
          event: {
            kind: "TaskCreated",
            entity_version: 1,
            occurred_at: at,
            series: null,
            project: null,
            tags: [],
            task: Schema.decodeUnknownSync(Task)({
              id: "wake",
              profile_id: "work",
              title: "Scheduler survives ENOSPC",
              description: null,
              project_id: null,
              priority: "P3",
              status: "snoozed",
              scheduled_at: { kind: "instant", utc: at, time_zone: "UTC" },
              due_at: { kind: "instant", utc: at, time_zone: "UTC" },
              energy: null,
              estimate_min: null,
              source: "verification",
              tags: [],
              occurrence: null,
              completed_at: null,
              deleted_at: null,
              created_at: at,
              updated_at: at,
              entity_version: 1,
              row_version: 1,
            }),
          },
        });
      }),
    ),
  );
  let tasks: unknown[] = [];
  for (let i = 0; i < 300; i++) {
    const response = await fetch(url + "/profiles/work/tasks", { headers });
    assert.equal(response.status, 200);
    tasks = await response.json();
    if (
      tasks.some(
        (x) =>
          x !== null &&
          typeof x === "object" &&
          "id" in x &&
          x.id === "wake" &&
          "status" in x &&
          x.status === "open",
      )
    )
      break;
    await Bun.sleep(10);
  }
  const durable = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* Effect.acquireRelease(
          openStore({ path: env.TODO_DB }),
          (s) => Effect.orDie(s.close()),
        );
        return { tasks: yield* store.tasks(), history: yield* store.history() };
      }),
    ),
  );
  assert.equal(durable.tasks.length, 2);
  assert.equal(durable.tasks.find((x) => x.id === "wake")?.row_version, 2);
  assert.equal(
    durable.history.filter((x) => x.event.kind === "ReminderFired").length,
    1,
  );
  assert.equal(
    durable.history.filter(
      (x) => x.event.kind === "TaskCreated" && x.outcome === "committed",
    ).length,
    2,
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        enospc: code,
        fill_bytes: bytes,
        attempts,
        upload_status: upload.status,
        receipt,
        task_response: task,
        scheduler_task: durable.tasks.find((x) => x.id === "wake"),
        reminders: 1,
        task_creates: 2,
      },
      null,
      2,
    ),
  );
} finally {
  if (fill) unlinkSync(join(journal, "fill"));
  const done = new Promise<void>((r) => child.once("exit", () => r()));
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await done;
  }
  writeFileSync(join(evidence, "server.log"), log);
}
