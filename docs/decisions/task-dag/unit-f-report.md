# Unit F verification report

## Current integrated mapping

The active product pins now name `7d947f917d1895df45c78f9f9df31638a9f3f2b8`, including both clients, the two-part public contract amendment and main PR #12. Current mutation/restoration controls precede the mapping renewal. Full integrated conformance now passes, with actual proof sources retained. See [the integration report](integration-report.md). Grouped seats and native/fresh-discovery gates remain separate.

## Historical F1 implementation status

F1 implementation closure is complete at committed verifier source
`0d9145443dc46ec4c6b75decee8be0b133d530ee`, branch `feat/task-dag-f-formal`.
The complete default command and full locked F-worktree check both exited 0.
Immutable product remains `0f7a19488f15ec1f8d4c4dad14749de7720f17d0`;
actual CLI and HTTP health build is `0f7a1948`, contract
`58c0026725f2d846fd4f80bd7cabaff73994d6603d04ed501c82cfa1fa6f1fe9`.
This is implementation/proof delivery for renewed max seat 1 and coordinator
review. It is not final F, client or whole-feature approval.

Current machine receipt: [f1-completion.json](../../evidence/dag-formal/f1-default-8vDMKq/f1-completion.json).
Full counts, exact commands, cleanup paths and source-control results are in
[completion.json](../../evidence/dag-formal/f1-default-8vDMKq/completion.json),
[model-counts.tsv](../../evidence/dag-formal/f1-default-8vDMKq/model-counts.tsv) and
[source-controls.tsv](../../evidence/dag-formal/f1-default-8vDMKq/source-controls.tsv).
The documentation-only delivery SHA is written after commit to
`docs/evidence/dag-formal/f1-default-8vDMKq/f1-delivery.json` and both terminal notifications.

The Prepared/unproven and DISK STOP sections below are superseded historical
checkpoints. Their failed and stopped exits remain unchanged. The prior
`71a29afc` behavioral default 0 remains valid for its recorded behavior;
F1 invalidated its universal compiler-guard claim. The corrected guard proof
is the current committed-source run below. Final E/S runtime mapping, native
checks, fresh Claude discovery and renewed independent F reviews remain pending.

## Historical e717 public continuation under G11 hold

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
| bun .agents/skills/verify-dag-formal/public-check.mjs | 1 | Required Version-0 usage assertion fails at e717; docs/evidence/dag-formal/public-0lx9mw |
| bun .agents/skills/verify-dag-formal/public-check.mjs unaffected | 0 | diagnostic-pass only; docs/evidence/dag-formal/public-krrGtO |
| bun .agents/skills/verify-dag-formal/check.mjs --model-only | 0 | finite model, five controls, seven reachability receipts; docs/evidence/dag-formal/check-n6XlTn |
| pnpm check | 0 | F worktree only; docs/evidence/dag-formal/pnpm-check-public.stdout and .stderr |
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
in docs/evidence/dag-formal/check-n6XlTn/result.json and the retained historical table below.

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
Production evidence: `docs/evidence/dag-formal/conformance-11Cw1a`.
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
`docs/evidence/dag-formal/conformance-11Cw1a/candidate/docs/evidence/fv01/fv01-check-QQRSDd`. B owns its maintenance and prior sensitivity. F did not edit
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
`docs/evidence/dag-formal/cleanup-2026-11-09-Bs6ybF/plan.json`.
Completed cleanup receipt:
`docs/evidence/dag-formal/cleanup-2026-11-09-Bs6ybF/receipt.json`.

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


## Merged-source preparation checkpoint, 2026-11-09

Held at the owner's latest instruction. Final B conformance must resume at L1's
exact merged integration SHA after the held B closure passes and B merges.
Leaf 6486b347f611e118a0d60ead4ebe40ac77d86666 was not pinned. The last inspected
candidate remains 3cceb41efc08b8cd835d5c883c3d370709865c3f, with known response-order
and captured-credential issues. Both pins now set awaitMergedIntegration.
No B merge, source checkout, product edit or child agent was used.

Preparation source commit: a237869c0e0adf444d379202743e9daf01c1c48d.
The report-only delivery SHA is named in terminal notifications and this new
ignored receipt's delivery fields. No final merged-source proof is claimed.

Current one-command check at that committed preparation source:
`bun .agents/skills/verify-dag-formal/check.mjs` exited 2 with
awaiting-merged-source, before any compiler, model or child command started.
This is the intended hold gate, not a proof pass. The standalone production
and public entry points also refuse superseded source compilation while held.
Gate receipt: `docs/evidence/dag-formal/merged-hold-YEGKoo/default-gate.json`.
Aggregate preparation receipt: `docs/evidence/dag-formal/merged-hold-YEGKoo/preparation-summary.json`.

### Completed unaffected calibration

These diagnostic runs preceded the final hold and used immutable 3cce Git objects.
Their verifier inputs were uncommitted calibration bytes recorded by hash in
verification-inputs.json. They do not prove the expanded committed preparation
pipeline or any merged-source property.

- public-check.mjs boundaries exited 0 at
  `docs/evidence/dag-formal/public-zfoCK2`.
- public-check.mjs boundary-controls exited 0, diagnostic-pass, at
  `docs/evidence/dag-formal/public-NjVzFG`. It passed 17 malformed-input cases across depend,
  undepend, add, graph, batch-depend, rm and Revert, four genuine missing/I/O
  classifications, and valid stale no-ops with unchanged History. The three
  Version-0 cases cover existing add, missing add and absent remove. Errors
  carry one JSON object, invalid_args, exit 2 and the literal recovery token.
- All seven new actual-source boundary controls compiled successfully, failed
  the intended AssertionError with exit 1, restored source byte-for-byte and
  reran clean with exit 0. They cover runtime versus usage classification,
  edge/graph/add/batch/Revert decoding and explicit-present empty fingerprint.
  The calibration recorded 14 canonical per-compiler disk guards, all exit 0.
- Independent replay exited 0 for 93 cases/186 full and checkpoint rebuilds,
  seed 260911, all DAGs through 3 nodes plus 64 seeded DAGs through 12 nodes.
  Nineteen concrete lifecycle, Move/Purge/FK, initial-edge and N1 integration
  checks exited 0. B's 31-case matrix was inspected; its new F rerun path is
  prepared but was not executed before the hold.
- check.mjs --model-only exited 0 at
  `docs/evidence/dag-formal/check-x0dfU4`: 25 positive configurations plus the clean recheck,
  all positive queues 0, five intended mutant counterexamples at exit 12 and
  seven reachability witnesses at exit 12. Clean counts remain 64 initial,
  32,816 generated, 19,784 distinct, depth 27, queue 0. DagAcyclic and its configs
  are unchanged, with the previously stated finite bounds and tool pin.
- The synthetic prior-stop sentinel check exited 0 at
  `docs/evidence/dag-formal/guard-check-op00WH`. It prevented compiler entry and restored
  an isolated scratch copy exactly. It is not an actual low-disk observation
  or a product sensitivity pass. pnpm check was not rerun in this continuation.

### Prepared and explicitly unproven (superseded history)

The full command now has the intended library/public pipeline, guarded actual
compiler calls, a cross-process disk-stop latch and safe exact restoration.
Nested AtomicCAS Bun.build calls are wrapped without editing B's skill; that
new nested wrapper still needs its merged-source execution. AtomicCAS remains
separately owned by B and limited to one Task without graph edges.

The coordinator withdrew all-three-topo G11 ordering. Ancestors/descendants stay
in whole-Profile topo; lightest_next is own energy ascending, unknown last,
then whole-Profile topo position. The --order lightest remaining-energy key is
unchanged. The updated root fixture and graph-response-properties.ts prepare:

- exact eight direct, encoded and public node keys, including a hidden direct
  field control and a separate count-only observation of reachable calls;
- an independent 1,000-chain/root 500 in both strict directions, an unequal-energy
  fork with unknown last, equal-energy topo ties, Ready-root inclusion and
  terminal-root exclusion, and separate CLI/HTTP/compact size measurements;
- the committed B chain fixture hash/root, typed Mermaid identities/arrows,
  readGraph, schemas/OpenAPI/generated Swift source mapping and CLI Markdown;
- a portable production client constructed once while signed out, with a getter
  read inside each request, real HTTP through a forwarding header observer,
  profiles 200 with the current bearer after sign-in and no Authorization header
  after sign-out. A 401 alone is insufficient. Prepared controls freeze the
  signed-out value or retain the revoked bearer, rather than recreate a client.

These expanded response/client helpers and controls are UNCOMPILED and UNPROVEN.
Do not treat written assertions as completed coverage. Full algorithm/read corpus,
source sensitivity, 31-case matrix, nested AtomicCAS and response/client clean
runs must execute against the exact merged source after a function review and
committed F verifier source. The former f140/e717 receipts stay at their original
candidates. Final E/S feature/runtime mappings, fresh Claude discovery and
independent final F review seats remain pending. No final F, B or whole-feature
approval is claimed.

