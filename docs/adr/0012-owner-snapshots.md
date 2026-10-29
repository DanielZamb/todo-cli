# Owner Snapshots preserve a point in time and every Purge

A **Snapshot** is a point-in-time copy of the whole Todo database. Internal
`snapshots` rows and `OperationStore.takeSnapshot()` remain replay checkpoints.
Owner-facing operations live at `store.snapshots.create(reason)`, `list`, `show`,
`restore` and `prune`. No schema migration is needed.

Snapshots live beside the database in `snapshots/`, normally
`~/.todo-cli/snapshots`. The directory has mode 0700 and files have mode 0600.
SQLite's serialization API makes a consistent online copy under the domain's
writer transaction. A compacted SQLite file and JSON manifest contain the
creation time, schema version, operation seq, byte size, reason, SHA-256 and
Task counts per Profile. IDs select files; callers cannot supply file paths.

Before a migration, Profile Delete, Purge, import apply or restore, the caller
creates a pre-change Snapshot. The server's existing Effect scheduler creates
one daily Snapshot on the first wake each UTC date, including after a restart.
Retention defaults to seven daily buckets, four weekly buckets, and every
pre-change Snapshot for thirty days. A validated retention.json beside the
manifests can override daily, weekly and pre_change_days. Prune supports a dry
run and always retains the newest Snapshot.

Purge uses the same `redactTaskHistory` implementation on the live database and
every stored Snapshot. It compacts each copy and updates its manifest checksum.
A failed redaction stops the live Purge. Already redacted copies stay redacted.
Before restore, committed Purge task IDs are durably unioned into a content-free
journal outside the replaceable database. Restore applies that union to its
staged copy. Mutation validation and rejected History also use this union, so
an old Task ID cannot recreate purged content after restore. Restoring an old
Snapshot never discards the journal. Temporary
copies are private and removed after success or failure. A checksum mismatch
fails closed, including a crash between redaction and manifest replacement.

Restore verifies SHA-256 and SQLite integrity before staging a copy. It refuses
a newer schema and migrates an older schema forward in scratch. A dry run
reports Task counts for each Profile and the seq difference without writing.
Apply first creates a Snapshot of the current state, then replaces all database
content in one BEGIN IMMEDIATE transaction with foreign keys deferred. SQLite
commits the replacement atomically and rolls back every row on failure. It
keeps the live inode so existing connections cannot write a discarded database,
a failure mode of physical rename with open WAL connections. The writer lock
pauses all server and CLI writers during the replacement.

A durable restore generation changes in the same database transaction. SSE
sends a reload event on every connection and whenever that generation changes,
including a connection whose Last-Event-ID exceeds the restored seq. Clients
clear their cursor, cached Tasks and notification seq state before reloading.
The reload cursor is the DatabaseRestored boundary, so operations committed
before the next SSE poll still reach every authorized Profile stream.
Clients retain that boundary as the fallback cursor for inactive Profiles, so
switching Profile or restarting a client cannot replay historical reminders.
The scheduler recomputes work from the database every wake; restore cancels no
persistent timers because there are none. Diagnostics must reset generation
scoped caches when they observe the new generation.

All HTTP Snapshot operations require an owner Session. Both clients expose
Snapshots in Settings, show the loss report before Restore, and reveal the
selected file in Finder through their native host. Agent commands publish
schemas and JSON responses, and destructive operations support --dry-run.
