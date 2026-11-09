import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Schema } from "effect";
import { Edge } from "../packages/domain/src/dependencies.ts";
import { Task } from "../packages/domain/src/entities.ts";
import {
  checkDependencyAddition,
  dependencyAdvice,
  dependencyCycle,
  shortestUpstreamPath,
} from "../packages/domain/src/dependency-rules.ts";
import { graphEnergy } from "../packages/domain/src/graph-energy.ts";
import {
  dependencyState,
  indexGraph,
  type TaskGraph,
} from "../packages/domain/src/graph-model.ts";
import {
  compareGraphTasks,
  topologicalOrder,
} from "../packages/domain/src/graph-order.ts";
import {
  graphShape,
  queryGraph,
} from "../packages/domain/src/graph-queries.ts";
import { Instant } from "../packages/domain/src/time.ts";

const mode = process.argv[2] ?? "all";
const seed = 260911;
const randomCorpus: unknown[] = [];
let randomState = seed;
const random = () => {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 4294967296;
};
const counts = {
  directedGraphs: 0,
  dags: 0,
  statusCases: 0,
  weightCases: 0,
  scalarCases: 0,
  randomDags: 0,
  cyclePairs: 0,
  assertions: 0,
};
const statuses: Task["status"][] = ["open", "snoozed", "done", "cancelled"];
const weights: Task["energy"][] = [null, 1, 2, 3, 4, 5];
const at = Schema.decodeUnknownSync(Instant)("2026-11-09T06:00:00Z");
let activeProperty = "setup";
let activeInput: unknown = null;
function same(
  property: string,
  actual: unknown,
  expected: unknown,
  input: unknown,
) {
  activeProperty = property;
  activeInput = input;
  counts.assertions++;
  assert.deepEqual(actual, expected, `BEHAVIORAL_FAILURE:${property}`);
}
const task = (i: number, fields: Partial<Task> = {}) =>
  Schema.decodeUnknownSync(Task)({
    id: `T${String(i).padStart(3, "0")}`,
    profile_id: "graph-proof",
    entity_version: 1,
    row_version: 1,
    title: `Task ${i}`,
    description: null,
    status: "open",
    project_id: null,
    priority: "P2",
    scheduled_at: null,
    due_at: null,
    energy: 1,
    estimate_min: null,
    source: "formal-property",
    tags: [],
    occurrence: null,
    created_at: at,
    updated_at: at,
    completed_at: null,
    deleted_at: null,
    ...fields,
  });
