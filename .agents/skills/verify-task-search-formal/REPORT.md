# Combined main integration under verification

The following records retain their original source candidates. New combined-source mapping review and proof results are pending and will be recorded separately. No carried result is relabeled as a run on the new merge.

# Current main-based performance integration

Product `ada9f31907322f626c90224573dba283b1d5f254` merges final main
`9de893454cb6e3f5729407e9313c73e56bfd0481` with minimal refresh and R1.
Verifier-only `12124354` leaves all covered production bytes unchanged.

`check-XmY6pO` exits 0 for the complete finite model, real immutable matcher,
strict checks, all nine expected-failure controls and restored run. The full
identity graph has 3,053,160 states and the three-request graph has 1,954,050.
The model remains finite and manually mapped; this is no mechanical refinement.
The main matcher and five real-code controls passed separately in
`matcher-6dcbM8` before only the three merged client hashes were renewed.
The initial `matcher-SntXwq` receipt failed its runner typecheck on unresolved
coverage merge markers; it is retained and is not counted as a clean proof.

Compiled 105 Swift tests plus generated contracts/diagnostics, real Snapshot
restore/reload, 5 tests, Electron full/query F1a/F1b and R1 regressions, unsigned
Xcode and 346 offscreen renders all exit 0. Project and Tag names survive the
correct reset boundaries; padded Tags add no inferred server predicate.
Original synthetic fixture failures are retained in
`docs/evidence/perf-refresh/main-9de/electron-final`; the corrected navigation
fixture uses actual changed selections and passes in `electron-nav-fixed`.

Final-main frozen inputs run against one identical SEC plus reviewed Tag D1
backend. Five alternating pairs per client all exit 0. Every 25 successful query
action run uses 215 to 45 Swift or 225 to 45 Electron data requests. Health, full,
warmup and controlled-failure reads are separate. All successful query reads
complete without failures or cancellation. All tracked Package.resolved files
remain unchanged. No shipping latency claim is made.

Receipts: `docs/evidence/perf-refresh/main-9de`, especially
`frozen-inputs.json` and `paired-summary.json`. The local PERF-refresh report and delivery receipt carry the final same-head
locked check and both review verdicts.
The records below are historical and do not supersede this integration status.

# Historical integrated PERF-refresh proof at 51711cf4

The SEC and R1 merge at `51711cf41e19b9fcd654c19ae24b957e13591940` passes
`bun .agents/skills/verify-task-search-formal/check.ts 51711cf41e19b9fcd654c19ae24b957e13591940`
with exit 0. Evidence is `docs/evidence/task-search-formal/check-s5gvyO`; the
immutable real matcher, its generated properties and production mutation
controls pass at `matcher-mMiugN`. All reviewed source hashes match the merge.

The full safety graph has 3,053,160 distinct states and 29,482,849 generated
successors. The three-request graph has 1,954,050 distinct states and 20,570,013
successors. Conditional liveness and restoration each have 44,922 states and
378,091 successors. Every passing queue is empty. All nine controls fail with
their intended behavioral counterexample and TLC exit 12 or 13, including
early catalog-debt clearing and missing full-scope promotion. The tool pin,
identity/request bounds and absence of state constraints remain unchanged.

The merged clients retain SEC's typed refusal, applied context and hidden Retry,
alongside R1's obligation to publish a full catalog. Refusal leaves that
obligation set; a later affordable full publication clears it. Conditional
convergence still requires a fair available recovery source and a later success.
There is no promise that an unchanged refused query eventually succeeds.

Integrated compiled receipts are under `docs/evidence/perf-refresh/r1/`.
`sec-swift-state-correct` passes 104 state tests and generated contracts;
`sec-swift-snapshots` proves restore, reload and the later write. Their real
server runs include literal refusal/SSE recovery and the catalog-debt races.
`sec-electron-search` passes those search and catalog cases without page errors.
`sec-electron-writes-settled` passes the broader write/Compact/offline drive.
Its original `sec-electron-writes` attempt failed the inherited Retry assertion
because failure injection raced reconnect's full read. The verifier now requires
current Showing after reconnect before arming that one-shot failure; the Retry
assertions and five-second deadline are unchanged. Both receipts are retained.

