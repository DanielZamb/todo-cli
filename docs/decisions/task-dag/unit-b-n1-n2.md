# Unit B first checkpoint

Branch: feat/task-dag-b-commands, based on integration 9f2ec0fb798dfbb7fa7cd1ccd666cbabbb1a7d89.
This checkpoint contains N1/N2 only. Public DAG features remain pending.

N1 separates dependencySchemaSql from dependencyMigrationSql. Projection creation
uses DDL only. Migration 0007 still advances user_version inside migrate's existing
transaction. The compiled regression failed before the change, exit 1, observing
7 where literal 1 was required. The corrected driver exits 0 and proves the
legacy migration chain, migrated Tasks, schema 0003 through 0007, the version-1
pre-migration Snapshot, concurrent migrations from 2 through 5, and saved rows.

N2 leaves defensive live edge cleanup in Purge unchanged. A scratch SQLite AFTER
DELETE trigger records actual edge deletion effects. Delete must record exactly
B/A for endpoint A, and B/A plus C/B for endpoint B. The real Purge must add no
rows. This fails at Delete if cleanup is broken, before Purge could hide it.
The audit connection closes in finally. Full and checkpoint replay and saved
Snapshot redaction still pass.

## Verification

All evidence is under
/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-b-commands/docs/evidence/task-dag/unit-b/n1-n2.

| Proof | Actual exit | Evidence relative to that directory |
| --- | --- | --- |
| Compiled migration regression before fix | 1 | before.log |
| Compiled migration regression after fix | 0 | after-final/result.json |
| Compiled verify-dag, including Purge SQLite effects | 0 | dag-final/exit-code.txt, commands.log and result.json |
| Compiled verify-op-log, replay and Purge | 0 | op-log/commands.log and result.json |
| Compiled CLI/HTTP import and migration/transfer regressions | 0 | import/commands.log, migrations/result.json |
| AtomicCAS real-code sensitivity | 0 overall; mutants 1, 1; restored 0 | sensitivity.log |

AtomicCAS evidence is
/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-b-commands/docs/evidence/fv01/sensitivity-9hc8Tj.
DAG-A-MAPPING.md reviews the projection change and preserves the bounded
single-Task/no-edge claim. The sensitivity proof restores product bytes before
the clean command. No graph proof is inferred from AtomicCAS.

Local no-comments audit found no added handwritten source comments, suppressions
or constraint comments. Zero deletions or restorations; no child launched.
Structure review keeps migration version ownership in migrate and schema
recreation in createProjection. No new domain file or dependency version.
No native app, signing, Keychain, installed binary, real Todo directory or owner
Task was used. No push, merge, rebase, PR or checkout switch.

`pnpm check` exits 0 at this checkpoint. check-clean.log is the clean rerun
after sensitivity restored the store bytes. The compiled CLI and server are
retained in .scratch/bin/todo-n1-n2 and todo-server-n1-n2. The first build used
integration HEAD plus the reviewed N1 source diff; final B binaries will be
rebuilt at the final source commit with full provenance.
