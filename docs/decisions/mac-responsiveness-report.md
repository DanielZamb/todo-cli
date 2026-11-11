# Mac responsiveness, Phase 0

The headless measurements have not reproduced the owner's 15-second loss of
interactivity as an old/new client difference. They do prove request
amplification and fresh-session socket retention. A fixed 256-descriptor
exhaustion explanation is contradicted by measured framework limit increases.
The coordinator's live samples found the main thread idle for 84% to 100% of
seven eight-second samples, and the app reached 191 descriptors without a storm.
Task-row click selection is the immediate functional reproduction target.

No product source, contract, pin or shipped behavior changes in this phase.
This worker has not launched Todo.app, signed, installed, used Keychain, read
owner storage or pushed. The coordinator later authorized one visible scratch
probe with trapped credentials and no sheets. Its windows are now closed. The coordinator's separately authorized live session
supplies real-app evidence. The coordinator decides the next phase.

## Workload and method

The [measurement command](../../apps/macos/PerfMeasurement/README.md) archives
225b512fb156cd1012974adf3e1504f1014fb594, origin/main frozen at
2c488fc72fe264741d5d8db8f90b441bf426af32, and
e69230f93ce0ea29e955c34c4610122c6f47cb5c. Release builds retain their exact Swift
pins. The production model, generated client and views run in an unhosted test
process with trapped credential-store methods. One production RootView window
stays unordered; a second unordered window runs production live Diagnostics
when selected. The inline Task inspector is exercised. Actual picker and graph
sheets remain closed. A separate list-composition control reads their model
state and measures the picker view directly.

The original contrasting easy fixture has 180 and 80 open Tasks, 70 Tags and
12 Projects per Profile, short descriptions, three Dependency edges and 925
initial operations. The completed Root series below uses that fixture. The
subsequent owner-shaped fixture has 178 work Tasks (50 open, 126 done and two
cancelled) and 92 personal Tasks (49 open and 43 done), long descriptions, 139
link Attachments, 131 external ids, five active and two deleted Profiles, and
983 operations. Work has six Projects, 39 Tags and 278 Tag links; personal has
four Projects, 28 Tags and 95 links. Synthetic prose matches the supplied
description lengths. Old CLI list replies are about 362 KB and 118 KB, against
owner counts of 369 KB and 132 KB. The common server fixture omits Dependencies
and the one Series/Occurrence to remain readable by the old binary. These are
explicit fixture gaps, not owner content. Backlogs of 0, 50 and 300 use saved cursors and real operations.
The backend is held fixed for the client comparison. A documented proxy adapts
only the health contract hash and five DAG Task fields rejected by old clients.
That isolates client behavior against the current server; it cannot isolate a
server regression. The subsequent server control compares old and new binaries
on identical common-format scratch data without Dependency edges.

A main-run-loop observer after SwiftUI flushes and a separate 2ms actor heartbeat
measure long awake and missed-service intervals. Loading, busy and canWrite=false
are separate sampled durations. Neither clock proves visible input latency or a
beachball. Fresh Compact/full construction and layout are timed separately.
The state sampler can miss transitions while blocked, so short durations carry
heartbeat-sized uncertainty. Per-refresh HTTP interval unions, model JSON
round-trip time on main, and total refresh wall time overlap; they are not an additive network/CPU partition.
Generated-runtime decoding and UI work are not fully attributed by those spans.

The owner explicitly requested busy-host measurements after the first quiet-load
attempt was disrupted. The current command disables the start-load ceiling,
records load every two seconds, and alternates revisions and Diagnostics states
for five planned passes. Reproduction was reprioritized after three balanced
passes; the remaining two have not run. The table is a three-run result. Unrelated owner processes stay untouched. Differences inside
the observed ranges remain inconclusive. Profiler pilots and incomplete timing
attempts are retained separately and excluded from final medians.

## Count findings

The closed-feature workload has the same refresh amplification in all three
clients. These counts cover timed steps; Diagnostics polling adds requests.