The integrated offscreen proof has 60 PNGs, and the unsigned xcodebuild exits 0.
Both use production source without launching Todo.app or accessing Keychain.
Final paired input receipts, the same-head locked check and both fresh review
seats are recorded by the unit delivery report. The proof remains a finite
design model plus reviewed mapping and compiled regressions, not a mechanical
TypeScript/Swift refinement theorem. Historical proofs below keep their scopes.

# Historical PERF-refresh R1 proof before SEC integration

The catalog-debt correction passes at product source
`47aa4f10cfff6255f2108bf79a8b0608965f2ab8`. The exact command
`bun .agents/skills/verify-task-search-formal/check.ts 47aa4f10cfff6255f2108bf79a8b0608965f2ab8`
exited 0. Evidence is `docs/evidence/task-search-formal/check-Mq10TH`, with
immutable real-matcher checks at `matcher-WIgKEi`. This proof precedes the
integrated SEC base and must be renewed after that merge. The earlier full run
`check-rMMaXl` passed its model stages and correctly failed the two changed
client hashes before their reviewed renewal. It remains a failed receipt.

`catalogOwed` survives failed and superseded full requests. Every query launch
promotes to full while it is owed, and only a current full publication clears
it. `CatalogOwedUntilPublish` checks preservation at request launch;
`NoOwedQueryPublication` checks the publication boundary. The production mapping
is Electron's `catalogOwedRef` and Swift's `catalogStale`. Existing identity,
generation, bootstrap and snapshot properties retain their original bounds.

| Stage | Distinct states | Generated successors | Queue | Exit |
| --- | --- | --- | --- | --- |
| Full identities, two pending requests | 3,053,160 | 29,482,849 | 0 | 0 |
| Six identities, three pending requests | 1,954,050 | 20,570,013 | 0 | 0 |
| Conditional liveness | 44,922 | 378,091 | 0 | 0 |
| Restored model | 44,922 | 378,091 | 0 | 0 |

The early-clear control fails `CatalogOwedUntilPublish` with TLC exit 12.
Missing query promotion fails `NoOwedQueryPublication` with exit 12. All seven
earlier snapshot, latest, Showing, stale, fallback and liveness controls still
fail with their intended exit 12 or 13. Strict checking, Unicode matcher
properties, real matcher mutations and restoration pass. These are finite
design checks with a manual production mapping, not a source refinement proof.

Compiled baseline regressions fail on stale catalog values. Corrected compiled
Swift and unsigned Electron regressions pass delayed full success/error and a
failed full followed by a query, checking literal Task counts, Project/Tag names,
Profile counts, current rows/spans and complete identities. Receipts are under
`docs/evidence/perf-refresh/r1/`. Swift's `swift-counts/catalog-owed.json` records
17 and 18 successful data reads in the two supersession cases, and 9 for the
query after a failed full. Blank full reads need 8 requests; active-query full
reads need 9. The failed-full fixture injected one transport failure before
HTTP and recorded 8 other successful data reads. Electron records two complete
9-read catalog refreshes per raced write, with its controlled 503s retained.
Steady-state query counts and final review seats require the integrated reproof.

# Historical PERF-refresh proof at 30376a1b

The full/query refresh amendment passes at product source
`30376a1b419dc8bb08b385182aa663f7a73d98c8`. The final command was
`bun .agents/skills/verify-task-search-formal/check.ts 30376a1b419dc8bb08b385182aa663f7a73d98c8`
and exited 0. Its ignored evidence is
`docs/evidence/task-search-formal/check-TBbGlz`, with the immutable matcher run
at `docs/evidence/task-search-formal/matcher-jrQXhY`. The prior proof below is
historical and its state counts do not describe this amendment.

`catalogReady` and the latest pending request's `issuedFull` represent the
full/query distinction. Initial load, reset and SSE request full reads.
Debounce, Apply and Retry request query reads only after a full catalog has
published. Obsolete requests retain no scope because their generation guard
rejects publication. Query success retains the catalog. Full success publishes
catalog and search together under the same complete identity and generation
check. `QueryHasCatalog` checks the bootstrap fallback beside `OneSnapshot`,
`LatestPublication`, `ShowingIsCurrent` and `ExactStale`.

