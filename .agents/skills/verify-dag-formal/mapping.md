# Reviewed mapping and pending refinement

The confirmed base is 8745cdd0247fb8cc0ff74f95bff257fd95cfa4d3.
coverage.json records exact whole-file SHA-256 values. Model and config hashes
are recorded independently for every run. At this base, the graph rules are
approved design, not implemented production behavior. There is no claimed
machine-checked refinement from TypeScript to this TLA+ model.

| Model action or invariant | Reviewed source or binding design | Status |
| --- | --- | --- |
| Resolve | ADR-0016 and task-dag-phase-0.md, stale expected Versions | Design mapped; A/B command handoff pending |
| Begin, lock | OperationStore.transaction in packages/domain/src/store/store.ts, synchronous db.transaction(...).immediate() | Existing implementation inspected |
| ValidateVersions | OperationStore.validate, current Task/full-before comparison and task_versions + 1 | Existing single-Task mechanism inspected; grouped affected-Version refinement pending A |
| Boundary/edge no-op | Phase 0, authorization/input shape/visible same-Profile endpoints before unchanged | Design only; CLI/API and malformed/auth concrete proof pending B |
| ValidateGraphAndStatus | ADR-0016, all-status acyclicity, done blockers, reopening cancelled blockers | Design only; dependency-rules.ts and append validation pending A |
| Record | OperationStore.record/appendSync inserts op_log inside transaction | Existing implementation inspected; new resolved schemas pending A |
| ApplyEdges | ADR-0018 and draft migration-0007.sql | Design only; store/dependencies.ts and FK order pending A |
| ApplyTasks, WriteVersions | projection.ts applyChanges/putTask writes tasks payload before task_versions | Existing implementation inspected; compact delta application pending A |
| Commit | Successful return from OperationStore.transaction.immediate | Atomic commit assumed from SQLite; finite ordering modeled |
| RejectBegin/Record/Commit | recordRejection opens separate transaction after appendSync rollback | Existing ordering inspected; captured DependencyError handoff pending A |
| Crash | Transaction interruption rolls back uncommitted SQL; crash can lose rejection | Model assumption plus separate AtomicCAS compiled crash checks |
| AtomicGraphHistory | Phase 0 resolved facts in changes/applyChanges/rebuild and checkpoint edges | Graph refinement pending A; replay in model has no clocks or revalidation |
| OneEventPerDelete | TaskDeleted v2 dependencies shape in contract.schema.json; ADR-0018 | All incident removals, unique writer/epoch event, each dependent bump once; production pending A |
| Grouped Revert | Phase 0 inverse edge deltas, current graph checks, whole inverse atomically | Production store revertSync mapping pending A |
| RejectionWitness | Phase 0 captured validation graph, bounded rejected History details | Model stores capture separately from future durable graph; production pending A |
| Move/Purge | Phase 0, ADR-0008/0018, remove before endpoint move and preserve structural facts | Explicitly outside model; concrete FK/rebuild/checkpoint/redaction tests pending A/B |

A's interface checkpoint names Edge, VersionChange, DependencyChanges,
emptyDependencies, DependencyError, dependencyCycle, shortestUpstreamPath,
checkDependencyAddition and checkDependencyStatuses. OperationStore.dependencies
and graph expose edges, with graph using one consistent read transaction.
changes(event, profile) uses the envelope Profile for compact events. These are
reported interfaces only until A provides a committed proof SHA. Do not advance
the mapping on typecheck success alone.

## Generated-input obligations after A/B

No generated production check is implemented or claimed at this checkpoint.
Use real imports, never a hand-copy of the algorithm being checked. The scalar
or brute-force oracle is independent expected behavior. Adapt to committed APIs.

| Property | Required corpus and oracle | Sensitivity obligation |
| --- | --- | --- |
| Kahn topo and lightest | All directed graphs through four nodes, retain DAGs; every blocker precedes dependent in both orders; whole graph before filtering, including cancelled Task with open blocker | Break edge processing in scratch real source and observe a behavioral assertion |
| All-open weighted lightest | Positive weights, compare Kahn result to scalar sum/tie reference sorting | Break remaining-energy key in real source |
| Distinct pruned energy | Status/weight subsets as affordable, missing energy, shared ancestors; brute-force ancestor set through unresolved nodes; literal 1,2,3,4 diamond totals 10 | Break distinct union and terminal pruning separately |
| Shortest cycle BFS | Real dependencyCycle and shortestUpstreamPath; small brute-force simple paths, deterministic loop validity, 101-plus-edge chain, statuses never prune cycles | Break traversal depth/status/shortest choice; no compile/hash failures accepted |
| Replay | Exact sorted task_dependencies before/after rebuild from beginning and checkpoint; grouped lifecycle, Move/Purge FK integration | Omit real edge delta/checkpoint application and catch differing rows |
| Corrected read behavior | Ready/Blocked exclude terminals; true-only CLI/HTTP filters; inclusive lightest_next; n-1 tree with orientation; literal 9/13/14 | Each property must catch a broken real variant |

Record a fixed seed and exact exhaustive/random case counts. Add seeded DAGs
through 40 nodes with shared ancestors. Compile drivers against production
imports, use scratch SQLite, retain corpus/provenance/exit codes. Restore every
scratch source change byte-for-byte in finally and rerun clean. Final client
mapping, response identity and runtime behavior require integration evidence.

The event pre-state, full before/after Task maps and writer/epoch are ghost
audit data for transition invariants. They are not a claim that compact
production events store the whole graph. Replay uses only added/removed edges,
taskIds and resolved Version facts. edgeVersionIds excludes taskIds, so a
lifecycle primary is never duplicated in the auxiliary dependent Version set.
