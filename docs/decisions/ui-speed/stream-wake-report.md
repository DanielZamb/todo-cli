# In-process stream wake

Initial implementation: `4dad570ae4543a034a0bc27aca57264f2fb67c8c`, branch
`perf/stream-wake`, based on `6b167266fc34c3304e30ed220bb652b4d17c05ab`.
The delivery also registers the verifier and records this report. No client
application code, dependency, contract id, route, header or event changed.
Nothing was installed, signed, pushed or merged. All data and processes were scratch.
The later review corrections below supersede the original transaction guard.

## Commit coverage and waiting

`apps/server/src/server.ts:296` constructs one StreamWake and decorates the server's
store. Every route, command, import, batch, Attachment operation and the scheduler
receives that decorated store. Exhaustive policies in `stream-wake-store.ts`
classify every public member of OperationStore, Authentication, Snapshots and
ScheduledWork. New routes using these boundaries need no signal call. New public
members require a policy at typecheck. Preview forks remain isolated.

The adapter records a pending notification after a write boundary finishes. Every
decorated member exit checks the actual connection's native `inTransaction` flag;
the first exit outside a transaction clears and delivers the pending notification.
Read and synchronous boundaries therefore defer nested writes correctly, and a
detached child signals after its own commit. No inherited fiber marker is used.
The server adapter obtains the existing Bun SQLite connection once through its
runtime `db` member and validates its native type; this is an explicit coupling to
the pinned store's existing field. It adds no SQL query or domain accessor.
Errors and interruption can produce harmless extra passes. runDue, cleanupExpired
and runDaily mark work only for a nonempty result or failure. Snapshot create,
restore and prune use the same exit mechanism. Initialization finishes before streams exist.
Authentication reads can append rejected History, which SSE excludes.

SSE and cache hygiene use the raw store to avoid self-waking polls. Neither
`packages/domain/src/store/store.ts` nor `projection.ts` changed. Their pinned
transaction implementation and formal coverage remain untouched.

The SSE diff adds a remembered revision and replaces sleep with `wake.wait`.
The revision is captured before each database pass. A commit after History was
read leaves a newer revision, making the next wait return immediately. Several
signals between passes collapse into one pending pass. Broadcast captures and
clears the waiter Set before resuming callbacks, so a callback's next wait cannot
be woken by that same signal. Timeout and cancellation remove the losing waiter.
The existing 250 ms fallback, generation check, History cursor, authorization,
event order, resume headers and Diagnostics calls stay. A CLI commit alone does
not produce an in-process signal.

## Latency

The worker's original cross-process epoch-clock latency table is withdrawn.
The following values are the independent seat's shared-host-clock rerun on
`fd76a438`: five alternating pairs, 40 HTTP edits per arm per pair, with
0–250 ms arrival delays and nearest-rank percentiles. The meter records macOS
`clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)` immediately after an outer Bun
transaction returns. The real SSE reader matches the operation id to its commit.
Receipt excludes app refresh. These are reviewed-head observations, not a new
performance claim for the observer corrections.

| Commit to received event, ms | Timer | Wake |
| --- | ---: | ---: |
| Samples | 200 | 200 |
| Median | 111.872 | 1.178 |
| p90 | 219.170 | 1.668 |
| p99 | 245.338 | 8.676 |
| Maximum | 245.812 | 9.865 |
| Per-pair median range | 106.780–118.424 | 1.069–1.225 |
| Event received before parsed write reply | 1/200 | 74/200 |

The synthetic database has one populated and seven empty Profiles, 178 Tasks,
50 open, 126 done, two cancelled, 39 Tags, five Projects and 108 link Attachments.
Most descriptions have 1,326 characters; the maximum has 5,460. This ordinary-edit
fixture does not reproduce the owner's Dependency graph. No owner data or private
copy was used.

The seat's shared ten-core host had one-minute loads of 7.82–9.85 in timer arms
and 7.80–10.39 in wake arms. Removing the timer explains the latency change; the
frozen-clock test independently proves that difference. An excluded sample run
shows the server main thread busy in JavaScript, with some SQLite work and runtime
threads mostly waiting. Bundled JavaScript frames are unsymbolicated. Remaining
delivery includes History decoding, authorization, runtime dispatch and loopback.
Both arms have the same accounting queries and stdout records. These observations
do not establish app apply latency or a production p99.

