import type { Database } from "bun:sqlite";
import { Schema } from "effect";
import { Project, Series, Tag, Task } from "../entities.ts";
import type { Event, TaskHistoryRedacted } from "../events.ts";
import { SeriesId, TaskId, Version } from "../ids.ts";

const taskFields = [
  "id",
  "profile_id",
  "entity_version",
  "row_version",
  "title",
  "description",
  "status",
  "project_id",
  "priority",
  "scheduled_at",
  "due_at",
  "energy",
  "estimate_min",
  "source",
  "occurrence",
  "created_at",
  "updated_at",
  "completed_at",
  "deleted_at",
];

export function createProjection(db: Database) {
  db.exec(`CREATE TABLE projects (
    id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
    name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(profile_id, name)
  );
  CREATE TABLE tags (
    id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
    name TEXT NOT NULL, UNIQUE(profile_id, name)
  );
  CREATE TABLE tasks (
    id TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload) AND id = json_extract(payload, '$.id')),
    ${taskFields
      .filter((field) => field !== "id")
      .map(
        (field) =>
          `${field} ${field === "entity_version" || field === "row_version" || field === "energy" || field === "estimate_min" ? "INTEGER" : "TEXT"} GENERATED ALWAYS AS (json_extract(payload, '$.${field}')) STORED`,
      )
      .join(",\n")},
    external_id TEXT GENERATED ALWAYS AS (json_extract(payload, '$.external_id')) VIRTUAL,
    PRIMARY KEY(id), FOREIGN KEY(profile_id) REFERENCES profiles(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
  );
  CREATE TABLE task_tags (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id), PRIMARY KEY(task_id, tag_id)
  );
  CREATE TABLE series (
    id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload))
  );
  CREATE TABLE task_versions (id TEXT PRIMARY KEY, version INTEGER NOT NULL);
  CREATE TABLE series_versions (id TEXT PRIMARY KEY, version INTEGER NOT NULL);
  CREATE UNIQUE INDEX tasks_profile_external_id ON tasks(profile_id, external_id) WHERE external_id IS NOT NULL;
  CREATE INDEX tasks_profile_status ON tasks(profile_id, status);
  CREATE INDEX tasks_profile_due ON tasks(profile_id, due_at);`);
  for (const table of [
    "tasks",
    "task_tags",
    "series",
    "task_versions",
    "series_versions",
    "projects",
    "tags",
  ]) {
    for (const action of ["INSERT", "UPDATE", "DELETE"]) {
      db.exec(`CREATE TRIGGER ${table}_domain_${action.toLowerCase()} BEFORE ${action} ON ${table}
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;`);
    }
  }
}

export const readTasks = (db: Database): Task[] =>
  db
    .query<{ payload: string }, []>("SELECT payload FROM tasks ORDER BY id")
    .all()
    .map((row) => Schema.decodeUnknownSync(Task)(JSON.parse(row.payload)));

export const readSeries = (db: Database): Series[] =>
  db
    .query<{ payload: string }, []>("SELECT payload FROM series ORDER BY id")
    .all()
    .map((row) => Schema.decodeUnknownSync(Series)(JSON.parse(row.payload)));

export function putTask(db: Database, task: Task) {
  db.query(
    "INSERT INTO tasks(id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
  ).run(task.id, JSON.stringify(task));
  db.query("DELETE FROM task_tags WHERE task_id=?").run(task.id);
  for (const tag of task.tags)
    db.query("INSERT INTO task_tags VALUES (?,?)").run(task.id, tag);
  db.query(
    "INSERT INTO task_versions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version",
  ).run(task.id, task.row_version);
}

export function putSeries(db: Database, series: Series) {
  db.query(
    "INSERT INTO series VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
  ).run(series.id, JSON.stringify(series));
  db.query(
    "INSERT INTO series_versions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version",
  ).run(series.id, series.row_version);
}

export type Change<A> = { readonly before: A | null; readonly after: A | null };
export type Changes = {
  readonly tasks: readonly Change<Task>[];
  readonly series: readonly Change<Series>[];
};

