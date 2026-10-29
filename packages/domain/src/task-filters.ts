import { Schema } from "effect";
import { type Project, type Tag, type Task, TaskPriority } from "./entities.ts";
import { CalendarDate, type TaskTime } from "./time.ts";

const dateFilter = Schema.String.check(
  Schema.isPattern(/^(none|\d{4}-\d{2}-\d{2})$/u),
  Schema.makeFilter(
    (value) => value === "none" || Schema.is(CalendarDate)(value),
  ),
).annotate({
  description:
    "A valid ISO calendar date (YYYY-MM-DD) in the Task's stored time zone, or none for a missing date.",
});
export const TaskFilters = Schema.Struct({
  project: Schema.optionalKey(Schema.String),
  tag: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(
    Schema.Literals(["open", "done", "cancelled", "snoozed", "closed"]),
  ),
  priority: Schema.optionalKey(TaskPriority),
  due: Schema.optionalKey(dateFilter),
  scheduled: Schema.optionalKey(dateFilter),
  attachment: Schema.optionalKey(Schema.String),
  energy: Schema.optionalKey(
    Schema.Literals(["1", "2", "3", "4", "5", "none"]),
  ),
  estimate: Schema.optionalKey(
    Schema.String.check(Schema.isPattern(/^(none|[1-9]\d*)$/u)),
  ),
});
export type TaskFilters = typeof TaskFilters.Type;

function matchesDate(value: TaskTime | null, filter: TaskFilters["due"]) {
  if (filter === undefined) return true;
  if (filter === "none") return value === null;
  if (value === null) return false;
  const date =
    value.kind === "date"
      ? value.date
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: value.time_zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(value.utc));
  return date === filter;
}

export function filterTaskRecords(
  tasks: readonly Task[],
  filters: TaskFilters,
  definitions: { projects: readonly Project[]; tags: readonly Tag[] },
) {
  const attachmentQuery = filters.attachment?.trim().toLowerCase();
  return tasks.filter(
    (task) =>
      (filters.project === undefined ||
        definitions.projects.some(
          (project) =>
            project.profile_id === task.profile_id &&
            project.id === task.project_id &&
            project.name === filters.project,
        )) &&
      (filters.tag === undefined ||
        definitions.tags.some(
          (tag) =>
            tag.profile_id === task.profile_id &&
            task.tags.includes(tag.id) &&
            tag.name.toLowerCase() === filters.tag?.trim().toLowerCase(),
        )) &&
      (filters.status === undefined ||
        (filters.status === "closed"
          ? task.status === "done" || task.status === "cancelled"
          : task.status === filters.status)) &&
      (filters.priority === undefined || task.priority === filters.priority) &&
      matchesDate(task.due_at, filters.due) &&
      matchesDate(task.scheduled_at, filters.scheduled) &&
      (filters.energy === undefined ||
        (filters.energy === "none"
          ? task.energy === null
          : task.energy === Number(filters.energy))) &&
      (filters.estimate === undefined ||
        (filters.estimate === "none"
          ? task.estimate_min === null
          : String(task.estimate_min) === filters.estimate)) &&
      (!attachmentQuery ||
        (task.attachments ?? []).some((attachment) =>
          [
            attachment.label,
            attachment.name,
            attachment.kind === "link" ? attachment.url : attachment.path,
          ].some((value) => value?.toLowerCase().includes(attachmentQuery)),
        )),
  );
}