Both Bun process-relative hrtime and `performance.timeOrigin + performance.now()`
are invalid for this cross-process measurement. The seat's epoch-clock run found
109 negative samples, minimum -0.820 ms. Its shared monotonic rerun replaces the
worker latency numbers above. The reusable meter now uses one macOS host clock in
both processes, brackets meter timestamps at the parent and rejects negative
commit-to-event intervals. Thirty independent child-process timestamp brackets
pass. The SDK declares CLOCK_MONOTONIC_RAW as 4 and the native result as uint64.
An earlier instrument build also failed Bun's non-configurable transaction-property
invariant; the final meter wraps aliases on a separate function. Invalid calibration
runs remain separate and are excluded from the corrected latency table.

## Idle and burst costs

The following idle and burst costs are the original worker's passive-consumer
observations. Their within-process elapsed times, counts and process CPU remain
valid; they are separate from the seat's corrected latency rerun above.
Each idle observation lasts about two seconds, repeated in every pair. Counts
are identical across all five observations per arm. CPU is whole-server user plus
system time, including scheduler and cache hygiene. Values are medians and ranges.

| Idle streams | SSE passes and History reads/s, both arms | Timer CPU ms/s | Wake CPU ms/s |
| ---: | ---: | ---: | ---: |
| 1 | 4 | 24.0 (20.2–41.5) | 27.3 (24.8–43.1) |
| 2 | 8 | 38.5 (26.3–51.7) | 20.8 (19.4–39.7) |
| 5 | 20 | 35.4 (19.9–44.3) | 23.9 (20.2–51.2) |

No additional idle database passes occur. CPU ranges overlap and are nonmonotonic
under load; the CPU effect is inconclusive on this host.

Each arm also has five serial 300-edit bursts through PATCH, with a Task GET after
every tenth edit. Each GET checks the newly saved title. Total History reads include
those 30 foreground reads; the separate pass counter measures SSE generation reads
outside a transaction. Each pass retains the existing authorization call.

| One 300-edit burst | Timer | Wake |
| --- | ---: | ---: |
| SSE passes | 18 (11–29) | 300 (300–300) |
| Total History reads | 48 (41–59) | 330 (330–330) |
| Server CPU ms | 4,710 (3,087–5,533) | 3,932 (3,817–5,642) |
| Elapsed ms | 4,646 (2,807–7,882) | 3,726 (3,457–6,830) |
| Task GET median ms | 13.02 (8.23–14.83) | 9.99 (8.63–15.47) |
| Task GET p99 ms | 24.72 (11.84–170.58) | 31.99 (15.17–38.41) |

Serial edits allow a pass between commits and pay one pass per edit. Revision
tests establish collapsing when commits outrun passes. The extra database work is
real. Overlapping CPU and elapsed ranges do not establish throughput or foreground
read improvements. All arms have zero failed writes, zero missing matched events
and exactly 178 durable Tasks.

## App order checks

Electron main persists its monotonic cursor and emits changed at
`apps/electron/src/main.ts:177`. The renderer receives it at `renderer.tsx:1008`
and refreshes. refresh increments its generation at line 775 and rejects older
completions at line 797. The edit reply updates the editor and refreshes at line
1138. Neither path requires the other to arrive first. SSE does not replace the editor.

The Mac stream at `apps/macos/Sources/TodoModel.swift:622` also refreshes.
refresh increments refreshGeneration at line 409 and fences publication at line
434 by connection generation, refresh generation and requested identity. The
write reply closes the saved editor at line 735 and calls refreshAfterWrite.
That method accepts superseded refreshes without treating them as failures at
line 1169. There is no ReadBackOwner declaration in this base. This report covers
the existing mechanism and does not borrow either Mac worker's code.

Both proofs gate actual replies, stream chunks and read responses against a
compiled scratch server. Electron uses the unsigned host and production renderer;
signed storage, notifications and production main cursor persistence are outside
that host proof. Mac uses production TodoModel and the generated client, without
launching the app or touching Keychain. Both assert the saved title at Version 2.

| Order | Electron | Mac |
| --- | --- | --- |
| Reply first | Correct and unchanged for the person | Correct and unchanged for the person |
| Stream first | Changed but correct: list updates while Save remains busy | Changed but correct: list updates before the reply closes the editor |
| Event during write refresh | Correct and unchanged: newer refresh wins | Correct and unchanged: newer refresh wins |

The original new order case passed in isolation while the full helper failed.
The seat's causal matrix establishes a verification regression: head test sources
fail against both timer and wake servers, while base test sources pass against
both. The reconnect case alone passes five times per server. This is not an
accepted base failure and is not caused by the wake.

The first correction restored SearchTransport to its exact base bytes and moved
the order proof into a separate transport that cancelled and awaited its forwarding
Task. The full helper still failed at the unchanged reconnect wait. That red run
rules out the general search transport edit as the remaining cause.

