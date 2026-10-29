import { strict as assert } from "node:assert";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DiagnosticsSnapshot, Task } from "@todo/domain";
import { TasksResponse } from "@todo/domain/presentation";
import { Schema } from "effect";

const scratch = process.argv[2] ?? "";
const evidence = process.argv[3] ?? "";
const log = openSync(join(evidence, "server.log"), "w");
const env = {
  ...process.env,
  TODO_DB: join(scratch, "scratch.db"),
  TODO_PORT: "0",
  TODO_ATTACHMENT_ROOT: join(scratch, "attachments"),
};
const server = spawn(join(scratch, "server"), [], {
  env,
  stdio: ["ignore", log, log],
});
const children: ChildProcess[] = [server];
const exits: Array<{
  pid: number | undefined;
  code: number | null;
  signal: string | null;
}> = [];
const stop = async (child: ChildProcess) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) =>
    child.once("exit", (code, signal) => {
      exits.push({ pid: child.pid, code, signal });
      resolve();
    }),
  );
  child.kill("SIGTERM");
  await exited;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const actions: Array<{ method: string; path: string; status: number }> = [];
let base = "";
let session = "";
function request(
  method: string,
  path: string,
  body?: unknown,
  credential = session,
) {
  const result = spawnSync(
    "curl",
    [
      "--silent",
      "--show-error",
      "--max-time",
      "5",
      "--request",
      method,
      "--write-out",
      "\n%{http_code}",
      ...(credential
        ? ["--header", `Authorization: Bearer ${credential}`]
        : []),
      ...(body === undefined
        ? []
        : [
            "--header",
            "Content-Type: application/json",
            "--data",
            JSON.stringify(body),
          ]),
      base + path,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const split = result.stdout.lastIndexOf("\n");
  const status = Number(result.stdout.slice(split + 1));
  const value: unknown = result.stdout.slice(0, split)
    ? JSON.parse(result.stdout.slice(0, split))
    : null;
  actions.push({ method, path, status });
  return { status, value };
}
const parseSnapshot = Schema.decodeUnknownSync(DiagnosticsSnapshot);
try {
  for (let attempt = 0; attempt < 1200; attempt++) {
    const match = readFileSync(join(evidence, "server.log"), "utf8").match(
      /Listening on (http:\/\/127\.0\.0\.1:\d+)/,
    );
    if (match?.[1]) {
      base = match[1];
      break;
    }
    assert.equal(server.exitCode, null);
    await sleep(50);
  }
  assert.ok(base);
  assert.deepEqual(request("GET", "/health").value, { service: "todo-server" });
  const signIn = request("POST", "/auth/sessions", {
    passphrase: "scratch verification passphrase",
  });
  assert.equal(signIn.status, 200);
  session = Schema.decodeUnknownSync(
    Schema.Struct({ credential: Schema.String }),
  )(signIn.value).credential;
  assert.equal(request("GET", "/diagnostics", undefined, "").status, 401);
  const tokenResult = request("POST", "/auth/tokens", {
    name: "diagnostics agent",
    scope: "read-only",
    profile: "work",
  });
  const token = Schema.decodeUnknownSync(
    Schema.Struct({ credential: Schema.String }),
  )(tokenResult.value).credential;
  assert.equal(request("GET", "/diagnostics", undefined, token).status, 403);
  const before = parseSnapshot(request("GET", "/diagnostics").value);
  assert.equal(
    before.storage.tables.find((table) => table.name === "tasks")?.count,
    0,
  );
  const streamFile = openSync(join(evidence, "client.sse"), "w");
  const stream = spawn(
    "curl",
    [
      "--silent",
      "--show-error",
      "--no-buffer",
      "--header",
      `Authorization: Bearer ${session}`,
      "--header",
      "X-Todo-Client: cli",
      `${base}/profiles/work/events`,
    ],
    { stdio: ["ignore", streamFile, streamFile] },
  );
  children.push(stream);
  closeSync(streamFile);
  for (
    let attempt = 0;
    attempt < 100 &&
    !readFileSync(join(evidence, "client.sse"), "utf8").includes("ready");
    attempt++
  )
    await sleep(30);
  assert.match(readFileSync(join(evidence, "client.sse"), "utf8"), /ready/);
  const due = new Date(Date.now() + 5000).toISOString();
  const task = Schema.decodeUnknownSync(Task)(
    request("POST", "/profiles/work/tasks", {
      title: "F12 private content",
      due_at: { kind: "instant", utc: due, time_zone: "UTC" },
    }).value,
  );
  assert.equal(
    request("PATCH", `/profiles/work/tasks/${task.id}`, {
      from_version: 1,
      changes: { title: "F12 erased content" },
    }).status,
    200,
  );
  assert.equal(
    request("PATCH", `/profiles/work/tasks/${task.id}`, {
      from_version: 1,
      changes: { title: "F12 rejected content" },
    }).status,
    409,
  );
  await sleep(350);
  const snapshot = parseSnapshot(request("GET", "/diagnostics").value);

  assert.equal(
    snapshot.storage.tables.find((table) => table.name === "tasks")?.count,
    1,
  );
  assert.equal(
    snapshot.storage.entities.find((entity) => entity.profile === "work")
      ?.tasks,
    1,
  );
  assert.deepEqual(
    snapshot.operations.recent
      .filter(
        (operation) =>
          operation.profile === "work" &&
          (operation.type === "TaskCreated" || operation.type === "TaskEdited"),
      )
      .map((operation) => [operation.type, operation.outcome]),
    [
      ["TaskEdited", "rejected"],
      ["TaskEdited", "committed"],
      ["TaskCreated", "committed"],
    ],
  );
  assert.equal(snapshot.clients.length, 1);
  assert.equal(snapshot.clients[0]?.profile, "work");
  assert.equal(snapshot.clients[0]?.kind, "cli");
  assert.ok(Number(snapshot.clients[0]?.last_event_id) > 0);
  assert.ok(
    snapshot.errors.some(
      (error) =>
        error.route === "PATCH /profiles/{profile}/tasks/{task}" &&
        error.code === "conflict",
    ),
  );
  assert.equal(
    snapshot.latency.routes.find(
      (route) => route.route === "PATCH /profiles/{profile}/tasks/{task}",
    )?.count,
    2,
  );
  assert.equal(
    snapshot.credentials.filter((credential) => credential.kind === "session")
      .length,
    1,
  );
  assert.equal(
    snapshot.credentials.filter((credential) => credential.kind === "token")
      .length,
    1,
  );
  assert.ok(
    snapshot.credentials.find((credential) => credential.kind === "session")
      ?.last_used_at,
  );
  assert.equal(snapshot.scheduler.pending_reminders, 1);
  assert.ok(snapshot.scheduler.next_wake_at !== null);
  const wake =
    Date.parse(snapshot.scheduler.next_wake_at) -
    Date.parse(snapshot.generated_at);
  assert.ok(wake > -250 && wake <= 1000, `Unexpected scheduler wake ${wake}ms`);
  let reminder = snapshot;
  for (
    let attempt = 0;
    attempt < 150 && !reminder.scheduler.last_reminder_fired;
    attempt++
  ) {
    await sleep(100);
    reminder = parseSnapshot(request("GET", "/diagnostics").value);
  }
  assert.equal(reminder.scheduler.pending_reminders, 0);
  assert.equal(reminder.scheduler.last_reminder_fired?.type, "ReminderFired");
  writeFileSync(
    join(evidence, "reminder.json"),
    JSON.stringify(reminder, null, 2),
  );
  assert.equal(
    request("DELETE", `/profiles/work/tasks/${task.id}?from_version=2`).status,
    200,
  );
  const purged = spawnSync(join(scratch, "seed"), [scratch, "purge", task.id], {
    env,
    encoding: "utf8",
  });
  assert.equal(purged.status, 0, purged.stderr);
  const afterPurge = parseSnapshot(request("GET", "/diagnostics").value);
  assert.equal(
    afterPurge.storage.entities.find((entity) => entity.profile === "work")
      ?.tasks,
    0,
  );
  assert.ok(
    afterPurge.operations.recent.some(
      (operation) => operation.type === "TaskPurged",
    ),
  );
  assert.equal(afterPurge.scheduler.last_reminder_fired?.type, "ReminderFired");
  for (const value of [snapshot, reminder, afterPurge])
    for (const secret of [
      session,
      token,
      "F12 private content",
      "F12 erased content",
      "F12 rejected content",
      "secret_hash",
      "passphrase_hash",
    ])
      assert.equal(JSON.stringify(value).includes(secret), false);
  await stop(stream);
  await sleep(100);
  assert.equal(
    parseSnapshot(request("GET", "/diagnostics").value).clients.length,
    0,
  );
  const cli = (args: string[], input?: string) => {
    const result = spawnSync(
      join(scratch, "todo"),
      ["--db", join(scratch, "scratch.db"), "--profile", "work", ...args],
      {
        env: { ...env, TODO_SERVER_URL: base },
        ...(input === undefined ? {} : { input }),
        encoding: "utf8",
        timeout: 15000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  cli(["login", "--password-stdin"], "scratch verification passphrase\n");
  cli([
    "add",
    "External CLI diagnostics proof",
    "--external-id",
    "private-c11-diagnostics-id",
    "--format",
    "json",
  ]);
  const monitored = Schema.decodeUnknownSync(TasksResponse)(
    JSON.parse(cli(["list", "--format", "json"])),
  ).tasks?.[0];
  assert.ok(monitored);
  assert.equal(
    request("POST", `/profiles/work/tasks/${monitored.id}/attachments/upload`, {
      from_version: monitored.row_version,
      mime_type: "image/png",
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7QAAAABJRU5ErkJggg==",
      label: "private-f11-diagnostics-image",
    }).status,
    200,
  );
  cli(["profile", "delete", "personal", "--format", "json"]);
  const cliSnapshot = parseSnapshot(
    JSON.parse(cli(["diagnostics", "--format", "json", "--server", base])),
  );
  assert.deepEqual(
    cliSnapshot.profiles.map((p) => p.name),
    ["Work"],
  );
  assert.deepEqual(
    cliSnapshot.deleted_profiles.map((p) => p.name),
    ["Personal"],
  );
  assert.equal(cliSnapshot.storage.entities.length, 1);
  assert.equal(cliSnapshot.storage.external_id_tasks, 1);
  assert.equal(cliSnapshot.storage.attachments, 1);
  assert.equal(cliSnapshot.storage.attachment_store_bytes, 67);
  assert.ok(
    !JSON.stringify(cliSnapshot).includes("private-f11-diagnostics-image"),
  );
  assert.ok(
    !JSON.stringify(cliSnapshot).includes("private-c11-diagnostics-id"),
  );
  assert.equal(
    cliSnapshot.storage.tables.find((t) => t.name === "profile_deletions")
      ?.count,
    1,
  );
  assert.equal(cliSnapshot.operations.recent[0]?.type, "ProfileDeleted");
  assert.equal(
    cliSnapshot.storage.entities.find((entity) => entity.profile === "work")
      ?.tasks,
    1,
  );
  assert.ok(
    cliSnapshot.operations.recent.some(
      (operation) => operation.type === "TaskCreated",
    ),
  );
  parseSnapshot(JSON.parse(cli(["top", "--format", "json", "--server", base])));
  const pty = spawnSync(
    "python3",
    [
      ".agents/skills/verify-diagnostics/scripts/capture-top.py",
      join(scratch, "todo"),
      base,
      evidence,
    ],
    { env, encoding: "utf8", timeout: 90000 },
  );
  assert.equal(pty.status, 0, pty.stderr);
  const png = spawnSync(
    "./scripts/swift-slot.sh",
    [
      "swift",
      ".agents/skills/verify-diagnostics/scripts/render-top.swift",
      evidence,
    ],
    { env, encoding: "utf8", timeout: 900000 },
  );
  assert.equal(png.status, 0, png.stderr);
  const schema: unknown = JSON.parse(cli(["schema", "diagnostics"]));
  assert.ok(schema && typeof schema === "object" && "properties" in schema);
  let ndjson = "";
  const follow = spawn(
    join(scratch, "todo"),
    ["--profile", "work", "diagnostics", "--follow", "--server", base],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  children.push(follow);
  follow.stdout?.on("data", (chunk: Buffer) => {
    ndjson += chunk.toString();
  });
  for (
    let attempt = 0;
    attempt < 150 && ndjson.trim().split("\n").length < 2;
    attempt++
  )
    await sleep(30);
  await stop(follow);
  const lines = ndjson.trim().split("\n");
  assert.ok(lines.length >= 2, ndjson);
  for (const line of lines) parseSnapshot(JSON.parse(line));
  writeFileSync(join(evidence, "diagnostics.ndjson"), ndjson);
  writeFileSync(
    join(evidence, "cli-snapshot.json"),
    JSON.stringify(cliSnapshot, null, 2),
  );
  writeFileSync(
    join(evidence, "diagnostics.schema.json"),
    JSON.stringify(schema, null, 2),
  );
  const saved = Schema.decodeUnknownSync(
    Schema.Struct({ snapshot: Schema.Struct({ id: Schema.String }) }),
  )(JSON.parse(cli(["snapshot", "create", "--format", "json"])));
  cli(["add", "Transient diagnostics restore Task", "--format", "json"]);
  const restoreStreamFile = openSync(join(evidence, "restore-client.sse"), "w");
  const restoreStream = spawn(
    "curl",
    [
      "--silent",
      "--show-error",
      "--no-buffer",
      "--header",
      `Authorization: Bearer ${session}`,
      "--header",
      "X-Todo-Client: cli",
      `${base}/profiles/work/events`,
    ],
    { stdio: ["ignore", restoreStreamFile, restoreStreamFile] },
  );
  children.push(restoreStream);
  closeSync(restoreStreamFile);
  await sleep(350);
  const beforeRestore = parseSnapshot(request("GET", "/diagnostics").value);
  assert.equal(
    beforeRestore.storage.entities.find((entity) => entity.profile === "work")
      ?.tasks,
    2,
  );
  assert.equal(beforeRestore.clients.length, 1);
  assert.ok(beforeRestore.clients[0]?.last_event_id);
  cli(["snapshot", "restore", saved.snapshot.id, "--format", "json"]);
  const restored = parseSnapshot(request("GET", "/diagnostics").value);
  assert.notEqual(
    restored.storage.restore_generation,
    beforeRestore.storage.restore_generation,
  );
  assert.equal(
    restored.storage.entities.find((entity) => entity.profile === "work")
      ?.tasks,
    1,
  );
  assert.equal(restored.operations.recent[0]?.type, "DatabaseRestored");
  assert.equal(
    restored.operations.recent[0]?.seq,
    beforeRestore.operations.recent[0]?.seq,
  );
  assert.deepEqual(restored.operations.samples, []);
  assert.equal(restored.clients[0]?.last_event_id, null);
  assert.deepEqual(Object.keys(restored.storage.last_snapshot ?? {}).sort(), [
    "created_at",
    "id",
    "schema_version",
    "seq",
    "size",
  ]);
  await stop(restoreStream);
  writeFileSync(
    join(evidence, "restored.json"),
    JSON.stringify(restored, null, 2),
  );
  writeFileSync(
    join(evidence, "snapshot.json"),
    JSON.stringify(snapshot, null, 2),
  );
  writeFileSync(
    join(evidence, "purged.json"),
    JSON.stringify(afterPurge, null, 2),
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        compiled: true,
        transport: "curl",
        operations: snapshot.operations,
        clients: snapshot.clients,
        checks: [
          "owner Session only",
          "table and entity counts",
          "accepted and rejected operations",
          "SSE client and cursor",
          "Conflict route and latency",
          "active credential metadata and last use",
          "Purge redaction",
          "scheduler next wake, pending count and real ReminderFired",
          "disconnect cleanup",
          "restore generation and cache reset at the same maximum sequence",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  for (const child of children.reverse()) await stop(child);
  closeSync(log);
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  writeFileSync(join(evidence, "cleanup.json"), JSON.stringify(exits, null, 2));
}
