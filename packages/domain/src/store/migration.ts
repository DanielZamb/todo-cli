import type { Database } from "bun:sqlite";
import { Schema } from "effect";
import { Profile, Project, Series, Tag, Task } from "../entities.ts";
import { Event } from "../events.ts";
import { migrationSql } from "./0002.ts";
import { authMigrationSql } from "./0003.ts";
import { profileMigrationSql } from "./0004.ts";
import { migrateExternalId } from "./0005.ts";
import { attachmentMigrationSql } from "./0006.ts";
import { applyEvent, createProjection } from "./projection.ts";

const LegacyProfile = Schema.Struct({
  id: Schema.String,
  username: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
});
const LegacyTask = Schema.Struct({
  id: Schema.String,
  user_id: Schema.String,
  entity_version: Schema.Number,
  row_version: Schema.Number,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  status: Schema.String,
  project: Schema.NullOr(Schema.String),
  priority: Schema.String,
  scheduled_at: Schema.NullOr(Schema.String),
  due_at: Schema.NullOr(Schema.String),
  recurrence: Schema.NullOr(Schema.String),
  energy: Schema.NullOr(Schema.Number),
  estimate_min: Schema.NullOr(Schema.Number),
  source: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  completed_at: Schema.NullOr(Schema.String),
});
const LegacyTag = Schema.Struct({ task_id: Schema.String, tag: Schema.String });
const utc = (value: string) => new Date(value).toISOString();
const legacyTime = (value: string | null) =>
  value === null
    ? null
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? { kind: "date", date: value }
      : { kind: "instant", utc: utc(value), time_zone: "UTC" };

export const currentSchemaVersion = 6;
const externalIdMigrationBaseVersions = [4];
const attachmentMigrationBaseVersions = [5];

export function migrate(db: Database): void {
  const version = db
    .query<{ user_version: number }, []>("PRAGMA user_version")
    .get()?.user_version;
  if (version === currentSchemaVersion) return;
  if (attachmentMigrationBaseVersions.includes(version ?? -1)) {
    db.exec(attachmentMigrationSql);
    return;
  }
  if (externalIdMigrationBaseVersions.includes(version ?? -1)) {
    migrateExternalId(db);
    migrate(db);
    return;
  }
  if (version === 3) {
    db.exec(profileMigrationSql);
    migrate(db);
    return;
  }
  if (version === 2) {
    db.exec(authMigrationSql);
    migrate(db);
    return;
  }
  if (version !== 0 && version !== 1)
    throw new Error(`Unsupported database version ${version}`);
  const tables = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all()
    .map((row) => row.name);
  const legacy = tables.includes("users");
  if (!legacy && tables.length > 0)
    throw new Error("Unrecognized database schema");
  const profiles = legacy
    ? Schema.decodeUnknownSync(Schema.Array(LegacyProfile))(
        db.query("SELECT * FROM users ORDER BY id").all(),
      )
    : [];
  const tasks = legacy
    ? Schema.decodeUnknownSync(Schema.Array(LegacyTask))(
        db.query("SELECT * FROM tasks ORDER BY id").all(),
      )
    : [];
  const tags = legacy
    ? Schema.decodeUnknownSync(Schema.Array(LegacyTag))(
        db.query("SELECT * FROM task_tags ORDER BY task_id,tag").all(),
      )
    : [];
  if (legacy)
    db.exec(
      "DROP TABLE task_tags; DROP TABLE tasks; DROP TABLE sessions; DROP TABLE users;",
    );
  db.exec(migrationSql);
  createProjection(db);
  for (const old of profiles) {
    const profile = Schema.decodeUnknownSync(Profile)({
      id: old.id,
      name: old.username,
      created_at: utc(old.created_at),
      updated_at: utc(old.updated_at),
    });
    db.query("INSERT INTO profiles VALUES (?,?,?,?)").run(
      profile.id,
      profile.name,
      profile.created_at,
      profile.updated_at,
    );
  }
  for (const old of tasks) {
    const projectId = old.project
      ? JSON.stringify([old.user_id, "project", old.project])
      : null;
    const project =
      projectId === null
        ? null
        : Schema.decodeUnknownSync(Project)(
            db.query("SELECT * FROM projects WHERE id=?").get(projectId) ?? {
              id: projectId,
              profile_id: old.user_id,
              name: old.project,
              created_at: utc(old.created_at),
              updated_at: utc(old.updated_at),
            },
          );
    const taskTags = tags
      .filter((tag) => tag.task_id === old.id)
      .map((tag) => {
        const value = Schema.decodeUnknownSync(Tag)({
          id: JSON.stringify([old.user_id, "tag", tag.tag]),
          profile_id: old.user_id,
          name: tag.tag,
        });
        return value;
      });
    const seriesId = old.recurrence ? `legacy-series:${old.id}` : null;
    const task = Schema.decodeUnknownSync(Task)({
      ...old,
      profile_id: old.user_id,
      project_id: projectId,
      scheduled_at: legacyTime(old.scheduled_at),
      due_at: legacyTime(old.due_at),
      created_at: utc(old.created_at),
      updated_at: utc(old.updated_at),
      completed_at: old.completed_at === null ? null : utc(old.completed_at),
      deleted_at: null,
      tags: taskTags.map((tag) => tag.id),
      occurrence: null,
    });
    const series =
      seriesId === null
        ? null
        : Schema.decodeUnknownSync(Series)({
            id: seriesId,
            profile_id: task.profile_id,
            entity_version: 1,
            row_version: task.row_version,
            recurrence: {
              dtstart: task.scheduled_at ??
                task.due_at ?? {
                  kind: "instant",
                  utc: task.created_at,
                  time_zone: "UTC",
                },
              rrule: old.recurrence,
              exdate: [],
            },
            task,
            created_at: task.created_at,
            updated_at: task.updated_at,
            deleted_at: null,
          });
    const event = Schema.decodeUnknownSync(Event)({
      kind: "TaskCreated",
      entity_version: 1,
      occurred_at: task.updated_at,
      task,
      series,
      project,
      tags: taskTags,
    });
    db.query(
      "INSERT INTO op_log(actor,profile,entity_version,event,from_version,to_version,outcome,reason) VALUES ('migration:0002',?,1,?,NULL,?,'committed',NULL)",
    ).run(task.profile_id, JSON.stringify(event), task.row_version);
    applyEvent(db, event);
  }
  db.exec("PRAGMA user_version=2");
  migrate(db);
}
