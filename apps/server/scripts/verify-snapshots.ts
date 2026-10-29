import assert from "node:assert/strict";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SnapshotManifest, SnapshotRestoreReport, Task } from "@todo/domain";
import { Schema } from "effect";

const [scratch, evidence] = Schema.decodeUnknownSync(
  Schema.Tuple([Schema.String, Schema.String]),
)(process.argv.slice(2));
if (!scratch.includes("todo-f13-verify-"))
  throw new Error("Scratch path required");
const home = join(scratch, "http");
mkdirSync(home);
const env = {
  ...process.env,
  HOME: home,
  TODO_DB: join(home, "scratch.db"),
  TODO_PORT: "0",
};
const actions: unknown[] = [];
const record = () =>
  writeFileSync(
    join(evidence, "http-actions.json"),
    JSON.stringify(actions, null, 2),
  );
const cli = (args: string[], input?: string) => {
  const child = Bun.spawnSync(
    [join(scratch, "todo"), "--profile", "work", ...args],
    {
      env,
      stdin: input ? Buffer.from(input) : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  assert.equal(child.exitCode, 0, child.stderr.toString());
};
cli(["init", "--password-stdin"], "snapshot HTTP passphrase\n");
cli(["login", "--password-stdin"], "snapshot HTTP passphrase\n");
const credential = Schema.decodeUnknownSync(
  Schema.Struct({ token: Schema.String }),
)(
  JSON.parse(readFileSync(join(home, ".todo-cli/session_work.json"), "utf8")),
).token;
const server = Bun.spawn([join(scratch, "server")], {
  env,
  stdout: "pipe",
  stderr: "pipe",
});
let serverLog = "";
const readLog = async (stream: ReadableStream<Uint8Array>) => {
  for await (const bytes of stream) {
    serverLog += new TextDecoder().decode(bytes);
    writeFileSync(join(evidence, "http-server.log"), serverLog);
  }
};
const logReaders = [readLog(server.stdout), readLog(server.stderr)];
const waitFor = async (
  predicate: () => boolean,
  label: string,
  timeout = 60000,
) => {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await Bun.sleep(50);
  }
};
const abort = new AbortController();
let streamReader: Promise<void> | undefined;
try {
  await waitFor(
    () => /Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(serverLog),
    "server readiness",
  );
  const base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(serverLog)?.[1];
  assert.ok(base);
  const request = async (
    method: string,
    path: string,
    body?: unknown,
    token = credential,
    expected = 200,
  ) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const raw = await response.text();
    const value: unknown = raw ? JSON.parse(raw) : null;
    actions.push({
      method,
      path,
      body,
      status: response.status,
      response: value,
    });
    record();
    assert.equal(response.status, expected, raw);
    return value;
  };
  await request("GET", "/snapshots", undefined, "invalid", 401);
  const token = Schema.decodeUnknownSync(
    Schema.Struct({ credential: Schema.String }),
  )(
    await request("POST", "/auth/tokens", {
      name: "snapshot-agent",
      profile: null,
      scope: "read-write",
    }),
  ).credential;
  await request("GET", "/snapshots", undefined, token, 403);
  const empty = Schema.decodeUnknownSync(SnapshotManifest)(
    await request("POST", "/snapshots", { reason: "empty state" }),
  );
  const due = new Date(Date.now() + 5000).toISOString();
  const reminder = Schema.decodeUnknownSync(Task)(
    await request("POST", "/profiles/work/tasks", {
      title: "Snapshot restored reminder",
      due_at: { kind: "instant", utc: due, time_zone: "UTC" },
    }),
  );
  const saved = Schema.decodeUnknownSync(SnapshotManifest)(
    await request("POST", "/snapshots", { reason: "with reminder" }),
  );
  for (let index = 0; index < 5; index++)
    await request("POST", "/profiles/work/tasks", { title: `Later ${index}` });
  const before = Schema.decodeUnknownSync(
    Schema.Array(Schema.Struct({ seq: Schema.Int })),
  )(await request("GET", `/profiles/work/tasks/${reminder.id}/history`));
  const high = Math.max(...before.map((row) => row.seq)) + 5;
  const frames: { event: string; data: unknown }[] = [];
  const response = await fetch(`${base}/profiles/work/events`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      "Last-Event-ID": String(high),
    },
    signal: abort.signal,
  });
  assert.equal(response.status, 200);
  assert.ok(response.body);
  const streamBody = response.body;
  streamReader = (async () => {
    let pending = "";
    for await (const bytes of streamBody) {
      pending += new TextDecoder().decode(bytes);
      let end = pending.indexOf("\n\n");
      while (end >= 0) {
        const block = pending.slice(0, end);
        pending = pending.slice(end + 2);
        end = pending.indexOf("\n\n");
        const event = /^event: ?(.+)$/m.exec(block)?.[1];
        const data = /^data: ?(.+)$/m.exec(block)?.[1];
        if (event && data) {
          frames.push({ event, data: JSON.parse(data) });
          writeFileSync(
            join(evidence, "restore-sse.json"),
            JSON.stringify(frames, null, 2),
          );
        }
      }
    }
  })().catch((error) => {
    if (!abort.signal.aborted) throw error;
  });
  await waitFor(
    () => frames.some((frame) => frame.event === "ready"),
    "SSE ready",
  );
  const dry = Schema.decodeUnknownSync(SnapshotRestoreReport)(
    await request("POST", `/snapshots/${empty.id}/restore`, { dry_run: true }),
  );
  assert.deepEqual(
    dry.task_counts.map((row) => [row.before, row.after]),
    [[6, 0]],
  );
  await request("POST", `/snapshots/${empty.id}/restore`, { dry_run: false });
  await waitFor(
    () => frames.some((frame) => frame.event === "reload"),
    "connected SSE reload",
  );
  assert.deepEqual(await request("GET", "/profiles/work/tasks"), []);
  await Bun.sleep(Math.max(0, Date.parse(due) - Date.now() + 100));
  await request("POST", `/snapshots/${saved.id}/restore`, { dry_run: false });
  await waitFor(
    () => frames.filter((frame) => frame.event === "reload").length === 2,
    "second generation reload",
  );
  let history: unknown;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    history = await request(
      "GET",
      `/profiles/work/tasks/${reminder.id}/history`,
    );
    if (JSON.stringify(history).includes("ReminderFired")) break;
    await Bun.sleep(100);
  }
  const operations = Schema.decodeUnknownSync(
    Schema.Array(
      Schema.Struct({ event: Schema.Struct({ kind: Schema.String }) }),
    ),
  )(history);
  assert.equal(
    operations.filter((row) => row.event.kind === "ReminderFired").length,
    1,
  );
  const later = Schema.decodeUnknownSync(Task)(
    await request("POST", "/profiles/work/tasks", {
      title: "New sequence after restore",
    }),
  );
  await waitFor(
    () =>
      frames.some(
        (frame) =>
          frame.event === "operation" &&
          JSON.stringify(frame.data).includes(later.id),
      ),
    "reused sequence delivered",
  );
  await waitFor(
    () =>
      frames.some(
        (frame) =>
          frame.event === "operation" &&
          JSON.stringify(frame.data).includes("ReminderFired") &&
          JSON.stringify(frame.data).includes(reminder.id),
      ),
    "restored reminder delivered over SSE",
  );
  const tasks = Schema.decodeUnknownSync(Schema.Array(Task))(
    await request("GET", "/profiles/work/tasks"),
  );
  assert.deepEqual(tasks.map((task) => task.title).sort(), [
    "New sequence after restore",
    "Snapshot restored reminder",
  ]);
  const snapshotDirectory = join(home, "snapshots");
  renameSync(snapshotDirectory, `${snapshotDirectory}-held`);
  try {
    writeFileSync(snapshotDirectory, "blocked Snapshot directory");
    await request(
      "POST",
      "/snapshots",
      { reason: "runtime failure" },
      credential,
      500,
    );
  } finally {
    rmSync(snapshotDirectory);
    renameSync(`${snapshotDirectory}-held`, snapshotDirectory);
  }
  writeFileSync(
    join(evidence, "http-result.json"),
    JSON.stringify(
      {
        status: "PASS",
        owner_only: true,
        reloads: 2,
        final_tasks: 2,
        restored_reminders: 1,
        dry_run_counts: [[6, 0]],
      },
      null,
      2,
    ),
  );
} finally {
  abort.abort();
  await streamReader;
  server.kill("SIGTERM");
  const timer = setTimeout(() => server.kill("SIGKILL"), 2000);
  const code = await server.exited;
  clearTimeout(timer);
  await Promise.all(logReaders);
  writeFileSync(
    join(evidence, "http-cleanup.json"),
    JSON.stringify({ server_exit: code }),
  );
}
