# Task references during Purge

The compiled CLI drive records `task-reference-schema.json` by querying
`PRAGMA table_xinfo` and `PRAGMA foreign_key_list` for every SQLite table.
The behavior test pins the declared Task references and adds a future reference
with an unfamiliar table and column name. Redaction must discover it without
an allowlist, even with foreign keys off or the Task already absent.

A Snapshot retains its point-in-time History, Versions and unrelated Tasks.
Applying a later Purge removes the target's content and materialized relations.
Content-free structural ids in History, Version tombstones and the durable Purge
journal remain under ADR-0008 and ADR-0018. They are not dangling entity rows.

| Storage or reference | Live Purge | Copy before fix | Copy after fix and restore |
| --- | --- | --- | --- |
| `tasks.id`, payload and generated columns | Task gone | Task gone | Task gone |
| `task_tags.task_id` foreign key | Cascades away | Orphan survives; restore exits 2, including when its Tag definition also disappeared | Explicit schema-discovered deletion; restore exits 0 |
| `task_dependencies.dependent_id` and `blocker_id`, composite foreign keys with Profile | Delete removes incident edges; Purge removes zero live edges | Already explicitly deleted on this branch; base Dependency controls pass | Same removal through schema discovery; both endpoint roles repaired even if Task absent; other Tasks and their saved Versions stay |
| `attachment_cleanup.task_id`, undeclared | Queued until copied bytes are erased after commit, then gone | Pending row can survive in an earlier copy | Only Purged ids removed from copies; live cleanup queue still drives erasure |
| Attachment references in Task and History JSON | Task gone; paths and labels redacted; copied images erased; external files kept | Same | Same, proven by Snapshot Attachment proof and verify-attachments |
| `series.payload.task`, legacy Series keyed by Task id | Exclusive Series removed; shared Series retained for other Occurrences | Same | Same; recurring CLI case restores without its exclusive Series |
| Occurrences in Task payload and replay facts | Purged Occurrence removed, other Occurrences retained | Same | Same; checkpoint and full replay controls retained |
| `tasks.external_id` and its generated unique index | Gone with Task | Same | Same; compiled metadata case checks rows and bytes |
| Due and scheduled times in Task payload, scheduler work | Gone; work derived from remaining Tasks | Same | Same; compiled metadata case and reminder/checkpoint test |
| `op_log.event` ReminderFired receipts | Content redacted; structural History retained | Same | Same; no reminder returns after restore or rebuild |
| Other `op_log.event` Task snapshots, rejected inputs, Dependency deltas, Move/Copy provenance | Target content redacted; operation structure and surviving Task facts retained | Same | Same; no title bytes and replay still excludes target |
| Internal `snapshots.payload` replay checkpoints | Target Task, exclusive metadata and incident edges removed | Same | Same; rebuild after restore still excludes target |
| `task_versions.id`, `series_versions.id` | Content-free Version tombstones remain | Same, at saved Versions | Same; they intentionally do not reference an extant Task |
| Projects and Tags | Exclusive definitions removed; shared definitions retained | Same, but stale Tag links remain | Definitions unchanged; stale links gone |
| Search indexes and memo | No SQLite search table; store memo cleared on Purge | No memo in copy | Restore clears store memo; no persisted search rows |
| Owner, credentials, Profiles, Profile tombstones, SQLite sequences | No Task references | No Task references | Unchanged rules |

Only `task_tags` and `task_dependencies` declare Task foreign keys in schema 7.
Other tables inspected are `attachment_cleanup`, `credentials`, `op_log`,
`owner`, `profile_deletions`, `profiles`, `projects`, `series`, `series_versions`,
`snapshots`, `sqlite_sequence`, `tags`, `task_versions` and `tasks`.
The column audit also inspects JSON schemas and the scheduled-work queries;
SQLite cannot detect references inside payloads.

`test/snapshot-purge.test.ts` refuses an unexplained orphan after a successful
repair of orphan Tags, both Dependency directions and a pending Attachment row.
It preserves another pending Attachment row in the stored copy. A corrupt
checksum still stops Purge. Existing Snapshot tests cover the live inode,
second connections, untouched Profiles and durable-journal replay.
