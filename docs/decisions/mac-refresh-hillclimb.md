# Mac interaction hill climb

The owner target is input to a committed and laid-out result for every Mac
interaction category: median at most 20 ms and p99 at most 300 ms, with
incomplete actions counted. Native input and presentation remain coordinator
acceptance gates. This headless measurement cannot establish that target.

## Frozen workload

Run one command from the checkout root:

```sh
.agents/skills/verify-mac-refresh/scripts/verify.sh docs/evidence/mac-perf/c4/new b520693e
```

It builds both variants before timing and runs five alternating pairs through
the production model, generated transport and unordered RootView. The fixture
has 178 work Tasks, 92 personal Tasks and 925 initial operations, with the
owner-shaped status mix, descriptions, Tags and Attachments. Credential-store
methods trap. The helper launches no Todo.app, signs nothing and uses only
scratch HOME, SQLite and HTTP. The [verification skill](../../.agents/skills/verify-mac-refresh/SKILL.md)
records the recipe and its native acceptance gaps.

The fixed table steps are the initial read, stream ready, one CLI edit, a switch
with each of 0, 50 and 300 operations behind its saved cursor, Complete and its
echo, 20 CLI edits, and a quiet EOF reconnect. Fixture creation, sign-in and
return-to-work setup are outside this selected table. Each step's catalog and
All-tasks rows must equal an independent authoritative server read. Counts
refer to actual catalog reads, rather than queued refresh intentions.

## Baseline and sensitivity

The easy zero-backlog qualification consumes 22 operations and makes 26 catalog
reads and 215 requests. The hard session consumes 372 operations and makes 378
catalog reads and 3,035 requests. Five unchanged-code pairs reproduce that hard
count vector ten times, with zero errors and identical bytes in the 65 compiled
Swift source files on both sides. The [small baseline receipt](../evidence/mac-perf/mac-refresh-baseline-summary.json)
records work, ranges, active load and the frozen source hashes.

| Step | Full catalog reads | Requests |
| --- | ---: | ---: |
| Initial read | 1 | 8 |
| Stream ready | 1 | 10 |
| One CLI edit | 1 | 8 |
| Switch, backlog 0 | 1 | 10 |
| Switch, backlog 50 | 51 | 410 |
| Switch, backlog 300 | 301 | 2,410 |
| Complete and echo | 2 | 17 |
| Burst of 20 CLI edits | 20 | 160 |
| Quiet reconnect | 0 | 2 |
| Total | 378 | 3,035 |

The Phase 0 table adds to 379 full reads and 3,043 requests. Its earlier written
378 total omitted one row in the sum. C3 already removes one quiet-reconnect
read and eight requests before C4; no later attempt may claim that work.

The two identical-code controls have first full-layout medians of 189.9 ms
[180.2, 213.3] and 184.2 ms [166.3, 237.0]. Worst actor-gap medians are 157.1 ms
[153.5, 219.2] and 176.0 ms [148.0, 190.7]. Their ranges overlap. These differences
are inconclusive. The 200 ms layout threshold is already met by the median in
this owner-shaped baseline. It is not evidence of a C4 improvement over the
older Phase 0 fixture and recipe.

At backlog 300, rows become current in median 456.0 and 448.1 ms, while complete
replay drains in median 74.7 and 72.8 seconds. The model is read-only for only
part of that time. Report actor blocking, loading, busy, current rows and replay
work separately. A final cursor does not measure the first current rendering.
Active-interval one-minute load ranges from 2.4 to 47.4 on the baseline side
and 2.7 to 41.7 on the control side. Setup and lock-wait load stays available
separately. Load samples are taken every two seconds.

## Interpretation and gates

The HTTP/1.1 proxy counts client requests, adapts only compatibility metadata
and injects EOF. Its accept backlog is 1,024. A prior controlled probe found
that the default five-slot accept queue distorted an eight-connection burst;
that private-proxy result does not identify a Bun-server defect. The stream's
upstream read has no data-idle timeout. Both corrections precede this baseline.
The proxy has one Python worker per downstream connection and opens a fresh
upstream connection per request. Network timings include that implementation.
Direct-Bun production-transport metrics and socket controls must qualify a
connection-reuse result. A faster proxy run alone cannot establish faster
native input or a server improvement.

Secondary targets are at most 304 selected requests, at most two full reads on
each backlog switch, at most three for the burst, exactly one for Complete and
its echo, zero for quiet reconnect, and at most 16 held sockets after 300 direct
refreshes. Preserve the Phase 0 actor-gap, read-only, busy and current-row ranges.
Keep search, Version, cursor, restore, authorization and real SSE gates green.
Fresh full layout remains a five-pair median with a 200 ms threshold. Changes
inside host variation carry no claimed timing improvement.

At least six mechanism attempts must be logged before stopping. Each names a
specific cause, makes one change, runs this frozen measurement and the relevant
regression gates, then is kept or reverted in full. The coordinator's run store
holds `decision.tsv` outside Git. The Diagnostics review correction and this
measurement preparation are not optimization attempts. The count is zero at
this baseline. No HTTP contract change starts without its ADR.


## C4-01: own the ordinary connection pool

Kept. The model owns one ordinary Client and URLSession per credential scope,
with explicit invalidation on replacement and teardown. Injected fixture
factories keep their existing behavior. Event streams retain their separate
per-connection cancellation owner. Standalone authentication helpers retain
their existing fresh-client behavior; this is a model-scope pool, not a global
cache of credentials or responses.

