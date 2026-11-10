## Current integrated mapping

Immutable product `7d947f917d1895df45c78f9f9df31638a9f3f2b8` includes both DAG clients, the two-part Delete/batch contract amendment and main PR #12 at `2c488fc72fe264741d5d8db8f90b441bf426af32`. The contract is `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`. Core graph and AtomicCAS source is unchanged. Pre-renewal compiled mutation, matcher, cache and Discovery controls passed with exact restores. The complete default passed at verifier `8807892be25f26b188930e54eac213000b078a39` against immutable product `7d947f917d1895df45c78f9f9df31638a9f3f2b8`: all 36 library and 53 public controls, G11 and guarded AtomicCAS. Integrated client, cache, search, Discovery, protocol and unsigned proofs are recorded in the integration report, with their actual source identities. Grouped independent seats, the owner native session and fresh Claude discovery remain pending. Finite bounds and manual-mapping limits are unchanged.

Historical F1 implementation closure: full default and locked F-worktree check exited 0 at committed verifier 0d9145443dc46ec4c6b75decee8be0b133d530ee, product 0f7a19488f15ec1f8d4c4dad14749de7720f17d0. The nested compiler shim, post-parent stop-latch propagation, fake-child refusal traces and real AtomicCAS tsc guard0/child0 are proven in docs/evidence/dag-formal/f1-default-8vDMKq/f1-completion.json. All 36 library and 53 public controls and final clean passed. Renewed independent reviews, final E/S runtime and fresh Claude discovery remain pending.

F1 compiler-guard closure supersedes the earlier universal guard claim. AtomicCAS remains unchanged at the merged pin. F installs a child-local Bun PATH shim from compile-preload.mjs, preserves the actual executable/arguments/stdio and checks the shared stop latch after the parent exits. nested-guard-check.mjs proves post-preload refusal, raw assertion1 versus outer3, direct refusal and a separate real nested TypeScript compile. production-check.mjs also requires the actual AtomicCAS nested tsc command, immediate canonical guard0 and child0 receipt. The committed full closure result is recorded in the current unit-f-report.md; earlier behavioral receipts remain historical.

Latest completed merged-B checkpoint: default one command exited 0 at F proof source 71a29afc764e2db32ed109c9314b1a8290460d46, product 0f7a19488f15ec1f8d4c4dad14749de7720f17d0. All 36 library and 53 public/read source-control executions passed sensitivity and exact clean restore. Receipt: docs/evidence/dag-formal/resume-default-nTbjKr/completion.json. F-worktree VITEST_MAX_WORKERS=1 pnpm check exited 0 with unchanged per-test deadlines; default-worker timing failures are retained. Final E/S runtime mapping, fresh Claude discovery and independent F review seats remain pending.

Historical active pin: 0f7a19488f15ec1f8d4c4dad14749de7720f17d0. Functions and whole-file hashes were reviewed against immutable Git blobs. The next committed full run must establish actual merged-source conformance. G11 root ancestors/descendants use whole-Profile topo; lightest_next uses own energy, unknown last, then topo. Portable client auth uses a per-request getter and one client across sign-in, sign-out and re-sign-in. Native/main safeStorage/restoration/Keychain/notifications and final E/S mapping remain unproven. Historical sections below retain their candidate scope.

# Mapping to committed production code

The first historical product checkpoint was
`f140c7b09bcb1db48ce4ccaee797ecfe60019ce4`. coverage.json pins the reviewed
whole-file SHA-256 values and named functions. Both checkers read Git objects,
never another worker's working tree. Each production run materializes unchanged
committed packages/domain files as ignored verification inputs. It is not a
checkout and contains no Git directory. Imports outside those inputs or installed
node_modules fail compilation. @todo/domain aliases resolve explicitly to the
candidate package exports. Dependency manifests must match this worktree, and
installed production package versions must match those manifests.

The baseline model was proved at a91dcf8917e242bce6c0f3521a1b2727114d0ef7.
One refinement follows production resolveRevertSync: expected Versions come from
the original event's after Versions, rather than a fresh observation. A second
accepted change on that dependent therefore makes Revert reject. No invariant
was weakened. The original 25 safety configs and five model controls remain;
an extra reachability control proves stale Revert refusal is reachable.

## Transaction and model refinement

