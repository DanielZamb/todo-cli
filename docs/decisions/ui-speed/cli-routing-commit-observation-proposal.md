# Connection commit observation proposal, not taken

The coordinator rejected this proposal on 2026-11-13. No observer or TEMP trigger
was applied. Writing commands nudge unconditionally after reaching the store.

2026-11-13. Paused before changing pinned source, as required by the coordinator.
The reviewed server integration is merged at
`aefb4603e746f4b3edd91062af2ea37fe2d6ff3f`. This document proposes code;
none of the code below is applied or claimed verified.

S3 needs evidence from the command's own connection, including Profile creation,
committed prefixes before a later failure, and commits during store construction.
History sequence and restore generation miss Profile creation. A second connection
cannot attribute a commit to this command. SQLite total_changes counts rolled-back
changes, so it cannot alone establish that a write committed.

I propose a connection-local, rollback-aware marker implemented with TEMP triggers.
Install it only for a direct CLI command with a proved server, immediately after
opening the connection and before the constructor's first transaction. A TEMP
trigger on each application table inserts one marker row on INSERT, UPDATE or
DELETE. The marker rolls back with its originating write. A previously committed
marker survives a later rolled-back batch element. TEMP triggers are local to
this connection; another process cannot set this marker. No History row or main
schema object is added. Closing the store discards the TEMP schema.

The marker stays boolean for the invocation. It records whether any write
committed, not a count of transactions. The CLI sends one nudge for that invocation.
Snapshot file-only success retains its existing separate observation.

## Exact proposed pinned-source edits

In `packages/domain/src/store/store.ts`, add an import:

```ts
import { observeConnectionCommits } from "./connection-commits.ts";
```

Add this field next to `private readonly db: Database`:

```ts
private readonly directCommits?: ReturnType<typeof observeConnectionCommits>;
```

Add `readonly observeCommits?: boolean` to the options type accepted by both
`OperationStore.constructor` and `openStore`. In the constructor's existing
`try` block, before `this.db.function("domain_write_allowed", ...)`, insert:

```ts
if (options.observeCommits)
  this.directCommits = observeConnectionCommits(this.db);
```

Add this public observation alongside `settings`:

```ts
readonly committedDirectWrite = () =>
  attempt(() => this.directCommits?.changed() ?? false);
```

These are the complete proposed edits to the pinned file. The constructor maps
to Init, so this requires mapping review before implementation and qualification.
The modeled transaction, validation, append, rejection and replay bodies would
not change. No pin would be renewed merely to make its hash check pass.

## Proposed new helper

New `packages/domain/src/store/connection-commits.ts` would contain:

```ts
import type { Database } from "bun:sqlite";

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function observeConnectionCommits(db: Database) {
  db.exec(
    "CREATE TEMP TABLE todo_cli_commit_seen(singleton INTEGER PRIMARY KEY CHECK(singleton=1)) WITHOUT ROWID",
  );
  const tables = db
    .query<{ name: string }, []>(
      "SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  for (const [index, table] of tables.entries()) {
    for (const event of ["INSERT", "UPDATE", "DELETE"] as const) {
      db.exec(
        `CREATE TEMP TRIGGER ${quote(`todo_cli_commit_${index}_${event}`)} AFTER ${event} ON main.${quote(table.name)} BEGIN INSERT OR IGNORE INTO todo_cli_commit_seen VALUES(1); END`,
      );
    }
  }
  return {
    changed: () =>
      db.query("SELECT 1 FROM temp.todo_cli_commit_seen LIMIT 1").get() !== null,
  };
}
```

Table names come from SQLite and are quoted as identifiers. The observer is
installed only after discovery has proved an already-running server, so that
database has completed migrations. Fresh database initialization cannot have a
proved server and will not install this observer. Snapshot restore rewrites rows
in place and drops only main-schema triggers; the TEMP triggers remain present.
Those claims require execution against the merged implementation, including
restore, rollback and concurrent-writer controls.

The CLI's existing `openStore({ path })` would pass
`observeCommits: server !== undefined`. `observeDirectWrite` would inspect
`committedDirectWrite()` after the command, retaining successful Snapshot
file-only observation and the best-effort nudge. It would stop using sequence and
generation as its evidence of a connection commit.

## Required qualification before accepting this approach

- Constructor cleanup writes, Profile creation, the 31 mutation inventory,
  auth refusal writes, successful prefixes, nested rollback and full rollback.
- No marker from a foreign connection, and no marker from a zero-row/no-write
  operation. No main schema, History, or output differences from observation.
- Snapshot restore and preview isolation. Observer installation and rollback
  behavior must not change the accepted restore admission or cleanup paths.
- Trigger overhead with the compiled CLI, without claiming a performance gain.
- Explicit mapping review and the applicable atomicity/cache/DAG source checks
  after implementation. The present hashes remain unchanged.

## Merge receipts and remaining work

The merge has two parents, `8d85f5e2` and the required `2a840b55`.
Only SSE and architecture documentation conflicted. SSE retains the incoming
checked synchronous scopes and terminal permission, using the existing per-stream
wait hook in place of its timer expression. Documentation retains both the
strict-read stream behavior and the direct-write nudge description.
The shared prepared add still creates and then calls the merged `readTasks` as
separate phases. `readTasks` owns and closes its checked scope; neither caller
retains an authority across those phases.

The contract remains
`4012f963d6dd6bc55180ee1be6525090de872c13894c0f9ec2cee72c380c1cf3`.
No Swift file was changed in the merge.

The audit of all five `.agents/skills/verify-*/coverage.json` files checks 76
path/hash entries. Seventy-four match, including all ten atomicity entries.
The cache coverage has two whole-file drifts, `apps/cli/src/main.ts` and
`apps/server/src/server.ts`, from the CLI-routing integration. Those are reported
for review rather than silently renewed. Evidence is local at
`docs/evidence/cli-routing/corrections-01/coverage-audit.json`.
The CLI typecheck passes under the new OS socket-denial wrapper.

S1–S4 have not been corrected or reproduced by this worker in this correction
turn. Their red/green gates and the full required recipes remain pending.
Installation remains unsafe. The pause is the coordinator's explicit pinned-code
stop rule, not a request to relax any gate.
