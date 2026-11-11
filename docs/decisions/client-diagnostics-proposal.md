# Client UI Diagnostics proposal

This is the shared design requested in owner Task f714c177. It accompanies the
Mac responsiveness Phase 0 investigation. The Mac C2 base is implemented in this branch. Electron and CLI parity under
ADR-0009 is owed by the coordinator's separate cross-client unit. No telemetry
endpoint is introduced. The implementation inventory and its candidate1 gaps
are in [the Mac report](mac-responsiveness-report.md#c2-implementation-and-measurement-inventory).

## What the person should be able to distinguish

Diagnostics needs to distinguish a busy main thread, an application waiting for
a reply, a disabled write control, and a result that has arrived but has not
reached the list. Server handler latency covers only part of that wait. The
first panel should show the last slow action as a timeline, its outcome, refresh
and request counts, the longest main-thread stall, and descriptors/sockets next
to the current soft limit. A slow request should show which phases are known;
unavailable phases must stay unknown rather than appear as zero.

Keep the existing server Diagnostics and add a local "This client" section in
both clients. A 1Hz summary update is enough. Reading Diagnostics must not
refresh Tasks or create more diagnostic HTTP traffic. A read-only credential or
an expected empty Profile must not be described as a performance freeze.

## One event vocabulary

Use a versioned discriminated union shared by both clients and CLI tooling.
Every record has an opaque client-run id, monotonic timestamp, optional wall
clock for same-machine correlation, and event-specific fields. Action, refresh
and request ids connect records. They are random ids, not Task or Profile ids.

| Event | Meaning and producer |
| --- | --- |
| `ui.input.observed` | A native input is dispatched inside a coarse UI region such as the Task list. Record its category and timestamp, without coordinates, key codes or content. This exposes clicks swallowed before a SwiftUI handler. |
| `ui.action.started` | A command, click, menu action, shortcut or submitted search reaches its handler. Record the action category, not typed content. |
| `ui.result.committed` | The authoritative result or refusal is represented by the current UI generation. Include success/error and a render-stage capability. |
| `ui.stall` | A heartbeat missed its service deadline. Record interval, expected cadence and longest gap. This is elapsed unresponsiveness, not CPU time. |
| `model.published` | A coherent current snapshot becomes observable. Record generation, view category, total/visible row counts and originating action/refresh. |
| `ui.layout.finished` | That publication completes a layout/commit opportunity. Record generation and duration. |
| `refresh.started` / `refresh.finished` | Record trigger, scope, result, request count and superseded/publication status. Triggers include startup, Profile switch, query, own write, stream operation, ready, reconnect and manual. |
| `request.started` / `request.finished` | Record method and route template, status/error class, bytes, queue/connect/first-byte/transfer/decode phases and connection reuse when available. Never record parameters or headers. |
| `server.handled` | Optional same-request handler start/end/span, correlated by a trace id. It does not include all socket or response delivery time. |
| `resources.sampled` | Open descriptors, sockets, soft/hard descriptor limits and measurement cost. Include sampling capability and process role. |
| `availability.changed` | Raw loading, busy, data-ready and write-allowed state with reason. Integrate durations by reason and action intent. |

Show p50, p90, p99 and maximum per operation category, with sample count, observation window, error count and incomplete-action count. Never pool a handful of clicks into a meaningful p99 or omit a hung action from the denominator. A pending action carries its elapsed age; a deadline records a timeout and a censored latency bound. Keep these bounds distinct from completed latency samples.

Input-to-result ends only when the intended result or refusal is committed for
the winning identity/generation. A discarded stale response does not complete
an action. An initial empty list with no snapshot differs from a valid empty
result. A write waiting on busy differs from deliberate credential read-only
access. Keep main-thread stall and these availability intervals separate.

## Measurement points

On Mac, capture action start at the SwiftUI action/binding boundary. An optional
AppKit event timestamp measures time already spent in the input queue without
recording key codes or characters. Measure publication in TodoModel, and attach
a small layout observer to the production root for publication-to-layout.
CFRunLoop activity and a 16ms main-actor heartbeat cover stalls while the main
window is active or Diagnostics is open. An unordered headless layout cannot
claim an on-screen frame was presented.

Use URLSessionTaskMetrics for DNS, connect, send, first byte, transfer, protocol
and reuse. Measure factory/dispatch and generated conversion separately. The
recorder must extract scalars and release task/metrics objects. It must retain
neither sessions nor requests. Count descriptors and sockets with the process
APIs and read the actual runtime limit, not the shell's limit. The measured harness starts at 256, then Foundation raises the soft limit to 2,560 and CFNetwork to 4,864. Read the limit after framework initialization and around outliers. The launchd default alone does not establish the running app's limit.

In Electron, capture renderer action time before IPC, main-process receipt,
request start, response/body completion and decoded reply delivery. Use the
production HTTP stack's supported timing/connection hooks, with an explicit
capability for unavailable phases. Renderer publication, React commit duration
and the next paint opportunity are separate from a physical screen presentation.
Use an event-loop delay monitor in main and renderer, and resource samples in
the process that owns the connections. Node active-handle counts must not be
reported as operating-system descriptor counts.

For CLI output, input-to-result ends at completed stdout write/drain. A terminal
emulator's paint is outside that measurement. The same event names and units
allow CLI output and desktop exports to be compared without equating these
render stages.

Request phases must retain boundaries. Time before the socket call, TCP connect,
post-connect/request-send to handler start, handler time, post-handler to observed
first byte, body transfer, and local decode must be distinguishable. A first-byte
minus handler difference alone cannot identify which queue was responsible.
Cross-process wall-clock joins need a clock-consistency check. Local monotonic
intervals remain authoritative.

## Storage, access and cost

Keep bounded scalar counters, histograms and a small recent-event ring. Retain
outliers, errors and resource-pressure samples; sample ordinary events. Expose
sample counts and dropped-event counts. A bounded local metadata journal can
survive a force quit, written by a background worker to the application's own
private data directory. Never synchronously serialize or write it on the main
actor. No remote export or external telemetry service is involved.

Record no Task titles, descriptions, ids, attachment paths, search strings,
Profile names, bearer tokens or response bodies. Replace routes with templates.
Gate the panel/export by owner authorization and clear credential-scoped state
on sign-out or credential change. The existing owner-only server endpoint
remains the server authority. Start with local presentation/export; any later
owner-only loopback ingestion into `/diagnostics` is an explicit API decision,
not an implicit change to the current contract.

Resource sampling can run once per second and around an outlier; detailed
per-refresh sampling belongs to the verification build. Store the sampler's own
cost and descriptors. Bound recorder queues and drop samples instead of blocking
UI work. A proposed first-slice budget is a 2 MiB event ring, fixed histograms,
under 1 ms synchronous recording per action, and under 0.5% idle CPU. These are
acceptance targets, not measured costs. Measure enabled/disabled overhead on
the same completed workload and publish drops, memory and sampling cost.

The coordinator's implementation ruling supersedes that first-slice disk
budget: two rotating files of 64 MiB each, no preallocation, routine poll
aggregates once per minute, and resource records only on material change or
once per minute. Routine records cannot rotate out critical evidence. The
verification reports ordinary and open-Diagnostics replay bytes per hour and
the conservative retention of one full file rather than assuming the cap alone
proves a day's retention.

## Smallest first slice

The smallest Mac slice would have recorded this incident without changing the
refresh policy: current descriptor/socket count and limit, URLSession requests
and reuse, longest main-actor missed deadline, and loading/busy/write-blocked
intervals, grouped around the last Profile switch or Complete. Include native Task-list click dispatch and selection/inspector commit so a swallowed click leaves an incomplete action even while the main loop is idle. Add these to the
existing Diagnostics window with a bounded local outlier journal and a metadata
export. A 15-second stall, 15-second response wait and descriptor exhaustion
would then leave different evidence in the owner's next install.

Keep connection reuse, refresh coalescing and incremental publication as separate
measured fixes. The telemetry slice must not silently implement any of them.
Verify literal result provenance, metadata-only output, owner gating, bounded
storage, no session retention and recorder overhead. Create/update the subsystem
verification skill, run the existing platform suites, and preserve the native
HOLD. If headless work cannot reproduce the complaint, the coordinator must
approve this Mac slice before product implementation; it precedes optimization.

## Candidate 4 pointer and stall additions

The Mac recorder keeps press-to-layout as the primary pointer measurement.
`ui.input.released` carries the same action id, the native release timestamp
and press-to-release duration, even when rendering completed first. Subtracting
release time from layout time is a secondary comparison and may be negative.
Historical receipts without a release cannot establish pointer dwell.

The public Task table selection notifications become
`ui.selection.nativeChanging` and `ui.selection.nativeCommitted`, displayed as
"Row highlight started" and "Row highlight settled". They are separate from the
SwiftUI callback's `ui.selection.committed`. Release and inspector records carry
optional `nativeSelectionNotifications`, with `changing` and `committed` each
`observed` or `unavailable` as of that boundary. An unavailable notification
does not establish instantaneous highlight or a global framework capability.
The next real installation must qualify whether the SwiftUI-backed table emits
them. The monitor never replaces the table delegate or a gesture recognizer.

Stalls carry optional `mainThreadCpuMS`, `processCpuMS` and `hostLoad1m`. The CPU
values are deltas across the heartbeat gap, rather than lifetime counters.
Missing values remain unknown. A high main-thread CPU delta supports app work;
a low delta alone cannot distinguish scheduling starvation, blocking waits or
run-loop tracking. Progress and delivered records share their opaque trace id.
These Mac additions still owe ADR-0009 parity in the separate cross-client unit.
