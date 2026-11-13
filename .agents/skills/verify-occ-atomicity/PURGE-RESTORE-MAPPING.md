# Purge restore source mapping

Product source: `e520abd4f23862e71c8df2376b57cd878b8219a6`. Baseline: `e99d146ca8062fe71d9862f94403e94491a902c4`. The correctness seat accepted this constructor renewal at 5a85de1a.

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

## Preview cleanup guard renewal candidate

Final product source: `e2ee47daf6e1d93763e9835d9d472ccf831a1f2e`. Accepted baseline: `5a85de1adcee2627def2aa5b1ff524a7382d670a`. The only store.ts delta is the approved first statement of cleanupAttachmentsSync, `if (this.isPreview) return;`. It is outside the covered list. All 45 covered functions, including constructor and transaction, are byte-identical. Removing only that line restores the entire baseline store.ts file exactly; nine other whole files are identical. No model transition, Init statement, invariant, bound, fixture or crash boundary changes. The earlier constructor trace and acceptance still apply.

The following SHA-256 values hash each exact declaration region through the next declaration at the same level, before and after. Schema values are declarations rather than function bodies. The complete byte ranges, both hashes and whole-file comparison are in local `docs/evidence/purge-restore/r4/covered-functions.json`.

| Covered file | Function/declaration, byte-identical | SHA-256 before and after |
| --- | --- | --- |
| `packages/domain/src/store/store.ts` | `OperationStore.constructor` | `1b80001fe535b38dc635fe75e0b387fcb73d8d2b4883279ed2cfcc5b67679463` |
| `packages/domain/src/store/store.ts` | `OperationStore.transaction` | `2d180d81b4cd58d917cfd5516a74809070c856e3f899d2022cc6a37f2c2a9ac4` |
| `packages/domain/src/store/store.ts` | `OperationStore.record` | `17e0f7d9e8f2cd448f28bcc6652a10ccb149dd18b3333e1b989346cf21825ab7` |
| `packages/domain/src/store/store.ts` | `OperationStore.recordRejection` | `f4451159996a47567fcd2cb3f353901b18bfcae06a7d3d221b862a124365e49f` |
| `packages/domain/src/store/store.ts` | `OperationStore.validate` | `44bd31ec46d7609c7cfefe0b6542a7da9c7ebc52a03c2030085920b32cb57ffe` |
| `packages/domain/src/store/store.ts` | `OperationStore.appendSync` | `0d03e81034c9e6b53dd00ac0a1e2a93a784080a5566d5bc8b9cef2a13552e305` |
| `packages/domain/src/store/store.ts` | `OperationStore.append` | `81581c42bd5c3a67d4fead74aa52de20551d78a7083f9adbaee3a381d6d9e3d3` |
| `packages/domain/src/store/store.ts` | `OperationStore.historySync` | `09fb760f98f2842fd771ad043c1360e36fc9c03a703fead830f9bd6ff4fb0f94` |
| `packages/domain/src/store/store.ts` | `OperationStore.takeSnapshot` | `20245f26c5c805cdf2d04383de3238d854776e81169cbe7a3d6b97d2cdc97678` |
| `packages/domain/src/store/store.ts` | `OperationStore.rebuild` | `663a9e17d796aecb01321cb1c151fad5045c78c91d3ca5eb893add89bc65ba61` |
| `packages/domain/src/store/projection.ts` | `changes` | `b75ae51f9725a1f4e18b34fb3323ef4493a16750a3c047ee161dd49969f045e7` |
| `packages/domain/src/store/projection.ts` | `applyEvent` | `f17a6f4792bf970de03b2a5889403c54c670aefa0d6ee98102001ea6dc333863` |
| `packages/domain/src/store/projection.ts` | `applyChanges` | `d0df09f2ea686af9707d8792961516f4b5ca9d1fe219831275aaec0f7a0956de` |
| `packages/domain/src/store/projection.ts` | `putTask` | `00e3b63055db11868b36bce196f64bbd49b5a6de96f3504a1183cfb73bd9a064` |
| `packages/domain/src/store/projection.ts` | `readTasks` | `3c93e68eaa452aee97c75921b8f88e496492a53dc5a20aeab9e7a0ed903ed657` |
| `packages/domain/src/store/projection.ts` | `Snapshot` | `e479048e46d5678dcd75d15d9b2e4d5d8d1058113f293cdd686ad50c752cd7c1` |
| `packages/domain/src/store/projection.ts` | `snapshot` | `c6a57f1b6754eba6a8ea4d66b2cfcf4dfa8a105185ad2357b638a59e1c4901d1` |
| `packages/domain/src/events.ts` | `TaskCreated` | `b3e2ea8f941f9dabe4204601343794461cba5cf6217f0064cab8cc011d79fe4d` |
| `packages/domain/src/events.ts` | `TaskEdited` | `84ea134528f3e58125189f6b0d205966489eac71bc4e8d5289458a0675b79d15` |
| `packages/domain/src/events.ts` | `AttachmentAdded` | `6878bf4f07fa7b4fdecf6a8a1b764e7aecbf8d3eda7830ce62598c8ea0a7ad34` |
| `packages/domain/src/events.ts` | `TaskDeleted` | `7f96a0055e80b62c4e7c5ee3f48bc96ea3573123f01300cf89ce149a4eebde99` |
| `packages/domain/src/events.ts` | `TaskAttemptRejected` | `68d2e0054590535e04393d1af1c18b034c45894660cb64a04c4ebc7c502c88da` |
| `packages/domain/src/events.ts` | `Event` | `e051c4268f2735de0bceb9c803914e7d626d4d35eb0d4f5fa8e0927849cdc060` |
| `packages/domain/src/events.ts` | `OpLogEntry` | `9cce7d4b657fbba177251c2efcf9d801b443b254ba970bc577d90bdf94bb5aae` |
| `packages/domain/src/entities.ts` | `Task` | `55d34b349a44e8046c1a6b81e4a744660532ca1f66f16798018e432b4f79c66e` |
| `packages/domain/src/entities.ts` | `Profile` | `dd704573e00fe54e31c562dbd844f9a0f0079ecdda47172b690cd45341562285` |
| `packages/domain/src/ids.ts` | `ActorId` | `7f3f59f968881253291b0b59a9241822d50489dad49b855164334060e5ff6129` |
| `packages/domain/src/ids.ts` | `ProfileId` | `14ae010ec2ccc27b2b726419f7bfeac4dc30439ea8c84518046b6c63274bd207` |
| `packages/domain/src/ids.ts` | `TaskId` | `5e98ea7fd2ad5ac99ad93ebe87844c9483ed3b8baef844182a1a46386a558fad` |
| `packages/domain/src/ids.ts` | `Version` | `fd7aa5d1bbc786ac80d6fae0ce48cf5fa405cf3bd2ed4ee323384670b22c726d` |
| `packages/domain/src/attachments.ts` | `Attachment` | `a230e8c12e9a1e4ab685c9ffe6c088bf943054688cb489882927731b8abeee9f` |
| `packages/domain/src/attachments.ts` | `validAttachmentLocation` | `c5a343748147eae6ac9050f63daac2f7ce23b773e828a85dc2130bdbf35f562c` |
| `packages/domain/src/store/dependency-validation.ts` | `validateDependencies` | `b799ef82a29692bd9108ba2e131bf55fb89e20332f019f37894eaca874a6d5bc` |
| `packages/domain/src/store/dependencies.ts` | `applyDependencyVersions` | `295c5fc494914d1ddccebdcfed15c3866866183f9393a457e95c2c49ef68a086` |
| `packages/domain/src/store/dependencies.ts` | `incidentRemoval` | `9fcbc2a9910f4b633c3b667394ef784399c71f3ae70f3e3cda377667f474608a` |
| `packages/domain/src/store/dependencies.ts` | `upstream` | `1d5e3373e9b337cfbb4fd173368a7fb4bcea82eae88cc5009a876fb2573bef88` |
| `packages/domain/src/store/dependencies.ts` | `hasDependents` | `77455a08a3317ba4c32681e335456636483ddd0ab1e6f39bc50155c6fbaccbc0` |
| `packages/domain/src/dependency-rules.ts` | `checkDependencyAddition` | `f23d7db6caaca9c5aa2d68ceb12d64c174b0e1abad49b2aae5f4056e504f06cd` |
| `packages/domain/src/dependency-rules.ts` | `checkDependencyStatuses` | `0bd92b37dda2af37dff4a22d9c4d379c91863135590fe24e139277ccf69be602` |
| `packages/domain/src/dependency-rules.ts` | `dependencyCycle` | `230f303acd69196971cbc83be8651a98cc7a1b51e28963ac51e3eb549770b825` |
| `packages/domain/src/dependencies.ts` | `Edge` | `f6c120bef55cdd4010b3646b7e5965a1a3bfa093f3857394b564fbd653aa30cd` |
| `packages/domain/src/dependencies.ts` | `VersionChange` | `8065304e5bb13363f621a472063c197ca5e440656aa834f9b0b57e92cbee581a` |
| `packages/domain/src/dependencies.ts` | `DependencyChanges` | `c983acd1e43419ebece65b99430b74579256ac6d2d65bc4dabe1296cec946d72` |
| `packages/domain/src/dependencies.ts` | `DependencyError` | `da76576855c0ebcb7948441426d0f7484b53836035c9c2cbabf8aeaf6e398dba` |
| `packages/domain/src/dependencies.ts` | `RejectionDetails` | `529459d0c8e4b7c5359ff8aa1bd66fd00453b4aed7bed94a91a88f69503a6f55` |

