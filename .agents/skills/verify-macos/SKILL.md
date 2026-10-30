---
name: verify-macos
description: Verify the compiled macOS 26 Todo SwiftUI app against scratch HTTP and CLI writes, with explicit current consent for native UI. Default invocation is held before any build, app, evidence or scratch creation.
---

# Verify Todo for Mac

Created with `create-verification-skill`.
Read [the feature map](features/README.md) before selecting coverage.

## Native verification is on HOLD

The user stopped the 2026-10-27 run after repeated Keychain prompts. Do not
launch Todo, XCTest, Keychain checks or retries until the user explicitly
consents to another interactive attempt. Earlier consent does not carry over.
Unit tests that launch the hosted app or access Keychain count as native
verification. Static checks, `scripts/test_native_guard.py` and the [offscreen design proof](features/design.md) are allowed.

Both macOS and Electron shell helpers default to exit 78. They require
`TODO_VERIFY_NATIVE_UI=1` and current user consent. The variable is necessary,
but setting it does not grant consent. Never export it globally or reuse it
for an unattended retry. macOS `drive.py`, `run-ui-tests.py` and `actions.py`
apply the same guard before reading run configuration or starting work.

## Prepare one authorized attempt

Require macOS 26, Xcode 26, Bun, installed pnpm dependencies and a logged-in
desktop. Never install Bun or use the owner's Todo database. Keep DerivedData
inside `apps/macos`. Run the orchestration disk guard before every build or
install. Exit 3 means stop.

N01 addresses the cleanup defects with synthetic Python proof only.
See `apps/macos/HANDOFF.md` for the commands and bounded review receipt.
Both N01 review rounds are used. The last independent verdict is CHANGES
REQUIRED; its two findings were fixed and proven locally afterward, without
a third review or native execution.
Before requesting another attempt, establish a stable signing identity and
an unlocked, user-approved Keychain access path. The UI runner must load
with the project's hardened-runtime settings. Do not change the app's
signature or entitlements between Session creation and restore. Do not
weaken Keychain ACLs, substitute plaintext storage or broaden trust.

The verification-only `TODO_VERIFY_KEYCHAIN_NO_UI=1` policy disables Keychain
interaction in the process before model creation. Production Keychain
queries, accessibility and ACLs remain unchanged. A rejected or cancelled
operation records only OSStatus in `DerivedData/keychain-failure.json`.
The monitor stops the owned build on that receipt, cancellation or timeout.
There is no automatic retry. This path has static and Python proof only;
its native behavior must be checked during a future authorized attempt.
The policy uses the legacy Security interaction API matching the existing
Keychain storage and produces a deprecation warning.

A recorded failure blocks later attempts even with the opt-in variable.
Review and archive that receipt only after new consent and a resolved cause.
Do not clear it as an automatic recovery step.

## Launch after new consent

Resolve the checkout with `git rev-parse --show-toplevel`. Regenerate the
client after contract changes with `apps/macos/scripts/generate-api.sh`.
Use a new absolute evidence directory for the authorized attempt:

```sh
TODO_VERIFY_NATIVE_UI=1 .agents/skills/verify-macos/scripts/verify.sh "$PWD/apps/macos/evidence/native-new"
```

The user first runs `make sign-desktop` in their own Terminal. It builds the
Release app at `dist/signed.noindex/macos/Todo.app`, with the configured team, and writes
`dist/signed.noindex/signing-receipt.json`. Agents never run that target or sign code.
Use `make -n sign-desktop` to inspect its commands without executing them.
This does not lift HOLD.

The helper builds only a scratch server, provisioner and compiled CLI, checks
loopback health and verifies the existing signed Release app. It never rebuilds
or re-signs that app. It launches that exact artifact and prints
`READY FOR NATIVE UI DRIVE`. Keep the session alive. Configuration is in
`apps/macos/DerivedData/verification.json`; it contains owned paths, PIDs,
loopback URL and isolated service names, without credentials.

Check build and server logs on failure. Health must be exactly
`{service:"todo-server",contract,build}`. `listener.txt` must show only the owned loopback
listener. Do not concurrently drive this bundle ID. Stop at the first
Keychain block, cancellation or unavailable interaction. Do not relaunch.

## Drive the compiled surface

