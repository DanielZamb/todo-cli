# Todo Electron

The Electron client uses the shared Effect HttpApi for all server reads, writes
and SSE. Only the main process holds the Session. safeStorage encrypts it on disk.
The renderer has a sandboxed preload bridge with schema-validated requests and
replies. Neither process opens SQLite or executes domain task commands.

```sh
scripts/disk-guard.sh
pnpm install --frozen-lockfile
pnpm --filter @todo/electron typecheck
pnpm --filter @todo/electron test
/usr/bin/lockf -k /tmp/todo-own-work-electron.lock pnpm --filter @todo/electron build
```

Run these commands from the repository root with Node.js 22.12 or newer,
pnpm 10.30.1, Bun 1.4.4 or newer, and Xcode 26 for icon compilation. Run
`scripts/disk-guard.sh` before installing dependencies.

Build runs the required disk guard and creates unsigned
`apps/electron/dist/Todo.app` on macOS, with bundle ID `dev.todo.electron`.
Before copying Electron, the macOS package build runs the pinned package's
`install-electron` command. Electron 44.9.3 does not download its runtime during
`pnpm install`. The first package build needs network access to download the
runtime; later builds reuse it. Building does not launch the app. Verification
builds stay unsigned.

To verify a committed build from a clean export, run:

```sh
TODO_VERIFY_ELECTRON_PACKAGE=1 pnpm --filter @todo/electron test test/package-build.test.ts
```

This opt-in test exports `HEAD` into a new temporary directory, uses an isolated
HOME, pnpm store, and Electron cache, and checks disk space before installation
and packaging. It asserts that `Electron.app` is absent after installation, then
builds under the shared package lock and inspects the bundle without launching it.
The printed directory retains the clean export, `head.txt`, `commands.json` with
exit codes, `install.log`, `build.log`, and a `PASS` file after all checks pass.
Ordinary test runs skip this download and package check.

`scripts/sign-and-install.sh` signs and installs both desktop apps, the CLI, and
the server. `@electron/osx-sign` signs nested code with hardened runtime and
Electron entitlements, using `TODO_SIGNING_IDENTITY` and `TODO_SIGNING_TEAM` from
the environment or ignored `signing.local.mk`. Copy `signing.example.mk` at the
repository root to configure your own certificate. Timestamping is disabled. The staged
output is `dist/signed.noindex/electron/Todo.app`; the script then copies it to
`/Applications/Todo Electron.app`. Notarization remains separate release work.

Native verification remains on HOLD until current user consent. Signing does
not authorize app launches or Keychain access.
`TODO_SERVER_URL` defaults to
http://127.0.0.1:4310 and accepts loopback HTTP only. `TODO_ELECTRON_DATA` selects
an isolated app-data directory for verification.

```sh
TODO_SERVER_URL=http://127.0.0.1:4310 TODO_ELECTRON_DATA=/absolute/scratch/electron env -u ELECTRON_RUN_AS_NODE dist/signed.noindex/electron/Todo.app/Contents/MacOS/Electron
```

Use a provisioned scratch server. The app never initializes or migrates a database.
Native verification is held. For the authorized compiled host write proof, use
[verify-electron](../../.agents/skills/verify-electron/SKILL.md):

```sh
TODO_ELECTRON_VERIFY_HOST=1 .agents/skills/verify-electron/scripts/verify.sh "$PWD/apps/electron/evidence/host-new"
```

Profile, Project and Tag discovery, planning views, quick-add parsing and Task
History come from the shared HTTP contract. Project and Tag definitions can be
created through the Task editor. No fixture values replace missing server data.

The app retains quick-add and editor drafts across restart. SSE reloads visible
Tasks without replacing an open editor draft. A conflict compares the editor's
base Version, the proposed values and the latest accepted Task. Disjoint changes
merge; every differing overlap needs a choice. Transitions and Delete ask the
user to review the newest accepted Task before retrying if their Version is stale.

The Tray opens quick add in the app, as does Shift+Cmd+N. Closing hides the window;
Quit exits. ReminderFired operations create native Electron Notifications. Saved
cursors resume each Profile after a dropped stream and suppress repeat delivery.
Notification permission failures appear in the app. Native delivery proof also
requires macOS keychain access for the signed app; the human handles SecurityAgent.

Compact mode collapses the window to one 393 × 426 column. Use the toolbar
button, View > Compact mode, or Command-Shift-M. Navigate tasks replaces the
sidebar, and the editor fills the column. Expand window restores the previous
size and position while retaining the editor draft. window.json in userData
stores the selected mode.

The token values and base controls come from design/electron. D01-r2 polish uses
one Project and at most one Tag in row metadata, destructive overdue due text,
a consistent editor field surface and a History ghost button with an icon aligned
to Save changes. Row times omit the current zone and keep differing zones.

E02 exposes Move to Profile, History Revert and Series create/edit/skip through
the typed HttpApi client. The Recurrence row creates a new Series from an ordinary
task draft, or edits the selected Occurrence's Series. Custom rules are read only.
The host verification command in `.agents/skills/verify-electron/SKILL.md` uses an
in-memory scratch Session and never enters Keychain. Native proof remains held.
