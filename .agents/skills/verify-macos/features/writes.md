# Move, Revert and Series

## Sub-features

Move to Profile, Revert from History, Series create/edit/skip, recurrence presets,
custom-rule preservation, current-Version conflict retry and server rejection reasons.

## How to get to it (user POV)

Open a Task. Task actions contains Move to Profile. Expand History for Revert.
Select Set recurrence to create a new Series from the draft or edit an existing
Series. The Series sheet contains Skip Occurrence. New Series creation retains
the original Task, matching Electron E02.

## Driving it with headless Swift and scratch HTTP

Run `./scripts/swift-slot.sh apps/macos/scripts/verify-write-state.py "$PWD/docs/evidence/w06/headless-new"`
from the checkout root, using a fresh absolute evidence directory. The helper
compiles a server and provisioner, creates a scratch owner/database, checks the
server's health and runs the Swift Testing package in `apps/macos/Package.swift`.
It never builds or launches Todo, requests notifications, calls SessionVault,
or runs hosted XCTest. DerivedData stays under `apps/macos/DerivedData/StateProof`.

Production TodoModel, TaskDraft, History adapters and the generated client execute
in the test process. Fake ClientTransport tests cover literal payloads, offline
writes, conflict choices, unavailable Tasks and exact rejection messages. The live
test signs in directly through the generated HTTP client, keeps the Session in
memory, then drives production Series create/edit, skip, Revert, Move and a stale
skip. It completes and purges an earlier Occurrence with the compiled domain
provisioner, then verifies recurrence recovery from redacted History. The helper reads only its scratch SQLite database to check accepted
Versions, moved Profile and rejected History.

Read `commands.json`, `state-tests.log`, `http-receipt.json`, `durable-state.json`,
`cleanup.json` and `result.json`. PASS requires both Swift assertions and durable
state assertions. The helper stops only its own server and removes its scratch
directory. Evidence remains at the requested path. A failed run is not proof.

## Gotchas

This is a headless state and HTTP proof. It cannot prove glass, focus, native
menus, sheet sizing, VoiceOver or Keychain. The parent skill's native HOLD remains
in force. All xcodebuild commands must use CODE_SIGNING_ALLOWED=NO. Agents never
sign. The user runs make sign-desktop in their own Terminal for signed builds.
The headless test only initializes notification handling for ReminderFired,
which its scratch fixture does not generate. Do not add reminder fixtures here.

The helper routes SIGTERM and SIGINT through its cleanup. It reuses
`verify-macos-lifecycle/scripts/owned_process.py` to census and stop all groups
in each owned session. A command-unsafe marker retains scratch on uncertain
cleanup. Run `python3 apps/macos/scripts/test_write_state_cleanup.py -v` to
prove cancellation during compilation and during tests with descendant groups.
These black-box tests launch only disposable Python processes and a scratch
compiled server; they do not build or launch Todo.

The Project picker includes New Project, and the Tags menu includes New Tag.
The name prompt adds a pending name to the draft; Save changes creates it
through the shared domain command. The headless suite checks Task and Series
payloads, empty Project clearing and readable conflict names. Native prompt
layout remains held. The root SwiftPM lockfile must match the API package's
age-qualified pins before running this helper with automatic resolution disabled.

Task rows resolve and render every Tag name in locale-aware case-insensitive
order, including a fallback to the ID before discovery. The headless suite
asserts three names from an intentionally unordered Task and discovery list.
The unsigned build compiles the SwiftUI ForEach that renders them.

W07 extends the headless recipe with navigation-http.json and
navigation-durable.json. The real scratch server proves Save before selection,
Save before Move with the current Version, Profile Cancel/Discard and deletion
of another Task without replacing its draft. The database receipt requires the
moved Task at Version 4 and both deleted Tasks at Version 2.

W08 adds saveDuringConflictNeverWritesOrNavigates. It calls the navigation
Save action during a Conflict with and without a latest Task, while a field
choice is already set. It requires false, the original draft and pending Task
selection, and zero transport requests. The alert omits Save during a Conflict.