| Stage | Distinct states | Generated successors | Queue | Exit |
| --- | --- | --- | --- | --- |
| Full identities, two pending requests | 1,969,704 | 18,772,705 | 0 | 0 |
| Six identities, three pending requests | 1,280,994 | 13,277,277 | 0 | 0 |
| Conditional liveness | 29,946 | 247,435 | 0 | 0 |
| Restored model | 29,946 | 247,435 | 0 | 0 |

The existing bounds, tool pin and generation-color construction stay as
described below. No symmetry or state constraints remove reachable states.
The broken snapshot, latest, semantic Showing, stale and bootstrap fallback
controls each reach a behavioral counterexample and exit 12. Broken progress
and missing recovery fairness each exit 13 with a liveness counterexample.
Their nonempty queues are expected early counterexample stops. The restored
model exhausts its queue and exits 0. Real matcher generated properties and
production mutation controls also pass on the recorded immutable source.

Convergence assumes settled input, eventual debounce and recovery, and later
successful responses. It does not assert that an unchanged deterministic
`search_too_broad` refusal eventually succeeds. SEC owns that policy and its
client parity. Recheck this mapping and proof after L1 integrates SEC.

Compiled Swift and unsigned Electron drives cover the production publication
boundaries, retained catalog and unfiltered data, delayed full success/error,
complete identities, rows, spans, filter rollback, initial failure/Retry and
SSE recovery. The worker report records exact receipt paths and binary source
SHAs. This remains a bounded design proof with manually reviewed source
mapping, not a TypeScript or Swift refinement theorem. PERF-refresh correctness
and coordinator UI review seats are pending L1's final handoff.

# Final merged TaskSearch proof

TaskSearch semantic review and its single source-hash renewal now name immutable
candidate `f85aef6faf7d93be80feef930554206e09d61be3`. Product source is the reviewed
merged 36f9; root 81c adds only proof changes. The hold was released before this
review. No production/API/dependency/pin change, merge or rebase is made by E.

The actual one-command check exits 0 in
`docs/evidence/task-search-formal/check-4n4nBS`, including both safety graphs,
conditional liveness, every intended model control, restoration, strict runner
checking, current production hash gate and real immutable matcher properties.
The model/tool/bounds are unchanged. Generated successors include duplicates;
none of these counts is a distinct-edge count.

| Stage | Actual exit | Generated | Distinct | Queue |
| --- | ---: | ---: | ---: | ---: |
| safety-full | 0 | 16,355,233 | 1,710,504 | 0 |
| safety-three-requests | 0 | 10,791,549 | 1,026,978 | 0 |
| conditional liveness | 0 | 202,987 | 24,186 | 0 |
| broken snapshot | 12 | 35 | 17 | 13 |
| broken latest | 12 | 159 | 65 | 50 |
| broken latest, semantic Showing invariant | 12 | 159 | 65 | 50 |
| broken stale | 12 | 179 | 77 | 59 |
| broken progress | 13 | 196,579 | 24,186 | 0 |
| missing recovery fairness | 13 | 202,987 | 24,186 | 0 |
| restored | 0 | 202,987 | 24,186 | 0 |

The four invariant controls retain expected nonempty queues because they stop
at their intended counterexamples. The temporal controls find the intended
lassos. Parser/compiler/hash-drift/timeout/interruption is never sensitivity.
Bounds, generation equality abstraction, complete queue requirements and
conditional fairness assumptions remain in SKILL.md and the historical report.
SEC's deterministic refusal maps to Error. Conditional convergence requires a
later affordable successful response and a fair available recovery source.
There is no CPU, heap, output size, arbitrary network or native-event theorem.

Standalone real matcher run `matcher-wrLTPA` exits 0 at f85 before coverage
renewal. The one-command run repeats the same immutable candidate in its linked
matcher receipt. Every generated property passes; all five copied-source
mutants exit1 at the intended behavior assertion, restore exact bytes and now
run the corresponding clean property after EACH mutation. The full restored
corpus and driver/runner strict checks exit0. Captured source is extracted into
regular files with different inodes from live source. Only installed dependency
links are shared. Corpus/seed/bounds remain as recorded in MATCHER-REPORT.md.