The failing direct control made 16 requests through two model refreshes and
opened 16 new connections with zero reuse. Credential replacement let a delayed
ordinary request finish. After the change the same work opens six connections
and reuses ten; replacement cancels the in-flight request and the new scope
opens fresh connections. The correctly initialized 300-refresh baseline holds
2,401 TCP sockets and 2,408 descriptors after 2,400 requests. The candidate holds
seven sockets and 14 descriptors, with the same work: 99.7 percent fewer held
sockets. Both start with a soft limit of 256 before the first transport request;
CFNetwork raises it to 2,560. A pilot that lowered the limit after startup is
explicitly excluded as a fixture error.

Five alternating pairs all consume 372 operations, make 378 catalog reads and
3,035 selected requests, and match canonical server rows with zero errors.
Request reduction is zero. Complete busy-time median is 274.3 ms
[259.7, 356.3] before and 273.1 ms [270.2, 313.8] after. Actor-gap medians are
145.4 ms [140.5, 240.0] and 170.6 ms [140.0, 242.0]. First full-layout medians
are 177.3 ms [170.2, 217.0] and 182.3 ms [172.9, 188.6]. Ranges overlap; no
latency improvement is claimed. The burst's model-action median rises from
6.74 to 7.63 seconds with overlapping ranges; that interval includes CLI
producer time. It is retained as a timing caveat, rather than hidden by the
resource result. The [small attempt receipt](../evidence/mac-perf/mac-refresh-01-summary.json)
keeps current-row ranges and host loads too.

The state/contract gate passes 200 tests in 30 suites. Release Diagnostics passes
31 in three suites; subscriber counts remain zero before connection, one after
each switch/credential/deletion boundary, and zero after disconnect. The actual
five-minute idle and real HTTP SSE proofs pass. Proof source hashes match the
candidate. This is one kept mechanism, zero reverted, and five more attempts
are still required. Native input latency remains unqualified after this change.
The next work is the coordinator's requested stall CPU/load data and pointer
phase measurement, followed by inspector layout. Drag behavior stays unchanged
until the trace establishes whether selection waits for release.

## Recorder follow-up: CPU evidence for a stalled heartbeat

Each stall now carries optional `mainThreadCpuMS`, `processCpuMS` and
`hostLoad1m`. CPU values are deltas across the same heartbeat gap, measured with
the captured main-thread Mach port and process `getrusage`. Missing or regressed
counters remain unknown. Progress and delivered records share a trace id. A low
CPU delta alone does not establish starvation: a synchronous wait or run-loop
tracking can also produce it. Historical installed-session stalls have no such
CPU fields, so they cannot be classified retrospectively.

The failing export control dropped all three fields. The new Release proof
preserves literal 2,700 ms main-thread CPU, 3,200 ms process CPU and load 47.
A real calibration records 0.013 ms main-thread CPU during a 25 ms sleep and
3.949 ms during 2,000 JSON encodes. One thousand CPU samples average 0.00069 ms
each at host load 7.54. This is a probe-cost control, not a UI latency result.
The complete Diagnostics proof passes with 30 refreshes, 120 recorded requests,
178 canonical Tasks and zero errors. Five alternating enabled/disabled pairs
have refresh medians 150.8/151.0 ms and overlapping ranges; layout medians are
179.8/179.7 ms with overlapping ranges. No measurable overhead change is claimed.

Artificial CPU-worker cells now require a metadata-only admission receipt:
no observed Todo input in the previous 60 seconds. An unreadable active-app
journal waits. The existing count series used zero artificial workers; its
measurement remains unchanged. Four admission tests cover recent, rotated,
unknown and future input. Candidate 4 still needs pointer release/native-table
phases and its full gates before delivery. This recorder work is not a C4
optimization attempt.

## Candidate 4 pointer trace boundaries

The approved trace adds pointer release and public native-table highlight
notifications without changing drag or selection. The press remains the start
of the budget. Release-to-result is also reported, and a result before release
can have a negative secondary interval. The input association outlives a result
that renders while the button is held. Native highlight is independent of the
SwiftUI selection callback. Missing notifications are explicitly unavailable at
release and inspector layout, not an invented zero.

The red controls had five literal failures across three tests: missing release
and native phases, release replacing the original press, and unknown mode after
a recording restart. Weak native marker registrations now survive a recording
restart while input and action state are cleared. Their lifetime follows their
attached views. Old-scope release, callback and native notification records are
excluded. Synthetic controls invoke the monitor and public notifications in an
unordered native table. They do not qualify actual SwiftUI mouse delivery.

The six installed pointer selections remain a small, historical receipt: press
to result p50 222.9 ms, maximum 455.6 ms; selection callback to layout ranges
71.7 to 284.3 ms. Host load and release timestamps are unknown for those six
records, so no dwell or scheduling attribution is possible. Their callback to
layout is nevertheless the next mechanism to measure on the owner-shaped
fixture. Its target is a five-pair median below 16 ms for a 1,260-character
description. The 225b512f/e69230f9/b520693e press-versus-release comparison remains
unqualified because the old native delivery controls were insensitive. The
coordinator's next installed trace must settle that question before any drag
change.
