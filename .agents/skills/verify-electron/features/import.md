# Import Tasks

## Sub-features

File selection, preview, Apply, rejected rows, Conflict handling and external ids.

## How to get to it (user POV)

Choose Import… in the task toolbar, then choose a JSON or NDJSON file.
Preview changes before choosing Apply changes.

## Driving it with the compiled host

Run the parent skill's host-only helper. `verify-import.ts` uses the Import file
input, Preview changes, Apply changes and Done buttons. It checks literal counts
1 created, 1 updated, 1 unchanged and 1 rejected. A compiled CLI edit after preview
must produce a Conflict row while keeping the concurrent title at Version 3.
The helper captures file, preview, result and Conflict in light and dark, at full
size and 393 × 426. It asserts the Compact Apply button stays within the viewport.

## Gotchas

Preview pins Versions. It never writes Tasks, History or owner Snapshots.
Apply can accept valid rows alongside rejected rows. Errors retain the report.
Offline state disables both preview and Apply. This host never uses Keychain.

Cancel missing Tasks is available before preview. The host driver edits one
absent Task after preview, then applies cancellations. That Task must stay open
at Version 4 with its concurrent title, and the report must show a Conflict.

[Discovery report recovery](discovery.md#same-profile-show-and-report-row-recovery)
records the real task_deleted rejection for a stale Task before Preview, then
uses an explicitly typed not-found UI fixture to verify structured recovery.

The DAG mixed-refusal preview keeps PR #12's Compact row geometry for ordinary,
nested Dependency and Conflict errors. Human reasons come from the shared
Dependency projector, with the actual pair on the muted last line. Existing
blocker and follow-up navigation uses the same row menu as Find Task by id.
The focused import driver uses `hiddenHostOptions`, including the common
entry/runtime preflight. The verification host exits with
`VERIFY_HOST_BOOT_FAILED` on a bootstrap failure.

For import-only proof, compile the server, CLI and verification seed into a
worktree-local binary directory, build the unsigned verification host, then run
`TODO_ELECTRON_VERIFY_HOST=1 pnpm --filter @todo/electron exec bun scripts/verify-import-focused.ts <absolute-binary-directory> <fresh-absolute-evidence-directory>`.
The directory contains `server`, `todo` and `seed`. This calls the same exported
import steps as the write drive, provisions a fresh scratch database and HOME,
and closes only its own host and server. It avoids unrelated write assertions.

Compact rejected rows retain the common 56 px frame with title, one caption
reason line and muted exit pair. Full reason, pair and external id remain in
that order in the row title and accessible label. The drive checks rejected-first,
rejected-last and two-rejected previews, equal frames, one-line reason styles,
exit pairs and complete rows in both appearances. Accepted rows retain their
external-id and changes lines.

The report-error drive also checks the Compact lookup row's action menu through
Shift+F10, focus return after Escape, and right-click. The action is announced by
the native button's accessible name and menu semantics. Full-window recovery
stays inline. VoiceOver and real keyboard operation remain supervised checks.
