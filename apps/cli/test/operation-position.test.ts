import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";
import { committingCommands } from "../src/operation-position.ts";

const scratch = mkdtempSync(join(tmpdir(), "todo-cli-position-test-"));
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

it("adds operation_position to a writing command's JSON only when it committed History", () => {
  const at = () => ({ generation: "initial", seq: committedMax() });
  expect(run(["init", "--password-stdin"]).operation_position).toEqual(at());
  expect(run(["login", "--password-stdin"])).not.toHaveProperty(
    "operation_position",
  );
  const added = run(["add", "First"]);
  expect(added.operation_position).toEqual(at());
  const task = added.task;
  expect(run(["list"])).not.toHaveProperty("operation_position");
  expect(
    run(["rm", task.id, "--expected-version", "1", "--dry-run"]),
  ).not.toHaveProperty("operation_position");
  const before = committedMax() ?? 0;
  const done = run(["done", task.id, "--expected-version", "1"]);
  expect(done.operation_position).toEqual(at());
  expect(done.operation_position.seq).toBeGreaterThan(before);
  // The restore's own position names the generation its report carries;
  // later writes are in that generation.
  const saved = run(["snapshot", "create", "--reason", "position"]);
  const restored = run(["snapshot", "restore", saved.snapshot.id]);
  expect(restored.operation_position).toEqual({
    generation: restored.restore.generation,
    seq: committedMax(),
  });
  expect(restored.restore.generation).not.toBe("initial");
  expect(run(["add", "After"]).operation_position).toEqual({
    generation: restored.restore.generation,
    seq: committedMax(),
  });
});

it("publishes operation_position on exactly the 23 committing commands' schemas", () => {
  const listed = run(["schema", "--list"]).commands as string[];
  expect(committingCommands.size).toBe(23);
  const carries = (name: string) =>
    JSON.stringify(run(["schema", name])).includes('"operation_position"');
  expect(listed.filter(carries).sort()).toEqual([...committingCommands].sort());
  const schema = run(["schema", "add"]);
  expect(schema.properties.operation_position).toMatchObject({
    type: "object",
    required: ["generation", "seq"],
    properties: {
      generation: { type: "string" },
      seq: { type: "integer", minimum: 1 },
    },
  });
});
