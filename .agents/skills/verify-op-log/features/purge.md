# Purge redaction

## Sub-features

Erase accepted and rejected Task content, orphan Project, Tag and Series details,
and every snapshot copy. Keep sequence, original operation, actor, Profile,
Versions, outcome, reason and timestamp. Reject Revert with `task_purged`.

## How to get to it (user POV)

Delete a Task, then append `TaskPurged` through the domain store. The CLI exposes
this as `todo rm TASK --force --expected-version N`. Read History afterward.

## Driving it with the compiled Bun driver

Run the parent skill helper. Its `purge-proof.ts` drive creates unique private
Title, description, Tag and Project strings plus a Series and rejected creation.
It takes two snapshots, forces a snapshot update failure and requires the whole
Purge to roll back. A successful retry redacts every copy and retains literal
operation metadata. Revert of all four original entries returns `task_purged`.
A later rejected attempt cannot restore content. Both replay modes leave no Task,
Project, Tag or Series, while retaining the Task Version counter.

After closing the store, the driver checkpoints, runs VACUUM, checkpoints again,
and searches the database's raw bytes for all five private strings. None may
remain. `purge.json` survives scratch cleanup and records the canaries and result.
The behavior suite also compares every projection table through full and
snapshot replay when a shared Series creates a successor, then Purges both
Occurrences. Reopening an old unredacted Purge repairs its History transactionally.

## Gotchas

`TaskHistoryRedacted.original_kind` retains the original operation type.
`task_ids` identifies erased Tasks. `replay` keeps only unaffected resolved facts
and version counters, so a multi-Task operation can still rebuild its successor.
Shared definitions remain while another Task's History or snapshot refers to
them. Purge removes exclusive definitions. Database compaction is explicit in
the scratch proof; no test opens the owner's database.

The compiled drive also runs two sequential Purges of Tasks sharing a Project
and Tag. `shared-purge.json` proves formerly shared definitions disappear from
every redacted replay fragment, both replay modes reproduce every projection
row, and raw bytes contain none of the four unique strings after compaction.
