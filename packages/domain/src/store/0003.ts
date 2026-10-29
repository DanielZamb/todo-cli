export const authMigrationSql = `
CREATE TABLE op_log_v3 (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL, profile TEXT REFERENCES profiles(id),
  entity_version INTEGER NOT NULL,
  event TEXT NOT NULL CHECK(json_valid(event)),
  from_version INTEGER, to_version INTEGER,
  outcome TEXT NOT NULL CHECK(outcome IN ('committed','rejected')),
  reason TEXT,
  CHECK ((outcome = 'committed' AND reason IS NULL) OR
         (outcome = 'rejected' AND length(reason) > 0))
);
INSERT INTO op_log_v3 SELECT * FROM op_log;
CREATE TEMP TABLE saved_snapshots AS SELECT * FROM snapshots;
DROP TABLE snapshots;
DROP TABLE op_log;
ALTER TABLE op_log_v3 RENAME TO op_log;
CREATE INDEX op_log_profile_seq ON op_log(profile, seq);
CREATE TABLE snapshots (
  seq INTEGER PRIMARY KEY REFERENCES op_log(seq),
  entity_version INTEGER NOT NULL CHECK(entity_version = 1),
  payload TEXT NOT NULL CHECK(json_valid(payload))
);
INSERT INTO snapshots SELECT * FROM saved_snapshots;
DROP TABLE saved_snapshots;
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
CREATE TABLE owner (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  passphrase_hash TEXT NOT NULL
);
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('session','token')),
  secret_hash TEXT NOT NULL UNIQUE,
  name TEXT UNIQUE,
  profile TEXT REFERENCES profiles(id),
  scope TEXT NOT NULL CHECK(scope IN ('read-only','read-write')),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT,
  CHECK(kind = 'token' OR (name IS NULL AND profile IS NULL AND scope = 'read-write')),
  CHECK(kind = 'session' OR length(name) > 0)
);
PRAGMA user_version=3;
`;
