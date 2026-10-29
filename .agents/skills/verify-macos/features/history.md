# History

## Sub-features

Plain operation labels, local relative times with a full date on hover, changed
field values, muted rejected attempts with plain reasons, erased content after
Purge, and Revert only on accepted changes that have not already been reverted.
Created, Reminder and redacted entries have no Revert.

## How to get to it (user POV)

Open a Task and expand History in its editor. Entries run newest first.
Hover a time for the full local date. Revert records the opposite change and
keeps the original entry visible.

## Driving it with Swift Testing

From the checkout root, run
`.agents/skills/verify-macos/scripts/verify-history.sh "$PWD/docs/evidence/f01/swift-history-new"`.
Use a fresh absolute directory. The script compiles production formatting and
literal History fixtures in an isolated Foundation-only package with no external
dependencies. It runs Swift Testing without Todo, UI XCTest or Keychain access.
Read `tests.log`, `commands.log` and `result.json` after its temporary package has
been removed. A failed assertion exits nonzero and retains the log.

## Gotchas

This is formatting proof. It does not prove the native layout or tooltips.
An unsigned xcodebuild proves SwiftUI integration compiles. Native app launches
and signing remain on HOLD. The older full state-proof package currently has a
stale Package.resolved; this focused proof does not change dependency pins.
