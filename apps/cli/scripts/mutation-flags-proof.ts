import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { OperationStore } from "../../../packages/domain/src/store/store.ts";
import {
  actor,
  created,
  profile,
  task,
  time,
  work,
} from "../../../packages/domain/test/store-fixtures.ts";

export const deleteFlags = [
  "force",
  "with-dependencies",
  "dry-run",
  "dependency-fingerprint",
];
export const editFlags = [
  "title",
  "desc",
  "external-id",
  "project",
  "priority",
  "scheduled",
  "due",
  "recurrence",
  "energy",
  "estimate",
  "source",
  "tag",
];
const values: Record<string, string> = {
  "dependency-fingerprint": "a".repeat(64),
  title: "Ignored title",
  desc: "Ignored description",
  "external-id": "ignored-id",
  project: "Ignored Project",
  priority: "P1",
  scheduled: "2026-12-01",
  due: "2026-12-02",
  recurrence: "",
  energy: "2",
  estimate: "30",
  source: "agent",
  tag: "ignored-tag",
};
export const ignoredMutationFlags = [
  ...["edit", "done", "cancel", "reopen"].flatMap((command) =>
    deleteFlags.map((flag) => ({ command, flag })),
  ),
  ...["done", "cancel", "reopen", "rm"].flatMap((command) =>
    editFlags.map((flag) => ({ command, flag })),
  ),
];
const digest = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const usageMessage = (command: string, flag: string) =>
  `Unrecognized flag: --${flag} in command todo ${command}${command === "edit" && flag === "force" ? "\n\n  Did you mean this?\n    --source" : command === "rm" && flag === "source" ? "\n\n  Did you mean this?\n    --force" : ""}`;
