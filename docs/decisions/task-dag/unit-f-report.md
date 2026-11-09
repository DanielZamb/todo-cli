# Unit F public continuation under G11 hold

This is a partial implementation checkpoint. The unaffected public/replay subset
passes at immutable B product source `e7170510a376b51eaf3525bb9933cb0dd588b233`.
The default public command still fails the required malformed CLI usage property.
G11 graph-response and client conformance are paused pending an explicit corrected
B SHA. No final B, F, client or whole-feature approval is claimed.

Branch: feat/task-dag-f-formal. F source/proof commit:
`deec35cc5ef1a45df74d1ca98a06e8f8d43d09ed`. B delivery:
`8ea84c32e18634ac48767b5a6035502bbd78c079`.
The terminal notifications and ignored delivery-provenance.json name the full
local F delivery SHA after this report is committed. No product file or domain
module was added or edited. The existing relative Claude skill link is unchanged.

## Commands, exits and retained receipts

| Command | Actual exit | Scope and evidence |
| --- | --- | --- |
| bun .agents/skills/verify-dag-formal/public-check.mjs | 1 | Required Version-0 usage assertion fails at e717; /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-f-formal/docs/evidence/dag-formal/public-0lx9mw |
| bun .agents/skills/verify-dag-formal/public-check.mjs unaffected | 0 | diagnostic-pass only; /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-f-formal/docs/evidence/dag-formal/public-krrGtO |
| bun .agents/skills/verify-dag-formal/check.mjs --model-only | 0 | finite model, five controls, seven reachability receipts; /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-f-formal/docs/evidence/dag-formal/check-n6XlTn |
| pnpm check | 0 | F worktree only; /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-f-formal/docs/evidence/dag-formal/pnpm-check-public.stdout and .stderr |
| git diff --check | 0 | owned source/document edits |

The final public diagnostic baseline and clean recheck each drove
120 CLI/HTTP actions, plus direct HTTP positive-list reads,
TTY interactions and literal SQLite inspections. Strict F-driver and reachable
candidate-domain TypeScript checks exited 0. Real CLI and server source compiled
successfully. The final restored CLI, server and public driver were compiled
again before the clean public recheck. Independent replay exited 0 for 93 cases
and 186 full/checkpoint rebuilds. Nineteen concrete integration checks exited 0.
Every driver has an actual completed exit in commands.json; no timeout occurred.

This does not claim a full e717 repository pnpm check. The F command exercises
this branch's existing product tree. B/L1 own the separately reported final
candidate repository check and AtomicCAS maintenance. F did not change or renew
verify-occ-atomicity or verify-dag. AtomicCAS remains a separate one-Task/no-edge
proof, not the Task dependency graph proof.

## Immutable inputs and actual coverage

The public runner materialized 163 unchanged committed files from Git objects,
without another checkout or worktree, and checked six dependency manifests against
the installed tree. All production package dependency versions were checked.
Bun 1.4.4 is enforced. CLI/server imports resolve to these exact candidate domain
and API modules; source outside the candidate or installed node_modules is refused.
Changed source produces a distinct cached binary under this worktree's .scratch/bin.
Binary hashes, compiler import paths/hashes, Git blob ids, installed versions and
all F verification-input hashes survive in the receipt. No moving B tree was used.

public-coverage.json maps 22 files and their actual covered functions at e717.
Its recorded SHA-256 is
`681812db3fc424733d070a6ca2e2034146243cd09de78deb10ac0a346adf9270`.
The verification-input receipt SHA-256 is
`f5632e06cc34e01e111142473081bdfe406a0567480e319e985b95a50bee958f`.
The run checked that all four core files graph-model.ts, graph-order.ts,
graph-energy.ts and dependency-rules.ts are byte-identical to the retained f140
proof. This does not infer unchanged graph-query or Mermaid response code.
The older exhaustive algorithm corpus and its 36 controls remain tied to the
historical f140 receipt below; they were not relabeled as a new graph-response proof.

Concrete public assertions cover true-only CLI/HTTP filters and false recovery,
positive Ready/Blocked sets and terminal exclusion, topo/lightest ordering of the
whole Profile before open membership, valid stale edge no-ops without History,
malformed HTTP and authorization before no-op, read-only Token refusal, real
stale conflicts, exact G9 warnings at 9..13 and refusal/count 14 through both CLI
and HTTP, redundant paths, envelopes/schema discovery and command-aware formats.
They also cover per-item batch dry-run and SQL rollback of History/edges/Versions,
Delete confirmation and a fingerprint mismatch after Dependencies change to [],
forward external ids, successful adoption and failed-adoption isolation, and the
canonical HTTP import details shape with current_version plus DependencyError.

