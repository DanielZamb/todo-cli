import { Schema } from "effect";
import { AttachmentStatus } from "./attachments.ts";
import { isInboxTask } from "./client-reads.ts";
import type { DiagnosticsSnapshot } from "./diagnostics.ts";
import {
  OccurrenceOrigin,
  type Project,
  Recurrence,
  type Series,
  seriesForTask,
  type Tag,
  type Task,
  TaskPriority,
  TaskStatus,
} from "./entities.ts";
import { OpLogEntry } from "./events.ts";
import { ProfileId } from "./ids.ts";
import type { TaskTime } from "./time.ts";

export type Format = "md" | "json" | "table";
export type TaskView = typeof TaskViewSchema.Type;
export const dateText = (time: TaskTime | null) =>
  time === null ? "" : time.kind === "date" ? time.date : time.utc.slice(0, 10);
const timestamp = (time: TaskTime) =>
  time.kind === "date" ? time.date : iso(time.utc);
export const iso = (value: string) => value.replace(/\.000Z$/, "Z");
export function taskView(
  task: Task,
  projects: readonly Project[],
  tags: readonly Tag[],
  series: readonly Series[] = [],
): TaskView {
  const definition = seriesForTask(task, series);
  const project = projects.find(
    (p) => p.profile_id === task.profile_id && p.id === task.project_id,
  );
  return {
    id: task.id,
    user_id: task.profile_id,
    entity_version: task.entity_version,
    row_version: task.row_version,
    title: task.title,
    ...(task.attachments === undefined
      ? {}
      : {
          attachments: task.attachments.map((value) => ({
            ...value,
            exists: Schema.decodeUnknownSync(Schema.NullOr(Schema.Boolean))(
              null,
            ),
          })),
        }),
    ...(task.external_id ? { external_id: task.external_id } : {}),
    ...(definition && definition.deleted_at === null
      ? { recurrence: definition.recurrence, series_id: definition.id }
      : {}),
    ...(task.occurrence ? { occurrence: task.occurrence } : {}),
    ...(task.description ? { description: task.description } : {}),
    status: task.status,
    ...(project ? { project: project.name } : {}),
    priority: task.priority,
    ...(task.scheduled_at
      ? { scheduled_at: timestamp(task.scheduled_at) }
      : {}),
    ...(task.due_at ? { due_at: timestamp(task.due_at) } : {}),
    ...(task.energy !== null ? { energy: task.energy } : {}),
    ...(task.estimate_min !== null ? { estimate_min: task.estimate_min } : {}),
    source: task.source,
    created_at: iso(task.created_at),
    updated_at: iso(task.updated_at),
    ...(task.completed_at ? { completed_at: iso(task.completed_at) } : {}),
    ...(task.tags.length
      ? {
          tags: task.tags
            .map(
              (id) =>
                tags.find(
                  (tag) => tag.profile_id === task.profile_id && tag.id === id,
                )?.name ?? id,
            )
            .sort(),
        }
      : {}),
  };
}
export const jsonText = (value: unknown) =>
  `${JSON.stringify(value, null, 2)}\n`;

export const TaskViewSchema = Schema.Struct({
  attachments: Schema.optionalKey(Schema.Array(AttachmentStatus)),
  external_id: Schema.optionalKey(Schema.String),
  id: Schema.String,
  user_id: Schema.String,
  entity_version: Schema.Literal(1),
  row_version: Schema.Int,
  title: Schema.String,
  recurrence: Schema.optionalKey(Recurrence),
  series_id: Schema.optionalKey(Schema.String),
  occurrence: Schema.optionalKey(OccurrenceOrigin),
  description: Schema.optionalKey(Schema.String),
  status: TaskStatus,
  project: Schema.optionalKey(Schema.String),
  priority: TaskPriority,
  scheduled_at: Schema.optionalKey(Schema.String),
  due_at: Schema.optionalKey(Schema.String),
  energy: Schema.optionalKey(Schema.Number),
  estimate_min: Schema.optionalKey(Schema.Number),
  source: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  completed_at: Schema.optionalKey(Schema.String),
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type TaskResponse = typeof TaskResponse.Type;
export const TaskResponse = Schema.Struct({
  generated_at: Schema.String,
  task: TaskViewSchema,
});
export type TasksResponse = typeof TasksResponse.Type;
export const TasksResponse = Schema.Struct({
  generated_at: Schema.String,
  filters: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  tasks: Schema.optionalKey(Schema.Array(TaskViewSchema)),
});
export const ExternalIdConflictDetails = Schema.Struct({
  external_id: Schema.String,
  profile_id: ProfileId,
});
export type ExternalIdConflictDetails = typeof ExternalIdConflictDetails.Type;
export type ErrorResponse = typeof ErrorResponse.Type;
export const ErrorResponse = Schema.Struct({
  generated_at: Schema.String,
  code: Schema.String,
  message: Schema.String,
  details: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({
        current_version: Schema.Int,
        latest: TaskViewSchema,
      }),
      Schema.Struct({ visible_task_count: Schema.Int }),
      ExternalIdConflictDetails,
    ]),
  ),
});
export type HistoryResponse = typeof HistoryResponse.Type;
export const HistoryResponse = Schema.Struct({
  generated_at: Schema.String,
  entries: Schema.Array(OpLogEntry),
});
export const encodeResponse = <S extends Schema.ConstraintEncoder<unknown>>(
  schema: S,
  value: S["Type"],
) => jsonText(Schema.encodeSync(schema)(value));

