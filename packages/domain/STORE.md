# Operation store API

`openStore({ path, create? })` returns an Effect that opens one Bun SQLite
connection and applies migration 0002. `create` defaults to `true`; `false`
requires an existing file. The connection uses WAL, `busy_timeout=5000`, foreign
keys, and `synchronous=FULL`. Call `store.close()` through an Effect finalizer.

```ts
import { Effect } from "effect";
import { openStore } from "@todo/domain/store";

const program = Effect.acquireUseRelease(
  openStore({ path: scratchPath }),
  (store) => store.append({ actor, profile, event }),
  (store) => Effect.orDie(store.close()),
);
```

The shared `@todo/domain` root exports schemas and types for browser clients.
The `@todo/domain/store` entry point exports `openStore`, `OperationStore`, and
`StoreError` for Bun callers. Browser clients do not import the store entry point.

## Append and rejection

`append({ actor, profile, event })` accepts JSON event input and returns an
`OpLogEntry`. A committed event and all its task, tag, project, series, and
version changes share one immediate transaction. The store compares the full
before facts and the version. It requires the next version to increase by one.
Create uses version 1. Migration baseline events retain legacy versions.

Create and edit events include Project and Tag definitions. Those definitions
must match the referenced IDs and profile. An existing definition cannot change
under the same ID through a task mutation. The store returns a rejected conflict
for differing facts and a rejected validation for missing definitions.
Task metadata and Series task defaults require existing or event-defined
Project and Tag IDs in the operation's Profile.

A rejected mutation returns `outcome: "rejected"` with a reason code. It records
a `TaskAttemptRejected` event in a new transaction after the failed mutation
transaction rolls back. The rejection contains the attempted kind, task ID when
available, received JSON facts, and violation code. It never changes projections.
Reasons include `conflict`, `validation`, `profile_mismatch`, and `invalid_revert`.

The attempt envelope needs a recognized `kind` and valid UTC `occurred_at` even
when its task facts are invalid. Actor and profile IDs must be valid and the
profile must exist. Input outside that envelope, unserializable input, SQLite
errors, and corrupt stored data fail with `StoreError`.

`reject({ actor, profile, event, reason, from_version? })` records an upstream denial, such as
`auth`, using the same rejected-event format. Authorization belongs to the caller. `from_version` preserves the attempted
Version when an upstream command rejects a change before appending its event.

## Read and rebuild

`tasks()`, `series()`, `profiles()`, `projects()`, and `tags()` return schema-decoded
rows ordered by ID. `tasks()` includes deleted tasks. Callers filter `deleted_at`
for visible tasks. `history(after = 0)` returns committed and rejected operations
ordered by sequence, with an exclusive sequence cursor.

`ensureProfile(candidate)` looks up an active Profile and allocates its ID
and inserts it under one writer transaction. Reusing a tombstoned name creates
one new active Profile even with competing clients. `putProfile(profile)`
registers or renames a profile. Profiles are canonical
partition metadata. Project and Tag definitions enter the projection through
events. `settings()` returns the journal mode, timeout, and migration version.

`rebuild()` drops and recreates every projection table, including Project and Tag
definitions and accepted version counters. It replays only committed resolved
events. It never reads the clock or expands recurrence. Profiles and history
remain intact. A failed rebuild rolls back the table changes.

`takeSnapshot()` stores the full projection and version counters at the current
sequence. It returns that sequence, or `null` for an empty log. Repeating it at
the same sequence leaves the immutable snapshot intact.
`rebuild({ useSnapshot: true })` restores the latest snapshot and replays its
committed tail. With no snapshot, it performs full replay.

## Revert

`revert({ actor, profile, seq, occurred_at })` appends a `TaskReverted` event with
resolved inverse task and series facts. It requires an accepted operation in
that profile. It compares every affected result with the current projection.
Intervening changes produce a rejected conflict. Creation becomes Delete, and
reverting Purge restores the deleted task. Versions increase and original
operations stay in history. Clients cannot supply `TaskReverted` to `append`.

## Storage

`tasks.payload` stores the schema-encoded task, including tag IDs. Generated SQL
columns expose task fields for filtering. `task_tags` stores the same tag
relations with foreign keys. `series` stores encoded series facts.
`task_versions` and `series_versions` preserve accepted versions after Purge or
series deletion. These tables are rebuilt from events or snapshots.

Guard triggers call a connection-local Bun function that returns 1 only inside
domain transactions. Direct connections cannot write projections. The log also
rejects update and Delete. A migration opens through this same guarded writer.

Migration details and the production command are in
[migrate-0002.md](../../docs/migrate-0002.md). Scratch verification is in
[verify-op-log](../../.agents/skills/verify-op-log/SKILL.md).

## Authentication and private files

Use `store.auth` for authenticated consumers. It checks fixed credential expiry,
revocation and scopes in the domain layer. `store.auth.startSeries` and
`store.auth.finishTask` invoke the synchronous recurrence ports under the same
transaction as authorization. See [the auth contract](AUTH.md).
The privileged methods above remain available to trusted local consumers.
Migration 0003 permits null Profiles only for global auth History entries and
preserves v2 snapshots. Rebuild ignores auth events. Opening or creating a
file-backed store enforces `0600` on its database and WAL/SHM siblings.

## Series and Occurrences

`startSeries({ actor, profile, series, task_id, occurrence_id, occurred_at })`
resolves the first rule date and appends one TaskCreated event with the Series
and its first Occurrence. `finishTask({ actor, profile, task_id, from_version,
action, occurred_at, next_task_id, next_occurrence_id })` accepts `complete` or
`cancel`. It checks Version and status, resolves the next rule time, then writes
the changed task and successor in one event and transaction. Exhaustion writes
an empty `next_occurrences` array. Conflicts and validation failures enter History.
SQLite failures roll back the entire operation and fail with StoreError.

The Series task defaults supply new task metadata. Scheduling and due values
shift by local calendar time from DTSTART. When neither exists, the recurrence
time becomes scheduled_at. The Occurrence origin retains its original `time`
for cursor stability even if a task's scheduling is edited. Legacy origins
without that field use their date with the Series DTSTART time.

Authentication calls the store's synchronous `startSeriesSync` and
`finishTaskSync` handlers through constructor callbacks. Its request schemas
derive from StartSeries and FinishTask without client-supplied actor or timestamp.
It derives those values and checks write access, Series ownership and Task
ownership before entering recurrence handling. Nested transactions preserve the
enclosing projection-write guard.
The raw store is the local trusted domain API; remote clients use the scoped port.

Run [verify-recurrence](../../.agents/skills/verify-recurrence/SKILL.md) for a
compiled scratch-database proof.

The raw `startSeries` and `finishTask` methods accept unknown JSON at the
boundary. StartSeries and FinishTask remain the validated command schemas used
by typed auth requests. With a valid actor, Profile and timestamp envelope,
invalid command fields append rejected task History, retaining received facts.
Invalid envelopes and non-JSON input fail with StoreError. Auth request parsing
continues to record its own credential-safe rejected auth History.

Series start reads any referenced Project and Tag definitions inside the write
transaction and includes them in the resolved TaskCreated event. Existing v2
migration tasks can have `occurrence: null` and a matching
`legacy-series:<task-id>`. Completion and cancellation resolve that durable
relationship and advance from the Series DTSTART without rewriting old events.
Deleted successors do not suppress a new visible Occurrence after Revert.

`StartSeries` also accepts optional `project` and `tags` definitions. Adapters can
create a Series with new metadata in its first TaskCreated transaction. Omitted
definitions still resolve from storage, and the existing append validation checks
Profile ownership, names, and Task references before committing.
