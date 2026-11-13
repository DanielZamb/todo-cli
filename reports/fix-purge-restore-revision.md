# Preview Attachment isolation and final verification

Review 4 accepted this delivery, including its second mapping renewal.
[The later CLI flag report](fix-purge-restore-cli-flags.md) records the separate
R4-C1 correction and audit. Named main rejects public rm --dry-run; the guard
there applies to library previews, as the fourth review clarifies.
The candidate status below describes the earlier submission before acceptance.

B-PREVIEW is corrected on top of `5a85de1adcee2627def2aa5b1ff524a7382d670a`.
The exact approved guard and reusable proofs are commit
`e52f19e4f3bbd60ba5694d6f827f37ac29ec095f`.
The separate two-test deadline change is
`e2ee47daf6e1d93763e9835d9d472ccf831a1f2e`.
The renewed mapping is `2d53dc8c91857f89940224fb788f78ade5241bd3` and remains a candidate until the correctness
seat re-checks it. No amend, push, PR or merge occurred.

The third review closed R1/R2 and accepted the earlier constructor mapping for
product e520abd4 / renewal 41405b03. Those corrections remain unchanged. The
previous report is preserved at 5a85de1a; this report describes the new delta
and corrects its overly broad pending-job observability statement.

## The approved guard

The entire store.ts delta from 5a85de1a is one first statement inside
cleanupAttachmentsSync:

```ts
if (this.isPreview) return;
```

No constructor, transaction, call site, queue producer, or other store statement
changed. It prevents a preview from erasing shared managed files both when it
is constructed with cloned pending jobs and after a simulated Purge queues a
new job. A preview's local Purge state cannot authorize real filesystem work.
Persistent-store cleanup remains active.

## Red and green, using real compiled commands

The standalone compiled preview-preservation-proof driver drives the unchanged
6b167266 CLI and the reviewed 5a85de1a CLI on independent scratch databases.
Both controls exit 1 at the Attachment-tree equality assertion. Their CLI
commands themselves exit 0 with dry_run true and status would_purge; both
leave every logical row unchanged but erase the PNG. Literal expected live
state is Deleted Task `deleted`, Version 2, fixture deletion time, empty
attachment_cleanup and empty durable Purge union. These expectations pass for
the rows and union; the expected present PNG fails on both old binaries.

On the fixed CLI, every dry run keeps that PNG and the entire tree, the exact
Task, all logical rows, the empty queue and the empty union. A subsequent real
Purge exits 0, removes the Task and PNG, and records union `["deleted"]`.
SHA-256 and source provenance for the three CLIs and fixed server are in
`docs/evidence/purge-restore/r4/binaries.json`.

The two behavior regressions also fail on 5a85de1a before the guard, exit 1:

- The existing preview restore case now uses actual simulated Purge cleanup;
  its previous runtime cleanup neutralization was removed. It requires the
  real managed PNG to remain immediately after simulated Purge and restore.
- The new pending-preview case forks while an already-open live store has a
  committed pending job. The fork must retain both PNGs and the live job.
  Opening a persistent store must then erase only the Purged PNG and clear
  its own queue, leaving the keeper PNG.

The final Snapshot cleanup and raw-History behavior suites pass, 25 tests.

## Every preview surface

The Snapshot skill now compiles the CLI preservation proof into its normal
drive. All 17 cases pass with exit 0:

| Preview | Fixture |
| --- | --- |
| parse | A draft Task with a relative date |
| Delete | Active Task with a managed PNG |
| Delete with Dependency preview | A blocker with an incident edge and PNG |
| Purge | Deleted Task at Version 2, managed PNG, empty live queue/union |
| Move and Copy | An image Task moving/copying to Personal |
| batch-edit | A real title change at Version 1 |
| attach-many | A new link on an image Task |
| batch depend and undepend | An absent edge and an existing edge at Version 2 |
| import creation | New external id plus an existing file reference |
| import adoption | Existing Task, from_version 1, new external id/title |
| import close-missing | Existing managed external id omitted from input |
| Profile deletion | Personal with an image Task and --with-tasks |
| Snapshot restore and prune | Existing owner Snapshot |
| detach | Existing managed-image Attachment |

Each command compares every SQLite table's logical rows, including raw
op_log.event text and sqlite_sequence, before and after. It also compares a
hash of the complete Attachment tree: relative paths, file bytes, empty
directories, symlink targets, modes, modification times and change times.
Access times are excluded because the proof itself reads the files.
The receipts retain both tree listings/hashes, both row-set hashes and actual
CLI exits/output. No additional file or row side effect was found in this matrix.

These CLI fixtures start with no live cleanup jobs. Persistent startup cleanup
of already committed Purges is unchanged. The separate pending-preview case
proves that constructing the fork does not consume the live erasure intent or
modify the shared files; the persistent store still drains its own queue.

## Separate Electron deadline commit

Only the final timeout argument of these two tests changed from the runner's
5,000 ms default to 30,000 ms. Assertions, fixture operations and every other
deadline are unchanged. The limit still guards against a hang.

