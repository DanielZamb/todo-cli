# DIAG-CORE delivery

Branch: `feat/diag-core`. Product checkpoint: `6267813e42947d73569daacd9cde3b70b9bb0da1`.
Implementation and the required TypeScript/compiled proofs are complete.
The remaining integration holds below are not relabelled as passes.

## Implementation

U01 is `2ab3202ae244bbca2c35e668f19784f2781874f8`. The schema and pure frozen-run
summary live in `packages/domain/src/client-diagnostics.ts`; the 38 inventory
rows and subtypes live in `interaction-categories.ts`. `diagnostic-labels.ts`
holds shared plain display text. `diagnostic-context.ts` owns bounded recording
and Effect context. These are the four new domain files. Existing Diagnostics
and store modules are reused. There is no journal, ingestion route, migration
or diagnostic write to the Task database.

Follow-up `198a30058c961eef683bf549afe39cd9659bc78c` fixes the tuple discriminant.
`1142e00fd3255c13693a46752ceb9cc3458220ca` adds shared labels. Consumer report
`00aace4791dc865f35480866b09425172d4daede` fixes required payload fields replacing
optional envelope joins and adds compile-time construction/narrowing of every
variant. These defects were real, even though runtime decoding passed.

`todo schema 'diagnostics event'` and `todo schema 'diagnostics observation'`
publish the standalone inputs. Frozen summaries use nearest rank on raw rendered
durations, p50/p90/p99/max and outcome counts. Pending, lost, crashed, timed-out,
superseded and unavailable starts remain in deadline denominators. Missing
quantiles are null. Fast failures and unknown render evidence cannot prove a pass.
The registry covers categories, not proof that every control is already bound.

U02 A, `78f2f365788372763c0e6de77c77e7caa318c0af`, preserves the contract id
`78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`.
It validates UUID v4 X-Todo-Trace, X-Todo-Request and X-Todo-Action and replaces
missing/malformed ids. It echoes X-Todo-Request. Headers confer no authority.
Owner Session responses add numeric Server-Timing. Required todo-handler is
middleware entry to response handoff, matching the entry span. Observed optional
metrics are todo-auth, todo-queue, todo-domain and todo-db. Durations have at most
three decimals and contain no ids, descriptions, routes or content. Access
Tokens, unauthenticated responses and authentication refusals get no timing.
SSE sends it only on the initial response. Child totals can overlap; do not sum
them into wall time. The diagnostic handler stage includes framework response
work; it is not a measured socket queue.

U02 B, `9acec1966190114cfa1cb16fbc4f15761660a1e0`, adds one optional, version 1
`profiler` object to owner GET /diagnostics and CLI decoding/output. New servers
emit it unless the recorder snapshot fails. Existing fields and meanings and
ordinary CLI goldens remain. That commit's contract is
`cdb285bd2d3a9f3871444a8c61d2fed17ac2838481df0126b85e78fc28bafce6`.
The contract beginning at `a2dea2d6328298671796cc856738fd0e4e68469d`, after
failure-isolation counters, is
`db2f9b18c488cbd43117afd82b011ed6d6f96efc4f0aeb77a37fd5695611788f`.
Compatibility refusal logic remains unchanged. Server and both clients must ship
together. The standard API generator ran through the shared Swift slot and its
output is committed; no manual Swift product edit or app launch was made.

## Projection and transaction safety

The span surrounds the call in OperationStore.appendSync. `applyEvent` itself
is byte-identical to origin/feat/task-dag. The extracted before/after functions
both hash to `287c36937f8aa692f5842a1f8caf890134d4c1f2f0c417e4562d7fa9fc109593`.
`diff -u` on those extracted files exits 0 with no output. There is no function
diff, new await/yield, I/O, allocation, or statement-order change inside applyEvent.
The caller diff is:

```diff
-applyEvent(this.db, event, input.profile);
+diagnosticSync("projection", () => {
+  applyEvent(this.db, event, input.profile);
+}, { statement: "store.projection" });
```

The wrapper records scalar timing around the unchanged synchronous call.
Recorder allocations occur at the caller's observation boundary. Start/end
failures are contained by beginDiagnosticSpan/finishDiagnosticSpan. The original
operation still executes once, and its own failure propagates. The scratch test
independently throws from recorder start and end and requires both literal Tasks
to commit and remain readable. Recording failures are counted without messages.
SQL validation, append, projection, commit and rejection order are unchanged.
Writer wait ends at entry into Bun's immediate-transaction callback. It includes
BEGIN dispatch overhead and does not claim exact kernel lock-wait CPU time.

AtomicCAS initially exited 1 because its textual applyEvent call anchor moved.
The exact statement is now retained inside the callback. The complete current
behavior/model/control run then reached its final source-hash gate and exited 1
on exactly store/store.ts and store/projection.ts. Its model and behavior checks
had passed before that gate. The function identity and caller audit above are
the basis for renewing those two conservative whole-file mappings, not a change
to the model's assumptions or bounds.

## Observation limits

The response lists gaps explicitly. These are not zero-duration stages:

- Socket acceptance to middleware entry and worker dispatch/queueing. Bun's
  public HttpServer middleware runs after request dispatch. It supplies no
  acceptance timestamp or worker-queue hook. Long waits before that boundary
  remain unattributed. The reported replay tails therefore cannot be explained
  from todo-handler alone.
- Separate JSON encoding, socket flush, body completion and client receipt.
  Response handoff is the framework boundary. SSE observes encoded bytes yielded
  to the adapter, with real byte length; this does not prove transmission.
- SQL beyond the initial auth lookup, Task read and operation append call sites;
  projection is one aggregate span. Graph read assembly is observed, graph
  computation is not separately attributed. Matcher evaluation includes its
  preparation work; separate preparation and meter stages remain owed to U05b.
- External CLI launch and stdout drain. Main withStore commands have command
  roots; exhaustive CLI instrumentation belongs to U05a. Scheduler passes each
  get a fresh job root and exclude their timer sleep.
- Cross-process commit provenance. Generation-scoped, bounded local receipts
  join commit observation and per-client frames. They do not establish that an
  unrelated CLI process caused a request. Nothing new is added to sync frames.

Recording keeps at most 2,048 finished spans, 256 active spans, 2,048 delivery
records and bounded receipt/pending-frame maps. Aggregate start/finish/loss
counters are separate from detailed ring eviction. There is no durable crash
recovery in U02. No new records contain Task titles/descriptions/ids, Profile
names, search text, paths, tokens, SQL or parameters, or dynamic error messages.
Existing owner Diagnostics keeps its established Profile metadata.

