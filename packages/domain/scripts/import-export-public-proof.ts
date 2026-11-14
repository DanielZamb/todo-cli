import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { GraphReport } from "../src/graph-contract.ts";
import { ImportReport } from "../src/import.ts";
import { ExportResponse, TaskResponse } from "../src/presentation.ts";

export async function proveImportExportPublic(input: {
  readonly cli: string;
  readonly env: NodeJS.ProcessEnv;
  readonly scratch: string;
  readonly evidence: string;
  readonly run: (
    args: readonly string[],
    expected?: number,
    input?: string,
  ) => Readonly<Record<string, Schema.Json>>;
  readonly http: (
    method: string,
    route: string,
    payload?: unknown,
    expected?: number,
  ) => Promise<unknown>;
  readonly state: () => unknown;
}) {
  const { cli, env, scratch, evidence, run, http, state } = input;
  const items = Schema.decodeUnknownSync(Schema.Array(Schema.Json))(
    JSON.parse(
      readFileSync(
        "packages/domain/test/fixtures/import/dependencies-forward.json",
        "utf8",
      ),
    ),
  );
  const file = join(scratch, "dependencies.json");
  writeFileSync(file, JSON.stringify(items));
  const before = state();
  const preview = Schema.decodeUnknownSync(ImportReport)(
    run(["import", file, "--dry-run"]),
  );
  assert.equal(preview.totals.created, 4);
  assert.deepEqual(state(), before);
  const httpPreview = Schema.decodeUnknownSync(ImportReport)(
    await http("POST", "/profiles/default/import", { items, dry_run: true }),
  );
  assert.equal(httpPreview.totals.created, 4);
  assert.deepEqual(state(), before);
  const applied = Schema.decodeUnknownSync(ImportReport)(
    await http("POST", "/profiles/default/import", { items }),
  );
  assert.deepEqual(applied.totals, {
    created: 4,
    updated: 0,
    unchanged: 0,
    rejected: 0,
  });
  assert.deepEqual(
    applied.items.map((row) => row.external_id),
    ["goal", "right", "source", "left"],
  );
  const id = (external: string) => {
    const value = applied.items.find(
      (row) => row.external_id === external,
    )?.task_id;
    assert.ok(value);
    return value;
  };
  const graph = Schema.decodeUnknownSync(GraphReport)(
    run(["graph", id("goal")]),
  );
  assert.equal(graph.edges.length, 4);
  assert.deepEqual(
    graph.nodes.map((node) => node.task.row_version),
    [1, 1, 1, 1],
  );
  assert.equal(
    graph.nodes.find((node) => node.task.id === id("goal"))?.remaining_energy
      .energy,
    10,
  );
  const repeated = Schema.decodeUnknownSync(ImportReport)(
    run(["import", file]),
  );
  assert.equal(repeated.totals.unchanged, 4);
  const blockedItems = [
    {
      external_id: "goal",
      title: "Must roll back",
      status: "done",
      depends_on: ["source"],
    },
  ];
  writeFileSync(file, JSON.stringify(blockedItems));
  const blocked = Schema.decodeUnknownSync(ImportReport)(
    run(["import", file], 2),
  );
  const details = blocked.items[0]?.error?.details;
  assert.equal(details?.current_version, 1);
  assert.equal(details?.dependency_error?.code, "blocked");
  if (details?.dependency_error?.code !== "blocked")
    throw Error("Missing typed blocked witness");
  assert.equal(details.dependency_error.details.task_id, id("goal"));
  assert.equal(details.dependency_error.details.blockers.length, 1);
  assert.equal(details.dependency_error.details.blockers[0]?.id, id("source"));
  const httpBlocked = Schema.decodeUnknownSync(ImportReport)(
    await http("POST", "/profiles/default/import", { items: blockedItems }),
  );
  assert.equal(httpBlocked.items[0]?.error?.details?.current_version, 1);
  assert.deepEqual(
    httpBlocked.items[0]?.error?.details?.dependency_error?.details,
    details.dependency_error.details,
  );
  assert.equal(
    httpBlocked.items[0]?.error?.code,
    details.dependency_error.code,
  );
  assert.equal(
    httpBlocked.items[0]?.error?.message,
    details.dependency_error.message,
  );
  assert.equal(
    Schema.decodeUnknownSync(TaskResponse)(run(["show", id("goal")])).task
      .title,
    "Goal",
  );
  const missing = Schema.decodeUnknownSync(ImportReport)(
    await http("POST", "/profiles/default/import", {
      items: [
        {
          external_id: "missing-public",
          title: "Missing",
          depends_on: ["absent-public"],
        },
      ],
      close_missing: true,
    }),
  );
  assert.equal(missing.totals.rejected, 1);
  assert.equal(
    Schema.decodeUnknownSync(TaskResponse)(run(["show", id("source")])).task
      .status,
    "open",
  );
  const unlinked = Schema.decodeUnknownSync(TaskResponse)(
    run(["add", "Failed adoption target"]),
  ).task;
  const adoption = Schema.decodeUnknownSync(ImportReport)(
    await http("POST", "/profiles/default/import", {
      items: [
        {
          external_id: "adoption-dependent",
          title: "Must not link",
          depends_on: ["adoption-target"],
        },
        {
          external_id: "adoption-target",
          task_id: unlinked.id,
          from_version: 999,
        },
      ],
    }),
  );
  assert.deepEqual(
    adoption.items.map((row) => row.outcome),
    ["rejected", "rejected"],
  );
  const adopted = Schema.decodeUnknownSync(ImportReport)(
    await http("POST", "/profiles/default/import", {
      items: [
        {
          external_id: "adoption-dependent",
          title: "Successfully mapped",
          depends_on: ["adoption-target"],
        },
        {
          external_id: "adoption-target",
          task_id: unlinked.id,
          from_version: 1,
        },
      ],
    }),
  );
  assert.deepEqual(
    adopted.items.map((row) => row.outcome),
    ["created", "updated"],
  );
  assert.equal(adopted.items[1]?.task_id, unlinked.id);
  const adoptedDependent = adopted.items[0]?.task_id;
  assert.ok(adoptedDependent);
  assert.deepEqual(
    Schema.decodeUnknownSync(GraphReport)(
      run(["graph", adoptedDependent]),
    ).edges.map((edge) => [edge.dependent_id, edge.blocker_id]),
    [[adoptedDependent, unlinked.id]],
  );
  const cycle = Schema.decodeUnknownSync(ImportReport)(
    await http("POST", "/profiles/default/import", {
      items: [
        {
          external_id: "public-cycle-a",
          title: "Cycle A",
          depends_on: ["public-cycle-b"],
        },
        {
          external_id: "public-cycle-b",
          title: "Cycle B",
          depends_on: ["public-cycle-a"],
        },
        { external_id: "public-independent", title: "Independent" },
      ],
    }),
  );
  assert.deepEqual(
    cycle.items.map((row) => [row.outcome, row.error?.code ?? null]),
    [
      ["rejected", "dependency_cycle"],
      ["rejected", "dependency_cycle"],
      ["created", null],
    ],
  );
  const exported = Schema.decodeUnknownSync(ExportResponse)(run(["export"]));
  const goal = exported.tasks?.find((task) => task.id === id("goal"));
  assert.ok(goal);
  assert.deepEqual(
    [...(goal.depends_on ?? [])].sort(),
    [id("left"), id("right")].sort(),
  );
  assert.equal(
    exported.tasks?.find((task) => task.id === id("source"))?.depends_on,
    undefined,
  );
  const rawExport = run(["export"]);
  assert.equal(
    /"(?:blocks|ready|blocked|remaining_energy|search_matches)":/.test(
      JSON.stringify(rawExport),
    ),
    false,
  );
  const markdown = Bun.spawnSync([cli, "export", "--format", "md"], { env });
  assert.equal(markdown.exitCode, 0, markdown.stderr.toString());
  assert.match(markdown.stdout.toString(), /Depends on:/);
  const vault = join(scratch, "vault");
  mkdirSync(vault);
  const note = join(vault, "Tasks.md");
  writeFileSync(
    note,
    "Before\n<!-- todo-cli:begin -->\nold managed text\n<!-- todo-cli:end -->\nAfter\n",
  );
  run(["sync", "obsidian", "--vault", vault, "--file", "Tasks.md"]);
  const projected = readFileSync(note, "utf8");
  assert.match(projected, /^Before\n/);
  assert.match(projected, /\nAfter\n$/);
  assert.equal(projected.includes("old managed text"), false);
  assert.ok(projected.includes(`^task-${id("goal")}`));
  assert.ok(projected.includes(`[[#^task-${id("left")}|Left]]`));
  assert.match(projected, /```mermaid\nflowchart TD\n/);
  const closed = Schema.decodeUnknownSync(ImportReport)(
    await http("POST", "/profiles/default/import", {
      items: [{ external_id: "goal" }],
      close_missing: true,
    }),
  );
  assert.equal(closed.totals.rejected, 0);
  assert.equal(
    Schema.decodeUnknownSync(TaskResponse)(run(["show", id("source")])).task
      .status,
    "cancelled",
  );
  writeFileSync(
    join(evidence, "import-export.json"),
    JSON.stringify(
      {
        passed: true,
        preview,
        applied,
        blocked,
        adoption,
        adopted,
        closed,
        cycle,
        exported,
        markdown_exit: markdown.exitCode,
        obsidian: projected,
      },
      null,
      2,
    ),
  );
}
