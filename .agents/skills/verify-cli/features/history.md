# Task History after Purge

## Sub-features

Read ordered accepted and rejected Task History in JSON, Markdown and table
formats after the Task has been Purged. Show original operation types and a
redacted marker without the erased content.

## How to get to it (user POV)

Run `todo history TASK --format json` or `todo history TASK` in the selected
Profile. The Task ID continues to work after `todo rm TASK --force`.

## Driving it with the compiled CLI harness

Run the parent skill helper. The CRUD case creates and edits `Ship CLI`,
records four conflicts, Deletes and Purges it, then runs History in all three
formats. All eleven entries must be `TaskHistoryRedacted`, keep their outcomes,
and omit both original titles. Markdown and table must show `TaskPurged
[redacted]` and `TaskCreated [redacted]` respectively. `crud-history.json` and
`actions.json` retain the durable rows and actual CLI output.

## Gotchas

History requires a Session and respects the selected Profile. Unknown or foreign
Task IDs have empty History. Purge erases content while retaining operation
metadata. The compiled golden drive still compares all five original files
byte for byte.
