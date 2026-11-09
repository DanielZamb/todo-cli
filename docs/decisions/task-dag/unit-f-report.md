# Unit F model-ready checkpoint

Status: model checkpoint complete; production conformance and final F approval
pending committed A/B interfaces. Branch: feat/task-dag-f-formal. Reviewed
product/design base: 8745cdd0247fb8cc0ff74f95bff257fd95cfa4d3. Proof run HEAD:
a91dcf8917e242bce6c0f3521a1b2727114d0ef7. The terminal handoff names the final local commit.

## Delivered and run

The one command is `bun .agents/skills/verify-dag-formal/check.mjs`.
Overall exit 0, model checkpoint only. It checks 25 positive finite
scenarios, five safety mutants, six reachability controls, and the final clean
64-initial-status recheck. TLC process times total 34.79 seconds. No state
constraint, symmetry reduction or silent state truncation is used. Every
positive queue finishes at zero. Safety only, with no fairness or liveness claim.
`--full` intentionally exits 2 until production conformance is implemented.

TLA+ fits the transaction ordering question. The model does not run on
TypeScript. Its mapping separates inspected existing transaction code from the
approved Dependency design awaiting implementation. The feature map and
mapping.md name the required later real-code checks. No product modules or
stand-in graph algorithms were added.

Evidence is retained locally at:
`docs/evidence/dag-formal/check-zZ3DR3`.
The directory includes the copied model/configs, verified tool, commands, actual
process exits/signals, stdout/stderr with full counterexamples, progress.json,
provenance.json and result.json. Verification output remains ignored by Git.

Pinned tool: tla2tools 1.7.4, TLC 2.19 of 08 August 2024.
SHA-256: 936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88.
Java 21.0.10 and Bun 1.4.4 were used. Each TLC run has a 120-second deadline,
768 MiB heap, one worker, fingerprint polynomial 0 and seed 26. A timeout,
compiler failure, checksum failure or wrong invariant never counts as sensitivity.

Model SHA-256: 557a67faa071a5da06cd4f0bbfa38950a99cf64dc820d3da5e8d4d01ddb0b74e.
Suite SHA-256: 8dd960c270fc140f63c9277ed8433a1272bf0f0a71c2d53961816b549d8e4199.
coverage.json records reviewed source SHA-256 values and the confirmed base.

## Finite configurations and results

Most configurations start with three visible Tasks, one Profile, Versions 1,
and the precise SeedEdges/SeedStatus defined in DagAcyclic.tla. CLI and server
each have one fixed operation. They can observe before another commit. Once
both stop, one bounded grouped Revert can select either committed operation.
Versions remain in 1 through 4, with at most three committed/rejected attempts.
Each stage can crash and stop permanently. All four statuses are modeled.
The statuses run has all 64 initial status assignments on three Tasks; every
other configuration has one initial state.

The ordinary in-degree bound is two. count-race uses three Tasks and bound one.
degree-two-race uses FOUR Tasks, bound two, seed 1 -> 4 and competing
2 -> 4 / 3 -> 4. Three non-self blockers need four Tasks; a three-Task
in-degree-two race cannot exercise exceeding two. profiles puts Task 3 in a
second Profile. boundary13/boundary14 have 15 Tasks, one active writer, no Revert,
and respectively 12/13 existing blockers of Task 15 before one add. The other
writer starts stopped. Thus literal 13/14 is exhaustively checked in these
single-add MODELS, while concrete warning/refusal behavior at 9/13/14 is pending.

