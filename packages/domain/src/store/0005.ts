import type { Database } from "bun:sqlite";

export function migrateExternalId(db: Database) {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_xinfo(tasks)")
    .all();
  if (!columns.some((column) => column.name === "external_id"))
    db.exec(
      "ALTER TABLE tasks ADD COLUMN external_id TEXT GENERATED ALWAYS AS (json_extract(payload, '$.external_id')) VIRTUAL",
    );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS tasks_profile_external_id ON tasks(profile_id, external_id) WHERE external_id IS NOT NULL; PRAGMA user_version=5",
  );
}
