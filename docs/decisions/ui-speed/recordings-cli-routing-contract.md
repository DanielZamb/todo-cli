# Recordings and CLI routing on one line

2026-11-13, Claude Opus 5.5 (DIAG-CORE), on `integ/contract`. This is step 1
of INTEG-CONTRACT; no Swift ran in this step. Evidence is local and Git-ignored,
under `docs/evidence/ui-speed/contract/`.

## The line

| Commit | What |
| --- | --- |
| d9c70249 | The merge, one commit, no squash or rebase. Parents: `feat/diag-core` 2538e94b (recordings, contract 55c6d138) and `feat/cli-through-server` 062e242f (CLI routing slice 1, contract 259e9afb). Merge base 675aab82. `database-endpoint.ts` is byte-identical to 062e242f. |
| 13837b70 | The descriptor-window rule. This is the coordinator's ruling, option A, kept in its own commit for the routing seat. |
| 29927cb0 | Cross-side probes (`recordings-routing.test.ts`). This is the product, P3, for every renewal. |
| 9774cb25 | verify-dag-formal and verify-task-search-cache renewal inputs (candidates). |

**New contract id: dae320b089cf4847ab92cc172bd8d808e0e21701dbe19bf77bb5babea0d99a23.**

`pnpm --filter @todo/api openapi` generated `openapi.json`, `contract.ts` and
`ContractIdentity.swift` from the merged sources; `openapi.ts --check` exits 0.
Every value in the generated document comes from one parent:
- 8 are this branch's (the recording routes and their schemas);
- 3 are the routing branch's (`/local/commands`, `/local/database-proof` and `/local/nudge`);
- the tag list is the union (`profiler`, `local`).

## Resolutions

| File | Resolution |
| --- | --- |
| `apps/server/src/server.ts` (conflict) | Both sides kept. Order: the endpoint and guard first, then the start-up evidence window around the store acquisition alone, then `verifyStore`, then the recordings service (its worker starts there), then one `StreamWake` (`options.wake ?? new StreamWake()`) and its decorator. `localRoutes(store, endpoint, wake)` and `recordingRoutes(recordings, store)` both get the decorated store, and both sit under the Diagnostics middleware. Release runs in reverse: recordings, then the store, then the endpoint and guard. |
| `apps/cli/src/main.ts` (auto-merged, read) | `withStore` keeps routing's write mode, discovery and server-mode refusal before the store opens. This branch's Diagnostics command root wraps `use(store)`. Routing's `closeThenNudge` runs in the store's release, after the connection closes and outside the root. |
| `apps/cli/src/help.ts`, `flag-inventory.ts`, `docs/architecture.md`, `.agents/skills/verify-cli/features/flag-contract.md` (auto-merged) | Both sides' text. The flag-contract pair counts are corrected to the merged CLI's 1002/1000, which is 886 plus two global flags on 58 entries; the routing side had left 802/800 although its own fixture had 908 pairs. |
| `apps/cli/test/fixtures/cli-flag-contract.json` (conflict) | The merged compiled CLI's flag golden, from the test's own `captureFlagInventory` and `flagGolden`. Every entry follows from the base and the two parents. 52 help hashes and 50 schema hashes are the routing side's, because its two global flags touch every command. `diagnostics` (help and schema) and `top` (schema) changed on both sides and carry new values. The five recording subcommands are this branch's plus the two global flags. |
| `packages/api/src/index.ts` (auto-merged) | Both groups (`Profiler`, `Local`) and both imports. |
| `packages/domain/package.json` (conflict) | Both pairs of exports. |
| `packages/api/openapi.json`, `contract.ts`, `ContractIdentity.swift` (conflicts) | Regenerated, never merged by hand. |
| `apps/server/test/raw-store-guards.test.ts` (auto-merged) | Both census changes: the transaction count stays at 39, and the one allowed transaction statement in the server's sources is the guard's `BEGIN EXCLUSIVE` on its own file. |
| verify-dag-formal pins and coverage, verify-task-search-cache coverage and SKILL.md (conflicts) | Both sides' records; the hash values were renewed on P3 afterwards. |
| `biome.json` (neither parent) | An override raises `files.maxSize` to 8 MiB for `packages/api/openapi.json` alone, which the tool allows; the rest of the tree keeps 4 MiB. The merged document is 4.3 MiB formatted, over the limit, so the generator's format step failed; each parent alone was under it. Without the override biome refuses the file. Accepted by the coordinator. |

