# Unit F conformance-ready checkpoint

Status: the finite model, committed algorithm/replay corpus and real-source
sensitivity pass. Final public commands, client mapping and final F acceptance
remain pending. Branch: feat/task-dag-f-formal. Product candidate:
`f140c7b09bcb1db48ce4ccaee797ecfe60019ce4`.
F proof invocation HEAD: `271002712a62b15ba30e379918fcd23c5c23c7f2`. Verification-source hashes are retained
in provenance.json and verification-inputs.json; the terminal notification names
the final local delivery SHA. No product files were changed or added.

## Scope and provenance

One command: `bun .agents/skills/verify-dag-formal/check.mjs`.
Actual exit 0, status conformance-checkpoint-pass. It runs the finite model and
pinned compiled production conformance. It is not whole-feature L2/L3 proof.
Every production source came from immutable Git objects, not B's changing
working tree or this branch's older product source. The materialized input set
contains 121 unchanged domain/AtomicCAS files with Git blob IDs
and SHA-256 hashes. Compiler import manifests reject source resolution outside
the run-owned candidate or installed node_modules. @todo/domain exports resolve
to that candidate. Dependency manifests match this worktree; installed Effect,
rrule-temporal and temporal-polyfill versions match their recorded manifests.
No package manifest or lockfile changed.

The materialized input directory has no Git directory and is not another
checkout/worktree. Candidate AtomicCAS's own git-head receipt names the F branch
because it runs beneath this worktree; candidate-inputs.json and file hashes
bind the actual production source to f140. No checkout switch or merge occurred.

Combined evidence: `docs/evidence/dag-formal/check-tE8Zr7`.
Production evidence: `/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-f-formal/docs/evidence/dag-formal/conformance-11Cw1a`.
The directories preserve commands, actual exits/signals/PIDs, compiler results
and loaded source hashes, model/config copies, counterexamples, corpus inputs,
mutation source copies, restoration receipts and final results. Output is local
and Git-ignored. Inputs and this report are committed.

coverage.json pins reviewed product files/functions to f140. Model SHA-256:
`54254524caf9a30e95bc1e12b01018eafc28ea88c4a211a46228eb137a802c48`.
Production coverage SHA-256:
`224ef8424cdb765435dda79141c3235132cc0399e8331d81b503c8bb9df62e43`.
The baseline model source remains available at a91dcf8917e242bce6c0f3521a1b2727114d0ef7.
Mapping review refined only Revert's expected observation to use the original
resolved after Versions. Production refuses a Revert after another accepted
change advanced its dependent. No invariant was weakened; an extra reachable
stale-Revert refusal and a broken-real-source control establish that difference.

## Generated real-import properties

Seed: 260911. Every algorithm call imports the unchanged candidate module.
Independent expectations use brute-force sets, simple paths, valid permutations
and scalar sorting. No algorithm was hand-copied to satisfy a check.

| Corpus | Actual cases/bounds |
| --- | --- |
| All directed non-self graphs | 4165, nodes 1 through 4 |
| DAGs selected by valid-permutation oracle | 572 |
| Exhaustive status vectors | 140660, all four statuses; fixed weights [1,null,3,4] |
| Exhaustive weight vectors | 709242, weights null/1/2/3/4/5; all open, alternating priorities |
| All-open positive scalar-order cases | 342838, including literal and random variants |
| Seeded larger DAGs | 256, 1 through 40 nodes, shared source/ancestors, in-degree at most 13 |
| BFS start/target pairs | 2304885, including every small directed graph and DAG status vector |
| Observed graph assertions | 30624590 |
| Long loop | 104 Tasks, 103 existing edges, exact 105-id closed loop |
| Independent raw replay | 93 cases, 186 full/checkpoint rebuilds |

Status and weight vectors are separate dimensions, not their full Cartesian
product. Seeded graphs use mixed statuses/missing energy and a second all-open
positive-weight variant. graph-corpus.json retains the exhaustive construction
recipe and exact random inputs. Its SHA-256 is
`a5737dfa6d5f3aa3ce72e230c2ec6d8d54f0a85d51654ea31cabe4ef4dd4f610`.
The final restored full corpus has byte-identical input JSON and passes again.
The driver records failure inputs, property names and seed for reproduction.

