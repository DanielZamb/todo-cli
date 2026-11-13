# Stream wake on the strict server reads

Done by Claude Opus 5.5 (effort high) in the STREAM-WAKE thread, under the
INTEG-WAKE brief. Branch `integ/server-wake`, created from `integ/server` at
2a840b5554227c2cd5f476e793f196536c18b6ad. Merge commit
c5465f0c7d7a7a0311544307feb727e2efe2cda7 has exactly the parents 2a840b55 and
21a4a52e8847908a1c8588d8d79a76673ff14807 (`perf/stream-wake`). Neither input
branch moved. All runs used scratch HOMEs and databases under an OS-level
`sandbox-exec` denial of `~/.todo-cli` and ports 4310/14310 (loopback only).
Evidence stays local under `docs/evidence/ui-speed/integ-wake`, ignored by Git.

## Merge resolutions

Three files conflicted; `server.ts` merged cleanly; one more file changed on
both sides with identical bytes (`packages/domain/scripts/verify-profiles.ts`,
the schema-7 literal both branches corrected).

| Region | integ/server changed | perf/stream-wake changed | Result |
| --- | --- | --- | --- |
| `sse.ts` imports and signature | `StoreError`, `ProfileId`, `Schema`, `TerminalPermission`; `changesLayer(store)` | `StreamWake` type; `changesLayer(store, wake)` | Both: the strict imports and class, plus the wake parameter |
| `sse.ts` initial state | `{ cursor, generation }` from the checked `withRead` subscription | `wakeVersion: wake.version` | `{ cursor, generation, wakeVersion: wake.version }` |
| `sse.ts` loop head | `Effect.sleep("250 millis")`, then the terminal branch, then `withStreamRead` | `wake.wait(state.wakeVersion)`, `const wakeVersion = wake.version` before the pass's first read | The wait replaces only the sleep; the version is read on the next line, before the terminal branch's `authenticate` and before `withStreamRead`'s lease. Nothing else moved |
| `sse.ts` reload return | `{ cursor: restore_seq, generation }` | `wakeVersion` | `{ cursor, generation, wakeVersion }` |
| `sse.ts` ordinary/absent/terminal return | `{ ...state, cursor: batch.cursor, terminal? }` | `{ ...state, cursor, wakeVersion }` | `{ ...state, cursor: batch.cursor, wakeVersion, terminal? }` |
| `sse.ts` terminal branch | `authenticate` then `profile_deleted` failure | (absent) | Unchanged; it fails, so it returns no state |
| `server.ts` (clean) | read ports, `snapshotResult`, owner reads | `rawStore`; `wake`; `store = streamWakeStore(rawStore, wake)`; hygiene and `changesLayer` take `rawStore` | Exactly the wake's diff on the strict file |
| `docs/architecture.md` Live updates | strict per-pass lease, reload and terminal rules | wake paragraph | Both: the strict text, then the wake text, then one sentence on how they compose |
| verify-sse `SKILL.md` | expiry fixture guard, restore/Purge integration | in-process commit wake section | Both, in that order |

Every pass still opens a fresh checked lease inside one synchronous
transaction. No lease or authority is held across the wait: the wait runs
before `withStreamRead`, and `withinLease` clears its lease inside the same
synchronous transaction. `terminalChangesRead`, `changesRead`,
`withStreamRead`, `withRead`, `checkRead`, `authenticate` and
`snapshots.generation` are all called on the raw store that `changesLayer`
receives, never through the decorator. The one-shot `TerminalPermission`
compares cursor and generation only, so the extra `wakeVersion` field in the
state it copies does not change what it binds.

## Members the textual merge could not see

