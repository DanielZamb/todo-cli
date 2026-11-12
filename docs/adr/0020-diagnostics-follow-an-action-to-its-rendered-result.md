# Diagnostics follows an action to its rendered result

Status: Proposed, 2026-11-11.

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
and CLI polling never opts in. No new endpoint or persistent profiler API is
introduced. Row quotas and a final schema byte predicate enforce both budgets.
The internal diagnostic rings remain bounded and are accessed in full only by
verification seams; counts distinguish omission from zero or unavailable work.

The shared schemas are published through `todo schema 'diagnostics event'` and
`todo schema 'diagnostics observation'`. U01 changes no HTTP schema. U02 first
adds bounded internal collection and optional headers with the existing contract,
then separately adds one versioned profiler object to owner Diagnostics with a
new generated contract id, as approved by the coordinator. Integration ships
server and both clients together, preserving compatibility refusal behavior.

## Awaiting the owner

Always-on durable journals, journal budgets and retention, crash recovery files,
and loopback client ingestion remain proposals. New profiler runs, import,
export and compare routes and controls require the later owner decision. This
record does not authorize their implementation or a new endpoint. Clock
calibration and visible presentation proof belong to later client units.

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
