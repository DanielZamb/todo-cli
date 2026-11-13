import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { EdgeReport } from "../src/dependency-contract.ts";
import { GraphReport } from "../src/graph-contract.ts";
import { ImportReport } from "../src/import.ts";
import { TaskResponse, TasksResponse } from "../src/presentation.ts";

export async function proveGraphPublic(input: {
  readonly path: string;
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
}) {
  const { run, http, evidence } = input;
  const add = (title: string) =>
    Schema.decodeUnknownSync(TaskResponse)(run(["add", title])).task;
  const completionBlocker = add("Completion Revert blocker");
  const completionDependent = Schema.decodeUnknownSync(TaskResponse)(
    run([
      "add",
      "Completion Revert dependent",
      "--depends-on",
      completionBlocker.id,
    ]),
  ).task;
  assert.equal(
    run(
      ["done", completionDependent.id, "--expected-version", "1", "--force"],
      2,
    ).code,
    "invalid_args",
  );
  assert.equal(
    run(["done", completionDependent.id, "--expected-version", "1"], 2).code,
    "blocked",
  );
  run(["done", completionBlocker.id, "--expected-version", "1"]);
  run(["done", completionDependent.id, "--expected-version", "1"]);
  const completionHistory = Schema.decodeUnknownSync(
    Schema.Struct({
      entries: Schema.Array(
        Schema.Struct({
          seq: Schema.Int,
          event: Schema.Struct({ kind: Schema.String }),
        }),
      ),
    }),
  )(run(["history", completionBlocker.id]));
  const completionSeq = completionHistory.entries.find(
    (entry) => entry.event.kind === "TaskCompleted",
  )?.seq;
  assert.ok(completionSeq);
  const refusedInverse = run(
    ["revert", String(completionSeq), "--expected-version", "2"],
    2,
  );
  assert.equal(refusedInverse.code, "blocks_done_task");
  assert.match(
    String(refusedInverse.message),
    new RegExp(`--depends-on ${completionDependent.id}`),
  );
  const httpInverse = Schema.decodeUnknownSync(
    Schema.Struct({ code: Schema.String, details: Schema.Json }),
  )(
    await http(
      "POST",
      `/profiles/default/tasks/${completionBlocker.id}/revert`,
      { seq: completionSeq, from_version: 2 },
      422,
    ),
  );
  assert.equal(httpInverse.code, "blocks_done_task");
  assert.deepEqual(httpInverse.details, refusedInverse.details);
  const freshBlocker = add("Unresolved blocker for done Task");
  assert.equal(
    run(
      [
        "depend",
        completionDependent.id,
        "--on",
        freshBlocker.id,
        "--expected-version",
        "2",
      ],
      2,
    ).code,
    "blocked",
  );
  const target = add("Empty preview target");
  const dependent = add("Empty preview dependent");
  run(["depend", dependent.id, "--on", target.id, "--expected-version", "1"]);
  const preview = run([
    "rm",
    target.id,
    "--expected-version",
    "1",
    "--dry-run",
  ]);
  run([
    "undepend",
    dependent.id,
    "--from",
    target.id,
    "--expected-version",
    "2",
  ]);
  const emptyChanged = run(
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
  );
  assert.equal(emptyChanged.code, "has_dependencies");
  assert.deepEqual(emptyChanged.details, {
    task_id: target.id,
    dependencies: [],
    flag: "--with-dependencies",
  });
  assert.match(
    String(emptyChanged.message),
    /preview changed.*Preview.*again.*confirm/s,
  );
  const fresh = run(["rm", target.id, "--expected-version", "1", "--dry-run"]);
  run([
    "rm",
    target.id,
    "--expected-version",
    "1",
    "--with-dependencies",
    "--dependency-fingerprint",
    String(fresh.dependency_fingerprint),
  ]);
  run(
    ["login", "--profile", "other", "--password-stdin"],
    0,
    "public Dependency proof\n",
  );
  const foreign = Schema.decodeUnknownSync(TaskResponse)(
    run([
      "add",
      "Foreign blocker",
      "--profile",
      "other",
      "--external-id",
      "foreign-import",
    ]),
  ).task;
  assert.equal(
    run(
      ["depend", dependent.id, "--on", foreign.id, "--expected-version", "3"],
      2,
    ).code,
    "dependency_profile_mismatch",
  );
  const foreignImport = Schema.decodeUnknownSync(ImportReport)(
    await http("POST", "/profiles/default/import", {
      items: [
        {
          external_id: "cross-profile-import",
          title: "Must not exist",
          depends_on: ["foreign-import"],
        },
      ],
    }),
  );
  assert.equal(foreignImport.items[0]?.outcome, "rejected");
  assert.equal(
    JSON.stringify(foreignImport).includes("Foreign blocker"),
    false,
  );
  const failedBatch = add("Batch rollback target");
  const nextBatch = add("Batch surviving target");
  const audit = new Database(input.path);
  try {
    audit.exec(
      "CREATE TRIGGER proof_batch_rollback BEFORE INSERT ON task_dependencies WHEN NEW.dependent_id IN (SELECT id FROM tasks WHERE json_extract(payload,'$.title')='Batch rollback target') BEGIN SELECT RAISE(ABORT,'proof batch write failure'); END;",
    );
    const file = join(evidence, "batch-runtime-input.json");
    writeFileSync(
      file,
      JSON.stringify({
        items: [failedBatch, nextBatch].map((task) => ({
          action: "depend",
          dependent_id: task.id,
          blocker_id: dependent.id,
          from_version: 1,
        })),
      }),
    );
    const result = run(["batch-depend", "--file", file], 1);
    const rows = Schema.decodeUnknownSync(
      Schema.Struct({ results: Schema.Array(Schema.Json) }),
    )(result).results;
    assert.equal(
      Schema.decodeUnknownSync(
        Schema.Struct({
          error: Schema.Struct({ code: Schema.String }),
          exit_code: Schema.Int,
        }),
      )(rows[0]).error.code,
      "runtime",
    );
    assert.equal(
      Schema.decodeUnknownSync(
        Schema.Struct({ result: Schema.Struct({ outcome: Schema.String }) }),
      )(rows[1]).result.outcome,
      "added",
    );
    assert.equal(
      Schema.decodeUnknownSync(TaskResponse)(run(["show", failedBatch.id])).task
        .row_version,
      1,
    );
    assert.equal(
      Schema.decodeUnknownSync(TaskResponse)(run(["show", nextBatch.id])).task
        .row_version,
      2,
    );
  } finally {
    audit.exec("DROP TRIGGER proof_batch_rollback");
    audit.close();
  }
  const largeBlocker = Schema.decodeUnknownSync(TaskResponse)(
    run(["add", "Large witness blocker", "--desc", "x".repeat(40000)]),
  ).task;
  const largeDependent = Schema.decodeUnknownSync(TaskResponse)(
    run(["add", "Large witness dependent", "--depends-on", largeBlocker.id]),
  ).task;
  const fullFailure = run(
    ["done", largeDependent.id, "--expected-version", "1"],
    2,
  );
  const fullBlockers = Schema.decodeUnknownSync(
    Schema.Struct({
      blockers: Schema.Array(Schema.Struct({ description: Schema.String })),
    }),
  )(fullFailure.details).blockers;
  assert.equal(fullBlockers[0]?.description.length, 40000);
  const history = new Database(input.path, { readonly: true });
  let rejectionSeq: number;
  try {
    const row = Schema.decodeUnknownSync(
      Schema.Struct({ seq: Schema.Int, event: Schema.String }),
    )(
      history
        .query(
          "SELECT seq,event FROM op_log WHERE reason='blocked' ORDER BY seq DESC LIMIT 1",
        )
        .get(),
    );
    rejectionSeq = row.seq;
    const event = Schema.decodeUnknownSync(
      Schema.Struct({
        details: Schema.Struct({
          witness: Schema.Null,
          truncated: Schema.Boolean,
          total: Schema.Int,
        }),
      }),
    )(JSON.parse(row.event));
    assert.equal(event.details.truncated, true);
    assert.ok(event.details.total > 40000);
    assert.ok(row.event.length < 32768);
  } finally {
    history.close();
  }
  run([
    "rm",
    largeDependent.id,
    "--expected-version",
    "1",
    "--with-dependencies",
  ]);
  run(["rm", largeDependent.id, "--expected-version", "2", "--force"]);
  const redacted = new Database(input.path, { readonly: true });
  try {
    const row = Schema.decodeUnknownSync(
      Schema.Struct({ event: Schema.String }),
    )(redacted.query("SELECT event FROM op_log WHERE seq=?").get(rejectionSeq));
    assert.equal(
      Schema.decodeUnknownSync(Schema.Struct({ kind: Schema.String }))(
        JSON.parse(row.event),
      ).kind,
      "TaskHistoryRedacted",
    );
    assert.equal(row.event.includes("Large witness"), false);
  } finally {
    redacted.close();
  }
  const items = [
    {
      external_id: "rank-source",
      title: "Rank source",
      priority: "P4",
      energy: 1,
    },
    {
      external_id: "rank-terminal",
      title: "Rank terminal",
      priority: "P1",
      energy: 2,
      depends_on: ["rank-source"],
    },
    {
      external_id: "rank-goal",
      title: "Rank goal",
      priority: "P2",
      energy: 3,
      depends_on: ["rank-terminal"],
    },
    { external_id: "shape-a", title: "Shape A" },
    { external_id: "shape-b", title: "Shape B" },
    {
      external_id: "shape-c",
      title: "Shape C",
      depends_on: ["shape-a", "shape-b"],
    },
    { external_id: "order-a", title: "Order A", priority: "P1", energy: 4 },
    { external_id: "order-b", title: "Order B", priority: "P2", energy: 1 },
    { external_id: "order-u", title: "Order unknown", priority: "P3" },
    {
      external_id: "order-root",
      title: "Order root",
      priority: "P4",
      energy: 2,
      depends_on: ["order-a", "order-b", "order-u"],
    },
    {
      external_id: "order-c",
      title: "Order C",
      priority: "P1",
      energy: 4,
      depends_on: ["order-root"],
    },
    {
      external_id: "order-d",
      title: "Order D",
      priority: "P2",
      energy: 1,
      depends_on: ["order-root"],
    },
    ...Array.from({ length: 105 }, (_, index) => ({
      external_id: `long-${index}`,
      title: `Long ${index}`,
      ...(index ? { depends_on: [`long-${index - 1}`] } : {}),
    })),
  ];
  const imported = Schema.decodeUnknownSync(ImportReport)(
    await http("POST", "/profiles/default/import", { items }),
  );
  assert.equal(imported.totals.created, 117);
  const id = (external: string) => {
    const value = imported.items.find(
      (row) => row.external_id === external,
    )?.task_id;
    assert.ok(value);
    return value;
  };
  const orderCli = run(["graph", id("order-root")]);
  const orderHttp = await http(
    "GET",
    `/profiles/default/tasks/${id("order-root")}/graph`,
  );
  for (const raw of [orderCli, orderHttp]) {
    const report = Schema.decodeUnknownSync(GraphReport)(raw);
    assert.deepEqual(
      report.topological_order,
      ["order-a", "order-b", "order-u", "order-root", "order-c", "order-d"].map(
        id,
      ),
    );
    assert.deepEqual(
      report.ancestors,
      ["order-a", "order-b", "order-u"].map(id),
    );
    assert.deepEqual(report.descendants, ["order-c", "order-d"].map(id));
    assert.deepEqual(
      report.lightest_next,
      ["order-b", "order-a", "order-u"].map(id),
    );
    const wire = Schema.decodeUnknownSync(
      Schema.Struct({
        nodes: Schema.Array(Schema.Record(Schema.String, Schema.Json)),
      }),
    )(raw);
    for (const node of wire.nodes)
      assert.deepEqual(Object.keys(node).sort(), [
        "blocked",
        "depth",
        "in_degree",
        "mermaid_id",
        "out_degree",
        "ready",
        "remaining_energy",
        "task",
      ]);
  }
  run(["cancel", id("rank-terminal"), "--expected-version", "1"]);
  const graph = Schema.decodeUnknownSync(GraphReport)(
    await http("GET", `/profiles/default/tasks/${id("rank-goal")}/graph`),
  );
  const terminal = graph.nodes.find(
    (node) => node.task.id === id("rank-terminal"),
  );
  assert.equal(terminal?.ready, false);
  assert.equal(terminal?.blocked, false);
  assert.deepEqual(
    Schema.decodeUnknownSync(GraphReport)(run(["graph", id("rank-terminal")]))
      .lightest_next,
    [],
  );
  const goal = graph.nodes.find((node) => node.task.id === id("rank-goal"));
  assert.deepEqual(goal?.remaining_energy, { energy: 3, unweighted: 0 });
  assert.deepEqual(graph.lightest_next, [id("rank-goal")]);
  for (const order of ["topo", "lightest"]) {
    const rows = Schema.decodeUnknownSync(TasksResponse)(
      run(["list", "--text", "Rank", "--order", order]),
    ).tasks;
    assert.deepEqual(
      rows?.map((task) => task.id),
      [id("rank-source"), id("rank-terminal"), id("rank-goal")],
    );
    const filtered = Schema.decodeUnknownSync(TasksResponse)(
      run([
        "list",
        "--text",
        "Rank",
        "--status",
        "cancelled",
        "--order",
        order,
      ]),
    ).tasks;
    assert.deepEqual(
      filtered?.map((task) => task.id),
      [id("rank-terminal")],
    );
    const open = Schema.decodeUnknownSync(TasksResponse)(
      run(["list", "--text", "Rank", "--status", "open", "--order", order]),
    ).tasks;
    assert.deepEqual(
      open?.map((task) => task.id),
      [id("rank-source"), id("rank-goal")],
    );
  }
  const shape = Schema.decodeUnknownSync(GraphReport)(
    run(["graph", id("shape-c")]),
  );
  assert.equal(shape.shape, "tree");
  if (shape.shape === "tree") assert.equal(shape.orientation, "converging");
  const cycle = run(
    ["depend", id("long-0"), "--on", id("long-104"), "--expected-version", "1"],
    2,
  );
  assert.equal(cycle.code, "dependency_cycle");
  const details = Schema.decodeUnknownSync(
    Schema.Struct({ path: Schema.Array(Schema.String) }),
  )(cycle.details);
  const chain = Array.from({ length: 105 }, (_, index) => id(`long-${index}`));
  const smallest = [...chain].sort()[0];
  assert.ok(smallest);
  const pivot = chain.indexOf(smallest);
  assert.deepEqual(details.path, [
    ...chain.slice(pivot),
    ...chain.slice(0, pivot),
    smallest,
  ]);
  const httpCycle = await http(
    "POST",
    `/profiles/default/tasks/${id("long-0")}/dependencies`,
    { blocker_id: id("long-104"), from_version: 1 },
    422,
  );
  assert.deepEqual(
    Schema.decodeUnknownSync(
      Schema.Struct({
        details: Schema.Struct({ path: Schema.Array(Schema.String) }),
      }),
    )(httpCycle).details.path,
    details.path,
  );
  const removed = Schema.decodeUnknownSync(EdgeReport)(
    run([
      "undepend",
      id("long-104"),
      "--from",
      id("long-103"),
      "--expected-version",
      "1",
    ]),
  );
  assert.equal(
    run(
      [
        "undepend",
        id("long-103"),
        "--from",
        id("long-102"),
        "--expected-version",
        "999",
      ],
      4,
    ).code,
    "occ_conflict",
  );
  await http("POST", `/profiles/default/tasks/${id("long-104")}/revert`, {
    seq: removed.seq,
    from_version: 2,
  });
  writeFileSync(
    join(evidence, "graph-public.json"),
    JSON.stringify(
      {
        passed: true,
        empty_changed: emptyChanged,
        order_cli: orderCli,
        order_http: orderHttp,
        terminal,
        goal,
        shape,
        cycle,
        http_cycle: httpCycle,
      },
      null,
      2,
    ),
  );
}
