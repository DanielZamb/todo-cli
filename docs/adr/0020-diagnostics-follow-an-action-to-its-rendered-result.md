# Diagnostics follows an action to its rendered result

Status: Accepted for vocabulary, joins and recording policy, 2026-11-12.
Clock calibration, presentation proof and client UI delivery remain proposed.

## Decided for the first implementation

Use one versioned, discriminated, metadata-only vocabulary in the shared domain
package. Preserve the Mac recorder's event names, including its selection,
inspector and layout markers. The envelope uses process role, random UUID v4
recording ids, producer sequence, local monotonic milliseconds, optional wall
anchor, build and contract identities, inventory category and action subtype.
Recording ids never identify Tasks, Profiles or credentials. Request headers
X-Todo-Trace, X-Todo-Request and X-Todo-Action carry these joins and confer no
authority. The server validates them and echoes the accepted request id.

Owner Session responses also carry Server-Timing. The required todo-handler
metric measures middleware entry to response handoff in milliseconds, matching
the request entry span. Optional todo-auth, todo-queue, todo-domain, todo-db and
todo-encode metrics report observed work only. Values use dur= with at most
three decimal places, comma separation and no descriptions, ids or content.
Authentication refusals and unauthenticated responses carry no timing. Stream
responses carry timing only on their initial headers. These optional headers
leave the typed contract unchanged. Socket acceptance and worker dispatch occur
before middleware entry in the Bun adapter and remain unattributed. No server
header proves client receipt.

Categories cover I01 through I30 and C01 through C08. Each subtype has the
inventory row's result predicate. A current authoritative result or visible
refusal completes only at an observed render marker. Model publication, layout,
paint opportunity, physical presentation and stdout drain remain distinct.
Unknown events and unavailable capabilities are explicit. Unobserved phases
remain gaps, never zero-duration work. Stream handoff is not client receipt.

The owner's limits are 20 ms median and 300 ms p99 per interaction subtype.
For frozen runs use nearest rank ceil(q*n) on raw completed durations for p50,
p90 and p99, with maximum and sample count. Never average percentiles. Also show
total starts, outcome counts and fractions correctly rendered by 20 and 300 ms.
Pending, lost, crashed, timed-out, unavailable and superseded actions remain in
the denominator. Bounds and ages are separate from completed durations. No
samples means no quantile. Fewer than 1,000 starts leaves descriptive p99 sparse;
losses or missing correctness/render evidence cannot establish a pass.

Only allowlisted scalar metadata is representable. No Task title, description
or id, Profile name, search text, path, token, SQL text or parameters, dynamic
error message, arbitrary route or response body belongs in new records. Existing
owner Diagnostics retains its established metadata contract. New Diagnostics
reads and exports require an owner Session, as ADR-0005 already requires.
Access Tokens cannot read them. Keep collection bounded and outside the Task
database. Pass context at execution boundaries rather than through business rules.

The polled GET /diagnostics body has a hard 49,152-byte budget, including UTF-8
pretty JSON and its final newline, so the ordinary CLI output has the same cap.
Compact HTTP JSON is smaller. Version 2 of the profiler object contains counters,
one fixed 11-bucket duration histogram, bounded per-stage and per-category span
summaries, and at most eight recent slow or failed span labels. Histogram
quantiles are bucket upper bounds, with null for an overflowing bucket; these
are explicitly span summaries, not the exact frozen interaction quantiles above.
Unfinished starts remain counted. Existing per-route quantiles retain the raw
300-second/2048-sample window. Legacy metadata lists are bounded samples too,
with omission counts in profiler.omitted. UTF-8 admission budgets cover complete
rows without changing their ids or display words. Aggregate totals are retained.

Admission ranks slow observations (at least 20 ms), failed or refused outcomes
ahead of ordinary observations, then prefers the newest in each group. It does
this before both row and byte limits, including the recorder's detail sample.
Admission stops at the first row that cannot fit, so older ordinary rows cannot
displace an omitted important row. Returned observation lists are newest first.
Chronological charts reverse a copy, with the oldest value at the left and the
newest at the right. All active spans are unfinished and important. Deliveries
and throughput samples have no outcome; the newest win. Span summary rows prioritize
unfinished, failed or slow work, with stable key order within each group. Route
summaries prioritize routes with any slow or failed request in their window,
then the route's latest request.
Inventory rows retain stable name/id order; credentials prefer recent use.
Alongside each total omission count, the corresponding `.important` key counts
omitted important rows, including ones removed before byte admission. Slow-label
omissions also count eviction from their eight-item queue. Fixed histograms and
aggregate counters are never sampled.