| Action | Consumed operations | Full refreshes | Base requests |
| --- | ---: | ---: | ---: |
| Initial refresh | 0 | 1 | 8 |
| Stream ready | 0 | 1 | 10 |
| One CLI edit | 1 | 1 | 8 |
| Profile switch, no backlog | 0 | 1 | 10 |
| Profile switch, 50 backlog | 50 | 51 | 410 |
| Profile switch, 300 backlog | 300 | 301 | 2,410 |
| Own Complete including echo | 1 | 2 | 17 |
| Burst of 20 CLI edits | 20 | 20 | 160 |
| Quiet injected EOF and reconnect | 0 | 1 | 10 |

The replay drain is not the whole read-only interval. Both old and current code
set connection live after the initial ready refresh, before consuming replayed
operation events. A switch can therefore remain busy with refresh work for tens
of seconds while canWrite has already become true. Waiting for the final cursor
also overestimates the first time current rows appear, because an early refresh
can read the final state. The burst check reports a conservative current-list
bound by requiring both the last title and final consumed sequence.

## Measured timing and limits

The following is supporting evidence, not a reproduction of the complaint.
`root-busy-matrix-r20` contains 18 successful sessions and one interrupted
session. Only successful sessions enter these tables. Every successful session
consumed 381 operations and ran 389 full refreshes with zero assertion/HTTP
errors. Diagnostics closed produced 3,126 requests per session. Open Diagnostics
added about one request per second while visible. The owner's much higher health
poll rate was not reproduced.

| Client | Diagnostics closed, worst actor gap per session, median [range] ms | Diagnostics open, same measure ms |
| --- | ---: | ---: |
| 225b512f | 202 [188, 233] | 326 [212, 445] |
| origin/main | 286 [210, 425] | 316 [243, 1,083] |
| e69230f9 | 383 [269, 511] | 392 [243, 437] |

Host one-minute load at session starts ranged from 13 to 286. This is the
owner-authorized busy-machine case, with uncontrolled unrelated work. Closed old/current ranges separate by 36 ms, while Diagnostics-open ranges
overlap. Current closed sessions show a smaller headless difference. The host
loads differ and the limiter varies, so these medians do not establish which
client change caused it. No performance win is claimed. The longest observed gap in this completed
series was 1.083 seconds, not 15 seconds. No visible input was delivered here.

For closed Diagnostics, each cell below is the median of three sessions. The
switch drain waits for the final replay cursor; the read-only/loading interval
ends much earlier. The Complete busy interval is its write-blocked interval.

| Action and measure | 225b512f | origin/main | e69230f9 |
| --- | ---: | ---: | ---: |
| No-backlog switch drain, ms | 358 | 497 | 745 |
| No-backlog switch read-only/loading, ms | 261 | 369 | 564 |
| 50-operation switch drain, seconds | 7.50 | 9.36 | 10.31 |
| 50-operation switch read-only/loading, ms | 252 | 262 | 401 |
| 300-operation switch drain, seconds | 58.15 | 59.41 | 58.93 |
| 300-operation switch read-only, ms | 283 | 463 | 405 |
| Complete and echo drain, ms | 397 | 420 | 430 |
| Complete busy, ms | 238 | 176 | 224 |
| 20-operation burst to final cursor/current list, seconds | 7.55 | 6.63 | 8.67 |

Raw per-action ranges, load and separate loading durations remain in the session
JSON and generated summary. Burst read-only and busy time were zero. A replay
duration is therefore not a beachball or an equally long read-only interval.

Across the three initial loads, no-backlog switches and Complete/echo refreshes
(12 refresh samples per client), median total refresh / outstanding proxy HTTP
union / main-actor model JSON round-trip time was 136 / 113 / 2.8 ms for old,
145 / 118 / 4.3 ms for main, and 186 / 140 / 4.3 ms for current. These overlapping
clocks exclude a complete attribution of generated decoding and cannot be
subtracted to invent an exact CPU/network partition. Fresh full-list layout in
the no-backlog switch had medians 165 / 181 / 392 ms. It includes construction
and is outside the retained-root actor interval.

