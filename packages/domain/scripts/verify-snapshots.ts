import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { TasksResponse } from "../src/presentation.ts";
import {
  SnapshotList,
  SnapshotManifest,
  SnapshotRestoreReport,
} from "../src/snapshots.ts";

const [scratch, evidence] = Schema.decodeUnknownSync(
  Schema.Tuple([Schema.String, Schema.String]),
)(process.argv.slice(2));
if (!scratch || !evidence || !scratch.includes("todo-f13-verify-"))
  throw new Error("Expected scratch and evidence paths");
const env = {
  ...process.env,
  HOME: scratch,
  TODO_DB: join(scratch, "scratch.db"),
};
const actions: unknown[] = [];
function run(args: string[], input?: string, expected = 0): unknown {
  const process = Bun.spawnSync([join(scratch, "todo"), ...args], {
    env,
    stdin: input === undefined ? "ignore" : Buffer.from(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = process.stdout.toString();
  const stderr = process.stderr.toString();
  actions.push({ args, exit: process.exitCode, stdout, stderr });
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  assert.equal(
    process.exitCode,
    expected,
    `${args.join(" ")}: ${stderr} ${stdout}`,
  );
  return args.includes("json") ? JSON.parse(stdout) : stdout;
}
const json = (...args: string[]) => run(["--format", "json", ...args]);
const parseSnapshot = Schema.decodeUnknownSync(
  Schema.Struct({ snapshot: SnapshotManifest }),
);
const task = Schema.decodeUnknownSync(
  Schema.Struct({ task: Schema.Struct({ id: Schema.String }) }),
);
mkdirSync(join(scratch, ".todo-cli"), { mode: 0o700, recursive: true });
run(["init", "--password-stdin"], "scratch snapshot passphrase\n");
run(["login", "--password-stdin"], "scratch snapshot passphrase\n");
const first = task(json("add", "Snapshot private Task")).task;
const saved = parseSnapshot(
  json("snapshot", "create", "--reason", "before writing more"),
).snapshot;
json("add", "Later Task");
const dry = Schema.decodeUnknownSync(
  Schema.Struct({ restore: SnapshotRestoreReport }),
)(json("snapshot", "restore", saved.id, "--dry-run")).restore;
assert.deepEqual(
  dry.task_counts.map((row) => [row.before, row.after]),
  [[2, 1]],
);
json("snapshot", "restore", saved.id);
const listTasks = (value: unknown) =>
  Schema.decodeUnknownSync(TasksResponse)(value).tasks ?? [];
assert.deepEqual(
  listTasks(json("list")).map((row) => row.title),
  ["Snapshot private Task"],
);
run(["rm", first.id, "--expected-version", "1"]);
run(["rm", first.id, "--expected-version", "2", "--force"]);
assert.equal(
  readFileSync(saved.path).includes(Buffer.from("Snapshot private Task")),
  false,
);
json("snapshot", "restore", saved.id);
assert.deepEqual(listTasks(json("list")), []);
const corrupt = parseSnapshot(
  json("snapshot", "create", "--reason", "corrupt refusal"),
).snapshot;
writeFileSync(corrupt.path, "corrupt");
run(["--format", "json", "snapshot", "restore", corrupt.id], undefined, 2);
const newer = parseSnapshot(
  json("snapshot", "create", "--reason", "newer refusal"),
).snapshot;
const db = new Database(newer.path);
db.exec("PRAGMA user_version=999");
db.close();
writeFileSync(
  join(scratch, "snapshots", `${newer.id}.json`),
  JSON.stringify({
    ...newer,
    schema_version: 999,
    sha256: createHash("sha256").update(readFileSync(newer.path)).digest("hex"),
  }),
);
run(["--format", "json", "snapshot", "restore", newer.id], undefined, 2);
for (const command of ["create", "list", "show", "restore", "prune"])
  json("schema", `snapshot ${command}`);
const before = Schema.decodeUnknownSync(Schema.Struct(SnapshotList.fields))(
  json("snapshot", "list"),
);
json("snapshot", "prune", "--dry-run");
const after = Schema.decodeUnknownSync(Schema.Struct(SnapshotList.fields))(
  json("snapshot", "list"),
);
assert.equal(before.snapshots.length, after.snapshots.length);
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify(
    {
      result: "PASS",
      restore_counts: [[2, 1]],
      purged_tasks_after_restore: 0,
      corrupt_exit: 2,
      newer_schema_exit: 2,
      schemas: 5,
      snapshot_count: after.snapshots.length,
    },
    null,
    2,
  ),
);
