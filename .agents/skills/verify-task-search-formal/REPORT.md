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