| Config | Exit | Generated | Distinct | Depth | Queue left | Violation |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| statuses | 0 | 32816 | 19784 | 27 | 0 | none |
| degree-two-race | 0 | 533 | 323 | 27 | 0 | none |
| delete-fanin | 0 | 582 | 358 | 29 | 0 | none |
| opposite | 0 | 543 | 332 | 27 | 0 | none |
| transitive | 0 | 392 | 215 | 29 | 0 | none |
| pruned | 0 | 543 | 332 | 27 | 0 | none |
| reopen | 0 | 378 | 203 | 29 | 0 | none |
| reopen-cancelled | 0 | 378 | 203 | 29 | 0 | none |
| complete | 0 | 481 | 288 | 27 | 0 | none |
| remove | 0 | 579 | 356 | 29 | 0 | none |
| witness | 0 | 392 | 215 | 29 | 0 | none |
| delete | 0 | 457 | 269 | 27 | 0 | none |
| delete-dependent | 0 | 525 | 318 | 29 | 0 | none |
| degree | 0 | 457 | 269 | 27 | 0 | none |
| count-race | 0 | 533 | 323 | 27 | 0 | none |
| profiles | 0 | 314 | 164 | 26 | 0 | none |
| noop | 0 | 247 | 116 | 21 | 0 | none |
| malformed | 0 | 107 | 48 | 9 | 0 | none |
| unauthorized | 0 | 107 | 48 | 9 | 0 | none |
| self | 0 | 229 | 105 | 15 | 0 | none |
| boundary13 | 0 | 19 | 13 | 10 | 0 | none |
| boundary14 | 0 | 15 | 11 | 8 | 0 | none |
| noop-add | 0 | 247 | 116 | 21 | 0 | none |
| delete-blocker | 0 | 525 | 318 | 29 | 0 | none |
| cancel-complete | 0 | 502 | 302 | 29 | 0 | none |
| mutant-outside | 12 | 280 | 144 | 19 | 1 | Acyclic |
| mutant-no-lock | 12 | 542 | 205 | 19 | 1 | Acyclic |
| mutant-pruned | 12 | 284 | 146 | 19 | 3 | Acyclic |
| mutant-reopen | 12 | 140 | 61 | 10 | 8 | NoReopenUnderDone |
| mutant-split-delete | 12 | 74 | 38 | 7 | 11 | AtomicGraphHistory |
| reach-stale-noop | 12 | 181 | 79 | 13 | 6 | NeverStaleNoop |
| reach-revert | 12 | 376 | 222 | 21 | 14 | NeverRevertCommit |
| reach-witness-gap | 12 | 286 | 148 | 17 | 12 | NeverWitnessGap |
| reach-grouped-delete | 12 | 157 | 73 | 10 | 10 | NeverGroupedDelete |
| reach-accepted13 | 12 | 18 | 13 | 10 | 0 | NeverAccepted13 |
| reach-refused14 | 12 | 14 | 11 | 8 | 0 | NeverRefused14 |
| clean-recheck | 0 | 32816 | 19784 | 27 | 0 | none |

A nonempty queue for a control is the frontier when its intended counterexample
was found. It is not reported as a completed safe exploration. The six reach-*
controls negate a required reachable condition, with the expected violation
listed above. All ordinary safety invariants remain enabled in these runs.

## Counterexamples in domain terms

1. **Cycle check outside Begin.** Both writers observe an empty graph. CLI
   commits 1 -> 2. Server later acquires the lock but trusts its old graph and
   commits 2 -> 1. Acyclic fails. Valid dependent Versions do not prevent this.
2. **No writer lock.** CLI and server both validate their opposite additions
   before either commits. Each commits its own resolved edge fact into the
   current durable edge set. Both edges survive and Acyclic fails. The mutant
   never replaces durable state with an entire stale graph snapshot.
3. **Status-pruned cycle check.** Tasks are cancelled. CLI commits 1 -> 2.
   Server ignores that terminal edge and accepts 2 -> 1. Acyclic fails even
   though weighted planning would legitimately prune those Tasks.
4. **Omitted reopen guard.** Task 1 is cancelled and blocks done Task 2.
   Reopening Task 1 commits with that done dependent in its pre-state.
   NoReopenUnderDone fails. It checks the recorded transition, not merely the
   latest state after later cancellation could conceal the event.
5. **Split Delete publication.** ApplyEdges exposes Task 1's incident-edge
   removals before its lifecycle History or Versions commit. The durable graph
   differs from resolved replay and AtomicGraphHistory fails immediately.

