import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";

const scratch = mkdtempSync(join(tmpdir(), "todo-cli02-test-"));
const binary = process.env.TODO_CLI_BINARY ?? join(scratch, "todo");
const actions: unknown[] = [];
const run = (args: string[], code = 0) => {
  const result = spawnSync(
    binary,
    ["--profile", "work", "--format", "json", ...args],
    {
      env: {
        ...process.env,
        HOME: scratch,
        TODO_DB: join(scratch, "scratch.db"),
      },
      encoding: "utf8",
      input: "scratch verification passphrase\n",
      timeout: 60000,
    },
  );
  actions.push({
    args,
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  expect(result.status, result.stdout + result.stderr).toBe(code);
  const value = JSON.parse(result.stdout);
  expect(typeof value.generated_at).toBe("string");
  return value;
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
afterAll(() => {
  if (process.env.TODO_CLI_EVIDENCE) {
    mkdirSync(process.env.TODO_CLI_EVIDENCE, { recursive: true });
    writeFileSync(
      join(process.env.TODO_CLI_EVIDENCE, "batch-edit-actions.json"),
      JSON.stringify(actions, null, 2),
    );
  }
  rmSync(scratch, { recursive: true, force: true });
});
it("compiled batch edit keeps previews read-only and reports partial Conflicts with reload recovery", () => {
  run(["init", "--password-stdin"]);
  run(["login", "--password-stdin"]);
  const first = run(["add", "First"]).task;
  const second = run(["add", "Second"]).task;
  const untouched = run(["add", "Untouched"]).task;
  const file = join(scratch, "changes.json");
  const items = [first, second].map((task) => ({
    task_id: task.id,
    from_version: 1,
  }));
  writeFileSync(file, JSON.stringify({ items, changes: { priority: "P1" } }));
  const history = run(["history", first.id]).entries;
  expect(
    run(["batch-edit", file, "--dry-run"]).items.map(
      (row: { outcome: string; current_version: number }) => [
        row.outcome,
        row.current_version,
      ],
    ),
  ).toEqual([
    ["updated", 1],
    ["updated", 1],
  ]);
  expect(run(["history", first.id]).entries).toEqual(history);
  expect(run(["show", first.id]).task.row_version).toBe(1);
  run([
    "edit",
    second.id,
    "--expected-version",
    "1",
    "--title",
    "Competing edit",
  ]);
  const applied = run(["batch-edit", file], 4);
  expect(applied.totals).toEqual({ updated: 1, rejected: 1 });
  expect(
    applied.items.map(
      (row: {
        outcome: string;
        current_version: number;
        error?: { code: string };
      }) => [row.outcome, row.current_version, row.error?.code ?? null],
    ),
  ).toEqual([
    ["updated", 2, null],
    ["rejected", 2, "occ_conflict"],
  ]);
  expect(applied.items[1].error.details).toEqual({ current_version: 2 });
  expect(typeof applied.items[1].error.generated_at).toBe("string");
  const staleHistory = run(["history", second.id]).entries;
  expect(run(["batch-edit", file, "--dry-run"], 4).totals).toEqual({
    updated: 0,
    rejected: 2,
  });
  expect(run(["history", second.id]).entries).toEqual(staleHistory);
  expect(run(["show", first.id]).task.priority).toBe("P1");
  expect(run(["show", second.id]).task.priority).toBe("P3");
  expect(run(["show", second.id]).task.title).toBe("Competing edit");
  expect(run(["show", untouched.id]).task.row_version).toBe(1);
  writeFileSync(
    file,
    JSON.stringify({
      items: [{ task_id: second.id, from_version: 2 }],
      changes: { priority: "P1" },
    }),
  );
  expect(run(["batch-edit", file, "--dry-run"]).totals).toEqual({
    updated: 1,
    rejected: 0,
  });
  expect(run(["batch-edit", file]).totals).toEqual({ updated: 1, rejected: 0 });
  expect(run(["show", second.id]).task.row_version).toBe(3);
  writeFileSync(
    file,
    JSON.stringify({
      items: [{ task_id: "missing", from_version: 1 }],
      changes: { description: null },
    }),
  );
  expect(run(["batch-edit", file], 3).items[0].error.code).toBe("not_found");
  for (const changes of [
    {},
    { priority: "P1", title: "Two fields" },
    { priority: "bad" },
    { unknown: "value" },
  ]) {
    writeFileSync(file, JSON.stringify({ items, changes }));
    expect(run(["batch-edit", file], 2).code).toBe("invalid_args");
  }
  writeFileSync(
    file,
    JSON.stringify({
      items: [items[0], items[0]],
      changes: { priority: "P1" },
    }),
  );
  expect(run(["batch-edit", file], 2).code).toBe("invalid_args");
  expect(run(["schema", "batch-edit"]).type).toBe("object");
  expect(
    run(["schema", "batch-edit-input"]).properties.changes.minProperties,
  ).toBe(1);
});
