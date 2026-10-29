import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { OpLogEntry } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";

const evidence = resolve(process.argv[2] ?? "");
assert.ok(
  process.argv[2] && !existsSync(evidence),
  "Pass a fresh absolute evidence directory",
);
const cli = process.env.TODO_CLI_BINARY;
const binary = process.env.TODO_SERVER_BINARY;
assert.ok(
  cli && binary,
  "Set TODO_CLI_BINARY and TODO_SERVER_BINARY to compiled binaries",
);
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-swift-union-"));
const home = join(scratch, "home");
mkdirSync(home);
const database = join(scratch, "scratch.db");
const env = { ...process.env, HOME: home, TODO_DB: database, TODO_PORT: "0" };
const actions: unknown[] = [];
let server: ReturnType<typeof spawn> | undefined;
let stream: ReturnType<typeof spawn> | undefined;
let log = "";
let sse = "";
const wait = async (predicate: () => boolean, message: string) => {
  const deadline = Date.now() + 60000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, message);
    await new Promise((r) => setTimeout(r, 40));
  }
};
const command = (args: string[], input = "", profile = "work") => {
  const result = spawnSync(
    cli,
    ["--profile", profile, "--format", "json", ...args],
    { cwd: scratch, env, input, encoding: "utf8", timeout: 60000 },
  );
  assert.equal(result.status, 0, result.stderr);
  actions.push({
    command: ["todo", ...args],
    exit: result.status,
    stdout: result.stdout,
  });
  return JSON.parse(result.stdout);
};
const stop = async (process: ReturnType<typeof spawn> | undefined) => {
  if (!process || process.exitCode !== null || process.signalCode !== null)
    return;
  const done = new Promise<void>((r) => process.once("exit", () => r()));
  const timer = setTimeout(() => process.kill("SIGKILL"), 2000);
  process.kill("SIGTERM");
  await done;
  clearTimeout(timer);
};
try {
  command(["init", "--password-stdin"], "scratch union passphrase\n");
  command(["init"], "", "personal");
  command(["init"], "", "doomed");
  command(["login", "--password-stdin"], "scratch union passphrase\n");
  server = spawn(binary, [], {
    cwd: scratch,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (data) => {
    log += data.toString();
  });
  server.stderr?.on("data", (data) => {
    log += data.toString();
  });
  await wait(
    () => /Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(log),
    "Server readiness",
  );
  const base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1];
  assert.ok(base);
  const curl = (
    method: string,
    path: string,
    body?: unknown,
    credential?: string,
    status = 200,
  ) => {
    const args = [
      "-sS",
      "--max-time",
      "30",
      "--write-out",
      "\n%{http_code}",
      "-X",
      method,
      ...(credential ? ["-H", `Authorization: Bearer ${credential}`] : []),
      ...(body
        ? ["-H", "Content-Type: application/json", "--data-binary", "@-"]
        : []),
      base + path,
    ];
    const result = spawnSync("curl", args, {
      env,
      input: body ? JSON.stringify(body) : undefined,
      encoding: "utf8",
      timeout: 60000,
    });
    assert.equal(result.status, 0, result.stderr);
    const index = result.stdout.lastIndexOf("\n");
    const code = Number(result.stdout.slice(index + 1));
    const value = result.stdout.slice(0, index)
      ? JSON.parse(result.stdout.slice(0, index))
      : null;
    assert.equal(code, status, JSON.stringify(value));
    if (path !== "/auth/sessions" && path !== "/auth/tokens")
      actions.push({ method, path, body, status: code, response: value });
    return value;
  };
  const session = curl("POST", "/auth/sessions", {
    passphrase: "scratch union passphrase",
  });
  const credential: string = session.credential;
  stream = spawn(
    "curl",
    [
      "-sSN",
      "-H",
      `Authorization: Bearer ${credential}`,
      `${base}/profiles/work/events`,
    ],
    { cwd: scratch, env },
  );
  stream.stdout?.on("data", (data) => {
    sse += data.toString();
  });
  await wait(() => sse.includes("event: ready"), "SSE readiness");
  const token = curl(
    "POST",
    "/auth/tokens",
    { name: "union-proof-read", profile: "work", scope: "read-only" },
    credential,
  );
  curl(
    "POST",
    "/profiles/work/tasks",
    { title: "Rejected auth fixture" },
    token.credential,
    403,
  );
  let task = curl(
    "POST",
    "/profiles/work/tasks",
    {
      title: "Union live Task",
      due_at: {
        kind: "instant",
        utc: new Date(Date.now() - 10000).toISOString(),
        time_zone: "UTC",
      },
    },
    credential,
  );
  const id: string = task.id;
  const path = `/profiles/work/tasks/${id}`;
  await wait(() => sse.includes('"kind":"ReminderFired"'), "ReminderFired SSE");
  task = curl(
    "PATCH",
    path,
    {
      from_version: task.row_version,
      changes: { title: "Union edited Task", due_at: null },
    },
    credential,
  );
  curl(
    "PATCH",
    path,
    { from_version: 1, changes: { title: "Rejected stale title" } },
    credential,
    409,
  );
  for (const action of ["complete", "reopen", "cancel", "reopen"])
    task = curl(
      "POST",
      `${path}/transition`,
      { from_version: task.row_version, action },
      credential,
    );
  task = curl(
    "DELETE",
    `${path}?from_version=${task.row_version}`,
    undefined,
    credential,
  );
  const deleted = curl(
    "GET",
    `${path}/history`,
    undefined,
    credential,
  ).findLast(
    (entry: { event: { kind: string } }) => entry.event.kind === "TaskDeleted",
  );
  task = curl(
    "POST",
    `${path}/revert`,
    { from_version: task.row_version, seq: deleted.seq },
    credential,
  );
  task = curl(
    "POST",
    `${path}/move`,
    { from_version: task.row_version, destination_profile: "personal" },
    credential,
  );
  task = curl(
    "POST",
    `/profiles/personal/tasks/${id}/move`,
    { from_version: task.row_version, destination_profile: "work" },
    credential,
  );
  let purged = curl(
    "POST",
    "/profiles/work/tasks",
    { title: "Union erased Task" },
    credential,
  );
  purged = curl(
    "DELETE",
    `/profiles/work/tasks/${purged.id}?from_version=1`,
    undefined,
    credential,
  );
  command([
    "rm",
    purged.id,
    "--expected-version",
    String(purged.row_version),
    "--force",
  ]);
  curl(
    "POST",
    "/profiles/doomed/tasks",
    { title: "Union Profile Task" },
    credential,
  );
  curl(
    "DELETE",
    "/profiles/doomed",
    { with_tasks: false, dry_run: false },
    credential,
    422,
  );
  curl(
    "DELETE",
    "/profiles/doomed",
    { with_tasks: true, dry_run: false },
    credential,
  );
  const snapshot = command(["snapshot", "create", "--reason", "union proof"]);
  const snapshotId = snapshot.snapshot?.id ?? snapshot.id;
  assert.ok(typeof snapshotId === "string", JSON.stringify(snapshot));
  task = curl(
    "PATCH",
    path,
    {
      from_version: task.row_version,
      changes: { title: "After union Snapshot" },
    },
    credential,
  );
  command(["snapshot", "restore", snapshotId]);
  await wait(() => sse.includes('"kind":"AuthChanged"'), "AuthChanged SSE");
  const realHistory = curl("GET", `${path}/history`, undefined, credential);
  const erasedHistory = curl(
    "GET",
    `/profiles/work/tasks/${purged.id}/history`,
    undefined,
    credential,
  );
  writeFileSync(
    join(evidence, "history.json"),
    JSON.stringify([...realHistory, ...erasedHistory], null, 2),
  );
  const history = await Effect.runPromise(
    Effect.acquireUseRelease(
      openStore({ path: database }),
      (store) => store.history(),
      (store) => Effect.orDie(store.close()),
    ),
  );
  const selected = new Map<string, OpLogEntry>();
  for (const entry of history)
    if (
      !selected.has(entry.event.kind) ||
      (entry.event.kind === "TaskHistoryRedacted" &&
        entry.event.original_kind === "TaskPurged")
    )
      selected.set(entry.event.kind, entry);
  const redacted = history.find(
    (entry) =>
      entry.event.kind === "TaskHistoryRedacted" &&
      entry.event.original_kind === "TaskPurged",
  );
  assert.ok(redacted);
  selected.set(
    "TaskPurged",
    Schema.decodeUnknownSync(OpLogEntry)({
      ...redacted,
      event: {
        kind: "TaskPurged",
        entity_version: 1,
        occurred_at: redacted.event.occurred_at,
        task_id: purged.id,
        before: purged,
      },
    }),
  );
  const expectedKinds = [
    "AuthAttemptRejected",
    "AuthChanged",
    "DatabaseRestored",
    "ProfileDeleted",
    "ProfileDeletionRejected",
    "ReminderFired",
    "TaskAttemptRejected",
    "TaskCancelled",
    "TaskCompleted",
    "TaskCreated",
    "TaskDeleted",
    "TaskEdited",
    "TaskHistoryRedacted",
    "TaskMovedIn",
    "TaskMovedOut",
    "TaskPurged",
    "TaskReopened",
    "TaskReverted",
  ];
  assert.deepEqual([...selected.keys()].sort(), expectedKinds);
  const fixture = [...selected.values()].sort((a, b) =>
    a.event.kind.localeCompare(b.event.kind),
  );
  writeFileSync(
    join(evidence, "all-event-kinds.json"),
    JSON.stringify(fixture, null, 2),
  );
  const operations = sse.split("\n\n").flatMap((frame) => {
    const value = /^data: (.+)$/m.exec(frame)?.[1];
    if (!frame.includes("event: operation") || !value) return [];
    return [JSON.parse(value)];
  });
  assert.ok(operations.some((entry) => entry.event.kind === "AuthChanged"));
  writeFileSync(
    join(evidence, "global-operations.json"),
    JSON.stringify(
      [
        ...operations.filter((entry) => entry.event.kind === "AuthChanged"),
        ...history.filter((entry) => entry.event.kind === "DatabaseRestored"),
      ],
      null,
      2,
    ),
  );
  const observed = new Set(
    [...realHistory, ...erasedHistory].map((entry) =>
      entry.event.kind === "TaskHistoryRedacted"
        ? entry.event.original_kind
        : entry.event.kind,
    ),
  );
  for (const kind of [
    "TaskCreated",
    "TaskEdited",
    "TaskCompleted",
    "TaskCancelled",
    "TaskReopened",
    "TaskDeleted",
    "TaskReverted",
    "TaskMovedOut",
    "TaskMovedIn",
    "TaskAttemptRejected",
    "ReminderFired",
    "TaskPurged",
  ])
    assert.ok(observed.has(kind), `Missing live History kind ${kind}`);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        fixtureKinds: expectedKinds,
        realHistoryKinds: [...observed].sort(),
        globalOperationSources: {
          AuthChanged: "public SSE",
          DatabaseRestored: "scratch operation store",
        },
      },
      null,
      2,
    ),
  );
} finally {
  await stop(stream);
  await stop(server);
  writeFileSync(join(evidence, "server.log"), log);
  writeFileSync(join(evidence, "events.sse"), sse);
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  rmSync(scratch, { recursive: true, force: true });
}
