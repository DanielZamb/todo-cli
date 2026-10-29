# Compact mode

## Sub-features

- Collapse to a 393 × 426 content area and restore the expanded frame.
- Replace the sidebar with a Profile menu and Navigate tasks for planning views and Projects.
- Open the editor in the same column and retain its draft when expanding.
- Keep the mode in window.json in the app's userData directory.

## How to get to it (user POV)

Click Compact mode beside Quick add, choose View > Compact mode, or press
Command-Shift-M. In Compact mode, Expand window restores the previous frame.
The editor also has Expand window and Back to tasks. Back to tasks uses the
existing Close editor behavior.

## Driving it with Playwright Electron

From the checkout root, run the parent's scratch host command:

```sh
TODO_ELECTRON_VERIFY_HOST=1 .agents/skills/verify-electron/scripts/verify.sh "$PWD/docs/evidence/compact-mode/electron-new"
```

This extends verify-electron using
`create-verification-skill`.
The host imports the production window-layout helper and uses the production
renderer, preload and validated IPC. It holds a scratch Session in memory.
It never imports safeStorage, launches the signed app or accesses Keychain.

verify-writes.ts calls scripts/verify-compact.ts. The drive clicks Compact mode,
checks the literal content size and top-left position, captures both appearances,
switches Profiles through the Profile menu, switches planning views through
Navigate tasks, and creates a task
through Quick add. It edits the title, expands and collapses while checking the
unsaved title, reads the saved mode from window.json, reloads the renderer,
saves, returns to tasks and checks horizontal overflow. The parent confirms the
created and edited task at Version 2 through public HTTP, then deletes the fixture.
The remaining write proof runs at the restored expanded size.

Require compact-light.png, compact-dark.png, compact-navigation.png,
compact-quick-add.png and compact-editor.png, the compactMode receipt in
result.json, and no page errors. Evidence survives scratch cleanup.

## Gotchas

393 × 426 describes content. Native window chrome increases the outer height.
Radio navigation entries explicitly use closeOnClick because Base UI keeps
radio selections open by default. Wait for the menu to close and for the new
Profile name before opening it again.

The host proves the shared window behavior, persisted value and renderer reload.
Production signed-app menu shortcuts, secure Session restoration and app startup
remain subject to the parent's native HOLD. Offscreen Mac proof is a separate
recipe in verify-macos.

F10 Compact proof is scripts/verify-profile-compact.ts, called by verify-writes.ts.
The Profile button beneath the view title opens only Profile choices, followed
by a separator and the destructive Delete item. This keeps the entire menu
visible with a long name instead of clipping a Profile row in combined navigation.
Capture compact-profile-delete-{menu,empty,refusal,tasks}-{light,dark}.png at
393 × 426. compact-profile-bounds.json must contain zero failures: every
surface and text line fits, all targets measure at least 32 px, Cancel and the
next/final action have an 8 px gap, and exactly one dialog action is dominant.
The Compact dialog uses Cancel without a duplicate small Close target. The
first step opens the explicit Task step; only the final red button Deletes.
The drive then Deletes through HTTP, receives the named notice and returns to Work.

## U02 Compact presentation

`verify-writes.ts` also runs `verify-compact-presentation.ts` against its fresh
compiled scratch server. It captures All tasks, Today, Overdue, Scheduled and
Inbox first, then the editor at both scroll ends, quick add, Settings entry,
empty, offline and error states, in light and dark. The offline capture uses a
production notice; the error capture rejects one list request in the host fixture.
The parent write drive still proves a real server disconnect separately. The nine temporary Tasks
are Deleted after capture.

Require `u02-compact-layout.json`. Each Task row is 56 px with a single title
line and at most one 18 px metadata line. Every visible control is at least
32 px in each dimension. Date, Project and whole Tag entries fit by measured
width and collapse to `+N`; the full names remain accessible. A single section
has no repeated heading and Compact has no count footer. The only list-header
actions are Expand window and Quick add; an empty or recovery screen keeps
its one central action. Settings > Appearance supplies the theme control.
`appearance.ts` is the shared drive helper for that entry. The native app menu
also provides Settings and Command-Shift-L for appearance, without a signed
app launch in this recipe.

The editor measurement scrolls the production form to the bottom and requires
an unchanged header rectangle, an opaque background and header hit testing
above the form. Screenshots use `u02-compact-*-{light,dark}.png`; full-window
regressions use `u02-full-list-{light,dark}.png`. Formatting unit tests assert
literal 0/1/2 Task counts, relative days, short weekdays, year boundaries,
local-midnight instants and foreign time-zone labels.

Compact editor Save stays in a fixed footer outside the scrolling form, using
the native form association for submission. The drive measures its bounds before
and after scrolling and saves through the same production command. Version
moves into Task actions; the expanded editor still shows it in its header.
Back clears a focused editor error so a cancelled Move cannot hide the list.
The existing external-id Move regression covers that return path.

Round 2 requires one Compact date, preferring Due to Scheduled. Its fixture has
both dates, Project Todo and three Tags; bounds checks require Todo and at least
one whole Tag beside Due. Expanded rows retain both dates. Header action centres
must match the view title centre. Every editor label sits above its control.
The selected Project wraps at rest, using the existing editable combobox when
focused. The long-name capture and text-range bounds require every word to fit.

Rows without metadata omit the metadata element and centre their title within
1 px of the 56 px row centre. The same bounds receipt checks this in both themes.
`verify-presentation-correctness.ts` retains loaded Tasks beside an unrelated
notification error, rejects one list read, then checks automatic recovery after
a successful real HTTP list response. With History closed, its clock crosses
midnight and requires `Due Tomorrow` to become `Due Today`. It also selects the
single-Task import fixture and requires `1 Task ready to preview`.

The compiled legacy write fixture includes cancelled and snoozed Tasks. The
correctness drive checks each visible status label and its horizontal bounds in
both appearances, then captures `compact-{cancelled,snoozed}-{light,dark}.png`.
Status stays beside Priority so metadata overflow cannot hide the lifecycle.
