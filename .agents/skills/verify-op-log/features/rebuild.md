# Rebuild and snapshots

## Sub-features

Drop projection tables, replay committed facts, skip rejected attempts, and
restore the latest snapshot before replaying its tail.

## How to get to it (user POV)

Call `store.rebuild()` for full replay, or call `store.takeSnapshot()` and then
`store.rebuild({ useSnapshot: true })`.

## Driving it with the compiled Bun driver

Run the helper. `04-rebuild.sql` retains both baseline tasks, the edited task at
version 8, its Project and Tag definitions, its series, five history rows, and
the snapshot. Both rebuild
modes must equal the task rows before dropping the projection. The behavior
suite also checks literal expected titles and versions after replay.

## Gotchas

Replay reads resolved facts. It does not read the clock or expand recurrence.
Snapshots retain task version counters even after Purge, so replay does not
allow a reused ID to accept an older version.

Purge redacts snapshot content transactionally. Redacted events retain only
unaffected resolved facts and version counters. See [Purge](purge.md).

F10's ProfileDeleted operation reconstructs Profile tombstones and scoped Token
revocations during both full and Snapshot replay. profiles.test.ts checks the
visible Profile list, Task History and foreign rows after both replay paths.