The checks establish every blocker's position before its dependent in both Kahn
orders, whole-Profile terminal edges, small-graph deterministic normal order and
all-open positive weighted equivalence to independent scalar sorting. Priority,
due with missing last, created and id ties are checked pairwise and through a
24-Task heap fixture. Energy and unweighted match distinct pruned set traversal;
contains checks every root/id; lightest_next includes Ready roots and orders by
own known energy then whole-Profile topological position. Unknown energy remains
traversable. The literal 1/2/3/4 diamond totals 10.

ShortestUpstreamPath matches brute-force shortest simple paths with sorted ties.
DependencyCycle matches the exact deterministic rotated arrow loop, self-cycle,
all terminal status vectors and the long chain. It uses the real indexGraph
traversal, so terminal-edge pruning cannot hide behind a separate test traversal.
Ready and Blocked exclude done/cancelled. Connected shape tests cover single,
chain, converging/diverging/mixed trees, n-1 edges and component selection.

Actual checkDependencyAddition accepts counts 9 and 13 and refuses count 14
with limit 13, exact count and advice. dependencyAdvice matches the literal G9
text. This is domain acceptance/advice proof. The public many_dependencies
response warning, CLI/HTTP true-only filters and format handling remain pending.

## Raw replay, integration and migration

The independent replay corpus exhausts all DAGs through three nodes, plus 64
seeded DAGs through twelve nodes. It alternates compact Dependency events with
grouped TaskCreated v2 initial edges. Expected SQL rows come from issued edges;
expected Versions are 1 or 1 plus accepted compact incoming edits. Sorted raw
task_dependencies, task_versions and complete Tasks match before replay, after
rebuild from the beginning, and after checkpoint-plus-tail replay. Every case
uses an isolated scratch database and checks foreign_key_check = [].

The unchanged candidate dag-proof.ts assertions and F's additional FK/N1 checks
passed 19 integration cases. They cover grouped Delete,
cycle/Revert refusal, restored Delete cycles, completion/Revert status rules,
Profile deletion, content-preserving edge Revert and stale Revert conflict,
Move, History target routing, shortest terminal-inclusive cycles, bounded versus
full rejection evidence, authenticated initial edges and Series successors,
and Purge of either endpoint. N2 observes actual SQLite DELETE effects before
Purge and requires Purge to add zero removals. Purge checks surviving Versions,
structural replay, rejection-content erasure, checkpoints and saved owner
Snapshots followed by restore. These are concrete tests, outside TLA+.

The unchanged candidate migration executable also exits 0 for legacy version 1
and concurrent migrations from 2 through 5, ending at 7. It checks unchanged
legacy Tasks/rows, complete 0003..0007 schema, one pre-migration Snapshot and its
original schema/version. Projection recreation preserves user_version. The
candidate's original compiled DAG drive exits 0, including two opposite-edge
processes with exits [0,0], exactly one accepted edge, one cycle refusal and
full/checkpoint replay. Detailed receipts are in migration/result.json and
candidate-dag-proof/result.json beneath the production evidence directory.

## Sensitivity of real production source

36 isolated broken-real-source variants compiled successfully,
then each exited 1 at the intended AssertionError. Compiler errors, wrong
properties, source drift and timeouts are rejected. Every source restored exact
bytes in finally. Each restored targeted baseline artifact, built from those
same original bytes, exited 0. Final graph/replay binaries were recompiled from
restored inputs and the complete corpora passed again. B's files, this branch's
product source and other workers' evidence were never mutated.

| Broken source variant | Observed behavioral property | Broken exit | Restored exit |
| --- | --- | ---: | ---: |
| status-pruned-index | topological | 1 | 0 |
| revert-recorded-version | integration-revertPreservesContent | 1 | 0 |
| kahn-degrees | topological | 1 | 0 |
| lightest-key | scalar-lightest | 1 | 0 |
| priority-tie | heap-ties | 1 | 0 |
| due-tie | heap-ties | 1 | 0 |
| created-tie | heap-ties | 1 | 0 |
| id-tie | heap-ties | 1 | 0 |
| distinct-union | energy | 1 | 0 |
| terminal-pruning | energy | 1 | 0 |
| unknown-traversal | energy | 1 | 0 |
| unweighted-mask | energy | 1 | 0 |
| contains-membership | contains | 1 | 0 |
| inclusive-next | lightest-next | 1 | 0 |
| next-own-energy | lightest-next | 1 | 0 |
| bfs-lifo | bfs-path | 1 | 0 |
| bfs-depth-cap | bfs-long | 1 | 0 |
| cycle-arrow | cycle | 1 | 0 |
| cycle-self | cycle | 1 | 0 |
| terminal-ready | readiness | 1 | 0 |
| terminal-blocked | readiness | 1 | 0 |
| tree-count | shape | 1 | 0 |
| tree-orientation | shape | 1 | 0 |
| single-precedence | shape | 1 | 0 |
| chain-precedence | shape | 1 | 0 |
| query-component | query-component | 1 | 0 |
| degree-14 | boundary | 1 | 0 |
| counted-advice | advice | 1 | 0 |
| checkpoint-edges | replay-checkpoint | 1 | 0 |
| beginning-edges | replay-beginning | 1 | 0 |
| dependent-versions | replay-versions | 1 | 0 |
| delete-cleanup | integration-groupedDelete | 1 | 0 |
| move-cleanup | integration-move | 1 | 0 |
| purge-witness-redaction | integration-purge-A | 1 | 0 |
| authenticated-initial | integration-authenticatedInitial | 1 | 0 |
| projection-migration-version | integration-n1 | 1 | 0 |