The merge commit fails typecheck by design: the decorator's exhaustive policies
and the composition catalog do not know 27 public members the strict reads and
the Snapshot fix added. 21 are on Authentication, four on OperationStore
(`changesRead`, `committedHistory`, `graphRead`, `terminalChangesRead`) and two
on Snapshots (`listRead`, `showRead`). With only the decorator classified, the
catalog still fails. Commit 73919dea classifies all 27 as reads: none commits
anything except `perform`'s rejected rows. The six that take a callback run inside
the lease (`withRead`, `withMetadata`, `withState`, `recheckRead`, `withOwnerRead`,
`withStreamRead`) are catalog boundaries, like `readSnapshot`. The generator now
runs each of them alone, around `mutate` and inside `mutate`, so a write composed
inside a read lease is shown to signal only at the outermost exit. That gives 77
leaves over 24 paths, each with commit and rollback: 3,696 cases. The original
six paths alone are 924. 19 of the 21 new leaves succeed;
`terminalChangesRead` uses a refusal fixture (a terminal authority exists only
for a deleted Profile's last batch) and `showRead` fails as not-found on an
absent Snapshot, like `show("absent")`.

## Hidden interactions

**Restore erasure** (`stream-wake-restore.test.ts`). A pending Purge-erasure job
and its image are on disk when the decorated `restore` runs. Exactly one signal
fires, and when it does the image is gone, the queue is empty and no
transaction is open. Nothing signals earlier: the erasure runs after the restore
transaction but inside the same synchronous member call.

**Changes landing between the wake and the lease**
(`stream-wake-lease-window.test.ts`, 8 of 8, three consecutive runs). A hook in
the stream's own post-wait `wake.version` read commits a revoke, a Profile
deletion or a restore, either before the version is taken or after it:

| Change | Credential | Frames after `ready` |
| --- | --- | --- |
| Revoke | read-only Token | failure, close |
| Profile deletion | owner Session | TaskCreated, TaskDeleted, ProfileDeleted, failure, close |
| Profile deletion | deletion-revoked scoped Token | failure, close |
| Restore | owner Session | reload with the restored generation, then the next operation |

The pass's fresh checked lease sees each change in both orders. With the
version taken after the change, the next wait returns at once and costs one
spurious pass.

**The strict branch's 37 stream scenarios.** The read-control harness closes
`READ_CONTROL_POLL_GATE` while it arranges an interleaving (for example a
Profile deletion, then a restore, then a credential change). The gate held
`Clock.sleep`, which every timer pass slept on. The wake's signal path does not
sleep, so the harness no longer held the passes it means to hold. Commit
a74f66c0 makes the read-control after-build add a gated zero sleep right after
`wake.wait`, before the pass takes its version and lease.
`READ_STREAM_WAKE_UNGATED=1` builds without it.

- Gated, the wake active: 37 of 37 pass. Frames equal integ-server's recorded
  2a840b55 frames in all 37, once the 32-hex credential ids from the regenerated
  fixture are renamed by first appearance; the base frames equal too.
- Arrival, measured from the gate opening (timer base 8292b067 against the merged
  wake, same run): where an HTTP write happened during the closed gate
  (`delete-*`, `revoke-*`, `restore-*`, `restore`), the first frame comes after
  3.7 to 15.2 ms instead of 145.6 to 242.0 ms. Frames driven by CLI writes or
  expiry (`expire-*`, `never-created`, `ordering-reconnect`, the operation after
  reload) and the final failure after a terminal batch keep the fallback
  interval, about 255 ms, on both.
- Ungated, informative: 18 of 37 pass unchanged. The 19 others are all in the
  21-case restore matrix; see the next section.

**One-stream Purge, restore and Profile deletion** (the seat's
`stream-chain.ts`). Gated: 7 of 7 frames, identical to the seat's 2a840b55
capture (ready, reload, TaskCreated, two TaskDeleted, ProfileDeleted, the exact
Profile refusal). Ungated: an operation arrives before the reload, the same
interleaving effect.

## A deletion and a restore close together

This is what the wake is for, and it changes what a client usually sees.
With the timer, a Profile deletion and a restore less than 250 ms apart usually
fell inside one sleep and arrived as one pass, which saw only the restored
state. With the wake, the deletion's own commit wakes the stream at once, so a
pass sees the deletion before the restore commits: a valid unscoped credential
gets its terminal batch and the stream closes; a scoped Token gets `revoked`.
The client then reconnects into the restored state. This is the strict loop's
own outcome for that order of events (the timer gives the same frames whenever
its tick falls between the two requests), so it is correct, but it is now the
usual case. The Mac and Electron clients must be checked against it at the
candidate 8 merge.

| Credential (restore matrix case) | Deletion and restore in one pass (gated; usual on the timer) | Pass between them (ungated; usual with the wake) |
| --- | --- | --- |
| Owner Session, Profile restored (`restore-active-owner`) | ready; reload `{"generation":"…0011","seq":18}`; then the next TaskCreated | ready; TaskDeleted; ProfileDeleted; failure `not_found` "Profile not found; choose a Profile from GET /profiles"; close |
| Scoped Token removed by the restore (`restore-absent-scoped`) | ready; failure `Unauthorized invalid_credential` | ready; failure `Unauthorized revoked` |

Both rows are literal frames from the runs (the ungated ones from a capture
copy of the driver that drains the stream instead of asserting at the first
non-reload frame; `docs/evidence/ui-speed/integ-wake/capture-ungated`). In the
ungated owner case the failure follows the ProfileDeleted frame within 0.1 ms:
the restore's own signal ends the next wait at once, so the closing failure no
longer waits for the fallback either. The client then reconnects and sees the
restored Profile.

## Review 3's three small items

- **R3-I1** (89c17a73). A synchronous member classified `write` that throws now
  records a pending notification: `finished(() => writes)` on the throw path.
  The new test commits a Task inside a throwing `createSync` and expects the
  thrown error unchanged and wake version 1; on the old line it gets 0. A
  throwing read still signals nothing. This changes one literal in the seat's
  46-case observer matrix, by this ruling: for the synchronous-throw rows,
  `assert.equal(wake.calls, outcome === "success" ? 1 : 0)` becomes
  `assert.equal(wake.calls, 1)`. Unchanged, the matrix fails at its first such
  row (actual 1, expected 0); with that literal, 46 of 46 pass.
- **Guards** (4729ba19). The two readers that hold the raw store take
  `StreamReads` and `CacheHygieneReads` (type annotations only, no runtime
  change). `raw-store-guards.test.ts`:
  - a typecheck test: neither type can build TaskCommands, be decorated or
    reach `append`, `mutate` or `restore`;
  - a source test: no private-connection access outside `stream-wake-store.ts`;
    no BEGIN, COMMIT, ROLLBACK, SAVEPOINT or RELEASE in `apps/server/src`;
    `openStore` once; `rawStore` on exactly its four reviewed lines;
  - all 36 transaction callbacks in the domain and server pinned as synchronous
    (four pass a typed `run` through);
  - an asynchronous step inside each of the eight callback boundaries fails,
    commits nothing and leaves no transaction open;
  - integration note (c): every catalog leaf runs with the owner's Session and
    with an unknown credential; every row written by a member that leaves the
    wake untouched has outcome `rejected`.
- **R3-L1** (a31f73c9). An interrupted `signIn` exits and signals before its
  detached decision commits one Profile-less `AuthChanged` or
  `AuthAttemptRejected` row. Nothing signals that commit, and no stream delivers
  it. Stated in the stream-wake report and `docs/architecture.md`; the domain is
  unchanged.

## Verification inputs changed

- a74f66c0: the read-control poll gate also holds the wake (above).
- b1ab5aaf: the compiled composition matrix gives each case a unique due time.
  The first merged verify-sse run exited 1 at case 3289: the due time
  `Date.now() − 10 s − index s` repeats when a case takes exactly one second (host
  load 15), reminders are received per Task and due millisecond, and `runDue`
  correctly fired nothing. A probe shows the same due time set again fires 0
  reminders. Both exits are kept.
- a24f6047: the meter counts the strict loop's pass query; before this, its pass
  and History counters read 0 on the strict loop.

## Pins

Every file pinned in every `coverage.json`, hashed against the merged head:

| Skill | Pins | Equal to 2a840b55 | What changed |
| --- | ---: | ---: | --- |
| verify-dag-formal | 16 | 16 | nothing |
| verify-discovery-formal | 21 | 21 | nothing |
| verify-occ-atomicity | 10 | 10 | nothing; no listed function changed |
| verify-task-search-cache | 13 | 11 | `server.ts` (the wake wiring), `task-search-cache-hygiene.ts` (type-only narrowing) |
| verify-task-search-formal | 16 | 16 | nothing |

The DAG public mapping (`public-coverage.json`, not a `coverage.json`) also pins
`server.ts` as a whole file. Its check materializes its pinned product 5f46e7b3,
so it still passes but certifies nothing about this head. The bodies it covers
(`rejectUnknownQuery`, `importTasks`, `depend`, `undepend`, `batchDepend`) are
textually untouched, but they now run through the decorated store. Both
mappings are renewed by their own procedures, as candidates for the seat.

Cache renewal so far: the hygiene check on a74f66c0 before renewal runs clean 0,
the three observer controls 1, 1, 1 with their witnesses, restored 0, reaches
the typecheck, and stops only at the stale hash.

## Mac candidate 8 merge

Files outside `apps/server` and `packages` that this head changes against
2a840b55:

- `.agents/skills/verify-electron/SKILL.md`, `scripts/verify.sh`
- `.agents/skills/verify-scheduler/SKILL.md`, `scripts/drive.py`, `scripts/verify.sh`
- `.agents/skills/verify-sse/SKILL.md`, `features/README.md`
- `.agents/skills/verify-sse/scripts/`: `build-idle-meter.mjs`, `drive.py`,
  `host-clock.mjs`, `measure-idle.mjs`, `measure.mjs`, `meter-server.mjs`,
  `nested-wire-server.mjs`, `verify-nested-wire.mjs`, `verify.sh`
- `apps/electron/scripts/verify-design-inventory.ts`,
  `apps/electron/scripts/verify-stream-wake.ts`,
  `apps/electron/test/hidden-host.test.ts`
- `apps/macos/StateTests/StreamWriteOrderTests.swift`
- `docs/architecture.md`, `docs/decisions/ui-speed/stream-wake-report.md`, this report

Inside `apps/server`, `scripts/build-read-control.ts` also changed (the gate hold,
active only in its after-build). The clients must be checked against the
deletion-and-restore interleaving above.

## CLI routing merge (`feat/cli-through-server`)

1. One wake object: drop `OutsideCommit`; the nudge calls `wake.signal()` on the
   server's `StreamWake`.
2. `changesLayer(rawStore, wake)` stays. Drop `makeWait`: `sse.ts` waits only on
   `wake.wait(state.wakeVersion)` and reads the version on the next line.
3. `serverLayer`'s `outsideCommit?: OutsideCommit` becomes `wake?: StreamWake`.
   `StreamWake` takes a fallback constructor parameter (default
   `Effect.sleep("250 millis")`) so `routing.test.ts`'s `Effect.never` nudge-only
   proof survives.
4. `localRoutes(store, …)` receives the decorated store, so in-process commands
   signal at their outermost exit; never `rawStore`.
5. Extend `raw-store-guards`' `rawStore` line list only for a new reviewed reader.
6. Then rerun `raw-store-guards`, the composition catalog (classify any new public
   member first) and verify-sse.

## Proofs

| Proof | Exit | Notes |
| --- | ---: | --- |
| Composition catalog, in process | 0 | 51 tests: 48 path tests over 77 leaves, plus readSnapshot, sync-Snapshot and the detached child |
| verify-sse (first) | 1 | case 3289, the repeated due time above |
| verify-sse (rerun) | 0 | 5 focused files, 71 tests; nested, readSnapshot and sync-Snapshot wire witnesses PASS; 3,696 compiled compositions delivered exactly durable History; CLI writes from another process delivered at 243 to 267 ms (the fallback) |
| 37 stream scenarios, gated | 0 | 37/37; frames equal 2a840b55 |
| 37 stream scenarios, ungated | 1 | informative; 18/37 unchanged, 19 restore-matrix cases explained |
| One-stream Purge, restore, deletion | 0 gated / 1 ungated | 7/7 equal the seat's capture |
| Observer matrix | 1 / 0 | unchanged literal / R3-I1 literal, 46/46 |

| Task search cache, full command on a45ddeaa | 0 | all nine stages 0: properties (seven source controls), hygiene (three observer controls, restored, typecheck, renewed hashes), admission model, admission code, disk, binaries, compiled lifecycle, erasure, CLI defect; `docs/evidence/perf-cache/verify-3LSEWw`; uncached oracle rebuilt for a45ddeaa |
| DAG formal, full default on a45ddeaa (attempts 1 to 4) | 1 | setup only, no product finding: (1) the pinned TLA jar was absent and its download is denied by the sandbox; (2) the nested compiler guard's `ps` is setuid and a sandboxed process may not exec it; (3) production conformance copies the jar from `docs/evidence/dag-formal/tools`; (4) the public stage needs the preserved e7170510 baseline CLI. Fixed by copying the hash-pinned jar (936a2620…) into both tool paths, a profile that execs only `/bin/ps` outside the sandbox (protected directory, ports 4310/14310 and the internet stay denied; controls recorded), and copying the preserved baseline CLI whose SHA-256 and product commit match its provenance |
| DAG formal, full default on a45ddeaa (attempt 5) | 0 | 38 model stages (12 intended violations at exit 12, 26 clean), production conformance with 36 controls, public conformance with 53 controls on product a45ddeaa, each with its intended failure and exact restoration; all 53 anchors matched once before renewal; `docs/evidence/dag-formal/check-CJjEnL` |
| verify-server-api | 0 | |
| verify-auth | 1, then 0 | the first run's driver refused its scratch path because my TMPDIR lacked a trailing slash; rerun with one passes |
| verify-profiles | 0 | |
| verify-snapshots | 0 | default injected repair case (no Snapshot code changed in this merge) |
| verify-scheduler, `TODO_VERIFY_SCHEDULER_NO_LAUNCHD=1` | 0 | restart mid-wait, competing processes, 3 unique reminders, date-only ignored, cleanup; `realLaunchctl: false`, so install/status/uninstall stay unproven |
| Server suite | 0 | 12 files, 120 tests |
| Root check (standing order 27), TMPDIR outside the repository | 0 | disk guard 60.7 GB; install scripts, OpenAPI check, typecheck, lint, then domain 462, Electron 168 (1 existing skip), server 120, CLI 73 |

The contract id is still 78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289:
no file under `packages/api` or `apps/macos/API` differs from 2a840b55.

## Renewals and what they certify

Both are candidates for the seat. Rows were recomputed from product a45ddeaa's
bytes by a script that refuses any row that is not one of the expected stale
ones (commit 9709abbe).

- **verify-task-search-cache** (two hygiene rows: `server.ts`
  4abead0e… → aef0cf33…, `task-search-cache-hygiene.ts` be77122a… → acd46be9…;
  `productCommit` a45ddeaa). It certifies the store-owned folded-word memo, its
  admission model and controls, and the server's cache hygiene observer as wired
  in this product. Hygiene still receives the undecorated store and is forked
  before the scheduler; its parameter narrows to `CacheHygieneReads` with a
  byte-identical body.
- **verify-dag-formal**, public map (`server.ts` 4abead0e… → aef0cf33…;
  `confirmedCommit`, both pins' `commit` a45ddeaa). It certifies finite DAG safety
  and production and public conformance on this product. `rejectUnknownQuery`
  and the `importTasks`, `depend`, `undepend` and `batchDepend` handlers are
  textually unchanged; they now reach their commands through the decorated
  store, which signals open streams at the outermost exit. The other 15 DAG
  `coverage.json` pins and 55 public pins are byte-identical.
- The other mappings (discovery-formal, occ-atomicity, task-search-formal) pin no
  changed file and are not renewed. No function listed in verify-occ-atomicity's
  `coverage.json` changed.

## Latency and idle, timer against wake

Meters: verify-sse's `meter-server.mjs` compiled at this head (wake) and with the
three `apps/server/src` files that differ from integ/server served from 2a840b55
(timer: the strict loop with its 250 ms sleep and no decorator). `measure.mjs`:
five alternating pairs, 40 edits per arm per pair, 178-Task fixture, shared clock
`clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)`, 10 cores. Run 13:43 to 13:46 UTC,
one-minute load 4.33 to 6.11 throughout (three other units active).

| Commit to received operation, ms | Timer (2a840b55) | Wake (merged) |
| --- | ---: | ---: |
| Median | 114.139 | 1.059 |
| p90 | 217.963 | 3.588 |
| p99 | 245.490 | 9.217 |
| Maximum | 247.429 | 13.514 |
| Event before parsed reply | 1/200 | 76/200 |
| Negative intervals | 0 | 0 |

Pair medians: timer 122.42, 123.83, 115.26, 106.69, 108.64; wake 1.09, 0.97,
0.89, 1.08, 1.24.

| Idle streams | Timer passes/s | Wake passes/s | Timer CPU ms/s, median [range] | Wake CPU ms/s, median [range] |
| ---: | --- | --- | --- | --- |
| 1 | 3.99 [3.98–3.99] | 3.99 [3.99–3.99] | 26.8 [20.3–38.0] | 24.2 [20.6–26.3] |
| 2 | 7.99 [7.98–7.99] | 7.99 [7.99–7.99] | 24.3 [15.8–27.4] | 19.3 [18.0–34.4] |
| 5 | 19.96 [19.89–19.96] | 19.96 [19.88–19.96] | 23.1 [20.7–24.6] | 26.5 [20.7–30.8] |

There are no extra idle passes; CPU ranges overlap, so no idle CPU difference is
established. 300-edit serial burst with one stream: timer 9 to 11 passes and
History reads, 2,302 to 2,730 ms server CPU; wake 300 passes and History reads,
2,374 to 3,530 ms CPU. Task read p50 1.3–1.6 ms (timer) against 1.1–1.9 ms (wake),
p99 4.5–5.5 against 4.9–14.7 ms. Serial edits produce one pass each with the
wake, as reviews 2 and 3 found on the base.

## Limits

No Swift was built or run; the Mac side belongs to candidate 8. Native apps,
Keychain, signing and launchd were not used. Bounded models, observed timing and
fixture parity prove no unbounded property.
