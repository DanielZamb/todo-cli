import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Option, Schema } from "effect";
import { TaskResponse } from "../src/presentation.ts";

const [cli, evidence] = process.argv.slice(2);
assert.ok(cli && evidence);
mkdirSync(evidence, { recursive: true });
const home = mkdtempSync(join(tmpdir(), "todo-dag-input-"));
const path = join(home, "scratch.db");
const env = { ...process.env, HOME: home, TODO_DB: path };
const actions: unknown[] = [];
const invoke = (args: readonly string[], input = "") => {
  const result = Bun.spawnSync([cli, ...args, "--format", "json"], {
    env,
    stdin: new TextEncoder().encode(input),
    timeout: 60000,
  });
  const action = {
    args,
    exit: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
  actions.push(action);
  return action;
};
const success = (args: readonly string[], input = "") => {
  const result = invoke(args, input);
  assert.equal(result.exit, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
};
const projection = () => {
  const db = new Database(path, { readonly: true });
  try {
    return {
      tasks: db.query("SELECT id,payload FROM tasks ORDER BY id").all(),
      edges: db
        .query(
          "SELECT * FROM task_dependencies ORDER BY profile_id,dependent_id,blocker_id",
        )
        .all(),
      versions: db.query("SELECT * FROM task_versions ORDER BY id").all(),
    };
  } finally {
    db.close();
  }
};
const errorSchema = Schema.Struct({
  generated_at: Schema.String,
  code: Schema.String,
  message: Schema.String,
});
try {
  success(["init", "--password-stdin"], "input proof scratch\n");
  success(["login", "--password-stdin"], "input proof scratch\n");
  const a = Schema.decodeUnknownSync(TaskResponse)(
    success(["add", "Blocker"]),
  ).task;
  const b = Schema.decodeUnknownSync(TaskResponse)(
    success(["add", "Dependent"]),
  ).task;
  const c = Schema.decodeUnknownSync(TaskResponse)(
    success(["add", "Unlinked"]),
  ).task;
  success(["depend", b.id, "--on", a.id, "--expected-version", "1"]);
  const batch = join(home, "batch.json");
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
  const malformedBatch = join(home, "malformed.json");
  writeFileSync(malformedBatch, "{");
  const textVersionBatch = join(home, "text-version.json");
  writeFileSync(
    textVersionBatch,
    JSON.stringify({
      items: [
        {
          action: "depend",
          dependent_id: b.id,
          blocker_id: c.id,
          from_version: "bad",
        },
      ],
    }),
  );
  const cases = [
    {
      name: "depend missing Version",
      args: ["depend", b.id, "--on", c.id],
      recovery: "--expected-version",
    },
    {
      name: "depend existing edge Version zero",
      args: ["depend", b.id, "--on", a.id, "--expected-version", "0"],
      recovery: "--expected-version",
    },
    {
      name: "depend missing edge Version zero",
      args: ["depend", b.id, "--on", c.id, "--expected-version", "0"],
      recovery: "--expected-version",
    },
    {
      name: "depend malformed Version",
      args: ["depend", b.id, "--on", c.id, "--expected-version", "bad"],
      recovery: "--expected-version",
    },
    {
      name: "depend empty blocker",
      args: ["depend", b.id, "--on", "", "--expected-version", "2"],
      recovery: "--on",
    },
    {
      name: "depend empty dependent",
      args: ["depend", "", "--on", a.id, "--expected-version", "2"],
      recovery: "task-id",
    },
    {
      name: "depend long blocker",
      args: [
        "depend",
        b.id,
        "--on",
        "x".repeat(201),
        "--expected-version",
        "2",
      ],
      recovery: "--on",
    },
    {
      name: "undepend absent edge Version zero",
      args: ["undepend", b.id, "--from", c.id, "--expected-version", "0"],
      recovery: "--expected-version",
    },
    {
      name: "undepend negative Version",
      args: ["undepend", b.id, "--from", a.id, "--expected-version", "-1"],
      recovery: "--expected-version",
    },
    {
      name: "undepend malformed Version",
      args: ["undepend", b.id, "--from", a.id, "--expected-version", "bad"],
      recovery: "--expected-version",
    },
    {
      name: "undepend empty blocker",
      args: ["undepend", b.id, "--from", "", "--expected-version", "2"],
      recovery: "--from",
    },
    {
      name: "undepend long blocker",
      args: [
        "undepend",
        b.id,
        "--from",
        "x".repeat(201),
        "--expected-version",
        "2",
      ],
      recovery: "--from",
    },
    { name: "graph empty id", args: ["graph", ""], recovery: "task-id" },
    {
      name: "graph invalid format",
      args: ["graph", b.id, "--format", "table"],
      recovery: "--format",
    },
    {
      name: "batch zero Version",
      args: ["batch-depend", "--file", batch],
      recovery: "from_version",
    },
    {
      name: "batch malformed Version",
      args: ["batch-depend", "--file", textVersionBatch],
      recovery: "from_version",
    },
    {
      name: "batch malformed JSON",
      args: ["batch-depend", "--file", malformedBatch],
      recovery: "--file",
    },
    {
      name: "rm zero Version",
      args: ["rm", b.id, "--with-dependencies", "--expected-version", "0"],
      recovery: "--expected-version",
    },
    {
      name: "rm malformed Version",
      args: ["rm", b.id, "--with-dependencies", "--expected-version", "bad"],
      recovery: "--expected-version",
    },
    {
      name: "rm malformed fingerprint",
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
    },
    {
      name: "rm empty id",
      args: ["rm", "", "--with-dependencies", "--expected-version", "2"],
      recovery: "task-id",
    },
    {
      name: "rm malformed confirmation",
      args: [
        "rm",
        b.id,
        "--with-dependencies=maybe",
        "--expected-version",
        "2",
      ],
      recovery: "--with-dependencies",
    },
    {
      name: "rm explicit empty fingerprint",
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
    },
    {
      name: "add empty blocker",
      args: ["add", "Invalid", "--depends-on", ""],
      recovery: "--depends-on",
    },
    {
      name: "add long blocker",
      args: ["add", "Invalid", "--depends-on", "x".repeat(201)],
      recovery: "--depends-on",
    },
    {
      name: "add too many blockers",
      args: [
        "add",
        "Invalid",
        ...Array.from({ length: 14 }, () => ["--depends-on", a.id]).flat(),
      ],
      recovery: "--depends-on",
    },
    {
      name: "add duplicate blockers",
      args: ["add", "Invalid", "--depends-on", a.id, "--depends-on", a.id],
      recovery: "--depends-on",
    },
    {
      name: "revert zero seq",
      args: ["revert", "0", "--expected-version", "1"],
      recovery: "seq",
    },
    {
      name: "revert malformed seq",
      args: ["revert", "bad", "--expected-version", "1"],
      recovery: "seq",
    },
    {
      name: "revert missing Version",
      args: ["revert", "999999"],
      recovery: "--expected-version",
    },
    {
      name: "revert zero Version before lookup",
      args: ["revert", "999999", "--expected-version", "0"],
      recovery: "--expected-version",
    },
  ];
  const before = projection();
  const observed = cases.map((test) => {
    const result = invoke(test.args);
    let value: unknown;
    try {
      value = JSON.parse(result.stdout);
    } catch {
      value = null;
    }
    const error = Schema.decodeUnknownOption(errorSchema)(value);
    const one_object = Option.isSome(error);
    const code = one_object ? error.value.code : null;
    const recovery = one_object && error.value.message.includes(test.recovery);
    assert.deepEqual(projection(), before, test.name);
    return {
      ...test,
      ...result,
      one_object,
      code,
      recovery,
      projection_unchanged: true,
      passed:
        result.exit === 2 && code === "invalid_args" && one_object && recovery,
    };
  });
  for (const [args, exit, code] of [
    [["graph", "valid-but-missing"], 3, "not_found"],
    [["graph", "x".repeat(201)], 3, "not_found"],
    [
      ["depend", b.id, "--on", "valid-but-missing", "--expected-version", "2"],
      2,
      "dependency_profile_mismatch",
    ],
    [
      ["add", "Missing reference", "--depends-on", "valid-but-missing"],
      2,
      "dependency_profile_mismatch",
    ],
    [
      ["batch-depend", "--file", join(home, "missing-file.json")],
      1,
      "runtime_error",
    ],
  ] as const) {
    const result = invoke(args);
    assert.equal(result.exit, exit);
    assert.equal(
      Schema.decodeUnknownSync(errorSchema)(JSON.parse(result.stdout)).code,
      code,
    );
    assert.deepEqual(projection(), before);
  }
  success(["depend", b.id, "--on", a.id, "--expected-version", "999"]);
  success(["undepend", b.id, "--from", c.id, "--expected-version", "999"]);
  assert.deepEqual(projection(), before);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        binary: cli,
        task_ids: [a.id, b.id, c.id],
        cases: observed,
        passed: observed.every((row) => row.passed),
      },
      null,
      2,
    ),
  );
  assert.deepEqual(
    observed.filter((row) => !row.passed).map((row) => row.name),
    [],
  );
} finally {
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  rmSync(home, { recursive: true, force: true });
}
