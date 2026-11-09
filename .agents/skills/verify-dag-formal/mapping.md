# Mapping to committed production code

The confirmed product candidate is
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
