import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { tables } from "./mutation-flags-proof.ts";

const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const IdResponse = Schema.Struct({
  task: Schema.Struct({ id: Schema.String, row_version: Schema.Int }),
});
const AttachmentResponse = Schema.Struct({
  task: Schema.Struct({
    id: Schema.String,
    row_version: Schema.Int,
    attachments: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        kind: Schema.String,
        path: Schema.String,
        label: Schema.optionalKey(Schema.String),
      }),
    ),
  }),
});
const ErrorDocument = Schema.Record(Schema.String, Schema.Json);
const usageMessage = "Unrecognized flag: --label in command todo detach";
const usageStderr = `# Error\n\nerror 2 - validation or usage\n\n- code: invalid_args\n- message: ${usageMessage}\n`;
const usageJson = {
  code: "invalid_args",
  message: usageMessage,
  exit_code: 2,
  exit_meaning: "validation or usage",
};
const fileState = (file: string) => {
  const stat = statSync(file);
  return {
    sha256: digest(readFileSync(file)),
    size: stat.size,
    mode: stat.mode,
    mtime: stat.mtimeMs,
    ctime: stat.ctimeMs,
  };
};
export function proveDetachLabelFlag(
  binary: string,
  directory: string,
  evidence: string,
) {
  mkdirSync(evidence, { recursive: true });
  const actions: unknown[] = [];
  const run = (home: string, args: string[], input?: string) => {
    const result = Bun.spawnSync([binary, ...args], {
      env: {
        ...process.env,
        HOME: home,
        TODO_DB: join(home, "scratch.db"),
        TODO_ATTACHMENT_ROOT: join(home, "attachments"),
      },
      stdin: input === undefined ? "ignore" : Buffer.from(input),
      stdout: "pipe",
      stderr: "pipe",
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
  const ok = (home: string, args: string[], input?: string): unknown => {
    const action = run(home, [...args, "--format", "json"], input);
    assert.equal(action.exit, 0, action.stdout + action.stderr);
    return JSON.parse(action.stdout);
  };
  const seed = (name: string) => {
    const home = join(directory, name);
    mkdirSync(home, { recursive: true });
    ok(home, ["init", "--password-stdin"], "scratch detach passphrase\n");
    ok(home, ["login", "--password-stdin"], "scratch detach passphrase\n");
    const created = Schema.decodeUnknownSync(IdResponse)(
      ok(home, ["add", "Detach literal Task"]),
    );
    assert.equal(created.task.row_version, 1);
    const file = join(home, "external.txt");
    writeFileSync(file, "literal external file\n");
    const attached = Schema.decodeUnknownSync(AttachmentResponse)(
      ok(home, [
        "attach",
        created.task.id,
        file,
        "--label",
        "Original label",
        "--expected-version",
        "1",
      ]),
    );
    assert.equal(attached.task.row_version, 2);
    assert.equal(attached.task.attachments.length, 1);
    const attachment = attached.task.attachments[0];
    assert.ok(attachment);
    assert.deepEqual(
      { kind: attachment.kind, path: attachment.path, label: attachment.label },
      { kind: "file", path: file, label: "Original label" },
    );
    return {
      home,
      file,
      path: join(home, "scratch.db"),
      task: attached.task,
      attachment,
    };
  };
  const results = [];
  for (const format of ["md", "json"]) {
    const fixture = seed(format);
    const before = tables(fixture.path),
      beforeFile = fileState(fixture.file),
      beforeDatabase = digest(readFileSync(fixture.path));
    const action = run(fixture.home, [
      "detach",
      fixture.task.id,
      fixture.attachment.id,
      "--label",
      "Ignored label",
      "--expected-version",
      "2",
      "--format",
      format,
    ]);
    const after = tables(fixture.path),
      afterFile = fileState(fixture.file),
      afterDatabase = digest(readFileSync(fixture.path));
    const changed = Object.keys(before).filter(
      (name) => before[name] !== after[name],
    );
    const observed = Schema.decodeUnknownSync(AttachmentResponse)(
      ok(fixture.home, ["show", fixture.task.id]),
    ).task;
    const error =
      format === "json"
        ? Object.fromEntries(
            Object.entries(
              Schema.decodeUnknownSync(ErrorDocument)(
                JSON.parse(action.stdout),
              ),
            ).filter(([key]) => key !== "generated_at"),
          )
        : null;
    const pass =
      action.exit === 2 &&
      changed.length === 0 &&
      beforeDatabase === afterDatabase &&
      JSON.stringify(beforeFile) === JSON.stringify(afterFile) &&
      observed.row_version === 2 &&
      JSON.stringify(observed.attachments) ===
        JSON.stringify(fixture.task.attachments) &&
      (format === "md"
        ? action.stderr === usageStderr &&
          action.stdout.includes(
            "USAGE\n  todo detach [flags] <task-id> <attachment-id>",
          )
        : action.stderr === "" &&
          JSON.stringify(error) === JSON.stringify(usageJson));
    results.push({
      format,
      ...action,
      changed_tables: changed,
      table_hashes: Object.fromEntries(
        Object.keys(before).map((name) => [
          name,
          {
            before: digest(before[name] ?? ""),
            after: digest(after[name] ?? ""),
          },
        ]),
      ),
      database_before: beforeDatabase,
      database_after: afterDatabase,
      external_before: beforeFile,
      external_after: afterFile,
      task_after: observed,
      expected_task: fixture.task,
      pass,
    });
    assert.equal(readFileSync(fixture.file, "utf8"), "literal external file\n");
  }
  const positive = seed("labels");
  const renamed = Schema.decodeUnknownSync(AttachmentResponse)(
    ok(positive.home, [
      "label-attachment",
      positive.task.id,
      positive.attachment.id,
      "--label",
      "Renamed label",
      "--expected-version",
      "2",
    ]),
  );
  assert.equal(renamed.task.row_version, 3);
  assert.equal(renamed.task.attachments[0]?.label, "Renamed label");
  const cleared = Schema.decodeUnknownSync(AttachmentResponse)(
    ok(positive.home, [
      "label-attachment",
      positive.task.id,
      positive.attachment.id,
      "--expected-version",
      "3",
    ]),
  );
  assert.equal(cleared.task.row_version, 4);
  assert.equal(cleared.task.attachments[0]?.label, undefined);
  const detached = Schema.decodeUnknownSync(AttachmentResponse)(
    ok(positive.home, [
      "detach",
      positive.task.id,
      positive.attachment.id,
      "--expected-version",
      "4",
    ]),
  );
  assert.equal(detached.task.row_version, 5);
  assert.deepEqual(detached.task.attachments, []);
  assert.equal(readFileSync(positive.file, "utf8"), "literal external file\n");
  const early = [];
  for (const format of ["md", "json"])
    for (const dryRun of [false, true]) {
      const home = join(directory, `early-${format}-${dryRun}`);
      mkdirSync(join(home, ".todo-cli"), { recursive: true });
      writeFileSync(
        join(home, ".todo-cli", ".first_run_disclaimer_seen"),
        "fixture\n",
      );
      const action = run(home, [
        "detach",
        "target",
        "attachment",
        "--label",
        "Ignored label",
        ...(dryRun ? ["--dry-run"] : []),
        "--profile",
        "Never Created",
        "--format",
        format,
      ]);
      const error =
        format === "json"
          ? Object.fromEntries(
              Object.entries(
                Schema.decodeUnknownSync(ErrorDocument)(
                  JSON.parse(action.stdout),
                ),
              ).filter(([key]) => key !== "generated_at"),
            )
          : null;
      early.push({
        format,
        dry_run: dryRun,
        ...action,
        database_created: existsSync(join(home, "scratch.db")),
        pass:
          action.exit === 2 &&
          !existsSync(join(home, "scratch.db")) &&
          (format === "md"
            ? action.stderr === usageStderr
            : action.stderr === "" &&
              JSON.stringify(error) === JSON.stringify(usageJson)),
      });
    }
  writeFileSync(
    join(evidence, "detach-label-actions.json"),
    JSON.stringify(actions, null, 2),
  );
  writeFileSync(
    join(evidence, "detach-label.json"),
    JSON.stringify(
      {
        results,
        early,
        positive_labels: {
          attached: "Original label",
          renamed: "Renamed label",
          cleared: null,
          final_version: 5,
          detached: [],
          external_file: "literal external file\n",
        },
      },
      null,
      2,
    ),
  );
  assert.deepEqual(
    results
      .filter((row) => !row.pass)
      .map((row) => ({
        format: row.format,
        exit: row.exit,
        changed: row.changed_tables,
        version: row.task_after.row_version,
        attachments: row.task_after.attachments,
      })),
    [],
  );
  assert.deepEqual(
    early.filter((row) => !row.pass),
    [],
  );
  return {
    status: "PASS",
    refusals: 2,
    early_refusals: 4,
    labels_preserved: true,
  };
}
if (import.meta.main) {
  const [binary, directory, evidence] = process.argv.slice(2);
  assert.ok(binary && directory && evidence && directory.includes("todo-"));
  console.log(
    JSON.stringify(proveDetachLabelFlag(binary, directory, evidence)),
  );
}
