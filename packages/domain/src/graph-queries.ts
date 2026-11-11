import { Effect } from "effect";
import type { AccessRequest } from "./auth/model.ts";
import type { GraphReport } from "./graph-contract.ts";
import { graphEnergy } from "./graph-energy.ts";
import { graphMermaid, mermaidNodeIds } from "./graph-mermaid.ts";
import {
  dependencyState,
  indexGraph,
  reachable,
  type TaskGraph,
} from "./graph-model.ts";
import { topologicalOrder } from "./graph-order.ts";
import type { TaskId } from "./ids.ts";
import type { OperationStore } from "./store/store.ts";
import type { Instant } from "./time.ts";

export function graphShape(graph: TaskGraph):
  | {
      readonly shape: "tree";
      readonly orientation: "converging" | "diverging" | "mixed";
    }
  | { readonly shape: "single" | "chain" | "dag" } {
  const index = indexGraph(graph);
  if (index.tasks.size === 1) return { shape: "single" };
  const converging = [...index.downstream.values()].every(
    (ids) => ids.length <= 1,
  );
  const diverging = [...index.upstream.values()].every(
    (ids) => ids.length <= 1,
  );
  if (converging && diverging) return { shape: "chain" };
  if (index.edges.length === index.tasks.size - 1)
    return {
      shape: "tree",
      orientation: converging
        ? "converging"
        : diverging
          ? "diverging"
          : "mixed",
    };
  return { shape: "dag" };
}

export function queryGraph(
  graph: TaskGraph,
  task_id: TaskId,
  generated_at: Instant,
): GraphReport | null {
  const index = indexGraph(graph);
  const task = index.tasks.get(task_id);
  if (!task) return null;
  const adjacent = new Map(
    [...index.tasks.keys()].map((id) => [
      id,
      [...(index.upstream.get(id) ?? []), ...(index.downstream.get(id) ?? [])],
    ]),
  );
  const members = reachable(task_id, adjacent);
  members.add(task_id);
  const wholeOrder = topologicalOrder(graph);
  const order = wholeOrder.filter((id) => members.has(id));
  const tasks = order.flatMap((id) => {
    const task = index.tasks.get(id);
    return task ? [task] : [];
  });
  const edges = index.edges
    .filter(
      (edge) => members.has(edge.dependent_id) && members.has(edge.blocker_id),
    )
    .sort(
      (a, b) =>
        a.dependent_id.localeCompare(b.dependent_id) ||
        a.blocker_id.localeCompare(b.blocker_id),
    );
  const energy = graphEnergy(graph);
  const ancestors = reachable(task_id, index.upstream);
  const descendants = reachable(task_id, index.downstream);
  const depths = new Map<TaskId, number>();
  const mermaidIds = mermaidNodeIds(tasks);
  const nodes = tasks.map((task) => {
    const mermaid_id = mermaidIds.get(task.id);
    if (mermaid_id === undefined)
      throw new Error("Task missing its Mermaid identity");
    const blockers = index.upstream.get(task.id) ?? [];
    const depth = blockers.reduce(
      (max, id) => Math.max(max, (depths.get(id) ?? 0) + 1),
      0,
    );
    depths.set(task.id, depth);
    return {
      mermaid_id,
      task,
      in_degree: blockers.length,
      out_degree: index.downstream.get(task.id)?.length ?? 0,
      ...dependencyState(task, index),
      depth,
      remaining_energy: energy.values.get(task.id) ?? {
        energy: 0,
        unweighted: 0,
      },
    };
  });
  const shape = graphShape({ tasks, edges });
  const fields = {
    generated_at,
    profile_id: task.profile_id,
    task_id,
    ancestors: wholeOrder.filter((id) => ancestors.has(id)),
    descendants: wholeOrder.filter((id) => descendants.has(id)),
    lightest_next: energy.lightestNext(task_id),
    nodes,
    edges,
    sources: nodes
      .filter((node) => node.in_degree === 0)
      .map((node) => node.task.id),
    sinks: nodes
      .filter((node) => node.out_degree === 0)
      .map((node) => node.task.id),
    topological_order: order,
    mermaid: graphMermaid({ tasks, edges }),
  };
  if (shape.shape === "tree")
    return {
      ...fields,
      shape: "tree",
      orientation: shape.orientation,
    };
  return { ...fields, shape: shape.shape };
}

export const readGraph = (
  store: OperationStore,
  request: AccessRequest & { readonly task_id: TaskId },
  generated_at: Instant,
) =>
  Effect.gen(function* () {
    yield* store.auth.authorizeRead(request);
    return queryGraph(
      yield* store.graph(request.profile),
      request.task_id,
      generated_at,
    );
  });