Use `cua_repl` with the absolute `dist/signed.noindex/macos/Todo.app` path. Read fresh AX state
after actions. Save app screenshot bytes and AX text at each checkpoint.
External mutations use `actions.py` with the same per-command opt-in and
current consent. They use public HTTP or the real compiled CLI.

1. Capture `01-sign-in`. Sign in with `scratch verification passphrase`.
2. In All tasks, add `Native UI created`; capture `02-quick-add-glass`.
   Edit to `Native UI edited`, capture `03-editor`, save, complete and reopen.
3. Draft `Your conflict resolution`, run `actions.py compete`, and save the
   stale draft. Capture `05-conflict-unselected`. Require both titles and a
   disabled Save resolution until you choose the overlapping field.
4. Run `actions.py live`. Require `CLI live write` without refresh and capture
   `06-live-cli-write`. One specifically authorized same-binary relaunch
   must restore the Session; capture `07-keychain-restored`.
5. In Settings, choose Enable notifications once. On the first request,
   expect a macOS dialog asking whether Todo may send notifications, with
   Allow and Don't Allow choices. The app shows Awaiting approval while the
   request is pending. Pause automation and let the user choose Allow.
   A pending system dialog is not a failed inspection to retry. If computer
   use cannot inspect the dialog, hand control to the user and resume only
   after their response. Never click Allow for the user, change System
   Settings or retry a denied or failed request during this attempt.
   Require Allowed after approval. Existing permission can return Allowed
   without a dialog. A denial shows Disabled in System Settings.
   A thrown error appears in Notifications and notification-receipt with
   the NSError domain, numeric code and description; the same line is in
   app.log. Retain these and notification-gate.txt/png, then stop that check.
6. Run `actions.py reminder 5`, `stop-server` before the due instant,
   `disconnected` while stopped, and `restart-server` after it. Require
   read-only controls, then automatic delivery of `CLI while disconnected`.
   Capture `08-resumed-delivery`, offline state and Settings cursor values.
7. Save `sse-recovery.json` with observed `resumeCursor`, `liveSequence`,
   `reconnects` and `readOnlyObserved: true`. Save `native-reminder.json` with
   delivered status and exact committed sequence/OS receipt, or blocked
   status and the actual permission reason. The driver checks scratch SQL.
8. Run `actions.py fixtures`. Capture Today, Overdue, Scheduled and Inbox as
   `11-domain-today`, `13-overdue`, `14-scheduled`, `10-domain-inbox`.
   Check empty search and personal Profile isolation (`12-profile-isolation`).
9. In work, open the actual MenuBarExtra with Command-Option-N. Enter
   `Menu bar task tomorrow p1`, clear Due, capture `15-menu-bar-quick-add`
   and submit. Require a durable P1 Task with no due date.
10. Save the actual actions in `ui-actions.json`. Save `ui-proof.json` with
    `passed: true` only after the core checks pass, including any notification
    gate. For CUA-only completion, create `finish-proof`.

Focused XCTest is a separate gap. `make sign-desktop` builds the apps only.
The focused helper requires a user-prepared signed `dist/signed.noindex/macos/Todo.xctestrun`
and test runner in that directory. It uses `test-without-building` and never builds
or signs. Without that separate artifact, use the CUA path and retain the test gap.

If the authorized attempt includes one focused XCTest capture, release CUA
screen control and run exactly one `run-ui-tests.py light` or `dark` with the
per-command opt-in. Complete `ui-proof.json` first. The helper pauses the
owned driver, uses a separate service, signs in and restores the same binary,
then captures MenuBarExtra, calendar, editor and planning windows. It never
relaunches the driver's app. Success finishes the existing core proof;
failure writes `abort-proof` and ends the attempt. Another mode or retry
requires fresh consent and a new owned session. The `unit` mode also accesses
Keychain and is subject to the same hold.

## Evidence and cleanup

Keep commands, exits, SQL assertions, native captures and matching AX,
`ui-actions.json`, `ui-proof.json`, `native-reminder.json` and `result.json`.
A screenshot cannot prove a write. The driver expects the resolved Task at
Version 7, two CLI Tasks at Version 1, rejected History, P1 menu creation and
one committed ReminderFired. An interrupted run is not a passing proof.