The transport default is URLSession.shared. In the pinned dependency, the request
cancellation handler ends when headers return; consumer termination cancels the
native data task only upon a subsequent data callback. The new proof opens three
idle SSE requests in the full suite, which can retain shared per-host connection
slots after the forwarding Task ends and block a later reconnect. In the final
run, every order records one still-running native `/profiles/wake-…/events` request
after its forwarding Task ended. All three sessions have zero requests after
invalidation, and the unchanged reconnect test passes in the full helper.

The order fixture now owns an ephemeral URLSession per case. Cleanup finishes its
body, releases held replies and reads, cancels and awaits its forwarding Task,
invalidates only that owned session, and verifies zero remaining native requests.
It records native request states before invalidation. The base SearchTransport,
connection limits, reconnect predicate and deadlines are unchanged. The full
helper result is recorded below.

## Verification and delivery

The frozen-clock server-write test fails against the base SSE sleep at its
10-second deadline without clock advance, then passes with the wake. A compiled
CLI child commits independently and stays undelivered through 249 ms, then arrives
after advancing to 250 ms. Other cases prove 300-signal collapsing, five-waiter
broadcast, cancellation/reopening counts, reentrant broadcast safety and no wake
inside an enclosing transaction.

| Revision check | Exit and result |
| --- | --- |
| Extended verify-sse | 0, compiled HTTP/CLI drive, 19 tests, and compiled nested rollback/sequence-reuse proof |
| Server suite | 0, 47 passed |
| Full Mac state helper through swift-slot | 0, 160 tests in 33 suites, diagnostics/contract follow-ups and durable HTTP assertions |
| Locked root check after disk guard | 0, 387 domain, 69 CLI, 47 server and 168 Electron tests passed; one Electron test skipped |
| Shared host clock | 0, 30 cross-process brackets |
| Documentation links | 0, zero broken local links |

The original delivery also passed verify-server-api, verify-profiles,
verify-scheduler without launchd, the unsigned Electron host and its three-order
drive, and 168 Electron tests with one skipped. Those are prior-commit results,
not new runs for this correction. The full Mac failure is the F2 verification
regression described above.

The scheduler's TODO_VERIFY_SCHEDULER_NO_LAUNCHD mode retains restart, competition,
reminders, cleanup, SSE, contract and replay assertions. It records realLaunchctl
false and never invokes launchd. The Electron verifier inventory and unsigned-launch
count include the new driver. Earlier root checks caught the verifier environment
type and two inventories; they were corrected. A final-head SSE attempt timed out
in CLI login at its unchanged 10-second deadline while host load was 14.71. An
unchanged retry passed. Failed runs remain local.

Local evidence is under `.scratch/evidence/`: `measure-outer/result.json`,
`summary.json`, `profile-after.txt`, `red-clock.log`, `head-sse-retry/`, `head-api/`,
`head-profiles/`, `scheduler-outer/`, `electron-runtime/`, `electron-orders-outer/`,
`macos-final/`, `electron-suite-final.log` and `root-check-complete.log`.
Only reusable verification inputs are tracked. No domain source file was added.

Manual completion and comment review found no added code comments or suppressions.
The correction leaves domain production, API/contract and both client production
sources unchanged. The existing SSE authorization exemption is also unchanged;
its integration correction remains required before installation.
The no-comments skill's delegated reviewer was not launched because the worker's
explicit no-children instruction takes precedence. The independent correctness
seat is the coordinator's next step. No live Mac UI verdict is claimed. The missing ReadBackOwner belongs to the
concurrent Mac work; F2's test lifetime regression is fixed within this unit.

## Correctness review corrections

Code correction commit: `0f8366e7a055e36bef384bc131e963a48c836661`, after
`fd76a438` without an amendment. The following readiness follow-up changes only
the verification helper and documentation.

F1: observer defects are contained for generic Effect finalizers, conditional
finalizers and synchronous Snapshot methods. Task creation remains successful and
records exactly one TaskCreated even if signal throws. Original typed failures,
defects and interruption causes compare exactly with the undecorated Effect.
The timer still wakes after 250 ms when the observer fails.

