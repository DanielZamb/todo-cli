PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE profiles (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO profiles VALUES('personal','Personal','2026-10-01T08:00:00.000Z','2026-10-01T08:00:00.000Z');
INSERT INTO profiles VALUES('work','Work','2026-10-01T08:00:00.000Z','2026-10-01T08:00:00.000Z');
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
INSERT INTO op_log VALUES(1,'migration:0002','work',1,'{"entity_version":1,"occurred_at":"2026-10-26T12:00:00.000Z","kind":"TaskCreated","task":{"title":"Ship the port","description":"Preserve metadata","project_id":"[\"work\",\"project\",\"Port\"]","priority":"P1","scheduled_at":{"kind":"instant","utc":"2026-10-27T14:00:00.000Z","time_zone":"UTC"},"due_at":{"kind":"instant","utc":"2026-10-28T00:00:00.000Z","time_zone":"UTC"},"energy":4,"estimate_min":45,"source":"agent","tags":["[\"work\",\"tag\",\"focus\"]","[\"work\",\"tag\",\"port\"]"],"id":"legacy-1","profile_id":"work","entity_version":1,"row_version":7,"status":"open","occurrence":null,"created_at":"2026-10-01T08:00:00.000Z","updated_at":"2026-10-26T12:00:00.000Z","completed_at":null,"deleted_at":null},"series":{"id":"legacy-series:legacy-1","profile_id":"work","entity_version":1,"row_version":7,"recurrence":{"dtstart":{"kind":"instant","utc":"2026-10-27T14:00:00.000Z","time_zone":"UTC"},"rrule":"FREQ=DAILY","exdate":[]},"task":{"title":"Ship the port","description":"Preserve metadata","project_id":"[\"work\",\"project\",\"Port\"]","priority":"P1","scheduled_at":{"kind":"instant","utc":"2026-10-27T14:00:00.000Z","time_zone":"UTC"},"due_at":{"kind":"instant","utc":"2026-10-28T00:00:00.000Z","time_zone":"UTC"},"energy":4,"estimate_min":45,"source":"agent","tags":["[\"work\",\"tag\",\"focus\"]","[\"work\",\"tag\",\"port\"]"]},"created_at":"2026-10-01T08:00:00.000Z","updated_at":"2026-10-26T12:00:00.000Z","deleted_at":null},"project":{"id":"[\"work\",\"project\",\"Port\"]","profile_id":"work","name":"Port","created_at":"2026-10-01T08:00:00.000Z","updated_at":"2026-10-26T12:00:00.000Z"},"tags":[{"id":"[\"work\",\"tag\",\"focus\"]","profile_id":"work","name":"focus"},{"id":"[\"work\",\"tag\",\"port\"]","profile_id":"work","name":"port"}]}',NULL,7,'committed',NULL);
INSERT INTO op_log VALUES(2,'migration:0002','personal',1,'{"entity_version":1,"occurred_at":"2026-10-03T08:00:00.000Z","kind":"TaskCreated","task":{"title":"Buy tea","description":null,"project_id":null,"priority":"P3","scheduled_at":null,"due_at":null,"energy":null,"estimate_min":null,"source":"manual","tags":["[\"personal\",\"tag\",\"home\"]"],"id":"legacy-2","profile_id":"personal","entity_version":1,"row_version":2,"status":"done","occurrence":null,"created_at":"2026-10-02T08:00:00.000Z","updated_at":"2026-10-03T08:00:00.000Z","completed_at":"2026-10-03T08:00:00.000Z","deleted_at":null},"series":null,"project":null,"tags":[{"id":"[\"personal\",\"tag\",\"home\"]","profile_id":"personal","name":"home"}]}',NULL,2,'committed',NULL);
CREATE TABLE snapshots (
  seq INTEGER PRIMARY KEY REFERENCES op_log(seq),
  entity_version INTEGER NOT NULL CHECK(entity_version = 1),
  payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE TABLE projects (
    id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
    name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(profile_id, name)
  );
INSERT INTO projects VALUES('["work","project","Port"]','work','Port','2026-10-01T08:00:00.000Z','2026-10-26T12:00:00.000Z');
CREATE TABLE tags (
    id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
    name TEXT NOT NULL, UNIQUE(profile_id, name)
  );
INSERT INTO tags VALUES('["work","tag","focus"]','work','focus');
INSERT INTO tags VALUES('["work","tag","port"]','work','port');
INSERT INTO tags VALUES('["personal","tag","home"]','personal','home');
CREATE TABLE tasks (
    id TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload) AND id = json_extract(payload, '$.id')),
    profile_id TEXT GENERATED ALWAYS AS (json_extract(payload, '$.profile_id')) STORED,
entity_version INTEGER GENERATED ALWAYS AS (json_extract(payload, '$.entity_version')) STORED,
row_version INTEGER GENERATED ALWAYS AS (json_extract(payload, '$.row_version')) STORED,
title TEXT GENERATED ALWAYS AS (json_extract(payload, '$.title')) STORED,
description TEXT GENERATED ALWAYS AS (json_extract(payload, '$.description')) STORED,
status TEXT GENERATED ALWAYS AS (json_extract(payload, '$.status')) STORED,
project_id TEXT GENERATED ALWAYS AS (json_extract(payload, '$.project_id')) STORED,
priority TEXT GENERATED ALWAYS AS (json_extract(payload, '$.priority')) STORED,
scheduled_at TEXT GENERATED ALWAYS AS (json_extract(payload, '$.scheduled_at')) STORED,
due_at TEXT GENERATED ALWAYS AS (json_extract(payload, '$.due_at')) STORED,
energy INTEGER GENERATED ALWAYS AS (json_extract(payload, '$.energy')) STORED,
estimate_min INTEGER GENERATED ALWAYS AS (json_extract(payload, '$.estimate_min')) STORED,
source TEXT GENERATED ALWAYS AS (json_extract(payload, '$.source')) STORED,
occurrence TEXT GENERATED ALWAYS AS (json_extract(payload, '$.occurrence')) STORED,
created_at TEXT GENERATED ALWAYS AS (json_extract(payload, '$.created_at')) STORED,
updated_at TEXT GENERATED ALWAYS AS (json_extract(payload, '$.updated_at')) STORED,
completed_at TEXT GENERATED ALWAYS AS (json_extract(payload, '$.completed_at')) STORED,
deleted_at TEXT GENERATED ALWAYS AS (json_extract(payload, '$.deleted_at')) STORED,
    PRIMARY KEY(id), FOREIGN KEY(profile_id) REFERENCES profiles(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
  );
INSERT INTO tasks VALUES('legacy-1','{"title":"Ship the port","description":"Preserve metadata","project_id":"[\"work\",\"project\",\"Port\"]","priority":"P1","scheduled_at":{"kind":"instant","utc":"2026-10-27T14:00:00.000Z","time_zone":"UTC"},"due_at":{"kind":"instant","utc":"2026-10-28T00:00:00.000Z","time_zone":"UTC"},"energy":4,"estimate_min":45,"source":"agent","tags":["[\"work\",\"tag\",\"focus\"]","[\"work\",\"tag\",\"port\"]"],"id":"legacy-1","profile_id":"work","entity_version":1,"row_version":7,"status":"open","occurrence":null,"created_at":"2026-10-01T08:00:00.000Z","updated_at":"2026-10-26T12:00:00.000Z","completed_at":null,"deleted_at":null}');
INSERT INTO tasks VALUES('legacy-2','{"title":"Buy tea","description":null,"project_id":null,"priority":"P3","scheduled_at":null,"due_at":null,"energy":null,"estimate_min":null,"source":"manual","tags":["[\"personal\",\"tag\",\"home\"]"],"id":"legacy-2","profile_id":"personal","entity_version":1,"row_version":2,"status":"done","occurrence":null,"created_at":"2026-10-02T08:00:00.000Z","updated_at":"2026-10-03T08:00:00.000Z","completed_at":"2026-10-03T08:00:00.000Z","deleted_at":null}');
CREATE TABLE task_tags (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id), PRIMARY KEY(task_id, tag_id)
  );
