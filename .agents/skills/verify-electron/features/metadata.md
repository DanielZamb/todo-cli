# Project and Tag creation

Run the host-only recipe in the parent skill. The build takes the shared
`/tmp/todo-fixes-electron.lock`. Scratch-server readiness allows 60 seconds.
The production Session, Keychain and signed-app HOLD still applies.

`apps/electron/scripts/verify-metadata.ts` drives full-window and Compact quick add
with new and existing quoted names. It compares HTTP parse with compiled
`todo parse`, and checks compiled `todo add --parse` resolves the same names.
Plain `todo add` and the editor Title field keep tokens literally.

For each mode, Add and edit creates a Task, the Project combobox creates or selects
a Project, and Tag input commits with Enter and comma. The drive saves, reloads,
edits the existing Task again, and checks a second compiled-host client receives
the names through SSE without Refresh. Accessible `Remove Tag <name>` labels stay
part of the contract.

Read `u01-metadata-matrix.json` for literal Project and Tag values after reload.
`u01-row-bounds.json` requires visible metadata contained within every Task row,
in both modes and appearances. Long Projects truncate with an ellipsis. Compact
rows show whole Tags followed by +N, with every Tag in the tooltip. The
`u01-row-*`, `u01-quick-*`, `u01-project-sheet-*`, `u01-tag-sheet-*` and
`u01-editor-*` PNG pairs go to the coordinator for visual review.

For a focused U01 proof, set `TODO_ELECTRON_VERIFY_METADATA_ONLY=1` alongside
`TODO_ELECTRON_VERIFY_HOST=1` when invoking the helper. It runs
`verify-metadata-host.ts` on a fresh database, includes Compact mode, and reports
only metadata coverage. The broader write drive remains a separate check.
`TODO_SERVER_BINARY` and `TODO_CLI_BINARY` reuse source-hash-matched cached
binaries while provisioning a fresh database.

The focused proof also runs `verify-tag-layout.ts`. It captures 0, 1, 3 and 8
Tags in both modes and appearances, verifies a right-aligned, vertically centred
chevron, and bounds field height by the actual chip/input rows. Read
`u01-tag-layout.json` and `u01-tags-<full|compact>-<0|1|3|8>-<light|dark>.png`.
Chips and input wrap inside the field; the chevron keeps its own right column.

Quick add gives each Tag its own Hash icon and `Remove Tag <name>` button.
The drive removes beta from alpha/beta/gamma, then requires alpha and gamma after
save and reload. Priority, Project and date chips use Flag, Folder and CalendarDays
icons. The hint teaches `Try: tomorrow p1 #tag @"Client Project"` in both modes.
`whole-tags.test.ts` checks literal fitting and overflow counts; the compiled
drive checks displayed whole Tags, +N and their bounds in the production row.

Compact quick add groups its field and hint with a 4 px token gap. The parsed
title and chips form the next group after 16 px, and the footer follows after
16 px. `u01-compact-quick-spacing.json` records those literal gaps and requires
every quick-add button target to be at least 32 px in both dimensions. This
applies Law of Proximity and Common Region to the task of entering and checking
a Task. Add task is the single prominent action, following Von Restorff.
