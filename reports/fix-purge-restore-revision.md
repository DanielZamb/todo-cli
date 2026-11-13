# Purge and Snapshot restore revision

The revision fixes F1, B1, B3 and B2 from the correctness review of
`6449a5903e38cac173aaedcd0bc4ac9c25aa1285`. Product and verification source is
committed at `f7d188d0d79d42c62dc869329d6424757f89bca1`, directly on top of that
head. This report is a separate commit. The correctness seat's re-check remains.

## Pending erasure survives restore

F1 treated `attachment_cleanup` as a disposable Task relation. Its rows are
content-free erasure intents. Stored Snapshot redaction now preserves them.

For B1, restore combines pending jobs from the live database and staged copy.
The stage retains only jobs whose Task ids belong to the durable Purge union.
The same transaction replaces database content and commits the resulting queue.
The existing cleanup pass then drains those jobs, including on the next store
open. Restore does not discard the last intent before erasure succeeds.
Repeating a restore or cleanup is safe when the image is already absent.

The compiled proof derives from the seat's two-connection crash probe. A parent
store stays open while a second process commits a Purge and exits exactly 73
at its post-commit cleanup boundary. The parent takes a newer Snapshot while
both the pending job and PNG still exist. Eight cases cover these combinations:

| Restore process | Snapshot | Cleanup before restore |
| --- | --- | --- |
| Warm | Before Purge | Pending |
| Warm | After Purge | Pending |
| Fresh | Before Purge | Pending |
| Fresh | After Purge | Pending |
| Warm | Before Purge | Drained |
| Warm | After Purge | Drained |
| Fresh | Before Purge | Drained |
| Fresh | After Purge | Drained |

After the existing cleanup pass, every case has an empty queue and no Purged
PNG. Each case restores the same Snapshot again and repeats those assertions.
Each also restores a Deleted Task alive with the literal title
`Deleted but recoverable`. Its PNG remains, despite a synthetic pending job for
that non-Purged Task before restore. Only Purge ids can carry erasure across
restore. `cleanup-recovery.json` records the exact queues, Tasks and byte checks.

## Malformed copies report validation errors

For B3, SQLite's `SQLITE_NOTADB` and `SQLITE_CORRUPT` errors during original-copy
inspection become `invalid_snapshot`. A checksum-matching file containing
`not a SQLite file` now exits 2 through the compiled CLI. The behavior test
compares every live table before and after refusal and requires no safety
Snapshot. The CLI also checks the literal surviving Task list.

## Repeated redaction keeps its checksum

For B2, redaction skips equal History and replay-checkpoint writes. It drops
immutable-update triggers only when an update is required. The function still
scans and deletes Task references when the Task itself is absent, so old damaged
copies remain repairable. It reports actual row changes to Snapshot redaction.

When neither redaction nor migration changes a copy, and its manifest still
matches schema version, size and counts, Snapshot redaction skips compaction
and manifest replacement. The compiled proof compares the actual file hash
with its manifest after three repeated applications. All four hashes are equal,
and sizes and literal zero-Task counts agree. `redaction-stability.json` records
the hashes. The original foreign-key diagnostic and checksum-mismatch refusal
remain covered.

## Verification receipts

All paths below are relative to `docs/evidence/purge-restore/revision/`.
Evidence is local and ignored by Git.

| Check | Exit | Receipt |
| --- | --- | --- |
| Current behavior tests against unchanged 6449a590 production files | 1, 8 failed and 7 passed | `red-6449-final.log`, `red-6449-final.exit` |
| Compiled 6449a590 malformed-copy control | Restore 1 with runtime error, keeper preserved | `red-cli-malformed.json` |
| Focused Snapshot, cleanup, Attachment and Dependency tests | 0, 59 passed | `green-final-focused.log` |
| Revised verify-snapshots recipe with the compiled pre-fix 6b167266 CLI | 0 | `snapshots.log`, `snapshots/commands.log` |
| Compiled cleanup matrix and checksum stability | 0 | `snapshots/cleanup-recovery.json`, `snapshots/redaction-stability.json` |
| Compiled malformed-copy refusal | 2 with invalid_snapshot | `snapshots/actions.json`, `snapshots/result.json` |
| Genuine old tagged-copy repair, twice | 0 | `snapshots/purge-cli-actions.json`, `snapshots/purge-cli-result.json` |
| verify-attachments | 0 | `attachments.log`, `attachments/cleanup.json` |
| verify-dag, including both Purge endpoints and restore | 0 | `dag.log`, `dag/result.json` |
| Domain typecheck | 0 | `typecheck-final.log` |
| Documentation links | 0 | `doc-links-final.log` |
| Standing-order-27 root check | 0, first revision run | `root-check.log`, `root-check.exit` |

The root command was exactly `sh scripts/disk-guard.sh`, followed by
`/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`. It passed 402 domain,
69 CLI, 32 server and 168 Electron tests, with one existing skip. No existing
deadline changed. Launch load was 5.92, 8.14 and 7.67.

The red tests use the unchanged `snapshots.ts` and `purge.ts` from 6449a590.
The fixed files were restored before the green run. Both warm pre-Purge and
warm post-Purge cases fail on the old head because the PNG survives restart.
The updated pending-job expectation, malformed-copy classification and actual
checksum stability also fail there.

All ten files pinned by verify-occ-atomicity are byte-identical to 6449a590
and match their pinned hashes. `covered-file-hashes.json` retains the comparisons.
No covered function required a change. The contract id remains
`78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`.

## Main applicability and delivery

The shared production patch applies to `origin/main` at
`72a5413d647ba624903b01aa0721e221f95c77ec`. The port omits DAG-only checkpoint
edge formatting and preserves main's existing operation-log update statement.
Both `git apply --check` and actual application pass. The ported `snapshots.ts`
is byte-identical to this revision. `main-shared-final.patch` is the complete
net patch from main, and `main-apply.json` records the checks. This establishes
patch applicability, not a full main build or verification run.

The reference inventory and architecture now identify the cleanup queue as
durable erasure intent. The Snapshot skill compiles and drives the new probes.
New files under `packages/domain` are `scripts/snapshot-cleanup-proof.ts` and
`test/snapshot-cleanup.test.ts`. No production module or dependency was added.
The explicit no-children instruction excludes a delegated comment review.
No comments or suppressions were added to the source.

Every database, image and process was scratch-owned. Recipe servers and streams
exited, and all crash children exited 73. Cleanup removed five closed Bun build
temporaries totaling 443,304,320 bytes after checking lsof, plus the temporary
source copies and standalone probe inputs. `cleanup.json` records those removals.
Compiled caches remain for the re-check, with source and binary hashes in
`binaries.json`. Final available disk was 89,252,784 KiB, above the soft floor.
No real Todo directory, native app, Keychain, signing, push, PR, merge or agent
child was used.
