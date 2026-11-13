# Reject labels on detach

This is the separate follow-up to `65fe3d848a4fb1d471aa55d6225415ef2f58bcff`.
The coordinator accepted the complete 64-pair mutation-factory correction and
approved this neighbouring-factory fix. Both commits await the seat together.
No store.ts, production domain/server source or pin changes are needed.

## The registration and mapping

The entire production diff is two lines in attachmentCommand in main.ts.
Label is registered only when detach is false. The existing mapping checks
input.label for undefined before inspecting its Option. Attach still receives
its optional label; detach cannot accept a flag it never reads. The separate
label-attachment command is byte-identical to the parent.

Effect CLI now rejects detach --label with exit 2 before entering the handler.
It uses the existing invalid_args error, validation-or-usage exit meaning,
Markdown help/error split and single JSON error object. No late flag check,
new preview, error field or contract id was added.

## Compiled controls

Both the compiled 65fe3d84 parent and 6b167266 base reproduce the defect in
Markdown and JSON: exit 0, Attachment removed, Task Version 2 becomes 3. The
changed tables are exactly tasks, task_versions, op_log and sqlite_sequence.
The external file remains. Each new regression drive exits 1 on the required
literal Version-2/preserved-Attachment expectation. The focused new test also
fails against the parent before the production fix.

On the fixed compiled CLI both formats exit 2. Every table's serialized row
bytes and the complete SQLite checksum stay equal. The Task remains Version 2
with the original Attachment and label. The external file retains its exact
bytes, checksum, size, mode, modification time and change time.

Four cold controls cover md/JSON with and without --dry-run. They have no
credential or database and target Never Created. Each rejects the label flag
without creating the database, authenticating, prompting or writing a Profile.
The ordinary first-run marker is seeded before these observations.

Positive controls pass on both baselines and the new source. Attach retains
Original label at Version 2. label-attachment retains Renamed label at Version
3 and clears the label when omitted at Version 4. Plain detach then succeeds
at Version 5 with an empty Attachment list. The external file's literal text
remains `literal external file` followed by a newline.

The proof is reusable in apps/cli/scripts/detach-label-proof.ts and the normal
CLI test suite. The Attachment recipe also invokes it against its actual
compiled CLI in nested scratch HOMEs. It shares the existing read-only table
capture helper; that helper changes only by adding export.

## Help, schemas and compatibility exceptions

The reviewed golden is derived from the parent compiled help capture by
removing only the --label line in detach's FLAGS section. Only detach's flag
set/help hash changes. All 54 command/help/error response schemas and all other
help hashes stay equal. Schema documents describe responses, not CLI flags;
Attachment labels remain valid response data. The audit now has 802 accepted
command/flag pairs: 800 with consumers and two intentional exceptions.

| Command | Flag | Exact help text and ruling |
| --- | --- | --- |
| init | --username | `--username <name> (default unset, compatibility flag)`. Retained unchanged. |
| login | --username | `--username <name> (default unset, compatibility flag)`. Retained unchanged. |

Neither username is newly read or rejected. The coordinator explicitly kept
these documented compatibility no-ops under the single-owner model. Their
exact help text is also beside each exception in the flag contract and in the
consumer trace. The audit refuses any future detach --label registration.

## Intentional compatibility change for scripts

Scripts that supplied --force to edit, done, cancel or reopen previously ran
the normal command if its domain checks passed. These commands now reject
--force with exit 2 before any mutation. This is intentional and differs from
older DAG builds and named main, which accept and ignore that flag. Those
scripts must remove --force. It continues to mean Purge only on rm.

| Command | Flag | Before | After |
| --- | --- | --- | --- |
| edit | --force | Accepted; normal edit runs | Usage error, exit 2; no mutation |
| done | --force | Accepted; normal completion runs | Usage error, exit 2; no mutation |
| cancel | --force | Accepted; normal cancellation runs | Usage error, exit 2; no mutation |
| reopen | --force | Accepted; normal reopen runs | Usage error, exit 2; no mutation |

The same table is in the flag contract for owner-facing build notes. This
commit does not change that already-ruled behavior. The public DAG assertion
from 65fe3d84 remains: done --force is invalid_args; plain blocked done is blocked.

## Verification and receipts

All paths below are under docs/evidence/purge-restore/r6/.

| Check | Exit/result | Receipt |
| --- | --- | --- |
| Compiled parent negative control | 1; actual commands 0 with Version 3 and no Attachment | red-65fe3d84.log, red-65fe3d84/detach-label.json |
| Compiled 6b167266 negative control | 1; same writes | red-6b167266.log, red-6b167266/detach-label.json |
| New focused test before fix | 1 | red-test.log |
| Four final flag-contract tests | 0 | green-tests.log |
| CLI typecheck | 0 | typecheck.log |
| verify-attachments normal recipe with new boundary drive | 0 | attachments.log, attachments/detach-label/detach-label.json |
| verify-attachments CLI01 recipe | 0 | attachments-cli01.log, attachments-cli01/result.json |
| Attachment domain checks | 0, 12 passed | attachment-domain.log |
| First verify-cli recipe | 1, one unchanged expired-credential assertion | verify-cli/commands.log |
| Unchanged auth-history focused recheck | 0, 12 passed | auth-recheck.log |
| Final verify-cli recipe | 0, 73 passed | verify-cli-final/commands.log |
| Exact locked root check after authorized resume | 0, first attempt | root.log, root.exit |

