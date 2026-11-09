import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Exit, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import {
  Edge,
  Event,
  GraphReport,
  ProfileId,
  Task,
  TaskId,
} from "../packages/domain/src/index.ts";
import { ActorId } from "../packages/domain/src/ids.ts";
import { queryGraph, readGraph } from "../packages/domain/src/graph-queries.ts";
import { openStore } from "../packages/domain/src/store/store.ts";
import {
  at,
  task as fixtureTask,
} from "../packages/domain/scripts/dag-proof.ts";
import { taskHttpClient } from "../apps/electron/src/http-client.ts";
import { TaskResponse } from "../packages/domain/src/presentation.ts";
import {
  assertRootOnlyResponse,
  assertRootSetOrder,
  rootResponsePlan,
  rootSetOrderRows,
  rootResponseRows,
} from "./root-response-fixture.mjs";
import { graphSchemaProperties } from "./contract-properties.mjs";
const [cliInput, serverInput, evidenceInput, mode = "all", beforeCli] =
  process.argv.slice(2);
assert.ok(cliInput && serverInput && evidenceInput);
const cli = cliInput,
  serverBinary = serverInput,
  evidence = evidenceInput;
const profile = Schema.decodeUnknownSync(ProfileId)("default");
const task = (value: string, fields: Partial<Task> = {}) =>
  fixtureTask(value, { profile_id: profile, ...fields });
const edge = (dependent: Task, blocker: Task) =>
  Schema.decodeUnknownSync(Edge)({
    profile_id: profile,
    dependent_id: dependent.id,
    blocker_id: blocker.id,
  });
const digest = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const nodeKeys = rootResponsePlan.allowedNodeKeys;
let property = "setup",
  server: ReturnType<typeof Bun.spawn> | undefined,
  proxy: ReturnType<typeof Bun.serve> | undefined;
let directory: string | undefined,
  serverLog = "",
  logs: Promise<unknown> | undefined;
const receipts: unknown[] = [],
  observations: unknown[] = [];
