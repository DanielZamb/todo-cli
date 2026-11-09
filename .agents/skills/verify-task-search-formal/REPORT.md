# C1 design model proof

The approved response-order model is proven within the bounds below. Generated
checks against the real unit 1 candidate also pass, with production-code
sensitivity. Integration recheck and final client mapping are PENDING. This is
not a complete Task search feature proof.

The model's first delivery before Phase 2 is local commit
`1cdb35340b7df59882f979880e622dec8308a444`. Candidate matcher results are recorded
separately in [MATCHER-REPORT.md](MATCHER-REPORT.md).

The inspected base is `605b84aa85e4be4e9386365b97cf64ddef2639c6` on worker branch
`t3/task-search-tests`. All additions belong to `verify-task-search-formal` and
its relative Claude symlink. No product file or domain file is added or changed.

## Reproduce the proof

From the worktree root, run:

```sh
bun .agents/skills/verify-task-search-formal/check.ts
```

The completed model run is under this ignored absolute evidence directory:

```text
/Users/zambamon/.t3/worktrees/todo-cli/t3-9a98d7a3/docs/evidence/task-search-formal/check-CEam2h
```

Each stage records its command, PID, actual exit, model, config, stdout, stderr,
state counts, and queue length. `result.json` records the overall command result.
The runner also checks its TypeScript and the baseline client source hashes.

Tool pin is TLA+ tools v1.7.4, TLC 2.19 of 08 August 2024. The jar SHA-256 is
`936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`.
Java uses the bundled `MemFPSet1`, one worker, polynomial 17, seed 1, and 2 GiB.
There is no symmetry reduction or state constraint. TLC's fingerprint collision
estimates remain in each successful log. This is bounded TLC checking, not a
deductive proof at arbitrary sizes or a verification of TypeScript or Swift.

## Safety and liveness outcomes

| Stage | Profiles, views, texts, filters | Concurrent requests | Distinct states | Generated successors | Queue | TLC exit |
| --- | --- | --- | --- | --- | --- | --- |
| Safety, full identities | 2, 2, 3, 2 | 2 | 1,710,504 | 16,932,457 | 0 | 0 |
| Safety, three requests | 1, 1, 3, 2 | 3 | 1,026,978 | 10,137,561 | 0 | 0 |
| Liveness | 1, 1, 2, 2 | 2 | 24,186 | 188,056 | 0 | 0 |
| Restored clean model | 1, 1, 2, 2 | 2 | 24,186 | 188,056 | 0 | 0 |

Generated successors include duplicate transitions and visible stutters. The
table does not claim a count of distinct edges. Both safety graphs exhaust their
queues and check `TypeOK`, `OneSnapshot`, `LatestPublication`, and `ExactStale`.
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
and SSE refreshes. All later responses succeed. Weak fairness covers initial
launch, debounce, every pending successful response, and Retry. Retry fairness
is a user recovery assumption. The model does not implement automatic retry.
The additional counterexample below proves that stable input and response
fairness alone cannot recover an unretried Error.

## Sensitivity receipts

| Scratch control | Observed failure | TLC exit | Trace |
| --- | --- | --- | --- |
| `BrokenSnapshot` | `OneSnapshot` | 12 | Initial request succeeds. New rows retain the old empty snapshot's spans. |
| `BrokenLatest` | `LatestPublication` | 12 | Issue for text 1, input text 2, then publish text 1's obsolete success during Debouncing. |
| `BrokenStale` | `ExactStale` | 12 | Publish text 1, input text 2, and incorrectly retain `stale = FALSE`. |
| `BrokenProgress` | `Convergence` | 13 | Input text 2, Settle in Debouncing, then stutter forever because debounce never launches. |
| `FairSpecWithoutRetry` | `Convergence` | 13 | Input text 2, issue, fail, Settle in Error, then stutter forever without Retry. |

The three invariant failures stop early with queues of 13, 50, and 59 states.
Those are expected counterexamples, not clean exhaustive passes. Both temporal
controls exhaust their 24,186-state graphs and produce a stuttering lasso.
No sensitivity receipt relies on parsing, compilation, hashes, or timeouts.
The unchanged model passes after the controls. The runner never edits the
checked-in model or any product source during these checks.

## Code mapping and pending work

The baseline mapping is recorded in [SKILL.md](SKILL.md) and
[coverage.json](coverage.json). Electron `refresh` checks `activeQuery` and
`refreshGeneration` before handling either success or error. Swift
`refresh(generation:)` checks generation, refresh generation, Profile, view,
requested filters, and cancellation on success. Its error branch omits filter
equality. Existing dialog rollback and Profile and view reset paths were read.
The new complete identity, immediate input invalidation, atomic rows and spans,
and search debounce remain approved design transitions at this base.

The model permits clearing or keeping the new toolbar text during reset.
It does not silently choose behavior for a field that does not exist yet.
The final client review must constrain that choice to the approved actual code.
Swift's baseline view reset retains the Task array while clearing planning and
filters. The model's empty selection snapshot represents the approved visible
reset, not a claim that those baseline assignments already implement C1.

The following work requires the implementation commits arranged by L1:

- Repeat the completed matcher checks at the approved integration tip. The
  current checks capture candidate `be876581ea9d4c024fab3b0bc2c8358051c6d2b4`,
  which awaits review. No fake matcher or invented export is present.
- Final mapping of both clients' request, refresh, debounce, error, rollback,
  and reset functions. Delayed-response tests must drive production state
  through the existing compiled scratch verification recipes.
- L1's permitted correctness review and the coordinator's review. No child
  was launched by this worker. The local no-comments audit found no comments
  or lint/type suppressions in the added runner or model. Independent comment
  review remains part of L1's permitted review.

No native app, signing, Keychain, installed binary, real Todo database, owner
Task, branch switch, merge, rebase, push, or PR is used in this unit.

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