The owner-shaped clean server control `server-owner-five-r28` completed five
alternating bursts per side, with zero errors, 2,400 validated requests and
276,129,600 response bytes. The case is 60 concurrent personal Task-list reads
on preconnected sockets. Each entry is median burst p99 [range], milliseconds.
A burst contains only 60 requests, so its nearest-rank p99 is its maximum; this
is not an estimated population p99.

| Server and added CPU workers | Plain list | Explicit empty text, or old equivalent |
| --- | ---: | ---: |
| old, 0 | 764 [754, 988] | 755 [736, 864] |
| new, 0 | 975 [825, 1,431] | 932 [815, 1,420] |
| old, 8 | 1,316 [1,250, 1,581] | 1,319 [1,178, 1,851] |
| new, 8 | 1,605 [1,397, 3,178] | 1,581 [1,338, 3,007] |

The old/new ranges overlap, with host starts around load 7 to 19. This does not
reproduce a 15-second client failure and does not justify a server bisect or
server optimization. Earlier threaded pilots saw transport waits up to 37
seconds while handler spans were much shorter. That wait remains unresolved;
it must not be discarded as contamination. The timestamped threaded generator
and header-correlated server hook exist, but the full attribution rerun remains
pending.

### Connections and the actual runtime limit

`connections-native-256-r35` directly ran production model refreshes and the
production nil-delegate transport configuration against the new scratch server.
This is one pilot per cell with no added CPU workers, not a five-run estimate.
Both clients completed 300 refreshes and 2,400 successful requests per cell,
with zero failures and validated 178/39/6 Task/Tag/Project counts.

| Client and session policy | Median [max] refresh ms | Sockets at refresh 20 | Sockets at refresh 300 |
| --- | ---: | ---: | ---: |
| old, fresh per access | 173 [209] | 160 | 2,192 |
| current, fresh per access | 157 [213] | 160 | 2,393 |
| old, one reused session | 169 [241] | 1 | 1 |
| current, one reused session | 153 [259] | 6 | 6 |

Fresh connections accumulate on both clients. Reuse differs because old reads
are serial and current catalog reads are parallel. This pilot found no rising
refresh latency at high socket counts. It does not exclude a busy-host accept
queue or port-pressure effect; paired task metrics and CPU controls remain
needed for that claim.

The test sets its soft limit to 256 in the test body, but it does not stay there.
`connections-limit-trace-r37` interposes only verification-process setrlimit
calls and records call stacks. Foundation `+[NSFileHandle initialize]` raises
256 to 2,560; CFNetwork `TransportConnection` raises it to 4,864 on the first
connection. Hard limit stays unlimited. All setter calls return success.
Consequently a GUI launchd default of 256 does not prove the app remains limited
to 256. Do not enforce a hard 256 cap and label it the owner's production case.
The coordinator independently confirmed the real app passes 256. A controlled
40-operation scratch burst reached 388 descriptors and 321 sockets without an
error. It produced exactly 40 full refreshes and 320 GETs over 13 seconds;
server spans had median 15 ms and maximum 142 ms. Sockets drained over 55 seconds.
The real app also displayed Offline / Read only twice, 63 seconds apart. This
confirms the idle-minute drop on screen, separately from the unexplained work
refresh storm.

### Task row selection

The original offscreen selection probe was insensitive. It extracted
`TaskListView.taskContent`, bypassing the view that owns selection state. Its
results cannot identify a product regression. The corrected `RowProbeRunner`
hosts the full production RootView, runs a real AppKit event loop and traps all
credential storage. A distinct unsigned scratch app bundle contains only that
runner; it is not Todo.app and does not use the production entry point.

