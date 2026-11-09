import type { Database } from "bun:sqlite";
import { Schema } from "effect";
import { type DependencyChanges, Edge } from "../dependencies.ts";
import { Task } from "../entities.ts";
import type { ProfileId, TaskId } from "../ids.ts";
import type { Instant } from "../time.ts";

export const readEdges = (db: Database): readonly Edge[] =>
  Schema.decodeUnknownSync(Schema.Array(Edge))(
    db
      .query(
        "SELECT profile_id,dependent_id,blocker_id FROM task_dependencies ORDER BY profile_id,dependent_id,blocker_id",
      )
      .all(),
  );
export const edgeKey = (edge: Edge) =>
  JSON.stringify([edge.profile_id, edge.dependent_id, edge.blocker_id]);
export const putEdge = (db: Database, edge: Edge) =>
  db
    .query("INSERT INTO task_dependencies VALUES (?,?,?)")
    .run(edge.profile_id, edge.dependent_id, edge.blocker_id);
export function applyDependencyVersions(
  db: Database,
  dependencies: DependencyChanges,
) {
  for (const version of dependencies.versions) {
    db.query(
      "UPDATE tasks SET payload=json_set(payload,'$.row_version',?,'$.updated_at',?) WHERE id=?",
    ).run(version.to_version, version.updated_at, version.id);
    db.query(
      "INSERT INTO task_versions VALUES (?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version",
    ).run(version.id, version.to_version);
  }
}
export function incidentRemoval(
  db: Database,
  task: Task,
  occurredAt: Instant,
): DependencyChanges {
  const removed = incidentEdges(db, task.profile_id, task.id);
  const ids = [...new Set(removed.map((edge) => edge.dependent_id))]
    .filter((id) => id !== task.id)
    .sort();
  return {
    added: [],
    removed,
    versions: ids.map((id) => {
      const row = db
        .query<{ payload: string }, [string]>(
          "SELECT payload FROM tasks WHERE id=?",
        )
        .get(id);
      if (!row) throw new Error("Dependency endpoint missing");
      const current = Schema.decodeUnknownSync(Task)(JSON.parse(row.payload));
      return {
        id,
        from_version: current.row_version,
        to_version: Schema.decodeUnknownSync(Task.fields.row_version)(
          current.row_version + 1,
        ),
        updated_at: occurredAt,
      };
    }),
  };
}
export const upstream = (
  db: Database,
  profile: ProfileId,
  id: TaskId,
): TaskId[] =>
  db
    .query<{ blocker_id: string }, [string, string]>(
      "SELECT blocker_id FROM task_dependencies WHERE profile_id=? AND dependent_id=? ORDER BY blocker_id",
    )
    .all(profile, id)
    .map((row) =>
      Schema.decodeUnknownSync(Edge.fields.blocker_id)(row.blocker_id),
    );
export const hasDependents = (db: Database, profile: ProfileId, id: TaskId) =>
  db
    .query(
      "SELECT 1 FROM task_dependencies WHERE profile_id=? AND blocker_id=? LIMIT 1",
    )
    .get(profile, id) !== null;

export const incidentEdges = (
  db: Database,
  profile: ProfileId,
  id: TaskId,
): readonly Edge[] =>
  Schema.decodeUnknownSync(Schema.Array(Edge))(
    db
      .query(
        "SELECT * FROM task_dependencies WHERE profile_id=? AND dependent_id=? UNION SELECT * FROM task_dependencies WHERE profile_id=? AND blocker_id=? ORDER BY profile_id,dependent_id,blocker_id",
      )
      .all(profile, id, profile, id),
  );