## Client joins

Electron and Mac should allocate fresh recording UUID v4 ids and send the three
headers on each request. Match the echoed X-Todo-Request and parse todo-handler
from Server-Timing; optional metrics are known only when present. Do not subtract
unrelated monotonic clocks or claim that handoff is receipt. Client action/run,
request, publication, layout and correctness markers remain necessary. Preserve
the existing Mac event names. Map applied to completed; a drag ending does not
complete a selection. Shared labels are exported by interaction-categories.ts.
No new ingestion endpoint is available.

## Verification and cost

Original delivery evidence root: `docs/evidence/ui-speed/diag-core/`. Those
binaries and the cost measurement were built from checkpoint
`a2dea2d6328298671796cc856738fd0e4e68469d` and source hash
`b6c53acd7bd85f83cbe31c03d3bb3a2935bd987d118b5908269ca7c68f885bd4`.
The cache helper emits build=dev; the retained source.json records the product SHA
and source digest. The actual CLI version reports build=dev and contract db2f9b18.
The canonical disk guard ran before the locked checks and compile batches.

| Command, from checkout root | Actual exit | Evidence |
| --- | ---: | --- |
| `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0 | qualified-check.log, qualified-check.exit |
| `TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh <evidence>/final-core-diagnostics` | 0 | final-core-diagnostics/result.json, terminal-png-hold.json |
| `bun apps/server/scripts/verify-diagnostic-joins.ts <evidence>/compiled-joins` | 0 | compiled-joins/result.json |
| `TODO_SERVER_BINARY=<cache>/todo-server TODO_SEED_BINARY=<cache>/seed .agents/skills/verify-server-api/scripts/verify.sh <evidence>/server-api` | 0 | server-api/result.json |
| `.agents/skills/verify-auth/scripts/verify.sh <evidence>/auth` | 0 | auth/result.json |
| `TODO_SERVER_BINARY=<cache>/todo-server TODO_SEED_BINARY=<cache>/seed .agents/skills/verify-sse/scripts/verify.sh <evidence>/sse <cache>/todo` | 0 | sse/result.json |
| `bun .agents/skills/verify-diagnostics/scripts/verify-vocabulary.ts <evidence>/final-vocabulary` | 0 | final-vocabulary/result.json |
| `scripts/swift-slot.sh apps/macos/scripts/generate-api.sh` | 0, twice | generate-api.log, generate-api-final.log |
| `bun packages/api/scripts/openapi.ts --check` | 0 | declared contract matches generated identity |
| `bun .agents/skills/verify-occ-atomicity/check.ts` | 1, 1, then 0 | atomicity.log, atomicity-final.log, atomicity-renewed.log |
| `bun .agents/skills/verify-task-search-formal/check.ts` | 1, then 0 | search-formal.log, search-formal-renewed.log |
| `TODO_DIAGNOSTICS_BENCHMARK=1 TODO_DIAGNOSTICS_POLLING=0 bun apps/server/scripts/benchmark-diagnostics.ts <evidence>/quiet-guard` | 1 | quiet-guard.log, unchanged load ceiling refused the run |
| `TODO_DIAGNOSTICS_BUSY_BENCHMARK=1 bun apps/server/scripts/benchmark-diagnostic-recording.ts <evidence>/busy-cost` | 0 | busy-cost/result.json, runs.json, CPU profile |

Here `<evidence>` is the evidence root above and `<cache>` is `.scratch/bin`.
The authoritative root run passes 400 domain, 69 CLI, 35 server and 168 Electron
tests, with one existing Electron skip. Ordinary export goldens pass unchanged.
No compatibility-refusal logic was changed. The compiled join proof compares the
exact client ids in ten spans, SQL call-site ids and header duration rounded to
three decimals. Malformed ids get safe replacements. Unauthorized reads reveal
no profiler records or timing. Stream behavior tests distinguish commit seen
from encoded-byte handoff in two clients and retain a common local receipt.

Ten spans were recorded for the timed workload's probe request. The saturated
recent ring's serialized profiler snapshot is 1,532,320 bytes. That is encoded
metadata size, not measured heap occupancy. Heap allocation counts were not
collected. There were zero lost starts; 130,251 displaced recent detail records
were counted, while aggregate counters remained complete. Synchronous work was
added for UUIDs, scalar allocations, bounded ring/counter updates and numeric
header formatting. No journal or diagnostic Task database write was added.
The disabled side keeps request-id validation and basic handler timing, so this
comparison isolates detailed recording, not every difference from the old server.

The cost result is **inconclusive within pair-to-pair variation**. Twenty timed
runs form ten alternating disabled/enabled pairs, with 100 literal Tasks checked
in every response, 12,763 disabled requests and 13,165 enabled requests, zero
failures, and at least two seconds per run. These are HTTP/SQLite/JSON list times,
not input-to-render latency. The values below are nearest-rank medians of the ten
run quantiles, not pooled or averaged percentiles.

| Detailed recording | Median run p50, ms | Run p50 range, ms | Median run p99, ms | Run p99 range, ms |
| --- | ---: | --- | ---: | --- |
| Disabled | 1.237792 | [1.101958, 1.507625] | 3.145042 | [2.087000, 7.387542] |
| Enabled | 1.259458 | [1.117458, 1.364083] | 2.702375 | [2.185750, 5.296834] |

The paired p50 difference has median +0.002375 ms and range
[-0.143542, +0.078166] ms. It cannot establish "no overhead" or a quiet guard pass.
One-minute load is recorded at the start and end of every run. It spans 7.58 to
11.31 on this busy host. Other units and this worker's root/formal work were
active; this was not an exclusive quiet window. Generator CPU was about 0.17 to
0.22 of one core, so it was not saturated. A separate untimed, same-source Bun
server profile identifies Effect schema construction/parsing, native JSON parsing
and SQLite among the principal costs. It is not used for the timed values.
The original load<=4 benchmark is unchanged and refused the host. A quiet-machine
confirmation under the unchanged ceiling is owed at integration.

Per-pair deltas, boundary loads, request counts, server CPU/RSS, full summaries,
source provenance and the standalone comparison chart remain in busy-cost/.

## Verification incident and holds

U01's reused Diagnostics helper ran its existing Swift terminal PNG renderer and
produced four terminal images before the nested call was noticed. That exceeded
this worker's initial no-Swift scope. The later attempt was caught queued on the
Swift lock and only that owned queued child was terminated. No Todo.app,
Keychain, signing, installation, push, merge or real Todo data was involved.
The helper now supports TODO_DIAGNOSTICS_NO_SWIFT=1 with an explicit HOLD receipt.
The terminal PNG render is owed to a unit holding the Swift slot. Both generator
runs used only the specifically authorized generate-api.sh through swift-slot.sh.
No independent reviewer was launched because this is a single-worker brief.
The no-comments skill was read; its child-review step was not run for that reason.
Coordinator and independent review remain integration gates.


## Busy-host pairs

| Pair | Disabled load, start/end | Enabled load, start/end | Enabled minus disabled p50, ms | Enabled minus disabled p99, ms |
| --- | --- | --- | ---: | ---: |
| 1 | 11.31 / 11.31 | 11.31 / 10.96 | -0.143542 | 0.199625 |
| 2 | 10.96 / 10.96 | 10.96 / 10.96 | 0.002375 | -1.049833 |
| 3 | 10.96 / 10.40 | 10.40 / 10.40 | -0.039334 | -3.788083 |
| 4 | 10.40 / 9.89 | 9.89 / 9.89 | 0.010083 | -0.442667 |
| 5 | 9.89 / 9.89 | 9.89 / 9.42 | 0.059166 | 0.207001 |
| 6 | 9.42 / 9.42 | 9.42 / 8.98 | 0.078166 | -2.067124 |
| 7 | 8.98 / 8.98 | 8.98 / 8.98 | -0.042584 | -0.222375 |
| 8 | 8.98 / 8.50 | 8.50 / 8.50 | 0.016250 | 0.098750 |
| 9 | 8.50 / 7.98 | 7.98 / 7.98 | 0.019626 | 0.134791 |
| 10 | 7.98 / 7.98 | 7.98 / 7.58 | -0.002417 | -0.676667 |

## Remaining mapping and integration work

AtomicCAS now passes after renewing only the two reviewed whole-file hashes.
Task search renewal concerns only task-filters.ts: its original generator,
checkpoint positions, meter and ensuring cleanup are unchanged, with an outer
synchronous, failure-contained recording finalizer. The matcher candidate and
TLA+ model/bounds remain unchanged. The final full rerun exits 0 after the single reviewed hash renewal. The
pre-renewal failure is retained. Matcher generated-input checks and restored
model controls pass; finite bounds and client proof limits remain unchanged.

The cache coverage conservatively hashes task-filters.ts and store/store.ts.
The DAG immutable coverage hashes store/store.ts, store/projection.ts and
auth/auth.ts, and remains pinned to its prior product. Those cache/DAG pins have
not been advanced to claim current product conformance. Integration must review
and renew those mappings with its immutable integrated product and full recipes.
The auth change marks owner timing only after all original credential checks;
read and write rules remain unchanged. No model assumption was changed here.

Also owed at integration: the quiet overhead confirmation, the held terminal
PNG stage, generated Swift client build/tests and the client recording joins,
and the independent/coordinator review seats. No visible client result or
20/300 ms UI target is claimed by this server-only unit.

## Cleanup and final scope

Removed 17 owned, closed Bun compile temporaries, 1,507,234,688 logical bytes,
after lsof checks; none was open or skipped. Receipts remain in
compile-cleanup.jsonl. Final observed free space is 46.8 GB, above the 30 GB
soft floor. Same-source CLI/server/seed binaries remain in the ignored cache;
binary-receipt.json records their hashes and provenance. Every owned scratch
server, SSE child and benchmark/profiler process finished or was stopped by its
own finalizer. No screenshot, binary, dump or machine path is tracked.

The server API recipe now accepts a same-source cached seed, matching the other
API recipes, so it does not recompile the provisioning source. The Diagnostics
recipe marks the unauthorized visual stage HOLD rather than running Swift.
These are reusable verification changes, not new Todo CLI product capabilities.
No Python workaround for a missing Todo CLI capability was introduced.

## Correctness seat follow-up, DIAG-CORE-S1-1

The seat's finding against ed85a6f9 was reproduced before editing product code.
Its unchanged compiled real-HTTP probe returned an empty 500 with no Task when
entry start threw. Handoff start, entry end and handoff end each returned an
empty 500 after exactly one Task and TaskCreated entry committed. All four had
recording_failures=0. Red build, exit 1, bodies and durable-state results remain
in `docs/evidence/ui-speed/diag-core-s1/http-red.*`. A separate root-creation
regression also failed first, retained in root-red.log and root-red.exit.

`0a79f21048dcb28d4e3a15b2f743379c636a86e3` puts every adapter observation through
observeDiagnostic. The helper catches recorder exceptions without retaining
their text, increments recording_failures, and returns undefined. Failed starts
increment started and lost_starts. Other failed observations increment
dropped_events. Failed ends may also leave an active incomplete span, bounded
by the existing active capacity. Counts describe conservative observation loss,
including failures after partial recording. The helper never retries business
work. No await, I/O or additional yield was added to request observation.
The added synchronous work is the guard call and, on failure, WeakMap counter
updates. No new overhead measurement is claimed for this correction.

HTTP keeps the original response when entry/handoff recording, timing formatting
or byte observation fails. Root creation falls back to running the original
effect. Pure context provision replaces adapter calls to overridable run/withRoot
methods. A failed owner profiler snapshot omits the already optional profiler
object while retaining the existing Diagnostics read and authorization. The
contract remains db2f9b18, with no generator or Swift work in this follow-up.

### Recorder call-site audit

| Location | Observations | Containment |
| --- | --- | --- |
| apps/server/src/server.ts, serverLayer | configure | observeDiagnostic; server startup continues |
| apps/server/src/server.ts, diagnosticsMiddleware | root, entry start/end, response_handoff start/end, failure/cancellation finalizer, request counter, serverTiming, transport | Each call uses observeDiagnostic; span starts count loss, original response/body and error handling continue |
| apps/server/src/sse.ts | stream/frame IDs, commitReceipt, delivery, awaitTransport | One guarded observation closure; the original event continues through the stream once |
| apps/server/src/sse.ts | connect, disconnect, delivered, releaseStream | Each observation is guarded; connect falls back to null and teardown continues |
| apps/server/src/scheduler.ts | root/job start/end, schedulerWake, sample | withDiagnosticRoot guards root and uses diagnosticSpan; wake/sample use observeDiagnostic; real jobs and the sleep remain outside observation closures |
| apps/cli/src/main.ts, withStore | configure, root/command start/end | configure uses observeDiagnostic; withDiagnosticRoot falls back to the original use(store) effect and retains the existing CLI error/render pipeline |
| packages/domain/src/auth/auth.ts | authentication/database spans, owner authorization | diagnosticSync uses guarded begin/finish; diagnosticOwnerAuthenticated guards authorize after the original credential checks |
| packages/domain/src/store/store.ts | domain, writer_lock_wait, handler, database, projection | Existing diagnosticSync/diagnosticSpan/begin/finish calls now share observeDiagnostic; original operation executes once and its own error propagates |
| packages/domain/src/store/projection.ts | selected database span | Existing diagnosticSync uses guarded begin/finish around the original statement |
| packages/domain/src/task-filters.ts | search_evaluation | Existing diagnosticSpan uses guarded begin/finish and preserves evaluation and interruption |
| packages/domain/src/store/diagnostics.ts, snapshot | profiler.snapshot | observeDiagnostic omits the optional object on recorder failure; original snapshot fields remain |
| packages/domain/src/diagnostic-context.ts | start/end/authorize/root and internal transport-to-delivery call | Exported observation helpers guard adapter calls; internal recorder calls execute within those guards. Class run/withRoot only provide Effect context and are no longer called by production adapters |

Recorder construction remains local initialization in Diagnostics. No adapter
constructs a recorder in a request's business effect. The audit searched all
production TypeScript callers; verification fault overrides intentionally throw
and are confined to the compiled fixture executables. There is no production
fault-injection environment flag.

### Compiled controls

The original seat probe now exits 0. At each of its four fault points the response
is 200 with the complete durable Task body, exactly one committed TaskCreated
entry and recording_failures=1. Green results remain in seat-green.json/log/exit.

The reusable compiled controls in apps/server/scripts/verify-diagnostic-faults.ts
pass 47 cases on the final product. Twelve HTTP cases cover configure, root,
entry/handler/handoff start/end, owner authorization, Server-Timing and snapshot
faults. Each successful create equals the durable Task and commits once. They
compare complete normalized bodies and literal statuses 400, 401, 404 and 409
with a nonthrowing run. Nine further real-HTTP cases retain the application's
literal empty 500 response and zero Tasks when an application defect occurs.

Seven SSE cases throw at root, commitReceipt, delivery, awaitTransport, transport
and releaseStream. Each emits exactly one ready frame and the three durable
operation IDs in order, without duplicates. Teardown waits for the actual release
call. Four scheduler cases throw at root/job start/end while every real job step
runs once, one snoozed Task wakes to open Version 2, and one ReminderFired entry
commits. Fifteen compiled CLI cases cover configure/root/command start/end/owner
authorization. Successful show and stale edit preserve complete normalized stdout,
exact stderr and exits 0 and 4. Each throwing add returns exit 0 and its literal
Task remains readable at Version 1 through the normal compiled CLI.

Every injected fault must actually execute and count a failure and loss. The
controls use scratch databases and real store/auth/server/stream/scheduler/CLI
code, with recorder overrides only. Scheduler counters wrap and invoke the real
jobs. The fixture CLI imports the real command root. Earlier harness failures
are retained separately; a too-early stream cleanup assertion and a CLI response
schema mismatch were corrected before the final run.

Follow-up evidence root: `docs/evidence/ui-speed/diag-core-s1/`. The cached
CLI/server/seed manifest records product 0a79f210 and source hash
`374cbefd8acab10bb9631cc34509f7959abb61cad1b0ad0890b4b45dad878347`.
The fault executables import the same product source. Binary hashes, source
manifest and cleanup receipts remain with the evidence. Full command lines and
exit receipts below use that root as `<evidence>` and `.scratch/bin` as `<cache>`.

| Command | Actual exit | Evidence |
| --- | ---: | --- |
| `pnpm typecheck` and `bun packages/api/scripts/openapi.ts --check` | 0 | precommit-types.log, contract-check.log |
| `TODO_CLI_BINARY=<cache>/todo TODO_SERVER_BINARY=<cache>/todo-server /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0 | root-check.log, root-check.exit |
| `pnpm --filter @todo/domain test diagnostic-context.test.ts diagnostic-event-types.test.ts` | 0 | domain-targeted.log, 6 tests |
| `pnpm --filter @todo/server test diagnostics.test.ts` | 0 | server-targeted.log, 5 tests |
| `<cache>/http-failure-probe-green` with scratch HOME | 0 | seat-green.json/log/exit |
| `<cache>/verify-diagnostic-faults <evidence>/fault-controls-final` | 0 | fault-controls-final/result.json, 47 cases |
| `TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh <evidence>/diagnostics` | 0 | diagnostics/result.json; terminal_pngs HOLD |
| `TODO_SERVER_BINARY=<cache>/todo-server TODO_SEED_BINARY=<cache>/seed .agents/skills/verify-server-api/scripts/verify.sh <evidence>/server-api` | 0 | server-api/result.json |
| `.agents/skills/verify-auth/scripts/verify.sh <evidence>/auth` | 0 | auth/result.json |
| `TODO_SERVER_BINARY=<cache>/todo-server TODO_SEED_BINARY=<cache>/seed .agents/skills/verify-sse/scripts/verify.sh <evidence>/sse <cache>/todo` | 0 | sse/result.json |
| `TODO_SERVER_BINARY=<cache>/todo-server .agents/skills/verify-scheduler/scripts/verify.sh <evidence>/scheduler` | 0 | scheduler/result.json; real isolated launchd, cleanup passed |
| `TODO_CLI_BINARY=<cache>/todo TODO_SERVER_BINARY=<cache>/todo-server .agents/skills/verify-cli/scripts/verify.sh <evidence>/cli` | 0 | cli/commands.log, unchanged goldens and all 69 tests |
| `bun apps/server/scripts/verify-diagnostic-joins.ts <evidence>/joins` | 0 | joins/result.json |

