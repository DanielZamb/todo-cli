# Edit several Tasks

## Sub-features

The production TodoModel retains each selected Task's loaded Version through
preview and apply. Matching Tasks update independently. A stale Task stays
unchanged and receives its own Conflict. Reload keeps the selection and refreshes
Versions. Preview enables Apply. A Conflict makes Reload Tasks the filled action.

## How to get to it (user POV)

Choose Edit Tasks… from Compact navigation or the full-window toolbar. Select
Tasks and one shared field, choose Preview, then Apply. After a Conflict, choose
Reload Tasks and preview the refreshed selection before applying again.

## Driving it with the headless and offscreen helpers

Build the compiled inputs with
`bun .agents/skills/verify-cli/scripts/cache-binaries.ts`. Set `TODO_CLI_BINARY`,
`TODO_SERVER_BINARY` and `TODO_SEED_BINARY` to the paths in
`.scratch/bin/build.json`. Every Swift command below must run through the active
orchestration `swift-slot.sh` wrapper.

Run `apps/macos/scripts/verify-write-state.py` with a fresh absolute evidence
directory. `liveBatchEditSelectPreviewApplyConflictAndReload` drives production
TodoModel against the compiled scratch server. Literal assertions cover no-write
preview, one accepted Task at Version 2, one stale Task at Version 2, preserved
competing content, selection-preserving reload, retry, and date clearing.
`GeneratedContractTests.testBatchEditKeepsPerTaskVersionsAndSharedChange` checks
per-Task Versions, shared changes, null clearing and mixed reports through the
regenerated Swift contract.

Run `TODO_SNAPSHOT_BATCH_EDIT_ONLY=1 apps/macos/scripts/verify-design.py` with
another fresh evidence directory under the same Swift wrapper. It generates
28 offscreen PNGs, with Compact first, for ready, preview, applied, mixed
Conflict, empty, loading and error states in both appearances and layouts.
Require `Assets.car`, `manifest.json`, `result.json`, the preserved 35 identifier
expressions and every command's exit 0. Read the Compact preview and Conflict
images. The Conflict fixture shows one Updated at Version 2 and one Conflict at
Version 2, with Reload Tasks filled and Apply quiet.

Run the orchestration disk guard before an unsigned build:

```sh
xcodebuild -project apps/macos/Todo.xcodeproj -scheme Todo -configuration Debug -destination platform=macOS -derivedDataPath apps/macos/DerivedData/CLI02Unsigned CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO EXPANDED_CODE_SIGN_IDENTITY= build
```

Keep `TODO_SERVER_BINARY` set so the bundle reuses the cached compiled server.
Run this command through the Swift wrapper too, and read its process exit code.

## Gotchas

The state helper provisions a fresh database and removes it after preserving
its evidence. Offscreen renders use unordered NSHostingViews with prohibited
activation. Neither helper launches Todo or touches Keychain. Hosted XCTest,
native focus, glass, toolbar interaction and native Session restoration remain
under HOLD. The coordinator must approve the PNGs before visual completion.