CLIENT-MAPPING.md records the final whole-file semantic review: current guards,
debounce, snapshot pairing, rollback, resets, Profile-keyed metadata lifetime,
trim-representable inferred Tag names, applied refusal context, shared error2
line, explicit Show refresh and auth generation invalidation. Domain matcher
bytes match reviewed SEC c143. TaskIdPrefix is the same schema moved to limits;
list response arrays and exit pairs are additive. Synchronous/Effect matcher
paths share the generator; async evaluation occurs after the auth view read.
Server authorization/read-snapshot properties remain separate from TLC.

Root merged full-check, CLI/HTTP discovery and search, Electron discovery/report/
stale401, Swift 110+21 state, unsigned and 60+116 design gates all retain their
actual36f9 exits 0. The corrected Electron TaskSearch drive retains actual81c
exit0, production-input diff0 and fresh scratch. Its original literal failure 1
and two ignored wrapper setup failures 1 remain failures. The actual UI refusal
contains the shared newline `error 2 - validation or usage`; no product defect
or runtime-policy change was needed. Fixed B9 backend binaries retain builtHead
36f9 and their recorded hashes. No mutable cache manifest is used.

This is finite model safety/conditional liveness, generated matcher properties,
manual source mapping and carried real-client regressions, not mechanical
refinement or unbounded correctness. Discovery conformance is tracked separately
against the SAME f85 candidate. Parent-owned AtomicCAS proof closure at 81c is
untouched. Final E source/report freeze, exact-SHA check receipts and independent
seats are reported in the discovery REPORT and final handoff. Native UI,
Keychain/persistence, OS clipboard, focus/glass/VoiceOver and notifications stay
under HOLD. No domain files or visuals are added; no child is launched.

## Historical TaskSearch report

The earlier records below retain their original candidates and outcomes.

# C1 design model proof

The approved response-order model, including SSE recovery, semantic ShowingIsCurrent and text-retaining reset, passes the R1 amendment run within the bounds below. The original SSE model was reviewed at code commit f42fc7f5. Generated
checks against the real unit 1 candidate also pass, with production-code
sensitivity. The reviewed Unit 1 integration recheck at `8272b610` passed.
Production client mapping is complete in CLIENT-MAPPING.md and hash-guarded by
coverage.json at product-source commit 0d5b2198. The final L1 ledger records the
exact tip command, process result and compiled client proofs. This bounded model
and generated matcher check is not a complete native feature proof.

The model's first delivery before Phase 2 is local commit
`1cdb35340b7df59882f979880e622dec8308a444`. Candidate matcher results are recorded
separately in [MATCHER-REPORT.md](MATCHER-REPORT.md).

The original model unit inspected base `605b84aa85e4be4e9386365b97cf64ddef2639c6` on worker branch
`t3/task-search-tests`. All additions belong to `verify-task-search-formal` and
its relative Claude symlink. No product file or domain file is added or changed.

## Reproduce the proof

From the worktree root, run:

```sh
bun .agents/skills/verify-task-search-formal/check.ts
```

The completed model run is under this ignored absolute evidence directory:

```text
/Users/zambamon/.t3/worktrees/todo-cli/t3-cf66f082/docs/evidence/task-search-formal/check-CslMY5
```

Each stage records its command, PID, actual exit, model, config, stdout, stderr,
state counts, and queue length. `result.json` records the overall command result.
The runner also checks its TypeScript and the reviewed production source hashes.

Tool pin is TLA+ tools v1.7.4, TLC 2.19 of 08 August 2024. The jar SHA-256 is
`936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`.
Java uses the bundled `MemFPSet1`, one worker, polynomial 17, seed 1, and 2 GiB.
There is no symmetry reduction or state constraint. TLC's fingerprint collision
estimates remain in each successful log. This is bounded TLC checking, not a
deductive proof at arbitrary sizes or a verification of TypeScript or Swift.

## Safety and liveness outcomes

| Stage | Profiles, views, texts, filters | Concurrent requests | Distinct states | Generated successors | Queue | TLC exit |
| --- | --- | --- | --- | --- | --- | --- |
| Safety, full identities | 2, 2, 3, 2 | 2 | 1,710,504 | 16,355,233 | 0 | 0 |
| Safety, three requests | 1, 1, 3, 2 | 3 | 1,026,978 | 10,791,549 | 0 | 0 |
| Liveness | 1, 1, 2, 2 | 2 | 24,186 | 202,987 | 0 | 0 |
| Restored clean model | 1, 1, 2, 2 | 2 | 24,186 | 202,987 | 0 | 0 |

