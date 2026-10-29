# Conflict

## Sub-features

Preserved local draft, current server values, explicit overlapping-field choice and latest Version retry.

## How to get to it (user POV)

Keep an editor open while another client changes the same Task, then save.

## Driving it with native CUA

Run a real compiled CLI edit, click save-task, require Resolve conflict and disabled save-resolution. Choose the value and require the accepted title.

## Gotchas

SSE refresh must never rewrite the editor base. A second Conflict requires a new decision. Nonoverlapping fields preserve both changes.

## W07 native-session checklist

The field choices are native `Picker(...).pickerStyle(.radioGroup)` controls.
Offscreen captures flatten their unselected outlines into grey dots. During the
next explicitly authorized native session, inspect unselected and selected
choices in light and dark, use the keyboard to choose Keep mine and Keep theirs,
and require Save resolution to enable only after all overlapping fields have a
choice. Close must work throughout a Conflict unless a save is in flight.
