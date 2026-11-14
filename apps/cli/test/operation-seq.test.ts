import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";

const scratch = mkdtempSync(join(tmpdir(), "todo-cli-seq-test-"));
const binary = process.env.TODO_CLI_BINARY ?? join(scratch, "todo");
const database = join(scratch, "scratch.db");
const run = (args: string[], code = 0) => {
  const result = spawnSync(
    binary,
    ["--profile", "work", "--format", "json", ...args],
    {
      env: { ...process.env, HOME: scratch, TODO_DB: database },
      encoding: "utf8",
      input: "scratch verification passphrase\n",
      timeout: 60000,
    },
  );
  expect(result.status, result.stdout + result.stderr).toBe(code);
  return JSON.parse(result.stdout);
};
const committedMax = () => {
  const db = new Database(database, { readonly: true });
  try {
    return db
      .query<{ seq: number }, []>(
        "SELECT max(seq) AS seq FROM op_log WHERE outcome='committed'",
      )
      .get()?.seq;
  } finally {
    db.close();
  }
};
beforeAll(() => {
  if (!process.env.TODO_CLI_BINARY) {
    const result = spawnSync(
      "bun",
      [
        "build",
        "--compile",
        resolve(import.meta.dirname, "../src/main.ts"),
        "--outfile",
        binary,
      ],
      { cwd: scratch, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
  }
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

it("adds operation_seq to a writing command's JSON only when it committed History", () => {
  expect(run(["init", "--password-stdin"]).operation_seq).toBe(committedMax());
  expect(run(["login", "--password-stdin"])).not.toHaveProperty(
    "operation_seq",
  );
  const added = run(["add", "First"]);
  expect(added.operation_seq).toBe(committedMax());
  const task = added.task;
  expect(run(["list"])).not.toHaveProperty("operation_seq");
  expect(
    run(["rm", task.id, "--expected-version", "1", "--dry-run"]),
  ).not.toHaveProperty("operation_seq");
  const before = committedMax() ?? 0;
  const done = run(["done", task.id, "--expected-version", "1"]);
  expect(done.operation_seq).toBe(committedMax());
  expect(done.operation_seq).toBeGreaterThan(before);
  const schema = run(["schema", "add"]);
  expect(schema.properties.operation_seq).toMatchObject({
    type: "integer",
    minimum: 1,
  });
  expect(run(["schema", "list"]).properties).not.toHaveProperty(
    "operation_seq",
  );
});
