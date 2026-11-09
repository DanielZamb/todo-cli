import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Option, Schema } from "effect";
import { Edge } from "../src/dependencies.ts";
import { Task } from "../src/entities.ts";
import { Event } from "../src/events.ts";
import { GraphReport } from "../src/graph-contract.ts";
import { queryGraph } from "../src/graph-queries.ts";
import { ActorId, ProfileId, TaskId } from "../src/ids.ts";
import { openStore } from "../src/store/store.ts";
import { Instant } from "../src/time.ts";

const [mode, cli, evidence] = process.argv.slice(2);
assert.ok(cli && evidence && (mode === "before" || mode === "after"));
mkdirSync(evidence, { recursive: true });
const fixtureText = readFileSync(
  "packages/domain/test/fixtures/dag/chain-1000.json",
  "utf8",
);
const fixture = Schema.decodeUnknownSync(
  Schema.Struct({
    profile_id: ProfileId,
    root_id: TaskId,
    tasks: Schema.Array(Task),
    edges: Schema.Array(Edge),
  }),
)(JSON.parse(fixtureText));
const scratch = mkdtempSync(join(tmpdir(), "todo-dag-response-"));
const path = join(scratch, "scratch.db");
const env = { ...process.env, HOME: scratch, TODO_DB: path };
const actions: unknown[] = [];
const run = (args: readonly string[], input = "") => {
  const result = Bun.spawnSync([cli, ...args, "--format", "json"], {
    env,
    stdin: new TextEncoder().encode(input),
    timeout: 120000,
  });
  actions.push({
    args,
    exit: result.exitCode,
    stdout_bytes: result.stdout.byteLength,
    stderr: result.stderr.toString(),
  });
  assert.equal(result.exitCode, 0, result.stderr.toString());
  return result.stdout;
};
const nodeKeys = [
  "mermaid_id",
  "task",
  "in_degree",
  "out_degree",
  "ready",
  "blocked",
  "depth",
  "remaining_energy",
].sort();
const sets = Schema.Struct({
  ancestors: Schema.Array(TaskId),
  descendants: Schema.Array(TaskId),
  lightest_next: Schema.Array(TaskId),
});
const wireSchema = Schema.Struct({
  nodes: Schema.Array(Schema.Record(Schema.String, Schema.Json)),
  edges: Schema.Array(Edge),
});
try {
  run(["init", "--password-stdin"], "graph response scratch\n");
  run(["login", "--password-stdin"], "graph response scratch\n");
  const direct = await Effect.runPromise(
    Effect.acquireUseRelease(
      openStore({ path }),
      (store) =>
        Effect.gen(function* () {
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
            const result = yield* store.append({
              actor: Schema.decodeUnknownSync(ActorId)("graph-response-proof"),
              profile: fixture.profile_id,
              event,
            });
            assert.equal(result.outcome, "committed");
          }
          return queryGraph(
            yield* store.graph(fixture.profile_id),
            fixture.root_id,
            Schema.decodeUnknownSync(Instant)("2026-11-09T06:00:00Z"),
          );
        }),
      (store) => Effect.orDie(store.close()),
    ),
  );
  assert.ok(direct);
  const bytes = run(["graph", fixture.root_id]);
  writeFileSync(join(evidence, "graph-cli.json"), bytes);
  const raw: unknown = JSON.parse(bytes.toString());
  const wire = Schema.decodeUnknownSync(wireSchema)(raw);
  const requested = wire.nodes.find(
    (node) => Schema.decodeUnknownSync(Task)(node.task).id === fixture.root_id,
  );
  assert.ok(requested);
  const topSets = Schema.decodeUnknownOption(sets)(raw);
  const rootSets = Option.isSome(topSets)
    ? topSets.value
    : Schema.decodeUnknownSync(sets)(requested);
  const ids = fixture.tasks.map((task) => task.id);
  const observed = {
    fixture_sha256: createHash("sha256").update(fixtureText).digest("hex"),
    task_ids: ids,
    requested_task_id: fixture.root_id,
    nodes: wire.nodes.length,
    edges: wire.edges.length,
    cli_serialized_stdout_bytes: bytes.byteLength,
    compact_reencoded_bytes: Buffer.byteLength(JSON.stringify(raw)),
    stdout_sha256: createHash("sha256").update(bytes).digest("hex"),
    direct_node_keys: Object.keys(direct.nodes[0] ?? {}).sort(),
    public_node_keys: Object.keys(wire.nodes[0] ?? {}).sort(),
    root_sets: rootSets,
    binary: cli,
    mode,
  };
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(observed, null, 2),
  );
  assert.equal(wire.nodes.length, 1000);
  assert.equal(wire.edges.length, 999);
  assert.deepEqual(rootSets, {
    ancestors: ids.slice(0, 999),
    descendants: [],
    lightest_next: ids.slice(0, 1),
  });
  if (mode === "before") assert.equal(bytes.byteLength, 49255186);
  for (const node of direct.nodes)
    assert.deepEqual(Object.keys(node).sort(), nodeKeys);
  for (const node of wire.nodes)
    assert.deepEqual(Object.keys(node).sort(), nodeKeys);
  Schema.decodeUnknownSync(GraphReport)(raw);
} finally {
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  rmSync(scratch, { recursive: true, force: true });
  writeFileSync(
    join(evidence, "cleanup.json"),
    JSON.stringify({ scratch_removed: true }),
  );
}