| Model action/property | Candidate source | Reviewed relationship and concrete checks |
| --- | --- | --- |
| Resolve | commands/input handoff, store.resolveRevertSync | Pre-Begin observations can be stale. Revert uses the recorded after Version. Public edge no-op boundary policy remains pending final B commands. |
| Begin, lock | store/store.ts OperationStore.transaction | Synchronous db.transaction(...).immediate() precedes validation. Nested calls retain the outer writer transaction. SQLite serialization is an assumption; the unchanged candidate DAG drive also runs opposite-edge processes. |
| ValidateVersions | OperationStore.validate; store/dependency-validation.ts validateDependencies | Whole primary before-Task CAS remains; auxiliary dependents require current payload/task_versions equality and exactly +1. Primary ids cannot repeat in auxiliary versions. Generated replay and groupedDelete assert exact surviving Versions. |
| ValidateGraphAndStatus | dependency-rules.ts and validateDependencies | Proposed removals precede all additions; sorted BFS follows all stored statuses, with no depth cap. Reopen of done or cancelled blockers under done dependents fails. Profile/visibility and degree checks run inside the writer lock. |
| Record | OperationStore.record/appendSync; events.ts | One resolved event, using its actual entity_version, is private until commit. Lifecycle v2 requires dependencies. Old v1 forbids that field. Initial-edge creation is one v2 event at Version 1. |
| ApplyEdges/Tasks/WriteVersions | projection.ts changes/applyChanges/applyEvent; store/dependencies.ts | Remove edges before removing/moving endpoints, insert endpoints before added edges. Compact event Profile comes from the envelope. Apply only resolved Version facts. Raw replay corpus checks edges, Tasks and task_versions. |
| Commit/Crash | OperationStore.transaction | Transaction return publishes History and projection atomically. TLA+ explores private stages/crashes. Candidate AtomicCAS repeats seven compiled process-kill boundaries. Neither proves SQLite or power-loss durability. |
| RejectBegin/Record/Commit | appendSync catch; recordRejection | DependencyRefusal carries the captured witness out of rollback. recordRejection uses that supplied value, bounds History details, and returns the full witness separately. It never reruns graph validation. Concrete rejectedEvidence checks full response versus bounded History; the changed-graph gap remains a model trace. |
| OneEventPerDelete | appendSync incidentRemoval; events.ts TaskDeleted v2 | Legacy Delete resolves all incident edges under the lock into one v2 event. Auxiliary versions exclude the primary and deduplicate dependents. GroupedDelete, fan-in model, N2 SQLite audit and exact replay cover this mapping. |
| Grouped Revert | resolveRevertSync/revertSync | Invert edge facts, retain recorded affected Versions, then authoritative validation on the complete current proposed graph. Accepted inverse is one TaskReverted v2. Stale, cycle and reopen refusals are concrete candidate cases as well as modeled safety. |
| AtomicGraphHistory | rebuild, takeSnapshot, projection Snapshot | Rebuild drops child edges first. Checkpoints have optional edges and retain entity_version 1. Facts replay without current graph validation or clocks. 93 independent issued-input cases compare sorted raw SQL and complete Tasks in both replay modes. |
| Move/Purge | store.move, store/purge.ts, snapshots.ts | Outside TLA+. Unchanged candidate fixtures assert cleanup before endpoint moves, zero Purge edge-delete effects after Delete, redaction of either endpoint and rejection witnesses, surviving Versions, checkpoints and owner Snapshot restore. |
| Migration N1 | projection.createProjection, store/0007.ts, migration.ts | Projection recreation uses DDL-only dependencySchemaSql; migrate alone owns user_version. The candidate migration executable tests legacy 1 and concurrent starts 2..5, saved rows/schema, one pre-migration Snapshot and final version 7. |
| Authenticated initial edges | auth/auth.ts startSeries, StartSeriesRequest, store.startSeriesSync | Parsed facts include depends_on and are forwarded with authenticated actor/time. AuthenticatedInitial checks valid/missing/foreign/self/reused endpoints, Version 1, one v2 event, unchanged rejected projection, and no successor inheritance. |

The model's full before/after maps, pre-state and writer/epoch are ghost audit
data. Compact production events do not store whole graph snapshots. Replay uses
only edge deltas, taskIds and resolved Versions. edgeVersionIds excludes
lifecycle taskIds. Task content outside status/visibility is abstracted. Initial
Task creation, Move, Purge, checkpoints, auth and filesystem protocols are
concrete tests, not added TLA+ transitions. Bounded witness truncation is not
modeled; RejectionWitness describes the full captured validation facts.

## Generated production properties