### Retired artifacts and disk

After completed calibration mutants, retired seven idle F-owned superseded
.scratch/bin binaries, 634,868,654 logical bytes. Every adjacent provenance
manifest, source/behavior receipt and cited evidence directory was preserved.
The receipt lists their exact SHA-256, completed control references and in-use
checks. All isolated product input files were rechecked byte-identical to their
captured immutable manifests before this checkpoint. No own cached binary was
running. The retained e717 hash group is
1aa1db7f8ede6a9401d4f9eaf5e52823ed8ec52a3275cd02b71e71040c95713b;
the retained 3cce review group is
33dcee7ebeb0d870b69f28562f42ad36125c0daccf26f3ef23bed8e9cbaa3bca.

| Retired relative path | Logical bytes unlinked |
| --- | ---: |
| `.scratch/bin/dag-f-todo-cc56e644dff43dbe05798850d1414105a85d885695484929d0b87ab01cc0007a` | 90695522 |
| `.scratch/bin/dag-f-todo-e2f5ad2f638ed1e86c0f98193d4b60c11ea444b016423d89ac23bc2cb4bcdaf9` | 90695522 |
| `.scratch/bin/dag-f-todo-392f56c8d89dff172974bdc6330b323120788949d681b9c90959b1230c5a6ef8` | 90695522 |
| `.scratch/bin/dag-f-todo-f9d240ccd298fe34038566f133191b071490ffca5e14614f1eca8c1d1353219c` | 90695522 |
| `.scratch/bin/dag-f-todo-132c1c4528aff07f7456b373f302c927400a45128e51fd80d1553f2e9ce90f9a` | 90695522 |
| `.scratch/bin/dag-f-todo-92a8c4b9f97e062565b29e44ee3c42c5f771499e10ca4b0ba537a5c5436b5d5f` | 90695522 |
| `.scratch/bin/dag-f-todo-e173fa888aedcc478ad678051e84937882969b57449237e53d62226edaaa5024` | 90695522 |

Initial compile-setup guard reported 26.6 GB; the checkpoint guard exited 0 and
df observed 19.04984883 GB available. These span concurrent activity,
not a reclaimed-capacity measurement. Per-unlink free capacity was not sampled
in this calibration; the retirement helper now records before/after df for
future runs. No APFS capacity gain is inferred from logical bytes. No DISK STOP
occurred. There was no cleanup outside owned files and no cited evidence
was deleted. No product, model/config, native app, signing, Keychain, real data,
installed binary, dependency or checkout change was made. git diff --check
passed. Local prose/no-comments audit added no code comments or suppressions.


## Merged-source execution and DISK STOP, 2026-11-09 (superseded history)

The default full command did not finish clean. It exited 3 after the canonical
per-compiler guard returned DISK STOP at 10.0 GB free, below its floor. No
further proof or compilation started. The current isolated mutation was restored
exactly and its completed CLI binary retired. A final manifest audit found zero
changed product input files in all eight materialized candidate directories.
No own cached binary remained running. This is a resource stop, not a passing
sensitivity result or completed merged B conformance.

Branch: feat/task-dag-f-formal. Committed proof source:
0a656b1ed23b9461e7ad3317b7afb383e2b40905. The prior pin/review commit is
82f716b175747ecaf8b633e0824d61de7e0e9b32. The report-only delivery SHA appears
in terminal notifications and the aggregate receipt's delivery fields.
Active immutable product Git object: 0f7a19488f15ec1f8d4c4dad14749de7720f17d0.
Both pins and both reviewed coverage maps agree with it; the merged-source hold
was cleared only after reviewing changed functions and whole-file hashes.
The historical default exit 2 remains a preparation hold, not a product pass.

Actual CLI --version and live server /health both report build 0f7a1948 and
contract 58c0026725f2d846fd4f80bd7cabaff73994d6603d04ed501c82cfa1fa6f1fe9.
Neither a leaf binary nor this F branch's HEAD was substituted. Cache identity
includes the merged pin, source bytes, compiler, build define and contract.
The observed health/version values are preserved in
docs/evidence/dag-formal/public-AYSIyk/graph-response/build-identity.json.

### Actual commands and receipts

- bun .agents/skills/verify-dag-formal/check.mjs at the committed proof source:
  actual exit 3, docs/evidence/dag-formal/check-DkqQeo. Outer stdout/stderr are
  merged-final.stdout and merged-final.stderr under the same evidence base.
- The production-conformance stage exited 0 at
  docs/evidence/dag-formal/conformance-AyHrt4. It includes all 36 intended source controls,
  exact restores, the clean corpus rerun, replay, migration and concrete DAG
  drive, strict candidate type checking and guarded AtomicCAS.
- The public-conformance stage exited 3 at
  docs/evidence/dag-formal/public-AYSIyk. Its baseline passed 147 actual CLI/HTTP/PTY
  actions. All 31 committed B input-matrix cases passed. Direct/encoded/public
  root responses, the portable getter sequence, reachability-count observation
  and strict candidate type checking exited 0 before the resource stop.
- Only four of 53 public/read controls completed in this committed run:
  cli-false-guard, http-false-recovery, terminal-ready-blocked, filter-before-order. Each compiled, failed its intended
  behavioral AssertionError with exit 1, restored exact bytes and reran with
  exit 0. The next stale-valid-noop control did not execute its broken behavior
  because its server compile was stopped before entry. It is not a pass.
- No pnpm check was run by F in this continuation. L1 supplied the postmerge
  pnpm check exit 0 and its integration-b receipt. F's own driver strict
  checks passed; those do not replace the repository-wide command.

The public baseline passed true-only filters and recovery, Ready/Blocked
terminal exclusion, whole-Profile order before filtering, valid stale no-op
History equality, malformed CLI/HTTP and auth boundaries, literal 9/13/14 advice
and refusal counts, formats/schemas/envelopes, per-item batch dry-run and actual
SQL rollback, confirmation/fingerprint changes to empty, import forward and
successful-map resolution with independent groups and full encoded nested
witnesses, full refusal response versus bounded History, Purge redaction and
both rebuild paths. Its result lists nine parallel property groups; it is
baseline evidence, not completion of all sensitivity and final clean steps.

### Finite model and generated production bounds

The unchanged DagAcyclic model completed all 25 positive configurations plus
its clean recheck with empty queues. Five intended model controls and seven
reachability witnesses returned the intended exit 12. All finite configuration
copies, exact initial/generated/distinct/depth/queue counts, tool hash and traces
are in check-DkqQeo. The model has no state constraints that truncate its queue.
Typical bounds are three Tasks, one Profile, CLI/server writers, four statuses,
Versions 1 through 4 and one bounded grouped Revert; the degree-two count race
uses four Tasks. Two Profiles and literal 15-Task single-add 13/14 checks have
separate configurations. The small race is not a literal degree-13 race proof.

TLC remains tla2tools 1.7.4, SHA-256
936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88,
768 MiB heap, one worker, fingerprint 0, seed 26 and 120 seconds per config.
The clean run has 64 initial, 32,816 generated, 19,784 distinct, depth 27 and
queue 0. The five counterexamples remain graph-check-before-Begin, no writer
lock, status-pruned cycle checking, omitted reopen guard and split Delete
publication. No-lock writers apply edge facts to durable state.

| Positive config | Initial | Generated | Distinct | Depth | Queue | Exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| statuses | 64 | 32816 | 19784 | 27 | 0 | 0 |
| degree-two-race | 1 | 533 | 323 | 27 | 0 | 0 |
| delete-fanin | 1 | 582 | 358 | 29 | 0 | 0 |
| opposite | 1 | 543 | 332 | 27 | 0 | 0 |
| transitive | 1 | 392 | 215 | 29 | 0 | 0 |
| pruned | 1 | 543 | 332 | 27 | 0 | 0 |
| reopen | 1 | 378 | 203 | 29 | 0 | 0 |
| reopen-cancelled | 1 | 378 | 203 | 29 | 0 | 0 |
| complete | 1 | 481 | 288 | 27 | 0 | 0 |
| remove | 1 | 567 | 348 | 29 | 0 | 0 |
| witness | 1 | 392 | 215 | 29 | 0 | 0 |
| delete | 1 | 457 | 269 | 27 | 0 | 0 |
| delete-dependent | 1 | 525 | 318 | 29 | 0 | 0 |
| degree | 1 | 457 | 269 | 27 | 0 | 0 |
| count-race | 1 | 533 | 323 | 27 | 0 | 0 |
| profiles | 1 | 314 | 164 | 26 | 0 | 0 |
| noop | 1 | 247 | 116 | 21 | 0 | 0 |
| malformed | 1 | 107 | 48 | 9 | 0 | 0 |
| unauthorized | 1 | 107 | 48 | 9 | 0 | 0 |
| self | 1 | 229 | 105 | 15 | 0 | 0 |
| boundary13 | 1 | 19 | 13 | 10 | 0 | 0 |
| boundary14 | 1 | 15 | 11 | 8 | 0 | 0 |
| noop-add | 1 | 247 | 116 | 21 | 0 | 0 |
| delete-blocker | 1 | 525 | 318 | 29 | 0 | 0 |
| cancel-complete | 1 | 502 | 302 | 29 | 0 | 0 |
| clean-recheck | 64 | 32816 | 19784 | 27 | 0 | 0 |