The coordinator explicitly authorized visible windows for this one test.
`connections-row-root-r51` completed old and current with zero request errors,
16 validated reads in total and no sheet. Both listed 182 native rows.
Programmatic selection selected native row 2 and opened the model editor on
both. Title and empty-row NSEvent pairs and CGEvent HID clicks selected neither.
Critically, both windows remained non-key and both applications reported
inactive despite activation requests. CG posting permission was already granted;
no permission was requested and no prompt was clicked. The local monitor saw
only the two explicitly queued NSEvent mouse-up events, not the posted HID
clicks. This is not a sensitive old-positive click control. It cannot establish
that DependencyDragModifier caused the real failure.

The no-modifier and itemProvider visible variants were not run after that
control failed; a result from another inactive window would not decide the
question. The next useful gate is the coordinator's real-app A/B. A concrete
candidate is to replace `.onDrag` with `.itemProvider` in DependencyDragModifier,
keeping the existing provider payload, canWrite guard and drop handling. The
installed SDK exposes the row-specific ItemProviderTableRowModifier overload.
This remains a hypothesis until that build passes real Task-row clicks and
preserves drag/drop behavior. No product edit has been made.

## Source findings to test

The serial full refresh per event, own-write refresh plus echo refresh, client
factory per access, and 60-second URLSession request timeout all predate the
reported regression. They amplify expensive replies; their presence alone does
not identify the change responsible for old-fine/current-slow behavior.

New work includes the retained search snapshot and phase publication from
88669804, server-narrowed Project/Tag reads from 5d42f32b, parallel catalog reads
from 2e2ba1a9, and Dependency read fields, badges, geometry and open-view refreshes
from the DAG integration. The eager Dependency picker directly measured roughly
one second per fresh layout in an earlier 180-Task pilot. Two sequential mode
probes must not be described as one native window's stall. No picker was open in
the ordinary Root workload. Extra picker/graph reads apply only while those
features are open.

On the server, ba5535ea introduced runTaskRecordSteps with a setImmediate
checkpoint after each yielded filtering step. At e69230f9, commands explicitly
use the synchronous filter when text is absent; that candidate does not apply
to a plain unsearched list. An explicit empty text query still selects the
cooperative path. Dependency index/energy work and the cache hygiene observer
are additional candidates. These are hypotheses until the identical-data server
comparison and boundary measurements separate them.

The Electron comparison also needs qualification. At e69230f9 it marks the stream
connected immediately on ready. However, every changed notice starts refresh,
and generation checks discard obsolete publication after requests have run.
The inspected renderer has no in-flight request coalescing there. Complete holds
pending across await refresh, and pending makes the list read-only. These are
source findings, not a measured Electron usability result. Electron also sends
explicit empty text for its matching list; ordinary Mac reads omit it. The
coordinator traced the worst 60-list burst to Electron launching before any
search was typed. Its route-only logs cannot recover query text. The owner's
fast Electron experience remains an observation to explain.

## Proposal for an automated real-app check

Build a separate verification app from the same SwiftUI scenes, TodoModel,
generated client and resources, with a distinct bundle identifier. A verification
compilation condition must require a run-owned scratch HOME, loopback address and
private manifest. Refuse startup outside that root. Exclude managed-server
startup, owner-data migration and default server discovery. Compile the scratch
server and CLI from the same revision and provision through their public APIs.
Require exact contract identity and an owned listener before launching.

Put credential storage behind SessionVault. This target uses a memory adapter,
or a mode-0600 scratch file for an explicit relaunch case, with no Security
credential calls. Production keeps its Keychain adapter. Verification adapters,
startup flags and measurement exports must be absent from the shipped target.
This needs an accepted verification-policy exception and an update to
verify-macos before implementation; the current native HOLD still applies.

Drive actual accessibility actions for sign-in, initial load, Profile switches
with 0/50/300 backlog, Complete, 20 concurrent CLI edits, search, picker choices,
Dependencies, scrolling and idle recovery. Include Diagnostics closed/open and
fixed CPU load. Correlate accessibility state with durable HTTP/CLI results,
request counts, cursors, loading/busy intervals and main-loop receipts. Record
input-to-result latency, a video and a thread sample on a stall. A model-only test
cannot pass this gate. A visible run requires the owner's approval. The existing
Terra hands-on and Opus UI reviews remain separate. Stop only owned processes,
retain failures and remove only the run's scratch data.

