import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { Effect, Schema } from "effect";
import {
  ActorId,
  BatchEdgeReport,
  EdgeReport,
  GraphReport,
  ProfileId,
  TaskRead,
  TaskWrite,
} from "../src/index.ts";
import { TaskResponse } from "../src/presentation.ts";
import { openStore } from "../src/store/store.ts";
import { create, task } from "./dag-proof.ts";
import { proveGraphPublic } from "./graph-public-proof.ts";
import { proveImportExportPublic } from "./import-export-public-proof.ts";
import { proveTtyDelete } from "./tty-delete-proof.ts";

const [cli, serverBinary, evidence] = process.argv.slice(2);
if (
  !cli ||
  !serverBinary ||
  !evidence ||
  ![cli, serverBinary, evidence].every(isAbsolute)
)
  throw new Error("Pass absolute CLI, server and evidence paths");
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-dag-public-"));
const path = join(scratch, "scratch.db");
const env = {
  ...process.env,
  HOME: scratch,
  TODO_DB: path,
  TODO_ATTACHMENT_ROOT: join(scratch, "attachments"),
};
const actions: unknown[] = [];
const object = Schema.decodeUnknownSync(
  Schema.Record(Schema.String, Schema.Json),
);
const run = (args: readonly string[], expected = 0, input = "") => {
  const result = Bun.spawnSync([cli, ...args, "--format", "json"], {
    env,
    stdin: new TextEncoder().encode(input),
    timeout: 20000,
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  actions.push({ args, exit: result.exitCode, stdout, stderr });
  assert.equal(result.exitCode, expected, stdout + stderr);
  return object(JSON.parse(stdout));
};
const taskResult = (args: readonly string[]) =>
  Schema.decodeUnknownSync(TaskResponse)(run(args)).task;
const fail = (args: readonly string[], code: string) => {
  const result = run(args, 2);
  assert.equal(result.code, code);
  return result;
};
const state = () => {
  const db = new Database(path, { readonly: true });
  try {
    return {
      tasks: db.query("SELECT payload FROM tasks ORDER BY id").all(),
      edges: db
        .query(
          "SELECT * FROM task_dependencies ORDER BY profile_id,dependent_id,blocker_id",
        )
        .all(),
      history: db.query("SELECT * FROM op_log ORDER BY seq").all(),
      checkpoints: db.query("SELECT * FROM snapshots ORDER BY seq").all(),
      owner_snapshots: existsSync(join(scratch, "snapshots"))
        ? readdirSync(join(scratch, "snapshots"))
            .sort()
            .map((name) => [
              name,
              readFileSync(join(scratch, "snapshots", name)).toString("base64"),
            ])
        : [],
    };
  } finally {
    db.close();
  }
};
let server: ReturnType<typeof Bun.spawn> | undefined;
let serverLog = "";
let serverExit: number | null = null;
let serverLogs: Promise<unknown> | undefined;
try {
  run(["init", "--password-stdin"], 0, "public Dependency proof\n");
  run(["login", "--password-stdin"], 0, "public Dependency proof\n");
  await Effect.runPromise(
    Effect.acquireUseRelease(
      openStore({ path }),
      (store) =>
        Effect.gen(function* () {
          const profile = Schema.decodeUnknownSync(ProfileId)("default");
          for (const name of [
            "A",
            "B",
            "C",
            "D",
            ...Array.from({ length: 14 }, (_, i) => `blocker-${i}`),
          ]) {
            const result = yield* store.append({
              actor: Schema.decodeUnknownSync(ActorId)("public-proof"),
              profile,
              event: create(task(name, { profile_id: profile })),
            });
            assert.equal(result.outcome, "committed");
          }
        }),
      (store) => Effect.orDie(store.close()),
    ),
  );
  const credential = Schema.decodeUnknownSync(
    Schema.Struct({ token: Schema.String }),
  )(
    JSON.parse(
      readFileSync(join(scratch, ".todo-cli/session_default.json"), "utf8"),
    ),
  ).token;
  const runningServer = Bun.spawn([serverBinary], {
    env: { ...env, TODO_PORT: "0" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  server = runningServer;
  const collect = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    for await (const bytes of stream)
      serverLog += decoder.decode(bytes, { stream: true });
  };
  serverLogs = Promise.all([
    collect(runningServer.stdout),
    collect(runningServer.stderr),
  ]);
  const deadline = Date.now() + 60000;
  while (!/Listening on http:\/\/127\.0\.0\.1:\d+/.test(serverLog)) {
    if (Date.now() > deadline)
      throw Error(`Server readiness timed out: ${serverLog}`);
    await Bun.sleep(20);
  }
  const base = serverLog.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  assert.ok(base);
  const http = async (
    method: string,
    route: string,
    payload?: unknown,
    expected = 200,
  ) => {
    const response = await fetch(base + route, {
      method,
      headers: {
        Authorization: `Bearer ${credential}`,
        ...(payload === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : null;
    actions.push({ method, route, status: response.status, body });
    assert.equal(response.status, expected, text);
    return body;
  };
  const linked = Schema.decodeUnknownSync(EdgeReport)(
    run(["depend", "B", "--on", "A", "--expected-version", "1"]),
  );
  assert.equal(linked.outcome, "added");
  const beforeHttpUsage = state();
  await http(
    "POST",
    "/profiles/default/tasks/B/dependencies",
    { blocker_id: "A", from_version: 0 },
    400,
  );
  assert.deepEqual(state().tasks, beforeHttpUsage.tasks);
  assert.deepEqual(state().edges, beforeHttpUsage.edges);
  run(["depend", "C", "--on", "B", "--expected-version", "1"]);
  assert.deepEqual(
    fail(
      ["depend", "A", "--on", "C", "--expected-version", "1"],
      "dependency_cycle",
    ).details,
    { dependent_id: "A", blocker_id: "C", path: ["A", "B", "C", "A"] },
  );
  assert.deepEqual(
    fail(
      ["depend", "A", "--on", "A", "--expected-version", "1"],
      "dependency_cycle",
    ).details,
    { dependent_id: "A", blocker_id: "A", path: ["A", "A"] },
  );
  const redundant = Schema.decodeUnknownSync(EdgeReport)(
    run(["depend", "C", "--on", "A", "--expected-version", "2"]),
  );
  assert.deepEqual(
    redundant.warnings.map((w) =>
      w.code === "redundant_dependency" ? w.path : [],
    ),
    [["A", "B", "C"]],
  );
  const noWrite = state();
  assert.equal(
    Schema.decodeUnknownSync(EdgeReport)(
      run(["depend", "B", "--on", "A", "--expected-version", "999"]),
    ).outcome,
    "unchanged",
  );
  assert.equal(
    Schema.decodeUnknownSync(EdgeReport)(
      run(["undepend", "A", "--from", "D", "--expected-version", "999"]),
    ).outcome,
    "unchanged",
  );
  assert.deepEqual(state(), noWrite);
  const stale = run(["depend", "B", "--on", "D", "--expected-version", "1"], 4);
  assert.equal(stale.code, "occ_conflict");
  const graph = Schema.decodeUnknownSync(GraphReport)(run(["graph", "C"]));
  assert.equal(graph.shape, "dag");
  assert.equal(graph.edges.length, 3);
  const ready = Schema.decodeUnknownSync(
    Schema.Struct({
      tasks: Schema.Array(Schema.Struct({ id: Schema.String })),
    }),
  )(run(["list", "--ready", "--text", '"Task B"']));
  assert.deepEqual(ready.tasks, []);
  fail(["list", "--ready=false"], "invalid_args");
  fail(["list", "--blocked=false"], "invalid_args");
  const httpReady = Schema.decodeUnknownSync(Schema.Array(TaskRead))(
    await http("GET", "/profiles/default/tasks?ready=true&prefix=A"),
  );
  assert.deepEqual(
    httpReady.map((t) => t.id),
    ["A"],
  );
  const invalidReady = object(
    await http("GET", "/profiles/default/tasks?ready=false", undefined, 400),
  );
  assert.match(String(invalidReady.message), /--blocked or --status/);
  const httpBlocked = Schema.decodeUnknownSync(Schema.Array(TaskRead))(
    await http("GET", "/profiles/default/tasks?blocked=true&prefix=B"),
  );
  assert.deepEqual(
    httpBlocked.map((t) => t.id),
    ["B"],
  );
  const blocked = fail(["done", "B", "--expected-version", "2"], "blocked");
  assert.match(String(blocked.message), /Finish or cancel/);
  const httpFailure = object(
    await http(
      "POST",
      "/profiles/default/tasks/B/transition",
      { from_version: 2, action: "complete" },
      422,
    ),
  );
  assert.equal(httpFailure.code, "blocked");
  assert.deepEqual(httpFailure.details, blocked.details);
  const beforeDeletePreview = state();
  const preview = run(["rm", "A", "--expected-version", "1", "--dry-run"]);
  assert.equal(preview.dry_run, true);
  assert.deepEqual(state(), beforeDeletePreview);
  const httpPreview = Schema.decodeUnknownSync(TaskWrite)(
    await http(
      "DELETE",
      "/profiles/default/tasks/A?from_version=1&dry_run=true",
    ),
  );
  assert.equal(httpPreview.dry_run, true);
  assert.deepEqual(state(), beforeDeletePreview);
  assert.match(
    String(
      fail(["rm", "A", "--expected-version", "1"], "has_dependencies").message,
    ),
    /--with-dependencies/,
  );
  const initial = taskResult(["add", "Initial edges", "--depends-on", "A"]);
  assert.equal(initial.row_version, 1);
  const initialGraph = Schema.decodeUnknownSync(GraphReport)(
    run(["graph", initial.id]),
  );
  assert.ok(
    initialGraph.edges.some(
      (edge) => edge.dependent_id === initial.id && edge.blocker_id === "A",
    ),
  );
  const beforeBadInitial = state().tasks;
  fail(
    ["add", "Invalid initial edge", "--depends-on", "missing"],
    "dependency_profile_mismatch",
  );
  assert.deepEqual(state().tasks, beforeBadInitial);
  const inverse = Schema.decodeUnknownSync(TaskWrite)(
    await http("POST", "/profiles/default/tasks/B/revert", {
      from_version: 2,
      seq: linked.seq,
    }),
  );
  assert.equal(inverse.row_version, 3);
  const removed = Schema.decodeUnknownSync(EdgeReport)(
    run(["undepend", "C", "--from", "A", "--expected-version", "3"]),
  );
  assert.ok(removed.seq);
  assert.equal(
    taskResult(["revert", String(removed.seq), "--expected-version", "4"])
      .row_version,
    5,
  );
  for (let i = 0; i < 14; i++) {
    const args = [
      "depend",
      "D",
      "--on",
      `blocker-${i}`,
      "--expected-version",
      String(i + 1),
    ];
    if (i === 13)
      assert.equal(
        object(
          await http(
            "POST",
            "/profiles/default/tasks/D/dependencies",
            { blocker_id: `blocker-${i}`, from_version: i + 1 },
            422,
          ),
        ).code,
        "too_many_dependencies",
      );
    else {
      const report = Schema.decodeUnknownSync(EdgeReport)(run(args));
      assert.deepEqual(
        report.warnings.map((w) =>
          w.code === "many_dependencies" ? w.count : null,
        ),
        i >= 8 ? [i + 1] : [],
      );
    }
  }
  const batchFile = join(scratch, "batch.json");
  writeFileSync(
    batchFile,
    JSON.stringify({
      items: [
        {
          action: "undepend",
          dependent_id: "D",
          blocker_id: "blocker-0",
          from_version: 14,
        },
        {
          action: "undepend",
          dependent_id: "D",
          blocker_id: "blocker-1",
          from_version: 15,
        },
      ],
    }),
  );
  const beforeBatch = state();
  const batch = Schema.decodeUnknownSync(BatchEdgeReport)(
    run(["batch-depend", "--file", batchFile, "--dry-run"]),
  );
  assert.deepEqual(
    batch.results.map((row) => ("result" in row ? row.result.to_version : 0)),
    [15, 16],
  );
  assert.deepEqual(state(), beforeBatch);
  const staleFingerprint = String(preview.dependency_fingerprint);
  const changed = await http(
    "DELETE",
    `/profiles/default/tasks/A?from_version=1&with_dependencies=true&dependency_fingerprint=${staleFingerprint}`,
    undefined,
    422,
  );
  assert.equal(object(changed).code, "has_dependencies");
  run(["done", "A", "--expected-version", "1"]);
  run(["done", "B", "--expected-version", "3"]);
  run(["done", "C", "--expected-version", "5"]);
  assert.equal(
    fail(["reopen", "A", "--expected-version", "2"], "blocks_done_task").code,
    "blocks_done_task",
  );
  const series = Schema.decodeUnknownSync(TaskWrite)(
    await http("POST", "/profiles/default/series", {
      task: { title: "Series first", depends_on: ["A"] },
      recurrence: {
        dtstart: { kind: "date", date: "2026-11-09" },
        rrule: "FREQ=DAILY;COUNT=2",
        exdate: [],
      },
    }),
  );
  assert.equal(series.row_version, 1);
  await http("POST", `/profiles/default/tasks/${series.id}/transition`, {
    from_version: 1,
    action: "complete",
  });
  const occurrences = Schema.decodeUnknownSync(Schema.Array(TaskRead))(
    await http("GET", "/profiles/default/tasks?text=Series"),
  );
  assert.equal(occurrences.length, 2);
  assert.deepEqual(occurrences.find((t) => t.id !== series.id)?.depends_on, []);
  run(["init", "--profile", "other"]);
  const copy = run(["copy", "D", "--to", "other", "--expected-version", "14"]);
  assert.ok(copy.results);
  const move = run(["move", "D", "--to", "other", "--expected-version", "14"]);
  const moveRows = Schema.decodeUnknownSync(
    Schema.Array(
      Schema.Struct({ removed_dependencies: Schema.Array(Schema.Json) }),
    ),
  )(move.results);
  assert.equal(moveRows[0]?.removed_dependencies.length, 13);
  const schema = run(["schema", "graph"]);
  assert.ok(schema.$schema);
  for (const [command, args] of [
    ["list", []],
    ["depend", ["B", "--on", "A", "--expected-version", "3"]],
  ] as const) {
    const failure: Bun.SyncSubprocess<"pipe", "pipe"> = Bun.spawnSync(
      [cli, command, ...args, "--format", "mermaid", "--format", "json"],
      { env },
    );
    assert.equal(failure.exitCode, 2);
    assert.equal(
      object(JSON.parse(failure.stdout.toString())).code,
      "invalid_args",
    );
  }
  const mermaid = Bun.spawnSync([cli, "graph", "C", "--format", "mermaid"], {
    env,
  });
  assert.equal(mermaid.exitCode, 0);
  assert.match(mermaid.stdout.toString(), /^flowchart TD\n/);
  await proveTtyDelete({ cli, env, evidence, run, state });
  await proveImportExportPublic({
    cli,
    env,
    scratch,
    evidence,
    run,
    http,
    state,
  });
  await proveGraphPublic({ path, evidence, run, http });
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      { passed: true, cli_and_http: true, source_preview_unchanged: true },
      null,
      2,
    ),
  );
} finally {
  if (server) {
    server.kill("SIGTERM");
    const timer = setTimeout(() => server?.kill("SIGKILL"), 3000);
    serverExit = await server.exited;
    clearTimeout(timer);
    await serverLogs;
  }
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  writeFileSync(join(evidence, "server.log"), serverLog);
  writeFileSync(
    join(evidence, "cleanup.json"),
    JSON.stringify(
      {
        server_pid: server?.pid,
        server_exit: serverExit,
        scratch_removed: true,
      },
      null,
      2,
    ),
  );
  rmSync(scratch, { recursive: true, force: true });
}
