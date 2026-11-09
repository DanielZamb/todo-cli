import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { GraphReport, ProfileId } from "@todo/domain";
import { Effect, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { taskHttpClient } from "../src/http-client.ts";

const origin = process.env.TODO_GRAPH_SERVER;
const credential = process.env.TODO_GRAPH_CREDENTIAL;
const output = process.argv[2];
assert.ok(origin && credential && output);
const report = await Effect.runPromise(
  Effect.gen(function* () {
    const http = yield* taskHttpClient(origin, credential);
    const profile = Schema.decodeUnknownSync(ProfileId)("work");
    const a = yield* http.tasks.create({
      params: { profile },
      payload: { title: "Graph A", priority: "P1", energy: 5 },
    });
    const b = yield* http.tasks.create({
      params: { profile },
      payload: { title: "Graph B", priority: "P2", energy: 1 },
    });
    const root = yield* http.tasks.create({
      params: { profile },
      payload: {
        title: "Graph root",
        priority: "P3",
        energy: 2,
        depends_on: [a.id, b.id],
      },
    });
    const c = yield* http.tasks.create({
      params: { profile },
      payload: {
        title: "Graph C",
        priority: "P1",
        energy: 4,
        depends_on: [root.id],
      },
    });
    const d = yield* http.tasks.create({
      params: { profile },
      payload: {
        title: "Graph D",
        priority: "P2",
        energy: 1,
        depends_on: [root.id],
      },
    });
    const graph = yield* http.tasks.graph({
      params: { profile, task: root.id },
    });
    assert.deepEqual(graph.topological_order, [
      a.id,
      b.id,
      root.id,
      c.id,
      d.id,
    ]);
    assert.deepEqual(graph.ancestors, [a.id, b.id]);
    assert.deepEqual(graph.descendants, [c.id, d.id]);
    assert.deepEqual(graph.lightest_next, [a.id, b.id]);
    for (const node of graph.nodes)
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
    const encoded = Schema.encodeSync(GraphReport)(graph);
    assert.deepEqual(encoded.ancestors, [a.id, b.id]);
    assert.deepEqual(encoded.descendants, [c.id, d.id]);
    assert.deepEqual(encoded.lightest_next, [a.id, b.id]);
    return graph;
  }).pipe(Effect.provide(FetchHttpClient.layer)),
);
writeFileSync(output, JSON.stringify({ passed: true, report }, null, 2));
