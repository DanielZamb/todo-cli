import type { TaskRead } from "@todo/domain";
import { SearchHighlight } from "./task-search-presentation.tsx";
export function DependencyTaskLabel({
  task,
  id,
  projects = [],
}: {
  task?: TaskRead | undefined;
  id?: string;
  projects?: readonly { id: string; name: string }[];
}) {
  const title = task?.title ?? id ?? "Task";
  const project = projects.find(
    (project) => project.id === task?.project_id,
  )?.name;
  return (
    <span className="dependency-task-label">
      <span className="truncate" title={title}>
        <SearchHighlight
          text={title}
          matches={task?.search_matches}
          field="title"
        />
      </span>
      {task && (
        <small className="text-muted-foreground">
          {task.status === "cancelled" ? "Cancelled" : task.status}
          {project ? ` · ${project}` : ""}
        </small>
      )}
    </span>
  );
}