| Test | Previously observed duration | Shared host load |
| --- | --- | --- |
| guarded-run.test.ts: preserves literal argv and exit through direct fake delegates | Worker root 10,101 ms | 10.15 / 7.28 / 5.55, observed around the failure, not sampled per test |
| Same direct fake-delegate test | Seat root 5,990 ms | Launch 3.99, end 12.09 |
| Same direct fake-delegate test | Seat root 5,532 ms | Launch 7.28, end 12.68 |
| xcode-compiler-guards.test.ts: preserves compiler feature discovery, literal arguments, streams and hard3 | Worker root 5,434 ms | Same worker run, 10.15 / 7.28 / 5.55 |

Worker durations are in `docs/evidence/purge-restore/root-check.log`; seat
durations/loads are in its third review. These establish deadline exposure
under shared load, without proving load is the sole cause. Commit 225b512f
used the same 30-second bounded deadline for the server sign-in lockout test,
following the heavy domain fixture precedent. The separate commit message
records each test, duration, load and precedent.

## AtomicCAS renewal

All 45 covered functions/declarations are byte-identical to accepted 5a85de1a,
including constructor and transaction. The nine other covered whole files are
identical. Removing only the approved guard restores the entire baseline
store.ts file exactly. The guard's method is outside the covered list; no
model transition, Init statement, invariant, bound, fixture or crash boundary
changes. The previously accepted constructor statement trace remains valid.

The tracked mapping document lists all 45 declarations with matching before/
after SHA-256 values. Local covered-functions.json also retains their byte
ranges and full-file comparisons. Declaration regions extend to the next
same-level declaration; schemas are values, not functions.

The pre-renewal normal checker passed model, model controls, production,
replay, crash, race, rollback and typecheck stages, then exited 1 only at the
store.ts hash gate (`fv01-check-RyrEuB`). Sensitivity ran in an owned archive of
exactly final product source e2ee47da. Both intended behavioral mutations
exited 1; the byte-restored source passed the same command, exit 0.
Only the mirror received a temporary candidate pin during that proof.

The actual coverage.json then advanced once, changing only confirmedCommit
and the store.ts SHA-256. All other hashes and existing metadata are unchanged.
The final actual-worktree check passed, exit 0 at `fv01-check-X8TCD8`, including
216 enumeration cases, 432 replay checks, seven crash points and competing
writers. The new mapping remains a candidate until the seat re-checks it.
No perf/server-reads source was inspected.

Confirmed product: `e2ee47daf6e1d93763e9835d9d472ccf831a1f2e`.

| Covered file | Current SHA-256 |
| --- | --- |
| store/store.ts | 8dbb9b9ba322c1cb29d41732072792f4c929cea185770f1597d25a393e5787e1 |
| store/projection.ts | dd0d3823bd6b9ecd8868ee0eaacdb8e3438aca1bf944f897cd2092eb137364b9 |
| events.ts | 4d2fe50114ab16e379759bf3bbb4f6416120f323c62b9a5280c04284a597ec44 |
| entities.ts | ee505f78a6434528dbfe5f072463ec77cd6823bab1781f3f656d01c77f2d52f9 |
| ids.ts | c1081994f401f4898f950348587ff4633fd36eb822628ca00d3d215e73defd0f |
| attachments.ts | 7094e663ad7a34dc38de76529a471c6f1b1d9c52c2f29883666b408603e1962e |
| store/dependency-validation.ts | e73b9367e7aa93689a28e5e9e83fd53cac6dcbf949a6c50f0122ac28213ba0d5 |
| store/dependencies.ts | b4e88ed38871bd93483a024b5ca45ba66c441b93f2aeec70ab60c8f97461f411 |
| dependency-rules.ts | 38fbc8c86349775e6eced7404e924ba5a5ab8e5e08616169e378086fe4e5fb11 |
| dependencies.ts | 18b75d53f24ed5a86e6c645d4d2b99766ae8a0786ec32c1c5a33254804a06caa |

## Retained recovery and cleanup guarantees

The full reference inventory remains in
`.agents/skills/verify-snapshots/features/task-references.md`; its new preview
section explains shared-root ownership without changing any row shape.
Only task_tags and task_dependencies declare Task foreign keys in schema 7.
Redaction discovers those through SQLite metadata and repairs them even when
the Task row is already absent. Undeclared references include Attachment jobs
and JSON, Series/Occurrences, History, reminders and checkpoints. Structural
ids in Versions, redacted History and the durable Purge union remain by design.

The final Snapshot recipe again creates a genuinely damaged copy through the
base CLI, observes its restore exit 2, then restores with the fixed CLI twice,
exit 0 each. Literal surviving titles, foreign keys, absent private bytes and
manifest checksum/size/counts pass. Tagged, both-endpoint Dependency and rich
metadata cases pass too. Unexplained orphan, corrupt-checksum and malformed
SQLite refusals remain. Canonical redacted copies remain byte-stable.

