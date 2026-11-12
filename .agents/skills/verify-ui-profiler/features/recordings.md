## Sub-features

Owner-only metadata ingestion; run list/show, bounded export, dry-run import and
comparable-build reports. Private storage has byte, age, segment and queue caps.

## How to get to it (user POV)

Use todo diagnostics runs/show/export/import/compare with a local --server URL
and an owner Session. Discover each response with todo schema. Apps use the
same HttpApi profiler group; their native recording UI is a later unit.

## Driving it with compiled CLI and HTTP

Run the parent skill's verify.ts, targeted fault/bounds tests and cost command.
A real selection-shaped producer must read back 2 starts, one pending, p50 8 ms
and fraction 0.5. Privacy probes must return no injected content. A different
environment is refused for comparison; retry preserves the original event count.

## Gotchas

The internal queue admits work without synchronous I/O. The HTTP acknowledgement
awaits persistence asynchronously; retain local batches until a stored receipt. Explicit export cursors can expire under oldest-first
rotation. Losses, clock discontinuities and restart uncertainty invalidate a
complete-performance claim. Normal Diagnostics polling never reads this journal.

Conflicting batches are refused whole. The compiled completeness.ts control
requires a persisted run.admission mark, null all-start fractions, a valid slow
subset retry and comparison refusal. Export/import must preserve the mark even
after every data segment is evicted. External consumers of raw events must carry
the run admission map into their summaries. Mixed-run reducers and CLI import
keep independent 8 ms and 400 ms actions with shared action/producer/sequence
identities. admission-fault.ts checks the safe retain-and-retry instruction on a
storage failure while a Task write still succeeds exactly once.