The model source is unchanged across mutants; only copied configuration
constants differ. Source/copy hashes are checked and a clean statuses run is
last. No real product mutation was attempted at this checkpoint. Real-code
sensitivity is explicitly pending A/B and must restore exact bytes then rerun.

Reachability traces also confirm a stale valid Version succeeds as an edge
no-op, grouped Delete actually commits, grouped Revert actually commits, and a
cycle refusal can be recorded after another writer removes its witness edge.
The stored path remains valid against the captured proposed graph. It does not
substitute the newer durable graph. The 13-add and 14-refusal outcomes are reached.

The delete scenario removes 1 -> 2 and 1 -> 3 while preserving 2 -> 3. It
records one event and once-per-dependent Version changes. delete-fanin removes
two incoming edges of Task 3 while advancing that primary once through the
lifecycle transition. In a single-Task Delete, one surviving dependent cannot
lose two distinct incident edges to that same deleted blocker. The model uses
sets so a primary touched by both lifecycle and edge cleanup advances once.
Delete races cover removing either endpoint while the other writer adds.

## Other checks

`pnpm check` exited 0. Logs and actual exit are in
`docs/evidence/dag-formal/pnpm-check.stdout`, `pnpm-check.stderr` and
`pnpm-check.exit`. Frozen pnpm install exited 0 after disk guard exit 0 with
75.8 GB free. No dependency manifest or lockfile changed.

The existing `bun .agents/skills/verify-occ-atomicity/check.ts` exited 1 at
its inherited mapping gate. This is an incomplete overall check, not a pass.
It completed AtomicCAS (86,631 generated, 37,036 distinct, depth 15, queue zero),
both controls (exit 12, AtomicCAS), 216 production cases, replay comparisons,
seven process kills, the writer race, SQL rollback and typecheck before that
failure. The gate reports store.ts, events.ts and attachments.ts changed from
its old ed4e2423 mapping already at the 8745cdd base. Evidence:
`docs/evidence/fv01/fv01-check-MV0q87`. A owns mapping renewal, function review,
real-source sensitivity and the eventual clean overall exit 0. F did not edit
A's skill or pin.

Local comment audit followed the Phase 0 no-child exception. New executable
sources contain no comments or TypeScript suppressions. git diff --check passed.
The relative .claude/skills/verify-dag-formal link resolves to the owned skill.
Fresh Claude discovery remains pending L1; no extra thread was launched.
No files were added under packages/domain.

## Pending proof and assumptions

A supplied candidate interfaces for dependencyCycle/shortestUpstreamPath,
DependencyChanges, consistent OperationStore.graph/dependencies, and
changes(event, profile). Those signatures are not a committed proof SHA.
B has not supplied committed query algorithms. Consequently real generated
inputs, seed/corpus counts, shortest BFS comparison, valid Kahn order, weighted
scalar equivalence, distinct pruned energy, exact replay from beginning and
checkpoint, and each real-source broken variant remain pending. No substitute
implementation is used to claim them. Ready/Blocked terminal exclusion,
true-only CLI/HTTP filters, inclusive lightest_next, shape orientation, 101-plus
edge loops, missing energy, shared ancestors and 9/13/14 are required there.
Final code mapping and hashes must refresh after A/B and final clients.

SQLite single-writer serialization, rollback and atomic commit are assumptions,
not an engine proof. The model represents full Task content only by status and
visibility; Versions separately represent CAS. Input decoding and authorization
are boundary outcomes, not verified credential/parser code. Revert models
inverse Task status/visibility and edge facts, excluding unrelated Task fields.
Move/Purge are outside this finite model and need concrete FK/replay/redaction
integration checks. Checkpoints are not modeled; production replay checks are
pending. There is no claim of unbounded safety, liveness, SQLite engine safety,
power-loss durability, client runtime, Series/Occurrence inheritance, snapshots,
rendering, native UI or SSE behavior. No real Todo data, signing, Keychain,
installed binary or native application was accessed, and no Python was used.

This checkpoint is ready for L1's model review. It does not authorize final F
approval before actual code mapping, generated properties and real-source
sensitivity after A/B. The worker committed locally only and stops after
notifying L1 and the coordinator.