export function taskLine(task: TaskView) {
  return [
    `- [${task.status === "done" ? "x" : " "}] [${task.priority}] ${task.title} (id: ${task.id}, v:${task.row_version})`,
    ...(task.tags ?? []).map((tag) => `#${tag}`),
    ...(task.project ? [`@${task.project}`] : []),
    ...(task.due_at ? [`due:${task.due_at.slice(0, 10)}`] : []),
    ...(task.energy !== undefined ? [`energy:${task.energy}`] : []),
    ...(task.estimate_min !== undefined ? [`est:${task.estimate_min}m`] : []),
  ].join(" ");
}
export const markdownTasks = (tasks: readonly TaskView[]) =>
  `# Tasks\n\n${tasks.length ? tasks.map(taskLine).join("\n") : "_No tasks found._"}\n`;
export const tableTasks = (tasks: readonly TaskView[]) =>
  `ID\tV\tSTATUS\tPRIO\tTITLE\n${tasks.map((task) => `${task.id}\t${task.row_version}\t${task.status}\t${task.priority}\t${task.title}\n`).join("")}`;
export function renderTasks(
  tasks: readonly TaskView[],
  format: Format,
  now: string,
  filters: Record<string, string> = {},
) {
  if (format === "json")
    return encodeResponse(TasksResponse, {
      generated_at: iso(now),
      ...(Object.keys(filters).length ? { filters } : {}),
      ...(tasks.length ? { tasks } : {}),
    });
  return format === "table" ? tableTasks(tasks) : markdownTasks(tasks);
}
export function renderTask(task: TaskView, format: Format, now: string) {
  if (format === "json")
    return encodeResponse(TaskResponse, { generated_at: iso(now), task });
  if (format === "table") return tableTasks([task]);
  return `# Task\n\n${taskLine(task)}\n\n- status: ${task.status}\n- entity_version: ${task.entity_version}\n- created_at: ${task.created_at}\n- updated_at: ${task.updated_at}\n${task.description ? `\n## Description\n\n${task.description}\n` : ""}${task.attachments?.length ? `\n## Attachments\n\n${task.attachments.map((value) => `- ${value.label ? `[${value.label}] ` : ""}${value.kind === "link" ? value.url : value.path}${value.exists === false ? " (missing file)" : ""} (id: ${value.id})`).join("\n")}\n` : ""}`;
}
export function renderError(
  code: string,
  message: string,
  format: Format,
  now: string,
  latest?: TaskView,
  details?: (typeof ErrorResponse.Type)["details"],
) {
  if (format === "json")
    return encodeResponse(ErrorResponse, {
      generated_at: iso(now),
      code,
      message,
      ...(latest
        ? { details: { current_version: latest.row_version, latest } }
        : details
          ? { details }
          : {}),
    });
  const error =
    format === "table"
      ? `ERROR\t${code}\t${message}\n`
      : `# Error\n\n- code: ${code}\n- message: ${message}\n`;
  return (
    error +
    (latest
      ? `${format === "md" ? "\n## Latest Record\n\n" : ""}${renderTask(latest, format, now)}`
      : "")
  );
}
export function renderReview(
  tasks: readonly TaskView[],
  period: "daily" | "weekly",
  format: Format,
  now: string,
) {
  if (format !== "md")
    return renderTasks(tasks, format, now, { review: period });
  const open = tasks.filter((task) => task.status === "open");
  const today = now.slice(0, 10);
  const millis = Date.parse(now);
  const overdue = open.filter(
    (t) =>
      t.due_at &&
      (period === "daily"
        ? t.due_at.slice(0, 10) < today
        : Date.parse(t.due_at) < millis),
  );
  const scheduled = open.filter((t) =>
    period === "daily"
      ? t.scheduled_at?.slice(0, 10) === today ||
        t.due_at?.slice(0, 10) === today
      : t.due_at &&
        Date.parse(t.due_at) >= millis &&
        Date.parse(t.due_at) < millis + 7 * 86400000,
  );
  const inbox = open.filter(
    (t) =>
      isInboxTask(t) &&
      (period === "daily" || Date.parse(t.created_at) < millis - 7 * 86400000),
  );
  const groups: readonly (readonly [string, readonly TaskView[]])[] = [
    ["Overdue", overdue],
    ["Scheduled", scheduled],
    [period === "daily" ? "Inbox" : "Stale Inbox", inbox],
    ...(period === "weekly"
      ? [
          [
            "Missing Metadata",
            open.filter((t) => !t.project || (!t.due_at && !t.scheduled_at)),
          ] satisfies readonly [string, readonly TaskView[]],
        ]
      : []),
  ];
  return `# ${period === "daily" ? "Today" : "Weekly"}\n\n${groups
    .map(
      ([name, rows]) =>
        `## ${name}\n${
          rows.length
            ? [...rows]
                .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
                .map(taskLine)
                .join("\n")
            : "_None_"
        }\n`,
    )
    .join("\n")}`;
}
export function renderExport(
  tasks: readonly TaskView[],
  format: Format,
  now: string,
  scope: string,
  template: string,
) {
  if (format === "json")
    return renderTasks(tasks, format, now, { scope, template });
  const body = markdownTasks(tasks);
  return template === "jira-context"
    ? `# Jira Context\n\n## Summary\n\n- total_tasks: ${tasks.length}\n\n## Tasks\n\n${body}\n## Agent Instructions\n\nUse this context and transform into Jira markdown.\n`
    : body;
}
export function obsidianProjection(
  body: string,
  tasks: readonly TaskView[],
  now: string,
) {
  const start = "<!-- todo-cli:begin -->";
  const end = "<!-- todo-cli:end -->";
  const managed = `${start}\n# CLI Tasks\n\nLast synced: ${iso(now)}\n\n${markdownTasks(tasks)}${end}\n`;
  const s = body.indexOf(start);
  const e = body.indexOf(end, s);
  if (s >= 0 && e > s)
    return (
      body.slice(0, s) + managed + body.slice(e + end.length).replace(/^\n/, "")
    );
  return body + (body.trim() && !body.endsWith("\n") ? "\n" : "") + managed;
}

