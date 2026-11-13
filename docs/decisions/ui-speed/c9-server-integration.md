# c9 server integration: durable refusals on the stream wake

Done by Claude Opus 5.5 (effort high) in the STREAM-WAKE thread. Branch
`integ/c9-server`, created from `integ/server-wake` at
f89b66938680bb85958b8e7227e5b09b2db8fc9d. Merge commit
7b279032464545c761f89720fc632ad4df4a0099 has exactly the parents f89b6693 and
366398fee017277e0286fbc3b9094fa09d8ce563 (`fix/durable-denial`, PASS and
INSTALL: SAFE after three re-checks). Neither input branch moved. Every binary
ran under an OS-level `sandbox-exec` denial of `~/.todo-cli` and ports
4310/14310, with scratch HOMEs and databases. Evidence is under
`docs/evidence/ui-speed/integ-wake` (`c9-*`), local and ignored.

## Merge resolutions

- `packages/domain/src/auth/auth.ts`, the new `auth/rejection-history.ts`, the
  verify-auth recipe, AUTH.md, ADR-0007, `docs/architecture.md` and the
  verify-dag-formal SKILL.md merged cleanly. The merged `auth.ts` equals the
  refusal side byte for byte (0b743e8e…), and `apps/server` equals the wake side.
  Authentication gains no public member (only two private fields are removed),
  so the wake decorator's policies and catalog needed no change.
- verify-dag-formal `coverage.json`, `public-coverage.json`, `public-pin.json`,
  `production-pin.json` conflicted: both branches renewed the mapping, to
  a45ddeaa (wake) and 13ff84d6 (refusal). Both records are kept
  (`streamWakeIntegration`, `durableDenialCandidate`). The pinned rows merged
  cleanly to the merged bytes: `server.ts` from the wake side, `auth.ts` from the
  refusal side. The product fields kept a45ddeaa provisionally in the merge
  commit; the renewal moved them to the merged product.

## What the textual merge could not see

`apps/server/test/durable-denial-wake.test.ts` observes every History walk of
the refusal rule at its query, with the connection's transaction state at that
moment.

- **Read-path refusals under the decorator.** First refusal: one rejected row,
  no wake. Two repeats: no row, no wake. Walks: read miss, locked miss, then read
  matches only. The guard that every row written by a member that leaves the wake
  untouched is `rejected` (`raw-store-guards`) still passes in the server suite.
  A refusal on a member classified `write` (`auth.append`) wakes once on every
  exit by design. So a repeat that commits nothing costs one empty pass, and the
  first refusal of that key adds its own row. Literal steps:
  `[read first, Failure, 1, 0], [read repeat, 1, 0] ×2, [write first, 2, 1], [write repeat, 2, 1]`.
- **A stream's refusal.** A correction to the expectation that the stream takes
  the locked path. The pass's lease runs inside `withinLease`'s immediate
  transaction, and `perform`'s catch runs after that transaction has ended. A
  stream's refusal is therefore decided by the read first, and only on absence
  inside the recording transaction. Only a `perform` nested inside an outer
  transaction skips the read.
  - On a real server with two streams: a Token revoked from another connection
    is refused at the next pass (failure, close), and three reconnects are
    refused (401, 401, 401). That leaves exactly one AuthAttemptRejected row.
  - Walks: `[false, true, false, false, false]`.
  - The valid stream beside it delivers both later operations through its own
    checked leases.
  - Passes three runs in a row.
- **The denial unit's process matrix with streams open.** A scratch variant of
  `check-cross-process.mjs` logs a second, valid Session into the same database
  and revokes only the refused credential. Every server it starts gets an SSE
  stream on that Session and one HTTP write.
  - On the merged compiled CLI and server: matrix `[1,1,1,1,1,1]`, exit 0.
  - Each of the six streams received exactly `ready` and its own operation, and
    no refusal frame.
  - Two setup runs are kept: the first crossed a minute boundary (the variant's
    stream setup lengthened each case past the driver's 15 s margin; widened to
    40 s), and the second reset its own sockets by stopping servers before
    aborting their streams (fixed). Both showed the same matrix and stream
    events.

## Pins and renewals (candidates for the seats)

Audit at 0bd8476d: every pinned row equals the merged head.
- verify-dag-formal: `coverage.json` 16 rows, `public-coverage.json` 56.
- discovery-formal: 21.
- occ-atomicity: 10. No listed function changed.
- task-search-cache: 13.
- task-search-formal: 16.

