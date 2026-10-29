import { Task, type TaskTime } from "@todo/domain";
import { Schema } from "effect";

export const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
export function timeText(
  value: typeof TaskTime.Type | null,
  currentZone = zone,
): string {
  if (!value) return "";
  if (value.kind === "date")
    return new Date(`${value.date}T12:00:00`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
  const text = new Date(value.utc).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: value.time_zone,
  });
  return value.time_zone === currentZone
    ? text
    : `${text} · ${value.time_zone}`;
}
export function taskTagNames(
  task: typeof Task.Type,
  tags: readonly { id: string; name: string }[],
): string[] {
  return task.tags
    .map((id) => tags.find((tag) => tag.id === id)?.name ?? id)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
export const Editor = Schema.Struct({
  base: Task,
  changes: Schema.Struct({
    title: Schema.String,
    description: Schema.String,
    priority: Task.fields.priority,
    project_id: Task.fields.project_id,
    project_name: Schema.optional(Schema.String),
    tag_names: Schema.optional(Schema.Array(Schema.String)),
    tags: Task.fields.tags,
    due_at: Task.fields.due_at,
    scheduled_at: Task.fields.scheduled_at,
    energy: Task.fields.energy,
    estimate_min: Task.fields.estimate_min,
  }),
});
export type Editor = typeof Editor.Type;
export const editorFor = (task: typeof Task.Type): Editor => ({
  base: task,
  changes: {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    project_id: task.project_id,
    tags: task.tags,
    due_at: task.due_at,
    scheduled_at: task.scheduled_at,
    energy: task.energy,
    estimate_min: task.estimate_min,
  },
});
export type Changes = Editor["changes"];
export const fields = [
  "title",
  "description",
  "priority",
  "project_id",
  "tags",
  "due_at",
  "scheduled_at",
  "energy",
  "estimate_min",
] as const;
export type FieldName = (typeof fields)[number];
const fieldValue = (changes: Changes, key: FieldName) =>
  key === "project_id"
    ? [changes.project_id, changes.project_name]
    : key === "tags"
      ? [changes.tags, changes.tag_names ?? []]
      : changes[key];
export function taskPayload(changes: Changes) {
  const { project_id, project_name, tag_names, ...rest } = changes;
  return {
    ...rest,
    ...(project_name === undefined ? { project_id } : { project_name }),
    ...(tag_names === undefined ? {} : { tag_names }),
  };
}
const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);
export function conflicts(editor: Editor, latest: typeof Task.Type) {
  const before = editorFor(editor.base).changes;
  const accepted = editorFor(latest).changes;
  return fields.filter(
    (key) =>
      !same(fieldValue(editor.changes, key), fieldValue(before, key)) &&
      !same(fieldValue(accepted, key), fieldValue(before, key)) &&
      !same(fieldValue(editor.changes, key), fieldValue(accepted, key)),
  );
}
export function merge(
  editor: Editor,
  latest: typeof Task.Type,
  choices: Partial<Record<FieldName, "mine" | "latest">>,
): Changes {
  const before = editorFor(editor.base).changes;
  const accepted = editorFor(latest).changes;
  const source = (key: FieldName) =>
    choices[key] === "latest" ||
    same(fieldValue(editor.changes, key), fieldValue(before, key))
      ? accepted
      : editor.changes;
  const pick = <K extends FieldName>(key: K): Changes[K] => source(key)[key];
  return {
    title: pick("title"),
    description: pick("description"),
    priority: pick("priority"),
    project_id: pick("project_id"),
    ...(source("project_id").project_name === undefined
      ? {}
      : { project_name: source("project_id").project_name }),
    ...(source("tags").tag_names === undefined
      ? {}
      : { tag_names: source("tags").tag_names }),
    tags: pick("tags"),
    due_at: pick("due_at"),
    scheduled_at: pick("scheduled_at"),
    energy: pick("energy"),
    estimate_min: pick("estimate_min"),
  };
}

export function rebaseEditor(
  editor: Editor,
  accepted: typeof Task.Type,
): Editor {
  if (
    editor.base.id !== accepted.id ||
    editor.base.profile_id !== accepted.profile_id
  )
    return editor;
  return { base: accepted, changes: merge(editor, accepted, {}) };
}

export function conflictText(
  key: FieldName,
  changes: Changes,
  projects: readonly { id: string; name: string }[],
  tags: readonly { id: string; name: string }[],
): string {
  switch (key) {
    case "due_at":
    case "scheduled_at":
      return timeText(changes[key]) || "None";
    case "project_id":
      return (
        changes.project_name ??
        projects.find((entry) => entry.id === changes.project_id)?.name ??
        changes.project_id ??
        "No Project"
      );
    case "tags":
      return (
        [
          ...changes.tags.map(
            (id) => tags.find((entry) => entry.id === id)?.name ?? id,
          ),
          ...(changes.tag_names ?? []),
        ].join(", ") || "No Tags"
      );
    default:
      return String(changes[key] ?? "None");
  }
}