INSERT INTO task_tags VALUES('legacy-1','["work","tag","focus"]');
INSERT INTO task_tags VALUES('legacy-1','["work","tag","port"]');
INSERT INTO task_tags VALUES('legacy-2','["personal","tag","home"]');
CREATE TABLE series (
    id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload))
  );
INSERT INTO series VALUES('legacy-series:legacy-1','{"id":"legacy-series:legacy-1","profile_id":"work","entity_version":1,"row_version":7,"recurrence":{"dtstart":{"kind":"instant","utc":"2026-10-27T14:00:00.000Z","time_zone":"UTC"},"rrule":"FREQ=DAILY","exdate":[]},"task":{"title":"Ship the port","description":"Preserve metadata","project_id":"[\"work\",\"project\",\"Port\"]","priority":"P1","scheduled_at":{"kind":"instant","utc":"2026-10-27T14:00:00.000Z","time_zone":"UTC"},"due_at":{"kind":"instant","utc":"2026-10-28T00:00:00.000Z","time_zone":"UTC"},"energy":4,"estimate_min":45,"source":"agent","tags":["[\"work\",\"tag\",\"focus\"]","[\"work\",\"tag\",\"port\"]"]},"created_at":"2026-10-01T08:00:00.000Z","updated_at":"2026-10-26T12:00:00.000Z","deleted_at":null}');
CREATE TABLE task_versions (id TEXT PRIMARY KEY, version INTEGER NOT NULL);
INSERT INTO task_versions VALUES('legacy-1',7);
INSERT INTO task_versions VALUES('legacy-2',2);
CREATE TABLE series_versions (id TEXT PRIMARY KEY, version INTEGER NOT NULL);
INSERT INTO series_versions VALUES('legacy-series:legacy-1',7);
INSERT INTO sqlite_sequence VALUES('op_log',2);
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
CREATE TRIGGER tasks_domain_insert BEFORE INSERT ON tasks
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER tasks_domain_update BEFORE UPDATE ON tasks
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER tasks_domain_delete BEFORE DELETE ON tasks
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER task_tags_domain_insert BEFORE INSERT ON task_tags
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER task_tags_domain_update BEFORE UPDATE ON task_tags
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER task_tags_domain_delete BEFORE DELETE ON task_tags
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER series_domain_insert BEFORE INSERT ON series
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER series_domain_update BEFORE UPDATE ON series
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER series_domain_delete BEFORE DELETE ON series
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER task_versions_domain_insert BEFORE INSERT ON task_versions
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER task_versions_domain_update BEFORE UPDATE ON task_versions
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER task_versions_domain_delete BEFORE DELETE ON task_versions
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER series_versions_domain_insert BEFORE INSERT ON series_versions
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER series_versions_domain_update BEFORE UPDATE ON series_versions
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER series_versions_domain_delete BEFORE DELETE ON series_versions
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER projects_domain_insert BEFORE INSERT ON projects
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER projects_domain_update BEFORE UPDATE ON projects
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER projects_domain_delete BEFORE DELETE ON projects
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER tags_domain_insert BEFORE INSERT ON tags
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER tags_domain_update BEFORE UPDATE ON tags
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE TRIGGER tags_domain_delete BEFORE DELETE ON tags
        WHEN domain_write_allowed() != 1
        BEGIN SELECT RAISE(ABORT, 'domain writes only'); END;
CREATE INDEX op_log_profile_seq ON op_log(profile, seq);
CREATE INDEX tasks_profile_status ON tasks(profile_id, status);
CREATE INDEX tasks_profile_due ON tasks(profile_id, due_at);
COMMIT;
PRAGMA user_version=2;