The locked root check passes 401 domain, 69 CLI, 35 server and 168 Electron
tests, with the same existing Electron skip. The compatibility-refusal cases
and ordinary goldens remain green.

The canonical disk guard ran before the locked check and compile batches.
store.ts and projection.ts are byte-identical to ed85a6f9, as are auth.ts and
task-filters.ts. Their store/projection SHA-256 values are respectively
`8e77d3ebd77db5b51a1a0f99a17af7e2b157daa50f5110d68e62e4fa86972138` and
`76fe3261698793601df4155f1d70b4e2c717fda18e40c971f5fa0d445d9aeb37`.
No formal mapping or pin was renewed for this follow-up. The coordinator's
conditional rerun of both formal commands was not triggered. Their prior full
passes and the integration-owned mapping work above remain labelled as such.

The unchanged quiet-machine overhead confirmation remains owed at integration.
Removed 10 owned closed Bun compile temporaries, 886,608,640 logical bytes,
after lsof checks; none was open or skipped. The final cleanup scan found zero
more. Final observed free space is 41.2 GB, above the unchanged 30 GB floor.
All owned proof servers, streams, scheduler LaunchAgent and CLI children finished
or were stopped by their own finalizers. Matching cached binaries and the red
baseline executable remain ignored for the seat's re-check.
The held terminal PNG stage, generated Swift/client integration and the seat's
independent re-check remain owed. No Swift, Todo.app, signing, Keychain,
installation, push, merge or real Todo data access occurred in this follow-up.

