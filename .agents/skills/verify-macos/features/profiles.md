# Profile deletion

## Sub-features

Delete an empty Profile, refuse a non-empty Profile, and explicitly confirm
Delete Tasks too in a second step. Switch after current Profile deletion,
including an external SSE operation and a reload. Preserve Task recovery data
in the pre-deletion Snapshot.

## How to get to it (user POV)

Open Settings, General, then the Profile menu. Its last item, after a separator,
is `Delete "<name>"…`. The action is unavailable while an
editor is open, offline, or only one Profile remains. The confirmation names
the Profile and visible Task count. Delete Tasks too opens the destructive
second step. Cancel leaves everything in place.

## Driving it with the headless and offscreen helpers

Run `apps/macos/scripts/generate-api.sh` after updating OpenAPI. Then run:

```sh
apps/macos/scripts/verify-write-state.py "$PWD/docs/evidence/f10/swift-state-new"
apps/macos/scripts/verify-design.py "$PWD/docs/evidence/f10/swift-design-new"
```

The state helper builds the production server and CLI, supplies scratch HOME
and SQLite, and runs production TodoModel against the real generated client.
GeneratedContractTests also run as a standalone SwiftPM test target, without
TodoApp or Keychain. Read profile-deletion-http.json and the durable SQLite
assertions in the helper. These prove refusal, empty deletion, deletion with
Tasks, external SSE switching and reload with literal expected values.

The design helper captures empty confirmation, refusal, failed refusal and second-step views over
full and Compact content in light and dark. These use ProfileDeletionView,
with fixture-only window and sheet chrome. Identifiers are delete-profile,
profile-deletion-confirmation, profile-deletion-error,
profile-delete-tasks-step and confirm-delete-profile. Existing identifiers
remain required by check-design-identifiers.py.

For an unsigned build, run the disk guard, then xcodebuild with
`-project apps/macos/Todo.xcodeproj -scheme Todo -configuration Debug
-derivedDataPath apps/macos/DerivedData/ProfileUnsigned CODE_SIGNING_ALLOWED=NO
build`. Capture its real exit code. Never launch the resulting Todo.app.

## Gotchas

Profile deletion is final in place, while its name may be reused with a new ID.
Owner Sessions survive. A deleted current Profile clears unavailable editor
state and switches to a remaining Profile. Native glass, system sheet focus,
Keychain and signed-app behavior remain supervised proof gaps during HOLD.

The headless helper accepts TODO_CLI_BINARY and TODO_SERVER_BINARY for matching
.scratch/bin artifacts. It shares SwiftPM's worktree-local .build cache with the
offscreen recipe. Run the helper through the run's shared Swift slot launcher.
It still provisions a fresh database for literal behavior assertions.

The final step explains that Todo saves a Snapshot first and recovery is in
Settings > Snapshots. The final native button has a destructive role and red
prominent style. The refusal is one sentence; red appears only after a failed
request. Switch notices name both the deleted Profile and the new Profile.
The state tests also hold discovery across a switch, a roundtrip and
cancellation to reject stale deletion responses without losing an editor.

The unsigned Xcode server bundle accepts TODO_SERVER_BINARY for the same source
hash, so repeated proofs reuse the per-worktree server cache. Compare the
embedded Server/todo-server checksum with that cache after the build.