The real-import graph corpus passed, seed 260911: 4,165 directed graphs through
four nodes, 572 DAGs, 140,660 status vectors, 709,242 weight vectors in separate
dimensions, 342,838 scalar cases, 2,304,885 cycle pairs and 30,624,590 assertions.
It includes 256 additional seeded DAGs through 40 nodes and the 103-edge loop.
Both original and restored full corpora matched. Independent raw replay passed
93 cases and 186 rebuilds, exhaustive DAGs through three nodes plus 64 seeded
DAGs through twelve nodes. Nineteen lifecycle/N1/FK/Move/Purge integration checks
passed. All 36 library/replay source variants failed their intended behavioral
property with exit 1 after successful compilation and restored clean with exit
0. Exact corpus, command and per-control receipts are in conformance-AyHrt4.

The unchanged B-maintained AtomicCAS command ran through guarded-runtime.mjs
and compile-preload.mjs. Its actual exit was 0, with 216 enumerations, 432 replay
checks, seven process-kill boundaries and two writers. Its own two intended TLC
controls return 12. Its evidence is
docs/evidence/dag-formal/conformance-AyHrt4/candidate/docs/evidence/fv01/fv01-check-vcbOvD.
This remains a separate finite single-Task/no-edge check. F did not edit it.

### G11, G4, Mermaid and portable-client execution

The direct queryGraph and authenticated readGraph checks passed eight node
keys before encoding, after encoding and through CLI/HTTP. A separate count-only
binary observed three reachable calls for literal fixtures and the 1,000-node
chain; the hidden per-node discarded-work control failed behavior in calibration.
This is not a total query-time or shared-bitset complexity claim.

The independent F chain requests root 500 and checks exactly 500 strict
ancestors and 499 strict descendants. The branch distinguishes topo A(4), B(1),
U(unknown), root from next B,A,U, and checks equal-energy topo ties, inclusive
Ready roots and excluded done/cancelled roots. Ancestors/descendants retain
whole-Profile topo; next retains own-energy/unknown-last/topo ordering. Typed
Mermaid identities are bijective and every stored redundant edge renders in
blocker-to-dependent direction. Actual CLI Markdown, schema and Mermaid wiring
passed. Remaining-energy list-order treatment of unknown weights is unchanged.

F independently drove the committed B chain fixture, SHA-256
9954c8d86f6e9abac1ac3fb46be0ea16a7043297e2815dff32533a4c5de93c8f,
root 90d7ac86-4b7e-4eb6-abb0-f76343e124c2, using preserved e717 before and merged
0f7 after binaries against issued scratch data. The distinct F root-500 fixture
uses typed ids f-root-chain-0 through f-root-chain-999.

| F-observed fixture | Before CLI bytes | After CLI bytes | Before compact bytes | After compact bytes | Actual HTTP body bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| root500 | 29035948 | 1078807 | 19643929 | 726753 | 726753 |
| review-root999 | 49255186 | 1206265 | 39853167 | 844214 | 844214 |

These are F's separate observed measurements. CLI pretty stdout, compact
re-encoding and actual HTTP body bytes remain distinct. Historical B/reviewer
measurements remain attributed to their own candidates; no latency claim is
made. Full response bytes, hashes and issued fixtures are preserved under the
current graph-response evidence directory.

One portable production client was constructed while signed out. The observed
sequence is sign-in 200/no bearer, Profiles 200/current bearer, graph reads
200/current bearer, sign-out 204/current bearer, Profiles 401/no Authorization
header, re-sign-in 200/no bearer and Profiles 200/current bearer using the same
instance. This executes the real production factory through a real HTTP header
observer without native imports. A revoked bearer returning 401 would not pass.
The client-auth-sequence.json receipt contains those actual headers/statuses.

All 15 new response/client variants passed calibration at public-57AtSB:
compilation succeeded, intended behavior failed with AssertionError/1, exact
source restore passed with exit 0. That calibration's verifier inputs were
uncommitted and hashed; it does not replace the required full committed default
run. In the committed run their baseline predicates passed, while their source
controls remain beyond the disk stop.

Published OpenAPI 3.1 and normalized Swift OpenAPI 3.0 are intentionally not
byte-identical. Both graph schemas passed exact eight node keys, required root
sets and matching descriptions/arrays, with the same contract identity. Whole-
file source hashes, Swift decoder sources/tests and all portable factory callers
were mapped. Native client runtime was not executed. Independent B review
receipts were inspected, not rerun or relabelled as F/0f7 execution. Their record
is merged-review-j9lbVU/inspected-independent-exits.json. Its Swift 20/no-skip and
unsigned-host THIN_PASS_NATIVE_BLOCKED results do not establish native storage,
restoration, Keychain, notification or final E/S feature/runtime behavior.

### Verifier repairs and retained attempts

The first committed full attempt at 82f716b1 exited 1 after successful model and
production stages because a matrix binary and output directory shared a name.
That verifier-only path collision is fixed. Subsequent retained calibrations
exposed an invalid byte-equality expectation for the deliberately normalized
Swift OpenAPI, an omitted helper copy and strict TypeScript fallback to the old
workspace API. The checker now compares the actual graph contract fields and
identities, copies the helper, and resolves workspace exports to the immutable
candidate for TypeScript as well as Bun. A tuple-inference error in the JS
fixture was also corrected without changing expected order/membership. No
compiler, hash or setup failure was counted as a sensitivity pass.

Retained attempts: check-JEAfw3, conformance-26l1Nm, public-Ew5E9C,
public-fOtDJZ, public-JDSIG5, public-QovnJC and public-57AtSB. Their full inputs,
actual exits and known setup failures survive. The earlier preparation hold and
all f140/e717/3cce evidence remain unchanged. Only the committed default exit 3
is the current overall result.

### Disk, restoration and remaining work

The first actual compiler guard in this continuation observed 18.6 GB free.
Across the retained runs, 141 immediate compiler guards returned 0 and one
returned 3. The final raw df observation after safe restoration/retirement was
10.080997376 GB available. Free-space changes span concurrent activity;
logical unlinks do not imply reclaimed APFS capacity. Every retirement records
its own observed before/after capacity, completed-control reference, SHA-256,
ownership and ps/lsof in-use checks.

Retired 94 own superseded mutant binaries, 8,437,452,668 logical bytes.
The exact paths are below. All adjacent provenance manifests, source/behavior
receipts, current/review binaries and cited evidence directories were kept.
No directory was pruned. Protected e717 and 3cce CLI/server groups remain, along
with current merged 0f7 CLI/server binaries. No symlink target or another
worker's file was removed. Aggregate receipt:
docs/evidence/dag-formal/merged-disk-stop-summary.json.

