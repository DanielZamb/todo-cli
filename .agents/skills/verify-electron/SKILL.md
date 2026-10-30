---
name: verify-electron
description: Drive the compiled Todo Electron app with Playwright Electron against a compiled local HttpApi server and CLI on scratch SQLite. Use after Electron IPC, safeStorage, views, editing, conflict, SSE or native notification changes.
---

# Verify Electron

Created with `create-verification-skill`.
Read [the feature map](features/README.md) before selecting coverage.

## Launch

Native UI verification is on HOLD for the 2026-10-27 run after repeated
Keychain prompts. Do not run the signed app, secure-storage verifier or retries until
the user explicitly consents to another interactive attempt. The E02 task
authorizes the separate compiled host write drive below without Keychain. Earlier consent
does not carry over. Static checks remain allowed.

The shell helper defaults to exit 78 before evidence, scratch or helper
process creation. Signed verification requires `TODO_VERIFY_NATIVE_UI=1` and current consent.
`TODO_ELECTRON_VERIFY_HOST=1` selects the separate write-only host.
The variable does not grant consent: never export it globally or reuse it for
an unattended retry. The direct `verify:compiled` command and manual app
launch are subject to the same hold. The direct signed verifier also rejects
host mode; use the separate host write drive below.

Resolve the checkout with `git rev-parse --show-toplevel`. From that root run:

```sh
TODO_VERIFY_NATIVE_UI=1 .agents/skills/verify-electron/scripts/verify.sh "$PWD/apps/electron/evidence/compiled-new"
```

Choose a new absolute evidence directory. Host mode runs the disk guard and
builds unsigned production main, preload and Vite renderer bundles. Default
`pnpm --filter @todo/electron build` also assembles an unsigned
`apps/electron/dist/Todo.app`. Agents never sign or run signed builds.

For a native session, the user first runs `make sign-desktop` in their own
Terminal. It writes `dist/signed.noindex/electron/Todo.app` and a signing receipt.
The helper verifies and drives that existing app without rebuilding it.
The bundle ID is `dev.todo.electron`. Configure your team and certificate using
`signing.example.mk` and ignored `signing.local.mk`, or the `TODO_SIGNING_TEAM`
and `TODO_SIGNING_IDENTITY` environment variables. Signing disables timestamps.
This command does not grant native consent or lift HOLD.

Both modes compile the server, CLI and S01 scratch provisioner with Bun.
The server binds loopback port 0. The database, CLI HOME and Electron userData
are unique scratch directories. Builds stop at the first failure. Inspect
`commands.log` before retrying. Native Electron keeps the real HOME for Keychain;
it never opens the owner's Todo database. Do not install Bun.

Only after new consent, a manual drive uses explicit scratch settings:

```sh
TODO_SERVER_URL=http://127.0.0.1:4310 TODO_ELECTRON_DATA=/absolute/scratch/electron env -u ELECTRON_RUN_AS_NODE dist/signed.noindex/electron/Todo.app/Contents/MacOS/Electron
```

Use a provisioned scratch server at that URL. The Tasks heading means signed in.
macOS may ask for keychain access after signing changes and notification permission
on first delivery. The human must handle SecurityAgent. Do not bypass it or use
plaintext storage. If permission is unavailable or cancelled, stop and report
native delivery as blocked. Do not relaunch or ask for repeated passwords.

## Doctor

Run `bun --version`, `pnpm --filter @todo/electron typecheck` and
`codesign --verify --deep --strict dist/signed.noindex/electron/Todo.app`.
The helper requires the server's literal `/health` response
`{service:"todo-server",contract,build}` and the child Electron window's Todo title.
Use `commands.log`, `server.log` and `electron.log` to distinguish a build failure,
keychain gate, rejected API write or stream disconnect. Only drive the app instance
started by this helper. Each run owns its server port and userData.

## Drive

The helper invokes `pnpm --filter @todo/electron verify:compiled <scratch> <evidence>`.
`apps/electron/scripts/verify.ts` uses Playwright's `_electron.launch` on the compiled
signed app and its `firstWindow`. Interact with accessible handles such as
`getByLabel("Owner passphrase")`, `getByRole("button", {name:"Sign in", exact:true})`,
`getByRole("button", {name:"Profile", exact:true})`, then a Profile
`menuitemradio` with `data-profile-id`, the Planning views navigation, `getByLabel("Title", {exact:true})`
and `getByRole("button", {name:"Save changes", exact:true})`.

