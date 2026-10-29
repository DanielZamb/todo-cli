import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Effect, Schema } from "effect";
import { ActorId, type OpLogEntry, Sequence, Task } from "../src/index.ts";
import { SnapshotManifest } from "../src/snapshots.ts";
import { openStore } from "../src/store/store.ts";

const scratch = process.argv[2];
const evidence = process.argv[3];
if (
  !scratch?.includes("todo-f10-verify-") ||
  !evidence ||
  !resolve(evidence).startsWith("/")
)
  throw new Error("Expected owned scratch and absolute evidence");
const home = join(scratch, "home");
mkdirSync(home);
const path = join(scratch, "scratch.db");
const env = { ...process.env, HOME: home, TODO_DB: path, TODO_PORT: "0" };
const actions: unknown[] = [];
const run = (args: string[], code = 0, input = "") => {
  const r = spawnSync(join(scratch, "todo"), args, {
    env,
    input,
    encoding: "utf8",
    timeout: 20000,
  });
  actions.push({
    command: ["todo", ...args],
    exit: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
  });
  assert.equal(r.status, code, r.stderr);
  return r.stdout;
};
const upgradeDirectory = join(scratch, "upgrade-race");
mkdirSync(upgradeDirectory);
const upgradePath = join(upgradeDirectory, "scratch.db");
const upgradeEnv = {
  ...env,
  TODO_DB: upgradePath,
  HOME: join(upgradeDirectory, "home"),
};
const provisioned = spawnSync(
  join(scratch, "todo"),
  ["init", "--profile", "work", "--password-stdin"],
  {
    env: upgradeEnv,
    input: "scratch upgrade proof\n",
    encoding: "utf8",
    timeout: 60000,
  },
);
assert.equal(provisioned.status, 0, provisioned.stderr);
const upgradeLock = new Database(upgradePath);
try {
  upgradeLock.exec(
    "DROP TRIGGER profiles_reserved_insert; DROP TRIGGER profiles_reserved_update; DROP TABLE profile_deletions; PRAGMA user_version=3; BEGIN IMMEDIATE",
  );
  const children = Array.from({ length: 3 }, (_, index) =>
    Bun.spawn([join(scratch, "todo"), "init", "--profile", "work"], {
      env: { ...upgradeEnv, HOME: join(upgradeDirectory, `client-${index}`) },
      stdout: "pipe",
      stderr: "pipe",
    }),
  );
  try {
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    upgradeLock.exec("COMMIT");
    const exits = await Promise.all(children.map((child) => child.exited));
    const snapshots = readdirSync(join(upgradeDirectory, "snapshots"))
      .filter((name) => name.endsWith(".json"))
      .map((name) =>
        Schema.decodeUnknownSync(SnapshotManifest)(
          JSON.parse(
            readFileSync(join(upgradeDirectory, "snapshots", name), "utf8"),
          ),
        ),
      );
    const result = {
      exits,
      snapshots: snapshots.map((s) => ({
        reason: s.reason,
        schema_version: s.schema_version,
      })),
    };
    writeFileSync(
      join(evidence, "concurrent-upgrade.json"),
      JSON.stringify(result, null, 2),
    );
    assert.deepEqual(exits, [0, 0, 0]);
    assert.deepEqual(result.snapshots, [
      { reason: "pre-migration", schema_version: 3 },
    ]);
    assert.equal(
      upgradeLock
        .query<{ user_version: number }, []>("PRAGMA user_version")
        .get()?.user_version,
      6,
    );
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    await Promise.all(children.map((child) => child.exited));
  }
} finally {
  upgradeLock.close();
}
run(
  ["init", "--profile", "work", "--password-stdin"],
  0,
  "scratch profile proof\n",
);
run(["init", "--profile", "personal"]);
run(
  ["login", "--profile", "work", "--password-stdin"],
  0,
  "scratch profile proof\n",
);
run(["add", "Recover this Task", "--profile", "work", "--format", "json"]);
run(
  [
    "add",
    "Never touch this Task",
    "--project",
    "Personal project",
    "--tag",
    "private",
    "--profile",
    "personal",
    "--format",
    "json",
  ],
  3,
);
run(
  ["login", "--profile", "personal", "--password-stdin"],
  0,
  "scratch profile proof\n",
);
run([
  "add",
  "Never touch this Task",
  "--project",
  "Personal project",
  "--tag",
  "private",
  "--profile",
  "personal",
  "--format",
  "json",
]);
const report = Schema.Struct({
  tasks_affected: Schema.Number,
  access_tokens_revoked: Schema.Number,
  dry_run: Schema.Boolean,
});
const preview = Schema.decodeUnknownSync(report)(
  JSON.parse(
    run([
      "profile",
      "delete",
      "work",
      "--profile",
      "work",
      "--with-tasks",
      "--dry-run",
      "--format",
      "json",
    ]),
  ),
);
assert.deepEqual(preview, {
  tasks_affected: 1,
  access_tokens_revoked: 0,
  dry_run: true,
});
run(["profile", "delete", "work", "--profile", "work", "--format", "json"], 2);
const sql = new Database(path, { readonly: true });
const foreign = () =>
  JSON.stringify({
    tasks: sql.query("SELECT * FROM tasks WHERE profile_id='personal'").all(),
    projects: sql
      .query("SELECT * FROM projects WHERE profile_id='personal'")
      .all(),
    tags: sql.query("SELECT * FROM tags WHERE profile_id='personal'").all(),
    ops: sql
      .query("SELECT * FROM op_log WHERE profile='personal' ORDER BY seq")
      .all(),
  });