export function renderHistory(
  entries: readonly OpLogEntry[],
  format: Format,
  now: string,
) {
  if (format === "json")
    return encodeResponse(HistoryResponse, { generated_at: iso(now), entries });
  const rows = entries.map((entry) => {
    const event = entry.event;
    const kind =
      event.kind === "TaskHistoryRedacted"
        ? `${event.original_kind} [redacted]`
        : event.kind === "TaskCreated" && event.copied_from
          ? `TaskCreated (Copied from ${event.copied_from.profile_name} / ${event.copied_from.source_task_id})`
          : event.kind;
    return `${entry.seq}\t${kind}\t${entry.outcome}\t${entry.from_version ?? ""}\t${entry.to_version ?? ""}\t${event.occurred_at}\t${entry.reason ?? ""}`;
  });
  return `${format === "md" ? "# History\n\n" : ""}SEQ\tOPERATION\tOUTCOME\tFROM\tTO\tTIME\tREASON\n${rows.length ? `${rows.join("\n")}\n` : ""}`;
}

export function diagnosticProfileName(
  snapshot: Pick<DiagnosticsSnapshot, "profiles" | "deleted_profiles">,
  id: string | null,
  fallback = "Owner",
) {
  if (id === null) return fallback;
  const active = snapshot.profiles.find((profile) => profile.id === id);
  if (active) return active.name;
  const deleted = snapshot.deleted_profiles.find(
    (profile) => profile.id === id,
  );
  return deleted ? `${deleted.name} (deleted)` : "Deleted Profile";
}