This preserves ADR-0002's server boundary, ADR-0003's HTTP contract,
ADR-0005's Session authentication and ADR-0009's client parity. Cover ADR-0015's
retained search and reconnect recovery. Before a quiet-reconnect change, agree
how healthy retained snapshots may skip reads while failed searches still retry.

## Commands and check status

Representative completed commands, from the checkout root:

```sh
python3 apps/macos/PerfMeasurement/run.py docs/evidence/mac-perf/root-busy-matrix-r20 --runs 5 --root-window --compare-diagnostics --personal-tasks 80 --history-operations 925 --max-start-load 0
python3 apps/macos/PerfMeasurement/server.py docs/evidence/mac-perf/server-owner-five-r28 --runs 5 --cpu-workers 8 --owner-fixture --history-operations 983 --scenario list60-personal --scenario empty60-personal
python3 apps/macos/PerfMeasurement/connections.py docs/evidence/mac-perf/connections-native-256-r35 --runs 1 --refreshes 300 --server-ref e69230f9 --load 0 --nofile 256 --native-session
python3 apps/macos/PerfMeasurement/prepare_rows.py docs/evidence/mac-perf/row-root-prepare-r50
python3 apps/macos/PerfMeasurement/connections.py docs/evidence/mac-perf/connections-row-root-r51 --runs 1 --refreshes 1 --server-ref e69230f9 --load 0 --nofile 256 --native-session --policy fresh --visible-row --row-runner
```

The Root controller exited 130 after three balanced passes. Its 18 included
sessions exited 0. The server, native connection and final row controllers
exited 0. Both final row-runner release builds exited 0. Python syntax validation
exited 0. Earlier failed and interrupted experiments are retained with their
actual exits; empty output is a failed measurement even if a child exits 0.
The exact root gate `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`
exited 0 before any optimization. It includes contract checks, typechecking,
lint and package tests. Its raw log is `phase0-root-check.log`. No server
optimization was made. Ten owned Bun compilation temporaries totaling
886,608,640 bytes were removed after open-file checks across the setup/check
batches; local cleanup receipts record them. Manual comment inspection found
only source-generation markers in measurement code. The single-worker ruling
precludes the skill's independent comment reviewer; that review remains absent.

## Hillclimb handoff and remaining gate

No metric is frozen and no optimization attempt is accepted. The current
harness separates easy and heavy work by requests, bytes and replay drain, but
has not separated old-fine/current-unusable as experienced by the owner.
Optimizing its subsecond heartbeat would violate the requested reproduction
rule. No percentage improvement is claimed.

Propose the eventual primary metric as p99 input-to-current-result latency for
a Task-row selection during a fixed replay/load session, counting incomplete
selections as failures with an elapsed lower bound. First reproduce the click
failure with a sensitive positive control. Candidate target is all selections
succeed and p99 below 250 ms, with a floor of six distinct mechanism attempts
before declaring the performance loop complete. The coordinator must agree the
workload and predicate after the reproduction; this is a proposal, not a frozen
benchmark. Full-refresh/request counts at rest and per action, stalls over
100 ms, and loading/busy/read-only intervals are secondary guards.

The existing full root check must be green before any optimization. Server
changes also require compiled verify-server-api. A headless row control cannot
replace the final real-app click gate. If no sensitive headless click control or
freeze case can be established, request approval for the smallest Mac client
instrumentation slice in the [shared Diagnostics design](client-diagnostics-proposal.md).
It includes both input dispatch and selection commit, operation latency
histograms, pending/error counts, availability intervals, refresh causes and
request/connection timings. The coordinator owns the broader cross-client build.

The coordinator dropped the two extra Root passes and the fixed-delay matrix.
The three-Profile rapid-switch count control remains pending. Native Task-row
click A/B remains a coordinator gate. Native connection phases under added load
and the threaded37-second attribution are deferred to C2 evidence unless cheap
to repeat. None is silently a passed check. No subagents, independent reviews or threads were launched by this
worker under the single-worker ruling. The canonical decision log stays in the
run store outside the tree. Phase0 was accepted before C1 product edits.