**Line accounting** (`.scratch/contract/line-accounting.py`, every merged line
against both parents, generated files excluded): 223 files and 17 lines from
neither parent.
- 9 are the biome override;
- 2 are the flag-contract counts;
- 5 are the `  },` separators between the two sides' records in the mapping JSON;
- 1 is this branch's export line gaining its comma.

## The descriptor finding (for the routing seat)

**Finding.** `verifyStore`, and the guard check (`beforeGuard`/`afterGuard`),
counted a descriptor as evidence only when its number was absent before the
window. The recordings worker opens and closes `recordings.db`, its sidecars,
flock files and temporary image-check files on its own thread. When it closes a
number that was open before the window and the window's open reuses that number,
the old rule refused a genuine store:

> Server startup refused: SQLite store file differs from the kept database descriptor

**Rule (13837b70, `openedInWindow`, used by both checks).** A descriptor counts
when all three hold:
- it is not the kept descriptor;
- it names the kept file after the window;
- its number was absent before the window, or named a different file then.

**Why swap-back protection is not weakened.** A descriptor's identity (device,
inode, birth) is fixed for the life of its open. So a number whose identity
changed was opened inside the window, and the evidence is still "something other
than the kept descriptor opened the kept file in this window". A number that
already named the kept file before the window is still never counted, and the
kept descriptor is excluded.

**Tests** (`descriptor-window.test.ts`, deterministic, no threads). A file
occupies the lowest free number, the before list is taken, the file is closed,
and the window's open takes that number. For the guard, a `bun:sqlite` hook
closes the occupier just before the guard's connection opens.
- Both reuse cases (store, guard) are red on d9c70249 ("Server startup refused…" and "Server guard connection file differs…") and green on 13837b70.
- Four negative controls refuse on both: a store or guard connection on another file at a reused number beside an unrelated new descriptor, and a number that named the file before and still does (swap-back), each for the store and for the guard.
- The window source test now also pins the order: the recordings service is built once, after `verifyStore`. It fails with the service moved before the window.

**Probe evidence** (scratch, probabilistic: `fd-race-probe.ts`). serverLayer was
built repeatedly in one process while recordings stores opened and closed on the
worker:
- without churn: 30/30 starts;
- with churn, at d9c70249: 197/200;
- with churn, at 13837b70: 400/400.

**Exposure.** None with one server per process today: the server's own worker
starts after the window. It affects any process with two servers
(`wake-routing.test.ts`'s two-server probe, these tests), or any thread that
opens and closes descriptors during the window.

**Limits that remain** (stated in the window comment):
- nothing else in the process may open the database path inside the window, since an extra open would supply false evidence;
- a number that held the same database before the window is never counted.

The routing seat's S1 probes (`probe3.ts s1`, against barrier builds of the
merged `server.ts`) give 7 PASS and 1 FAIL, case for case the seat's own run on
42f34353. The failing case is the seat's known X1: a rename between store open
and verify gives a macOS SQLite disk I/O error, which predates the branch and is
a separate follow-up. Its `fd` part passes: `/dev/fd` lists every descriptor of
300 opens.

## What the text cannot show (29927cb0, `recordings-routing.test.ts`, 8 tests)

1. **Descriptors.**
   - `verifyStore` accepts the store with another recordings store already open in the process; the proof's binding is the database's identity.
   - After start-up the server's own recordings store initializes beside the record and guard. The guard stays held: a second participant gets `DatabaseHeldError`. Proof and an authorized nudge still succeed.
   - Opened and closed repeatedly: the descriptor-window tests and the probe above.
   - `check_unavailable`, `store_busy`, `initialization_busy` and `directory_not_private` each give the same reason, detail and guidance with the live routing record and guard beside `diagnostic-recordings` as in a tree without them. Routing's files, the record's bytes and proof are unchanged afterwards.
   - `store_busy` is made deterministic with the inspection bound at zero. A writer-process probe under load gave only `foreign_catalog` in both layouts (`store-busy-beside.json`).
   - **Privacy:** a recordings directory that fails its own rule does not stop routing, and routing's own non-private directory still refuses with recordings beside it. The two rules differ by design. Routing requires exactly 0700 on its own directories; recordings requires owner read, write and search, and treats an access failure as a directory fact only after confirming it (R7-1).