## Refresh causes follow-up

The correction review of bd5bf6f8 passed with no findings, and the coordinator
accepted that branch as the second seat. The independent re-check hold above is
resolved. The coordinator assigned the refresh-cause delta to the next integration
review rather than a separate seat.

Product `b6ca6d0b3aafa1560fd1d4a795aae52bbd88a680` adds dayChange, clockChange,
wake and activation to refresh.started.trigger. clockChange also covers a
time-zone change. diagnosticRefreshTriggerLabels in diagnostic-labels.ts supplies
the requested plain labels for all 15 values and is exported through
interaction-categories.ts and @todo/domain. The new labels are "Day changed",
"Clock or time zone changed", "Woke from sleep" and "App became active".
Event names, schema version and all previous trigger values remain unchanged.
No domain file was added.

The HTTP contract id does not change. Both before and after this delta it is
`db2f9b18c488cbd43117afd82b011ed6d6f96efc4f0aeb77a37fd5695611788f`.
refresh.started is published by the standalone `todo schema 'diagnostics event'`
input schema. The HTTP profiler's active/recent records are spans, and its
delivery records do not contain the refresh trigger enum. The contract check
exits 0 without regeneration; packages/api, the profiler, Diagnostics body schema
and generated Swift sources are byte-identical to bd5bf6f8. No pins changed and
no Swift command was needed or run.