Focused cleanup waits one second after TERM, then one second after KILL,
and aborts if an owned process survives. It signals macOS audit tokens so
PID reuse cannot redirect cleanup or driver resumption. App executable
ownership and driver command validation are bound to the captured tokens.
The focused outcome is published before the driver resumes. Deferred
cancellation revokes success through resumption. A missing driver must stop
the helper before app termination or build launch. Missing process
identity or permissions fail closed. Cancellation during build cleanup returns
130 before the app launch check. The focused entry and build helper restore
the original signal handlers even on cleanup failure. These paths have only
synthetic Python proof; hardened native process access remains unproven.

The driver stops its owned app and server; the shell removes its scratch
files. No harness finalizer calls Keychain or automatically relaunches an app.
Run-owned service names are recorded for later human-approved cleanup.
Never kill by process name or delete another worker's data.

The relative `.claude/skills/verify-macos` link resolves to this skill.
Fresh Claude discovery is untested. Current retained proof and gaps are in
`apps/macos/HANDOFF.md`. Do not claim complete delivery from the older captures.

## Headless lifecycle proof during HOLD

The separate [verify-macos-lifecycle](../verify-macos-lifecycle/SKILL.md) recipe
compiles only a standalone Foundation driver plus the shared lifecycle source
and the Bun server. It is authorized during HOLD with a unique verify label,
scratch HOME/database and loopback. It never builds or runs Todo and cannot
prove native Settings, signing or Keychain. The full flow above remains held.

## Compile without launching

The checked-in Xcode project passed an unsigned compile with
`CODE_SIGNING_ALLOWED=NO`, `CODE_SIGNING_REQUIRED=NO` and an empty
`EXPANDED_CODE_SIGN_IDENTITY`. The app included the executable bundled server.
See [the command and artifact receipt](../../../docs/evidence/resume-20261027/w02/unsigned-build.json).
No app or XCTest was launched. This proof does not lift the interactive hold
or change production signing settings.

## Headless contract proof during HOLD

After changing event schemas, regenerate the checked-in API and run the
[headless contract recipe](features/contract.md). Its helper is
`apps/macos/scripts/verify-purge-contract.sh <absolute-new-evidence-directory>
<absolute-scratch-http-history-receipt>`. It compiles and runs only the API
library and a Foundation executable. It cannot launch Todo, XCTest or Keychain.
The interactive verification hold remains in force.

## Headless notification permission proof during HOLD

Run `sh apps/macos/scripts/verify-notification-permission.sh`. It compiles
only NotificationPermission.swift and a Foundation driver in a temporary
directory. It injects authorization and registration errors, asserts their
literal receipts and checks allowed/denied outcomes and registration order.
It does not load Todo, request notification permission, run XCTest or call
Keychain. The matching XCTest source is included in the project but remains
unexecuted during HOLD.

Reminders registers Bundle.main.bundleURL with LaunchServices before creating
UNUserNotificationCenter. This covers the driver's direct executable launch
from DerivedData. Registration failure stops authorization and reports the
OSStatus domain and code. Debug uses the stable local.todo.Todo identifier,
the configured signing team and hardened runtime. Do not re-sign between Session creation
and restore. No push entitlement or notification usage-description key is
needed for these local reminders. See the W05 evidence for the stale bundle
record diagnosis and the remaining supervised permission proof.

## Headless write-state proof during HOLD

The [Move, Revert and Series recipe](features/writes.md) runs
`apps/macos/scripts/verify-write-state.py <fresh-absolute-evidence-directory>`.
It compiles the production model and generated client in a separate Swift
Testing package, with no hosted app, notification request or Keychain call.
It drives a compiled scratch server and checks durable Versions and History.
Current proof is in `docs/evidence/w06/headless-r5/`. Native visual verification
remains held. This recipe extends the existing macOS subsystem skill using
`create-verification-skill`.

Agents never sign code. Every xcodebuild command must use
`CODE_SIGNING_ALLOWED=NO`; leave project signing settings unchanged. Signed
builds come only from `make sign-desktop`, run by the user in their Terminal.

## Headless History formatting proof during HOLD