The full CLI and HTTP refused-completion responses each preserve the same
40,000-character blocker description. Their durable History is separately bounded:
witness null, truncated true, total greater than 40,000 and serialized event below
32,768 bytes. Purge redacts both rejected rows to TaskHistoryRedacted. Fresh full
and checkpoint rebuilds reproduce complete Tasks, sorted task_dependencies and
surviving Versions. These are concrete paths, not properties modeled by DagAcyclic.
No captured refusal is reconstructed from a later durable graph after rollback.

The unchanged production TTY drive proves n, EOF and empty input retain state,
y accepts, and a dependency change during confirmation refuses the old preview.
The initial daily Snapshot must finish within the same 60-second startup deadline
before no-write measurements begin. An early calibration caught a transient
Snapshot .tmp changing during startup; the driver now waits for that setup work.
No failed operation or changed assertion is retried to manufacture a pass.

## Real-source sensitivity

All 31 controls compile successfully, then exit 1 at the intended named behavioral
AssertionError. Every mutated source is restored byte-for-byte in finally and
rerun clean with exit 0. Compiler/hash failures, SchemaError-only failures, timeouts
and unrelated properties are rejected. The final full clean compilation and rerun
also pass. Mutations affect only F-owned isolated committed-input copies.

| Broken real source | Intended property | Broken exit | Restored exit |
| --- | --- | --- | --- |
| cli-false-guard | public-false-cli | 1 | 0 |
| http-false-recovery | public-false-http | 1 | 0 |
| terminal-ready-blocked | public-terminal-filters | 1 | 0 |
| filter-before-order | public-whole-profile-order | 1 | 0 |
| stale-valid-noop | public-stale-noop | 1 | 0 |
| noop-history | public-stale-noop | 1 | 0 |
| malformed-noop-version | public-malformed-http | 1 | 0 |
| readonly-noop-write | public-read-token-noop | 1 | 0 |
| ninth-warning | public-counted-warning | 1 | 0 |
| fourteenth-add | public-count-refusal | 1 | 0 |
| redundant-warning | public-redundant-path | 1 | 0 |
| batch-dry-run-real-store | public-batch-dry-run | 1 | 0 |
| batch-split-history | public-batch-rollback | 1 | 0 |
| delete-without-confirmation | public-delete-confirmation | 1 | 0 |
| empty-fingerprint-bypass | public-empty-fingerprint | 1 | 0 |
| preallocated-import-map | public-import-successful-map | 1 | 0 |
| import-encoding-witness | public-import-encoding | 1 | 0 |
| full-response-witness | public-full-witness | 1 | 0 |
| unbounded-history-witness | public-bounded-history | 1 | 0 |
| purge-keeps-refusal | public-purge-redaction | 1 | 0 |
| mermaid-non-graph-format | public-format-boundary | 1 | 0 |
| tty-default-yes | public-tty-confirmation | 1 | 0 |
| revert-recorded-version | integration-revertPreservesContent | 1 | 0 |
| checkpoint-edges | replay-checkpoint | 1 | 0 |
| beginning-edges | replay-beginning | 1 | 0 |
| dependent-versions | replay-versions | 1 | 0 |
| delete-cleanup | integration-groupedDelete | 1 | 0 |
| move-cleanup | integration-move | 1 | 0 |
| purge-witness-redaction | integration-purge-A | 1 | 0 |
| authenticated-initial | integration-authenticatedInitial | 1 | 0 |
| projection-migration-version | integration-n1 | 1 | 0 |

The split batch publication control commits History before applying its edge.
The injected SQL abort leaves a committed History row with no edge. The literal
expected committed-row set is [], so the safety assertion catches the stranded
row. The no-op History control returns unchanged but writes rejected History;
whole-state equality catches that extra row. Removing write-scope protection lets
a read-only Token receive an existing-edge no-op instead of 403. The preallocated
import-map control creates a dependent after adoption failed; the actual successful
mapping assertion catches it. Schema encoding that omits nested dependency_error
loses the typed HTTP witness and fails the preserved-payload assertion.

