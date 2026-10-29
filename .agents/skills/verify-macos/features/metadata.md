# Project and Tag creation

Run all Swift commands through the run's `bin/swift-slot.sh` runner.
Native Todo.app, hosted XCTest, signing and Keychain remain on HOLD.

Run `apps/macos/scripts/verify-write-state.py <new-absolute-evidence-directory>`.
`liveMetadataQuickAddAndEditorSurviveReloadAndReachSecondClient` uses production
TodoModel and the generated client against a compiled scratch server. Its matrix
covers the shared main-window, menu-bar and Compact quick-add write action, new
and existing quoted Project and Tag names, Add and edit, editor name actions,
a literal editor Title, reload and a second client's SSE update. Read
`metadata-http.json` and `metadata-durable.json` for the literal names and Versions.
`TODO_SERVER_BINARY` selects an already compiled baseline server for a red run.
It is copied into scratch and never modifies the input binary.

New Project and New Tag use the production MetadataNameSheet. Its typed kind
survives sheet dismissal; only Save changes writes the definition. The draft
behavior test checks trimming, Tag lowercase normalization and existing-name reuse.
The Project picker and Tags menu keep their existing accessible labels. New sheet
controls add `new-metadata-name` and `add-metadata-name` identifiers.

Run `apps/macos/scripts/verify-design.py <new-absolute-evidence-directory>` for
142 offscreen PNGs including the merged transfer and Attachment states. New Project and Tag sheet content appears over full and Compact
production views in both appearances. `metadata-row-*` checks long Project names
and several Tags. `quick-add-*`, `compact-quick-add-*` and `menu-bar-quick-add-*`
show quoted-name chips. Read the PNGs and send their absolute paths for design review.
Offscreen sheets use fixture overlay placement; native presentation, keyboard,
focus, actual MenuBarExtra opening and glass still need supervised verification.

The unsigned build is:

```sh
sh scripts/disk-guard.sh
./scripts/swift-slot.sh xcodebuild -project apps/macos/Todo.xcodeproj -scheme Todo -configuration Debug -derivedDataPath apps/macos/DerivedData/U01Unsigned CODE_SIGNING_ALLOWED=NO build
```

Require build exit 0 and `check-design-identifiers.py` PASS. U01 does not change
the HttpApi schema. Regenerate the Swift contract after merging shared schema
changes, including C12's DatabaseRestored history event.

The run's shared Swift slot runner replaces the earlier single Swift lock. Keep
Electron package builds under their separate single lock. Cached server binaries
from `.scratch/bin/current.json` can be passed with `TODO_SERVER_BINARY`; final
state proofs still provision a fresh database.

Quoted metadata can contain words such as p1. The priority-chip scanner skips
`#"planning p1 work"` and `@'Client p2 Work'` rather than displaying an unrequested
priority. The compiled headless regression and `quoted-name-priority-*` captures
require no priority chip for those names.

Quick-add hints teach `Try: tomorrow p1 #tag @"Client Project"` in the full window,
Compact mode and MenuBarExtra production view. The captures include those hints.

Compact quick add uses QuickAddFlow to place metadata and date chips from left
to right and wrap at the available width. At 393 pt, the five-chip fixture must
occupy at most two rows, remain within the view and offer targets at least 28 pt
high. Read `compact-quick-chip-bounds-light.json` and its dark counterpart.
`TODO_SNAPSHOT_QUICK_ONLY=1` limits the render helper to those two production-view
captures for iteration. The final proof renders every state.

The task is to enter a Task and confirm its parsed metadata. Add task remains
the one prominent action. Proximity groups the input and hint. Chunking and
Cognitive Load guide the wrapping metadata group, and Fitts's Law guides the
28 pt targets. The render checks the actual chip count, row count and bounds.

The Compact overflow menu hides its separate menu indicator and has the
accessible label `More add options`. Add and edit keeps Command-Return.
Offscreen quick-add captures pass `referenceDate` at
`2026-10-28T15:00:00Z`, matching the parsed fixture's clock. They require the
literal chip label `Due Tomorrow` in the full window, menu bar and Compact view.
Production leaves the reference unset and formats against the current clock.