2. **One wake.**
   - There is one `StreamWake`. A nudge moves it +1, a recordings ingest +0 and a Task write +1. A nudge that does not signal fails this test.
   - Every route either side adds reaches the Task database only through the decorated store, or writes nothing. Recording routes use the store for owner checks. `databaseProof` and `nudge` write nothing (the routing unit's probes: 0 History rows). `runCommand` goes through `executeBackendCommand(store, …)`.
   - `raw-store-guards`' `rawStore` list is unchanged and passes.
   - **Census:** 39 `transaction(` calls. This branch's three are on `recordings.db` (recordings-sqlite.ts prune and ingest, recording-database.ts first initialization). The routing side added none; its one transaction statement is the guard's `BEGIN EXCLUSIVE` on `.todo-routing/<dev>-<ino>-<birth>.sqlite`.
3. **Diagnostics around routing.**
   - Requests are recorded under their OpenAPI route: `POST /local/database-proof`, `POST /local/nudge`, `POST /local/commands`.
   - Entry spans end:
     - `refused` for an invalid proof (400) and an unproved nudge (400);
     - `completed` for a proved nudge (200), the typed not-run reply (200, `not_run`, `local_proof_required`, exit_code 1) and a proof (200);
     - never `failed`.
   - With recording off there are no spans, and every status and body is byte-identical. A span cannot turn the typed reply or a refusal into a defect.
   - The CLI's nudge runs after the command's Diagnostics root closes, so the CLI records it in no span.

## The refusal rule and the strict read scopes

These are unchanged since the base, by content: the same declaration bytes at
675aab82, 2538e94b, 062e242f and the merged head.
- `Authentication.record`, `perform`, `withRead`, `withStreamRead`, `checkRead` and `authenticate`.
- `rejection-history.ts` and `authorized-read.ts` (whole files).
- The only declaration change in `auth.ts` since the base is this branch's `credentialCheck` spans (`refusal-read-scope-content.txt`).

## The CLI

- The flag contract and help carry both sides (above).
- verify-cli-routing's 43 driver and 139 correction actions are identical to the routing worker's run on its merged head once per-run values are normalized (UUIDs, times, paths, ports, credentials). The checks include `write_outcome_unknown` (exit 1, one Task, no retry), `server_command_unsupported` and `server_required`.
- The S4 check (`server_command_not_run`, exit 1, one request, no Task) is equal. The help inventory differs only in `diagnostics`' description (this branch's `--detail`).
- `DatabaseHeldError`: the merged server's second start exits 1 with the same first log line as the routing seat's S2 record; stack frames differ by bundle line.
- `--dry-run`, `--force`, `init` and `reset-passphrase` are covered by verify-cli and verify-cli-routing, both exit 0. The routing CLI sources (`server-connection.ts`, `database-selection.ts`, `direct-write.ts`, `backend-command.ts`, `database-route.ts`) and `apps/server/src/main.ts` are byte-identical to 062e242f.

## Latency against the owner's objective (median 20 ms, p99 300 ms)

Paired and alternating, with load recorded (one-minute load 2.5 to 4.6, 10 cores).

| Measure | Recording on | Recording off |
| --- | --- | --- |
| Server write, commit to arrival on an open stream (verify-sse meter; 5 pairs × 40) | p50 1.16 ms, p99 7.12 ms | p50 1.05 ms, p99 5.48 ms |
| CLI `add`, spawn to arrival, with proof and nudge (100 pairs) | p50 93.9 ms, p99 116.8 ms | p50 92.5 ms, p99 128.6 ms |
| CLI `add`, CLI exit to arrival, with nudge | p50 −1.8 ms: the frame arrives before the CLI exits | p50 −1.8 ms |
| CLI `add`, spawn to arrival, record hidden (no nudge, 250 ms fallback) | p50 204.6 ms, p99 336.9 ms | p50 202.8 ms, p99 322.2 ms |
| Nudge cost: CLI wall time, record present minus hidden, paired | p50 9.5 ms, p99 34.5 ms | p50 7.2 ms, p99 48.7 ms |

The server's write-to-arrival path meets the objective in both states. The CLI
interaction does not meet the 20 ms median: about 85 ms of it is process start
and the direct write, which are the same with the nudge hidden. With the nudge,
the frame arrives before the CLI exits, and p99 stays under 300 ms. Without it,
p99 exceeds 300 ms. Recording changes the nudge's cost by about 2 ms at the
median, within the run's noise (the p99 order is reversed).

The routing recipe's own 1,000-pair benchmark on this head:

| Condition | Median | p99 |
| --- | ---: | ---: |
| Proven server | 130.7 ms | 170.5 ms |
| No proven server | 125.3 ms | 163.8 ms |

## Pins

Pre-renewal enumerating audit at 29927cb0 (`pin-audit.mjs` with its ledger):
- 487 files, 384 occurrences;
- compared: 125 match, 11 drift; historical 248; unknown 0; exit 1;
- 8 pin files.