## C1 implementation, selection hypothesis

After Phase0 acceptance, DependencyDragModifier uses the List row-specific
`itemProvider` instead of a content-level `onDrag`. The provider payload,
canWrite guard and drop handling are unchanged. This is a candidate remedy for
the owner's unselectable Task rows. Actual click selection is proven only by
the coordinator's pending real-app pass; no headless click proof is claimed.

The new DependencyRowProviderTests first failed with two literal assertions
on the original content gesture, exit1. They then passed with the existing
Dependency state and drag copy tests, 15 tests, exit0. The complete state and
generated-contract suite passed152 tests in24 suites, exit0. The full
`verify-design.py` run with all selectors unset passed all872 PNGs, exit0,
through scripts/swift-slot.sh. Its receipt explicitly reports no app launch,
signing or Keychain. Bulk images stay in the ignored `.scratch/proofs/`
directory, outside the compact report evidence.

Commands were `scripts/swift-slot.sh swift test --package-path apps/macos
--scratch-path apps/macos/DerivedData/StateProof --disable-automatic-resolution
--jobs 2 --filter DependencyRowProviderTests` for the initial failure; the
focused green filter added DependencyStateTests and DependencyDragCopyTests.
The full state filter was `WriteStateTests|GeneratedContractTests`, with
`--skip-build`. Design used `scripts/swift-slot.sh
apps/macos/scripts/verify-design.py .scratch/proofs/mac-c1-design`.

## C2 implementation and measurement inventory

The owner's target is input to committed and laid-out result, median at most
20 ms and p99 at most 300 ms for each interaction category. Completed samples
and incomplete actions stay separate. The request-count target remains a
secondary guard and removes a demonstrated source of server queueing. No
optimization or refresh scheduling change is included in C2.

The Mac recorder is enabled only after an authenticated owner Session. Tests
inject a private journal directory; ordinary headless fixtures default to a
disabled recorder. The application uses its own Application Support directory,
`~/Library/Application Support/Todo/Diagnostics/`. A utility queue writes
`current.ndjson` and `previous.ndjson`, each at most 1 MiB, with 0700 directory
and 0600 file permissions. The recent-event and pending-writer queues each hold
at most 512 records. Oversized records, queue overflow and I/O failures are
counted. Active actions are bounded at 256 and outstanding requests at 1024.
Each category/mode/input stratum retains its last 512 verified completions.
The finite shared registry bounds the number of strata. Nothing is uploaded.
Sign-out state and credential replacement clear the local journal and memory.
A generation guard rejects delayed work from the previous owner scope.

Metadata contains random action, trace, request and refresh ids, closed category
pairs, generated operation names, status codes, durations and numeric resources.
It contains no Task/Profile ids or names, content, typed text, coordinates, key
codes, URLs, paths, bearer credentials or response bodies. Native identities
used to validate selection stay only in weak view registrations and pending
closures. They are never serialized. The journal survives termination, subject
to its asynchronous writer; it is not a durable transaction log.

The transport sends the approved X-Todo-Trace, X-Todo-Request and X-Todo-Action
UUIDv4 headers. URLSessionTaskMetrics records fetch-to-request, DNS, connect,
send, first byte, transfer, bytes and connection reuse. Server-Timing retains
all six named todo-* spans when present and the accepted request id. A missing
server span stays unknown. The e69230f9 server has no Server-Timing support.
The difference between client wait and handler span alone does not identify a
queue. Model Task conversion is timed separately. Generated HTTP decoder CPU
has no dedicated callback in this slice and remains unknown. Main-thread
heartbeat delay and request wall time are not CPU time.

