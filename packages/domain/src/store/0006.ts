export const attachmentMigrationSql = `
CREATE TABLE IF NOT EXISTS attachment_cleanup (
  profile_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  PRIMARY KEY(profile_id, task_id)
);
PRAGMA user_version=6;
`;