Detailed active spans, recent spans and stream delivery events are excluded from
the polled body. The same owner-only route accepts the declared detail=true
query for an explicit bounded sample, at most 65,536 bytes including pretty JSON.
The detail sample hoists run_id, build_id and contract_id out of its rows. It
returns at most 32 recent spans, four active spans and 16 delivery records;
separate total and omission counts state what the sample did not include.
The CLI exposes it as --detail and rejects --detail with --follow. Normal app
and CLI polling never opts in. The explicit recording API below is separate. Row quotas and a final schema byte predicate enforce both budgets.
The internal diagnostic rings remain bounded and are accessed in full only by
verification seams; counts distinguish omission from zero or unavailable work.

The shared schemas are published through `todo schema 'diagnostics event'` and
`todo schema 'diagnostics observation'`. U01 changes no HTTP schema. U02 first
adds bounded internal collection and optional headers with the existing contract,
then separately adds one versioned profiler object to owner Diagnostics with a
new generated contract id, as approved by the coordinator. Integration ships
server and both clients together, preserving compatibility refusal behavior.

## Accepted recording policy, owner decision 2026-11-12

Recording is always on in each app, bounded and metadata only. Apps send bounded
batches to the local server so both apps and the CLI can inspect the same runs.
Only a current owner Session may ingest, read, export, import or compare.
Access Tokens, expired and revoked Sessions receive no records. Ingestion and
reads require a direct loopback peer and Host; proxy/forwarded headers are refused.
Authorization is checked before decoding and again before publishing an async read.

Store recordings in a private `diagnostic-recordings/recordings.db` beside the
server's configured database. Never attach it to todo.db or include it in Task
Snapshots, restore, Purge or export. Directories use 0700 and files use 0600.
Each app has at most 32 MiB across its runs, retention is seven days, and the
total is at most 256 MiB. Electron main and renderer share one app quota.
Transactional sums include conservative event, index and run overhead. Oldest
retained batches go first and their loss marks survive deletion. The fixed
limits remain 4,096 retained batches, 5,120 runs, a 1 MiB pending queue and
1,024 pending batches. SQLite owns identity constraints and cross-process
serialization. Expiry and eviction are bounded transactional DELETE operations;
a failed expiry waits at least a minute before an automatic retry.
All recording SQL and private-file operations run in a worker thread. WAL,
FULL synchronous commits and a 1 ms busy timeout bound lock waiting. A full,
locked or failed recording database cannot fail a Task request or write.
Client-local journal implementation and app UI integration belong to their units.

A record may contain a run-local integer Profile ordinal, never a Profile name
or id. It can identify only "Profile 2 of this run". Allowlisted release timing
includes the press/release basis, separate hold milliseconds and whether release
was derived from native list selection. Selection context contains only list
row count, refresh-in-flight, process uptime and journal byte count.

The explicit HttpApi group under /diagnostics/profiler accepts batches up to
128 KiB and 128 events. Its bounded asynchronous queue isolates recording transactions from Task work.
The ingestion response awaits that queue asynchronously and acknowledges stored
data only after the SQLite transaction commits. Clients retain batches until a stored
receipt and retry failed/uncertain deliveries.
A run-scoped batch UUID deduplicates retained retries. Within a run, a producer sequence
may repeat only with identical event content. Conflicting content is refused
with an allowlisted recovery message before admission, including import/dry run.
A fully retained identical event batch is a no-op. Pending data is not called
stored. Only committed SQL rows create runs. Repeated contradictory
action phases produce a refusal instead of a summary that hides observations. No recording SQL or filesystem operation
runs on the server thread during ingestion. JSON parsing/schema validation and bounded admission still
use the server thread and must be measured. Exports page one bounded batch at a
time; NDJSON CLI export follows pages. No arbitrary path is accepted over HTTP.
Import validates all local input before applying; --dry-run performs no journal write.
Run summaries retain pending, lost, crashed and unproven results. Exact frozen
quantiles reuse nearest-rank durations and all observed starts as denominator
for deadline fractions. Loss counts remain visible beside those samples.
Comparison requires matching contract, app, workload/script/environment hashes,
release/debug configuration, render capability and concurrency; dev/unknown
identities cannot establish comparable runs. Different build ids are expected.
Refusals name only an allowlisted missing/different condition, with no uploaded
value. The CLI preserves the safe message and exits 2 for validation or usage.
Ordinary always-on runs may omit benchmark comparison context; they remain
inspectable and exportable, but comparison refuses them.

