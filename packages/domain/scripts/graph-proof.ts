import assert from "node:assert/strict";
import { Schema } from "effect";
import { dependencyCycle } from "../src/dependency-rules.ts";
import { GraphReport } from "../src/graph-contract.ts";
import { graphEnergy } from "../src/graph-energy.ts";
import { graphMermaid } from "../src/graph-mermaid.ts";
import { dependencyState, indexGraph } from "../src/graph-model.ts";
import { topologicalOrder } from "../src/graph-order.ts";
import { graphShape, queryGraph } from "../src/graph-queries.ts";
import { at, edge, task } from "./dag-proof.ts";

export function proveGraphAlgorithms() {
  const diamond = {
    tasks: [
      task("A", { energy: 1 }),
      task("B", { energy: 2 }),
      task("C", { energy: 3 }),
      task("D", { energy: 4 }),
    ],
    edges: [edge("B", "A"), edge("C", "A"), edge("D", "B"), edge("D", "C")],
  };
  const energy = graphEnergy(diamond);
  assert.deepEqual(
    [...energy.values],
    [
      ["A", { energy: 1, unweighted: 0 }],
      ["B", { energy: 3, unweighted: 0 }],
      ["C", { energy: 4, unweighted: 0 }],
      ["D", { energy: 10, unweighted: 0 }],
    ],
  );
  assert.deepEqual(energy.lightestNext(task("A").id), ["A"]);
  assert.deepEqual(energy.lightestNext(task("D").id), ["A"]);
  const report = queryGraph(diamond, task("D").id, at);
  assert.ok(report);
  assert.equal(Schema.is(GraphReport)(report), true);
  assert.equal(report.shape, "dag");
  assert.deepEqual(
    report.nodes.map((node) => [node.task.id, node.mermaid_id]),
    [
      ["A", "n0"],
      ["B", "n1"],
      ["C", "n2"],
      ["D", "n3"],
    ],
  );
  assert.deepEqual(report.sources, ["A"]);
  assert.deepEqual(report.sinks, ["D"]);
  assert.deepEqual(
    report.nodes.map((n) => [
      n.task.id,
      n.in_degree,
      n.out_degree,
      n.depth,
      n.ready,
      n.blocked,
    ]),
    [
      ["A", 0, 2, 0, true, false],
      ["B", 1, 1, 1, false, true],
      ["C", 1, 1, 1, false, true],
      ["D", 2, 0, 2, false, true],
    ],
  );
  assert.deepEqual(report.ancestors, ["A", "B", "C"]);
  assert.deepEqual(report.descendants, []);
  assert.deepEqual(report.lightest_next, ["A"]);
  const branching = {
    tasks: [
      task("A", { priority: "P1", energy: 5 }),
      task("B", { priority: "P2", energy: 1 }),
      task("R", { priority: "P3", energy: 2 }),
      task("C", { priority: "P1", energy: 4 }),
      task("D", { priority: "P2", energy: 1 }),
    ],
    edges: [edge("R", "A"), edge("R", "B"), edge("C", "R"), edge("D", "R")],
  };
  const branch = queryGraph(branching, task("R").id, at);
  assert.ok(branch);
  assert.deepEqual(branch.topological_order, ["A", "B", "R", "C", "D"]);
  assert.deepEqual(topologicalOrder(branching, graphEnergy(branching).values), [
    "B",
    "A",
    "R",
    "D",
    "C",
  ]);
  assert.deepEqual(branch.ancestors, ["A", "B"]);
  assert.deepEqual(branch.descendants, ["C", "D"]);
  assert.deepEqual(branch.lightest_next, ["A", "B"]);
  for (const node of branch.nodes)
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
  assert.deepEqual(queryGraph(branching, task("A").id, at)?.lightest_next, [
    "A",
  ]);
  const missing = {
    ...diamond,
    tasks: diamond.tasks.map((t) =>
      t.id === "B" ? { ...t, energy: null } : t,
    ),
  };
  assert.deepEqual(graphEnergy(missing).values.get(task("D").id), {
    energy: 8,
    unweighted: 1,
  });
  const terminal = {
    ...diamond,
    tasks: diamond.tasks.map((t) =>
      t.id === "B" || t.id === "C" ? { ...t, status: "cancelled" as const } : t,
    ),
  };
  assert.deepEqual(graphEnergy(terminal).values.get(task("D").id), {
    energy: 4,
    unweighted: 0,
  });
  assert.deepEqual(graphEnergy(terminal).lightestNext(task("D").id), ["D"]);
  assert.deepEqual(graphEnergy(terminal).lightestNext(task("B").id), []);
  const cancelled = terminal.tasks.find((t) => t.id === "B");
  assert.ok(cancelled);
  assert.deepEqual(dependencyState(cancelled, indexGraph(terminal)), {
    ready: false,
    blocked: false,
  });
  assert.deepEqual(topologicalOrder(terminal, graphEnergy(terminal).values), [
    "A",
    "B",
    "C",
    "D",
  ]);
  const chain = {
    tasks: [task("C"), task("A"), task("B")],
    edges: [edge("B", "A"), edge("C", "B")],
  };
  assert.deepEqual(topologicalOrder(chain), ["A", "B", "C"]);
  assert.deepEqual(graphShape(chain), { shape: "chain" });
  assert.deepEqual(graphShape({ tasks: [task("A")], edges: [] }), {
    shape: "single",
  });
  const four = [task("A"), task("B"), task("C"), task("D")];
  assert.deepEqual(
    graphShape({
      tasks: four,
      edges: [edge("C", "A"), edge("C", "B"), edge("D", "C")],
    }),
    { shape: "tree", orientation: "converging" },
  );
  assert.deepEqual(
    graphShape({
      tasks: four,
      edges: [edge("B", "A"), edge("C", "A"), edge("D", "C")],
    }),
    { shape: "tree", orientation: "diverging" },
  );
  assert.deepEqual(
    graphShape({
      tasks: [...four, task("E")],
      edges: [edge("B", "A"), edge("B", "C"), edge("D", "C"), edge("E", "C")],
    }),
    { shape: "tree", orientation: "mixed" },
  );
  const ties = {
    tasks: [
      task("Z", { priority: "P1" }),
      task("D"),
      task("C", {
        due_at: {
          kind: "date",
          date: Schema.decodeUnknownSync(TaskDate)("2026-11-10"),
        },
      }),
      task("B", {
        due_at: {
          kind: "instant",
          utc: at,
          time_zone: Schema.decodeUnknownSync(TimeZoneId)("UTC"),
        },
      }),
      task("A", {
        due_at: {
          kind: "instant",
          utc: at,
          time_zone: Schema.decodeUnknownSync(TimeZoneId)("UTC"),
        },
      }),
    ],
    edges: [],
  };
  assert.deepEqual(topologicalOrder(ties), ["Z", "A", "B", "C", "D"]);
  const many = {
    tasks: Array.from({ length: 105 }, (_, i) =>
      task(String(i).padStart(3, "0"), { energy: i === 0 ? null : 1 }),
    ),
    edges: Array.from({ length: 104 }, (_, i) =>
      edge(String(i + 1).padStart(3, "0"), String(i).padStart(3, "0")),
    ),
  };
  const manyEnergy = graphEnergy(many);
  assert.deepEqual(manyEnergy.values.get(task("104").id), {
    energy: 104,
    unweighted: 1,
  });
  assert.deepEqual(manyEnergy.lightestNext(task("104").id), ["000"]);
  const manyIndex = indexGraph(many);
  const cycle = dependencyCycle(edge("000", "104"), {
    upstream: (id) => manyIndex.upstream.get(id) ?? [],
    hasDependents: (id) => (manyIndex.downstream.get(id)?.length ?? 0) > 0,
  });
  assert.equal(cycle?.length, 106);
  assert.deepEqual(cycle?.slice(0, 3), ["000", "001", "002"]);
  assert.deepEqual(cycle?.slice(-2), ["104", "000"]);
  const redundant = { ...chain, edges: [...chain.edges, edge("C", "A")] };
  assert.equal(
    graphMermaid(redundant),
    'flowchart TD\n  n0["Task A"]\n  n1["Task B"]\n  n2["Task C"]\n  n0 --> n1\n  n0 --> n2\n  n1 --> n2\n',
  );
  assert.equal(
    graphMermaid({
      tasks: [task("unsafe-id!", { title: 'end "x"\n[bad] <tag>&# \\ |' })],
      edges: [],
    }),
    'flowchart TD\n  n0["end #34;x#34; #91;bad#93; #60;tag#62;#38;#35; #92; #124;"]\n',
  );
  assert.equal(queryGraph(diamond, task("missing").id, at), null);
}

import { CalendarDate as TaskDate, TimeZoneId } from "../src/time.ts";