- .scratch/bin/dag-f-mutant-authenticated-initial-26ee69592085d658341f56ce65fc2da5b21821cb2a3571fa6951b5782ae00ccb (90101090 logical bytes)
- .scratch/bin/dag-f-mutant-beginning-edges-700fe6f21fed46eac0638587e7fc8db497ad3f3384959ffdc7ebe84eea43ee3e (90084578 logical bytes)
- .scratch/bin/dag-f-mutant-bfs-depth-cap-a65dce9b292bc289f23a9312693c02f3f96f47f50d48c37bef372fa0e5cd7f19 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-bfs-lifo-3ab65c9af6a59460b1b7d95b2aa9ddffbb19f461f21cc3775e673442bda5c190 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-chain-precedence-0d781883d979da0f903332fb711ad8702013a4e7224a834c67f55d777486944a (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-checkpoint-edges-8273922ba0606f4e35ec0e8814f8305072d6331ec1548a9f590b85d4b4079243 (90084578 logical bytes)
- .scratch/bin/dag-f-mutant-contains-membership-5912b1f1d6e2c6a63b7ec239f391234b67f28beaca0cb831cdc98336820ea5ef (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-counted-advice-ed8bce7bcf58ee9d15d16f1e5ea4951ba6e17e7b00d4d38ea37b4c97eab7bc26 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-created-tie-704884a72c329d8577d7dc1faabc4e9a8a77b3ec323d566f4cb7edafcf4d5b5d (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-cycle-arrow-533c55a4cba848f39b777eb1cdda98cf7290561b956bf6cf14b71dbcf4394752 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-cycle-self-9128bb4b6192962136214fbed46f51c66abb83a5a06fe79f67e1c975272ee783 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-degree-14-fdc78581a43d1171f4421d038edeea529f4c3e5d0cb417cd5591f7e70882f70d (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-delete-cleanup-cc58a02331cf934e4f8cd1e63e3a4ddb19041203682a07a02fc9c7c34e29711f (90101090 logical bytes)
- .scratch/bin/dag-f-mutant-dependent-versions-240da3eb476c72af61bfcea18abb6c18c3c780b4c8543f55365220ba3cec0c3f (90084578 logical bytes)
- .scratch/bin/dag-f-mutant-distinct-union-d47fd6901740862472ce2b11c79393636d58fd5b228244a9c94d614fe9871899 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-due-tie-48d90c03bcd2a5813328c612d658f2282338ba660825a164060a384f83f08259 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-id-tie-9a3ea33d30e6b8d82ca176a0c33532ba4af7bbf1b3b5833e724e62d4b2751961 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-inclusive-next-80e36ee59e500608bada137a4d057687370421d020dfcc9743f7ed1f26d2bcf7 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-kahn-degrees-065d8fedb958c3f5991be520fc518b1181df3496215c1a01faa72df54bede9d7 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-lightest-key-a789ae5c6829bd6091de8bd91b1b78f548dd04aef5b053366ecd1e87c6e0775f (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-move-cleanup-7d4485954895836c04f461436e05472d8fc961d03fb957b08a886541abb8b587 (90101090 logical bytes)
- .scratch/bin/dag-f-mutant-next-own-energy-d38fc22265dee1303bcb75a03722e94f3f825e733e7cdcf0d8f609d0ad1936d7 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-priority-tie-943f7dc902f0ec3c9e26e9a02d371b6db9d911d472d1eff9527bf1c90bd328da (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-projection-migration-version-a4954ce6c4289c09c9f19a2a08a461d26cfcec9ced2f06f54721585d3c7a603a (90101090 logical bytes)
- .scratch/bin/dag-f-mutant-purge-witness-redaction-faf5a0cd9581ce3f2ae631fc6daa215f63f799449013d7763f64c25263de22e4 (90101090 logical bytes)
- .scratch/bin/dag-f-mutant-query-component-5a48a34d1a75518c6a69c6ab9cc9c0842afbabc5cfa9fed96e4b84e49d22ed6f (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-revert-recorded-version-50ad01343c7cbfa69426c4bf87ab01fe34664205de35eae1938a92e748f5a361 (90101090 logical bytes)
- .scratch/bin/dag-f-mutant-single-precedence-25b3241d4b4e8d5c429ca5af1b497048e1bb629a96fa60d0385c1a865d8e08bc (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-status-pruned-index-b907d01bbeff486e0b9dc7eeb240e69fd9d1b4280548391a2e38f01fd070ec33 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-terminal-blocked-bab5cd45d772e7093d0923798f256afc7cf728dd1cd401756f607053ba2c75ce (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-terminal-pruning-053abd2ec42230415f1fcb2a7ed652ea3bc9de8f7c93adbf6c6c168031a15755 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-terminal-ready-8245b9a86a753a17c875539f8c16b5ae696607656d0e18026cd97e7e87f2e3f5 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-tree-count-fac47aca52a26cbb69e52c6939ad67f16215cc05a3bf67afd80879c6275d1943 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-tree-orientation-137fdc0446b1561aacc19de2427a306b32cfb11467ed0302c54c94fcd6f7a7a7 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-unknown-traversal-1132369d34a28596c51b18b0dac2f0bb5135adcfb92d77759af801aff9833791 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-unweighted-mask-279b173173297b544968b4de4d1e34c4b4b7a257a5041b7619fa1beb299aa52d (89374562 logical bytes)
- .scratch/bin/dag-f-isolated-client-freezes-signed-out-value-driver-14cb162a56fca7af88922a3ed71f2ec7fbea8d018912fa50a8c07f2105b689fd (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-client-retains-revoked-bearer-driver-14cb162a56fca7af88922a3ed71f2ec7fbea8d018912fa50a8c07f2105b689fd (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-discarded-per-node-closure-work-driver-ab3f2a5db6e978388afc18ad511bfeb8b49a0fb91014b03362c273f3417c62a2 (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-graph-schema-hidden-node-field-driver-b059032ae00737a671e920960d58ab4c77b8d1c6dc586df8f4e6e8981a9ba6a4 (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-graph-schema-strips-root-set-driver-6b93e8dcdf60c501463b9d5bcd235d90d4fb39763daae76ea40e1cbef62c5940 (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-hidden-direct-node-closures-driver-cd7af940b4ecfcc8b5606c436d8b9a73de98135faa73401cdb41f5dd983bf29c (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-mermaid-identity-collision-driver-176121b444d88b0e61b798668acbed793ccf17bca2068f6f01a7d280f27afe03 (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-mermaid-reverses-arrows-driver-4d7a7a30cfd762215e240bbedec94e1683b2e34e33372bef4c703debb8c75416 (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-root-ancestors-reversed-driver-fc4379f7818789996a1a5354b421f48d9a3494da5bb841e494d191a8f29f4492 (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-root-descendants-reversed-driver-a143a3aed1a84d0016575c45a0acee31cebf5d56b9e3ab53019e63332772343e (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-root-next-excludes-ready-root-driver-43136134c171db762207ff4fdbd33369ec64d6247a13f1d93459b5931bdfb3ff (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-root-next-id-tie-driver-c74254fcbd29d735797dff7de2128400e557723dde92ba0d6701ce2bc74e3a8b (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-root-next-includes-terminal-driver-76dfef72c0c5083edf8873a6b74c960e74c9e1d096f44c127f74d10deff0216d (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-root-next-topo-regression-driver-3e7f2ef90e836032074a6337f55b85e58ee7f76d7be3df4a0deacfe29113a547 (90315746 logical bytes)
- .scratch/bin/dag-f-isolated-root-next-unknown-first-driver-0b9365445edf89cf027bb96717a7d7e293af1e6a87482f0488c1ce4f03617cb1 (90315746 logical bytes)
- .scratch/bin/dag-f-mutant-authenticated-initial-26ee69592085d658341f56ce65fc2da5b21821cb2a3571fa6951b5782ae00ccb (90101090 logical bytes)
- .scratch/bin/dag-f-mutant-beginning-edges-700fe6f21fed46eac0638587e7fc8db497ad3f3384959ffdc7ebe84eea43ee3e (90084578 logical bytes)
- .scratch/bin/dag-f-mutant-bfs-depth-cap-a65dce9b292bc289f23a9312693c02f3f96f47f50d48c37bef372fa0e5cd7f19 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-bfs-lifo-3ab65c9af6a59460b1b7d95b2aa9ddffbb19f461f21cc3775e673442bda5c190 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-chain-precedence-0d781883d979da0f903332fb711ad8702013a4e7224a834c67f55d777486944a (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-checkpoint-edges-8273922ba0606f4e35ec0e8814f8305072d6331ec1548a9f590b85d4b4079243 (90084578 logical bytes)
- .scratch/bin/dag-f-mutant-contains-membership-5912b1f1d6e2c6a63b7ec239f391234b67f28beaca0cb831cdc98336820ea5ef (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-counted-advice-ed8bce7bcf58ee9d15d16f1e5ea4951ba6e17e7b00d4d38ea37b4c97eab7bc26 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-created-tie-704884a72c329d8577d7dc1faabc4e9a8a77b3ec323d566f4cb7edafcf4d5b5d (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-cycle-arrow-533c55a4cba848f39b777eb1cdda98cf7290561b956bf6cf14b71dbcf4394752 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-cycle-self-9128bb4b6192962136214fbed46f51c66abb83a5a06fe79f67e1c975272ee783 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-degree-14-fdc78581a43d1171f4421d038edeea529f4c3e5d0cb417cd5591f7e70882f70d (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-delete-cleanup-cc58a02331cf934e4f8cd1e63e3a4ddb19041203682a07a02fc9c7c34e29711f (90101090 logical bytes)
- .scratch/bin/dag-f-mutant-dependent-versions-240da3eb476c72af61bfcea18abb6c18c3c780b4c8543f55365220ba3cec0c3f (90084578 logical bytes)
- .scratch/bin/dag-f-mutant-distinct-union-d47fd6901740862472ce2b11c79393636d58fd5b228244a9c94d614fe9871899 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-due-tie-48d90c03bcd2a5813328c612d658f2282338ba660825a164060a384f83f08259 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-id-tie-9a3ea33d30e6b8d82ca176a0c33532ba4af7bbf1b3b5833e724e62d4b2751961 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-inclusive-next-80e36ee59e500608bada137a4d057687370421d020dfcc9743f7ed1f26d2bcf7 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-kahn-degrees-065d8fedb958c3f5991be520fc518b1181df3496215c1a01faa72df54bede9d7 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-lightest-key-a789ae5c6829bd6091de8bd91b1b78f548dd04aef5b053366ecd1e87c6e0775f (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-move-cleanup-7d4485954895836c04f461436e05472d8fc961d03fb957b08a886541abb8b587 (90101090 logical bytes)
- .scratch/bin/dag-f-mutant-next-own-energy-d38fc22265dee1303bcb75a03722e94f3f825e733e7cdcf0d8f609d0ad1936d7 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-priority-tie-943f7dc902f0ec3c9e26e9a02d371b6db9d911d472d1eff9527bf1c90bd328da (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-projection-migration-version-a4954ce6c4289c09c9f19a2a08a461d26cfcec9ced2f06f54721585d3c7a603a (90101090 logical bytes)
- .scratch/bin/dag-f-mutant-purge-witness-redaction-faf5a0cd9581ce3f2ae631fc6daa215f63f799449013d7763f64c25263de22e4 (90101090 logical bytes)
- .scratch/bin/dag-f-mutant-query-component-5a48a34d1a75518c6a69c6ab9cc9c0842afbabc5cfa9fed96e4b84e49d22ed6f (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-revert-recorded-version-50ad01343c7cbfa69426c4bf87ab01fe34664205de35eae1938a92e748f5a361 (90101090 logical bytes)
- .scratch/bin/dag-f-mutant-single-precedence-25b3241d4b4e8d5c429ca5af1b497048e1bb629a96fa60d0385c1a865d8e08bc (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-status-pruned-index-b907d01bbeff486e0b9dc7eeb240e69fd9d1b4280548391a2e38f01fd070ec33 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-terminal-blocked-bab5cd45d772e7093d0923798f256afc7cf728dd1cd401756f607053ba2c75ce (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-terminal-pruning-053abd2ec42230415f1fcb2a7ed652ea3bc9de8f7c93adbf6c6c168031a15755 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-terminal-ready-8245b9a86a753a17c875539f8c16b5ae696607656d0e18026cd97e7e87f2e3f5 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-tree-count-fac47aca52a26cbb69e52c6939ad67f16215cc05a3bf67afd80879c6275d1943 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-tree-orientation-137fdc0446b1561aacc19de2427a306b32cfb11467ed0302c54c94fcd6f7a7a7 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-unknown-traversal-1132369d34a28596c51b18b0dac2f0bb5135adcfb92d77759af801aff9833791 (89374562 logical bytes)
- .scratch/bin/dag-f-mutant-unweighted-mask-279b173173297b544968b4de4d1e34c4b4b7a257a5041b7619fa1beb299aa52d (89374562 logical bytes)
- .scratch/bin/dag-f-todo-0bb7fc58d6c47c1487668259998131f0585084cc8e5e953359055e787e957575 (90695522 logical bytes)
- .scratch/bin/dag-f-todo-771a642b6e1c4258902f6da23bd15555a0347dfbe9a78f46bcb69849bf3dac21 (90695522 logical bytes)
- .scratch/bin/dag-f-todo-server-771a642b6e1c4258902f6da23bd15555a0347dfbe9a78f46bcb69849bf3dac21 (90662498 logical bytes)
- .scratch/bin/dag-f-todo-server-61e328b7b1e310305781c132492fbc5d0722bbfef7da646fb7c134b50080589c (90662498 logical bytes)
- .scratch/bin/dag-f-todo-d893393ad7cf770afc26462d4af21389fb903464975bb9f53bd79a2e5c88e374 (90695522 logical bytes)
- .scratch/bin/dag-f-todo-0ad87507dd0aa8f7fa6c0a743f2c4335ffe134b4b7fc8ac0a709102fe4357e8b (90695522 logical bytes)
- .scratch/bin/dag-f-todo-server-0ad87507dd0aa8f7fa6c0a743f2c4335ffe134b4b7fc8ac0a709102fe4357e8b (90662498 logical bytes)

All checked immutable candidate manifests were byte-exact after the stop. The
stopped stale-valid-noop mutation has a restoration receipt but no successful
broken/clean behavioral pair, and is explicitly unfinished. No new work starts
under the disk stop. The full default command must later finish 0, including
all remaining public/read controls and fresh clean reruns at a committed F
source. That pending result cannot be assembled from calibration subsets.
Final E/S feature/runtime mapping, fresh Claude discovery and both independent
final F seats remain pending. No final F, merged B conformance, whole-feature,
unbounded, liveness, SQLite-engine, power-loss or client-native approval is
claimed. No product files or domain modules were added or edited. No child,
checkout change, merge, rebase, push, PR, real Todo data, owner Task, installed
binary replacement, native app, signing or Keychain was used. The local
comments/suppressions audit added no comments or suppressions; no child was
launched because the task expressly forbids children.

Coverage JSON SHA-256 values at the proof source:
coverage.json 3f590f78a831490fc3e98e72d1931872b766cbc4a8a93b52bf6ceacefea38e48;
public-coverage.json 5bedf89db0fa2fe49887e35f37279bea0220e2eb81bf0206eb2d94bb0305bde5.


## Merged-B conformance completed after owner resume, 2026-11-09

The full default command now passes at the exact merged product pin. This closes
F's current merged-B implementation/proof work for L1-arranged review. It is not
final F approval or whole-feature/client acceptance. Final E/S runtime mapping,
fresh Claude discovery and both independent F review seats remain pending.

| Identity | Value |
| --- | --- |
| Branch | feat/task-dag-f-formal |
| Committed F proof source | 71a29afc764e2db32ed109c9314b1a8290460d46 |
| Product Git object | 0f7a19488f15ec1f8d4c4dad14749de7720f17d0 |
| Actual CLI and live health build | 0f7a1948 |
| Actual API contract | 58c0026725f2d846fd4f80bd7cabaff73994d6603d04ed501c82cfa1fa6f1fe9 |
| Delivery | Report-only commit named in terminal notifications and completion.json |

Both pins and coverage maps still describe immutable Git objects at 0f7. No leaf
6486 binary, moving branch, live removed worktree or F-HEAD product binary was
substituted. Installed versions, Git blobs, import resolution and source hashes
were checked. Every isolated product input is restored byte-for-byte. No product
or packages/domain file was added or edited. No checkout, merge, rebase, push,
PR, child/reviewer, native app, signing, Keychain, real database or owner Task was
used. L1 arranges the reviews and integration.

### Actual results and scope

| Command or stage | Actual result | Evidence |
| --- | --- | --- |
| bun .agents/skills/verify-dag-formal/check.mjs, no subset flags | Exit 0 | docs/evidence/dag-formal/resume-default-nTbjKr/default.exit |
| Finite model, 25 safety configs plus clean | All 26 exit 0, all queues empty | docs/evidence/dag-formal/check-bvUuqU |
| Five intended model controls | All intended invariant failures, exit 12 | Same model directory |
| Seven reachability controls | All intended witness violations, exit 12 | Same model directory |
| Full real-import production stage | Exit 0; all 36 controls and final clean | docs/evidence/dag-formal/conformance-KBb0RR |
| Full public/read stage | Exit 0; all 53 controls and final clean | docs/evidence/dag-formal/public-VYqasx |
| VITEST_MAX_WORKERS=1 pnpm check, guarded F-worktree scope | Exit 0 | docs/evidence/dag-formal/f-worktree-check-YZwM7n |

The successful default command is one coherent committed execution. It does
not assemble a pass from the old stopped run or uncommitted calibrations. All
89 source-control executions, 80 distinct variant names because nine lifecycle/
replay controls repeat at the public boundary, compiled successfully, failed the
intended behavioral AssertionError with exit 1, restored exact bytes and reran
clean with exit 0. Bun API build success is recorded directly; it is not an
invented shell compiler exit. No compiler/schema/hash failure, startup failure
or timeout counted as sensitivity. Final full corpora matched after restore.

The public baseline passed 147 actual CLI/HTTP/PTY actions. The committed
31-case B matrix was rerun and passed. These cover true-only filters and false
recovery; Ready/Blocked terminal exclusion; whole-Profile ordering before view
membership; valid stale no-op/no History and malformed/auth boundaries; literal
9/13/14 warning advice/count/refusal and formats/envelopes; per-item batch dry-run
and actual SQL rollback; Delete confirmation and fingerprints that change to
empty; successful-map/forward-reference import and full canonical nested error
witnesses after encoding; full captured refusal responses versus bounded
History; Purge redaction and replay from beginning/checkpoints. Production PTY
proof covers default No, EOF, Yes and the fingerprint race. The final clean CLI,
server and driver were rebuilt and rerun.

The F-worktree check passed 298 domain, 46 CLI, 30 server and 32 Electron tests,
with one existing Electron skip. This is the F checkout at 71a29afc764e2db32ed109c9314b1a8290460d46,
not a claimed monorepo check in the merged 0f7 checkout. Ordinary-worker pnpm
check first exited 1 on the unchanged SOL-5 five-second deadline. The successful
run used Vitest's installed, supported VITEST_MAX_WORKERS=1 setting and the same
assertions and per-test deadline. No product test or B skill was edited.
L1's earlier postmerge pnpm check 0 remains a separate supplied receipt.

### Bounds, source properties and retained model controls

TLC remains tla2tools 1.7.4, verified SHA-256
936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88,
768 MiB heap, one worker, fingerprint 0, seed 26 and 120 seconds per config.
There are no state constraints truncating queues. Typical configs have three
Tasks, one Profile, four statuses, Versions 1 through 4, two CLI/server writers
with one operation each and bounded grouped Revert. The count race uses four
Tasks and degree two. Two-Profile isolation and dedicated 15-Task single-add
13/14 scenarios have separate finite configs. The small race is not a literal
degree-13 race proof. Clean counts are 64 initial, 32,816 generated, 19,784
distinct, depth 27, queue 0. Every config's complete counts, bounds, hashes,
trace and exit are preserved in model-counts.tsv and the model directory.

The five counterexample narratives remain: stale graph validation before Begin
lets serialized opposite-edge writers accept a loop; removing the lock permits
both writers' edge facts to reach durable state; pruning terminal statuses hides
a cycle; omitting the reopen guard accepts a blocker reopen under a done
dependent; split Delete publication exposes edge removal without its lifecycle
History. Each fails the intended safety property with exit 12. No-lock writers
apply edge deltas, not whole stale graph snapshots. Captured refusal evidence
survives rollback independently of a later durable graph. Rejection History may
still be lost before its separate commit. Commit alone publishes private edges,
Tasks, Versions and resolved History together. These are finite safety results,
not liveness, unbounded safety, SQLite-engine or power-loss proofs.

The actual-source corpus passed with seed 260911: 4,165 directed graphs through
four nodes, 572 DAGs, 140,660 status vectors, 709,242 separate weight vectors,
342,838 scalar cases, 2,304,885 cycle pairs and 30,624,590 assertions; plus 256
seeded DAGs through 40 nodes and the 103-edge loop. Oracles use independent
sets, paths and scalar order assertions. Kahn/weighted Kahn respect every edge,
positive all-open lightest equals scalar sorting, pruned energy counts distinct
ancestors and unknown weights, BFS returns shortest closed witnesses across all
statuses, and readiness/shape rules match the current contract.

Independent raw replay passed 93 cases and 186 complete/checkpoint rebuilds,
exhaustive DAGs through three nodes plus 64 seeded DAGs through twelve nodes.
Nineteen lifecycle, surviving-Version, N1, FK, Move/Purge and authenticated
initial-edge cases passed. These concrete paths are outside the TLA+ model.
The B-maintained AtomicCAS one command passed unchanged through the guarded
runtime/preload, with 216 enumerations, 432 replay checks, seven process kills
and two writers. It remains a separate finite single-Task/no-edge proof.

### Current G11/G4, response identity and portable client

Direct queryGraph objects, encoded values and public responses have exactly
eight GraphNode fields. Only the requested root owns strict ancestors and
descendants in whole-Profile topo order, and lightest_next in G4 own-energy
ascending/unknown-last/topo order. The root-500 1,000-chain proves 500 strict
ancestors and 499 strict descendants. Unequal-energy and equal-energy branches,
Ready-root inclusion and terminal-root exclusion passed. A count-only binary
observed three reachable calls on literals and 1,000 nodes; hidden direct-node
fields and discarded per-node closure work each have an intended failing
source control. This makes no total query-time claim; energy bitsets remain.

F independently drove both the committed B chain, SHA-256
9954c8d86f6e9abac1ac3fb46be0ea16a7043297e2815dff32533a4c5de93c8f,
root 90d7ac86-4b7e-4eb6-abb0-f76343e124c2, and its distinct root-500 fixture.
These are current F observations using preserved e717 before and merged 0f7
after binaries, not relabelled B measurements.

| Fixture | Before CLI stdout bytes | After CLI stdout bytes | Before compact bytes | After compact bytes | Current decoded HTTP JSON body bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| root500 | 29035948 | 1078807 | 19643929 | 726753 | 726753 |
| review-root999 | 49255186 | 1206265 | 39853167 | 844214 | 844214 |

CLI, compact re-encoding and actual decoded HTTP body bytes stay separate.
No earlier HTTP size or latency/speedup claim is inferred. Mermaid safe names
map bijectively to typed Task identities, and every stored edge, including
redundancy, renders blocker to dependent. CLI Markdown, schema and Mermaid
wiring, readGraph and both published graph schema versions passed. API OpenAPI
3.1 and normalized Swift OpenAPI 3.0 are deliberately different encodings with
matching graph fields/root sets and contract identities.

The production portable client was constructed once while signed out. Its real
HTTP trace is sign-in 200/no bearer, Profiles 200/current bearer, graph reads
200/current bearer, sign-out 204/current bearer, Profiles 401/no Authorization,
re-sign-in 200/no bearer, Profiles 200/current bearer on the same instance.
Header absence is observed, not inferred from 401. Both freezing the signed-out
value and retaining the revoked bearer fail their intended assertions. Source
mapping covers the production factory, main/task-client and proof callers.
Native/main safeStorage, restoration, Keychain, notifications and final E/S
feature/runtime behavior remain unproven. B's typed Swift 20/no-skip and unsigned
THIN_PASS_NATIVE_BLOCKED receipts are inspected historical evidence only.

### Cleanup, failed attempts and review handoff

The previous successful full proof and F-worktree check contain 151 canonical
compiler-guard receipts, all exit 0. F1 established that these omit the nested
AtomicCAS TypeScript child: the earlier claim that every compiler was guarded
was false. These historical receipts establish only the calls they record. The final separate guard also returned 0,
reporting 97.6 GB free. The final df observation is 97.633673216 GB available.
The owner's resume observation was 148.7 GB. Concurrent activity and APFS sharing
prevent attributing capacity changes to this worker's logical unlinks.

During these successful runs, cleanup retired 136 new actual compiler-runtime
copies, 12,057,877,504 logical bytes; one synthetic owned-copy fixture,
89,159,906 bytes; and 107 superseded owned mutant binaries,
9,651,631,990 bytes. Exact paths, hashes, UID/inodes, completed compiler
snapshots, ps/lsof checks and observed before/after capacity are in cleanup.tsv
and each cited receipt. The protected preexisting/ambiguous/symlink fixtures
remain intentionally. No other unmatched compiler artifact was removed. Every
provenance/source/behavior receipt, cited evidence directory and e717/3cce/0f7
review/current binary group was preserved. No directory or other tree was
pruned. Final audits found all 317 files in the two current candidate manifests
byte-exact and no own cached binary running.

The helper recognizes both finished output and the exact running Bun runtime
hash, excludes its settled wrapper PID from compiler-active checks, and never
follows a temporary symlink. It handles API compilation and CLI build dispatch.
A full-command self-check proves new-file retirement plus preservation of prior,
unmatched and symlink files. No physical low-disk-fill test occurred.

Retained current-resume failures are outer resume-default-I4MePE with model
directory check-eifxl2, actual exit 1 at the old 600-second public ceiling after 12 completed controls;
outer resume-default-X05smG with model directory check-FR6Um8, actual exit 1 at inherited AtomicCAS's first
15-second READY deadline; and F-worktree checks oJ7YRb/loePxN, actual exit 1.
The first F check also exposed the wrapper's Bun build/preload dispatch error.
The timeout's isolated store source was restored from the exact Git blob; its
two retired control binaries have recovery receipts. No survivor PID or compiler
temporary remained from that timeout. An identical guarded AtomicCAS retry
passed at atomic-retry-cneI5u, preserving the original deadline, and the current
full default passed independently. None of those failures became sensitivity.
Only the outer public-stage ceiling changed to 3,600 seconds; behavioral child
limits remain 180 seconds, TLC remains 120 seconds/config, and B's source and
15-second readiness deadline remain unchanged.

Compiler-cleanup probes HPpwu6, Kgokxh, jA4Dfm and z4HYig are separately labelled
calibrations. HPpwu6/cleanup-capacity-clarification.json preserves the correction
that a zero supplied to a resumed aggregate capture was not a capacity
measurement; per-artifact observed values remain available. The old DISK STOP
exit 3 and every f140/e717/3cce result remain unchanged. The coordinator's removal
of 460 earlier F temporaries is its archive record, not this worker's cleanup.

Historical removed-worktree paths resolve through
~/Documents/worktree-cleanup-2026-11-09/todo-cli/ARCHIVE.md.
The archived independent B closure proof-exits file is byte-identical to F's
previously inspected copy. No archived worktree was recreated or verified as a
moving checkout. No direct SEC/PERF/AGENT coordination occurred.

Current receipts:

- docs/evidence/dag-formal/resume-default-nTbjKr/completion.json, actual exits, identities, bounds and hashes;
- docs/evidence/dag-formal/resume-default-nTbjKr/model-counts.tsv, every finite config's counts/depth/queue;
- docs/evidence/dag-formal/resume-default-nTbjKr/source-controls.tsv, all 89 intended behavioral/restore pairs;
- docs/evidence/dag-formal/resume-default-nTbjKr/cleanup.tsv, exact retirement paths and per-action evidence;
- docs/evidence/dag-formal/public-VYqasx/graph-response/build-identity.json and client-auth-sequence.json;
- docs/evidence/dag-formal/f-worktree-check-YZwM7n/pnpm-check.exit and scheduling.txt, F scope and one-worker setting.

Coverage SHA-256: coverage.json 3f590f78a831490fc3e98e72d1931872b766cbc4a8a93b52bf6ceacefea38e48;
public-coverage.json 5f9e3138453c51b2d371d236c3b01fcf061f0212b8afa01764a3b9872dd08986.
No code comments or suppressions were added. The local no-comments audit used
no child, as explicitly ordered. The delivery is documentation only; verifier
code, model, pins and coverage bytes match the committed proof source. Review
seats, fresh Claude discovery and final client/runtime mapping remain gates.


## F1 nested compiler guard closure, 2026-11-09

The initial reviewed delivery was `1d68458b87e787f087c4541646b3e8ff9fb38ea0`,
with proof source `71a29afc764e2db32ed109c9314b1a8290460d46`.
The preload guarded Bun.build but missed AtomicCAS's later bare
`bun --bun node_modules/typescript/bin/tsc -p ...` child. The initial
review's full default 0 therefore did not prove every compiler was guarded.
The old claim in Cleanup, failed attempts and review handoff is corrected above.

The original review report is now at
`docs/evidence/dag-formal/seat1-initial-F1-20261109-b16e5cac/review.md`, SHA-256
`08e0c6aaea02d6b21ea47395b549f84affbc1720d26e33edb625cf2cc6dd737e`.
Its direct results/reproduction and the existing complete archive remain protected
under `docs/evidence/dag-formal/seat1-initial-F1-20261109-b16e5cac`.
The coordinator verified the archive's 3,002 entries and archive SHA-256
`76ea042e65856d869419cd54a1263928ffa81c4ab907de61b84a77ac0bf3219d`; F verified the direct report hash.
No new execution depends on the removed original review worktree.

### Before and after traces

Before edits, F copied the review probe into owned evidence, changing only
runner/evidence destinations. It ran against the unchanged verifier and exited 1:
the nested fake compiler returned 0 and created its entry marker. The direct
wrapper returned 3 and created no marker. No real compiler ran in that probe.
The byte-preserved original probe, provenance, stdout, stderr, exit and result
are under `docs/evidence/dag-formal/f1-closure-5PIxSP`.
The same probe at committed source `0d9145443dc46ec4c6b75decee8be0b133d530ee`
exited 0; both nested and direct cases returned 3 without entry markers.
See `before.exit`, `before.stdout`, `after-committed.exit`,
`after-committed.stdout` and their per-case result receipts there.

F's compile-preload installs a PATH shim only in the AtomicCAS child and its
descendants. The shim calls an absolute host Bun and F's guarded-runtime,
then delegates to the original PATH-resolved executable with the original
arguments and inherited stdio. The manifest records the actual delegate and
shim hash. This avoids recursive shim execution. B's checker, pins, mapping
and product source are unchanged; immutable source/import checks remain active.

The committed default regression installs a synthetic stop after preload
initialization. It proves nested child 3/no marker, direct 3/no marker,
raw asserting parent 1 after child 3, and wrapped asserting parent 3 after
that same raw parent 1. The outer wrapper rereads the shared stop latch after
the parent exits. F's default then handles exit 3 as DISK STOP and starts no
later stage. The regression result is 0, with all four expected refusal traces.
It does not fill disk or count a compiler failure as product sensitivity.
Receipt: `docs/evidence/dag-formal/check-bTuPZy/nested-guard-cntoWH/summary.json`.

A separate positive regression ran the real installed TypeScript compiler
through the shim, with immediate canonical guard 0 and compiler 0. The real
unchanged AtomicCAS command also completed its nested tsc with guard 0 and
child 0. Its command is `bun --bun node_modules/typescript/bin/tsc -p`
followed by the materialized AtomicCAS tsconfig path. The canonical guard time
was `2026-11-09T16:14:27.136Z`; compiler entry was
`2026-11-09T16:14:27.137Z`.
The executable, full argv, immediate guard path and actual child exit are in
`docs/evidence/dag-formal/conformance-OBzB92/runtime-command-17143-1794240868020.json`.

### Complete committed-source rerun

| Command | Actual exit | Evidence |
| --- | --- | --- |
| bun .agents/skills/verify-dag-formal/check.mjs | 0 | `docs/evidence/dag-formal/f1-default-8vDMKq/default.exit`, stdout and stderr |
| VITEST_MAX_WORKERS=1 /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check | 0 | `docs/evidence/dag-formal/f1-worktree-check-1KKiai/pnpm-check.exit`, stdout and stderr |
| Original copied F1 probe before edits | 1, expected failing assertion | `f1-closure-5PIxSP/before.exit` |
| Same probe at committed fix | 0 | `f1-closure-5PIxSP/after-committed.exit` |

The default used no subset flags. All 36 library and 53 public/read source-control
executions compiled successfully, failed the intended behavioral assertion with
exit 1, restored source byte-for-byte and passed with exit 0. The final clean
checks passed. All 317 materialized production input files across the two input
sets match their original hashes after restoration. Public baseline and clean
each completed 147 CLI/HTTP actions; B's literal 31-case input matrix also passed.
The malformed Version-0/no-op boundaries now pass cleanly at merged product 0f7.

The actual-source graph corpus used seed 260911: 4,165 directed graphs through
four nodes, 572 DAGs, 140,660 status cases, 709,242 weight cases, 342,838 scalar
reference cases, 2,304,885 cycle pairs and 30,624,590 assertions. Status and
weight dimensions are separate, not a full Cartesian product. It also ran
256 seeded DAGs through 40 nodes and a 103-edge loop. Independent replay passed
93 cases and 186 beginning/checkpoint rebuilds, including 64 seeded graphs
through 12 nodes. Concrete lifecycle/FK/migration integration passed 19 checks.

The real-source read/public checks reran eight-field direct and encoded/public
GraphNodes, strict root500 ancestors/descendants in a 1,000-Task chain, G4
energy/unknown-last/topo ties, Ready-root inclusion and terminal exclusion,
Mermaid typed identity and whole-Profile ordering before membership. Both
1,000-chain fixtures were independently driven, with exact before/after bytes
in `docs/evidence/dag-formal/public-2WT9xJ/graph-response/result.json`. These are response-size
observations, not latency, HTTP-before or total-query-time claims.
The one-client HTTP credential-getter sequence observed sign-in/Profiles200,
sign-out/Profiles401 with no bearer header, then re-sign-in/Profiles200.

The unchanged finite model ran 25 positive configurations plus a clean recheck,
all exit 0 and empty queues. Five intended model controls exited 12 on Acyclic,
NoReopenUnderDone or AtomicGraphHistory; seven reachability witnesses exited 12
on their intended predicates. The statuses/clean run had 64 initial states,
32,816 generated, 19,784 distinct, depth 27 and queue 0. Default bounds remain
three Tasks, one Profile, CLI/server, four statuses, Versions 1..4 and one
operation per writer followed by bounded Revert. Separate four-Task degree-two,
two-Profile and 15-Task single-add 13/14 configurations remain explicit.
All configurations, states, depths, queues and counterexample outcomes are in
model-counts.tsv. TLC remains tla2tools 1.7.4, SHA-256
`936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`,
768 MiB, one worker, fp 0, seed 26 and 120-second per-configuration limits.
No state constraint or silent truncation was added.
AtomicCAS remains B-maintained, a separate finite one-Task/no-edge proof.

The locked pnpm check covers this F worktree's existing repository tree, not a
new integration-root check. It passed 298 domain, 46 CLI, 30 server and 32
Electron tests, with the existing one Electron skip. It retained three lint
warnings and 17 informational messages. VITEST_MAX_WORKERS=1 was set; original
per-test deadlines were unchanged. No product/domain file was changed or added.

### Guard and cleanup receipts

The current default/check contain 153 flat canonical guard receipts plus six
canonical guard receipts in the nested regression, all actual 0. The separate
synthetic stop traces are expected refusals and are not counted as canonical
low-disk observations. Per-command real nested compiler receipts establish the
previously missing boundary; guard counts alone are not the proof.

Pre-rerun inventory and the 16:20 follow-up inventory removed zero files and zero
bytes. Only current/review baselines and a currently active mutant were present;
the initial prefix-based inventory reported zero runtime temporaries. The exact
order-30 scan corrected that historical category count below. Cited/ambiguous evidence
and all manifests were retained. Exact inventories and available observations:
`docs/evidence/dag-formal/f1-closure-5PIxSP/preflight-cleanup.json` and
`cleanup-order-1620.json` in that directory.

During the completed default and locked check, owned cleanup retired 136 new
actual compiler/runtime copies, 12,057,877,504 logical bytes; one synthetic
owned-copy fixture, 89,159,906 bytes; and 107 superseded own mutant binaries,
9,651,631,990 bytes. Exact paths, hashes, ownership/open-file checks and actions
are in `docs/evidence/dag-formal/f1-default-8vDMKq/cleanup.tsv` and linked per-artifact receipts.
No cited evidence/source/provenance or protected e717/3cce/0f7 baseline was deleted.
Observed free capacity was about 74.7 GB before the run, about 61.5 GB at the
16:20 inventory and 59.536 GB after completion.
APFS sharing and other activity prevent equating these observations with logical
unlinks. L1's separate review archive/removal is excluded from F cleanup totals.

Never signal a process this run did not start. Shared CUA/node_repl helpers are
unowned regardless of cwd. Real open files require skipping a worktree removal
and reporting it; cwd alone does not block removal. F's cleanup only inspects
process/open-file state and retires proven owned artifacts; it signalled no
unowned helper. Future archives keep text evidence, receipts, source/config
inputs and provenance, omit rebuildable binaries/mutant/runtime copies, and
record exclusions with hashes. The existing protected review archive is intact.

Local no-comments/prose/structure audit used the explicit no-child exception:
no added source comments, suppressions, product modules or B skill/pin changes.
Coverage hashes remain `3f590f78a831490fc3e98e72d1931872b766cbc4a8a93b52bf6ceacefea38e48` and
`5f9e3138453c51b2d371d236c3b01fcf061f0212b8afa01764a3b9872dd08986`. This proof covers finite model
safety and the specified merged-B conformance only. It makes no unbounded,
liveness, SQLite-engine, power-loss, native/safeStorage/restoration/Keychain or
notification claim. Final E/S feature/runtime mapping, fresh Claude discovery
and both renewed independent F review seats remain pending. L1 arranges reviews;
F does not self-approve or merge.


### Orders 28 and 29 and current binary inventory

Standing orders 28 and 29 arrived during documentation handoff, after both full
commands had completed. No compile batch was restarted. Before any future batch
compiling more than five binaries, run `df -k /System/Volumes/Data`.
Below 30 GB free, do not start it. Retire only proven owned superseded artifacts,
keep receipts, report observed free capacity to the coordinator and wait. The
immediate canonical hard-floor guard before every compiler remains 10 GB.
Order 28's process-ownership and text-only future archive rules apply as stated
above; no shared helper may be signalled, regardless of cwd.

The immediate inventory covered own .scratch/bin and docs/evidence executable
binary copies without following symlinks. It was sent to both L1 and coordinator.
Counts and logical bytes at that observation:

| Category | Files | Logical bytes |
| --- | ---: | ---: |
| Active/current proof baselines, drivers and compiler probes | 18 | 1,619,970,276 |
| Historical immutable review baselines | 4 | 362,699,528 |
| Other compiled drivers/server/CLI in cited or ambiguous historical evidence | 166 | 14,910,965,492 |
| Historical completed mutant copies, conservatively retained | 2 | 178,749,124 |
| Compiler/runtime temporaries | 0 | 0 |
| Total executable binary copies | 190 | 17,072,384,420 |

The two historical mutant copies are conformance-8GOtar/mutant-bfs-lifo and
conformance-GDiQ1u/mutant-kahn-degrees. They are not current-run leftovers;
citation/ownership ambiguity prevents deletion. Every mutant in this completed
F1 rerun was retired after its behavioral control and exact clean restoration.
Compressed archives are separate, 994,298,712 logical bytes, including the
protected existing L1 review archive. Per-file logical sizes count hard-linked
names separately. Observed filesystem Available was 57,086,968 KiB,
58,457,055,232 bytes. No file was removed by the inventory. Complete paths,
category reasons, inode/device fields and df output are in
`docs/evidence/dag-formal/f1-closure-5PIxSP/inventory-order29.json`.

Standing order 30 also requires a no-symlink find for owned hidden .*.bun-build
files after each compile batch and while no compiler is running. Skip open
files and unproven ownership; record safe removals with paths/hashes/bytes and
separate capacity observations. Never signal unowned/shared helpers. The
completed run has no active compiler, and the exact-pattern find receipt is
under f1-closure-5PIxSP/order30-find-before.txt.

The coordinator subsequently authorized retirement of superseded historical
binaries cited by old receipts, after this documentation-only handoff commit.
Text/source/config/receipts and the 18 current plus four review baselines stay
protected. The post-handoff retirement manifest will be next to inventory-order29.json;
this cleanup does not alter the committed proof source or successful proof receipts.


## Post-handoff authorized historical retirement

The documentation-only F1 handoff was committed first at
`0fe0e8686e5d9fba5ced794d83c1c4f3b091959b`. The coordinator then explicitly
authorized retirement of superseded historical binaries even when an old
receipt cites them. Every old text receipt, source/config and manifest remains
unchanged. Committed proof source `0d9145443dc46ec4c6b75decee8be0b133d530ee`
and the coherent full default 0 / locked check 0 receipts are unchanged.
No compile batch was started for cleanup.

All 168 authorized files were proven to belong to runs before current run9:
166 historical driver/server/CLI/runtime copies plus two historical mutants,
15,089,714,616 logical bytes. No candidate was retained as an ambiguous or
in-use exception. Each row records absolute path, binary SHA-256, size, source
hash and its derivation, citing receipt, owning run and the owning run/receipt
creation times preceding current run9. Runtime identity uses the actual Bun
runtime SHA-256 rather than its old embedded modification timestamp. All paths
were regular owned files with no symlink traversal; identity was checked again
and lsof returned no open-file records before unlink. No process was signalled.
Manifest: `docs/evidence/dag-formal/f1-closure-5PIxSP/historical-binary-retirement.json`.
The complete before-retirement plan is adjacent.

All 18 current proof baselines/drivers/probes and all four historical immutable
review baselines passed the unchanged SHA-256 audit. Current executable binary
holdings are therefore 22 files, 1,982,669,804 logical bytes; remaining completed
mutants 0 and actual compiler/runtime copies 0. Protected archive bytes remain
994,298,712, separate from executable holdings. The existing L1 archive was
neither modified nor attributed to F's cleanup. Post-inventory receipt:
`docs/evidence/dag-formal/f1-closure-5PIxSP/post-retirement-inventory.json`.

The exact order-30 find initially found 28 matching paths. Twelve were old Bun
runtime copies, 1,063,930,368 bytes, already included in the 166 authorized
files and now retired. My initial category inventory had included those twelve
in other compiled drivers and incorrectly reported zero total runtime copies;
the 190-file/17,072,384,420-byte total was correct. The other sixteen matches
are tiny literal text fixtures used by compiler cleanup tests, not generated
runtime copies. They remain protected as source/proof inputs. Current run9
left no real runtime copy behind. Exact find outputs and the category correction:
`docs/evidence/dag-formal/f1-closure-5PIxSP/order30-runtime-retirement.json` and
`order30-find-before.txt` / `order30-find-after.txt` there.

Observed df Available immediately before retirement was 57,429,968 KiB and
immediately after was 68,632,984 KiB. A later post-inventory observation was
68,530,972 KiB. These are filesystem capacity observations, separate from
15,089,714,616 logical bytes unlinked. No capacity reclaim is inferred from
logical size. Every current/cited source/text receipt and protected review item
is retained; only the explicitly authorized rebuildable historical binaries
were removed. Orders 28/29/30 and the immediate hard 10 GB compiler guard remain
binding for the fresh closure review and any later work. Below 30 GB before a
new >5-binary batch, do not start: own safe retirement, report capacity, wait.
Both renewed independent reviews remain pending; L1 arranges them.
