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
| Owner Session, Profile restored (`restore-active-owner`) | ready; reload `{"generation":"…0011","seq":18}`; then the next TaskCreated | ready; the deletion batch (first frame an operation: TaskDeleted …, ProfileDeleted); failure; close |
| Scoped Token removed by the restore (`restore-absent-scoped`) | ready; failure `Unauthorized invalid_credential` | ready; failure `Unauthorized revoked` |

The scoped row is literal from both runs. The owner row's ungated first frame
is observed as an operation (the run's assertion expects reload or failure);
its full frame list will be captured by one ungated single-scenario run. The
lease-window test above gives the Session's full sequence for the same
interleaving: TaskCreated, TaskDeleted, ProfileDeleted, failure, close.

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

PENDING-PROOFS
