# Owner Snapshots

## Sub-features

Settings lists Snapshot time, reason, size and Task counts. Create Snapshot writes
through the generated contract. Restore opens a confirmation with its time and
per-Profile before/after counts. Reveal in Finder selects the stored SQLite file.
A restore reload clears cached Tasks, History, drafts, pending navigation,
Project and Tag filters, notification receipts and the old SSE cursor.
It persists the restore boundary as the fallback cursor for inactive Profiles,
including after model recreation, so switching Profile cannot replay old reminders.
Notification identifiers and delivery lookup include the restore generation.
Rows use human reason labels and singular Task counts. Reveal in Finder is a
plain secondary action. Restore uses a destructive button and Cancel handles Escape.

## How to get to it (user POV)

Open Settings, then Snapshots. Use Create Snapshot or Restore… beside a saved copy.

## Driving it with headless Swift and offscreen views

Run `./scripts/swift-slot.sh apps/macos/scripts/verify-write-state.py "$PWD/docs/evidence/f13/swift-state-new" --snapshots-only`.
The production TodoModel talks to a compiled scratch server. It proves literal
Task counts 0, 1, 0 and 1 across create, preview, restore, reload and a later write.
No Todo app, Keychain or hosted XCTest runs.
The same run checks reason labels, Task pluralization, notification receipt
generation resets and the generated History decoder against all event kinds.
It switches to Personal after restore and checks resume cursor 3, switches back
to Work at cursor 4, then recreates the model and resumes Personal at cursor 3.

Run `./scripts/swift-slot.sh apps/macos/scripts/verify-design.py "$PWD/docs/evidence/f13/swift-visual-new"`.
It renders production Settings and confirmation views, full and Compact sizes,
in both appearances, including empty, loading and error states.
The density fixtures show seven Snapshots with different reasons in both sizes.

## Gotchas

Regenerate the Swift contract after HttpApi changes. Every Swift build and verify
script uses the shared lock. Native Todo.app, signing and Keychain remain held.

Compact uses three whole rows at 393 × 426, with Restore and a quiet folder icon
on each date line. Geometry preferences in the offscreen drive measure the real
row, text and action bounds in both appearances: at least three whole rows,
zero partial rows or text lines, 28-point targets and Restore before Finder.
Metadata uses a 4-point gap and rows use a 12-point gap, from the shared scale.

A restore reload closes the import preview and clears its file, report and pending options. The Snapshot drive opens a real import preview before restore and verifies a fresh import starts empty afterward.