The first F3 correction made conditional operations share the afterWrite helper
and active-write marker. Each nested runDue,
cleanupExpired and runDaily rollback case observes revision zero inside the
transaction and one harmless signal after it ends. Idle work remains silent.
The compiled loopback regression uses production SSE and the decorator, with only
an internal stdin trigger, a store reference and the background scheduler held.
The reviewed decorator emits provisional `[5, ReminderFired]`, rolls back, and
skips the durable TaskCreated reusing seq 5. The corrected stream emits exactly
`[5, TaskCreated, Durable successor]` and `[6, TaskCreated, Next cursor witness]`.
Both the literal tuples and the complete operation entries must equal durable
History. No test-only product route, header or flag was added. Review 2 rejected
that correction: readSnapshot and synchronous boundaries still signalled inside
transactions, and a detached child inherited an ended marker. The connection
guard and generated proof below replace that design.

B1 remains outside this unit. The existing ProfileDeleted exception sends final
TaskDeleted/ProfileDeleted to a revoked scoped Token on both base and head,
contrary to ADR-0010. No new code preserves or tests for that exemption. Integration
with the strict read scopes must resolve it before installation.

Strict-read integration obligations, not implemented here: capture the revision
before the authorized pass and carry it through active, absent, terminal and
Snapshot-generation states. Obtain a fresh checked read lease on every pass and
hold none over the wait. Preserve generation/cursor/connection-bound, one-use
owner terminal permission, ordered IDs, resume handling and Diagnostics lifetime.
Classify the new public read members and repeat stream/auth tests on the merge.

O2 remains later work. Both apps perform a full refresh for every operation. The
actual Electron renderer starts nine reads in this view, supersedes 299 of 300
serial refreshes and 49 of 50 batch refreshes on both servers, and can show the final
batch state seconds late. The earlier passive-consumer burst table measures server
work without those refreshes; it is not app-visible latency. Preserve immediate
first wake and remembered revisions during later client/read optimization.

Revision evidence: `.scratch/revision/evidence/observers-red-typed.log` has seven
failing fault/nesting controls on fd76a438. `observers-green.log` and the server
suite contain their passing results. `wire-red/result.json` and
`wire-green/result.json` retain the provisional/reused-sequence reproduction.
`mac-red-provenance.json` matches the original full failing helper's test source
SHA-256 to fd76a438. `mac-green/` retains the failed intermediate transport-only
correction. `mac-session/` passes the full helper, including the unchanged reconnect
case in 9.982 s, the three-order case in 2.403 s and native-request cleanup logs.
Its before/after Package.resolved checks are zero, and its source hashes match
the delivered tests. `root-check-session.log` is the final locked check, exit zero.
`wire-complete-green/` also asserts full operation-entry equality and literal ids
`["5", "6"]` after rollback and reuse. A redundant queued red run was cancelled before acquiring
the Swift slot; the existing red receipt is reused. New verification outputs
remain local. All corrections are committed after fd76a438 without amending it.

A post-commit SSE run exposed the inherited five-second readiness loop in the
helper under one-minute load 15.39. The server remained alive with no listen line
before the helper stopped it; its failed receipt remains in
`committed-sse/`. The helper now uses the standing order's 60-second minimum for
scratch startup. Event-delivery limits and the Mac reconnect expectation are
unchanged. The unchanged event assertions, all 19 tests and the compiled nested-wire proof
pass on retry in `committed-sse-retry/`, exit zero. Production sources and the
Mac tests did not change in this readiness-only follow-up.

## Second review correction: connection transaction state

This correction is on top of `22f12b3c869b7d10f758bb53b3f58e93c086b566`, without
amending it. The final review-2.md was reread in full. Its remaining F3 findings
reject the premise that an inherited Effect context describes a live transaction.
The adapter now uses the database connection as described above. All generic,
conditional, read and synchronous exits share one pending bit and one native state
check. Clearing pending before signalling also makes reentrant observers safe.
Rollback can cause one empty pass after the transaction ends. No signal is emitted
while the connection is in a transaction. Pinned domain and projection files,
production SSE, app production, contract and dependencies are unchanged in this correction.

F3 red on 22f12b3c: both compiled readSnapshot and synchronous-Snapshot compositions
emit `[5, ReminderFired]`, roll back, then skip the durable TaskCreated reusing 5.
Both corrected compiled witnesses deliver exactly
`[5, TaskCreated, Durable successor]`, `[6, TaskCreated, Next cursor witness]`,
including complete entry equality and literal SSE ids `["5", "6"]`. The detached
child control is also red: its committed reminder leaves revision 1 and a fresh
waiter asleep. The corrected test advances only 100 ms, requires revision 2 and
joins the waiter before the 250 ms fallback can run. Original rollback and
partial-commit interruption controls still pass.