The pre-renewal normal check at `fv01-check-RyrEuB` passed its model, controls, production enumeration, replay, crash/race/rollback and typecheck stages, then failed only the one-file store.ts hash gate (exit 1). Sensitivity in an owned archive of this exact final source rejected both behavioral mutants (exit 1 each), restored the source byte-for-byte, and passed the restored command (exit 0). Only that mirror had a temporary candidate hash. The parent pin remained unchanged until these receipts completed. Text receipts are under `docs/evidence/purge-restore/r4/atomic-sensitivity/`.

Only confirmedCommit and the store.ts whole-file hash advance once in the actual mapping. All nine other hashes and metadata remain unchanged. The final normal check is recorded in the report. This new renewal is a candidate until the correctness seat re-checks it. Snapshot/filesystem behavior remains outside AtomicCAS; the expanded compiled Snapshot and Attachment drives cover it.

The final actual-worktree command passed with exit 0 at `fv01-check-X8TCD8`. Model and production stages passed, including 216 enumeration cases, 432 replay checks, seven crash points and the race/rollback controls. Isolated sensitivity is `sensitivity-vWORMz`: both mutants 1, restored command 0, both restorations exact. The only renewed whole-file hash is store.ts `8dbb9b9ba322c1cb29d41732072792f4c929cea185770f1597d25a393e5787e1`. This preview renewal still awaits the seat.