Renewal commit 5dd07ec6, by script from product
0bd8476df7d7147ea355b418346b57d33f403aee; no row drifted:

- **verify-dag-formal** (both coverages, both pins): `confirmedCommit` and
  `commit` move to the product. It certifies finite DAG safety and production
  and public conformance on the merged product, with the wake's `server.ts` and
  the refusal's `auth.ts`. This is the full default run that the 13ff84d6
  renewal was accepted without. Full default on the product: **exit 0**, first
  run (`docs/evidence/dag-formal/check-CnyTmJ`):
  - 38 model stages (12 intended violations, 26 clean);
  - production conformance with 36 controls;
  - public conformance with 53 controls;
  - all 53 anchors matched once before renewal.
- **verify-task-search-cache**: `productCommit` a45ddeaa → product. No covered or
  hygiene file changed: the refusal touches only `auth.ts` and
  `rejection-history.ts`, neither mapped here. The uncached oracle was rebuilt
  for the product. Full command: **exit 0**, all nine stages
  (`docs/evidence/perf-cache/verify-hctAPE`).

## Proofs on the merged head

| Proof | Exit | Notes |
| --- | ---: | --- |
| verify-sse | 0 | 71 focused tests (compositions and writer cases included), three wire witnesses, 3,696 compiled compositions; CLI fallback 253–256 ms |
| 37 stream scenarios, gated | 0 | 37/37; frames, pass check and final credential identical to the wake head's run |
| verify-auth (`verify.sh`, with `verify-durable.sh`: cross-process matrix, compiled domain driver and walk-sqlite control) | 0 | matrix `[1,1,1,1,1,1]` |
| verify-op-log | 0 | |
| verify-cli | 0 | |
| verify-server-api | 0 | |
| verify-profiles | 0 | |
| verify-snapshots | 0 | |
| verify-scheduler, `TODO_VERIFY_SCHEDULER_NO_LAUNCHD=1` | 0 | launchd unproven |
| Server suite | 0 | 15 files, 155 tests |
| Root check (standing order 27, TMPDIR outside the repository) | 0 | disk guard 66.3 GB; domain 486, Electron 168 with 1 existing skip, server 155, CLI 73 |

The contract id is still 78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289:
no file under `packages/api` or `apps/macos/API` differs from 2a840b55.

## Mac merge

Files outside `apps/server` and `packages` that this head changes against
2a840b55:
- `.agents/skills/verify-auth/`: `SKILL.md`, `features/history.md`,
  `scripts/check-cross-process.mjs`, `scripts/verify-durable.sh`,
  `scripts/verify.sh`
- `.agents/skills/verify-dag-formal/`: `SKILL.md`, `coverage.json`,
  `production-pin.json`, `public-coverage.json`, `public-pin.json`
- `.agents/skills/verify-electron/`: `SKILL.md`, `scripts/verify.sh`
- `.agents/skills/verify-scheduler/`: `SKILL.md`, `scripts/drive.py`,
  `scripts/verify.sh`
- `.agents/skills/verify-sse/`: `SKILL.md`, `features/README.md`, and in
  `scripts/`: `build-idle-meter.mjs`, `drive.py`, `host-clock.mjs`,
  `measure-idle.mjs`, `measure.mjs`, `meter-server.mjs`, `nested-wire-server.mjs`,
  `verify-nested-wire.mjs`, `verify.sh`
- `.agents/skills/verify-task-search-cache/`: `SKILL.md`, `coverage.json`
- `apps/electron/scripts/verify-design-inventory.ts`,
  `apps/electron/scripts/verify-stream-wake.ts`,
  `apps/electron/test/hidden-host.test.ts`
- `apps/macos/StateTests/StreamWriteOrderTests.swift`
- `docs/adr/0007-operation-log-is-the-source-of-truth.md` (the refusal unit's
  proposed wording, pending the owner's acceptance), `docs/architecture.md`
- `docs/decisions/ui-speed/`: `durable-denial.md`, `durable-denial-formal.md`,
  `stream-wake-report.md`, `stream-wake-integration.md`, this report

## Limits

No Swift was built or run. Native apps, Keychain, signing and launchd were not
used. The refusal rule's stated ordering limit and F7 (cost only) are unchanged
by this merge.