The reusable generator classifies every public member of all four decorated
objects at typecheck. It generates six paths over both callback boundaries,
auth.mutate and auth.readSnapshot, at two and three member levels, crossed with
56 callable member fixtures and commit/rollback: 672 compositions. Properties and
connection close are excluded. Password operations exercise synchronous validation
failures; successful asynchronous hashing cannot run in these synchronous callback
boundaries. Destructive methods use refusal or preview cases. Every composition
starts a provisional reminder, checks a fixed revision at every inner exit, and
requires literal durable event kinds and full committed Profile History equality.
The compiled driver also requires the actual reused sequence numbers after every
rollback. The 22f12b3c control fails at mutate/snapshots.createSync, with inner
revision deltas `[0, 1, 1]`. Current source passes all 672 cases twice, including
through the complete verify-sse recipe. Its 672 frozen-clock store compositions
pass too. The new generator changes no production route or stream implementation.

F1 remains green: the seat's 46-case observer matrix was rerun against this source,
exit 0, including same-fiber cause equality, synchronous thrown identity, external
interruption, three accepted Tasks and fallback timers. F2 remains green: the full
Mac helper exits 0 with 160 tests in 33 suites; the unchanged reconnect test takes
8.242 s and the three-order proof takes 2.088 s. Diagnostic/contract and durable
HTTP follow-ups also pass. No Swift test or app source changed in this correction.
O1's shared host clock remains in both reusable meters. The earlier corrected
latency measurements remain historical evidence; this correction measures idle
cost against 22f12b3c rather than claiming another latency comparison.

The idle meter uses compiled production servers with identical counters, five
alternating pairs, one/two/five streams and cloned synthetic databases with 178
open Tasks, five Projects, 39 Tags and 108 link Attachments. Intervals are
2.007–2.012 s, measured on the shared host clock; one-minute load is 5.08–5.84.
The table reports process CPU ms per elapsed second, median and range across five
samples. Meter accounting is included equally in both arms.

| Idle streams | 22f12b3c CPU ms/s | Connection guard CPU ms/s | Passes/s before / after | Query calls per sample before / after | New state checks/s |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 27.05 [21.33–27.74] | 22.28 [15.97–29.81] | 3.984 / 3.984 | 156 / 156 | 4.980 |
| 2 | 19.32 [17.26–33.52] | 17.94 [14.98–32.04] | 7.967 / 7.966 | 228 / 228 | 4.979 |
| 5 | 25.84 [20.44–33.16] | 22.53 [18.71–33.53] | 19.918 / 19.914 | 444 / 444 | 4.979 |

Every sample has exactly 8/16/40 History reads and passes, respectively, and ten
new native state checks. There is no extra idle signal, pass or SQL query. The five
checks per second are the scheduler's five decorated member exits, independent of
stream count; SSE/cache hygiene keep their raw store. CPU ranges overlap, so these
observations establish no measurable idle regression and do not establish a CPU
improvement or literally zero cost.

Revision evidence is local under `.scratch/revision3/evidence/`: `boundaries-red.log`,
`wire-read-red/`, `wire-sync-red/` and `matrix-red/` retain the red controls.
`matrix-green/` and `verify-sse/composition-matrix/` retain all generated compiled
results. `verify-sse/read-snapshot-wire/` and `verify-sse/sync-snapshot-wire/` retain
the literal seq 5/6 witnesses. `observer-matrix.log`, `interruption.log`, `idle/`,
`idle-summary.json`, `mac/`, `server-suite.log` and `root-check.log` retain the
passing checks and raw measurements. Intermediate fixture typing/expectation
failures remain visible; they are not product regressions.

Final required exits: verify-sse 0 (34 focused tests, three direct wire witnesses,
672 generated compiled compositions and the unchanged real CLI/HTTP drive);
server suite 0 (62 tests); full Mac state helper 0; `sh scripts/disk-guard.sh` 0;
`/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` 0 (387 domain, 69 CLI,
62 server, 168 Electron passed, one Electron skipped). Source checks confirm no
domain production, API, Electron or Mac changes relative to 22f12b3c.

O3 is report-only: the seat found retained native Mac requests after stop,
reconnect and Profile switch on both base and head, with subscriptions 1/2/3
draining only after data arrives. The Mac worker owns that production lifetime
fix. B1 and O2 retain their integration/later-work dispositions above. Strict-read
integration must capture the revision before the authorized pass, retain it through
absent/terminal/generation states, obtain a fresh checked lease every pass and hold
none across waiting. No terminal authorization exemption was added to this proof.
Nothing was installed, signed, pushed or merged; the seat re-checks this correction.
After the final checks, lsof confirmed twelve owned Bun compiler runtime copies
were closed; cleanup removed 1,063,930,368 bytes and retained the receipt locally.
