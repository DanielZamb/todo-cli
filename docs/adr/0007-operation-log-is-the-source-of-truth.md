---
status: accepted (supersedes ADR-0004)
---

# The operation log is the source of truth; task tables are a projection

Modeled on Cursor's Continuity WAL (https://cursor.com/blog/git-at-any-scale): durable log first, materialized state as a rebuildable cache. Every change attempt is appended to an `op_log` table in the same SQLite file, with a monotonically increasing `seq`, the actor, the Profile, the event payload (resolved facts, not the raw command), `from_version`/`to_version`, and an `outcome` of `committed` or `rejected` plus a reason code. A committed op and its effect on the `tasks`/`task_tags` projection are written in one transaction. The version check is our compare-and-swap, the same role as CAS on Continuity's WAL index. A rejected attempt (conflict, validation, auth) is appended in its own short transaction after the failed one rolls back, so failures stay visible without ever being replayed. SSE streams committed ops by `seq`. The projection can be dropped and rebuilt by replay, history can be inspected at any point, and a change can be reverted by appending its inverse. Periodic snapshots bound replay cost, like Continuity's compaction. This replaces the trigger-fed `change_log` of ADR-0004. Because state is now derived, nothing may write the projection tables except the domain package. Guard triggers reject direct writes. The Go binary is retired at migration 0002, not kept as a read-only tool.

## Consequences

- Entries record resolved events, not commands. Replay never re-runs RRULE expansion or reads the clock, so it gives the same result after code changes. Event payloads are versioned with Effect Schema, which is what `entity_version` is for.
- The log stays inside SQLite so each operation is one atomic transaction. The event format is self-contained, so exporting log segments for future sync is a projection of the log, not a redesign.

## Amendment (2026-11-05): rejected attempts are bounded

A security review found that anything able to reach the store could grow the log without limit. A local process can retry a refused sign-in or a forged credential forever, and a credential holder can submit a 20 MB title that is refused but still recorded. Rejected rows are never pruned and every Snapshot copies them. Two rules now bound what a rejection adds:

- A repeated rejected auth attempt, with the same actor, Profile, action and detail, is appended once per minute. Later repeats in that minute add nothing. The first row stands for all of them, and a different actor, Profile, action or detail still gets its own row. The log stays append-only: no row is updated or deleted.
- A rejected Task attempt records its received input only up to 32,768 characters of JSON. Anything larger is recorded as `{ truncated: true, characters }` with no preview, because Purge could not find a Task's content inside one. A refused input's Task id is copied into the event only if it has at most 200 characters.

Inputs are also capped before they reach the log. These limits are part of the HttpApi contract (`packages/domain/src/limits.ts`): title 1,000 characters, description 100,000, Project, Tag and Attachment names 200, external id 1,000, file paths 4,096, URLs 8,192, 100 Tags or Attachments per Task, and 1,000 items per batch edit, import or attach-many request. Times are limited to 128 characters of JSON, and submitted Task and Attachment ids to 200. The store also refuses a commit that grows a Task past 100 Tags or Attachments, because comma-separated names and repeated attach groups add up. Stored entities are not limited, so rows written earlier still decode, and a Task already past a list limit may keep but not grow it.

Rejected alternatives: counting repeats in the existing row, which needs an `UPDATE` that the append-only triggers forbid. A separate mutable counter table, which adds a migration and per-minute rows anyway, only to keep a count. Not recording rejections without a credential, which leaves no trace of probing. Pruning old rejected rows, which punches holes in `seq` that ADR-0008 avoids.
