import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import {
  BatchEdgeReport,
  EdgeReport,
  ImportReport,
  TaskRead,
} from "../packages/domain/src/index.ts";
import { openStore } from "../packages/domain/src/store/store.ts";
import { proveTtyDelete } from "../packages/domain/scripts/tty-delete-proof.ts";
import {
  TaskResponse,
  TasksResponse,
} from "../packages/domain/src/presentation.ts";
const [cliInput, serverInput, evidenceInput, mode = "all"] =
  process.argv.slice(2);
assert.ok(cliInput && serverInput && evidenceInput);
const cli = cliInput,
  serverBinary = serverInput,
  evidence = evidenceInput;
const directory = mkdtempSync(join(evidence, "todo-dag-f-public-"));
const path = join(directory, "scratch.db");
const publicEnvironment = {
  ...process.env,
  HOME: directory,
  TODO_DB: path,
  TODO_ATTACHMENT_ROOT: join(directory, "attachments"),
};
const object = Schema.decodeUnknownSync(
  Schema.Record(Schema.String, Schema.Json),
);
const errors = Schema.decodeUnknownSync(
  Schema.Struct({
    generated_at: Schema.String,
    code: Schema.String,
    message: Schema.String,
    details: Schema.optionalKey(Schema.Json),
  }),
);
const actions: unknown[] = [];
const passed: string[] = [];
const selected = (name: string) =>
  mode === "all" ||
  mode === name ||
  (mode === "unaffected" && name !== "malformed") ||
  (mode === "rollback" && name === "batch");
let property = "setup",
  server: ReturnType<typeof Bun.spawn> | undefined;
let serverLog = "",
  logs: Promise<unknown> | undefined,
  serverExit: number | null = null;
const same = (name: string, actual: unknown, expected: unknown) => {
  property = name;
  assert.deepEqual(actual, expected, `BEHAVIORAL_FAILURE:${name}`);
};
function run(args: readonly string[], expected = 0, input = "") {
  const result = Bun.spawnSync([cli, ...args, "--format", "json"], {
    env: publicEnvironment,
    stdin: new TextEncoder().encode(input),
    timeout: 20000,
  });
  const stdout = result.stdout.toString(),
    stderr = result.stderr.toString();
  actions.push({ property, args, exitCode: result.exitCode, stdout, stderr });
  assert.equal(
    result.exitCode,
    expected,
    `BEHAVIORAL_FAILURE:${property}: ${stdout}${stderr}`,
  );
  const parsed = object(JSON.parse(stdout));
  if (args[0] !== "schema")
    assert.equal(
      typeof parsed.generated_at,
      "string",
      `BEHAVIORAL_FAILURE:${property}: envelope`,
    );
  return parsed;
}
function state() {
  const db = new Database(path, { readonly: true });
  try {
    return {
      tasks: db.query("SELECT payload FROM tasks ORDER BY id").all(),
      edges: db
        .query(
          "SELECT * FROM task_dependencies ORDER BY profile_id,dependent_id,blocker_id",
        )
        .all(),
      versions: db.query("SELECT * FROM task_versions ORDER BY id").all(),
      history: db.query("SELECT * FROM op_log ORDER BY seq").all(),
      checkpoints: db.query("SELECT * FROM snapshots ORDER BY seq").all(),
      snapshots: existsSync(join(directory, "snapshots"))
        ? readdirSync(join(directory, "snapshots"))
            .sort()
            .map((name) => [
              name,
              readFileSync(join(directory, "snapshots", name)).toString(
                "base64",
              ),
            ])
        : [],
    };
  } finally {
    db.close();
  }
}
const add = (title: string, blockers: string[] = []) =>
  Schema.decodeUnknownSync(TaskResponse)(
    run(["add", title, ...blockers.flatMap((id) => ["--depends-on", id])]),
  ).task;
const edge = (
  dependent: string,
  blocker: string,
  version: number,
  action = "depend",
) =>
  Schema.decodeUnknownSync(EdgeReport)(
    run([
      action,
      dependent,
      action === "depend" ? "--on" : "--from",
      blocker,
      "--expected-version",
      String(version),
    ]),
  );
const route = (id: string) => `/profiles/default/tasks/${id}`;
let base = "",
  credential = "";
