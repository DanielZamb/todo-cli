---
status: accepted (supersedes ADR-0004)
---

# The operation log is the source of truth; task tables are a projection

Modeled on Cursor's Continuity WAL (https://cursor.com/blog/git-at-any-scale): durable log first, materialized state as a rebuildable cache. Every change attempt is appended to an `op_log` table in the same SQLite file, with a monotonically increasing `seq`, the actor, the Profile, the event payload (resolved facts, not the raw command), `from_version`/`to_version`, and an `outcome` of `committed` or `rejected` plus a reason code. A committed op and its effect on the `tasks`/`task_tags` projection are written in one transaction. The version check is our compare-and-swap, the same role as CAS on Continuity's WAL index. A rejected attempt (conflict, validation, auth) is appended in its own short transaction after the failed one rolls back, so failures stay visible without ever being replayed. SSE streams committed ops by `seq`. The projection can be dropped and rebuilt by replay, history can be inspected at any point, and a change can be reverted by appending its inverse. Periodic snapshots bound replay cost, like Continuity's compaction. This replaces the trigger-fed `change_log` of ADR-0004. Because state is now derived, nothing may write the projection tables except the domain package. Guard triggers reject direct writes. The Go binary is retired at migration 0002, not kept as a read-only tool.

## Consequences

- Entries record resolved events, not commands. Replay never re-runs RRULE expansion or reads the clock, so it gives the same result after code changes. Event payloads are versioned with Effect Schema, which is what `entity_version` is for.
- The log stays inside SQLite so each operation is one atomic transaction. The event format is self-contained, so exporting log segments for future sync is a projection of the log, not a redesign.
