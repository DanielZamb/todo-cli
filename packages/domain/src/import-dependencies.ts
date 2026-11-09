import { Option, Schema } from "effect";
import type { DependencyError, Edge } from "./dependencies.ts";
import {
  checkDependencyAddition,
  checkDependencyStatuses,
} from "./dependency-rules.ts";
import type { Task } from "./entities.ts";
import { indexGraph, type TaskGraph } from "./graph-model.ts";
import { topologicalOrder } from "./graph-order.ts";
import { type ProfileId, TaskId } from "./ids.ts";
import { ImportItem, type ImportRequest } from "./import.ts";
import { CreateTask, resolveTaskCreation } from "./task-commands.ts";
import type { Instant } from "./time.ts";

export type ImportDependencyFailure = {
  readonly reason: string;
  readonly message: string;
  readonly dependency_error?: DependencyError;
};
export function planImportDependencies(
  graph: TaskGraph,
  items: ImportRequest["items"],
  profile: ProfileId,
  generated_at: Instant,
) {
  const parsed = new Map<number, ImportItem>();
  for (const [index, raw] of items.entries()) {
    const item = Schema.decodeUnknownOption(ImportItem, {
      onExcessProperty: "error",
    })(raw);
    if (Option.isSome(item)) parsed.set(index, item.value);
  }
  const visible = graph.tasks.filter((task) => task.deleted_at === null);
  const byExternal = new Map(
    visible.flatMap((task) =>
      task.external_id ? [[task.external_id, task] as const] : [],
    ),
  );
  const identities = new Map(
    [...byExternal].map(([external, task]) => [external, task.id]),
  );
  for (const item of parsed.values())
    if (!identities.has(item.external_id)) {
      const adopted = item.task_id
        ? visible.find((task) => task.id === item.task_id)
        : undefined;
      identities.set(
        item.external_id,
        adopted?.id ?? Schema.decodeUnknownSync(TaskId)(crypto.randomUUID()),
      );
    }
  const ids = new Map<number, TaskId>();
  const dependencies = new Map<number, readonly TaskId[]>();
  const failures = new Map<number, ImportDependencyFailure>();
  const tasks = new Map<TaskId, Task>(
    graph.tasks.map((task) => [task.id, task]),
  );
  let edges: readonly Edge[] = graph.edges;
  for (const [index, item] of parsed) {
    const id = identities.get(item.external_id);
    if (!id) continue;
    ids.set(index, id);
    const before = tasks.get(id);
    const proposed = before
      ? {
          ...before,
          priority: item.priority ?? before.priority,
          due_at: item.due_at === undefined ? before.due_at : item.due_at,
          energy: item.energy === undefined ? before.energy : item.energy,
          status: item.status ?? before.status,
        }
      : {
          ...resolveTaskCreation(
            Schema.decodeUnknownSync(CreateTask)({
              title: item.title ?? item.external_id,
              ...(item.priority === undefined
                ? {}
                : { priority: item.priority }),
              ...(item.due_at === undefined ? {} : { due_at: item.due_at }),
              ...(item.energy === undefined ? {} : { energy: item.energy }),
              source: "import",
            }),
            profile,
            id,
            generated_at,
          ),
          status: item.status ?? "open",
        };
    tasks.set(id, proposed);
    if (item.depends_on === undefined) continue;
    const blockers: TaskId[] = [];
    for (const external of item.depends_on) {
      const blocker = identities.get(external);
      if (blocker) blockers.push(blocker);
      else
        failures.set(index, {
          reason: "invalid_args",
          message: `Dependency external id ${JSON.stringify(external)} does not name a visible Task in this Profile. Include its row or choose an existing external id, then import again.`,
        });
    }
    dependencies.set(index, blockers);
    edges = [
      ...edges.filter((edge) => edge.dependent_id !== id),
      ...blockers.map((blocker_id) => ({
        profile_id: profile,
        dependent_id: id,
        blocker_id,
      })),
    ];
  }
  const proposed = { tasks: [...tasks.values()], edges };
  const graphIndex = indexGraph(proposed);
  for (const [index, blockers] of dependencies) {
    const dependent_id = ids.get(index);
    if (!dependent_id || failures.has(index)) continue;
    for (const blocker_id of blockers) {
      const error = checkDependencyAddition({
        edge: { profile_id: profile, dependent_id, blocker_id },
        tasks: graphIndex.tasks,
        occurred_at: generated_at,
        traversal: {
          upstream: (id) =>
            (graphIndex.upstream.get(id) ?? []).filter(
              (blocker) => id !== dependent_id || blocker !== blocker_id,
            ),
          hasDependents: (id) =>
            (graphIndex.downstream.get(id)?.length ?? 0) > 0,
        },
      });
      if (!error) continue;
      if (error.code === "dependency_cycle") {
        for (const [other, id] of ids)
          if (error.details.path.includes(id) && dependencies.has(other))
            failures.set(other, {
              reason: error.code,
              message: error.message,
              dependency_error: error,
            });
      } else
        failures.set(index, {
          reason: error.code,
          message: error.message,
          dependency_error: error,
        });
    }
  }
  const status = checkDependencyStatuses({
    tasks: graphIndex.tasks,
    before: indexGraph(graph).tasks,
    upstream: (id) => graphIndex.upstream.get(id) ?? [],
    occurred_at: generated_at,
  });
  if (
    status &&
    (status.code === "blocked" || status.code === "blocks_done_task")
  )
    for (const [index, id] of ids)
      if (id === status.details.task_id)
        failures.set(index, {
          reason: status.code,
          message: status.message,
          dependency_error: status,
        });
  const ranks = new Map(
    topologicalOrder(proposed).map((id, index) => [id, index]),
  );
  const order = [...items.keys()];
  const rank = (index: number) => {
    const id = ids.get(index);
    return id === undefined ? Infinity : (ranks.get(id) ?? Infinity);
  };
  if (dependencies.size) order.sort((a, b) => rank(a) - rank(b) || a - b);
  return { ids, dependencies, failures, order };
}