Run `scripts/verify-history.sh <fresh-absolute-evidence-directory>` from this
skill directory, or invoke it by its checkout-relative path from the root.
It copies the production ClientReads, TaskSnapshot and Recurrence sources and
HistoryFormattingTests into a temporary Foundation-only Swift Testing package.
No dependency resolution, Todo app, hosted XCTest, notification code or Keychain
code enters this package. It proves labels, changed values, local/relative times,
rejection reasons, redacted content and Revert eligibility. `tests.log` and
`result.json` survive scratch cleanup. Read [History](features/history.md).

## Offscreen Compact mode proof during HOLD

The [Compact mode recipe](features/compact.md) uses the existing offscreen
design helper. It verifies window collapse and frame restoration in unordered
AppKit windows, then renders the 393 × 426 single-column content in both
appearances. It never launches Todo.app or restores a Session. Native toolbar,
menu and keyboard interaction remain subject to the hold above.

## Diagnostics during HOLD

Follow [Diagnostics](features/diagnostics.md) for the regenerated client,
production TodoModel state tests, offscreen live/empty/error captures in both
appearances and sizes, identifier preservation, and unsigned compilation.
One-second polling backs off after errors to at most 30 seconds. The agent
NDJSON read is proven by [verify-diagnostics](../verify-diagnostics/SKILL.md).
Every Swift verification script, swift build/test and xcodebuild uses
`./scripts/swift-slot.sh`.
Nothing here lifts native HOLD.
## Headless Snapshot proof during HOLD

Read [Owner Snapshots](features/snapshots.md). Run the existing state helper with
`--snapshots-only` under `./scripts/swift-slot.sh`. It isolates
the database-wide restore from other live write tests. The offscreen helper
includes full and Compact Settings, confirmation, empty, loading and error states.
GeneratedContractTests preserves the Snapshot request/report coding contract;
its matching unhosted Swift Testing case runs without launching Todo.app.
## Attachment proof during HOLD

Read [Attachments](features/attachments.md). The production model is driven by
`AttachmentStateTests` through the generated attach, detach and image upload
endpoints against the compiled scratch server. Offscreen editor and row renders
cover full and Compact windows in both appearances. Opening-decision tests
refuse executables and bundles without calling NSWorkspace. Run every Swift
build, test and verification script through the shared lock named in standing
order 22. The native and Keychain HOLD remains in force.

## Headless import proof during HOLD

Read [Import Tasks](features/import.md). The write-state helper now runs
ImportStateTests and the unhosted GeneratedContractTests. Its import receipt
checks literal create/update/unchanged counts, reload and a competing write.
The design helper produces 246 PNGs, including 36 import captures across both
appearances and layouts. It reuses DerivedData/StateProof to avoid recompiling
the same generated contract for the design drive.
U01's [Project and Tag matrix](features/metadata.md) proves quoted names through
production state, reload and second-client SSE, and captures both name sheets.

## Profile deletion

The [Profile deletion recipe](features/profiles.md) covers the standalone
generated contract tests, production TodoModel on compiled scratch HTTP,
SSE switching and reload, offscreen confirmation states in both window sizes,
and unsigned Xcode compilation. It is allowed during native HOLD.

## Move and copy between Profiles during HOLD

Use [the transfer recipe](features/transfer.md). C10 adds a generated Copy contract,
standalone GeneratedContractTests, completed-Task Copy and Move through TodoModel,
reloads in both Profiles, and durable source-isolation assertions. Offscreen
captures include the action menu, both destination pickers, result, Conflict,
and empty-picker states in full and Compact layouts. The unsigned build remains
compile-only. No native app, signing, Keychain, or real data enters this recipe.

During the shared UI and CLI fixes run, wrap every Swift build, test, verification
script, and xcodebuild in `./scripts/swift-slot.sh`. Scratch
server readiness deadlines are at least 60 seconds. Use a fresh evidence path
for each completed or failed attempt.

U02's [Compact presentation](features/compact.md#u02-compact-presentation) adds
measured offscreen bounds for the shared editor header, whole row metadata and
recovery controls, plus production TodoModel formatting proof after reload.

## Version guardrails

Headless StateTests prove stale-health blocking, exact Status membership and the enabled states of the five native filter controls. The offscreen recipe captures both new states in both layouts and appearances. See [the feature recipe](features/session.md) for commands and expected evidence.
