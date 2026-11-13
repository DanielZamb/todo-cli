# Reject unsupported mutation flags

The coordinator accepted fixing all 64 pairs and has now ruled on the listed
exceptions. [The detach-label follow-up](fix-purge-restore-detach-label.md) fixes
that neighbouring factory, retains username compatibility, and states the
intentional --force change for scripts. The pending language below describes
the original 65fe3d84 submission.

R4-C1 is corrected as one separate commit on top of
`1a0a4c132225f0ead1d71361afb359bdbcc718a8`. The fourth correctness review
accepted the previous Purge/restore work, preview guard, second mapping renewal,
Electron deadlines and root check. This change touches no production domain,
store.ts, coverage.json or pin. It adds no mutation previews.

## Registration follows the command

The mutation factory now constructs three typed command registrations. Edit
gets its editing fields. rm gets force, with-dependencies, dry-run and
dependency-fingerprint. Done, cancel and reopen get the Task id and expected
Version. A shared handler retains the existing domain calls and rm logic.
Only edit converts editing fields; only rm receives Delete/Purge options.
Unsupported flags are refused by Effect CLI before that handler executes.

The wider audit found 48 more ignored registrations in that same factory:
12 editing flags on done, cancel, reopen and rm. Those are rejected too:
title, desc, external-id, project, priority, scheduled, due, recurrence, energy,
estimate, source and tag. Together with the requested 16 pairs, 64 unsupported
command/flag pairs now exit 2. Remaining help flag order is preserved.

## Compiled red and green

Both named baselines are actual compiled CLIs: the 6b167266 DAG base and the
reviewed 1a0a4c13 source. Each of the 64 cases runs against a fresh copy of one
closed scratch seed with literal Version-1 Tasks. All 64 exit 0 on each old
CLI, reach Version 2 and change exactly tasks, task_versions, op_log and
sqlite_sequence. The new assertions fail on both binaries, exit 1.

The fixed CLI exits 2 for all 64 pairs. Each target remains literally
`Literal target`, Version 1, with status open, or done for the reopen case.
Every table's serialized rows are byte-identical, including raw event/payload
text, credentials and sqlite_sequence. The complete SQLite file checksum is
also unchanged. Captures use immutable reads only when no WAL exists, and a
normal read-only connection when WAL pages exist.

Thirty-two cold-process cases exercise the four Delete-only flags on edit,
done, cancel and reopen in both Markdown and JSON. They use a missing database,
no credential and a target Profile named Never Created. Each returns the
ordinary usage refusal without creating the database, prompting or reaching
Profile/authentication writes. The existing first-run disclaimer marker is
seeded so only the command's error is captured.

Markdown retains the standard parser help on stdout and Error on stderr.
JSON retains one error object on stdout and empty stderr. Literal error fields
are invalid_args, exit_code 2 and exit_meaning validation or usage. The existing
parser suggestions are preserved for edit --force and rm --source. The new
regressions do not change production error rendering.

The final three tests fail against both old binaries and pass against the
fixed binary. The final verify-cli recipe repeats them as part of 72 tests.

## Every compiled command and accepted flag

The collector walks SUBCOMMANDS in compiled help recursively, checks those
names against compiled schema --list, captures 53 command/root/group help
pages and all 54 command/help/error response schemas, then lists every
accepted flag from the actual FLAGS and GLOBAL FLAGS sections. The inventory
is generated; command/flag lists are not transcribed from source.

Before the fix there are 867 command/flag pairs: 800 with reviewed consumers,
64 ignored in mutation, one ignored in the Attachment factory and two
explicit compatibility no-ops. After this correction there are 803 pairs,
with the same 800 consumers and three reported exceptions below.

`apps/cli/scripts/flag-inventory.ts` maps every collected flag to its consumer
or explicit exception and refuses an unmapped flag. References trace shared
settings and Effect CLI built-ins, direct handler reads, and downstream
consumers such as taskInput/prepareFlags, filters, transfers and Attachment
commands. Global settings apply where relevant: no-color controls top; plain
renderers are already uncolored; help/schema remain auth-free. Modifiers are
traced in their applicable branches. This combines compiled registration
capture with source inspection; it does not claim every flag combination was
executed.

The generated readable inventory is in
`.agents/skills/verify-cli/features/flag-contract.md`. The complete per-pair
consumer trace and raw compiled help/schema documents are in local
flag-consumers.json and flag-inventory.json. The tracked golden contains exact
accepted flag sets and normalized help/response-schema SHA-256 values.
It was derived from the unchanged reviewed binary by removing exactly the
64 unsupported FLAGS lines. Only edit, done, cancel, reopen and rm change;
all response schemas and all other help content remain equal. The five Go
review/export output goldens remain unchanged and pass.

## Findings outside the mutation factory

| Command/flag | Proven behavior | Disposition |
| --- | --- | --- |
| detach --label | Exits 0, ignores the supplied label and performs the normal detach, Version 2 to 3 with attachments empty. The external file remains. The detach branch never reads label. | Different Attachment factory. Reported and left unchanged pending a ruling. An asynchronous scope question offers making label attach-only. |
| init --username, login --username | Different supplied names still configure/authenticate the one literal owner; handlers never read username. | Help explicitly calls these compatibility flags; ADR-0005 has one owner. Retained as documented. Removing them would require a ruling. |

