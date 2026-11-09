export const dependencyMigrationSql = `
CREATE UNIQUE INDEX IF NOT EXISTS tasks_profile_id_id ON tasks(profile_id, id);
CREATE TABLE IF NOT EXISTS task_dependencies (
  profile_id TEXT NOT NULL,
  dependent_id TEXT NOT NULL,
  blocker_id TEXT NOT NULL,
  PRIMARY KEY (profile_id, dependent_id, blocker_id),
  CHECK (dependent_id <> blocker_id),
  FOREIGN KEY (profile_id, dependent_id) REFERENCES tasks(profile_id, id),
  FOREIGN KEY (profile_id, blocker_id) REFERENCES tasks(profile_id, id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS task_dependencies_blocker
  ON task_dependencies(profile_id, blocker_id, dependent_id);
CREATE TRIGGER IF NOT EXISTS task_dependencies_domain_insert
BEFORE INSERT ON task_dependencies WHEN domain_write_allowed() != 1
BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER IF NOT EXISTS task_dependencies_domain_update
BEFORE UPDATE ON task_dependencies WHEN domain_write_allowed() != 1
BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER IF NOT EXISTS task_dependencies_domain_delete
BEFORE DELETE ON task_dependencies WHEN domain_write_allowed() != 1
BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
PRAGMA user_version = 7;
`;