The runtime test first failed because dayChange decoded as invalid_record. The
old compiled CLI also failed the new published-schema assertion, which requires
the exact 15-value enum. Both red results are retained. The type-level test still
constructs and narrows every event variant and now constructs every refresh
trigger, checks the exact trigger union and rejects a separate timeZoneChange
value. Label coverage walks the actual trigger literals, requires nonempty
plain words with no identifiers, and compares the entire map with literal
expected labels. The compiled vocabulary recipe now guards the published enum.

Evidence root: `docs/evidence/ui-speed/diag-core-refresh-causes/`. The cached
CLI/server/seed binaries were built once from the product above, source hash
`e1edec9a3c28fb3c79adfbfb1dd869ff729cbb35bfe6c63a11275968d3730e59`.
Here `<evidence>` is that root and `<cache>` is `.scratch/bin`.

| Command | Actual exit | Evidence |
| --- | ---: | --- |
| `pnpm --filter @todo/domain test client-diagnostics.test.ts` before the enum change | 1 | domain-red.log/exit |
| `bun .agents/skills/verify-diagnostics/scripts/verify-vocabulary.ts <evidence>/compiled-schema-red` against the old CLI | 1 | compiled-schema-red.log/exit, schema retained |
| `pnpm --filter @todo/domain typecheck` and `pnpm --filter @todo/domain test client-diagnostics.test.ts diagnostic-event-types.test.ts diagnostic-labels.test.ts` | 0 | targeted-green.log/exit, 13 tests; full typecheck also in root log |
| `pnpm --filter @todo/domain test` | 0 | domain-green.log/exit, 403 tests |
| `bun packages/api/scripts/openapi.ts --check` | 0 | contract-check.log/exit; unchanged db2f9b18 contract |
| `bun .agents/skills/verify-diagnostics/scripts/verify-vocabulary.ts <evidence>/compiled-vocabulary` | 0 | compiled-vocabulary/result.json and published schemas |
| `TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh <evidence>/diagnostics` | 0 | diagnostics/result.json; terminal_pngs HOLD |
| `TODO_CLI_BINARY=<cache>/todo TODO_SERVER_BINARY=<cache>/todo-server /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`, first run | 1 | root-check.log/exit; auth-history expired HTTP edit detail mismatch |
| `TODO_CLI_BINARY=<cache>/todo TODO_SERVER_BINARY=<cache>/todo-server TODO_CLI_EVIDENCE=<evidence>/auth-history-isolated pnpm --filter @todo/cli test auth-history.test.ts` | 0 | auth-history-isolated.log/exit, 12 tests and retained actions |
| `TODO_CLI_BINARY=<cache>/todo TODO_SERVER_BINARY=<cache>/todo-server /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`, unchanged-source retry | 0 | root-check-retry.log/exit |

The first root run passed typechecking and all domain/server/Electron suites,
then failed one CLI auth-history assertion. It expected rejection detail expired
and observed invalid_credential. The fixture expires a Session directly in its
scratch database while the real server scheduler can delete expired credentials.
That deletion can explain the observed detail; the fixture, scheduler and auth code
are unchanged from bd5bf6f8. The isolated auth-history file subsequently passed
all 12 cases on the same cached binaries. The first failure remains retained;
no auth or fixture behavior was changed to make this vocabulary delta pass.
The locked root retry passed 403 domain, 69 CLI, 35 server and 168 Electron
tests, with the existing Electron skip. Typechecking, contract and golden checks
passed. Integration should retain the initial intermittent auth-test result.

