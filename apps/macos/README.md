# Todo for Mac

The macOS 26 client uses native Liquid Glass and the HttpApi contract in
`packages/api/openapi.json`. Apple's swift-openapi-generator produces its
client. The app never opens SQLite or runs domain Task commands.

Owner sign-in stores a fixed Session in Keychain. The sidebar discovers
Profiles, Projects, Tags and counts. Today, Overdue, Scheduled and Inbox use
the server's planning results. Quick add works in the window and MenuBarExtra,
with server-parsed metadata and removable chips. The editor preserves drafts,
shows History and resolves stale Versions with explicit field choices.
SSE refreshes accepted changes and delivers committed ReminderFired operations
through UNUserNotificationCenter. Reconnect sends the saved per-Profile
Last-Event-ID. Settings shows the current sequence and resume cursor.
Command-Option-N opens the actual menu-bar quick add, including when the
display notch hides its status icon. Date values open a native calendar.

Compact mode collapses the window to a single 393 × 426 column. Use the toolbar
button, View > Compact mode, or Command-Shift-M. Navigate tasks replaces the
sidebar, and quick add and the editor open within the column. Expand window
restores the previous window size and position. The app remembers the mode.

Move to Profile, Revert from History, and Series create/edit/skip use the
S05 generated endpoints. Conflicts retain the draft and require an explicit
retry at the returned Version. Recurrence presets match Electron E02; custom
rules stay read only. The headless write-state recipe runs during native HOLD:

```sh
apps/macos/scripts/verify-write-state.py "$PWD/docs/evidence/w06/headless-new"
```

It compiles the production model and generated client, drives a compiled scratch
HTTP server, and checks durable SQLite state. It does not launch Todo or access
Keychain. See [verify-macos](../../.agents/skills/verify-macos/SKILL.md) for reusable
recipes and the remaining supervised visual proof.

Native verification is on HOLD after repeated Keychain prompts. See
[HANDOFF.md](HANDOFF.md) for current proof, required lifecycle follow-up and
the prerequisites for another attempt. Both native shell harnesses deny by
default; `TODO_VERIFY_NATIVE_UI=1` requires fresh user consent.

After that consent, the helper verifies and launches the user-built signed Release
app against its scratch server, database and CLI HOME. It never builds or signs. Follow the native CUA
drive in [verify-macos](../../.agents/skills/verify-macos/SKILL.md), then submit
the captured light and dark screenshots for coordinator design review.

Regenerate the client with `apps/macos/scripts/generate-api.sh`. Dependencies
are pinned in `API/Package.swift` and Package.resolved. The script derives an
OpenAPI 3.0.3 input from the canonical 3.1 schema because generator 1.14.3 drops
nullable anyOf fields. It also extracts the canonical SSE contentSchema and
adds presence-aware generated Codable encoding so omitted edits stay omitted
and explicit null clears a value. The canonical contract remains unchanged.
Round-trip and real scratch HTTP tests cover both forms. The generator runs
in release mode because its debug build overflows the decoder stack on this
expanded schema. Generated source is checked in for normal app builds.

`scripts/project.rb` generates Todo.xcodeproj with the xcodeproj Ruby gem.
The generated project uses automatic Apple Development signing, bundle ID
`local.todo.Todo`, and hardened runtime. `make sign-desktop` supplies
`TODO_SIGNING_TEAM` from `signing.local.mk` or the environment. Xcode's automatic
signing selects an Apple Development certificate for that team.
`TODO_SIGNING_IDENTITY` selects the Electron certificate. The bundled
server inherits Xcode's resolved signing identity and uses identifier
`local.todo.server`. Regeneration normalizes UUIDs twice because xcodeproj's
first pass includes the original target UUID in dependency hashes.

Agents never sign or run signed builds. Every agent xcodebuild command uses
`CODE_SIGNING_ALLOWED=NO`, and project signing settings stay unchanged. The user
runs `make sign-desktop` in their own Terminal to build the Release app at
`dist/signed.noindex/macos/Todo.app` and Electron at `dist/signed.noindex/electron/Todo.app`.
Signing disables timestamp requests. The command checks package age and disk
space, then records strict signature verification, team and designated
requirement in `dist/signed.noindex/signing-receipt.json`. `make -n sign-desktop` prints
the commands without executing them. App launches, hosted XCTest and Keychain
access by agents remain on HOLD.

Native sessions use that existing signed Release app without rebuilding.
App launches, XCTest and Keychain remain on HOLD until current consent.
Agent compile-only Xcode builds must set `CODE_SIGNING_ALLOWED=NO`,
`CODE_SIGNING_REQUIRED=NO` and an empty `EXPANDED_CODE_SIGN_IDENTITY`.
Run the disk guard first and keep DerivedData isolated for each build.
The app follows system appearance; the verification driver
can launch its process with the standard AppleInterfaceStyle argument for
dark screenshots without changing the user's system preferences. Final guarded
native proof and coordinator visual approval remain open.

Settings now offers a managed local server section. Status is read-only.
Install requires an explicit absolute database path and port. It copies the
bundled binary to `~/Library/Application Support/Todo/Server/todo-server` and
invokes S03 install. Repair / restart uses the installed executable, database
and port; it does not upgrade or replace an existing installation. Uninstall
removes the agent and plist, retaining data, logs and the stable executable.
The app's configured HTTP address is preserved; Settings shows any different
managed address and the explicit `--server` relaunch option.

The app target's Bundle compiled server phase runs `scripts/bundle-server.sh`
to place the compiled server in `Contents/Resources/Server/todo-server`.
For a standalone bundle artifact, run
`CODE_SIGNING_ALLOWED=NO apps/macos/scripts/bundle-server.sh /absolute/output/Server` from the checkout.
It compiles from installed pnpm dependencies, checks disk space, and never
installs a LaunchAgent. Xcode passes its signing identity to sign the nested
binary with Bun's explicit helper-only hardened-runtime entitlements in
`BunServer.entitlements`. `CODE_SIGNING_ALLOWED=NO` skips this signing step.
The headless recipe proves unsigned helper startup and HTTP without signing
or Keychain. A nonblocking TCP probe refuses occupied addresses
before a fresh install or unloaded repair changes the installation.
Missing, repeated or malformed `--server` values fail before credential setup;
config file destinations require the same absolute HTTP/HTTPS URL. Certificate signing, notarization and signed app runtime behavior remain
unproven under native HOLD.

The Foundation-only [lifecycle verification recipe](../../.agents/skills/verify-macos-lifecycle/SKILL.md)
uses the same lifecycle source, scratch HOME/DB, loopback and a unique label.
It proves headless lifecycle behavior only. It does not run Todo, XCTest,
Electron or Keychain and does not replace the held native Settings proof.
