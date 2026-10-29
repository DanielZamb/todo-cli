PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entity_version INTEGER NOT NULL DEFAULT 1,
  row_version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  project TEXT,
  priority TEXT NOT NULL DEFAULT 'P3',
  scheduled_at TEXT,
  due_at TEXT,
  recurrence TEXT,
  energy INTEGER,
  estimate_min INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (status IN ('open','done','cancelled','snoozed')),
  CHECK (priority IN ('P1','P2','P3','P4')),
  CHECK (energy IS NULL OR (energy >= 1 AND energy <= 5)),
  CHECK (estimate_min IS NULL OR estimate_min > 0)
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (task_id, tag),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_due_at ON tasks(user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_user_scheduled_at ON tasks(user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_tasks_user_project ON tasks(user_id, project);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag);
CREATE INDEX IF NOT EXISTS idx_sessions_user_expires_at ON sessions(user_id, expires_at);