The canonical disk guard ran before compilation and the locked root check.
Removed three owned closed Bun compile temporaries, 265,982,592 logical bytes,
after lsof checks; none was open or skipped. Cleanup and binary receipts remain
local with the evidence. The held terminal PNG render is still owed by a unit
holding the Swift slot. Quiet-machine overhead confirmation and client
integration remain owed as already stated; this vocabulary-only delta makes no
new performance claim. No Task database, runtime control flow, formal mapping,
authorization or compatibility-refusal behavior changed.
The final observed free space is 31.5 GB, above the 30 GB soft floor. Every owned
proof server and stream finished through its normal cleanup, and the final
compile-temporary scan found no further files. The final report commit changes
only this report; the binary manifest remains tied to the product commit above.

## Browser-safe guard extraction

Product `d973918e8319784ffc8269dfccd5e4458bc30715` moves the existing guard and
its three WeakMaps into the new packages/domain/src/diagnostic-guard.ts. This
module has zero imports and requires neither Node nor Effect. observeDiagnostic
is generic over any object owner. diagnosticFailureCounts(owner) returns a
detached readonly snapshot with total, lost_starts and lost_events. No recorder
class or recorder fields are required, and no error text is retained.

Both functions are re-exported through @todo/domain. Browser adapters should
use the direct `@todo/domain/diagnostic-guard` entry, which avoids the root
barrel's Node-dependent services. The guard call signature otherwise retains
the observation closure and optional start/event loss classification. Keep
business work outside the observation closure; this guard contains synchronous
recorder failures.

diagnostic-context.ts imports this single implementation and reads the same
per-owner ledger when building a profiler snapshot. Its existing fields still
add lost_starts to started/lost_starts, lost_events to dropped_events, and total
to recording_failures. store/diagnostics.ts imports the shared guard directly.
Server, stream, scheduler and CLI root imports now resolve to that same module;
auth and store timing wrappers delegate through diagnostic-context.ts as before.
There is one observeDiagnostic definition in production TypeScript. The shared
entry and root entry are the same function and counter reader in the tests.
No call boundary, business effect, statement order or retry behavior changed.
store.ts, projection.ts, auth.ts and task-filters.ts are unchanged, and no formal
mapping was renewed.

The browser regression first failed because the dedicated package entry did not
exist. It now bundles that public entry for the browser and evaluates the ES
module in an isolated realm with process, Buffer, require, Bun and global all
undefined. Any external module import fails. The test requires the literal value
37 and {total:1, lost_starts:1, lost_events:0} after a thrown start. A separate
test uses plain object owners, proves independent ledgers and detached reads,
and requires exact total/start/event counts of 3/1/2. Context, type-level variant
and label tests remain green.

The HTTP contract id is unchanged:
`db2f9b18c488cbd43117afd82b011ed6d6f96efc4f0aeb77a37fd5695611788f`.
The contract check exits 0. There is no HTTP schema or generated client change,
and no Swift command ran. The extraction commit was sent immediately to the
coordinator for the Electron worker while the complete proofs ran.

Evidence root: `docs/evidence/ui-speed/diag-core-browser-guard/`. All six
executables were compiled from the product above, source hash
`247bddec98ccec0ae1a396344e9b6d68667d2ef6dfec80b153439e899355ca1f`.
Here `<evidence>` is that root and `<cache>` is `.scratch/bin`.

| Command | Actual exit | Evidence |
| --- | ---: | --- |
| Browser regression before extraction | 1 | browser-red.log/exit |
| `pnpm --filter @todo/domain typecheck` | 0 | targeted-types.log |
| `pnpm --filter @todo/domain test diagnostic-guard.test.ts diagnostic-guard-browser.test.ts diagnostic-context.test.ts diagnostic-event-types.test.ts diagnostic-labels.test.ts` | 0 | targeted-green.log/exit, 10 tests |
| `bun packages/api/scripts/openapi.ts --check` | 0 | contract-check.log/exit |
| `<cache>/verify-diagnostic-faults <evidence>/fault-controls` | 0 | fault-controls/result.json, all existing 47 cases |
| `HOME=<scratch-home> <cache>/http-failure-probe-green` | 0 | seat-probe.json/log/exit; unchanged seat probe source |
| `TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh <evidence>/diagnostics` | 0 | diagnostics/result.json; terminal_pngs HOLD |

The compiled HTTP probe preserves 200 and one Task/TaskCreated commit at each of
the four fault points, with recording_failures=1. The 47 controls retain their
literal HTTP bodies/statuses, stream order, scheduler jobs and CLI output/exits.

The full check ran as
`TODO_CLI_BINARY=<cache>/todo TODO_SERVER_BINARY=<cache>/todo-server /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`
and exited 0 on its first run, retained in root-check.log/exit. It passed 405
domain, 69 CLI, 35 server and 168 Electron tests, with the existing Electron
skip. Typechecking, contract identity, label/variant checks and goldens passed.

Before compiling, cleanup retired seven superseded executables and 14 files
from the uncited old final-diagnostics evidence, freeing 636,678,144 allocated
bytes, 636,628,258 logical bytes. No pre-existing closed Bun temporaries were
present. All cited logs, red/green results, source fixtures and binary hashes
remain. In particular, the old retained red executable was retired after the
accepted review; its cited proof and hash receipts remain. After rebuilding,
six closed Bun temporaries were removed, freeing another 531,972,096 allocated
bytes, 531,965,184 logical bytes. Every file passed an lsof check and none was
open or skipped. cleanup.jsonl and binary-receipt.json retain the receipts.
Fresh same-source binaries remain cached. Free space observed after cleanup was
36.2 GB and after verification setup was 35.2 GB, above the 30 GB soft floor.
No performance claim is added. Existing terminal PNG, quiet-machine and client
integration holds remain with their owning units.

## Polled payload correction

The default complete Diagnostics body and ordinary CLI JSON now have a hard
49,152-byte UTF-8 budget, including pretty indentation and the final newline.
Compact HTTP JSON is smaller. Both growing profiler lists, recent spans and
stream deliveries, are absent from the polled body. The default profiler is
version 2. It contains cumulative counters, active count, a fixed 11-bucket
histogram, per-stage and per-inventory-category span summaries, explicit gaps,
omission counts and at most eight latest slow or failed span labels.

Detailed data requires owner-only GET /diagnostics?detail=true or one-shot
`todo diagnostics --detail`. Its separate complete-body cap is 65,536 pretty
JSON bytes. `--detail --follow` is rejected before reading a Session or making
a request; follow errors keep stderr and snapshot-only stdout behavior. Detail
hoists run_id, build_id and contract_id into its sample header. None of its rows
repeats those fields. It has independent maximums of 32 recent spans, four active
spans and 16 deliveries. Available/omitted counts describe the retained rings;
the existing cumulative counters separately account for ring displacement.