The 11 drifts:
- verify-dag-formal's seven public rows and its public contract;
- the Discovery `task-client.ts` entry (owed to the Swift step);
- the cache's `server.ts` and `main.ts`.

No verify-occ-atomicity pin drifted: no function in its coverage differs from
what a seat reviewed.

**Renewals** (9774cb25, candidates until a seat accepts them). Hashes were
recomputed by script from P3's git objects; no coverage file was edited by hand.

| Mapping | Procedure and exit |
| --- | --- |
| verify-dag-formal (production pin, public pin, coverage, public coverage) | Review first: every mapped public item is byte-identical to the accepted 63f9b6c8 (`dag-public-mapped-items.txt`). Commit fields move to P3; seven public rows and the public contract (dae320b0) are renewed; production rows are unchanged. The full default (`check.mjs`, under the reference profile) exits 0, "CONFORMANCE CHECKPOINT PASS" (`dag-formal/check-WYIVNF`). Production conformance: 36 controls, each behavior 1 and exact restore 0 (`conformance-5vuhOa`). Public conformance: 53 mutants exit 1 and 53 restores exit 0, on product 29927cb0 (`public-UzBHoi`). Clean recheck: 19,784 distinct states. |
| verify-task-search-cache | Before renewal, `check.mjs` P3 exits 0: none of its seven protected files changed. `check-hygiene.mjs` P3 exits 1 only at the `server.ts` hash, after its clean run, three observer controls, restored run and typecheck. Then `server.ts` and `main.ts` are renewed. `build-baseline.mjs` P3 `--uncached` exits 0. `verify.mjs` P3 exits 0, all nine stages (`perf-cache/verify-Sv6FXZ`). |
| verify-occ-atomicity | No renewal: every pin matches and `check.ts` exits 0 (`fv01/fv01-check-01fMhI`). |
| verify-task-search-formal | No renewal: `check.ts` P3 exits 0. |
| verify-discovery-formal | TypeScript steps only: `prepare-inputs.ts` P3 exits 0 and `check-electron.ts` P3 exits 0. The Swift step and this mapping's renewal are owed in step 2. |

**Post-renewal audit** at 9774cb25:
- 487 files, 408 occurrences;
- compared: 135 match, 1 drift; historical 272; unknown 0; exit 1;
- 8 pin files.

The one drift is the Discovery `task-client.ts` entry, owed to the Swift step.

## Gates on the merged head

All on the merged head (binaries built from 29927cb0's sources), one heavy
step at a time, each only above 40 GiB free. Every exit was captured with `rc=$?`
on the next line. Every compiled Todo binary ran under the reference profile
after its five node controls (`controls-contract.json`: pass).

| Gate | Exit | Notes |
| --- | ---: | --- |
| Root check (`sh scripts/disk-guard.sh`, then `lockf … pnpm check`, TMPDIR outside the repository) | 0, 0 | domain 599, server 191, CLI 87, Electron 168 + 1 skipped |
| verify-sse | 0 | 71 tests, 3,696 compositions. The first attempt exited 1 because my gate script passed the CLI as an environment variable instead of the recipe's second argument; the rerun with the argument exits 0. |
| verify-auth with verify-durable | 0 | |
| verify-server-api | 0 | |
| verify-cli | 0 | |
| verify-cli-routing | 0 | 8 of 8 corrections, the 6-case differential with 24 controls, the 1,000-pair benchmark |
| verify-diagnostics, without Swift | 0 | |
| verify-snapshots | 0 | |
| verify-profiles | 0 | |
| 37 stream scenarios, gated | 0 | 37/37; `result.json` identical to the c9 merged head's run (16 identical, 21 approved ended-authority differences). Before: e69230f9 builds (reused). After: this head. |
| Routing seat's start-up window probes (`probe3.ts s1`, `fd`) | 1, 0 | S1: 7 PASS, 1 FAIL. The failure is X1, as in the seat's own run; see above. `fd`: PASS. |
| Server tests | 0 | 191/191, including `descriptor-window` (6) and `recordings-routing` (8) |

## What step 2 inherits

- `ContractIdentity.swift` is the only Swift-side file touched: the generator wrote the constant `dae320b0…`.
- The generated Swift client is not regenerated: `apps/macos/scripts/generate-api.sh` must run in the Swift slot. Until then it lacks the `/local` and recording routes, and the headless generated-contract compatibility tests are owed.
- verify-discovery-formal's Swift step is owed. Its `task-client.ts` row stays a known drift until that step's renewal.
- verify-macos and the Electron recorder's integration were not run in this step.
- The routing seat's X1 (a rename or link of the live database breaks storage) predates this step.
