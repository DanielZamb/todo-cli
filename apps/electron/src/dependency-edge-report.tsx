import type { Edge, Task } from "@todo/domain";

export function DependencyEdgeReport({
  added = [],
  removed = [],
  tasks,
}: {
  added?: readonly Pick<Edge, "dependent_id" | "blocker_id">[];
  removed?: readonly Pick<Edge, "dependent_id" | "blocker_id">[];
  tasks: readonly Task[];
}) {
  const title = (id: Task["id"]) =>
    tasks.find((task) => task.id === id)?.title ?? id;
  if (added.length + removed.length === 0) return null;
  return (
    <ul className="dependency-edge-report" aria-label="Dependency changes">
      {(
        [
          ["Added", added],
          ["Removed", removed],
        ] as const
      ).flatMap(([action, edges]) =>
        edges.map((edge) => (
          <li key={`${action}:${edge.dependent_id}:${edge.blocker_id}`}>
            {action}: {title(edge.dependent_id)} depends on{" "}
            {title(edge.blocker_id)}
          </li>
        )),
      )}
    </ul>
  );
}