No other completely unused accepted flag was found in the compiled inventory
and source trace. These exceptions are not silently counted as consumers.
No change outside the mutation factory's production code is proposed here.
The scope question remains separate from the completed authorized mutation fix.

## Main reference correction

The genuine isolated main CLI was built from origin/main 72a5413d with a frozen
offline dependency installation. Its @todo/domain realpath points into that
owned archive, not into this checkout. Fixtures for a real main mutation are
created through main's own CLI.

It rejects dry-run, with-dependencies and dependency-fingerprint on all four
commands. Twenty-four Markdown/JSON controls have exit 2 and the exact same
normalized error as the new CLI. However, main registers force on every
mutation and accepts edit --force: a real main Task advances from Version 1
to 2 and changes its literal title. Thus main supplies the existing refusal
format, but it is not a rejecting reference for force. The new force refusal
follows the coordinator's explicit ruling and the normal parser contract.

The fourth review also withdrew the earlier public-main Purge dry-run PNG-loss
claim. Named main rejects rm --dry-run. The already accepted preview guard
still applies to main library forks; no public main Purge preview is claimed.

## rm controls and verification

The verify-cli recipe passes its normal CRUD/Delete/Purge, schema, help and
five golden cases along with the new regressions. The DAG closure and public
recipes also pass matching/stale fingerprints, with-dependencies, Delete dry
runs, real Purge, blocked completion, and actual PTY confirmation/cancellation.
The accepted common rm handler still receives all four controls.

One public drive assertion previously expected done --force to reach a blocked
Task refusal. It now first requires invalid_args for that unsupported flag,
then separately requires plain done to return blocked. This preserves the
domain safety check while applying the new boundary contract. Its initial
expected blocked/observed invalid_args failure is retained, not reported as a
passing proof.

All receipts below are under `docs/evidence/purge-restore/r5/`.

| Check | Exit/result | Receipt |
| --- | --- | --- |
| 64-case compiled 6b167266 reproduction | 1; all actual commands 0 and Version 2 | red-base.log, red-base/mutation-flags.json |
| 64-case compiled 1a0a4c13 reproduction | 1; same real writes | red-head.log, red-head/mutation-flags.json |
| Final three tests against each old CLI | 1 and 1; all three fail | red-final-base.log, red-final-head.log |
| Final three tests on fixed CLI | 0 | green-final-tests.log |
| CLI typecheck and focused lint | 0 and 0 | typecheck-final.log, lint-focused.log |
| verify-cli by its recipe | 0; 72 tests and five unchanged Go goldens | verify-cli.log, verify-cli/commands.log |
| Required DAG usage closure | 0 | dag-closure.log |
| DAG public controls, final corrected boundary assertion | 0 | dag-public-final.log |
| Exact locked root check | 0, first attempt | root.log, root.exit |

Root command: `sh scripts/disk-guard.sh` once, then
`/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`.
It passed 418 domain, 72 CLI, 32 server and 168 Electron tests, with one existing
skip. No root retry was needed. Launch/end load averages were
2.57 / 3.64 / 4.32 and 12.79 / 7.51 / 5.78.

The accepted store.ts SHA-256 remains
8dbb9b9ba322c1cb29d41732072792f4c929cea185770f1597d25a393e5787e1.
All ten covered source hashes match the unchanged coverage.json, whose
confirmedCommit remains e2ee47daf6e1d93763e9835d9d472ccf831a1f2e.
No pin renewal or new formal source mapping is needed for this CLI correction.
The second renewal is accepted by review 4. pins-unchanged.json proves the
coverage file and store are byte-identical to 1a0a4c13 and lists all ten hashes.
Contract id remains 78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289.

## Limits and cleanup

The first probe reader tried a read-only WAL-mode copy without sidecars and
failed to open it. A second attempt incorrectly required no WAL after a real
baseline write. Both setup attempts were excluded. Final captures read the
correct WAL view. The first discovery parser looked for COMMANDS rather than
SUBCOMMANDS and its registry-equality assertion caught the empty inventory.
The first fixed-source test also incorrectly expected no Markdown help output
and no standard suggestion. The genuine main reference established both
behaviors. Final literal expectations preserve the existing error contract.

All data, owner credentials and files are scratch-only. No installed CLI,
real Todo directory, Todo.app, Keychain, signing, native build, unrelated process
stop, Python workaround, push, PR, merge or agent child was used. Frozen main
sources and their own dependencies were removed after preserving provenance.
Closed own binaries/build temporaries are pruned after lsof checks. Final
cleanup and free-space receipts are recorded below after the root check.
Cleanup retired 35 closed own files, 3,053,671,649 bytes,
including old cache binaries and Bun build temporaries, after lsof checks.
It removed 12 owned probe directories and the isolated main archive/dependencies.
The fixed CLI, named baselines and unchanged server remain as reusable local
artifacts with recorded hashes. cleanup-final.json preserves the exact list
and final disk observation. All owned recipe servers and subprocesses exited.

Final available disk was 37,061,132 KiB, above the 30 GiB floor. The source
review also proves all main.ts text outside mutation is byte-identical to
1a0a4c13. The shared handler is identical after whitespace/punctuation and the
explicit input-field/argument substitutions. handler-comparison.json retains
that assertion. The normalized Task flag conversion accepts only strings and
string arrays already guaranteed by the registered flags.