R1 still compares raw stored History text and the SQL entity_version before
skipping a write, and raw checkpoint payloads before skipping their writes.
R2 still erases Purged copied bytes in the warm process before restore returns,
using the configured root and guarded per-job transaction, deleting only after
successful erasure. It rechecks durable union membership. Dry-run, refused,
rolled-back and in-memory restores never run that post-commit pass. The eight
warm/fresh, older/newer, pending/drained cases and custom option/environment
roots pass. A Deleted but non-Purged Task comes back alive with its PNG.

A failed warm erasure leaves the job and successful restore report unchanged.
Diagnostics exposes the generic attachment_cleanup table count through
GET /diagnostics, CLI JSON and the terminal top Storage pane. There is no
per-job id, reason, attempt time or warning view. Individual ids require SQLite
inspection. A job does not prove bytes remain: interruption after erasure can
leave a queued row. A fresh CLI can fail during constructor cleanup before it
reaches restore if erasure is still blocked. After repair, another restore,
Purge or startup retries; there is no timer retry or added report field.

## Exits and local receipts

All paths below are under `docs/evidence/purge-restore/r4/`.

| Check | Exit/result | Receipt |
| --- | --- | --- |
| Compiled 6b167266 CLI Purge preview regression | 1, expected missing PNG; actual CLI 0 | red-base.log, red-base/preview-observations.json |
| Compiled 5a85de1a CLI Purge preview regression | 1, same defect; actual CLI 0 | red-head.log, red-head/preview-observations.json |
| Preview and pending-preview behavior tests on 5a85de1a | 1, both fail on PNG presence | red-preview-tests.log |
| Fixed cleanup/raw-History behavior tests | 0, 25 passed | green-domain.log |
| Additional Snapshot/Purge, Attachment and Dependency behavior checks | 0, 37 passed | focused.log |
| Domain typecheck | 0 | typecheck-final.log |
| verify-snapshots | 0, including all 17 compiled previews | snapshots.log, snapshots/previews/preview-result.json |
| Genuine old-copy repair twice | 0 | snapshots/purge-cli-result.json, snapshots/purge-cli-actions.json |
| Immediate cleanup, preview guards and custom roots | 0 | snapshots/cleanup-guards.json, snapshots/cleanup-recovery.json |
| Raw History and checksum stability | 0 | snapshots/raw-history.json, snapshots/redaction-stability.json |
| verify-attachments | 0 | attachments.log, attachments/result.json |
| verify-dag | 0 | dag.log, dag/result.json |
| Pre-renewal formal command | 1, source hash only | atomic-pre-renew.log |
| Sensitivity helper | 0; mutants 1/1, restored 0 | atomic-sensitivity/sensitivity-vWORMz/result.json |
| Final formal command | 0 | atomic-final.log |
| Exact locked root check | 0, first attempt | root.log, root.exit |

The root command is exactly `sh scripts/disk-guard.sh` once, then
`/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`. It passed 418 domain,
69 CLI, 32 server and 168 Electron tests, with one existing skip. Both adjusted
fake-guard tests passed. No retry was needed. Launch load before waiting on the
shared lock was 10.95 / 8.32 / 8.69; end load was 7.60 / 9.02 / 8.96.
Contract id remains `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`.

## Main applicability and hygiene

The shared runtime patch still applies to origin/main
`72a5413d647ba624903b01aa0721e221f95c77ec`. It includes the previous three-file
recovery port, main's raw entity_version normalization, configured root argument
and the new preview guard. Both explicit git apply --check and actual application
on a clean owned main archive exit 0, followed by inspection of the resulting
source. It excludes DAG-specific formatting. The entire branch is not a direct
cherry-pick onto main; this is the shared runtime port.

Main needs the guard plus its own reviewed mapping renewal and final confirmed
product commit, alongside that rest of the shared patch. Main's current store
pin is bb3f0f0855c3bd5128b8d5f4c164734d13a04250ad7dfe32eacc18cf3ac69a60;
the combined isolated port produces
0e982c1b1faf09d6921579d2863b889cc68a3059468c007e9e93e18da2db858c.
The branch's pin cannot be copied. Main needs its own Init trace, sensitivity,
AtomicCAS and full compatibility checks. This run proves applicability, not a
main build or full main verification. main-shared.patch and main-apply.json
retain the exact patch and checks.

The first applicability harness ran git apply from a nested archive, which
skipped paths. The source assertion caught that before any success claim.
The corrected invocation uses an explicit absolute --directory and checks the
actual output. No product file changed during that harness correction.

All data, images and processes are scratch-owned. Recipe servers/streams and
crash children exited. Seventeen closed own Bun build files, 1,507,234,688 bytes, were
removed after lsof checks. The standalone probe executable, three CLI fixture
directories and both source archives were removed after preserving text receipts
and review inputs. Source-hash CLI/server caches remain reusable. Final free
disk was 43,760,456 KiB, above the 30 GiB floor; cleanup-final.json retains it. No real Todo directory,
Todo.app, native build, Keychain, signing, installed CLI, unrelated process,
Python workaround, push, PR, merge or agent child was used.