sensitivity.json records original/mutated source SHA-256 values and exact-byte
restoration for every row. Each build receipt contains actual loaded source
hashes. The broken source itself survives beside the build/assertion evidence.
No compiler/hash failure was counted as sensitivity.

## Finite model and intended model controls

TLC uses pinned tla2tools 1.7.4/TLC 2.19, SHA-256
936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88.
Every run verifies it. Java 21 and Bun 1.4.4 are the observed runtimes. One TLC
worker, fingerprint polynomial 0, seed 26, 768 MiB heap, 120-second deadline per
configuration. No symmetry, fairness or state constraints. Every positive run
has queue 0. A mutant's nonempty queue is its stopped counterexample frontier.

The original 25 safety scenarios remain, followed by clean recheck. Most use
three Tasks, two writers CLI/server, one fixed operation each and at most one
later grouped Revert; Versions 1 through 4; all four statuses. statuses has 64
initial assignments, others one. profiles uses two Profiles. degree-two-race
needs four Tasks to exceed two non-self blockers; the three-Task count-race uses
limit one. boundary13/boundary14 have 15 Tasks, one active single-add writer and
12/13 initial blockers respectively. The table's bound column is Tasks/degree.
These are separate finite scenarios, not all possible operation pairs or an
unbounded proof. Constants, initial graphs/statuses and operation selections are
fully defined in the committed model/configs.

| Config | Bound | Exit | Generated | Distinct | Depth | Queue | Violation |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| statuses | 3/2 | 0 | 32816 | 19784 | 27 | 0 | none |
| degree-two-race | 4/2 | 0 | 533 | 323 | 27 | 0 | none |
| delete-fanin | 3/2 | 0 | 582 | 358 | 29 | 0 | none |
| opposite | 3/2 | 0 | 543 | 332 | 27 | 0 | none |
| transitive | 3/2 | 0 | 392 | 215 | 29 | 0 | none |
| pruned | 3/2 | 0 | 543 | 332 | 27 | 0 | none |
| reopen | 3/2 | 0 | 378 | 203 | 29 | 0 | none |
| reopen-cancelled | 3/2 | 0 | 378 | 203 | 29 | 0 | none |
| complete | 3/2 | 0 | 481 | 288 | 27 | 0 | none |
| remove | 3/2 | 0 | 567 | 348 | 29 | 0 | none |
| witness | 3/2 | 0 | 392 | 215 | 29 | 0 | none |
| delete | 3/2 | 0 | 457 | 269 | 27 | 0 | none |
| delete-dependent | 3/2 | 0 | 525 | 318 | 29 | 0 | none |
| degree | 3/2 | 0 | 457 | 269 | 27 | 0 | none |
| count-race | 3/1 | 0 | 533 | 323 | 27 | 0 | none |
| profiles | 3/2 | 0 | 314 | 164 | 26 | 0 | none |
| noop | 3/2 | 0 | 247 | 116 | 21 | 0 | none |
| malformed | 3/2 | 0 | 107 | 48 | 9 | 0 | none |
| unauthorized | 3/2 | 0 | 107 | 48 | 9 | 0 | none |
| self | 3/2 | 0 | 229 | 105 | 15 | 0 | none |
| boundary13 | 15/13 | 0 | 19 | 13 | 10 | 0 | none |
| boundary14 | 15/13 | 0 | 15 | 11 | 8 | 0 | none |
| noop-add | 3/2 | 0 | 247 | 116 | 21 | 0 | none |
| delete-blocker | 3/2 | 0 | 525 | 318 | 29 | 0 | none |
| cancel-complete | 3/2 | 0 | 502 | 302 | 29 | 0 | none |
| mutant-outside | 3/2 | 12 | 280 | 144 | 19 | 1 | Acyclic |
| mutant-no-lock | 3/2 | 12 | 542 | 205 | 19 | 1 | Acyclic |
| mutant-pruned | 3/2 | 12 | 284 | 146 | 19 | 3 | Acyclic |
| mutant-reopen | 3/2 | 12 | 140 | 61 | 10 | 8 | NoReopenUnderDone |
| mutant-split-delete | 3/2 | 12 | 74 | 38 | 7 | 11 | AtomicGraphHistory |
| reach-stale-noop | 3/2 | 12 | 181 | 79 | 13 | 6 | NeverStaleNoop |
| reach-revert | 3/2 | 12 | 376 | 222 | 21 | 14 | NeverRevertCommit |
| reach-witness-gap | 3/2 | 12 | 286 | 148 | 17 | 12 | NeverWitnessGap |
| reach-grouped-delete | 3/2 | 12 | 157 | 73 | 10 | 10 | NeverGroupedDelete |
| reach-accepted13 | 15/13 | 12 | 18 | 13 | 10 | 0 | NeverAccepted13 |
| reach-refused14 | 15/13 | 12 | 14 | 11 | 8 | 0 | NeverRefused14 |
| reach-stale-revert | 3/2 | 12 | 484 | 301 | 23 | 17 | NeverStaleRevertRefusal |
| clean-recheck | 3/2 | 0 | 32816 | 19784 | 27 | 0 | none |

