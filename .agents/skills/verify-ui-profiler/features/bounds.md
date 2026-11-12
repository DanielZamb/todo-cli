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

The private identity maps are independently bounded by 4096 retained plus 1024
pending batches, at most 5120 manifests and 655360 event references. The continuous
admission test retains one segment and one pending write through 1001 runs,
with at most two manifests/event identities. Failed expiry has a 60000 ms minimum
retry and other status writes cannot shorten or postpone that timer.

The combined retained/pending/marked run set is at most 5120 identities. A mark
has at most 2048 encoded bytes and a charged filesystem block, plus an atomic
replacement allowance. Marks survive data eviction and expire only when more
than seven days old with no retained or pending data. At capacity, refuse a new run rather than
forget an existing mark. Repeated refusals coalesce to one metadata job per run.
Metadata write failure has no retry loop; shutdown attempts remaining dirty marks
once after the queue drains. An unavailable metadata store cannot publish a
complete-looking run. Forced-GC lease-liveness controls distinguish an idle
process from a retained store; the crash fixture must keep its store alive.