Generated successors include duplicate transitions and visible stutters. The
table does not claim a count of distinct edges. Both safety graphs exhaust their
queues and check `TypeOK`, `OneSnapshot`, `LatestPublication`, `ShowingIsCurrent`, and `ExactStale`.
The liveness graph separately checks `Convergence` and exhausts its queue.

The initial requested bound was 24 identities with up to three requests. The
split keeps the full identity dimensions in one check and three-response races
in another. Liveness uses two text identities and two filter identities to keep
temporal checking small. Profile and view reset liveness is outside that check.
No claim covers the combined 24-identity, three-request graph.

The request bound limits concurrent pending replies. It does not cap the total
number of issues. One extra generation color protects the applied snapshot from
reuse while its response is still visible. Pending requests also reserve their
colors. Thus the finite graph supports indefinitely repeated requests without
allowing a stale response to acquire a newer generation's token.

`Settle` freezes identity-changing inputs, Apply, Profile and view switches,
and ordinary SSE refreshes. Recovery SSE events remain enabled in Error. All later responses succeed. Weak fairness covers initial launch, debounce, every pending successful response, and the disjunction of manual Retry, current-Profile SSE reconnection, or SSE op while in Error. This recovery assumption was accepted by the coordinator on 2026-11-09. Clients recover automatically on those SSE notices, with no timer-based retry. The counterexample below proves that stable input and response fairness cannot recover Error if none of those recovery events occurs.

## Sensitivity receipts

| Scratch control | Observed failure | TLC exit | Trace |
| --- | --- | --- | --- |
| `BrokenSnapshot` | `OneSnapshot` | 12 | Initial request succeeds. New rows retain the old empty snapshot's spans. |
| `BrokenLatest` | `LatestPublication` | 12 | Issue for text 1, input text 2, then publish text 1's obsolete success during Debouncing. |
| `BrokenLatest`, ghost invariant disabled | `ShowingIsCurrent` | 12 | Issue text 1, input text 2, then an obsolete success enters Showing with text 1. |
| `BrokenStale` | `ExactStale` | 12 | Publish text 1, input text 2, and incorrectly retain `stale = FALSE`. |
| `BrokenProgress` | `Convergence` | 13 | Input text 2, Settle in Debouncing, then stutter forever because debounce never launches. |
| `FairSpecWithoutRetry` | `Convergence` | 13 | Input text 2, issue, fail, Settle in Error, then stutter forever without Retry, SSE reconnection or SSE op. |

The four invariant failures stop early with queues of 13, 50, 50, and 59 states.
Those are expected counterexamples, not clean exhaustive passes. Both temporal
controls exhaust their 24,186-state graphs and produce a stuttering lasso.
No sensitivity receipt relies on parsing, compilation, hashes, or timeouts.
The unchanged model passes after the controls. The runner never edits the
checked-in model or any product source during these checks.

## Production mapping

[CLIENT-MAPPING.md](CLIENT-MAPPING.md) records the implemented functions and
atomicity boundaries. Both clients now invalidate immediately, capture complete
identities and publish strings/spans/identity together under their latest-request
guards. Swift success and error share canPublishSearch; the baseline missing
error guard is fixed and covered by a delayed-error regression. Profile/view
reset retains text. Manual Retry and current-Profile SSE recovery are implemented.

Coordinator R1 adds ShowingIsCurrent independently of publicationOK. The
broken-latest-showing control omits the ghost invariant and fails the semantic
invariant with exit12. R3 retains toolbar text in Reset. The amendment run
check-CslMY5 exits 0, including both safety graphs, liveness, deliberate breaks,
restoration and real matcher checks. Counts above describe that unchanged model.
The final integration run is recorded separately in the ignored L1 ledger.

The finite model has no separate Project/Tag dimension, cached-clear transition,
authentication or Snapshot-reload protocol, editor draft or OS focus state.
Complete production guards and compiled regressions cover the stated client
cases. No source-language refinement theorem or universal Unicode proof is
claimed. See CLIENT-MAPPING.md for the exact abstraction boundaries.