The joined server read path now records history decoding, Task materialization,
response schema/JSON encoding, and a bounded first-use marker per route. SQLite
does not expose the external writer's identity: its lock-holder class is
external_or_unknown, never an inferred process name. Socket acceptance, physical
receipt, other endpoints' encoding and presentation remain explicit gaps.

## Accepted admission completeness and run scope

A valid conflicting batch is refused as a whole. No event in it is admitted.
The response states this policy and tells the producer to retry its non-conflicting
part unchanged with a new batch id. Before that HTTP 400 is returned, persist a
content-free run mark. A persistence failure returns a storage error instead;
the producer must keep the entire batch and retry. Task requests and writes do
not depend on that persistence.

The declared version-1 `run.admission` object carries policy `whole_batch`,
refused_batches, unadmitted_events and incomplete. Counts are cumulative refused
submission attempts, not inferred missing actions. Null means the count is
unknown. Refusal marks survive data rotation and complete data eviction; they
expire only when the mark is more than seven days old and no retained or pending
data for that run remains.
The run row holds the mark in the recordings database, charged to the app quota. An explicit admission_bytes status field exposes
the metadata charge. There are at most 5120 retained, pending or marked run
identities. New run registration is refused at that limit instead of forgetting
an existing mark. The bounded RPC queue limits repeated refusal work; each transaction updates
the existing run row.

Every row of a marked run is incomplete and has null all-start deadline fractions.
Descriptive observed duration quantiles and known starts remain visible.
Comparing a marked run as a complete run is refused with a safe reason. Receipt,
list, show and export preserve the mark. Export of an evicted run may carry an
empty event batch with its mark. Import and dry run accept that declared form;
apply merges mark counts monotonically by maximum, and unknown remains unknown.
This gives a lower bound across imported snapshots without double-counting the
same exported refusal. A zero/older snapshot cannot clear a mark. A successful
retry of valid facts does not prove that every originally refused fact arrived.

All event reducers scope actions, clocks, crashes, sequences and phases by run.
Mixed-run input is reduced into separate run rows; aggregate flags summarize the
input while uncertainty is applied only to the affected rows. Raw events cannot
encode an external admission refusal: consumers of exported recordings must pass
their run admission map to analyzeRecording/summarizeRecording, or use the server's
already masked summaries. CLI import preserves this metadata; the native client
integration must preserve it too.

The accepted storage decision is a separate SQLite database, recordings.db, in
the private diagnostic-recordings directory. It is never todo.db, never ATTACHed,
and never included in Task Snapshot, restore, Purge or Task export. A 0700
directory contains the 0600 database and its engine-managed WAL/shared-memory
files. No migration reads the retired unshipped file journals.

SQL primary/unique keys scope event identity by run, producer and sequence.
Fingerprints distinguish idempotent retries from conflicts. Foreign keys and
JSON association checks prevent one run from claiming another's data. The run,
events and admission state commit in one transaction. Whole-batch conflict
refusals roll back all submitted facts, persist the counted admission mark and
then return the reviewed refusal. A failure to commit returns the safe storage
refusal; the producer retains its entire batch. Engine recovery preserves the
last committed transaction, with no application reconstruction or event index.

The database uses WAL, FULL synchronous mode and a 1 ms busy timeout. All SQLite,
expiry, eviction, fingerprinting, private-file work and summary work run in a
worker thread. Only bounded admission decoding/clone/queue work remains on the
server thread. The queue is still 1 MiB / 1024 batches. Calls never wait for a
recording lock on the Task thread. The compiled executable embeds the same entry
for its worker, so no source files or extra installed runtime are needed.

Caps use transactional SQL sums of charged rows and metadata. Charges include
conservative payload/index/page allowance; app and total reserves cover pending
engine work. Cache spilling is disabled, so dry-run rollback writes no WAL frames.
Before COMMIT a physical budget reserves the existing main/WAL allocation, a
whole database of possible new WAL frames and engine overhead. A pinned reader
can prevent a checkpoint; in that case an over-budget batch is rolled back and
counted as dropped. A bounded checkpoint attempt lets an explicit retry proceed
when the reader releases. journal_size_limit alone is not a hard WAL bound. Oldest retained batches go first. Loss counts and incomplete marks
commit with deletion. A sweep deletes at most 128 events and 128 empty runs;
ingestion additionally removes at most 256 expired input identities and 512
capacity victims, beside its 128 input events. Expired identities of that input
are removed before duplicate admission, even if the general sweep has not
reached them. An expired cursor is refused before physical cleanup.
There are at most 4096 retained producer batches and 5120 runs. Compatibility
status.segments counts those retained batches; there are no file segments.
The main database file remains at its high-water allocation inside the cap;
expiry frees reusable pages rather than shrinking the file. No vacuuming is
configured or scheduled.

