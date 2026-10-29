# Editing, conflicts and History

## Sub-features

Versioned edits, completion, cancellation, reopen, Delete, conflict choices and
ordered accepted/rejected Task History, Move to Profile, Revert and Series.

## How to get to it (user POV)

Select a Task and Save changes. The checkbox completes/reopens. Task actions
is the header overflow beside Version. Reopen task appears only for done or
cancelled Tasks. History is beside Save changes. Tags use removable chips with an
Add Tag input that accepts an existing definition. Estimate has an inline min suffix.

## Driving it with Playwright Electron

Edit Title locally, change the Task with the compiled CLI and save the stale UI
Version. Require Review conflict, both values and disabled Save resolution until
each overlap has a radio choice. Resolve and read accepted/rejected History.
Complete/reopen, then Delete a disposable Task and check TaskDeleted in SQLite.
Hold a real History response while switching Profile or selecting another Task.
The previous selection's History must stay closed.
Remove the launch Tag chip, add it again through Add Tag and require the chip to return.
Require a Recurrence row, an uncounted Project choice, two selectable conflict cards
under Title, and differing words highlighted inside those cards.

## Gotchas

SSE must not replace an editor draft. A second conflict uses the newest Version.
Deleted Tasks preserve drafts. Move clears Project/Tags and detaches an Occurrence.
After Move or a cross-Profile Revert, the destination Profile is selected and
unsaved fields follow the task. Project and Tags use the accepted destination values.
Revert appends an inverse and may be rejected if later changes prevent it. The
History dialog keeps the server rejection visible. Conflict retries keep the
action and use the latest Version. Series editing merges ordinary task fields
through the existing conflict choices. Other actions preserve unsaved fields.

## Compiled host writes without Keychain

Run the host command in SKILL.md. The fixture uses production task-client.ts,
preload and renderer, and an ephemeral Session against the compiled scratch server.
Select a task, open Task actions and Move to Profile. Compete with a compiled CLI
edit, require a real 409, review and retry. Check the task in the destination and
its Project and Tags resolved by destination name. In History, Revert the newest accepted edit, again with
a stale editor Version, and require TaskReverted plus the original title.

Recurrence opens Series create/edit/skip. Creating makes a new Series from the
editor draft and retains the original task. Supported presets are daily, weekdays,
weekly on chosen days, monthly by date and monthly by position. Existing starts
and exclusions are preserved. Custom rules are read only. Edit and Skip each
exercise a real CLI race and 409 retry. Skip must cancel this Occurrence and create
the next one. Open that successor and require the saved rule, retrieved from
accepted HttpApi History, including its predecessor facts. The host seeds the
migration fixture, completes its original task, deletes that original and verifies
the successor still edits the saved Series. It also saves both monthly presets,
checks a moved description after Profile switches, and repeats Skip to require
the server's 422 `validation` reason inside the dialog.

The fixture follows real SSE readiness and disconnects, without exercising
production SSE persistence or reconnect. This narrow drive adds no
native authentication, secure-storage, restoration or notification coverage.
Complete A, edit its successor B's Series, delete B and reopen A. Require B's
saved rule when A opens Recurrence. Stop the server while Recurrence is open.
Require disabled writes and working Close before inspecting cached Tasks.

E03 captures `series-day-labels.png` with Mon through Sun and the unchanged RRULE
preview, `task-actions-move.png` without Reopen on an open Task,
`history-revert.png` after the Revert action is visible, and `date-only-due.png`
with the literal date-only text `Due Today`.

History shows newest entries first with plain labels and relative times. Hover
its time for the full local date. Edited entries show each changed field's old
and new values. The host drive checks a Created row has no Revert, submits a real
stale Revert, then checks its muted rejected row and plain reason. After a
successful Revert, the original edit has no Revert. Screenshots are
`history-revert.png` and `history-rejected-reverted.png`. Purge-redacted entries
say "Content erased by Purge." and never expose values or Revert.

Project and Tag names can be created in the editor. Type a Project name and
select its Create row. Type a Tag and press Enter or comma, or select its
Create row. Save changes commits the Task and definitions together. Pending
names survive draft restoration and merge with their Project or Tags field.
The host drive checks create rows, saved names and a CLI-created conflicting
Project through actual SSE refresh.

The host drive delays the discovery read after a real Revert conflict, closes
History and selects another Task before releasing the read. The selected editor
must remain on the second Task with no conflict dialog. The original Task keeps
its CLI-accepted title, and the second Task stays at Version 1. The screenshot
is `conflict-refresh-selection-preserved.png`.

C10 transfers keep the source Profile selected. Copy retains its source editor,
and Move returns to the source list. The result offers Open in the destination.
Transfer Conflicts show This Task changed, the current Version, and Cancel with
Copy latest or Move latest. Edit Conflicts retain their field choices.

`verify-transfer-regressions.ts` runs in the compiled host drive. It proves that
row transfer Cancel keeps the current draft, Move preserves an unrelated
Profile draft and the moved draft separately, and cross-Profile Revert opens the
restored Profile and accepts a subsequent Save. Read `transfer-regressions.json`.
Dirty drafts use separate Task keys, while `editor:<Profile>` keeps the selected
editor for Profile restoration. Accepted writes clear obsolete Task drafts.
The date-only row check fixes the browser clock at October 28, 2026 before
asserting `Due Today`, then restores the current clock for the remaining drive.