Runtime change `2c147ad91f8f0db9139ea6455305355de69e9e0a` is followed by a test-only
correction in `6267813e42947d73569daacd9cde3b70b9bb0da1`. Runtime source is identical
between those two commits. The latter corrects my new flag test to assert the
existing stderr error stream and initializes the normal first-run notice before
parsing that stream. It does not change the runtime's output or error behavior.

### Measurement before changing collection

Evidence root: `docs/evidence/ui-speed/diag-core-payload/`. The measurement drove
the compiled server/CLI from the df513876 runtime line before changing it, then
retained a failing 48 KiB assertion in before.log and before.exit, actual exit 1.
before/measurements.json retains all raw values and per-field byte counts. Its
initial result file describes completed measurement collection; the separate
size assertion and exit receipt are the red budget result.

Each checkpoint has five owner polls. N below counts only the list workload;
the five measurement polls per checkpoint, bootstrap sign-in and scheduler work
are additional. The separate replay creates 306 literal Tasks and replays all
306 operations through one live stream client. Sizes are UTF-8 ranges across
those five polls. Handler values are Server-Timing todo-handler, middleware
entry through response handoff, reported as median and observed range in ms.

| Before workload | HTTP body bytes | Profiler bytes | Pretty JSON bytes | Handler median, range ms |
| --- | --- | --- | --- | --- |
| 0 list requests | [18,411, 45,289] | [15,963, 42,645] | [25,500, 61,970] | 1.171, [1.015, 2.772] |
| 100 | [796,748, 823,479] | [792,864, 819,602] | [1,082,553, 1,118,784] | 4.932, [4.764, 6.180] |
| 1,000 | [1,531,728, 1,531,838] | [1,527,861, 1,527,941] | [2,079,597, 2,079,800] | 7.750, [7.534, 10.891] |
| 10,000 | [1,535,881, 1,535,985] | [1,532,120, 1,532,195] | [2,083,727, 2,083,864] | 8.039, [7.850, 10.289] |
| 306-operation replay, one client | [1,917,495, 1,944,356] | [1,903,252, 1,929,994] | [2,584,885, 2,621,310] | 11.964, [11.293, 17.504] |

The growing fields were recent and deliveries. At the fifth poll after 100 list
requests, recent held 1,100 spans and 817,766 bytes. At 1,000 it reached its
2,048-row cap, 1,526,031 bytes. At 10,000 it was still 2,048 rows, 1,530,280 bytes.
The replay held 1,901 recent spans, 1,407,232 bytes, plus 612 delivery records,
520,928 bytes. Active stayed at two rows, about 1,343 bytes, and unobserved stayed
233 bytes. Scalar counters added only digits. Ordinary Diagnostics polls
themselves added about 6.7 KB of spans per read before the ring filled.

The Electron unit's independent owner-shaped breakdown was read without editing
its worktree and copied to electron-recipe-size.json. It measured 1,027,295 HTTP
bytes, 1,390,753 CLI bytes and a 1,019,782-byte profiler, including 1,277 recent
spans at 998,324 bytes. Its later reported replay reached 2,166,086 body bytes,
with 2,048 recent spans at 1,604,599 bytes and 612 deliveries at 544,525 bytes.
Those are a different fixture, consistent with the two growing lists. Forwarded
client/handler timing observations were single samples, not a performance verdict.

### Construction and semantics

The new domain files are diagnostic-summary.ts and diagnostic-budget.ts. The
first owns the pure profiler wire schemas and fixed-dimension aggregation.
diagnostic-context.ts keeps the process-local recorder and context. Span starts
and completions update bounded stage/category accumulators as events occur;
normal reads never copy or serialize the 2,048-row detail rings. Histogram
quantiles are explicitly bucket upper bounds, with null for overflow above
5,000 ms or no completions. Unfinished spans remain in the counts, outcomes are
separate, and unit=span prevents calling these UI interaction measurements.
U01's exact raw frozen interaction nearest-rank functions are unchanged.

The budget module admits whole rows by their actual UTF-8 pretty JSON cost,
including their nesting indentation. It reserves 8 KiB for empty objects and
scalar fields and gives priority to span summaries before metadata samples.
Each array also has a section quota. A whole-snapshot schema predicate enforces
the final cap on both server and CLI encoding. Opt-in detail uses the remaining
64 KiB allowance, its section quotas and the independent delivery-row cap.
Ids and human labels are retained intact or the complete row is omitted.

Existing metadata arrays are now explicitly bounded samples, including Profiles,
credentials, clients, recent operation labels, errors and route summaries.
profiler.omitted includes byte/sample omissions and rows outside SQL metadata
query limits. Storage/operation aggregate totals and the 300-second/2,048-sample
raw route quantiles retain their meanings. Route grouping is one bounded map
pass rather than one full scan per distinct route. The credential-use memo
checks its bounded keys independently of the displayed credential sample, so
sampling does not erase last-use observations. Last Snapshot is projected to its
original five allowed fields before budget admission. The compiled recipe caught
and retained an intermediate test failure where admission measured the full
manifest instead; diagnostics-fixed proves the corrected metadata projection.

No store.ts, projection.ts, auth.ts, matcher, ordering, atomicity or transaction
content changed. No formal pin was renewed. Recorder calls still use the one
shared failure-contained guard. Owner authorization, refusal behavior and
accepted trace headers remain in place. Explicit detail was chosen over a new
profiler endpoint because a small, bounded join sample can use the existing
owner route without introducing ingestion, journals or a new storage lifecycle.

### After correction and stress proof

The frozen runtime measurement is after-final/measurements.json, actual exit 0.
It repeats the same list/replay workloads and five polls per checkpoint.

| After workload | HTTP body bytes | Profiler bytes | Pretty JSON bytes | Handler median, range ms |
| --- | --- | --- | --- | --- |
| 0 list requests | [4,587, 4,782] | [2,132, 2,135] | [7,973, 8,260] | 1.488, [1.177, 4.275] |
| 100 | [5,830, 5,831] | [2,406, 2,406] | [9,912, 9,913] | 1.061, [0.983, 1.355] |
| 1,000 | [5,852, 5,854] | [2,439, 2,439] | [9,927, 9,929] | 1.150, [0.991, 1.479] |
| 10,000 | [5,663, 5,786] | [2,470, 2,470] | [9,622, 9,809] | 1.463, [1.206, 1.826] |
| 306-operation replay, one client | [6,652, 6,772] | [2,277, 2,277] | [11,148, 11,332] | 3.308, [2.941, 5.809] |