let activeInput: unknown = null;
const same = (name: string, actual: unknown, expected: unknown) => {
  property = name;
  assert.deepEqual(actual, expected, `BEHAVIORAL_FAILURE:${name}`);
};
function nodeFields(report: GraphReport, name: string) {
  property = name;
  for (const node of report.nodes)
    same(name, Object.keys(node).sort(), nodeKeys);
}
function identity(report: GraphReport, edges: readonly Edge[]) {
  property = "mermaid-typed-identity";
  const identities = new Map(
    report.nodes.map((node) => [node.mermaid_id, node.task.id]),
  );
  same(property, identities.size, report.nodes.length);
  for (const name of identities.keys()) assert.match(name, /^n[0-9]+$/);
  const arrows = [...report.mermaid.matchAll(/^  (n[0-9]+) --> (n[0-9]+)$/gm)]
    .map((match) => {
      const a = match[1],
        b = match[2];
      assert.ok(a && b);
      const blocker = identities.get(a),
        dependent = identities.get(b);
      assert.ok(blocker && dependent);
      return [blocker, dependent].join(" -> ");
    })
    .sort();
  same(
    property,
    arrows,
    edges
      .map((edge) => [edge.blocker_id, edge.dependent_id].join(" -> "))
      .sort(),
  );
}
function direct(graph: { tasks: Task[]; edges: Edge[] }, root: Task) {
  activeInput = {
    root: root.id,
    tasks: graph.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      energy: task.energy,
      priority: task.priority,
    })),
    edges: graph.edges,
  };
  process.env.DAG_F_REACHABILITY_CALLS = "0";
  const report = queryGraph(graph, root.id, at);
  assert.ok(report);
  if (mode === "counts")
    same(
      "root-work-discipline",
      Number(process.env.DAG_F_REACHABILITY_CALLS),
      3,
    );
  nodeFields(report, "root-direct-node-fields");
  identity(report, graph.edges);
  const encoded = Schema.encodeSync(GraphReport)(report);
  same(
    "root-encoded-node-fields",
    encoded.nodes.map((node) => Object.keys(node).sort()),
    report.nodes.map(() => nodeKeys),
  );
  return { report, encoded };
}
function literals() {
  const a = task("f-root-first", { priority: "P1", energy: 4 }),
    b = task("f-root-second", { priority: "P2", energy: 1 }),
    unknown = task("f-root-unknown", { priority: "P3", energy: null }),
    root = task("f-root-goal", { priority: "P4", energy: 3 }),
    x = task("f-root-x", { priority: "P1", energy: 4 }),
    y = task("f-root-y", { priority: "P2", energy: 1 });
  const graph = {
    tasks: [a, b, unknown, root, x, y],
    edges: [
      edge(root, a),
      edge(root, b),
      edge(root, unknown),
      edge(x, root),
      edge(y, root),
      edge(x, a),
    ],
  };
  const { report, encoded } = direct(graph, root);
  same("root-ancestor-order", report.ancestors, [a.id, b.id, unknown.id]);
  same("root-descendant-order", report.descendants, [x.id, y.id]);
  same("root-next-order", report.lightest_next, [b.id, a.id, unknown.id]);
  same(
    "root-encoded-sets",
    [encoded.ancestors, encoded.descendants, encoded.lightest_next],
    [
      [a.id, b.id, unknown.id],
      [x.id, y.id],
      [b.id, a.id, unknown.id],
    ],
  );
  const fork = direct(
    { tasks: [a, b, unknown, root], edges: graph.edges.slice(0, 3) },
    root,
  );
  property = "root-next-order";
  assertRootSetOrder(fork.report, [a.id, b.id, unknown.id, root.id]);
  const tieFirst = task("f-tie-z", { energy: 2, priority: "P1" }),
    tieSecond = task("f-tie-a", { energy: 2, priority: "P4" }),
    tieRoot = task("f-tie-root", { energy: 3 });
  const tie = direct(
    {
      tasks: [tieFirst, tieSecond, tieRoot],
      edges: [edge(tieRoot, tieFirst), edge(tieRoot, tieSecond)],
    },
    tieRoot,
  );
  same("root-next-order", tie.report.lightest_next, [
    tieFirst.id,
    tieSecond.id,
  ]);
  const ready = task("f-ready-root", { energy: 2 });
  const one = direct({ tasks: [ready], edges: [] }, ready);
  same("root-next-membership", one.report.lightest_next, [ready.id]);
  for (const status of ["done", "cancelled"] satisfies Task["status"][]) {
    const terminal = task("f-terminal-root", {
      status,
      completed_at: status === "done" ? at : null,
    });
    const result = direct({ tasks: [terminal], edges: [] }, terminal);
    same("root-next-membership", result.report.lightest_next, []);
  }
  writeFileSync(
    join(evidence, "root-literals.json"),
    JSON.stringify(
      {
        report,
        encoded,
        status: "pass",
        rule: "ancestors/descendants topo; next own energy, unknown last, topo ties",
      },
      null,
      2,
    ),
  );
}
function invoke(
  binary: string,
  args: readonly string[],
  env: Record<string, string | undefined>,
  expected = 0,
  input = "",
) {
  const result = Bun.spawnSync([binary, ...args], {
    env,
    stdin: new TextEncoder().encode(input),
    timeout: 120000,
  });
  receipts.push({
    property,
    binary,
    args,
    exitCode: result.exitCode,
    stdoutBytes: result.stdout.byteLength,
    stderr: result.stderr.toString(),
  });
  assert.equal(
    result.exitCode,
    expected,
    `BEHAVIORAL_FAILURE:${property}: ${result.stderr}`,
  );
  return result.stdout;
}
try {
  property = "contract-node-fields";
  graphSchemaProperties(Schema.toJsonSchemaDocument(GraphReport).schema);
  if (mode === "counts") process.env.DAG_F_COUNT_REACHABILITY = "1";
  literals();
  if (mode === "counts") {
    const tasks = Array.from({ length: 1000 }, (_, index) =>
      task(`f-count-${String(index).padStart(4, "0")}`, { energy: 1 }),
    );
    const root = tasks[500];
    assert.ok(root);
    const edges = tasks.flatMap((dependent, index) => {
      const blocker = tasks[index - 1];
      return blocker ? [edge(dependent, blocker)] : [];
    });
    const counted = direct({ tasks, edges }, root);
    property = "root-chain-counted";
    assertRootOnlyResponse(
      counted.report,
      tasks.map((task) => task.id),
    );
    writeFileSync(
      join(evidence, "closure-call-count.json"),
      JSON.stringify(
        {
          nodes: 1000,
          rootIndex: 500,
          reachableCalls: Number(process.env.DAG_F_REACHABILITY_CALLS),
          expected: 3,
          scope:
            "separate count-only instrumentation; no time-complexity inference",
        },
        null,
        2,
      ),
    );
  }
  if (mode === "all") {
    assert.ok(beforeCli);
    directory = mkdtempSync(join(evidence, "todo-dag-f-root-"));
    const path = join(directory, "scratch.db");
    const env = {
      ...process.env,
      HOME: directory,
      TODO_DB: path,
      TODO_ATTACHMENT_ROOT: join(directory, "attachments"),
    };
    invoke(
      cli,
      ["init", "--password-stdin", "--format", "json"],
      env,
      0,
      "F root response passphrase\n",
    );
    invoke(
      cli,
      ["login", "--password-stdin", "--format", "json"],
      env,
      0,
      "F root response passphrase\n",
    );
    const credential = Schema.decodeUnknownSync(
      Schema.Struct({ token: Schema.String }),
    )(
      JSON.parse(
        readFileSync(join(directory, ".todo-cli/session_default.json"), "utf8"),
      ),
    ).token;
    const chain = rootResponseRows().map((row) =>
      task(row.external_id, { title: row.title, energy: row.energy }),
    );
    const chainEdges = chain.flatMap((dependent, i) => {
      const blocker = chain[i - 1];
      return blocker ? [edge(dependent, blocker)] : [];
    });
    const root = chain[500];
    assert.ok(root);
    const forkRows = rootSetOrderRows();
    const forkTasks = forkRows.map((row) =>
      Schema.decodeUnknownSync(Task)({
        ...task(row.external_id),
        title: row.title,
        priority: row.priority ?? "P3",
        energy: row.energy ?? null,
      }),
    );
    const forkEdges = forkRows.flatMap((row) => {
      const dependent = forkTasks.find((task) => task.id === row.external_id);
      assert.ok(dependent);
      return (row.depends_on ?? []).map((blockerId) => {
        const blocker = forkTasks.find((task) => task.id === blockerId);
        assert.ok(blocker);
        return edge(dependent, blocker);
      });
    });
    const forkRoot = forkTasks[3];
    assert.ok(forkRoot);
    const fixtureText = readFileSync(
      "packages/domain/test/fixtures/dag/chain-1000.json",
      "utf8",
    );
    same(
      "review-chain-fixture-hash",
      digest(fixtureText),
      "9954c8d86f6e9abac1ac3fb46be0ea16a7043297e2815dff32533a4c5de93c8f",
    );
    const reviewed = Schema.decodeUnknownSync(
      Schema.Struct({
        profile_id: ProfileId,
        root_id: TaskId,
        tasks: Schema.Array(Task),
        edges: Schema.Array(Edge),
      }),
    )(JSON.parse(fixtureText));
    same(
      "review-chain-fixture-root",
      reviewed.root_id,
      "90d7ac86-4b7e-4eb6-abb0-f76343e124c2",
    );
    const store = await Effect.runPromise(openStore({ path }));
    try {
      for (const fixture of [
        { tasks: chain, edges: chainEdges },
        { tasks: forkTasks, edges: forkEdges },
        reviewed,
      ])
        for (const task of fixture.tasks) {
          const added = fixture.edges.filter(
            (edge) => edge.dependent_id === task.id,
          );
          const event = Schema.decodeUnknownSync(Event)({
            kind: "TaskCreated",
            entity_version: added.length ? 2 : 1,
            occurred_at: task.created_at,
            task,
            series: null,
            project: null,
            tags: [],
            ...(added.length
              ? { dependencies: { added, removed: [], versions: [] } }
              : {}),
          });
          const result = await Effect.runPromise(
            store.append({
              actor: Schema.decodeUnknownSync(ActorId)("f-root-proof"),
              profile,
              event,
            }),
          );
          same("root-store-input", result.outcome, "committed");
        }
      const report = await Effect.runPromise(
        readGraph(store, { credential, profile, task_id: root.id }, at),
      );
      assert.ok(report);
      property = "root-chain-direct";
      nodeFields(report, "root-direct-node-fields");
      assertRootOnlyResponse(
        report,
        chain.map((task) => task.id),
      );
      identity(report, chainEdges);
      writeFileSync(
        join(evidence, "root500-direct.json"),
        JSON.stringify(report),
      );
    } finally {
      await Effect.runPromise(store.close());
    }
    const launched = Bun.spawn([serverBinary], {
      env: { ...env, TODO_PORT: "0" },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    server = launched;
    writeFileSync(
      join(evidence, "server-started.json"),
      JSON.stringify({ pid: server.pid, serverBinary }),
    );
    const collect = async (stream: ReadableStream<Uint8Array>) => {
      for await (const bytes of stream)
        serverLog += new TextDecoder().decode(bytes);
    };
    logs = Promise.all([collect(launched.stdout), collect(launched.stderr)]);
    const deadline = Date.now() + 60000;
    while (!/Listening on http:\/\/127\.0\.0\.1:\d+/.test(serverLog)) {
      assert.ok(Date.now() < deadline, "Root server startup exceeded60s");
      await Bun.sleep(20);
    }
    const base = serverLog.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    assert.ok(base);
    const health = await fetch(base + "/health");
    same("build-identity", health.status, 200);
    same("build-identity", await health.json(), {
      service: "todo-server",
      build: process.env.DAG_F_PRODUCT_SHA?.slice(0, 8),
      contract: process.env.DAG_F_PRODUCT_CONTRACT,
    });
    const version = invoke(cli, ["--version"], env).toString();
    assert.ok(
      version.includes("build=" + process.env.DAG_F_PRODUCT_SHA?.slice(0, 8)),
    );
    assert.ok(
      version.includes("contract=" + process.env.DAG_F_PRODUCT_CONTRACT),
    );
    const forkBytes = invoke(
      cli,
      ["graph", forkRoot.id, "--format", "json"],
      env,
    );
    const publicFork = Schema.decodeUnknownSync(GraphReport)(
      JSON.parse(forkBytes.toString()),
    );
    property = "root-next-order";
    assertRootSetOrder(
      publicFork,
      forkTasks.map((task) => task.id),
    );
    identity(publicFork, forkEdges);
    const markdown = invoke(
      cli,
      ["graph", forkRoot.id, "--format", "md"],
      env,
    ).toString();
    same(
      "root-md-sets",
      markdown.includes("Ancestors: " + publicFork.ancestors.join(", ")),
      true,
    );
    same(
      "root-md-sets",
      markdown.includes("Ready next: " + publicFork.lightest_next.join(", ")),
      true,
    );
    same(
      "mermaid-public-wiring",
      invoke(
        cli,
        ["graph", forkRoot.id, "--format", "mermaid"],
        env,
      ).toString(),
      publicFork.mermaid,
    );
    property = "contract-node-fields";
    graphSchemaProperties(
      JSON.parse(
        invoke(cli, ["schema", "graph", "--format", "json"], env).toString(),
      ),
    );
    for (const [label, rootId, ids] of [
      ["root500", root.id, chain.map((task) => task.id)],
      [
        "review-root999",
        reviewed.root_id,
        reviewed.tasks.map((task) => task.id),
      ],
    ] satisfies [string, TaskId, TaskId[]][]) {
      property = "root-public-cli";
      const before = invoke(
          beforeCli,
          ["graph", rootId, "--format", "json"],
          env,
        ),
        after = invoke(cli, ["graph", rootId, "--format", "json"], env);
      const raw: unknown = JSON.parse(after.toString());
      const report = Schema.decodeUnknownSync(GraphReport)(raw);
      nodeFields(report, "root-public-node-fields");
      if (label === "root500") {
        property = "root-chain-public";
        assertRootOnlyResponse(raw, ids);
      } else {
        same(
          "review-chain-root-sets",
          [report.ancestors, report.descendants, report.lightest_next],
          [ids.slice(0, 999), [], ids.slice(0, 1)],
        );
      }
      const response = await fetch(
        base + `/profiles/default/tasks/${rootId}/graph`,
        { headers: { Authorization: `Bearer ${credential}` } },
      );
      same("root-http-status", response.status, 200);
      const text = await response.text();
      const httpReport = Schema.decodeUnknownSync(GraphReport)(
        JSON.parse(text),
      );
      nodeFields(httpReport, "root-public-node-fields");
      same(
        "root-http-sets",
        [
          httpReport.ancestors,
          httpReport.descendants,
          httpReport.lightest_next,
        ],
        [report.ancestors, report.descendants, report.lightest_next],
      );
      writeFileSync(join(evidence, label + "-before-cli.json"), before);
      writeFileSync(join(evidence, label + "-after-cli.json"), after);
      writeFileSync(join(evidence, label + "-http.json"), text);
      observations.push({
        label,
        root: rootId,
        fixture:
          label === "root500"
            ? "F independent deterministic 1000-chain/root500"
            : "B committed fixture independently driven by F",
        beforeCliStdoutBytes: before.byteLength,
        afterCliStdoutBytes: after.byteLength,
        beforeCompactBytes: Buffer.byteLength(
          JSON.stringify(JSON.parse(before.toString())),
        ),
        afterCompactBytes: Buffer.byteLength(JSON.stringify(raw)),
        httpBodyBytes: Buffer.byteLength(text),
        beforeStdoutSha256: digest(before),
        afterStdoutSha256: digest(after),
        nodes: report.nodes.length,
        edges: report.edges.length,
      });
    }
    for (const status of ["done", "cancelled"]) {
      const ready = Schema.decodeUnknownSync(TaskResponse)(
        JSON.parse(
          invoke(
            cli,
            ["add", "F public " + status + " root", "--format", "json"],
            env,
          ).toString(),
        ),
      ).task;
      const get = async () => {
        const response = await fetch(
          base + `/profiles/default/tasks/${ready.id}/graph`,
          { headers: { Authorization: `Bearer ${credential}` } },
        );
        same("root-http-status", response.status, 200);
        return Schema.decodeUnknownSync(GraphReport)(await response.json());
      };
      const open = await get();
      same("root-next-membership", open.lightest_next, [ready.id]);
      invoke(
        cli,
        [
          status === "done" ? "done" : "cancel",
          ready.id,
          "--expected-version",
          "1",
          "--format",
          "json",
        ],
        env,
      );
      const terminal = await get();
      same("root-next-membership", terminal.lightest_next, []);
      same(
        "root-next-membership",
        terminal.nodes.map((node) => [node.ready, node.blocked]),
        [[false, false]],
      );
    }
    const telemetry: {
      phase: string;
      path: string;
      authorization: string | null;
      status: number;
    }[] = [];
    let phase = "signed-out",
      current: string | undefined;
    proxy = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const stamp = phase;
        const url = new URL(request.url);
        const auth = request.headers.get("authorization");
        const response = await fetch(
          new Request(base + url.pathname + url.search, request),
        );
        telemetry.push({
          phase: stamp,
          path: url.pathname,
          authorization:
            auth === null
              ? null
              : auth === `Bearer ${current}`
                ? "current bearer"
                : "other bearer",
          status: response.status,
        });
        return response;
      },
    });
    writeFileSync(
      join(evidence, "proxy-started.json"),
      JSON.stringify({
        pid: process.pid,
        port: proxy.port,
        scope: "real HTTP forwarding header observation only",
      }),
    );
    const origin = `http://127.0.0.1:${proxy.port}`;
    await Effect.runPromise(
      Effect.gen(function* () {
        const http = yield* taskHttpClient(origin, () => current);
        const session = yield* http.signIn.signIn({
          payload: { passphrase: "F root response passphrase" },
        });
        current = session.credential;
        phase = "signed-in";
        const profiles = yield* Effect.exit(http.reads.profiles());
        property = "client-credential-refresh";
        assert.ok(
          Exit.isSuccess(profiles),
          "BEHAVIORAL_FAILURE:client-credential-refresh",
        );
        const report = yield* http.tasks.graph({
          params: { profile, task: root.id },
        });
        nodeFields(report, "root-client-node-fields");
        property = "root-client-sets";
        assertRootOnlyResponse(
          report,
          chain.map((task) => task.id),
        );
        const typedFork = yield* http.tasks.graph({
          params: { profile, task: forkRoot.id },
        });
        property = "root-next-order";
        assertRootSetOrder(
          typedFork,
          forkTasks.map((task) => task.id),
        );
        const typedEncoded = Schema.encodeSync(GraphReport)(typedFork);
        same(
          "root-client-sets",
          [
            typedEncoded.ancestors,
            typedEncoded.descendants,
            typedEncoded.lightest_next,
          ],
          [
            publicFork.ancestors,
            publicFork.descendants,
            publicFork.lightest_next,
          ],
        );
        phase = "sign-out";
        yield* http.credentials.signOut();
        current = undefined;
        phase = "after-sign-out";
        const after = yield* Effect.exit(http.reads.profiles());
        property = "client-no-stale-authorization";
        assert.ok(Exit.isFailure(after));
        const observed = telemetry.filter(
          (row) => row.phase === "after-sign-out",
        );
        same(
          property,
          observed.map((row) => [row.authorization, row.status]),
          [[null, 401]],
        );
        phase = "re-sign-in";
        const renewed = yield* http.signIn.signIn({
          payload: { passphrase: "F root response passphrase" },
        });
        current = renewed.credential;
        phase = "re-signed-in";
        const again = yield* Effect.exit(http.reads.profiles());
        property = "client-credential-refresh";
        assert.ok(Exit.isSuccess(again));
        same(
          property,
          telemetry
            .filter((row) => row.phase === "re-signed-in" && row.path === "/profiles")
            .map((row) => [row.authorization, row.status]),
          [["current bearer", 200]],
        );
      }).pipe(Effect.provide(FetchHttpClient.layer)),
    );
    same(
      "client-credential-refresh",
      telemetry
        .filter((row) => row.phase === "signed-in" && row.path === "/profiles")
        .map((row) => [row.authorization, row.status]),
      [["current bearer", 200]],
    );
    writeFileSync(
      join(evidence, "client-auth-sequence.json"),
      JSON.stringify({ status: "pass", oneClient: true, telemetry }, null, 2),
    );
  }
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({ status: "pass", mode, observations }, null, 2),
  );
  console.log(JSON.stringify({ status: "pass", mode, observations }));
} catch (error) {
  property =
    String(error).match(/BEHAVIORAL_FAILURE:([a-z0-9-]+)/)?.[1] ?? property;
  console.error(`BEHAVIORAL_FAILURE:${property}`);
  const result = {
    status: "fail",
    property,
    input: activeInput,
    error: String(error),
  };
  writeFileSync(join(evidence, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  process.exitCode = 1;
} finally {
  proxy?.stop(true);
  if (server) {
    server.kill("SIGTERM");
    const timer = setTimeout(() => server?.kill("SIGKILL"), 3000);
    const exit = await server.exited;
    clearTimeout(timer);
    await logs;
    writeFileSync(
      join(evidence, "cleanup.json"),
      JSON.stringify({
        server_pid: server.pid,
        server_exit: exit,
        proxy_stopped: true,
        scratch_removed: true,
      }),
    );
  }
  if (directory) rmSync(directory, { recursive: true, force: true });
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(receipts, null, 2),
  );
  writeFileSync(join(evidence, "server.log"), serverLog);
}