async function http(
  method: string,
  path: string,
  payload?: unknown,
  expected = 200,
  authenticated = true,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(authenticated ? { Authorization: `Bearer ${credential}` } : {}),
      ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const text = await response.text();
  actions.push({ property, method, path, status: response.status, text });
  assert.equal(
    response.status,
    expected,
    `BEHAVIORAL_FAILURE:${property}: ${text}`,
  );
  return text ? object(JSON.parse(text)) : {};
}
async function importItems(items: unknown[], expected = 0) {
  return Schema.decodeUnknownSync(ImportReport)(
    run(["import", "-"], expected, JSON.stringify(items)),
  );
}
function itemId(report: ImportReport, external: string) {
  const id = report.items.find((row) => row.external_id === external)?.task_id;
  assert.ok(id);
  return id;
}
try {
  run(["init", "--password-stdin"], 0, "Formal public scratch passphrase\n");
  run(["login", "--password-stdin"], 0, "Formal public scratch passphrase\n");
  credential = Schema.decodeUnknownSync(
    Schema.Struct({ token: Schema.String }),
  )(
    JSON.parse(
      readFileSync(join(directory, ".todo-cli/session_default.json"), "utf8"),
    ),
  ).token;
  const launched = Bun.spawn([serverBinary], {
    env: { ...publicEnvironment, TODO_PORT: "0" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  server = launched;
  writeFileSync(
    join(evidence, "server-started.json"),
    JSON.stringify({ pid: server.pid, source: "isolated committed server" }),
  );
  const collect = async (stream: ReadableStream<Uint8Array>) => {
    for await (const chunk of stream)
      serverLog += new TextDecoder().decode(chunk);
  };
  logs = Promise.all([collect(launched.stdout), collect(launched.stderr)]);
  const deadline = Date.now() + 60000;
  while (!/Listening on http:\/\/127\.0\.0\.1:\d+/.test(serverLog)) {
    assert.ok(
      Date.now() < deadline,
      `Server readiness exceeded 60 seconds: ${serverLog}`,
    );
    await Bun.sleep(20);
  }
  base = serverLog.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0] ?? "";
  assert.ok(base);
  while (true) {
    const snapshotDirectory = join(directory, "snapshots");
    const files = existsSync(snapshotDirectory)
      ? readdirSync(snapshotDirectory)
      : [];
    const daily = files
      .filter((name) => name.endsWith(".json"))
      .some(
        (name) =>
          object(
            JSON.parse(readFileSync(join(snapshotDirectory, name), "utf8")),
          ).reason === "daily",
      );
    if (daily && !files.some((name) => name.endsWith(".tmp"))) break;
    assert.ok(
      Date.now() < deadline,
      "Initial daily Snapshot did not finish within the 60-second startup deadline",
    );
    await Bun.sleep(20);
  }
  writeFileSync(
    join(evidence, "startup-ready.json"),
    JSON.stringify({
      listening: true,
      initialDailySnapshotFinished: true,
      deadlineMs: 60000,
    }),
  );
  if (selected("filters")) {
    for (const name of ["ready", "blocked"]) {
      property = "public-false-cli";
      const failure = errors(run(["list", `--${name}=false`], 2));
      same("public-false-cli", failure.code, "invalid_args");
      assert.match(failure.message, /--blocked or --status/);
      property = "public-false-http";
      const bad = errors(
        await http(
          "GET",
          `/profiles/default/tasks?${name}=false`,
          undefined,
          400,
        ),
      );
      same("public-false-http", bad.code, "invalid_args");
      assert.match(bad.message, /--blocked or --status/);
    }
    const imported = await importItems([
      {
        external_id: "order-source",
        title: "F order Source",
        priority: "P4",
        energy: 5,
      },
      {
        external_id: "order-terminal",
        title: "F order Terminal",
        status: "cancelled",
        depends_on: ["order-source"],
      },
      {
        external_id: "order-goal",
        title: "F order Goal",
        priority: "P1",
        energy: 1,
        depends_on: ["order-terminal"],
      },
      { external_id: "order-done", title: "F order Done", status: "done" },
    ]);
    const ids = [
      "order-source",
      "order-terminal",
      "order-goal",
      "order-done",
    ].map((key) => itemId(imported, key));
    const [source, terminal, goal, done] = ids;
    assert.ok(source && terminal && goal && done);
    for (const order of ["topo", "lightest"]) {
      property = "public-whole-profile-order";
      const list = Schema.decodeUnknownSync(TasksResponse)(
        run([
          "list",
          "--text",
          "F order",
          "--status",
          "open",
          "--order",
          order,
        ]),
      );
      same(
        property,
        list.tasks?.map((t) => t.id),
        [source, goal],
      );
      const response = await fetch(
        base +
          `/profiles/default/tasks?text=F%20order&status=open&order=${order}`,
        { headers: { Authorization: `Bearer ${credential}` } },
      );
      same(property, response.status, 200);
      const rows = Schema.decodeUnknownSync(Schema.Array(TaskRead))(
        await response.json(),
      );
      same(
        property,
        rows.map((t) => t.id),
        [source, goal],
      );
    }
    for (const flag of ["ready", "blocked"]) {
      const list = Schema.decodeUnknownSync(TasksResponse)(
        run(["list", `--${flag}`, "--text", "F order"]),
      );
      same(
        "public-terminal-filters",
        list.tasks?.map((t) => t.id).sort(),
        flag === "ready" ? [source, goal].sort() : [],
      );
    }
    for (const flag of ["ready", "blocked"]) {
      const response = await fetch(
        base + "/profiles/default/tasks?text=F%20order&" + flag + "=true",
        { headers: { Authorization: "Bearer " + credential } },
      );
      same("public-terminal-filters", response.status, 200);
      const rows = Schema.decodeUnknownSync(Schema.Array(TaskRead))(
        await response.json(),
      );
      same(
        "public-terminal-filters",
        rows.map((t) => t.id).sort(),
        flag === "ready" ? [source, goal].sort() : [],
      );
    }
    const states = await importItems([
      { external_id: "f-state-source", title: "F state Source" },
      {
        external_id: "f-state-blocked",
        title: "F state Blocked",
        depends_on: ["f-state-source"],
      },
      {
        external_id: "f-state-ready",
        title: "F state Ready",
      },
    ]);
    for (const flag of ["ready", "blocked"]) {
      const expected = (
        flag === "ready"
          ? [itemId(states, "f-state-source"), itemId(states, "f-state-ready")]
          : [itemId(states, "f-state-blocked")]
      ).sort();
      const list = Schema.decodeUnknownSync(TasksResponse)(
        run(["list", "--text", "F state", "--" + flag]),
      );
      same(
        "public-positive-filters",
        list.tasks?.map((task) => task.id).sort(),
        expected,
      );
      const response = await fetch(
        base + "/profiles/default/tasks?text=F%20state&" + flag + "=true",
        { headers: { Authorization: "Bearer " + credential } },
      );
      same("public-positive-filters", response.status, 200);
      same(
        "public-positive-filters",
        Schema.decodeUnknownSync(Schema.Array(TaskRead))(await response.json())
          .map((task) => task.id)
          .sort(),
        expected,
      );
    }
    const both = Schema.decodeUnknownSync(TasksResponse)(
      run(["list", "--ready", "--blocked", "--text", "F order"]),
    );
    same("public-terminal-filters", both.tasks, []);
    passed.push("true-only-filters-terminal-exclusion-whole-profile-order");
  }
  if (selected("noop")) {
    const a = add("F boundary A"),
      b = add("F boundary B"),
      c = add("F boundary C");
    edge(b.id, a.id, 1);
    property = "public-stale-noop";
    const before = state();
    const unchanged = edge(b.id, a.id, 999);
    same(
      property,
      [
        unchanged.outcome,
        unchanged.from_version,
        unchanged.to_version,
        unchanged.seq,
      ],
      ["unchanged", 2, 2, null],
    );
    same(property, state(), before);
    const absent = edge(a.id, c.id, 999, "undepend");
    same(property, [absent.outcome, absent.seq], ["unchanged", null]);
    same(property, state(), before);
    property = "public-malformed-http";
    await http(
      "POST",
      route(b.id) + "/dependencies",
      { blocker_id: a.id, from_version: 0 },
      400,
    );
    const malformed = state();
    same(
      property,
      [malformed.tasks, malformed.edges, malformed.versions],
      [before.tasks, before.edges, before.versions],
    );

    property = "public-auth-boundary";
    await http(
      "POST",
      route(b.id) + "/dependencies",
      { blocker_id: a.id, from_version: 999 },
      401,
      false,
    );
    const afterAuth = state();
    same(
      property,
      [afterAuth.tasks, afterAuth.edges, afterAuth.versions],
      [before.tasks, before.edges, before.versions],
    );
    const token = Schema.decodeUnknownSync(
      Schema.Struct({ credential: Schema.String }),
    )(
      await http("POST", "/auth/tokens", {
        name: "F read-only noop boundary",
        profile: "default",
        scope: "read-only",
      }),
    );
    property = "public-read-token-noop";
    const readAttempt = await fetch(base + route(b.id) + "/dependencies", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token.credential,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ blocker_id: a.id, from_version: 999 }),
    });
    actions.push({
      property,
      status: readAttempt.status,
      text: await readAttempt.text(),
    });
    same(property, readAttempt.status, 403);
    const afterRead = state();
    same(
      property,
      [afterRead.tasks, afterRead.edges, afterRead.versions],
      [before.tasks, before.edges, before.versions],
    );
    property = "public-real-stale";
    same(
      property,
      errors(run(["depend", b.id, "--on", c.id, "--expected-version", "1"], 4))
        .code,
      "occ_conflict",
    );
    passed.push("stale-noop-malformed-http-auth-and-real-conflict");
  }
  if (selected("warnings")) {
    const target = add("F warning target");
    const blockers = Array.from({ length: 14 }, (_, i) =>
      add(`F warning blocker ${i}`),
    );
    for (let i = 0; i < 14; i++) {
      const blocker = blockers[i];
      assert.ok(blocker);
      const count = i + 1;
      property = "public-counted-warning";
      const advice = `This Task depends on ${count} Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks.`;
      if (count < 14) {
        const report = edge(target.id, blocker.id, count);
        same(
          property,
          report.warnings,
          count > 8
            ? [
                {
                  code: "many_dependencies",
                  dependent_id: target.id,
                  count,
                  message: advice,
                },
              ]
            : [],
        );
      } else {
        property = "public-count-refusal";
        const body = errors(
          await http(
            "POST",
            route(target.id) + "/dependencies",
            { blocker_id: blocker.id, from_version: 14 },
            422,
          ),
        );
        same(
          property,
          [body.code, body.message, body.details],
          [
            "too_many_dependencies",
            advice,
            { dependent_id: target.id, count: 14, limit: 13 },
          ],
        );
      }
    }
    const httpTarget = add("F HTTP warning target");
    for (const [index, blocker] of blockers.entries()) {
      const count = index + 1;
      const advice = `This Task depends on ${count} Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks.`;
      property =
        count === 14 ? "public-count-refusal" : "public-counted-warning";
      const wire = await http(
        "POST",
        route(httpTarget.id) + "/dependencies",
        { blocker_id: blocker.id, from_version: count },
        count === 14 ? 422 : 200,
      );
      if (count === 14) {
        const failure = errors(wire);
        same(
          property,
          [failure.code, failure.message, failure.details],
          [
            "too_many_dependencies",
            advice,
            { dependent_id: httpTarget.id, count: 14, limit: 13 },
          ],
        );
      } else {
        const report = Schema.decodeUnknownSync(EdgeReport)(wire);
        same(
          property,
          report.warnings,
          count > 8
            ? [
                {
                  code: "many_dependencies",
                  dependent_id: httpTarget.id,
                  count,
                  message: advice,
                },
              ]
            : [],
        );
      }
    }
    const refusedBlocker = blockers[13];
    assert.ok(refusedBlocker);
    property = "public-count-refusal";
    const cliRefusal = errors(
      run(
        [
          "depend",
          target.id,
          "--on",
          refusedBlocker.id,
          "--expected-version",
          "14",
        ],
        2,
      ),
    );
    same(
      property,
      [cliRefusal.code, cliRefusal.details],
      [
        "too_many_dependencies",
        { dependent_id: target.id, count: 14, limit: 13 },
      ],
    );
    const a = add("F redundant A"),
      b = add("F redundant B", [a.id]),
      c = add("F redundant C", [b.id]);
    const redundant = edge(c.id, a.id, 1);
    same(
      "public-redundant-path",
      redundant.warnings.map((w) =>
        w.code === "redundant_dependency" ? w.path : null,
      ),
      [[a.id, b.id, c.id]],
    );
    for (const name of ["depend", "undepend", "batch-depend", "graph"]) {
      property = "public-schema-envelope";
      const schema = run(["schema", name]);
      assert.equal(typeof schema.$schema, "string");
    }
    property = "public-format-boundary";
    const wrong = Bun.spawnSync([cli, "list", "--format", "mermaid"], {
      env: publicEnvironment,
    });
    same(property, wrong.exitCode, 2);
    assert.match(wrong.stderr.toString(), /format|mermaid/);
    const failure = Bun.spawnSync(
      [cli, "list", "--format", "mermaid", "--format", "json"],
      { env: publicEnvironment },
    );
    same(property, failure.exitCode, 2);
    same(
      property,
      errors(JSON.parse(failure.stdout.toString())).code,
      "invalid_args",
    );
    passed.push(
      "9-13-14-literal-warning-refusal-redundant-path-and-schema-format",
    );
  }
  if (selected("batch")) {
    const a = add("F batch blocker A"),
      b = add("F batch blocker B"),
      target = add("F batch target");
    const file = join(directory, "batch.json");
    writeFileSync(
      file,
      JSON.stringify({
        items: [
          {
            action: "depend",
            dependent_id: target.id,
            blocker_id: a.id,
            from_version: 1,
          },
          {
            action: "depend",
            dependent_id: target.id,
            blocker_id: b.id,
            from_version: 2,
          },
        ],
      }),
    );
    if (mode !== "rollback") {
      property = "public-batch-dry-run";
      const before = state();
      const preview = Schema.decodeUnknownSync(BatchEdgeReport)(
        run(["batch-depend", "--file", file, "--dry-run"]),
      );
      same(
        property,
        preview.results.map((row) =>
          "result" in row ? row.result.to_version : 0,
        ),
        [2, 3],
      );
      same(property, state(), before);
    }
    const failed = add("F batch failure"),
      success = add("F batch success");
    const db = new Database(path);
    try {
      db.exec(
        `CREATE TRIGGER f_batch_rollback BEFORE INSERT ON task_dependencies WHEN NEW.dependent_id='${failed.id}' BEGIN SELECT RAISE(ABORT,'F batch rollback'); END;`,
      );
      writeFileSync(
        file,
        JSON.stringify({
          items: [
            {
              action: "depend",
              dependent_id: failed.id,
              blocker_id: a.id,
              from_version: 1,
            },
            {
              action: "depend",
              dependent_id: success.id,
              blocker_id: a.id,
              from_version: 1,
            },
          ],
        }),
      );
      property = "public-batch-rollback";
      const result = Schema.decodeUnknownSync(BatchEdgeReport)(
        run(["batch-depend", "--file", file], 1),
      );
      same(
        property,
        db
          .query(
            "SELECT seq FROM op_log WHERE json_extract(event,'$.dependent_id')=? AND outcome='committed'",
          )
          .all(failed.id),
        [],
      );
      same(
        property,
        result.results.map((row) =>
          "result" in row ? row.result.outcome : row.error.code,
        ),
        ["runtime", "added"],
      );
      same(
        property,
        db
          .query(
            "SELECT blocker_id FROM task_dependencies WHERE dependent_id=?",
          )
          .all(failed.id),
        [],
      );
      same(
        property,
        db.query("SELECT row_version FROM tasks WHERE id=?").get(failed.id),
        { row_version: 1 },
      );
      same(
        property,
        db
          .query(
            "SELECT blocker_id FROM task_dependencies WHERE dependent_id=?",
          )
          .all(success.id),
        [{ blocker_id: a.id }],
      );
    } finally {
      db.exec("DROP TRIGGER f_batch_rollback");
      db.close();
    }
    passed.push("per-item-batch-dry-run-and-real-sql-rollback");
  }
  if (selected("delete")) {
    const target = add("F empty fingerprint target"),
      dependent = add("F empty fingerprint dependent", [target.id]);
    property = "public-delete-confirmation";
    const refused = errors(
      run(["rm", target.id, "--expected-version", "1"], 2),
    );
    same(property, refused.code, "has_dependencies");
    assert.match(refused.message, /--with-dependencies/);
    property = "public-delete-preview";
    const before = state();
    const preview = run([
      "rm",
      target.id,
      "--expected-version",
      "1",
      "--dry-run",
    ]);
    same(property, state(), before);
    edge(dependent.id, target.id, 1, "undepend");
    property = "public-empty-fingerprint";
    const stale = errors(
      run(
        [
          "rm",
          target.id,
          "--expected-version",
          "1",
          "--with-dependencies",
          "--dependency-fingerprint",
          String(preview.dependency_fingerprint),
        ],
        2,
      ),
    );
    same(property, stale.details, {
      task_id: target.id,
      dependencies: [],
      flag: "--with-dependencies",
    });
    same(
      property,
      stale.message,
      "The Dependency preview changed. Preview this Task again and confirm the current set before deleting it.",
    );
    const fresh = run([
      "rm",
      target.id,
      "--expected-version",
      "1",
      "--dry-run",
    ]);
    run([
      "rm",
      target.id,
      "--expected-version",
      "1",
      "--with-dependencies",
      "--dependency-fingerprint",
      String(fresh.dependency_fingerprint),
    ]);
    passed.push("delete-confirmation-preview-and-empty-fingerprint-recovery");
  }
  if (selected("import")) {
    const previewItems = [
      {
        external_id: "f-forward-goal",
        title: "F forward Goal",
        depends_on: ["f-forward-source"],
      },
      { external_id: "f-forward-source", title: "F forward Source" },
    ];
    const file = JSON.stringify(previewItems);
    property = "public-import-dry-run";
    const before = state();
    Schema.decodeUnknownSync(ImportReport)(
      run(["import", "-", "--dry-run"], 0, file),
    );
    same(property, state(), before);
    const imported = await importItems(previewItems);
    same(
      "public-import-forward",
      imported.items.map((row) => [row.external_id, row.outcome]),
      [
        ["f-forward-goal", "created"],
        ["f-forward-source", "created"],
      ],
    );
    const unlinked = add("F adoption target");
    const rejected = await importItems(
      [
        {
          external_id: "f-adopt-dependent",
          title: "F must not be created",
          depends_on: ["f-adopt-target"],
        },
        {
          external_id: "f-adopt-target",
          task_id: unlinked.id,
          from_version: 999,
        },
        { external_id: "f-independent", title: "F independent survives" },
      ],
      4,
    );
    same(
      "public-import-successful-map",
      rejected.items.map((row) => row.outcome),
      ["rejected", "rejected", "created"],
    );
    const db = new Database(path, { readonly: true });
    try {
      same(
        "public-import-successful-map",
        db
          .query(
            "SELECT id FROM tasks WHERE json_extract(payload,'$.external_id')='f-adopt-dependent'",
          )
          .all(),
        [],
      );
    } finally {
      db.close();
    }
    property = "public-import-successful-map";
    const adopted = await importItems([
      {
        external_id: "f-success-dependent",
        title: "F successful adoption dependent",
        depends_on: ["f-success-adopt"],
      },
      { external_id: "f-success-adopt", task_id: unlinked.id, from_version: 1 },
    ]);
    same(
      property,
      adopted.items.map((row) => row.outcome),
      ["created", "updated"],
    );
    same(property, itemId(adopted, "f-success-adopt"), unlinked.id);
    const adoptedDb = new Database(path, { readonly: true });
    try {
      same(
        property,
        adoptedDb
          .query(
            "SELECT blocker_id FROM task_dependencies WHERE dependent_id=?",
          )
          .all(itemId(adopted, "f-success-dependent")),
        [{ blocker_id: unlinked.id }],
      );
    } finally {
      adoptedDb.close();
    }
    const badItems = [
      {
        external_id: "f-forward-goal",
        status: "done",
        depends_on: ["f-forward-source"],
      },
    ];
    property = "public-import-encoding";
    const wire = await http("POST", "/profiles/default/import", {
      items: badItems,
    });
    const body = Schema.decodeUnknownSync(ImportReport)(wire);
    const failure = body.items[0]?.error;
    assert.ok(failure?.details?.dependency_error);
    const error = failure.details.dependency_error;
    same(property, error.code, "blocked");
    same(property, failure.details.current_version, 1);
    same(
      property,
      [failure.code, failure.message],
      [error.code, error.message],
    );
    same(
      property,
      Schema.encodeSync(ImportReport)(body).items[0]?.error?.details,
      failure.details,
    );
    if (error.code === "blocked")
      same(
        property,
        error.details.blockers.map((t) => t.id),
        [itemId(imported, "f-forward-source")],
      );
    passed.push(
      "import-forward-successful-map-independent-groups-canonical-witness-after-http-encoding",
    );
  }

  if (selected("witness")) {
    const blocker = Schema.decodeUnknownSync(TaskResponse)(
      run(["add", "F full witness blocker", "--desc", "x".repeat(40000)]),
    ).task;
    const dependent = add("F full witness dependent", [blocker.id]);
    property = "public-full-witness";
    const full = errors(
      run(["done", dependent.id, "--expected-version", "1"], 2),
    );
    same(property, full.code, "blocked");
    assert.ok(full.details);
    const captured = Schema.decodeUnknownSync(
      Schema.Struct({
        blockers: Schema.Array(
          Schema.Struct({ id: Schema.String, description: Schema.String }),
        ),
      }),
    )(full.details);
    same(
      property,
      captured.blockers.map((t) => [t.id, t.description.length]),
      [[blocker.id, 40000]],
    );
    const fullHttp = errors(
      await http(
        "POST",
        route(dependent.id) + "/transition",
        { action: "complete", from_version: 1 },
        422,
      ),
    );
    same(property, fullHttp.code, "blocked");
    same(property, fullHttp.details, full.details);
    const db = new Database(path, { readonly: true });
    let rejectedSeqs: number[] = [];
    try {
      const row = Schema.decodeUnknownSync(
        Schema.Struct({ seq: Schema.Int, event: Schema.String }),
      )(
        db
          .query(
            "SELECT seq,event FROM op_log WHERE reason='blocked' ORDER BY seq DESC LIMIT 1",
          )
          .get(),
      );
      rejectedSeqs = Schema.decodeUnknownSync(
        Schema.Array(Schema.Struct({ seq: Schema.Int })),
      )(
        db
          .query(
            "SELECT seq FROM op_log WHERE reason='blocked' AND json_extract(event,'$.task_id')=? ORDER BY seq",
          )
          .all(dependent.id),
      ).map((row) => row.seq);
      same("public-full-witness", rejectedSeqs.length, 2);
      property = "public-bounded-history";
      const recorded = Schema.decodeUnknownSync(
        Schema.Struct({
          details: Schema.Struct({
            witness: Schema.Json,
            truncated: Schema.Boolean,
            total: Schema.Int,
          }),
        }),
      )(JSON.parse(row.event));
      same(property, recorded.details.witness, null);
      same(property, recorded.details.truncated, true);
      assert.ok(recorded.details.total > 40000);
      assert.ok(Buffer.byteLength(row.event) < 32768);
      writeFileSync(
        join(evidence, "witness-before.json"),
        JSON.stringify(
          {
            full,
            fullHttp,
            history: JSON.parse(row.event),
            historyBytes: Buffer.byteLength(row.event),
          },
          null,
          2,
        ),
      );
    } finally {
      db.close();
    }
    const checkpoint = await Effect.runPromise(openStore({ path }));
    try {
      await Effect.runPromise(checkpoint.takeSnapshot());
    } finally {
      await Effect.runPromise(checkpoint.close());
    }
    run(["rm", dependent.id, "--expected-version", "1", "--with-dependencies"]);
    run(["rm", dependent.id, "--expected-version", "2", "--force"]);
    property = "public-purge-redaction";
    const redacted = new Database(path, { readonly: true });
    try {
      for (const seq of rejectedSeqs) {
        const row = Schema.decodeUnknownSync(
          Schema.Struct({ event: Schema.String }),
        )(redacted.query("SELECT event FROM op_log WHERE seq=?").get(seq));
        same(
          property,
          object(JSON.parse(row.event)).kind,
          "TaskHistoryRedacted",
        );
        same(property, row.event.includes("F full witness"), false);
        same(property, row.event.includes("x".repeat(100)), false);
      }
    } finally {
      redacted.close();
    }
    const expected = state();
    const replay = await Effect.runPromise(openStore({ path }));
    try {
      for (const useSnapshot of [false, true]) {
        await Effect.runPromise(replay.rebuild({ useSnapshot }));
        const actual = state();
        same(
          "public-purge-replay",
          [actual.tasks, actual.edges, actual.versions],
          [expected.tasks, expected.edges, expected.versions],
        );
      }
    } finally {
      await Effect.runPromise(replay.close());
    }
    passed.push(
      "full-captured-response-bounded-history-purge-redaction-and-both-replays",
    );
  }
  if (selected("tty")) {
    property = "public-tty-confirmation";
    await proveTtyDelete({ cli, env: publicEnvironment, evidence, run, state });
    passed.push("production-tty-default-no-eof-yes-and-fingerprint-race");
  }
  if (
    selected("malformed") ||
    mode === "boundaries" ||
    mode === "boundary-controls"
  ) {
    const a = add("F malformed A"),
      b = add("F malformed B"),
      c = add("F malformed C");
    edge(b.id, a.id, 1);
    const batch = join(directory, "bad-boundary-batch.json"),
      badJson = join(directory, "bad-boundary-json.json");
    writeFileSync(
      batch,
      JSON.stringify({
        items: [
          {
            action: "depend",
            dependent_id: b.id,
            blocker_id: c.id,
            from_version: 0,
          },
        ],
      }),
    );
    writeFileSync(badJson, "{");
    const cases: {
      name: string;
      args: string[];
      recovery: string;
      property: string;
    }[] = [
      {
        name: "existing add zero Version",
        args: ["depend", b.id, "--on", a.id, "--expected-version", "0"],
        recovery: "--expected-version",
        property: "public-malformed-cli",
      },
      {
        name: "missing add zero Version",
        args: ["depend", b.id, "--on", c.id, "--expected-version", "0"],
        recovery: "--expected-version",
        property: "public-malformed-cli",
      },
      {
        name: "absent remove zero Version",
        args: ["undepend", b.id, "--from", c.id, "--expected-version", "0"],
        recovery: "--expected-version",
        property: "public-malformed-cli",
      },
      {
        name: "depend empty endpoint",
        args: ["depend", "", "--on", a.id, "--expected-version", "2"],
        recovery: "task-id",
        property: "public-malformed-cli",
      },
      {
        name: "depend empty blocker",
        args: ["depend", b.id, "--on", "", "--expected-version", "2"],
        recovery: "--on",
        property: "public-malformed-cli",
      },
      {
        name: "undepend empty blocker",
        args: ["undepend", b.id, "--from", "", "--expected-version", "2"],
        recovery: "--from",
        property: "public-malformed-cli",
      },
      {
        name: "graph empty endpoint",
        args: ["graph", ""],
        recovery: "task-id",
        property: "public-boundary-graph",
      },
      {
        name: "add empty blocker",
        args: ["add", "F invalid", "--depends-on", ""],
        recovery: "--depends-on",
        property: "public-boundary-add",
      },
      {
        name: "add duplicate blockers",
        args: ["add", "F invalid", "--depends-on", a.id, "--depends-on", a.id],
        recovery: "--depends-on",
        property: "public-boundary-add",
      },
      {
        name: "rm zero Version",
        args: ["rm", b.id, "--with-dependencies", "--expected-version", "0"],
        recovery: "--expected-version",
        property: "public-boundary-delete",
      },
      {
        name: "rm invalid fingerprint",
        args: [
          "rm",
          b.id,
          "--with-dependencies",
          "--expected-version",
          "2",
          "--dependency-fingerprint",
          "bad",
        ],
        recovery: "--dependency-fingerprint",
        property: "public-boundary-delete",
      },
      {
        name: "rm present empty fingerprint",
        args: [
          "rm",
          b.id,
          "--with-dependencies",
          "--expected-version",
          "2",
          "--dependency-fingerprint",
          "",
        ],
        recovery: "--dependency-fingerprint",
        property: "public-boundary-delete",
      },
      {
        name: "batch zero Version",
        args: ["batch-depend", "--file", batch],
        recovery: "from_version",
        property: "public-boundary-batch",
      },
      {
        name: "batch malformed JSON",
        args: ["batch-depend", "--file", badJson],
        recovery: "--file",
        property: "public-boundary-batch",
      },
      {
        name: "revert zero seq",
        args: ["revert", "0", "--expected-version", "1"],
        recovery: "seq",
        property: "public-boundary-revert",
      },
      {
        name: "revert malformed seq",
        args: ["revert", "bad", "--expected-version", "1"],
        recovery: "seq",
        property: "public-boundary-revert",
      },
      {
        name: "revert zero Version before missing seq lookup",
        args: ["revert", "999999", "--expected-version", "0"],
        recovery: "--expected-version",
        property: "public-boundary-revert",
      },
    ];
    const before = state(),
      projection = (value: ReturnType<typeof state>) => [
        value.tasks,
        value.edges,
        value.versions,
      ];
    for (const test of cases) {
      property = test.property;
      const failure = errors(run(test.args, 2));
      same(property, failure.code, "invalid_args");
      assert.ok(
        failure.message.includes(test.recovery),
        test.name + " recovery",
      );
      same(property, projection(state()), projection(before));
    }
    for (const [args, exit, code] of [
      [["graph", "f-valid-but-missing"], 3, "not_found"],
      [["graph", "x".repeat(201)], 3, "not_found"],
      [
        [
          "depend",
          b.id,
          "--on",
          "f-valid-but-missing",
          "--expected-version",
          "2",
        ],
        2,
        "dependency_profile_mismatch",
      ],
      [
        ["batch-depend", "--file", join(directory, "file-does-not-exist.json")],
        1,
        "runtime_error",
      ],
    ] satisfies [string[], number, string][]) {
      property = "public-boundary-classification";
      same(property, errors(run(args, exit)).code, code);
      same(property, projection(state()), projection(before));
    }
    property = "public-stale-noop";
    const historyBefore = state();
    same(property, edge(b.id, a.id, 999).outcome, "unchanged");
    same(property, edge(b.id, c.id, 999, "undepend").outcome, "unchanged");
    same(property, state(), historyBefore);
    writeFileSync(
      join(evidence, "input-boundaries.json"),
      JSON.stringify(
        {
          cases,
          casesCount: cases.length,
          classificationCases: 4,
          projectionUnchanged: true,
        },
        null,
        2,
      ),
    );
    passed.push(
      "malformed-seven-command-boundaries-json-recovery-projection-noop-and-classification",
    );
  }
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "pass",
        mode,
        passed,
        graphResponse: "paused for root-only amendment",
        actions: actions.length,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ status: "pass", mode, passed, actions: actions.length }),
  );
} catch (error) {
  console.error(`BEHAVIORAL_FAILURE:${property}`);
  const result = {
    status: "fail",
    property,
    error: String(error),
    passed,
    actions: actions.length,
  };
  writeFileSync(join(evidence, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  process.exitCode = 1;
} finally {
  if (server) {
    server.kill("SIGTERM");
    const timer = setTimeout(() => server?.kill("SIGKILL"), 3000);
    serverExit = await server.exited;
    clearTimeout(timer);
    await logs;
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
  rmSync(directory, { recursive: true, force: true });
}
