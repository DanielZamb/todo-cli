# DIAG-CORE delivery

Branch: `feat/diag-core`. Product checkpoint: `0a79f21048dcb28d4e3a15b2f743379c636a86e3`.
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