Native event receipt starts row selection before the SwiftUI selection handler.
A swallowed click remains incomplete and its age is sampled off the main actor.
The selection commit and matching inspector identity are separate events.
Publication is followed by a main-run-loop commit opportunity, after ordinary
layout work, only with a visible matching native view and no pending ancestor
layout. The recorder does not force layout or claim physical presentation.
A missing native input receipt is counted as unverified and does not enter the
input-latency percentiles. Headless results do not qualify the final click gate.
The heartbeat has one pending main-queue ping, 16 ms while active and 1 s while
inactive. Resources are sampled on the utility queue at 1 Hz, with sampling
cost, its own descriptor, TCP sockets and getrlimit observed at runtime.

The table uses the exact shared display labels from diag-core 1142e00. Registry
ids and event names stay in export/journal only. Over-budget or incomplete rows
are listed first and marked with words and colour. Compact uses vertical cards.
Request details distinguish unknown phases. Each total has its own row.

The following inventory records candidate 1 coverage rather than claiming every
shared subtype is complete. The source registry carries all 202 Mac subtypes.
The coordinator's U04 join can consume the same ids without a second recorder.
ADR-0009 parity for Electron and CLI is owed by the separate cross-client unit;
this Mac slice is not complete cross-client delivery.

| Category | Start | End and candidate 1 coverage |
| --- | --- | --- |
| I01 Sign in | Not wired | Omitted; owner gating is covered. |
| I02 Sign out | Not wired | No action timing. State clear is covered. |
| I03 Profile | Picker handler plus native input | Winning Profile, live state, applied rows and main layout. Protected navigation that stays in a draft dialog remains incomplete. |
| I04 View | Sidebar binding | Winning identity published and main layout. |
| I05 Filters, order, Project and Tag | Apply/sidebar binding | Winning identity published and main layout. Individual draft-filter changes and Cancel omitted. |
| I06 Search | Text binding | Winning identity published and main layout. Superseded keystrokes stay incomplete. Focus, paste distinction and Retry omitted. |
| I07 Selection/inspector | Native row pointer/keyboard receipt, explicit Close | Selection and matching inspector identity after layout, or main layout after Close. Menu opening omitted. |
| I08 Window | Compact toolbar action | Main layout opportunity. Scroll, resize and divider omitted. |
| I09 Draft fields | Title/description binding | Native editor contains expected text and matching inspector layout. Other fields omitted. |
| I10 Draft navigation | Not wired | Omitted. |
| I11 Add | Add submit or quick-add toolbar action | Refreshed main layout or opened quick-add layout. Typing/chips and menu-bar opening omitted. |
| I12 Save/status | Save/Complete/Cancel/Reopen handler | Operation returns and main/inspector layout. No Snooze control exists in the current Mac UI. |
| I13 Transfer | Not wired | Omitted. |
| I14 Delete | Confirmation handler | Updated main layout. Review, Cancel and Purge omitted. |
| I15 History | Not wired | Omitted. |
| I16 Conflict | Not wired | Omitted. |
| I17 Series | Not wired | Omitted. |
| I18 Attachments | Not wired | Omitted. |
| I19 Batch | Open/Preview/Apply handler | Batch layout after operation returns. Fields/selection omitted. |
| I20 Import | Open/Preview/Apply handler | Import layout after operation returns. File/editor changes omitted. |
| I21 Dependencies | Open picker/toggle/View Dependencies | Picker or Dependencies layout after operation returns. Search/direction omitted. |
| I22 Drag/drop | Native drag reclassification | A drag does not complete selection. Drag/drop result timing omitted. |
| I23 Diagram | List/Diagram binding | Native Dependencies container layout. Web diagram presentation unknown. |
| I24 Discovery | Not wired | Omitted. |
| I25 Profile deletion | Not wired | Omitted. |
| I26 Snapshots | Not wired | Omitted. |
| I27 Diagnostics | Native view attachment and recent input | Visible panel layout. Missing input stays unverified. Other controls omitted. |
| I28 Settings | Native view attachment and recent input | Visible Settings layout. Missing input stays unverified. Changes omitted. |
| I29 Server lifecycle | Not wired | Omitted. |
| I30 Recovery | Stream/model/request events | No user-action latency. Causes, availability and requests recorded. |

