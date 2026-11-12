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

Store recordings outside todo.db, beside the server's configured database in
`diagnostic-recordings`. Directories use 0700 and files use 0600. Each app has
at most 32 MiB across its runs, the server retains at most seven days, and the
total is at most 256 MiB. Electron main and renderer share one app quota.
Oldest segments go first; expiration, capacity losses, corrupt/orphan segments,
queue drops and storage failures are counted and returned with every read.
The implementation additionally caps segment count and the pending queue:
4,096 retained segments, 1 MiB pending encoded data and 1,024 pending batches.
Run manifests reference only retained or pending batches, at most 5,120 runs.
Event fingerprints have at most 655,360 retained/pending references.
Cleanup never waits for the whole queue to drain.
An unreferenced expiry timer removes idle records without a later request;
filesystem failures are counted and retried with a one-minute minimum interval.
Other journal activity preserves an already scheduled backoff timer.
An empty private SQLite lease file grants one writer per directory; it contains
no recordings or Task data and releases its OS lock when a process dies.
Three filesystem blocks are reserved for the lease and atomic status replacement.
A disk or recorder failure must never fail a Task request or write.
Client-local journal implementation and app UI integration belong to their units.

A record may contain a run-local integer Profile ordinal, never a Profile name
or id. It can identify only "Profile 2 of this run". Allowlisted release timing
includes the press/release basis, separate hold milliseconds and whether release
was derived from native list selection. Selection context contains only list
row count, refresh-in-flight, process uptime and journal byte count.

The explicit HttpApi group under /diagnostics/profiler accepts batches up to
128 KiB and 128 events. Its bounded asynchronous queue isolates file writes from Task work.
The ingestion response awaits that queue asynchronously and acknowledges stored
data only after the atomic file write. Clients retain batches until a stored
receipt and retry failed/uncertain deliveries.
A batch UUID deduplicates retained retries. Within a run, a producer sequence
may repeat only with identical event content. Conflicting content is refused
with an allowlisted recovery message before admission, including import/dry run.
A fully retained identical event batch is a no-op. Pending data is not called
stored. Legacy contradictory files and repeated contradictory action phases
produce a refusal instead of a summary that hides observations. No synchronous filesystem operation
runs during ingestion. JSON parsing/schema validation and bounded admission still
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