Positive configurations generated 74705
states across separate runs, including the repeated clean configuration. Their
distinct counts must not be treated as a union of different state spaces.
The five original mutants fail their intended property: graph check outside
Begin, no writer lock and status pruning fail Acyclic; omitted reopen guard
fails NoReopenUnderDone; split Delete publication fails AtomicGraphHistory.
The no-lock model applies each edge fact to durable state, not an entire stale
private graph. Seven reachable-condition traces include the captured-witness
gap and recorded-Version Revert refusal. Witnesses refer to captured validation
state rather than a later graph after rollback.

## Other checks and explicit gaps

Candidate AtomicCAS's unchanged one command exited 0.
Its model has 86,631 generated / 37,036 distinct / depth 15 / queue 0; both
controls exit 12 at AtomicCAS; 216 concrete cases, 432 replay comparisons,
seven process kills and the competing-writer/rollback checks pass. Evidence:
`/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-f-formal/docs/evidence/dag-formal/conformance-11Cw1a/candidate/docs/evidence/fv01/fv01-check-QQRSDd`. B owns its maintenance and prior sensitivity. F did not edit
that skill or renew its pins. It remains single-Task/no-edge proof.

`pnpm check` on the F worktree exited 0.
Logs: docs/evidence/dag-formal/pnpm-check-conformance.stdout and .stderr.
That command exercises the F branch's existing product tree; it is not a claim
of rerunning the full f140 repository check. Candidate compilation, strict F
and production-import TypeScript checks, generated behavior, migration/DAG drives
and AtomicCAS are the directly executed f140 proof here. L1/B separately report
candidate pnpm check 0. No whole-feature L2/L3 or client completion is inferred.

No new product bug was found in these bounds. Final B public commands must
still supply true-only CLI/HTTP filters, actual warnings/formats/schema/error
responses, no-op/malformed/auth boundaries, confirmation/fingerprints and other
public surfaces. Final source mapping and sensitivity must refresh against an
explicit later B/client commit. Fresh Claude discovery remains pending L1;
the relative .claude symlink resolves, and no child was launched to test it.

Local no-comments audit found no added comments, casts or TypeScript
suppressions in owned executable inputs. git diff --check passes. Disk guard
reported 64.5 GB free during this resume. No dependency install or manifest
change, real Todo data, native apps, signing, Keychain, installed binaries,
Python, push, rebase, merge, PR or checkout/worktree setup occurred. All stores
and owned child processes completed/closed; only owned scratch data was removed.

SQLite single-writer serialization, atomic commit and process recovery remain
assumptions. The model abstracts Task content except status/visibility and does
not model Move, Purge, creation, auth, checkpoints or filesystem transactions.
Concrete tests cover the stated finite cases only. There is no unbounded,
liveness, SQLite-engine, power-loss, renderer or client-runtime claim. This
checkpoint stops after required notifications and waits for final integration.