Calibration failures were retained and not credited: the first dropped-witness
control initially failed only a schema decoder, and an early clean import rerun
observed startup Snapshot work. The final controls above use explicit literal
behavior assertions and a completed setup boundary. Exact broken-source bytes,
restoration receipts, result.json, sensitivity.json, compiler receipts and
checkpoint-summary.json are in the evidence directory.

## Preserved finite model and bounds

DagAcyclic and its configs are unchanged. The committed-source rerun passes
25 positive configurations plus the clean status recheck. Every positive queue
is empty. All five intended mutants exit 12 at their intended invariant and all
seven reachability controls produce the required invariant-violation witness.
The clean status run has 64 initial states, 32,816 generated, 19,784 distinct,
depth 27 and queue 0. The complete per-config counts/depths/queues and traces are
in /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-f-formal/docs/evidence/dag-formal/check-n6XlTn/result.json and the retained historical table below.

Most configurations use three Tasks, one Profile, two writers CLI/server,
four statuses, Versions 1..4, one operation each and at most one grouped Revert.
The two-Profile scenario checks isolation. The degree-two race uses four Tasks;
it is not a literal degree-13 proof. Separate 15-Task, single-add configurations
exhaustively check 13 acceptance and 14 refusal. The five mutants still test
outside-transaction graph validation, omitted writer lock, status-pruned cycles,
omitted reopen guard and split Delete publication. The no-lock mutant applies
edge facts to durable state rather than replacing a stale private snapshot.
Rejected History can be lost before its separate commit. Refusal evidence stays
captured from validation and is never replaced with a later durable graph.

TLC is pinned to tla2tools 1.7.4, SHA-256
936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88.
Each configuration has a 120-second limit, 768 MiB heap, one worker, fingerprint
polynomial 0 and seed 26, with no symmetry or state constraints. Public drivers
have a 180-second deadline, individual CLI calls 20 seconds, TTY asks 10 seconds
and server startup 60 seconds. Independent replay uses seed 260911, all DAGs
through three nodes plus 64 seeded DAGs through twelve nodes. The public corpus
is literal synthetic data, not a generated random sample.

## Required next candidate and gaps

The preserved failing input is an existing edge with --expected-version 0.
Expected CLI result: exit 2/invalid_args. Actual e717 result: exit 1/runtime_error
with SchemaError at from_version. HTTP correctly returns 400 and may record a
rejected validation row without projection change. L1 deduplicated the CLI
finding into seat 1's P2 for B's combined correction round. Keep the assertion
and rerun it against the next explicit committed SHA. No product fix was made here.

G11 at ca142014 supersedes per-node closures and response lightest_next ordering.
root-response-fixture.mjs is explicitly unexecuted: it specifies a 1,000-Task
chain, root index 500, exactly eight node keys, 500 ancestors, 499 descendants
and a separate unequal-energy fork whose root sets follow whole-Profile topo.
Actual before/after serialized response bytes, amended root-only conformance,
typed Mermaid identity/readGraph, CLI Markdown, final schemas/OpenAPI/Swift,
both client decoders/runtime mapping, independent review seats and fresh Claude
skill discovery remain pending. The unknown-energy lightest key is unchanged.
The fixture is not claimed as a proof. Final F approval is still held.

All 46 recorded public servers in the final diagnostic run completed cleanup;
their cleanup receipts record exit and owned scratch removal. No other process
was stopped. Disk guard exited 0 at 29.9 GB free before the source commit.
Local no-comments audit found no added code comments, casts or TS suppressions;
no child agent was launched under the explicit no-children instruction. No
dependency was added or upgraded, and no product module was edited or added.
No real Todo data, native apps, signing, Keychain, installed binaries or Python
were used. No push, rebase, merge, PR or checkout/worktree setup occurred.

SQLite single-writer serialization and atomic commit remain assumptions. These
are finite safety/generated/concrete checks, with no unbounded, liveness,
SQLite-engine, power-loss, renderer or client-runtime proof.

---

# Historical f140 algorithm and model checkpoint

The following earlier receipt is preserved at its original candidate and F
proof/delivery commits. The public continuation above supersedes its pending
public status only for the explicit unaffected diagnostic subset.

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


## Housekeeping-only continuation, 2026-11-09