Both unit review seats are complete. L1 independently reviewed the integrated
mapping. Run the final-tip command after committing this mapping; the final
evidence ledger under
`docs/evidence/task-search/final` records its immutable SHA, exit and absolute
paths. Source hashes are renewed only after inspecting the actual functions.

The original worker and later L1 changes use a local no-comments audit under
the run's restricted review count; permitted seat1 reviews include comments.
No extra comments child was launched. Native HOLD and owner-data restrictions
remain in force.

## Coordinator recovery amendment

The coordinator accepted conditional liveness on 2026-11-09, retained manual Retry, and required automatic Error -> Requesting recovery on a current-Profile SSE reconnection or op. `Recovery` is the disjunction of those actions, guarded by Error. Fairness applies to that disjunction. `FairSpecWithoutRetry` is retained as the requested legacy spec name, but removes all recovery fairness. Its no-recovery trace remains a limit. The model adds no retry timer. Revised safety and both liveness specs are rerun after this amendment; the final L1 receipt records their actual exits and counts.

## Other checks and diagnostic attempts

`pnpm install --frozen-lockfile` exited 0 after the run's disk guard exited 0.
The guard reported 86.0 GB free. No dependency manifest or lockfile changed.
`pnpm check` exited 0, captured with `rc=$?` immediately after the command.
Its ignored receipts are `docs/evidence/task-search-formal/pnpm-check-initial.json`
and `pnpm-check-initial.log`. The package checks passed 249 domain tests,
45 CLI tests, 29 server tests, and 32 Electron tests with one existing skip.
The standalone runner typecheck and `git diff --check` also exited 0.

Earlier development runs remain under the same evidence parent. The first two
found TLA+ syntax or heterogeneous-comparison errors. Disk-fingerprint runs
`check-t5H7y2`, `check-dx3TaX`, and the restored stage of `check-gxg4hH` hit TLC's
final division-by-zero reporting exception and exited 255. They are not passes.
The earlier `check-nLqlJX` and `check-YmD4Wb` runs used `MemFPSet`; their quadratic
final fingerprint distance scan was stopped through their recorded Java PIDs.
They exited 143 and remain incomplete. The failed-set census is preserved in
`docs/evidence/task-search-formal/tool-census.json`. Upstream v1.7.4 sources used
to inspect fingerprint reporting are retained beside it. The final runner uses
the same pinned jar's `MemFPSet1`, whose distance check sorts the stored
fingerprints. The model and its acceptance properties were unchanged by that
tool configuration correction.

## SEC budget source renewal (2026-11-09)

The work-budget, yielding, interruption and deterministic-error presentation are
mapped in CLIENT-MAPPING.md. SEC-W1 reviewed the changed functions locally; the
immutable matcher at `0a2eef1c` passed generated properties and all five deliberate
behavioral mutations in `matcher-zwScvg`. The product commit in coverage.json has
identical covered source bytes. The full renewed command records its own fresh
model and matcher receipts. Independent review seats remain pending; this worker
does not launch them. The unchanged model's conditional Error recovery is not a
promise that a persistently over-budget query succeeds.

The renewed command completed with exit 0 at product source `c240677e`:
`docs/evidence/task-search-formal/check-OrFheJ/result.json`. Both safety graphs
exhausted their queues (1,710,504 and 1,026,978 distinct states), and liveness and
the restored model passed. All deliberate design controls produced the expected
behavioral counterexamples (12 or 13). Immutable real-matcher properties and all
five matcher mutations passed at that same product source in `matcher-BddZka`.
TLA+ source remained byte-identical. These local receipts do not replace either
independent review seat.

## V1 applied context renewal (2026-11-09)

V1 product commit `064b2667` adds display text only. It changes no transition,
publication guard, generation or identity. CLIENT-MAPPING.md records that review.
Only the four changed guarded client-file hashes were renewed, after immutable
matcher properties and all five behavioral mutations passed in `matcher-1eyrdt`.
The full command then exited 0 in `check-LDjXLP`, with a fresh matcher sensitivity
pass in `matcher-ogr9wb`. Both safety graphs, conditional liveness, expected
broken controls, restoration and source-hash checks passed. TLA+ is unchanged.
Client literal tests and the compiled drives check both applied-context lines;
the finite model does not evaluate their display text or pixels.