All algorithm calls import the candidate modules. Independent expected values
use exhaustive permutations, simple paths and set traversal, never a second call
to the implementation being checked. Full input specifications, random graph
inputs, source hashes and result counts survive in evidence.

| Property | Real imports | Independent oracle and sensitivity |
| --- | --- | --- |
| Normal and weighted Kahn order | graph-order.ts topologicalOrder | Every edge's blocker precedes dependent, all nodes occur once; normal small-graph order equals the first valid id permutation. All-open positive weighted order equals scalar set-sum sorting. Broken degree counts and weighted keys fail behavior. |
| Comparator ties | compareGraphTasks and TaskHeap | Priority, due with missing last, created time, id; 24 fixtures and pairwise comparisons. Each tie component has its own broken-source control. |
| Distinct pruned energy/unweighted | graph-energy.ts graphEnergy | Independent stack/set traversal through unresolved nodes, including root; terminals stop traversal; null contributes unweighted and remains traversable. Diamond 1/2/3/4 totals 10. XOR union, terminal pruning, null traversal and missing mask controls fail. |
| Set membership/lightest_next | contains, lightestNext | Every root/id membership checked. Ready members include the root, sorted by own known energy then whole-Profile topological position. Broken membership, omitted root and wrong next-energy key fail. |
| Shortest BFS and loop | shortestUpstreamPath, dependencyCycle via indexGraph | Enumerate small simple upstream paths, sort by length and sorted-adjacency tie. Compare exact rotated arrow loop, self-cycle and a 103-edge chain. All directed graphs through four nodes and status vectors are included. LIFO, depth cap, reversed arrow and missing self guard fail. |
| Ready/Blocked | dependencyState | Direct blockers checked independently, terminal Tasks neither. Both terminal predicates have failing controls. A status-pruned index separately fails whole-Profile ordering. |
| Shape/component | graphShape/queryGraph | Connected components, n-1 tree rule, single/chain precedence and converging/diverging/mixed orientation. Separate count, orientation, precedence and component mutants fail. Other query fields/formatting receive the candidate's existing literal drive, not a new exhaustive F claim. |
| Count and advice | checkDependencyAddition/dependencyAdvice | Literal 9/13 accepted, 14 refused with count/limit and exact text. Broken boundary and advice fail. The additive many_dependencies public response remains pending B. |
| Raw replay | OperationStore, projection and Snapshot | All DAGs through three nodes plus 64 seeded DAGs through twelve nodes, alternating compact versus initial-edge events. Compare issued edges and literal computed Versions before/after both rebuilds. Omitted start/checkpoint edges and Version application fail. |
| Lifecycle integration | unchanged candidate dag-proof.ts plus F FK/N1 assertions | Delete, Move, Purge witness redaction, authenticated forwarding, recorded Revert Versions and N1 each have a behaviorally failing isolated real-source control. |

Status vectors and weight vectors are separate exhaustive dimensions, not their
full Cartesian product. Seeded graphs have 1..40 nodes and shared ancestors,
with mixed statuses/missing weights plus an all-open positive-weight variant.
The long cycle uses 104 nodes. graph-corpus.json retains exact random inputs,
seed and exhaustive recipes; clean corpus bytes must match after mutations.

## Pending final integration

The committed candidate has graph algorithms and storage, not final public DAG
commands. True-only CLI/HTTP filters, actual many_dependencies response warnings,
format/schema/error envelopes, confirmation/fingerprints, batch/import/export
surfaces, final client/runtime mapping and fresh Claude discovery remain pending.
Do not infer whole-feature L2/L3 or unbounded safety from this checkpoint.
AtomicCAS maintenance belongs to B; F executes its unchanged candidate command
and records that result without editing its skill or pins.

## e717 public continuation and G11 hold

public-coverage.json is a separate reviewed mapping at
`e7170510a376b51eaf3525bb9933cb0dd588b233`; production-pin.json/coverage.json
retain the f140 algorithm checkpoint. Do not replace the historical receipts.
The public pin materializes domain, API, CLI and server Git objects into owned
ignored inputs. Package manifests and every installed dependency version must
match before compilation. Workspace exports resolve to those immutable inputs.
Cached binaries retain their exact source-hash, loaded-module and binary-hash
receipts; changed source gets a distinct binary under this worktree's scratch.