export function changes(event: Event | TaskHistoryRedacted): Changes {
  switch (event.kind) {
    case "TaskHistoryRedacted":
      return event.replay;
    case "TaskMovedOut":
      return { tasks: [{ before: event.task, after: null }], series: [] };
    case "TaskMovedIn":
      return { tasks: [{ before: null, after: event.task }], series: [] };
    case "TaskCreated":
      return {
        tasks: [{ before: null, after: event.task }],
        series:
          event.series === null ? [] : [{ before: null, after: event.series }],
      };
    case "TaskEdited":
      return {
        tasks: [{ before: event.before, after: event.after }],
        series:
          event.series_before === null && event.series_after === null
            ? []
            : [{ before: event.series_before, after: event.series_after }],
      };
    case "TaskCompleted":
    case "TaskCancelled":
      return {
        tasks: [
          { before: event.before, after: event.after },
          ...event.next_occurrences.map((after) => ({ before: null, after })),
        ],
        series: [],
      };
    case "TaskReopened":
    case "TaskDeleted":
    case "AttachmentAdded":
    case "AttachmentRemoved":
      return {
        tasks: [{ before: event.before, after: event.after }],
        series: [],
      };
    case "TaskPurged":
      return { tasks: [{ before: event.before, after: null }], series: [] };
    case "TaskReverted":
      return event;
  }
}

export function applyChanges(db: Database, resolved: Changes) {
  for (const change of resolved.series) {
    if (change.after) putSeries(db, change.after);
    else if (change.before)
      db.query("DELETE FROM series WHERE id=?").run(change.before.id);
  }
  for (const change of resolved.tasks) {
    if (change.after) putTask(db, change.after);
    else if (change.before)
      db.query("DELETE FROM tasks WHERE id=?").run(change.before.id);
  }
}

export function metadata(event: Event | TaskHistoryRedacted): {
  projects: readonly Project[];
  tags: readonly Tag[];
} {
  switch (event.kind) {
    case "TaskHistoryRedacted":
      return event.replay;
    case "TaskMovedIn":
      return {
        projects: event.project ? [event.project] : [],
        tags: event.tags ?? [],
      };
    case "TaskCreated":
      return {
        projects: event.project === null ? [] : [event.project],
        tags: event.tags,
      };
    case "TaskEdited":
      return {
        projects: [
          ...(event.project_before === null ? [] : [event.project_before]),
          ...(event.project_after === null ? [] : [event.project_after]),
        ],
        tags: [...event.tags_before, ...event.tags_after],
      };
    default:
      return { projects: [], tags: [] };
  }
}

export function putMetadata(
  db: Database,
  values: {
    readonly projects: readonly Project[];
    readonly tags: readonly Tag[];
  },
) {
  for (const project of values.projects)
    db.query(
      "INSERT INTO projects VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at",
    ).run(
      project.id,
      project.profile_id,
      project.name,
      project.created_at,
      project.updated_at,
    );
  for (const tag of values.tags)
    db.query(
      "INSERT INTO tags VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name",
    ).run(tag.id, tag.profile_id, tag.name);
}

export function applyEvent(db: Database, event: Event | TaskHistoryRedacted) {
  putMetadata(db, metadata(event));
  applyChanges(db, changes(event));
  if (event.kind === "TaskHistoryRedacted") {
    for (const version of event.replay.versions)
      db.query(
        "INSERT INTO task_versions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET version=max(version,excluded.version)",
      ).run(version.id, version.version);
    for (const version of event.replay.series_versions)
      db.query(
        "INSERT INTO series_versions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET version=max(version,excluded.version)",
      ).run(version.id, version.version);
  }
}

export const Snapshot = Schema.Struct({
  tasks: Schema.Array(Task),
  series: Schema.Array(Series),
  projects: Schema.Array(Project),
  tags: Schema.Array(Tag),
  versions: Schema.Array(Schema.Struct({ id: TaskId, version: Version })),
  series_versions: Schema.Array(
    Schema.Struct({ id: SeriesId, version: Version }),
  ),
});

export function snapshot(db: Database) {
  return Schema.decodeUnknownSync(Snapshot)({
    tasks: readTasks(db),
    series: readSeries(db),
    projects: db.query("SELECT * FROM projects ORDER BY id").all(),
    tags: db.query("SELECT * FROM tags ORDER BY id").all(),
    series_versions: db
      .query("SELECT id,version FROM series_versions ORDER BY id")
      .all(),
    versions: db
      .query("SELECT id, version FROM task_versions ORDER BY id")
      .all(),
  });
}
