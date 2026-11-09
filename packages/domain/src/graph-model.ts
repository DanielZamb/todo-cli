import type { Edge } from "./dependencies.ts";
import { unresolved } from "./dependency-rules.ts";
import type { Task } from "./entities.ts";
import type { TaskId } from "./ids.ts";

export type TaskGraph = {
  readonly tasks: readonly Task[];
  readonly edges: readonly Edge[];
};

export function indexGraph(graph: TaskGraph) {
  const tasks = new Map(
    graph.tasks
      .filter((task) => task.deleted_at === null)
      .map((task) => [task.id, task]),
  );
  const upstream = new Map<TaskId, TaskId[]>();
  const downstream = new Map<TaskId, TaskId[]>();
  const edges = graph.edges.filter(
    (edge) => tasks.has(edge.dependent_id) && tasks.has(edge.blocker_id),
  );
  for (const id of tasks.keys()) {
    upstream.set(id, []);
    downstream.set(id, []);
  }
  for (const edge of edges) {
    upstream.get(edge.dependent_id)?.push(edge.blocker_id);
    downstream.get(edge.blocker_id)?.push(edge.dependent_id);
  }
  for (const adjacent of [...upstream.values(), ...downstream.values()])
    adjacent.sort();
  return { tasks, edges, upstream, downstream };
}
export type GraphIndex = ReturnType<typeof indexGraph>;

export function reachable(
  start: TaskId,
  adjacent: ReadonlyMap<TaskId, readonly TaskId[]>,
) {
  const seen = new Set<TaskId>([start]);
  const queue = [start];
  for (const id of queue)
    for (const next of adjacent.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  seen.delete(start);
  return seen;
}

export function dependencyState(task: Task, graph: GraphIndex) {
  const blocked = (graph.upstream.get(task.id) ?? []).some((id) => {
    const blocker = graph.tasks.get(id);
    return blocker && unresolved(blocker);
  });
  return {
    ready: unresolved(task) && !blocked,
    blocked: unresolved(task) && blocked,
  };
}