const before = foreign();
let serverLog = "";
const server = spawn(join(scratch, "server"), [], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (d) => {
  serverLog += d;
});
server.stderr.on("data", (d) => {
  serverLog += d;
});
let serverExit: number | string | null = null;
server.once("exit", (code, signal) => {
  serverExit = code ?? signal;
});
try {
  const started = Date.now();
  while (!/Listening on http:\/\/127\.0\.0\.1:\d+/.test(serverLog)) {
    assert.equal(server.exitCode, null, serverLog);
    if (Date.now() - started > 60000) throw new Error("Server startup timeout");
    await new Promise((r) => setTimeout(r, 50));
  }
  const base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(serverLog)?.[1];
  assert.ok(base);
  const sessionSchema = Schema.Struct({ credential: Schema.String });
  const session = Schema.decodeUnknownSync(sessionSchema)(
    await (
      await fetch(base + "/auth/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase: "scratch profile proof" }),
      })
    ).json(),
  ).credential;
  const request = async (
    method: string,
    url: string,
    body?: unknown,
    credential = session,
  ) => {
    const r = await fetch(base + url, {
      method,
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data: unknown = await r.json();
    if (!url.startsWith("/auth/"))
      actions.push({ method, url, status: r.status, body: data });
    return { status: r.status, body: data };
  };
  const token = Schema.decodeUnknownSync(sessionSchema)(
    (
      await request("POST", "/auth/tokens", {
        name: "scoped",
        profile: "work",
        scope: "read-only",
      })
    ).body,
  ).credential;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const stream = await fetch(base + "/profiles/work/events", {
    headers: { authorization: `Bearer ${session}` },
    signal: controller.signal,
  });
  assert.equal(stream.status, 200);
  const reader = stream.body?.getReader();
  assert.ok(reader);
  type Chunk = Awaited<ReturnType<NonNullable<typeof reader>["read"]>>;
  let frames = "";
  while (!frames.includes("event: ready")) {
    const chunk: Chunk = await reader.read();
    assert.equal(chunk.done, false);
    frames += new TextDecoder().decode(chunk.value);
  }
  const receiving = (async () => {
    while (!frames.includes('"kind":"ProfileDeleted"')) {
      const chunk: Chunk = await reader.read();
      assert.equal(chunk.done, false);
      frames += new TextDecoder().decode(chunk.value);
    }
    return frames;
  })();
  const deleted = await request("DELETE", "/profiles/work", {
    with_tasks: true,
    dry_run: false,
  });
  assert.equal(deleted.status, 200);
  assert.deepEqual(Schema.decodeUnknownSync(report)(deleted.body), {
    tasks_affected: 1,
    access_tokens_revoked: 1,
    dry_run: false,
  });
  writeFileSync(join(evidence, "profile-deleted.sse"), await receiving);
  clearTimeout(timer);
  controller.abort();
  await reader.cancel().catch(() => {});
  const afterDeletion = foreign();
  assert.equal(afterDeletion, before);
  for (const url of [
    "/profiles/work/tasks",
    "/profiles/work/projects",
    "/profiles/work/tags",
    "/profiles/work/views/inbox",
    "/profiles/work/events",
  ]) {
    const r = await request("GET", url);
    assert.equal(r.status, 404);
    assert.equal(
      Schema.decodeUnknownSync(Schema.Struct({ code: Schema.String }))(r.body)
        .code,
      "not_found",
    );
  }
  assert.equal(
    (await request("GET", "/profiles/work/tasks", undefined, token)).status,
    401,
  );
  assert.equal((await request("GET", "/profiles/personal/tasks")).status, 200);
  const manifests = readdirSync(join(scratch, "snapshots"))
    .filter((name) => name.endsWith(".json"))
    .map((name) =>
      Schema.decodeUnknownSync(SnapshotManifest)(
        JSON.parse(readFileSync(join(scratch, "snapshots", name), "utf8")),
      ),
    );
  const manifest = manifests.find(
    (m) => m.reason === "before Profile delete work",
  );
  assert.ok(manifest);
  const recovery = new Database(manifest.path, { readonly: true });
  try {
    assert.deepEqual(
      recovery
        .query(
          "SELECT title,deleted_at,row_version FROM tasks WHERE profile_id='work'",
        )
        .all(),
      [{ title: "Recover this Task", deleted_at: null, row_version: 1 }],
    );
  } finally {
    recovery.close();
  }
  const store = await Effect.runPromise(openStore({ path }));
  try {
    const before = (await Effect.runPromise(store.tasks())).find(
      (t) => t.profile_id === "personal",
    );
    assert.ok(before);
    const identity = await Effect.runPromise(
      store.auth.authenticate({
        credential: session,
        profile: before.profile_id,
        access: "write",
      }),
    );
    for (const original_seq of [null, Schema.decodeUnknownSync(Sequence)(1)]) {
      const result: OpLogEntry = await Effect.runPromise(
        store.move({
          actor: Schema.decodeUnknownSync(ActorId)(identity.id),
          before,
          after: Schema.decodeUnknownSync(Task)({
            ...before,
            profile_id: "work",
            project_id: null,
            tags: [],
            row_version: before.row_version + 1,
          }),
          original_seq,
        }),
      );
      assert.deepEqual(
        [result.outcome, result.reason],
        ["rejected", "validation"],
      );
      assert.deepEqual(
        (await Effect.runPromise(store.tasks())).find(
          (t) => t.id === before.id,
        ),
        before,
      );
    }
  } finally {
    await Effect.runPromise(store.close());
  }
  await Promise.all(
    Array.from(
      { length: 12 },
      (_, index) =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(
            join(scratch, "todo"),
            ["init", "--profile", "work"],
            {
              env: { ...env, HOME: join(scratch, `concurrent-${index}`) },
              stdio: "ignore",
            },
          );
          child.once("error", reject);
          child.once("exit", (code) =>
            code === 0
              ? resolve()
              : reject(new Error(`Concurrent init exited ${code}`)),
          );
        }),
    ),
  );
  const names = Schema.decodeUnknownSync(
    Schema.Struct({
      profiles: Schema.Array(
        Schema.Struct({ id: Schema.String, name: Schema.String }),
      ),
    }),
  )(
    JSON.parse(
      run(["profile", "list", "--profile", "personal", "--format", "json"]),
    ),
  );
  assert.notEqual(names.profiles.find((p) => p.name === "work")?.id, "work");
  assert.equal(names.profiles.filter((p) => p.name === "work").length, 1);
  writeFileSync(join(evidence, "foreign-before.json"), before);
  writeFileSync(join(evidence, "foreign-after.json"), afterDeletion);
  run([
    "snapshot",
    "restore",
    manifest.id,
    "--profile",
    "personal",
    "--format",
    "json",
  ]);
  const restored = Schema.decodeUnknownSync(
    Schema.Struct({
      tasks: Schema.Array(
        Schema.Struct({ title: Schema.String, row_version: Schema.Number }),
      ),
    }),
  )(JSON.parse(run(["list", "--profile", "work", "--format", "json"])));
  assert.deepEqual(restored.tasks, [
    { title: "Recover this Task", row_version: 1 },
  ]);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({
      status: "PASS",
      foreignRowsByteIdentical: true,
      snapshotBeforeDeletion: true,
      snapshotRecovery: true,
      scopedTokenRevoked: true,
      sessionSurvives: true,
      sseNotice: true,
      tombstone404: true,
      nameReusedWithNewId: true,
      concurrentNameReuse: true,
      staleMoveAndRevertRejected: true,
    }),
  );
} finally {
  sql.close();
  if (server.exitCode === null && server.signalCode === null) {
    const closed = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 2000);
    await closed;
    clearTimeout(timer);
  }
  writeFileSync(join(evidence, "server.log"), serverLog);
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  writeFileSync(join(evidence, "cleanup.json"), JSON.stringify({ serverExit }));
}