const tables = (path: string) => {
  const db = new Database(
    existsSync(`${path}-wal`) ? path : `file:${path}?immutable=1`,
    { readonly: true },
  );
  try {
    return Object.fromEntries(
      db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all()
        .map(({ name }) => [
          name,
          JSON.stringify(
            db
              .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
              .all()
              .sort((a, b) =>
                JSON.stringify(a).localeCompare(JSON.stringify(b)),
              ),
          ),
        ]),
    );
  } finally {
    db.close();
  }
};
export async function proveMutationFlags(
  binary: string,
  directory: string,
  evidence: string,
) {
  mkdirSync(join(directory, ".todo-cli"), { recursive: true });
  mkdirSync(evidence, { recursive: true });
  const path = join(directory, "scratch.db"),
    seed = join(directory, "seed.db");
  const store = new OperationStore({ path });
  try {
    await Effect.runPromise(store.putProfile(work));
    await Effect.runPromise(store.auth.setupOwner("scratch flag passphrase"));
    for (const [id, status] of [
      ["open", "open"],
      ["completed", "done"],
    ]) {
      assert.equal(
        (
          await Effect.runPromise(
            store.append({
              actor,
              profile,
              event: {
                ...created,
                task: {
                  ...task,
                  id,
                  title: "Literal target",
                  status,
                  completed_at: status === "done" ? time : null,
                },
              },
            }),
          )
        ).outcome,
        "committed",
      );
    }
  } finally {
    await Effect.runPromise(store.close());
  }
  const env = {
    ...process.env,
    HOME: directory,
    TODO_DB: path,
    TODO_ATTACHMENT_ROOT: join(directory, "attachments"),
  };
  const login = Bun.spawnSync(
    [
      binary,
      "login",
      "--profile",
      "work",
      "--password-stdin",
      "--format",
      "json",
    ],
    {
      env,
      stdin: Buffer.from("scratch flag passphrase\n"),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  assert.equal(login.exitCode, 0, login.stderr.toString());
  copyFileSync(path, seed);
  const receipts = [];
  for (const item of ignoredMutationFlags) {
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(path + suffix, { force: true });
    copyFileSync(seed, path);
    const id = item.command === "reopen" ? "completed" : "open";
    const value = values[item.flag];
    const args = [
      item.command,
      id,
      "--expected-version",
      "1",
      ...(item.command === "edit"
        ? ["--title", "Changed by ignored flag"]
        : []),
      `--${item.flag}`,
      ...(value === undefined ? [] : [value]),
      "--profile",
      "work",
    ];
    const before = tables(path),
      beforeFile = digest(readFileSync(path));
    const result = Bun.spawnSync([binary, ...args], {
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const after = tables(path),
      afterFile = digest(readFileSync(path));
    const changed = Object.keys(before).filter(
      (name) => before[name] !== after[name],
    );
    const db = new Database(
      existsSync(`${path}-wal`) ? path : `file:${path}?immutable=1`,
      { readonly: true },
    );
    const taskState = db
      .query("SELECT id,row_version,status,title FROM tasks WHERE id=?")
      .get(id);
    db.close();
    const expectedStderr = `# Error\n\nerror 2 - validation or usage\n\n- code: invalid_args\n- message: ${usageMessage(item.command, item.flag)}\n`;
    const expectedTask = {
      id,
      row_version: 1,
      status: item.command === "reopen" ? "done" : "open",
      title: "Literal target",
    };
    receipts.push({
      ...item,
      args,
      exit: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      expected_stderr: expectedStderr,
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
      file_before: beforeFile,
      file_after: afterFile,
      task: taskState,
      expected_task: expectedTask,
      pass:
        result.exitCode === 2 &&
        result.stdout
          .toString()
          .includes(`USAGE\n  todo ${item.command} [flags] <task-id>`) &&
        result.stderr.toString() === expectedStderr &&
        changed.length === 0 &&
        JSON.stringify(taskState) === JSON.stringify(expectedTask) &&
        beforeFile === afterFile,
    });
  }
  writeFileSync(
    join(evidence, "mutation-flags.json"),
    JSON.stringify(receipts, null, 2) + "\n",
  );
  const failures = receipts.filter((row) => !row.pass);
  assert.equal(
    failures.length,
    0,
    JSON.stringify(
      failures.map(({ command, flag, exit, changed_tables, task }) => ({
        command,
        flag,
        exit,
        changed_tables,
        task,
      })),
      null,
      2,
    ),
  );
  return { status: "PASS", cases: receipts.length };
}

export function proveMutationUsageEarly(
  binary: string,
  directory: string,
  evidence: string,
) {
  const receipts = [];
  for (const item of ignoredMutationFlags.slice(0, 16)) {
    for (const format of ["md", "json"]) {
      const home = join(directory, `${item.command}-${item.flag}-${format}`);
      mkdirSync(join(home, ".todo-cli"), { recursive: true });
      writeFileSync(
        join(home, ".todo-cli", ".first_run_disclaimer_seen"),
        "fixture\n",
      );
      const path = join(home, "must-not-exist.db"),
        value = values[item.flag];
      const args = [
        item.command,
        "target",
        "--expected-version",
        "1",
        ...(item.command === "edit" ? ["--title", "Changed"] : []),
        `--${item.flag}`,
        ...(value === undefined ? [] : [value]),
        "--profile",
        "Never Created",
        "--format",
        format,
      ];
      const result = Bun.spawnSync([binary, ...args], {
        env: { ...process.env, HOME: home, TODO_DB: path },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      const message = usageMessage(item.command, item.flag);
      const expected =
        format === "md"
          ? `# Error\n\nerror 2 - validation or usage\n\n- code: invalid_args\n- message: ${message}\n`
          : {
              code: "invalid_args",
              message,
              exit_code: 2,
              exit_meaning: "validation or usage",
            };
      const stdout = result.stdout.toString(),
        stderr = result.stderr.toString();
      const decoded: unknown =
        format === "json" && stdout ? JSON.parse(stdout) : null;
      const normalized =
        decoded && typeof decoded === "object"
          ? Object.fromEntries(
              Object.entries(decoded).filter(([key]) => key !== "generated_at"),
            )
          : decoded;
      receipts.push({
        ...item,
        format,
        exit: result.exitCode,
        stdout,
        stderr,
        database_created: existsSync(path),
        pass:
          result.exitCode === 2 &&
          !existsSync(path) &&
          (format === "md"
            ? stdout.includes(
                `USAGE\n  todo ${item.command} [flags] <task-id>`,
              ) && stderr === expected
            : stderr === "" &&
              JSON.stringify(normalized) === JSON.stringify(expected)),
      });
    }
  }
  mkdirSync(evidence, { recursive: true });
  writeFileSync(
    join(evidence, "mutation-flags-early.json"),
    JSON.stringify(receipts, null, 2),
  );
  assert.deepEqual(
    receipts.filter((row) => !row.pass),
    [],
  );
  return { status: "PASS", cases: 32 };
}
if (import.meta.main) {
  const [binary, directory, evidence] = process.argv.slice(2);
  assert.ok(binary && directory && evidence && directory.includes("todo-"));
  console.log(
    JSON.stringify(await proveMutationFlags(binary, directory, evidence)),
  );
}