The drive signs in, quick-adds through the server parser, edits, conflicts with a
real compiled CLI write, chooses a resolution, completes/reopens and observes
another compiled CLI creation through SSE without clicking Refresh. It reads
real discovery counts, planning sections and accepted/rejected task History.
It verifies draft and encrypted Session restoration after restarting the app,
and disables writes after the server stops.
A public HTTP PATCH sets an instant due time. The scheduler commits ReminderFired;
its sequence must match Electron's real Notification `show` event. A controlled
server drop exercises reconnect with the saved Last-Event-ID and delivery of a
CLI write committed while disconnected. A date-only due value must not fire.
The proxy records the actual Last-Event-ID request header in `stream-requests.json`.
Restart must not emit a second native show event for the same reminder sequence.

When a signed-app OS gate blocks native proof, the separate partial command is:

```sh
TODO_ELECTRON_VERIFY_HOST=1 .agents/skills/verify-electron/scripts/verify.sh "$PWD/apps/electron/evidence/thin-new"
```

This builds production main, preload and renderer bundles, plus the separate
`scripts/write-host.ts` fixture in the installed Electron host. The fixture uses
the production task HttpApi handler, validated IPC and sandboxed preload/renderer.
It signs into the scratch server and holds its Session in memory. It never imports
safeStorage, writes credentials, signs a bundle or delivers native notifications.
The fixture reads real SSE readiness and disconnection to drive connection state.
It does not exercise production SSE cursor persistence or reconnect. It reports
THIN_PASS_NATIVE_BLOCKED. It cannot satisfy G2, G4, secure-storage restoration,
notification, production SSE or production authentication proofs. Earlier E01 receipts remain.

`scripts/verify-writes.ts` drives Move to Profile, Revert and Series create/edit/skip
with real 409 responses caused by compiled CLI edits. It checks the destination
Profile, Project and Tags resolved by name, accepted inverse History, next Occurrence, saved
presets, a deleted legacy predecessor, source Profile retention and explicit destination opening,
a real 422 reason, and a custom rule's read-only view. It checks Mon through Sun
labels, tests Reopen for open/done/cancelled Tasks, and waits for the
visible Revert button before capturing History. F01 also checks changed values, plain rejection reasons, local-time tooltips and the absence of Revert on Created, rejected and already-reverted entries. It captures `history-rejected-reverted.png` after the inverse is accepted. A literal date-only fixture must
read `Due Today`. It captures `series-day-labels.png`, `date-only-due.png`,
`editor-recurrence.png`,
`task-actions-move.png`, `history-revert.png`, and the Series dialogs.

Move to Profile, Revert and Series use the S05 HttpApi endpoints. The Project
combobox and Tag input offer a Create row for a new name. Tags commit on Enter
or comma. Names resolve through the same domain command as CLI writes.
Quick add also sends parsed names to that command. The host forwards actual
committed-operation notices to refresh discovery without clicking Refresh.
It still does not implement production cursor persistence or reconnection.

The host drive captures `project-create-row.png`, `tag-create-row.png`,
`metadata-saved-task.png` and `metadata-conflict-names.png`. It checks the saved
Task at Version 2, GET discovery names and a compiled CLI conflict with a new
Project. It uses a distinct Tag name because the fixture already defines focus.

The [Compact mode drive](features/compact.md) runs first in the same scratch
host. It checks a 393 × 426 content area, Profile and planning navigation,
task creation and editing, draft preservation, window frame restoration and
the persisted mode after a renderer reload. The host shares production window
sizing code. Signed-app launches and native menu interaction remain held.

## Evidence

The selected directory retains screenshots, Playwright traces, redacted action
receipts, compiled-app logs, the read-only SQLite History and result.json.
Capture the action and its resulting UI. Native delivery requires the actual
Notification `show` event and its committed operation sequence, not a mock,
renderer toast or successful `.show()` invocation. The harness does not replace
Notification, safeStorage or HttpApi. Passphrases are synthetic scratch fixtures;
no owner credentials enter the drive. Never record bearer credentials.
Screenshot paths and docs go to the coordinator for visual approval.

## Cleanup

The TypeScript finalizer closes only its own Electron app and server, including
on failure. The shell trap removes only the directory returned by its mktemp.
Server shutdown escalates from SIGTERM to SIGKILL after two seconds so a live
SSE connection cannot stall the drive. Repeated cleanup recognizes signal exits.
Evidence is outside scratch and must survive teardown. Never kill by process
name. If macOS blocks a child on a SecurityAgent prompt, have the human dismiss
or approve that prompt before retrying cleanup. Inspect the child PID before
terminating a stuck run. A failed drive must not become a second concurrent drive.

