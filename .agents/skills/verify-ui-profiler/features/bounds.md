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

The combined retained/pending/marked run set is at most 5120 identities. A sole
manifest holds definition, mark, loss counters and segment descriptors. Its
256 KiB cap and charged replacement are included in quotas. Full manifests evict
only their own oldest references, count the evicted events and retain uncertainty.
The 4096 global segment cap and app/total byte caps still apply independently.
Pending commands do not create a run. Repeated refusals coalesce to one job.

Missing or corrupt manifests mean absence, never reconstruction. Named missing
or corrupt segments persist an incomplete run before query output. Failed file
removals stay charged and block growth; ENOENT succeeds. Startup removes orphans
without learning run identity from them. The generated model and compiled SIGKILL
controls enumerate lifecycle mutation points and file-state subsets. The generated drive reopens all 14537 file/clock combinations in real
directories, checks charges and retries every image twice. The smaller unit
reopen test covers the 64 two-segment/manifest combinations as well.
Pending duplicates cannot acknowledge a failed shared write. Split batches publish
all segment references in one manifest and remain idempotent after lost receipts.
