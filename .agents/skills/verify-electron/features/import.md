# Import Tasks

## Sub-features

File selection, preview, Apply, rejected rows, Conflict handling and external ids.

## How to get to it (user POV)

Choose Import… in the task toolbar, then choose a JSON or NDJSON file.
Preview changes before choosing Apply changes.

## Driving it with the compiled host

Run the parent skill's host-only helper. `verify-import.ts` uses the Import file
input, Preview changes, Apply changes and Done buttons. It checks literal counts
1 created, 1 updated, 1 unchanged and 1 rejected. A compiled CLI edit after preview
must produce a Conflict row while keeping the concurrent title at Version 3.
The helper captures file, preview, result and Conflict in light and dark, at full
size and 393 × 426. It asserts the Compact Apply button stays within the viewport.

## Gotchas

Preview pins Versions. It never writes Tasks, History or owner Snapshots.
Apply can accept valid rows alongside rejected rows. Errors retain the report.
Offline state disables both preview and Apply. This host never uses Keychain.

Cancel missing Tasks is available before preview. The host driver edits one
absent Task after preview, then applies cancellations. That Task must stay open
at Version 4 with its concurrent title, and the report must show a Conflict.
