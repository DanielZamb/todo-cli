# Attachments

Use the unsigned compiled host during native HOLD. Build under the Electron
lock, then drive the production picker IPC, drop and paste upload, link form,
thumbnail, missing-file state, Jira row marker, remove and History Revert.
The picker dialog boundary is controlled by the drive. It never calls
safeStorage, Keychain or an installed Todo application.

```sh
sh scripts/disk-guard.sh
/usr/bin/lockf -k /tmp/todo-fixes-electron.lock env TODO_ELECTRON_VERIFY_HOST=1 pnpm --filter @todo/electron build
bun .agents/skills/verify-attachments/scripts/dev-server.ts
TODO_ELECTRON_VERIFY_HOST=1 TODO_F11_SERVER=<url-from-.scratch/server.json> bun apps/electron/scripts/verify-attachments.ts "$PWD/docs/evidence/f11/electron-new"
```

The server helper caches compiled CLI/server binaries by source hash and uses
only the worktree's scratch HOME, database and attachment store. The drive
creates unique Tasks, requires actual HTTP writes and observes SSE updates.
It captures full and Compact editor windows in light and dark appearances,
plus the empty section. Read the process exit code and `result.json`.

Unit tests in `attachment-files.test.ts` exercise opening decisions without
opening files. Executables, scripts, app bundles and symlinks to those targets
are refused. Signed native dialogs and Finder interaction remain held.
Stop the owned scratch server with `dev-server.ts stop` when the run ends.

The section has one Add menu with Add File…, Add Link… and Paste Image when
an image is on the clipboard. Labels are badges, edited through each row's
Attachment actions menu. The drive marks Jira, edits and clears a label,
checks the unchanged filename, and captures the open Add menu in Compact.
Remove uses an X and the accessible name `Remove attachment <filename>`.
Missing paths have no Reveal control. Middle truncation keeps the basename.
Compact bounds receipts require all three rows and their header inside the
393×426 viewport, targets at least 32 px and no visible control crossing the opaque
editor header. Rows use 16 px spacing and related name/path text uses 4 px.
