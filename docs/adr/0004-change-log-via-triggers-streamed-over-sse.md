---
status: superseded by ADR-0007
---

# Change log filled by SQLite triggers, streamed over SSE

Every insert, update and delete on tasks and tags is recorded in a `change_log` table with a monotonically increasing `seq`. SQLite triggers write these rows, not application code, so every writer is captured: the CLI, the server, the legacy Go binary, or a manual `sqlite3` session. The server tails the log and pushes changes to clients over SSE, using `seq` as the event id so a reconnecting client resumes exactly where it stopped. We chose SSE over WebSockets because clients only listen, and writes go over plain HTTP. Deletes are soft (`deleted_at`) so they appear in the log as tombstones. The database runs in WAL mode.
