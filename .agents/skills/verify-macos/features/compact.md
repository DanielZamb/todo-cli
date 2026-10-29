# Compact mode

## Sub-features

- Collapse to a 393 × 426 content area, matching the iPhone 15 Pro logical
  width and half its logical height.
- Restore the previous expanded window frame.
- Choose a Profile, planning view, Project or Tag from Navigate tasks.
- Search, add and edit tasks in one column. The task editor replaces the task
  content, and Back to tasks closes it using the existing Close behavior.
- Keep the selected mode across launches.

## How to get to it (user POV)

Click Compact mode in the window toolbar, choose View > Compact mode, or press
Command-Shift-M. In Compact mode, the toolbar button becomes Expand window.
Navigate tasks replaces the sidebar. The plus button opens quick add inside
the column. Selecting a task opens its editor inside the column.

## Driving it with offscreen Swift Testing

Run `apps/macos/scripts/verify-design.py <fresh-absolute-evidence-directory>`
from the checkout root. This extends verify-macos using
`create-verification-skill`.
The recipe is allowed during native HOLD and never launches Todo.app.

Require exit 0 in commands.json, the WindowLayoutTests pass in presentation.log,
and compact-sign-in, compact-main, compact-offline, compact-empty,
compact-quick-add, compact-editor and compact-conflict PNGs in both appearances.
Each PNG is 786 × 852 pixels, a 2x capture of the 393 × 426 content area.
Read the images and check that the controls fit and the task content scrolls.

WindowLayoutTests checks collapse and expansion on unordered AppKit windows.
The first check uses production RootView and verifies that collapse preserves
the top-left position, expansion restores the previous frame, and a second
collapse returns to 393 × 426. The other check starts compact and expands to
the default 1100 × 760 content size. Neither test restores a Session.

After fresh native consent and a user-signed build, use the parent skill's
scratch session. Click compact-mode, inspect the window size, open
compact-navigation and choose a planning view, search through compact-search,
add through compact-new-task, then edit and return through compact-back.
Capture each result with fresh AX text. Expand and confirm the previous frame
and draft survive the layout switch. Restart only if that attempt explicitly
authorizes a restart, then confirm the saved Compact mode selection.

## Gotchas

The 393 × 426 size describes content. Native titlebar and toolbar chrome add
to the outer frame. Manual resizing can make the compact window larger.
Offscreen captures omit native chrome, focus and menu interaction. The toolbar,
shortcut, menu, persisted mode and interactive scrolling remain supervised checks
under the parent skill's native HOLD. Do not launch or sign the app to fill
those gaps without the required authorization.

## U02 Compact presentation

The offscreen design recipe now renders 246 PNGs, including F12 Diagnostics. U02 adds each planning view,
a load error and the Settings entry in both appearances. `compact-layout.json`
records production header, Back, Task actions, row, metadata and target bounds.
Back and Task actions share a row, with at least 8 pt between them. Navigation,
add, completion and recovery targets measure at least 28 pt. Compact rows use
a 56 pt height, one title line and one metadata line. Date, Project and whole
Tag entries appear in that order with `+N` overflow and full accessible names.
Native List scroll edges remain native.

The empty, offline and error messages have one sentence and one central action
inside the content area. Their header has no competing add action. Import and
Settings are secondary navigation-menu actions. `compact-settings-entry` renders
the production utility actions in fixture menu chrome; actual native menu,
keyboard and SettingsLink interaction remain held.

The headless write-state recipe also runs
`compactFormattingSurvivesModelSaveAndReload`. It saves Due and Scheduled
through production TodoModel and compiled scratch HTTP, reloads the accepted
Task, and asserts Version 2, `Today 9:00 AM`, `Tomorrow` and `1 task`. The helper
checks the literal `u02-formatting-http.json` receipt and the durable scratch
row. Presentation tests cover 0/1/2 counts and local versus foreign zones.
No HttpApi contract changes are introduced by U02; the integrated F13 contract
and GeneratedContractTests remain included in the standard headless proof.

Round 2 hides automatic Compact separators and renders one measured Divider per
Task at the text-column inset. Separator x-ranges must match across all rows.
Compact section headers use a 12 pt gap from the preceding row and retain heading
accessibility traits. Full-window native sections and separators keep their layout.
A Compact date prefers Due, otherwise Scheduled; PresentationTests asserts both
literal choices while full rows still show independent Due and Scheduled values.

The import readiness line uses the shared capitalized count helper. Literal
0/1/2 tests cover it, and `import-single-file-{light,dark}` captures the one-Task
document in full and Compact layouts with `1 Task ready to preview`.

`compactActionErrorRetainsLoadedTasksAfterRefresh` triggers a stale-Version
Complete against compiled HTTP after another client Cancels the Task. It checks
the action notice separately from the load error, refreshed Tasks, a second
refresh and the durable Version 2 cancelled Task. Require the literal
`u02-action-error-http.json` receipt. `compact-action-error` offscreen captures
must retain row bounds in both appearances. `compact-lifecycle` captures require
both cancelled and snoozed status labels to fit inside the column.