function edge(a: Task, b: Task) {
  return Schema.decodeUnknownSync(Edge)({
    profile_id: a.profile_id,
    blocker_id: a.id,
    dependent_id: b.id,
  });
}
const isOpen = (t: Task) => t.status === "open" || t.status === "snoozed";
function compare(a: Task, b: Task) {
  const due = (t: Task) =>
    t.due_at === null
      ? "\uffff"
      : t.due_at.kind === "date"
        ? t.due_at.date
        : t.due_at.utc;
  const keysA = [a.priority, due(a), a.created_at, a.id],
    keysB = [b.priority, due(b), b.created_at, b.id];
  for (let i = 0; i < keysA.length; i++) {
    const x = keysA[i],
      y = keysB[i];
    assert.ok(x !== undefined && y !== undefined);
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length === 0) return [[]];
  return items.flatMap((item, i) =>
    permutations(items.filter((_, j) => j !== i)).map((rest) => [
      item,
      ...rest,
    ]),
  );
}
function expectedSet(graph: TaskGraph, root: Task) {
  const found = new Set<Task["id"]>();
  const pending = [root.id];
  while (pending.length) {
    const id = pending.pop();
    const t = graph.tasks.find((t) => t.id === id);
    if (!t || !isOpen(t) || found.has(t.id)) continue;
    found.add(t.id);
    for (const e of graph.edges)
      if (e.dependent_id === t.id) pending.push(e.blocker_id);
  }
  return found;
}
function state(graph: TaskGraph, t: Task) {
  const blocked = graph.edges.some(
    (e) =>
      e.dependent_id === t.id &&
      graph.tasks.some((b) => b.id === e.blocker_id && isOpen(b)),
  );
  return { ready: isOpen(t) && !blocked, blocked: isOpen(t) && blocked };
}
function validOrder(graph: TaskGraph, ids: readonly Task["id"][]) {
  return (
    ids.length === graph.tasks.length &&
    new Set(ids).size === ids.length &&
    graph.edges.every(
      (e) => ids.indexOf(e.blocker_id) < ids.indexOf(e.dependent_id),
    )
  );
}
function properties(graph: TaskGraph, scalar = false) {
  const input = {
    tasks: graph.tasks.map((t) => ({
      id: t.id,
      status: t.status,
      energy: t.energy,
      priority: t.priority,
      due_at: t.due_at,
      created_at: t.created_at,
    })),
    edges: graph.edges,
  };
  const normal = topologicalOrder(graph);
  same("topological", validOrder(graph, normal), true, input);
  const energy = graphEnergy(graph);
  const light = topologicalOrder(graph, energy.values);
  same("lightest-topological", validOrder(graph, light), true, input);
  const expected = new Map<
    Task["id"],
    { energy: number; unweighted: number }
  >();
  const index = indexGraph(graph);
  for (const root of graph.tasks) {
    const members = expectedSet(graph, root);
    let sum = 0,
      unweighted = 0;
    for (const id of members) {
      const t = graph.tasks.find((t) => t.id === id);
      assert.ok(t);
      if (t.energy === null) unweighted++;
      else sum += t.energy;
    }
    expected.set(root.id, { energy: sum, unweighted });
    same(
      "energy",
      energy.values.get(root.id),
      { energy: sum, unweighted },
      { ...input, root: root.id },
    );
    for (const t of graph.tasks)
      same("contains", energy.contains(root.id, t.id), members.has(t.id), {
        ...input,
        root: root.id,
        id: t.id,
      });
    same("readiness", dependencyState(root, index), state(graph, root), {
      ...input,
      root: root.id,
    });
    const ready = graph.tasks
      .filter((t) => members.has(t.id) && state(graph, t).ready)
      .sort(
        (a, b) =>
          (a.energy ?? Infinity) - (b.energy ?? Infinity) ||
          normal.indexOf(a.id) - normal.indexOf(b.id),
      )
      .map((t) => t.id);
    same("lightest-next", energy.lightestNext(root.id), ready, {
      ...input,
      root: root.id,
    });
  }
  if (scalar) {
    counts.scalarCases++;
    const sorted = [...graph.tasks]
      .sort(
        (a, b) =>
          (expected.get(a.id)?.energy ?? 0) -
            (expected.get(b.id)?.energy ?? 0) || compare(a, b),
      )
      .map((t) => t.id);
    same("scalar-lightest", light, sorted, input);
  }
}
function paths(graph: TaskGraph, start: Task["id"], target: Task["id"]) {
  const all: Task["id"][][] = [];
  function visit(path: Task["id"][]) {
    const last = path.at(-1);
    assert.ok(last);
    if (last === target) {
      all.push(path);
      return;
    }
    for (const e of graph.edges)
      if (e.dependent_id === last && !path.includes(e.blocker_id))
        visit([...path, e.blocker_id]);
  }
  visit([start]);
  all.sort(
    (a, b) => a.length - b.length || a.join("/").localeCompare(b.join("/")),
  );
  return all[0] ?? null;
}
function cycleProperties(graph: TaskGraph, cycles = true) {
  const indexed = indexGraph(graph);
  const up = (id: Task["id"]) =>
    [...(indexed.upstream.get(id) ?? [])].reverse();
  for (const a of graph.tasks)
    for (const b of graph.tasks) {
      const shortest = paths(graph, a.id, b.id);
      same("bfs-path", shortestUpstreamPath(a.id, b.id, up), shortest, {
        edges: graph.edges,
        start: a.id,
        target: b.id,
      });
      counts.cyclePairs++;
    }
  if (!cycles) return;
  for (const a of graph.tasks)
    for (const b of graph.tasks) {
      const proposed = edge(b, a);
      let loop: Task["id"][] | null = null;
      const closing = paths(graph, b.id, a.id);
      if (closing) {
        const arrow = [...closing].reverse();
        const min = [...arrow].sort()[0];
        const pivot = arrow.indexOf(min ?? a.id);
        const rotated = [...arrow.slice(pivot), ...arrow.slice(0, pivot)];
        loop = [...rotated, ...rotated.slice(0, 1)];
      }
      same(
        "cycle",
        dependencyCycle(proposed, {
          upstream: up,
          hasDependents: (id) => graph.edges.some((e) => e.blocker_id === id),
        }),
        loop,
        { edges: graph.edges, proposed },
      );
    }
}
function shapeProperties(graph: TaskGraph) {
  const remaining = new Set(graph.tasks.map((t) => t.id));
  while (remaining.size) {
    const first = remaining.values().next().value;
    assert.ok(first);
    const members = new Set([first]);
    for (const id of members)
      for (const e of graph.edges) {
        if (e.blocker_id === id) members.add(e.dependent_id);
        if (e.dependent_id === id) members.add(e.blocker_id);
      }
    for (const id of members) remaining.delete(id);
    const tasks = graph.tasks.filter((t) => members.has(t.id));
    const edges = graph.edges.filter((e) => members.has(e.dependent_id));
    const incoming = tasks.map(
        (t) => edges.filter((e) => e.dependent_id === t.id).length,
      ),
      outgoing = tasks.map(
        (t) => edges.filter((e) => e.blocker_id === t.id).length,
      );
    const converging = outgoing.every((n) => n <= 1),
      diverging = incoming.every((n) => n <= 1);
    const expected =
      tasks.length === 1
        ? { shape: "single" }
        : converging && diverging
          ? { shape: "chain" }
          : edges.length === tasks.length - 1
            ? {
                shape: "tree",
                orientation: converging
                  ? "converging"
                  : diverging
                    ? "diverging"
                    : "mixed",
              }
            : { shape: "dag" };
    same("shape", graphShape({ tasks, edges }), expected, {
      tasks: tasks.map((t) => t.id),
      edges,
    });
    const report = queryGraph(graph, first, at);
    assert.ok(report);
    same("query-shape", report.shape, expected.shape, { tasks, edges });
    same(
      "query-component",
      [...report.nodes.map((n) => n.task.id)].sort(),
      [...members].sort(),
      { graph, first },
    );
  }
}
function literals() {
  properties({ tasks: [task(1), task(2)], edges: [edge(task(2), task(1))] });
  const tasks = [
    task(1, { energy: 1 }),
    task(2, { energy: 2 }),
    task(3, { energy: 3 }),
    task(4, { energy: 4 }),
  ];
  const [a, b, c, d] = tasks;
  assert.ok(a && b && c && d);
  const graph = {
    tasks,
    edges: [edge(a, b), edge(a, c), edge(b, d), edge(c, d)],
  };
  properties(
    {
      tasks: [
        task(1, { energy: 5 }),
        task(2, { energy: 1 }),
        task(3, { energy: 2 }),
        d,
      ],
      edges: [edge(a, d), edge(b, d), edge(c, d)],
    },
    true,
  );
  properties(graph, true);
  cycleProperties(graph);
  cycleProperties({ ...graph, edges: [...graph.edges, edge(a, d)] });
  shapeProperties(graph);
  shapeProperties({ tasks, edges: [edge(a, b)] });
  shapeProperties({ tasks, edges: [edge(a, b), edge(c, b), edge(c, d)] });
  shapeProperties({ tasks, edges: [edge(a, b), edge(a, c), edge(a, d)] });
  shapeProperties({ tasks, edges: [edge(a, d), edge(b, d), edge(c, d)] });
  shapeProperties({ tasks: [a], edges: [] });
  shapeProperties({ tasks, edges: [edge(a, b), edge(b, c), edge(c, d)] });
  same(
    "energy",
    graphEnergy(graph).values.get(d.id),
    { energy: 10, unweighted: 0 },
    "literal diamond 1,2,3,4",
  );
  properties({
    ...graph,
    tasks: tasks.map((t) =>
      t.id === b.id ? task(0, { ...t, energy: null }) : t,
    ),
  });
  for (const status of ["done", "cancelled"] satisfies Task["status"][])
    properties({ tasks: [task(0, { status })], edges: [] });
  const terminal = {
    ...graph,
    tasks: tasks.map((t) =>
      t.id === b.id || t.id === c.id
        ? task(0, { ...t, status: "cancelled" })
        : t,
    ),
  };
  properties(terminal);
  same(
    "lightest-next",
    graphEnergy(terminal).lightestNext(d.id),
    [d.id],
    "Ready root after cancelled intermediates",
  );
  const edgeTerminal = {
    tasks: [
      task(0, { ...a, status: "open" }),
      task(0, { ...b, status: "cancelled" }),
    ],
    edges: [edge(a, b)],
  };
  properties(edgeTerminal);
  const chainTasks = Array.from({ length: 104 }, (_, i) => task(i));
  const chainEdges = chainTasks.slice(1).map((t, i) => {
    const b = chainTasks[i];
    assert.ok(b);
    return edge(b, t);
  });
  const start = chainTasks.at(-1),
    end = chainTasks[0];
  assert.ok(start && end);
  same(
    "bfs-long",
    shortestUpstreamPath(start.id, end.id, (id) =>
      chainEdges.filter((e) => e.dependent_id === id).map((e) => e.blocker_id),
    )?.length,
    104,
    "103-edge chain",
  );
  const longLoop = dependencyCycle(edge(start, end), {
    upstream: (id) =>
      chainEdges.filter((e) => e.dependent_id === id).map((e) => e.blocker_id),
    hasDependents: (id) => chainEdges.some((e) => e.blocker_id === id),
  });
  same(
    "cycle-long",
    longLoop,
    [...chainTasks.map((t) => t.id), end.id],
    "104-node loop",
  );
  properties({
    tasks: chainTasks.slice(0, 40),
    edges: chainEdges.slice(0, 39),
  });
  const boundaryTasks = Array.from({ length: 15 }, (_, i) => task(i));
  const dependent = boundaryTasks[14];
  assert.ok(dependent);
  for (const count of [9, 13, 14]) {
    const previous = boundaryTasks
      .slice(0, count - 1)
      .map((b) => edge(b, dependent));
    const blocker = boundaryTasks[count - 1];
    assert.ok(blocker);
    const result = checkDependencyAddition({
      edge: edge(blocker, dependent),
      tasks: new Map(boundaryTasks.map((t) => [t.id, t])),
      traversal: {
        upstream: (id) =>
          previous
            .filter((e) => e.dependent_id === id)
            .map((e) => e.blocker_id),
        hasDependents: (id) => previous.some((e) => e.blocker_id === id),
      },
      occurred_at: at,
    });
    same(
      "boundary",
      result?.code ?? null,
      count === 14 ? "too_many_dependencies" : null,
      { count },
    );
    const advice = `This Task depends on ${count} Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks.`;
    same("advice", dependencyAdvice(count), advice, { count });
    if (result?.code === "too_many_dependencies")
      same(
        "boundary",
        [result.details.count, result.details.limit, result.message],
        [14, 13, advice],
        { count },
      );
  }
  const ties = Array.from({ length: 24 }, (_, i) =>
    task(i, {
      priority: i % 3 === 0 ? "P1" : i % 3 === 1 ? "P2" : "P3",
      due_at: Schema.decodeUnknownSync(Task.fields.due_at)(
        i % 4 === 0
          ? null
          : i % 4 === 1
            ? { kind: "date", date: "2026-11-10" }
            : {
                kind: "instant",
                utc: "2026-11-10T12:00:00Z",
                time_zone: "UTC",
              },
      ),
      created_at: Schema.decodeUnknownSync(Instant)(
        i % 2 ? "2026-11-08T00:00:00Z" : "2026-11-09T00:00:00Z",
      ),
    }),
  );
  same(
    "heap-ties",
    topologicalOrder({ tasks: [...ties].reverse(), edges: [] }),
    [...ties].sort(compare).map((t) => t.id),
    "24 comparator tie fixtures",
  );
  for (const a of ties)
    for (const b of ties)
      same(
        "comparator",
        Math.sign(compareGraphTasks(a, b)),
        Math.sign(compare(a, b)),
        { a, b },
      );
}
try {
  literals();
  if (mode === "all") {
    for (let n = 1; n <= 4; n++) {
      const tasks = Array.from({ length: n }, (_, i) => task(i));
      const pairs = tasks.flatMap((a) =>
        tasks.filter((b) => a.id !== b.id).map((b) => edge(a, b)),
      );
      const orders = permutations(tasks.map((t) => t.id));
      for (let mask = 0; mask < 2 ** pairs.length; mask++) {
        const graph = {
          tasks,
          edges: pairs.filter((_, i) => (mask & (1 << i)) !== 0),
        };
        counts.directedGraphs++;
        const valid = orders.filter((ids) => validOrder(graph, ids));
        cycleProperties(graph, valid.length > 0);
        if (!valid.length) continue;
        counts.dags++;
        same("normal-ties", topologicalOrder(graph), valid[0], graph);
        shapeProperties(graph);
        for (let statusMask = 0; statusMask < 4 ** n; statusMask++) {
          const sample = {
            ...graph,
            tasks: tasks.map((t, i) =>
              task(0, {
                ...t,
                status: statuses[Math.floor(statusMask / 4 ** i) % 4] ?? "open",
                energy: i === 1 ? null : (weights[(i % 5) + 1] ?? null),
              }),
            ),
          };
          properties(sample);
          cycleProperties(sample);
          counts.statusCases++;
        }
        for (let weightMask = 0; weightMask < 6 ** n; weightMask++) {
          const sample = {
            ...graph,
            tasks: tasks.map((t, i) =>
              task(0, {
                ...t,
                energy: weights[Math.floor(weightMask / 6 ** i) % 6] ?? null,
                priority: i % 2 ? "P1" : "P2",
              }),
            ),
          };
          properties(
            sample,
            sample.tasks.every((t) => t.energy !== null),
          );
          counts.weightCases++;
        }
      }
    }
    for (let k = 0; k < 256; k++) {
      const n = 1 + (k % 40);
      const tasks = Array.from({ length: n }, (_, i) =>
        task(i, {
          status: statuses[Math.floor(random() * 4)] ?? "open",
          energy: weights[Math.floor(random() * 6)] ?? null,
          priority: random() < 0.5 ? "P1" : "P3",
        }),
      );
      const edges: Edge[] = [];
      for (let d = 1; d < n; d++)
        for (let b = 0; b < d; b++) {
          const from = tasks[b],
            to = tasks[d];
          assert.ok(from && to);
          if (
            edges.filter((e) => e.dependent_id === to.id).length < 13 &&
            (b === 0 || random() < 0.12)
          )
            edges.push(edge(from, to));
        }
      randomCorpus.push({
        tasks: tasks.map((t) => ({
          id: t.id,
          status: t.status,
          energy: t.energy,
          priority: t.priority,
        })),
        edges,
      });
      properties({ tasks, edges });
      properties(
        {
          tasks: tasks.map((t) =>
            task(0, { ...t, status: "open", energy: t.energy ?? 1 }),
          ),
          edges,
        },
        true,
      );
      counts.randomDags++;
    }
  }
  if (process.argv[3])
    writeFileSync(
      process.argv[3],
      JSON.stringify(
        {
          seed,
          exhaustive: {
            nodes: [1, 2, 3, 4],
            graphs:
              "all ordered non-self edge bitmasks, DAGs selected by permutation oracle",
            statusVectors: "all 4^n with weights [1,null,3,4]",
            weightVectors:
              "all 6^n with all statuses open and alternating P2/P1",
            crossProduct: false,
          },
          random: randomCorpus,
        },
        null,
        2,
      ),
    );
  console.log(
    JSON.stringify({
      status: "pass",
      mode,
      seed,
      counts,
      bounds: {
        directedNodes: 4,
        statuses: 4,
        weights: 6,
        randomDags: 256,
        maxRandomNodes: 40,
        longChainEdges: 103,
      },
    }),
  );
} catch (error) {
  console.error(`BEHAVIORAL_FAILURE:${activeProperty}`);
  console.log(
    JSON.stringify({
      status: "fail",
      property: activeProperty,
      input: activeInput,
      error: String(error),
      counts,
      seed,
    }),
  );
  process.exitCode = 1;
}
