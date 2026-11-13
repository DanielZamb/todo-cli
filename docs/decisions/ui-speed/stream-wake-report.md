# In-process stream wake

Implementation: `4dad570ae4543a034a0bc27aca57264f2fb67c8c`, branch
`perf/stream-wake`, based on `6b167266fc34c3304e30ed220bb652b4d17c05ab`.
The delivery also registers the verifier and records this report. No client
application code, dependency, contract id, route, header or event changed.
Nothing was installed, signed, pushed or merged. All data and processes were scratch.

## Commit coverage and waiting

`apps/server/src/server.ts:296` constructs one StreamWake and decorates the server's
store. Every route, command, import, batch, Attachment operation and the scheduler
receives that decorated store. Exhaustive policies in `stream-wake-store.ts`
classify every public member of OperationStore, Authentication, Snapshots and
ScheduledWork. New routes using these boundaries need no signal call. New public
members require a policy at typecheck. Preview forks remain isolated.

`afterWrite` signals in its Effect finalizer, after the outer operation finishes.
Its Effect context reaches synchronous nested mutation callbacks, so inner appends
cannot signal inside the enclosing transaction or produce another empty pass.
Errors and interruption can produce harmless extra passes. runDue, cleanupExpired
and runDaily signal only for actual work or failure. Snapshot create, restore and
prune use the same wrapper. Initialization finishes before streams exist.
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

Five paired runs alternate order, with 40 HTTP edits per arm per pair and varying
0–250 ms arrival delays. Percentiles use nearest rank. A compiled meter records
the shared epoch clock immediately after an outer Bun transaction returns. The
real SSE reader matches the operation id to that commit. Receipt excludes app refresh.

| Commit to received event, ms | Timer | Wake |
| --- | ---: | ---: |
| Samples | 200 | 200 |
| Median | 112.151 | 0.828 |
| p90 | 213.777 | 2.051 |
| p99 | 241.877 | 7.438 |
| Maximum | 247.086 | 11.306 |
| Per-pair median range | 101.091–119.279 | 0.172–1.792 |
| Event received before parsed write reply | 0/200 | 67/200 |

The synthetic database has one populated and seven empty Profiles, 178 Tasks,
50 open, 126 done, two cancelled, 39 Tags, five Projects and 108 link Attachments.
Most descriptions have 1,275 characters; the maximum has 5,250. This ordinary-edit
fixture does not reproduce the owner's Dependency graph. No owner data or private
copy was used.

The shared ten-core host had one-minute loads of 6.67–15.73 in timer arms and
6.99–13.78 in wake arms. Removing the timer explains the latency change; the
frozen-clock test independently proves that difference. An excluded sample run
shows the server main thread busy in JavaScript, with some SQLite work and runtime
threads mostly waiting. Bundled JavaScript frames are unsymbolicated. Remaining
delivery includes History decoding, authorization, runtime dispatch and loopback.
Both arms have the same accounting queries and stdout records. These observations
do not establish app apply latency or a production p99.

Discarded instrument runs used Bun's per-process hrtime origin, yielding invalid
cross-process intervals. Final runs use `performance.timeOrigin + performance.now()`
on both sides. Another discarded instrument build failed Bun's non-configurable
transaction-property invariant; the final meter wraps aliases on a separate function.
Failed calibration runs remain separate and are excluded from these tables.

## Idle and burst costs

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

The new Mac order case passed twice, in 1.785 s and 4.957 s. The full Mac helper
failed twice, each with one issue in the existing
productionSearchOrderingRecoveryAndReload case. It times out at
`apps/macos/StateTests/TaskSearchStateTests.swift:591`, waiting for a deliberately
disconnected stream to reconnect and recover an errored search. The final run has
160 tests in 32 suites and one issue, exit 1. Load was shared with builds, checks
and measurements. This is a reproducible headless reconnect finding, not a proven
product regression from this unit. It was not suppressed or fixed. Package.resolved
comparisons exited 0. A separate base/control run remains owed.

## Verification and delivery

The frozen-clock server-write test fails against the base SSE sleep at its
10-second deadline without clock advance, then passes with the wake. A compiled
CLI child commits independently and stays undelivered through 249 ms, then arrives
after advancing to 250 ms. Other cases prove 300-signal collapsing, five-waiter
broadcast, cancellation/reopening counts, reentrant broadcast safety and no wake
inside an enclosing transaction.

| Check | Exit and result |
| --- | --- |
| Extended verify-sse | 0, compiled HTTP/CLI drive and 11 tests |
| verify-server-api | 0 |
| verify-profiles | 0, stale verifier schema expectation corrected from 6 to literal 7 |
| verify-scheduler | 0, all non-lifecycle assertions; launchd explicitly skipped |
| Full unsigned verify-electron host | 0, THIN_PASS_NATIVE_BLOCKED |
| Electron order drive | 0, all three orders |
| Electron suite | 0, 168 passed and one skipped |
| Server suite | 0, 39 passed |
| Mac state helper through swift-slot | 1, own-write orders pass; reconnect case above fails |
| Locked root check | 0, after disk guard; 387 domain, 69 CLI, 39 server, 168 Electron tests passed; one Electron test skipped |
| Documentation links | 0, zero broken local links |

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
The no-comments skill's delegated reviewer was not launched because the worker's
explicit no-children instruction takes precedence. The independent correctness
seat is the coordinator's next step. No live Mac UI verdict is claimed. The generic
Mac reconnect failure and missing ReadBackOwner are outside this implementation.