An external reader can pin the WAL and postpone physical expiry. Logical
seven-day hiding and the disk cap still hold. Refused valid batches count as
capacity drops. Diagnostics names the reader-held condition and its drop counts.
Maintenance retries after a minute without recording each retry as another
storage failure; it recovers automatically after the external reader releases.
Other processes' readers are never interrupted.

Maintenance runs on demand and at a fixed minute cadence, drains bounded chunks,
and retries failed automatic work no sooner than a minute, independently of
wall-clock jumps. Expired facts are excluded from reads even if deletion fails;
any retained run missing such facts is shown incomplete.

Export uses ordered event-range reads in a WAL snapshot. Its opaque cursor is
independent of producer batch identity. Each page carries the run's current
admission state, preserves event order and stays within 131072 bytes, including
the transfer envelope. Retained exact retries add no events. Export captures at
most 129 row strings in one short snapshot and formats them
after COMMIT. Show reads 128 row strings per snapshot and materializes/reduces
outside it. Compare has no enclosing snapshot. SQLite data_version checks across
steps refuse a changed read instead of combining different committed states.
No owned reader keeps a snapshot across steps.

The earlier manifest/checkpoint/blob protocol is superseded, including its
verification machinery. The current SQL controls, crash boundaries and finite
limits are in the DIAG-CORE recordings report. Process-kill controls do not claim
power-loss or hardware-failure durability. Task readiness never awaits database
opening; authenticated recording requests await their worker instead.

All worker calls, including reads, reserve both count and encoded bytes before
posting: at most 1024 calls and 1 MiB, including an envelope allowance. Readiness
and every RPC have a 5000 ms deadline. A caller deadline refuses only that call.
Only one call is dispatched at a time, and expired queued work is never sent.
Admission also bounds predicted work to five seconds, using 1.5 times the largest
of the last eight service times per method, with each sample individually
stamped at completion and expired after 60 seconds. Expired observations are
never copied or restamped by a later reply. The documented cold estimates apply
when no live samples remain. An expired in-flight call retains its byte charge
until the reply or retirement. Replies and each bounded long-read step reset a
10000 ms inactivity watchdog. A stalled in-flight operation, including worker
initialization, is retired only after that inactivity period; queued deadlines
do not retire a progressing worker. Creation, error and exit failures also enter
an unavailable state. Recovery uses a 60000 ms backoff. Closing settles
within the same deadline and cancels recovery. Failure labels and counts contain
no content, route parameters, ids or filesystem paths. The Task server catches
even a synchronous recording factory failure, serves Tasks immediately and shows
the condition in the existing owner Diagnostics error list.

Recording ownership is published durably in the main SQLite header: application
0x544f4452 and user_version 1. Initial schema and identifiers commit together in
rollback-journal mode under native exclusion on the recordings file only. A
second look at the held descriptor must still find empty contents or an already
published recording header. A peer-created foreign file is refused before any
mode change, journal switch or DDL. Two legitimate initializers publish once.
The exclusion is nonblocking with bounded retries and runs only in the recording
worker, never on Task readiness or Task requests. No lease/lockfile is added.

Unknown headers and files larger than the configured cap are rejected by plain
reads without opening them with SQLite. The exact main catalog is checked using
an immutable read, which cannot maintain auxiliaries. A header-claimed store is
then opened normally and its actual catalog checked before setup, followed by
integrity and foreign-key checks. Initialization made the main catalog and header durable, so
immutable reading is not used as a replacement for current WAL data. This avoids
validation copies and leaves the storage limits unchanged. Refused foreign files,
including WAL, shared memory and rollback journals, keep their bytes, modes and
listing. The unit has not shipped; no old-format migration is provided.

## Still proposed

Cross-clock calibration, physical presentation proof, richer profiler terminal
panes and app recording/compare controls remain later units. This acceptance
authorizes the shared store/API/CLI, not a native app launch or owner data access.

## Consequences and rejected approaches

This extends ADR-0003 and ADR-0009 without moving clients across ADR-0002's
server boundary. Handler timing alone misses dispatch, transport and layout.
Sampled successful starts hide hung actions. Unknown phases cannot be inferred
by subtracting unrelated monotonic clocks. Exhaustive synchronous logging would
change the workload being measured. A headless layout cannot prove screen paint.
Mac adapters map existing UUIDs and event names into the shared envelope and
translate applied to completed and failed to failed. A drag termination does
not prove selection completion. Cursor values remain in sync, outside new
Diagnostics records. Missing phases must map to unknown or unavailable.