The bytes are a bounded-output result. Handler times are busy-host observations,
not a quiet-host speedup claim. Boundary one-minute load is retained for each
measurement; the final run observed 6.66 to 6.80. The existing quiet-machine
overhead confirmation remains owed at integration. Existing database/storage
collection costs are separate from this response-size correction.

The compiled stress drive makes 10,000 real mixed requests, 2,000 distinct unknown
paths, fresh trace/request ids and 200 stream clients, at most 32 live together.
It asserts both complete byte budgets every 1,000 requests. Then 306 operations
are replayed through three clients, all 918 frames checked without duplicates.
The detail source retained 1,836 delivery records and exported eight. Default
body/pretty JSON were 9,632/15,605 bytes after that replay; opt-in detail was
35,945/53,960. The normal compiled CLI, using spawnSync's unchanged default
buffer, emitted 15,625 default bytes and 53,946 detail bytes. Both stayed within
their budgets; no maxBuffer increase masks the issue. stress-verified/result.json
retains the complete controls and omission counts.

The domain test also drives 10,000 distinct route/trace/client observations and
long multibyte Profile metadata, exercising every registered category and stage.
It requires the complete encoded caps and all 10,000 starts/finishes in the
histogram and returned category/stage summaries. The replay independently proves
the delivery cap and hoisted identities. The joins proof continues to match
client-sent ids and Server-Timing against an explicit bounded detail sample.

### Contract and integration

The old contract was
`db2f9b18c488cbd43117afd82b011ed6d6f96efc4f0aeb77a37fd5695611788f`.
The final contract is
`57724665f2589fdec09d845635a9e2b87914a84569056085f89fe5700fa5cb64`.
The TypeScript identity and OpenAPI document are regenerated. CLI and Electron
consume that shared identity; the Electron SDK call now passes the declared
query object. Historical reports retain their historical ids. Compatibility
refusal logic is unchanged and its tests remain required.

The only Swift command was the authorized
`scripts/swift-slot.sh apps/macos/scripts/generate-api.sh`, run twice, exit 0 each.
The second generation incorporates the coordinator's later detail identity/cap
requirements. The final contract check exits 0 against the generated Swift and
TypeScript identities. No manual Swift edit, app build/test, app launch, signing,
Keychain, installation, real Todo data, push or merge was performed.

Integration must merge this contract with both clients, use default polling
without detail=true, render summary unit/bucket semantics and omission counts,
and reserve detail for explicit one-shot inspection. Mac compilation and client
presentation remain with their owning units. The held terminal PNG stage and
other previously stated integration work remain owed.

### Final verification receipts

Here `<evidence>` is docs/evidence/ui-speed/diag-core-payload and `<cache>` is
.scratch/bin. The frozen runtime binary manifest is product 2c147ad9, source hash
`b04f15eb603366033abd04da6a708c08989371d4523e926ee829a4f8e1429a80`.
The test-corrected final check manifest is product 6267813e, source hash
`abb88588d278d18a947bef824ad2e5962c4de3777795e93a037af42e74764196`.
All five compiled CLI/server/seed/fault executables are byte-identical between
the runtime proofs and final check, as recorded in binary-receipt.json. The
production source diff between these commits is empty.

| Command | Actual exit | Evidence |
| --- | ---: | --- |
| `bun apps/server/scripts/measure-diagnostic-payload.ts <evidence>/before --assert-budget` on the old compiled runtime | 1 | before.log/exit, before/measurements.json |
| `pnpm typecheck` | 0 | types-last.log/exit |
| `pnpm --filter @todo/domain test` | 0 | domain-final-2.log/exit, 407 tests |
| `bun packages/api/scripts/openapi.ts --check` | 0 | contract-final-check.log and final locked check |
| `scripts/swift-slot.sh apps/macos/scripts/generate-api.sh` | 0, twice | generate-api.log/exit, generate-api-final.log/exit |
| `TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh <evidence>/diagnostics-fixed` | 0 | diagnostics-fixed/result.json, terminal PNG HOLD |
| `TODO_SERVER_BINARY=<cache>/todo-server TODO_SEED_BINARY=<cache>/seed .agents/skills/verify-server-api/scripts/verify.sh <evidence>/server-api-final` | 0 | server-api-final/result.json |
| `.agents/skills/verify-auth/scripts/verify.sh <evidence>/auth-final` | 0 | auth-final/result.json |
| `<cache>/verify-diagnostic-faults <evidence>/fault-controls-final` | 0 | fault-controls-final/result.json, all 47 cases |
| `bun apps/server/scripts/verify-diagnostic-payload-budget.ts <evidence>/stress-verified` | 0 | stress-verified/result.json |
| `bun apps/server/scripts/measure-diagnostic-payload.ts <evidence>/after-final --assert-budget` | 0 | after-final/result.json |
| `bun apps/server/scripts/verify-diagnostic-joins.ts <evidence>/joins` | 0 | joins/result.json |
| `TODO_CLI_BINARY=<cache>/todo TODO_SERVER_BINARY=<cache>/todo-server /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 1, 1, then 0 | root-check.log/exit, root-check-retry.log/exit, root-check-final.log/exit |

The first root attempt hit the unchanged guarded-run.test.ts direct-delegate
case's five-second timeout. Its isolated five-case run passed without changing
the test or timeout. The second root run exposed my new flag test's stdout
assertion; follow errors correctly used stderr. That assertion was corrected
in 6267813e and its isolated case passed. The final locked root run passed 407
domain, 70 CLI, 36 server and 168 Electron tests, with the existing Electron skip.
Compatibility refusal and ordinary CLI goldens remain green. All intermediate
failure evidence was retained rather than reported as a pass.

The canonical disk guard preceded compilation and locked checks. Cleanup removed
16 owned closed Bun temporaries, 1,418,573,824 logical bytes, after lsof checks;
none was open or skipped. Matching binaries remain ignored in the cache. Cleanup
receipts and hashes remain with the evidence. Every owned scratch server, stream,
CLI child and generator command completed or was stopped by its own finalizer.
The final report commit changes only this report, after the verified product.