Applied the coordinator's disk order in the existing feat/task-dag-f-formal
worktree, starting at ed0da09b9b20395b44d897cdd59390031107f1f7. This continuation
ran no compiler, proof command, server or client. Product/model/driver behavior,
candidate pins and previous proof claims are unchanged. Corrected-candidate
conformance still waits for L1's explicit later task. The disk guard is required
before every future compile under the new order; no compile was needed here.

Cleanup plan and reference/in-use audit:
`/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-f-formal/docs/evidence/dag-formal/cleanup-2026-11-09-Bs6ybF/plan.json`.
Completed cleanup receipt:
`/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-f-formal/docs/evidence/dag-formal/cleanup-2026-11-09-Bs6ybF/receipt.json`.

Disk guard exits were 0 before the inventory, immediately before unlinking and
after cleanup. Observed available capacity was 26.69656883 GB before and
27.05827840 GB after, using decimal GB from df's available KiB.
The observed increase was 0.36170957 GB. Unlinked 40 regular binary files,
3626846672 logical bytes, whose pre-unlink stat blocks reported
3626942464 bytes. Logical file size and observed APFS free capacity
are separate measurements; shared blocks and concurrent activity prevent equating
them. No DISK STOP occurred.

Kept the e7170510a376b51eaf3525bb9933cb0dd588b233 CLI/server pair with source hash
`1aa1db7f8ede6a9401d4f9eaf5e52823ed8ec52a3275cd02b71e71040c95713b`.
Both remain in this worktree's .scratch/bin. The protected corrected B prefix
3cceb41e was checked in the owned cache inventory; no such binary was present
there. No other worktree was traversed, modified or cleaned.

Each removed binary had F-created provenance, the expected SHA-256, matching
inode/device/owner/size, a completed isolated-mutant command reference and no
baseline, clean or restored-command reference. Its source hash differed from
the retained current hash. Both ps and lsof were checked before unlinking; no
selected binary was in use. Every adjacent provenance manifest was retained.
The receipt preserves the exact paths, hashes, byte counts and referring command
receipts, so those historical command paths now identify deliberately pruned,
rebuildable cache payloads. Their original manifests and proof results remain.

Preserved all 42 cache provenance manifests and all 51 existing evidence
directories in full. The audit checked current tracked text, historical committed
versions of this report and local receipt references without following symlinks.
Every cited directory was kept. Other evidence directories were protected for
historical manifests or unproven references; none qualified for removal in this
housekeeping pass. No evidence file, historical proof manifest, cited report,
current proof run or preserved malformed-Version witness was deleted.

Removed paths, all relative to this worktree:

- `.scratch/bin/dag-f-todo-09c9b284a90e767cc66a17e3aba212e8bf083ec3a98af7465f81eafe3018567b` (90679010 bytes)
- `.scratch/bin/dag-f-todo-0a63cee08fa60695deb76caf152b6c597ab67c692c071b664e0015fa7fcfe2e6` (90679010 bytes)
- `.scratch/bin/dag-f-todo-0afdde407f79765a53ae663297335843a7b6c52543696d81050f23796a2e7505` (90679010 bytes)
- `.scratch/bin/dag-f-todo-1375c01ad4f0edf9e5509c006f2f98c48bc9b6e88b466afb8bdc1b965a99aed5` (90679010 bytes)
- `.scratch/bin/dag-f-todo-1b7c6aaa65045e1b7d273fdc16a8b3c698ad1ee6378238dc8eb46670f7727b60` (90679010 bytes)
- `.scratch/bin/dag-f-todo-1f8ae3dbec7dbdc7fde758cf1495217568900b9e3802bee685922869dd31c93f` (90679010 bytes)
- `.scratch/bin/dag-f-todo-23640bc5cb708eac80099d50693a71398b2a32487c09da08f4422f9dda361cc2` (90679010 bytes)
- `.scratch/bin/dag-f-todo-272fec394fce1724eff33702460007d86d19f2869079deae76097187f73c5c35` (90679010 bytes)
- `.scratch/bin/dag-f-todo-297116f154f43d86d1e25476a097326a7dd1b7a49f0370db18cfb40536e13808` (90679010 bytes)
- `.scratch/bin/dag-f-todo-31453fcf879621245434f57217cb03006511eedf0a411e789d96344bc6223af1` (90679010 bytes)
- `.scratch/bin/dag-f-todo-4854877b92ffea0c484aadc3dd10f993bcdafb0b5971c1e55c629c2244cc3f95` (90679010 bytes)
- `.scratch/bin/dag-f-todo-4991640c07ef109dc0886cf0973d6d564c569a46f5942561593fa5967b34325f` (90679010 bytes)
- `.scratch/bin/dag-f-todo-6884fb896237f81b7fb544f72ff929576f49da4a4bda4cbcd2d2d143aa705878` (90679010 bytes)
- `.scratch/bin/dag-f-todo-998b84c5a2a2c55144f4f66c7751f77a3d038c1675f61db11b095a51aaba9317` (90679010 bytes)
- `.scratch/bin/dag-f-todo-a00ab36ed861c98addd97094d1b8c1e05c8b383562c413c774fe08d6ea25e54c` (90679010 bytes)
- `.scratch/bin/dag-f-todo-b439c723b19a17232f9516afebb3e950226061cfc6c67d1acc0be13e9a73f361` (90679010 bytes)
- `.scratch/bin/dag-f-todo-b643479ae21e4bc31a5a524bc2a5344f2e8d631ec01917cdadbff1f6f4dbbf89` (90679010 bytes)
- `.scratch/bin/dag-f-todo-b7654d2d6597e6a87bc32590fedf748029b2664b1e6d4ab96aa90c117976d5dd` (90679010 bytes)
- `.scratch/bin/dag-f-todo-cc34669ee94c7d8b920e9892c752f68cdc5fa197f07f592e83dcd774919816f7` (90679010 bytes)
- `.scratch/bin/dag-f-todo-ed669e6fc8883df24316f96b58fc2f61d0633659fe3bc61e1d529c6851eaa302` (90679010 bytes)
- `.scratch/bin/dag-f-todo-fd711be40aa6dcb38ef30f8a78cab2cace6cf2607544f8155d652311457cee02` (90679010 bytes)
- `.scratch/bin/dag-f-todo-server-0a63cee08fa60695deb76caf152b6c597ab67c692c071b664e0015fa7fcfe2e6` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-0afdde407f79765a53ae663297335843a7b6c52543696d81050f23796a2e7505` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-1375c01ad4f0edf9e5509c006f2f98c48bc9b6e88b466afb8bdc1b965a99aed5` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-1b7c6aaa65045e1b7d273fdc16a8b3c698ad1ee6378238dc8eb46670f7727b60` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-1f8ae3dbec7dbdc7fde758cf1495217568900b9e3802bee685922869dd31c93f` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-23640bc5cb708eac80099d50693a71398b2a32487c09da08f4422f9dda361cc2` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-272fec394fce1724eff33702460007d86d19f2869079deae76097187f73c5c35` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-297116f154f43d86d1e25476a097326a7dd1b7a49f0370db18cfb40536e13808` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-31453fcf879621245434f57217cb03006511eedf0a411e789d96344bc6223af1` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-4854877b92ffea0c484aadc3dd10f993bcdafb0b5971c1e55c629c2244cc3f95` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-4991640c07ef109dc0886cf0973d6d564c569a46f5942561593fa5967b34325f` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-6884fb896237f81b7fb544f72ff929576f49da4a4bda4cbcd2d2d143aa705878` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-a00ab36ed861c98addd97094d1b8c1e05c8b383562c413c774fe08d6ea25e54c` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-b439c723b19a17232f9516afebb3e950226061cfc6c67d1acc0be13e9a73f361` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-b643479ae21e4bc31a5a524bc2a5344f2e8d631ec01917cdadbff1f6f4dbbf89` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-b7654d2d6597e6a87bc32590fedf748029b2664b1e6d4ab96aa90c117976d5dd` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-cc34669ee94c7d8b920e9892c752f68cdc5fa197f07f592e83dcd774919816f7` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-f0228c0d6cbd6297514cb425f52282d99ade99f48723650d240574af70129599` (90662498 bytes)
- `.scratch/bin/dag-f-todo-server-fd711be40aa6dcb38ef30f8a78cab2cace6cf2607544f8155d652311457cee02` (90662498 bytes)

Only the report changed in Git. A local prose/no-comments audit found no added
code comments or suppressions. No child agent, checkout change, merge, rebase,
push, native app, signing, Keychain, real Todo data or arbitrary cleanup occurred.
The terminal notification names the report's full housekeeping delivery SHA.
