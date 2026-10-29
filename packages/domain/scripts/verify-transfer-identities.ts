import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
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
import { Task } from "@todo/domain";
import { TaskViewSchema } from "@todo/domain/presentation";
import { Schema } from "effect";

const [binaryArg, serverArg, evidenceArg] = process.argv.slice(2);
if (
  !binaryArg ||
  !serverArg ||
  !evidenceArg ||
  ![binaryArg, serverArg, evidenceArg].every(isAbsolute)
)
  throw new Error("Pass absolute CLI, server and evidence paths");
const binary = binaryArg;
const serverBinary = serverArg;
const evidence = evidenceArg;
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-c11-transfers-"));
const env = {
  ...process.env,
  HOME: scratch,
  TODO_DB: join(scratch, "scratch.db"),
  TODO_PORT: "0",
};
const actions: unknown[] = [];
let server: ChildProcess | undefined;
let log = "";
const TaskResponse = Schema.Struct({ task: TaskViewSchema });
const Transfer = Schema.Struct({
  dry_run: Schema.Boolean,
  results: Schema.Array(
    Schema.Struct({
      source_id: Schema.String,
      target_id: Schema.NullOr(Schema.String),
      outcome: Schema.String,
      message: Schema.optionalKey(Schema.String),
      details: Schema.optionalKey(
        Schema.Struct({
          external_id: Schema.String,
          profile_id: Schema.String,
        }),
      ),
    }),
  ),
  code: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Struct({ external_id: Schema.String, profile_id: Schema.String }),
  ),
});
function cli(
  args: string[],
  options: { stdin?: string; profile?: string; exit?: number } = {},
) {
  const result = Bun.spawnSync(
    [
      binary,
      "--profile",
      options.profile ?? "work",
      "--format",
      "json",
      ...args,
    ],
    {
      env,
      stdin:
        options.stdin === undefined
          ? "ignore"
          : new TextEncoder().encode(options.stdin),
    },
  );
  const body = Schema.decodeUnknownSync(Schema.Json)(
    JSON.parse(new TextDecoder().decode(result.stdout)),
  );
  actions.push({
    args,
    profile: options.profile ?? "work",
    exit: result.exitCode,
    body,
  });
  assert.equal(
    result.exitCode,
    options.exit ?? 0,
    JSON.stringify(body) + new TextDecoder().decode(result.stderr),
  );
  return body;
}
function state() {
  const db = new Database(env.TODO_DB, { readonly: true });
  try {
    return JSON.stringify({
      tables: ["tasks", "projects", "tags", "op_log", "snapshots"].map(
        (table) => db.query(`SELECT * FROM ${table}`).all(),
      ),
      snapshots: existsSync(join(scratch, "snapshots"))
        ? readdirSync(join(scratch, "snapshots"))
            .sort()
            .map((file) => [
              file,
              readFileSync(join(scratch, "snapshots", file)).toString("base64"),
            ])
        : [],
    });
  } finally {
    db.close();
  }
}
try {
  cli(["init", "--password-stdin"], { stdin: "scratch transfer passphrase\n" });
  cli(["init"], { profile: "personal" });
  for (const profile of ["work", "personal"])
    cli(["login", "--password-stdin"], {
      profile,
      stdin: "scratch transfer passphrase\n",
    });
  const source = Schema.decodeUnknownSync(TaskResponse)(
    cli(["add", "Copy source", "--external-id", "repo:copy"]),
  ).task;
  const moving = Schema.decodeUnknownSync(TaskResponse)(
    cli(["add", "Move source", "--external-id", "repo:clash"]),
  ).task;
  cli(["add", "Keep target", "--external-id", "repo:clash"], {
    profile: "personal",
  });
  server = spawn(serverBinary, [], { env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (chunk) => {
    log += chunk.toString();
  });
  server.stderr?.on("data", (chunk) => {
    log += chunk.toString();
  });
  const deadline = Date.now() + 60000;
  let url: string | undefined;
  while (Date.now() < deadline) {
    url = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1];
    if (url) break;
    if (server.exitCode !== null)
      throw new Error("Scratch server exited before readiness");
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(url, "Scratch server readiness timed out");
  const credential = Schema.decodeUnknownSync(
    Schema.Struct({ token: Schema.String }),
  )(
    JSON.parse(
      readFileSync(join(scratch, ".todo-cli/session_work.json"), "utf8"),
    ),
  ).token;
  const post = (task: string, kind: string, destination: string) => {
    const result = Bun.spawnSync(
      [
        "curl",
        "--silent",
        "--show-error",
        "--max-time",
        "30",
        "--request",
        "POST",
        `${url}/profiles/work/tasks/${task}/${kind}`,
        "--header",
        "Content-Type: application/json",
        "--header",
        `Authorization: Bearer ${credential}`,
        "--data-binary",
        JSON.stringify({ from_version: 1, destination_profile: destination }),
        "--write-out",
        "\n%{http_code}",
      ],
      { env },
    );
    assert.equal(result.exitCode, 0);
    const text = new TextDecoder().decode(result.stdout),
      split = text.lastIndexOf("\n");
    const response = {
      status: Number(text.slice(split + 1)),
      body: Schema.decodeUnknownSync(Schema.Json)(
        JSON.parse(text.slice(0, split)),
      ),
    };
    actions.push({ task, kind, destination, ...response });
    return response;
  };
  const same = post(source.id, "copy", "work");
  assert.equal(same.status, 422);
  assert.deepEqual(same.body, {
    _tag: "InvalidTask",
    message: "Copy needs a different Profile.",
  });
  const copied = post(source.id, "copy", "personal");
  assert.equal(copied.status, 200);
  const copy = Schema.decodeUnknownSync(Task)(copied.body);
  assert.equal(copy.external_id, null);
  assert.notEqual(copy.id, source.id);
  assert.deepEqual(
    Schema.decodeUnknownSync(TaskResponse)(cli(["show", source.id])).task,
    { ...source, attachments: [] },
  );
  const synced = Schema.decodeUnknownSync(
    Schema.Struct({ totals: Schema.Struct({ created: Schema.Int }) }),
  )(
    cli(["import", "-"], {
      profile: "personal",
      stdin: JSON.stringify([
        { external_id: "repo:copy", title: "Outside source update" },
      ]),
    }),
  );
  assert.equal(synced.totals.created, 1);
  assert.equal(
    Schema.decodeUnknownSync(TaskResponse)(
      cli(["show", copy.id], { profile: "personal" }),
    ).task.title,
    "Copy source",
  );
  const message =
    '"Personal" already has a Task with external id "repo:clash". Choose another Profile.';
  const clash = post(moving.id, "move", "personal");
  assert.equal(clash.status, 422);
  assert.deepEqual(clash.body, {
    _tag: "InvalidTask",
    message,
    details: { external_id: "repo:clash", profile_id: "personal" },
  });
  const baseline = state();
  const preview = Schema.decodeUnknownSync(Transfer)(
    cli(["move", moving.id, "--to", "personal", "--dry-run"], { exit: 2 }),
  );
  assert.equal(preview.dry_run, true);
  assert.equal(preview.code, "invalid_args");
  assert.equal(preview.message, message);
  assert.deepEqual(preview.details, {
    external_id: "repo:clash",
    profile_id: "personal",
  });
  assert.deepEqual(preview.results, [
    {
      source_id: moving.id,
      target_id: null,
      outcome: "external_id_conflict",
      message,
      details: { external_id: "repo:clash", profile_id: "personal" },
    },
  ]);
  const samePreview = Schema.decodeUnknownSync(Transfer)(
    cli(["copy", source.id, "--to", "work", "--dry-run"], { exit: 2 }),
  );
  assert.deepEqual(samePreview.results, [
    {
      source_id: source.id,
      target_id: null,
      outcome: "validation",
      message: "Copy needs a different Profile.",
    },
  ]);
  const copyPreview = Schema.decodeUnknownSync(Transfer)(
    cli(["copy", source.id, "--to", "personal", "--dry-run"]),
  );
  assert.deepEqual(copyPreview.results, [
    { source_id: source.id, target_id: null, outcome: "dry-run" },
  ]);
  assert.equal(state(), baseline);
  const free = Schema.decodeUnknownSync(TaskResponse)(
    cli(["add", "Free identity", "--external-id", "repo:free"]),
  ).task;
  const moved = post(free.id, "move", "personal");
  assert.equal(moved.status, 200);
  const accepted = Schema.decodeUnknownSync(Task)(moved.body);
  assert.deepEqual(
    [
      accepted.id,
      accepted.profile_id,
      accepted.external_id,
      accepted.row_version,
    ],
    [free.id, "personal", "repo:free", 2],
  );
  const db = new Database(env.TODO_DB, { readonly: true });
  try {
    assert.deepEqual(
      db
        .query(
          "SELECT reason FROM op_log WHERE outcome='rejected' ORDER BY seq",
        )
        .all(),
      [{ reason: "validation" }, { reason: "external_id_conflict" }],
    );
  } finally {
    db.close();
  }
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        passed: true,
        copyAcrossProfilesClearsIdentity: true,
        copyWithinProfileRejected: true,
        laterImportDoesNotUpdateCopy: true,
        moveKeepsIdentity: true,
        moveClashNamesIdentityAndProfile: true,
        dryRunsHaveNoWrites: true,
        historyRecordsRejections: true,
      },
      null,
      2,
    ),
  );
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const child = server,
      stopped = new Promise<void>((done) => child.once("exit", () => done()));
    const timeout = setTimeout(() => child.kill("SIGKILL"), 2000);
    child.kill("SIGTERM");
    await stopped;
    clearTimeout(timeout);
  }
  writeFileSync(join(evidence, "server.log"), log);
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  rmSync(scratch, { recursive: true, force: true });
}
process.stdout.write(`PASS; transfer identity evidence: ${evidence}\n`);