[Public coverage](features/public.md) maps each assertion to its concrete
command and source mutation. TaskCommands.change checks deletion fingerprint
under auth.mutate's writer transaction. DependencyCommands.change validates
input and authorization before recognizing no-ops, and reads the graph under
the lock. executeBatch forks for dry-run and uses one command transaction per
item. executeImport resolves external ids against actual successful Tasks in
its writer transaction. ImportRow's sole details shape preserves both
current_version and nested DependencyError during HTTP encoding. TaskCommands.result
and cliResult forward the full captured refusal while recordRejection keeps
bounded durable details. Purge redacts rejected witnesses and preserves edge
facts for exact replay. No refusal assertion substitutes a later durable graph.

TaskFilters/filterTaskRecords uses the whole-Profile graph before view and
filter membership. dependencyState, graphEnergy, topologicalOrder and
checkDependencyAddition are byte-identical to the f140 reviewed source; all
four hashes are verified again at e717. Store changes since f140 add full
witness propagation to recordRejection and Move's rejection return. Transaction,
projection, snapshot and dependency-Version ownership remain as mapped above.
Retained replay/integration controls run against these exact e717 inputs.

The default public command intentionally fails the malformed CLI Version-0
property at e717. It returns exit 1/runtime_error instead of exit 2/invalid_args.
This is a product finding, deduplicated by L1 into B's combined fix round.
It is not converted into a pass or counted as a sensitivity control.

G11 at ca142014 supersedes per-node graph closures and the prior response
lightest_next ordering. No new final mapping is claimed for GraphNode,
GraphReport, queryGraph/readGraph, Mermaid identity, CLI graph Markdown,
OpenAPI/Swift or clients. The unexecuted root-response fixture specifies the
literal 1,000-node assertion for a later explicit corrected candidate. B's
unknown-energy tie key is expressly unchanged and outside this amendment.

## Merged-source hold and corrected references

The owner now requires final B conformance at L1's exact merged integration SHA,
after the held B closure passes and B merges. Leaf6486b347 is not pinned. The
preparation pins retain the last inspected3cceb41e and set awaitMergedIntegration.
All full product/compiler entry points return awaiting-merged-source before any
compile while that flag is true. Model-only checks remain separate.

The coordinator withdrew all-three-topo G11 ordering. Ancestors and descendants
remain whole-Profile topo. Root lightest_next is own energy ascending, unknown
last, then whole-Profile topo position. The graph-order remaining-energy ranking
key is unchanged. root-response-fixture.mjs now encodes the corrected order.

At3cce the CLI input boundary calibration passed17 cases across depend, undepend,
add, graph, batch-depend, rm and Revert, plus four missing/I/O classifications
and stale no-ops. Seven actual-source controls passed intended behavior/restore
checks with14 per-compiler guard receipts. Model preparation also passed. These
receipts are not a committed merged-source proof.

The expanded graph-response-properties.ts, response-mutants.mjs and client-mutants.mjs
are prepared but uncompiled/unproven. They cover direct hidden fields, separate
count-only reachability observation, root500 strict sets, next energy/unknown/tie
order, raw/encoded/public schemas, Mermaid identity and a real portable client
with a request-time credential getter. The client uses one instance across
sign-in/sign-out and observes forwarded Authorization headers. No native Electron
module is imported. B's31-case matrix rerun path is prepared but not executed.

compile-safety.mjs gates each actual compiler and retires only idle owned mutation
cache binaries while preserving manifests. compile-preload.mjs wraps nested
AtomicCAS builds without editing B's skill. disk-safety-self-check.mjs tests an
injected prior-stop sentinel and exact scratch restoration; it is not a physical
disk observation. Expanded full-path and nested-preload behavior still need the
merged-source run. Do not clear a source/hash/compiler gate to make a run pass.

## Main rebase qualification

Immutable product 8ee1c08fb92201691dc3b0bcd5fe3cd03560eb3a incorporates main9de89345. All16 core coverage files are byte-identical to the prior reviewed0f7 product. The existing finite model and its assumptions are unchanged. Selected algorithm/replay and public baseline stages qualify this rebase; their results must be reported separately from historical full sensitivity.

The public integration preserves SEC search work budgets, generator yields and interruption cleanup. TaskSearchExecution remains argument4 and TaskGraph is argument5. TaskCommands.list/readTasks preserve typed search failures; the CLI maps typed SearchTooBroad to usage2. The search dialog retains main's validation/focus while preserving true-only readiness through the draft boundary. Generated OpenAPI and Swift files are regenerated, not hand-merged. Fresh independent conflict-resolution reviews precede client merges.
