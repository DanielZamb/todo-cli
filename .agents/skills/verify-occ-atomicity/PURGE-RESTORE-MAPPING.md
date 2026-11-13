# Purge restore constructor mapping candidate

Product source: `e520abd4f23862e71c8df2376b57cd878b8219a6`. Baseline: `e99d146ca8062fe71d9862f94403e94491a902c4`. This candidate awaits the correctness seat.

Only the approved fifth argument, `this.attachmentRoot`, changes in store.ts. The value is assigned before new Snapshots. Snapshots stores the value without executing SQL. The constructor remains mapped only to Init. No model transition, invariant, bound, crash boundary or fixture changes.

The same scratch database is reset from one seed for both constructions. The Version-1 Task seed hash is `fd68adcacf2ab99704d59ef4abae846ce20a1caa47ac795d886138ca7e4c9157`. Ten executed public SQLite statements and both immediate transaction entry/commit observations match exactly. `constructor-before.json`, `constructor-final.json` and `constructor-comparison.json` under `docs/evidence/purge-restore/r3/` retain the actual traces and bindings. This is a public SQL execution trace, not native SQLite internal tracing.

`covered-functions.json` records exact whole-file comparison for nine files. In store.ts, removing only the approved constructor argument produces byte-for-byte equality with the baseline. The approved insertion lies inside the constructor, so all other listed function bodies are unchanged.

| Covered file | Function | Review |
| --- | --- | --- |
| `packages/domain/src/store/store.ts` | `OperationStore.constructor` | Approved one-argument constructor change, Init trace identical |
| `packages/domain/src/store/store.ts` | `OperationStore.transaction` | Byte-identical |
| `packages/domain/src/store/store.ts` | `OperationStore.record` | Byte-identical |
| `packages/domain/src/store/store.ts` | `OperationStore.recordRejection` | Byte-identical |
| `packages/domain/src/store/store.ts` | `OperationStore.validate` | Byte-identical |
| `packages/domain/src/store/store.ts` | `OperationStore.appendSync` | Byte-identical |
| `packages/domain/src/store/store.ts` | `OperationStore.append` | Byte-identical |
| `packages/domain/src/store/store.ts` | `OperationStore.historySync` | Byte-identical |
| `packages/domain/src/store/store.ts` | `OperationStore.takeSnapshot` | Byte-identical |
| `packages/domain/src/store/store.ts` | `OperationStore.rebuild` | Byte-identical |
| `packages/domain/src/store/projection.ts` | `changes` | Byte-identical |
| `packages/domain/src/store/projection.ts` | `applyEvent` | Byte-identical |
| `packages/domain/src/store/projection.ts` | `applyChanges` | Byte-identical |
| `packages/domain/src/store/projection.ts` | `putTask` | Byte-identical |
| `packages/domain/src/store/projection.ts` | `readTasks` | Byte-identical |
| `packages/domain/src/store/projection.ts` | `Snapshot` | Byte-identical |
| `packages/domain/src/store/projection.ts` | `snapshot` | Byte-identical |
| `packages/domain/src/events.ts` | `TaskCreated` | Byte-identical |
| `packages/domain/src/events.ts` | `TaskEdited` | Byte-identical |
| `packages/domain/src/events.ts` | `AttachmentAdded` | Byte-identical |
| `packages/domain/src/events.ts` | `TaskDeleted` | Byte-identical |
| `packages/domain/src/events.ts` | `TaskAttemptRejected` | Byte-identical |
| `packages/domain/src/events.ts` | `Event` | Byte-identical |
| `packages/domain/src/events.ts` | `OpLogEntry` | Byte-identical |
| `packages/domain/src/entities.ts` | `Task` | Byte-identical |
| `packages/domain/src/entities.ts` | `Profile` | Byte-identical |
| `packages/domain/src/ids.ts` | `ActorId` | Byte-identical |
| `packages/domain/src/ids.ts` | `ProfileId` | Byte-identical |
| `packages/domain/src/ids.ts` | `TaskId` | Byte-identical |
| `packages/domain/src/ids.ts` | `Version` | Byte-identical |
| `packages/domain/src/attachments.ts` | `Attachment` | Byte-identical |
| `packages/domain/src/attachments.ts` | `validAttachmentLocation` | Byte-identical |
| `packages/domain/src/store/dependency-validation.ts` | `validateDependencies` | Byte-identical |
| `packages/domain/src/store/dependencies.ts` | `applyDependencyVersions` | Byte-identical |
| `packages/domain/src/store/dependencies.ts` | `incidentRemoval` | Byte-identical |
| `packages/domain/src/store/dependencies.ts` | `upstream` | Byte-identical |
| `packages/domain/src/store/dependencies.ts` | `hasDependents` | Byte-identical |
| `packages/domain/src/dependency-rules.ts` | `checkDependencyAddition` | Byte-identical |
| `packages/domain/src/dependency-rules.ts` | `checkDependencyStatuses` | Byte-identical |
| `packages/domain/src/dependency-rules.ts` | `dependencyCycle` | Byte-identical |
| `packages/domain/src/dependencies.ts` | `Edge` | Byte-identical |
| `packages/domain/src/dependencies.ts` | `VersionChange` | Byte-identical |
| `packages/domain/src/dependencies.ts` | `DependencyChanges` | Byte-identical |
| `packages/domain/src/dependencies.ts` | `DependencyError` | Byte-identical |
| `packages/domain/src/dependencies.ts` | `RejectionDetails` | Byte-identical |

The pre-renewal one-command check completed the model and production cases, then refused the store.ts hash change alone. Sensitivity ran in an owned archive of this exact source. Only that scratch mirror received a temporary candidate store hash so its normal helper could run. Both real-code mutations failed the intended behavioral assertions with exit 1. The restored source passed the same command with exit 0. The parent worktree mapping was untouched until these receipts completed.

Receipts are local under `docs/evidence/purge-restore/r3/atomic-sensitivity/`. The final normal check runs in the actual worktree after renewal. Only store.ts SHA-256 and confirmedCommit advance. Other hashes and existing metadata remain unchanged. The prior coverage review text is historical; this document records the constructor delta.

Snapshot restore and filesystem cleanup remain outside the AtomicCAS model. The Snapshot, Attachment and Dependency skills cover their revised behavior.

The final normal command passed in the actual worktree at
`docs/evidence/fv01/fv01-check-5BpvSK/`, with model and production exits 0.
The pre-renewal command at `fv01-check-D6Cc04` failed only its one-file drift
gate after those stages passed. The isolated sensitivity receipt is
`docs/evidence/purge-restore/r3/atomic-sensitivity/sensitivity-ByTuWH/result.json`:
both mutants exit 1, restored command exits 0, source restored byte-for-byte.