Task Delete confirmation is also wired to the common action recorder. It ends
at the updated main layout. A refusal is visible through request status and the
resulting error UI; the generic layout outcome describes layout application,
not proof that the server accepted a write.

Candidate1 deliberately cuts the categories listed above to get the diagnostic
pipeline into the owner's next install. The owner's all-category objective is
not met. Remaining native coverage and a real input/inspector pass are required.


The final C2 helper run passed14 tests in three suites, exit0. It issued30 full
refreshes against the178-Task owner-shaped fixture;15 enabled refreshes recorded
exactly120 requests. The fixture has222,312 description characters and108
Attachments. It proved Access Token denial, real URLSession request phases,
metadata exclusion of every synthetic Task id and credential, runtime resource
sampling, rotation, clear races, queued-input retention, optimized synchronous
UI context and full/Compact panel capture. It left no owned server or scratch
HOME. It did not call Keychain, sign or launch Todo.app.

Five alternating release cells per side measured three full model refreshes per
cell. Disabled median163.7 ms, range143.7 to173.2 ms; enabled179.0 ms, range160.9
to185.9 ms. Fresh full-list layout median191.8 ms, range189.3 to302.1 ms disabled,
and192.9 ms, range187.6 to199.3 ms enabled. Load was6.00 to6.17. The ranges overlap;
these runs do not establish an overhead difference or a performance win.
Disabled collection creates no native input markers. The layout comparison
includes the marker cost when enabled. This is not the owner's click SLO and
is not comparable with Phase0's different fixture as an optimization result.
See the [small receipt](../evidence/mac-perf/client-diagnostics-summary.json).

The repeatable proof command is `.agents/skills/verify-client-diagnostics/scripts/verify.py
<new-evidence-directory>`. It runs `scripts/swift-slot.sh swift test
--configuration release --no-parallel --disable-automatic-resolution --jobs 2
--package-path apps/macos --filter
'ClientDiagnosticsTests|ClientDiagnosticsLiveTests|ClientDiagnosticsPanelTests'`.
The complete state/design/unsigned-build/root gates follow with C3 before the
candidate SHA. The new [verification skill](../../.agents/skills/verify-client-diagnostics/SKILL.md)
is proven through this helper. Fresh Claude discovery and an independent
comment review were not run under the explicit single-worker rule.

Failed proof attempts are retained. A utility callback inherited MainActor and
trapped; making that callback sendable fixed the real production boundary.
An optimized test's synchronous TaskLocal scope aborted at swift_task_dealloc;
removing await did not fix it. Explicit async scopes passed, as did the separate
optimized test of the actual synchronous UI handler. No toolchain root cause
is claimed. A Compact intrinsic-size assertion first failed; the constrained
capture and final assertion passed, and both final captures were inspected.

## C3 and install candidate 1

The [idle-stream report](stream-idle-report.md) records the timeout cause,
failing controls, quiet resume rule and automatic discovery recovery. The
release production model stayed writable on the synthetic 178-Task Profile
for five real idle minutes, with zero reconnects, full refreshes or requests.
The native short-timeout control received the next committed operation on
the original stream while an ordinary delayed request still timed out.

The full Mac design suite passed with 872 expected PNGs and actual render
exit 0. The complete state and generated-contract selection passed 174 tests
in 29 suites. The root check, real compiled HTTP SSE recipe and renewed
search formal controls passed. The unsigned app build and real generated
History union check complete the candidate receipts. These gates do not
establish native pointer delivery, a physical rendered frame or the owner's
interaction percentiles. Those remain the coordinator's installed-app gate.

The journal keeps inventory ids and event names in metadata and export. The
This client view uses the exact shared display words from registry commit
1142e00f, places its per-category timing table first, marks and sorts
over-budget or incomplete rows first, puts milliseconds in the headers and
uses vertical cards in Compact. ADR-0009 Electron and CLI parity is owed by
the separate cross-client unit. The explicit category coverage gaps above
remain; this candidate does not qualify every interaction against the
20 ms median and 300 ms p99 objective.
