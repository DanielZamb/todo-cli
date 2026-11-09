# Tag link writes

`putTask` reads the current Task's links with a LEFT JOIN. No matching Task
produces no rows; an existing Task with no Tags produces one null row. Compare
the non-null ids to a Set of the proposed ids. Equal sets with no duplicate
proposed ids skip link DELETE and INSERT. All other writes use the original
array-based INSERT loop, so duplicate ids fail the primary-key constraint and
the surrounding transaction rolls back. Task payload and `task_versions` writes always run. Rebuild starts with
no Tasks, so the first replayed state always populates links. A new Tag name
needs a new id and takes the replacement branch.

Run the normal `verify-op-log` command. Its compiled production driver imports
`packages/domain/scripts/tag-link-proof.ts`. The matching focused behavior tests
are `packages/domain/test/tag-links.test.ts`. Assertions compare complete Task
payloads, Version rows and sorted links against the issued fixtures after each
edit, full replay, checkpoint replay, Move, Delete and Revert. Forced SQL failure
at the Version write covers both equal and changed link branches. Guard checks
try INSERT, UPDATE and DELETE. Projection-only duplicate cases require the
original constraint error and unchanged payload, Version and links, including
new Tasks. Authenticated append requires the unchanged validation rejection
and no committed History entry. Public append's duplicate rejection is unchanged.

For repeatable measurements, compile `packages/domain/scripts/measure-tag-links.ts`
and pass `<absolute-evidence.json> <absolute-compiled-todo> <source-hash>`.
Keep the driver and `packages/domain/test/tag-link-fixtures.ts` byte-identical
across both builds. Each run seeds 1,000 Tasks with three Tags, warms five writes
per case and measures 25 complete append transactions per case, plus 25 compiled
CLI edits. Cases cover unchanged, reordered, add, remove, empty and new Tasks.
The production store connection uses WAL, FULL synchronization, foreign keys,
5,000 ms busy timeout and autocheckpoint 0. Each checkpoint is outside its timer.
WAL frames use the actual header page size; page payload excludes the 32-byte
WAL header and 24-byte frame headers. Full CLI timers include process startup,
authentication, append and JSON output. Outputs, successful work and failures
are checked and recorded. Timing excludes assertions and checkpoint work.

Preserve source and binary hashes, real process exits, load, five interleaved
runs per build, medians, p95 and run-median ranges. Overlapping ranges mean no
measurable latency gain. Profile separately and record its scope. Do not infer
an end-to-end speedup solely from reduced WAL frames. All inputs and databases
remain scratch; there is no server to stop.
