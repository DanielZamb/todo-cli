# Unit A storage and replay

Status: implemented and locally proven; awaiting the two review seats arranged
by DAG-L1. Branch `feat/task-dag-a-storage`. Proven implementation head:
`96c0f3ea19dcab207d1d06a66d333a80d78c2f36`.
The report and final mapping receipt are a documentation-only descendant;
the terminal handoff names that delivery head separately. All product code and
compiled CLI/server provenance bind the implementation head above.

Migration 0007 adds the guarded WITHOUT ROWID edge table, composite endpoint
foreign keys and reverse covering index. The existing automatic pre-migration
owner Snapshot remains before migration. Compact Dependency events advance only
the dependent. Lifecycle v2 deltas, optional checkpoint edges, full/checkpoint
replay, grouped Delete, Move, Profile deletion, initial Occurrences, Revert and
Purge preserve exact edges and surviving Versions. Old v1 events/checkpoints
remain readable. Revert validates its complete proposed graph under the writer
lock and inverts deltas without replacing adjacency. Purge recognizes either
endpoint and Task content inside rejection witnesses, including owner Snapshots.
No owner database was accessed.

## Proof receipts

Every path below is absolute. A compiled library drive is identified as such;
it does not establish CLI/HTTP graph commands or client feature parity.

| Check and proof level | Actual exit | Evidence |
| --- | --- | --- |
| `pnpm check`, L1 repository behavior/type/lint/contract checks | 0 | /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-a-storage/docs/evidence/task-dag/unit-a/pnpm-check-final.log |
| Focused @effect/vitest, 18 literal DAG cases, L1 | 0 | /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-a-storage/docs/evidence/task-dag/unit-a/dag-tests.log |
| `verify-dag/scripts/verify.sh`, compiled library, scratch SQLite and opposite-edge processes | 0; race children 0, 0 | /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-a-storage/docs/evidence/task-dag/unit-a/final-dag |
| Extended `verify-op-log/scripts/verify.sh`, compiled library including exact edge replay and grouped Delete | 0 | /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-a-storage/docs/evidence/task-dag/unit-a/final-op-log |
| `verify-recurrence/scripts/verify.sh`, compiled library regression | 0 | /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-a-storage/docs/evidence/task-dag/unit-a/final-recurrence |
| `verify-occ-atomicity/check.ts`, bounded model and compiled production driver | 0 | /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-a-storage/docs/evidence/fv01/fv01-check-RnA0vB |
| `verify-occ-atomicity/prove-sensitivity.ts`, real-code mutations | 0 overall; broken variants 1, 1; restored 0 | /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-a-storage/docs/evidence/fv01/sensitivity-Srqe4N |
| OpenAPI/Swift regeneration through `swift-slot.sh` | 0 | /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-a-storage/docs/evidence/task-dag/unit-a/generate-api-final.log |
| Electron production SSE/IPC decoder literals, L1 | 0 | /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-a-storage/docs/evidence/task-dag/unit-a/electron-protocol.log |
| `verify-history-unions.sh` through Swift slot, bounded L2 HTTP/SSE compatibility observation | 0 | /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-a-storage/docs/evidence/task-dag/unit-a/final-history-unions |

The last drive observes AuthChanged and DependencyAdded/Removed on real scratch
SSE, decodes observed frames with Electron's production ChangeEvent schema and
round-trips generated Swift History/SSE. GeneratedContractTests passes all 18
cases with live scratch HTTP and no skips. Literal fixtures also cover all four
lifecycle v2 shapes through both client decoding paths. Existing client handlers
refresh after ordinary committed operations; no Dependency UI was added.
cleanup.json records the owned server's teardown exit 130 and curl's SIGTERM.
Both recorded PIDs were confirmed gone. No other server was stopped.

AtomicCAS renews inherited drift from ed4e2423 to the supplied 8745cdd base
separately from this unit. DAG-A-MAPPING.md reviews every changed covered
function, including baseline Attachment input limits and rejection bounds.
The clean run checks 86,631 generated / 37,036 distinct states, depth 15,
queue 0, model controls exiting 12, 216 concrete cases, 432 replay checks,
seven process-kill boundaries and competing writers. It remains a single-Task,
no-edge bounded proof. F's DagAcyclic files were not edited.

## Added domain files and handoff

Logic additions under packages/domain/src:

- `dependencies.ts`: Edge, VersionChange, DependencyChanges, DependencyError and bounded rejection schemas.
- `dependency-rules.ts`: shared endpoint, degree, status and deterministic shortest upstream BFS cycle checks.
- `store/0007.ts`: additive migration statements.
- `store/dependencies.ts`: edge projection reads/writes, incident cleanup and dependent Version application.
- `store/dependency-validation.ts`: authoritative validation of resolved deltas and the proposed graph.

Other added packages/domain files are `scripts/dag-proof.ts`,
`scripts/verify-dag.ts` and `test/dag.test.ts`. Every addition followed a search
of the existing domain modules. The new verify-dag skill has a feature map,
executable helper and resolving relative .claude link. Its full recipe passed
and retained evidence after cleanup. Fresh Claude-session discovery is unproven.

B consumes exported schemas and dependency-rules functions, plus
`OperationStore.dependencies()` and `graph(profile)` for a consistent read.
`changes(event, profile)` resolves compact events. AppendResult carries a full
captured dependency_error separately from bounded History details through the
store and authenticated ports. `reject` accepts dependency_error for B's
captured refusal evidence. StartSeries accepts optional depends_on and resolves
initial edges atomically at Version 1; successors inherit none.

## Review and limits

Local no-comments audit found no added handwritten source comments or
suppressions; no comment deletions/restorations, extra reviewer or child thread.
Independent audit remains with seat 1. Server/core and post-implementation
reviews found the Unit A responsibilities complete and composable: schemas,
projection, invariant rules and transaction validation each have one owner.
Adapters contain no graph policy. The resolved-event API intentionally remains
below B's public command layer.

DAG-L1/coordinator explicitly extended A to generated contract alignment and
minimal protocol compatibility proof. Swift normalization now groups equal
kinds only when required entity_version constants prove variants disjoint;
its seven transformation tests pass. Generated output was regenerated, never
hand-merged. Electron's only production compatibility edit adds two History
labels. No dependency version or lockfile changed.

Public graph commands, confirmation/fingerprint flows, warnings, public
edge-Revert target routing, filters, algorithms and client controls remain B/E/S
work. No new no-op event exists; B must return unchanged without appending.
Whole-feature L2/L3 parity, native UI, signing, Keychain, renderer and unbounded
formal safety are not claimed. No push, rebase, merge, PR or checkout change.