The first CLI recipe expected an expired HTTP credential rejection detail but
observed invalid_credential. Authentication source and that assertion are
unchanged. A focused recheck passed all 12 cases without modification. The
coordinator confirmed this is the cleanup race the Diagnostics seat reproduced
on unchanged code and recorded as a follow-up Task. This worker preserved the
failure and passing unchanged reruns; it did not instrument that interleaving. No auth fix,
assertion relaxation or deadline change is included. Final recipe and root
exits below must be read alongside the preserved initial failure.

Root command: sh scripts/disk-guard.sh once, then
`/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`.
The first handoff stopped below the then-required 30 GiB soft floor, preserving
the uncommitted follow-up. The coordinator then explicitly changed this worker
to a 22 GiB soft floor and parked other units except the Mac candidate gates.
The repository guard remains unchanged at 10 GB. The resumed root run uses the
normal checkout environment, with no cached-binary overrides or compiler wrapper.
It passed on the first resumed attempt: 418 domain, 73 CLI, 32 server and
168 Electron tests, with one existing skip. No assertion or deadline changed
to obtain that pass. Launch load was 3.20 / 8.11 / 9.07; end load is retained
in root-end-load.txt.

## Covered source and cleanup

| Covered file | Unchanged SHA-256 |
| --- | --- |
| packages/domain/src/store/store.ts | 8dbb9b9ba322c1cb29d41732072792f4c929cea185770f1597d25a393e5787e1 |
| packages/domain/src/store/projection.ts | dd0d3823bd6b9ecd8868ee0eaacdb8e3438aca1bf944f897cd2092eb137364b9 |
| packages/domain/src/events.ts | 4d2fe50114ab16e379759bf3bbb4f6416120f323c62b9a5280c04284a597ec44 |
| packages/domain/src/entities.ts | ee505f78a6434528dbfe5f072463ec77cd6823bab1781f3f656d01c77f2d52f9 |
| packages/domain/src/ids.ts | c1081994f401f4898f950348587ff4633fd36eb822628ca00d3d215e73defd0f |
| packages/domain/src/attachments.ts | 7094e663ad7a34dc38de76529a471c6f1b1d9c52c2f29883666b408603e1962e |
| packages/domain/src/store/dependency-validation.ts | e73b9367e7aa93689a28e5e9e83fd53cac6dcbf949a6c50f0122ac28213ba0d5 |
| packages/domain/src/store/dependencies.ts | b4e88ed38871bd93483a024b5ca45ba66c441b93f2aeec70ab60c8f97461f411 |
| packages/domain/src/dependency-rules.ts | 38fbc8c86349775e6eced7404e924ba5a5ab8e5e08616169e378086fe4e5fb11 |
| packages/domain/src/dependencies.ts | 18b75d53f24ed5a86e6c645d4d2b99766ae8a0786ec32c1c5a33254804a06caa |

coverage.json and store.ts remain byte-identical to 65fe3d84. All ten covered
hashes match. confirmedCommit stays e2ee47daf6e1d93763e9835d9d472ccf831a1f2e;
there is no pin renewal in this follow-up. Contract id stays
78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289.

All data, credentials and files are scratch-owned. No real Todo directory,
Todo.app, Keychain, signing, native build, unrelated process stop, Python
workaround, push, PR, merge or child agent is used. Old control binaries and
closed Bun build temporaries were retired after hashes and lsof checks to
respect the 30 GiB floor. All compiled baseline controls, current cached binaries and closed Bun outputs
have now been retired after preserving their hashes and checking lsof. The
remaining working changes and text evidence are small. Final cleanup retired 13 closed own files totalling 1,167,729,168
bytes across the follow-up, including 5 Bun temporary outputs
(443,304,320 bytes). Hashes and lsof results are retained.
It removed both owned baseline fixture directories; recipe/test scratch and
all their owned subprocesses had already exited and cleaned up. Final free
space was 30,496,396 KiB, above the authorized 22 GiB floor.
cleanup-final.json preserves the exact list and observation. No binary is
archived in the report; hashes and reusable probe sources remain.

The final source review proves the production delta is exactly the two approved
lines, with store, production domain/server source and coverage unchanged. The
post-implementation review found completion, caller usability, form and the
existing abstraction sound within the exercised cases. The no-comments child
step was not run because of the explicit no-children instruction; the parent
diff audit found zero added comments or suppressions. completion-review.json
records this limit rather than claiming a delegated review.
