# Owner Snapshots

## Sub-features

Settings lists Snapshots, creates one, reveals it in Finder, and previews Restore
with a time and per-Profile loss report. Restore clears cached Tasks and drafts.
The production stream persists its restore generation and replaces old cursors.
It also persists a restore-boundary fallback for inactive Profiles.

## How to get to it (user POV)

Click Settings in the sidebar, or in Navigate tasks in Compact mode.

## Driving it with the compiled host

Run `TODO_ELECTRON_VERIFY_HOST=1 TODO_VERIFY_SNAPSHOTS=1 .agents/skills/verify-electron/scripts/verify.sh "$PWD/docs/evidence/f13/electron-new"`.
It builds under the shared Electron lock, starts a compiled scratch server, and
uses production IPC, preload, renderer and generated HttpApi calls. It creates
a Snapshot, writes a Task through compiled CLI, previews literal counts 1 and 0,
restores, and observes a later write after the SSE reload. Light/dark full and
Compact screenshots stay in evidence. The host never imports secure storage.
The drive waits for computed confirmation opacity 1, checks its topmost position,
traps Tab inside it and proves Escape closes only the confirmation. It also
creates nine Snapshots with different reasons, checks scrolling, and captures
full and Compact density. Rows show Profile display names, human reason labels,
singular Task counts and a quieter Reveal in Finder action.
The host and production main process share stream-cursor rules. The drive seeds
a delivered Personal reminder before the Snapshot, restores while viewing Work,
switches to Personal, checks resume cursor 6, and observes zero replayed historical
reminders. The host records stream frames without requesting native notifications.

## Gotchas

Signed Electron, Keychain and native notification proof remain held. This host
proof does not claim those checks. Restore replaces all Profiles and Sessions.

Compact Settings puts Restore and a quiet folder icon on the date line, with
metadata grouped below. At 393 × 426 the drive requires three whole rows, zero
partial rows or text lines, targets at least 32 pixels, and only Restore as a
visible row action. It checks the last scroll position too. The folder keeps
the accessible label and tooltip Reveal in Finder.

A restore reload closes the import preview and clears its file, report and pending options. The Snapshot drive opens a real import preview before restore and verifies a fresh import starts empty afterward.
