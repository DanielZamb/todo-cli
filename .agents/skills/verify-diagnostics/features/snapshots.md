# Owner snapshots and live polling

## Sub-features

Owner Session authorization, table/entity counts, storage sizes, operations,
SSE clients, credential metadata, bounded errors and latency, scheduler state.

## How to get to it (user POV)

Read GET /diagnostics with an active owner Session. Poll once per second. After errors, back off to 2, 4, 8, 16 then 30 seconds. Reset to one second after a successful read. Non-interactive follow emits the shared JSON error on stderr and exits on a failed read.
Access Tokens cannot read owner diagnostics, even with an unscoped write grant.

## Driving it with curl

Run the skill's verify.sh. snapshot.json must show one Task, one connected CLI
subscriber and three Task attempts, including exactly one rejected TaskEdited.
The PATCH route count is two. purged.json must show no Task content and zero
remaining Tasks in work. The final subscriber count is zero.

## Gotchas

Polling uses Cache-Control no-store. Last use and request timings cover this
server process only. Null last-use means unknown, including external CLI use.
Latency retains at most 2048 completed responses for 300 seconds. Recent
operations retain metadata for 100 attempts. Throughput uses durable event
times over 60 seconds and includes external CLI writes. No persistent migration.

Snapshot restore changes storage.restore_generation. Diagnostics clears its
throughput history and connected-client cursors on the next read. Recent
operations are freshly projected from the restored log. storage.last_snapshot
contains metadata from store.snapshots.list(), without paths or checksums.
