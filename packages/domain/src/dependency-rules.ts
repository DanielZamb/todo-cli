import type { DependencyError, Edge } from "./dependencies.ts";
import type { Task } from "./entities.ts";
import { exitStatus } from "./exit-status.ts";
import type { TaskId } from "./ids.ts";
import type { Instant } from "./time.ts";

export const dependencyAdvice = (count: number) =>
  `This Task depends on ${count} Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks.`;
export const unresolved = (task: Task) =>
  task.status === "open" || task.status === "snoozed";
export type DependencyTraversal = {
  readonly upstream: (id: TaskId) => readonly TaskId[];
  readonly hasDependents: (id: TaskId) => boolean;
};
export function shortestUpstreamPath(
  start: TaskId,
  target: TaskId,
  upstream: DependencyTraversal["upstream"],
): TaskId[] | null {
  const queue = [start];
  const predecessor = new Map<TaskId, TaskId | null>([[start, null]]);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (id === undefined) break;
    if (id === target) {
      const path: TaskId[] = [];
      let cursor: TaskId | null = id;
      while (cursor !== null) {
        path.push(cursor);
        cursor = predecessor.get(cursor) ?? null;
      }
      return path.reverse();
    }
    for (const next of [...upstream(id)].sort()) {
      if (predecessor.has(next)) continue;
      predecessor.set(next, id);
      queue.push(next);
    }
  }
  return null;
}
export function dependencyCycle(
  edge: Edge,
  traversal: DependencyTraversal,
): TaskId[] | null {
  if (edge.dependent_id === edge.blocker_id)
    return [edge.dependent_id, edge.dependent_id];
  if (
    !traversal.upstream(edge.blocker_id).length ||
    !traversal.hasDependents(edge.dependent_id)
  )
    return null;
  const path = shortestUpstreamPath(
    edge.blocker_id,
    edge.dependent_id,
    traversal.upstream,
  );
  if (!path) return null;
  const arrow = path.reverse();
  const smallest = [...arrow].sort()[0];
  const pivot = arrow.findIndex((id) => id === smallest);
  const rotated = [...arrow.slice(pivot), ...arrow.slice(0, pivot)];
  return [...rotated, ...rotated.slice(0, 1)];
}
export function checkDependencyAddition(input: {
  readonly edge: Edge;
  readonly tasks: ReadonlyMap<TaskId, Task>;
  readonly traversal: DependencyTraversal;
  readonly occurred_at: Instant;
}): DependencyError | null {
  const { edge, tasks, traversal, occurred_at: generated_at } = input;
  const dependent = tasks.get(edge.dependent_id);
  const blocker = tasks.get(edge.blocker_id);
  if (
    !dependent ||
    !blocker ||
    dependent.deleted_at !== null ||
    blocker.deleted_at !== null ||
    dependent.profile_id !== edge.profile_id ||
    blocker.profile_id !== edge.profile_id
  )
    return {
      ...exitStatus(2),
      generated_at,
      code: "dependency_profile_mismatch",
      message:
        "Choose two visible Tasks in the same Profile. Move drops Dependencies; copy creates none.",
      details: edge,
    };
  const path = dependencyCycle(edge, traversal);
  if (path)
    return {
      ...exitStatus(2),
      generated_at,
      code: "dependency_cycle",
      message: "Remove a Dependency in this loop, then try again.",
      details: {
        dependent_id: edge.dependent_id,
        blocker_id: edge.blocker_id,
        path,
      },
    };
  const count = traversal.upstream(edge.dependent_id).length + 1;
  if (count > 13)
    return {
      ...exitStatus(2),
      generated_at,
      code: "too_many_dependencies",
      message: dependencyAdvice(count),
      details: { dependent_id: edge.dependent_id, count, limit: 13 },
    };
  return null;
}
export function checkDependencyStatuses(input: {
  readonly tasks: ReadonlyMap<TaskId, Task>;
  readonly before: ReadonlyMap<TaskId, Task>;
  readonly upstream: DependencyTraversal["upstream"];
  readonly occurred_at: Instant;
}): DependencyError | null {
  const { tasks, before, upstream, occurred_at: generated_at } = input;
  for (const task of [...tasks.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (
      task.deleted_at !== null ||
      !unresolved(task) ||
      !before.has(task.id) ||
      unresolved(before.get(task.id) ?? task)
    )
      continue;
    const done_dependents = [...tasks.values()]
      .filter(
        (other) =>
          other.deleted_at === null &&
          other.status === "done" &&
          upstream(other.id).includes(task.id),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const first = done_dependents[0];
    if (first)
      return {
        ...exitStatus(2),
        generated_at,
        code: "blocks_done_task",
        message: `Create a follow-up with todo add "<title>" --depends-on ${first.id} instead.`,
        details: {
          task_id: task.id,
          done_dependents,
          follow_up_depends_on: first.id,
        },
      };
  }
  for (const task of tasks.values()) {
    if (task.deleted_at !== null || task.status !== "done") continue;
    const blockers = upstream(task.id).flatMap((id) => {
      const blocker = tasks.get(id);
      return blocker && unresolved(blocker) ? [blocker] : [];
    });
    if (blockers.length)
      return {
        ...exitStatus(2),
        generated_at,
        code: "blocked",
        message:
          "Finish or cancel these Dependencies first. Choose a resolved Dependency for a done Task.",
        details: { task_id: task.id, blockers },
      };
  }
  return null;
}
