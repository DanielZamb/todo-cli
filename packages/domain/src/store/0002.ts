export const migrationSql = `CREATE TABLE profiles (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE op_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL, profile TEXT NOT NULL REFERENCES profiles(id),
  entity_version INTEGER NOT NULL,
  event TEXT NOT NULL CHECK(json_valid(event)),
  from_version INTEGER, to_version INTEGER,
  outcome TEXT NOT NULL CHECK(outcome IN ('committed','rejected')),
  reason TEXT,
  CHECK ((outcome = 'committed' AND reason IS NULL) OR
         (outcome = 'rejected' AND length(reason) > 0))
);
CREATE INDEX op_log_profile_seq ON op_log(profile, seq);
CREATE TABLE snapshots (
  seq INTEGER PRIMARY KEY REFERENCES op_log(seq),
  entity_version INTEGER NOT NULL CHECK(entity_version = 1),
  payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE TRIGGER op_log_no_update BEFORE UPDATE ON op_log
BEGIN SELECT RAISE(ABORT, 'op_log is append-only'); END;
CREATE TRIGGER op_log_no_delete BEFORE DELETE ON op_log
BEGIN SELECT RAISE(ABORT, 'op_log is append-only'); END;
CREATE TRIGGER op_log_domain_insert BEFORE INSERT ON op_log
WHEN domain_write_allowed() != 1
BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER snapshots_no_update BEFORE UPDATE ON snapshots
BEGIN SELECT RAISE(ABORT, 'snapshots are immutable'); END;
CREATE TRIGGER snapshots_domain_insert BEFORE INSERT ON snapshots
WHEN domain_write_allowed() != 1
BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
`;