The checkout owns `.claude/skills/verify-electron`, linked relatively to this
skill. Confirm `realpath .claude/skills/verify-electron` resolves here. Fresh Claude
session discovery is a separate check; filesystem resolution alone does not prove
registration. Preserve existing links.

## Helpers

Executable `scripts/verify.sh <absolute-new-evidence-directory>` is the full
build, provision, drive and cleanup command. The package's `scripts/verify.ts`
is its Playwright driver. Use `/maintain-verification-skill` when app behavior changes.

## Diagnostics during HOLD

The [Diagnostics recipe](features/diagnostics.md) uses a dedicated unsigned
compiled host and production window helper. Its standalone command is
`.agents/skills/verify-diagnostics/scripts/verify-electron.sh <absolute-evidence-directory>`.
Electron builds run through `/usr/bin/lockf -k /tmp/todo-fixes-electron.lock`.
Signed-app and Keychain verification remain held.
## Snapshot Settings during HOLD

The [Owner Snapshots recipe](features/snapshots.md) selects
`TODO_ELECTRON_VERIFY_HOST=1 TODO_VERIFY_SNAPSHOTS=1` with the existing helper.
It proves Create, preview, Restore, reload, and a later compiled CLI write through
the actual renderer, and captures both appearances. Native HOLD stays in force.
## Import proof

`scripts/verify-writes.ts` also calls `apps/electron/scripts/verify-import.ts`.
The compiled host chooses JSON files through the production file input, previews
one created, one updated, one unchanged and one rejected Task, applies accepted
rows, then produces a real Conflict with a compiled CLI edit. It captures file,
preview, result and Conflict states in both appearances and layouts. CLI show
checks the durable title and Version. Compact uses stacked rows and retains a visible scroll edge above the footer. Each layout also captures a 12-Task preview and scrolls to the last row. The drive checks Apply counts, skipped-item text, Created field wording and footer bounds. Competing edits to file items skip all cancellation candidates. A deliberately delayed File.text read proves an obsolete file cannot replace a later preview.
For iterative work, `apps/electron/scripts/verify-import-dev.ts <evidence>` uses
the worktree's recorded `.scratch/server.json` and cached CLI. It closes only
its Electron host; the scratch helper owns the long-lived server.

Compact import uses one line of non-zero totals and four complete 56 px rows in
a 224 px scroll viewport. Change… is beside the filename in both layouts and
opens the file chooser directly. The drive chooses a replacement and previews
it, measures all button targets at 32 px or more after animations finish, and
records whole/partial row counts in `import-layout.json`. The 4/8 px spacing
steps group each row and separate it from the next. The iterative helper resets
its owned host to full window and light appearance before driving both modes.
U01 adds the [Project and Tag matrix](features/metadata.md), with full and Compact
quoted-name quick add, editor controls, reload, second-client SSE and row bounds.

The Profile deletion status uses the accessible name "Profile deleted" to
separate it from the existing "Changes saved" status.

C10 adds Move and Copy to each Task row context menu and the editor action menu.
The compiled-host drive copies through a stale-Version Conflict, checks source
isolation and provenance, and retains `c10-copy-light.png` and
`c10-copy-dark.png`. The result stays in the source Profile and offers Open in the destination.
Move returns to the source list. Transfer Conflicts use Copy latest or Move latest
without the editor field-merge controls.

`TODO_SERVER_BINARY`, `TODO_CLI_BINARY`, and `TODO_SEED_BINARY` let the host drive
reuse compiled inputs from the worktree's source-hash cache. Each behavior drive
still provisions a fresh database. The package build takes the shared Electron
lock in the shell helper.

The transfer regression helper also drives draft preservation and cross-Profile
Revert. Its `transfer-regressions.json` lists all three literal UI and durable
write assertions. A passing report requires every scenario to pass.

U02's [Compact presentation](features/compact.md#u02-compact-presentation) adds
per-view bounds, count, target, metadata and sticky-header assertions. Its
appearance helper opens Settings, then Appearance, from Compact navigation.

## Version guardrails

The focused compiled host proves old-health and fake-contract blocking, exact Status membership and disabled planning Status, with Compact-first captures. See [the feature recipe](features/sessions.md) for commands and expected evidence.

Run `TODO_ELECTRON_VERIFY_HOST=1 TODO_VERIFY_VERSION_GUARDRAILS=1 .agents/skills/verify-electron/scripts/verify.sh "$PWD/docs/evidence/version-guardrails/electron-new"`. Never wrap this helper in the Electron build lock. Native and Keychain verification remain on HOLD.
