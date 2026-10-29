# Move and copy Tasks between Profiles

## Sub-features

Move preserves the Task id, created_at, status, and History. Copy creates a new id
and preserves created_at and status. Both resolve Project and Tags by name in the
destination Profile and use the operation time for updated_at. Copy records its
source Profile and Task id in History. An Occurrence becomes a plain Task.

## How to get to it (user POV)

Open Task actions in the editor, or open a Task row's context menu. Choose
Move to Profile or Copy to Profile. Select the destination Profile and confirm.
The client stays in the source Profile and displays the result with Open in
the destination Profile. Move returns to the source list. A stale Version opens
a transfer-specific confirmation with Cancel and Copy latest or Move latest.

## Driving it with headless Swift and scratch HTTP

Run `./scripts/swift-slot.sh apps/macos/scripts/generate-api.sh` after a contract change. Then run
`./scripts/swift-slot.sh apps/macos/scripts/verify-write-state.py "$PWD/docs/evidence/c10/headless-new"`
with a fresh evidence path. This compiles the server and runs the production
TodoModel and generated client without Todo.app or Keychain. The SwiftPM target
also runs GeneratedContractTests from `apps/macos/Tests` without an app host.

`liveCopyKeepsSourceAndOtherTasks` copies a completed Task, reloads both Profiles,
moves its source, and reloads both Profiles again. It checks the accepted id,
Version, status, named metadata, provenance, and unrelated source Task.
`copyConflictPreservesDraftAndUsesCurrentVersion` checks Conflict retry payloads.
Read `c10-transfer-http.json`, `c10-transfer-durable.json`, `state-tests.log`,
`commands.json`, and `result.json` before reporting a pass.

Run `./scripts/swift-slot.sh apps/macos/scripts/verify-design.py "$PWD/docs/evidence/c10/design-new"`
for unordered-window captures in light and dark. The transfer captures cover
production action buttons, both Profile pickers, the accepted result, Conflict,
and an empty destination picker at full window size and 393 by 426 Compact mode.
The merged manifest contains 162 PNGs. Check `accessibility.json` and every command exit.

Run an unsigned compile with a checkout-local DerivedData directory:

```sh
sh scripts/disk-guard.sh
./scripts/swift-slot.sh xcodebuild -project apps/macos/Todo.xcodeproj -scheme Todo -configuration Debug -destination platform=macOS -derivedDataPath apps/macos/DerivedData/C10Unsigned CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO EXPANDED_CODE_SIGN_IDENTITY= build
```

## Gotchas

Native Todo.app, hosted XCTest, signed Electron, signing, Keychain, real Tasks,
and the real server remain prohibited. Offscreen menu chrome is a fixture around
production action views. Offscreen captures do not prove native menu opening,
focus, VoiceOver, or Liquid Glass. The unsigned build proves compilation only.
All databases and HTTP listeners belong to scratch verification processes.

The headless helper accepts `TODO_SERVER_BINARY` and `TODO_SEED_BINARY` to reuse
compiled inputs with a matching source hash. `TODO_SWIFT_BUILD_PATH` can reuse a
Swift build directory under `apps/macos`. Each behavior drive still provisions a
fresh database and records the reused binary paths in `commands.json`.
