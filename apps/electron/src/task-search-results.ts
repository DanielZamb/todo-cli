import type { ProfileId, TaskFilters, TaskRead } from "@todo/domain";
import { priorityGroups } from "./model.ts";
import type { Reply, ViewName } from "./protocol.ts";

export type SearchIdentity = {
  profile: typeof ProfileId.Type;
  view: ViewName;
  filters: TaskFilters;
  project: string | null;
  tag: string | null;
  text: string;
};
export type TaskCatalog = Extract<Reply, { _tag: "tasks" }>;
export type AppliedSearch = {
  catalog: TaskCatalog;
  appliedIdentity: SearchIdentity;
};
export function taskSearchQuery(
  identity: SearchIdentity,
  definitions: Pick<TaskCatalog, "projects" | "tags">,
): TaskFilters {
  const project =
    identity.filters.project ??
    definitions.projects.find((value) => value.id === identity.project)?.name;
  const tagName = definitions.tags.find(
    (value) => value.id === identity.tag,
  )?.name;
  const tag =
    identity.filters.tag ??
    (tagName !== undefined && tagName === tagName.trim() ? tagName : undefined);
  return {
    ...identity.filters,
    ...(project === undefined ? {} : { project }),
    ...(tag === undefined ? {} : { tag }),
    text: identity.text,
  };
}
export const identityKey = (identity: SearchIdentity) =>
  JSON.stringify({
    ...identity,
    filters: Object.fromEntries(
      Object.entries(identity.filters).sort(([a], [b]) => a.localeCompare(b)),
    ),
  });
export function searchGroups(catalog: TaskCatalog) {
  const matching: readonly TaskRead[] = catalog.matching_tasks ?? catalog.tasks;
  if (!catalog.planning) return priorityGroups(matching);
  const byId = new Map(matching.map((task) => [task.id, task]));
  return catalog.planning.groups.map((group) => ({
    ...group,
    tasks: group.tasks.flatMap((task) => {
      const read = byId.get(task.id);
      return read ? [read] : [];
    }),
  }));
}
