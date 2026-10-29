# Import Tasks

## Sub-features

JSON and NDJSON file selection, preview, Apply, retained Versions, rejected rows,
Conflict recovery, external ids, and full or Compact layouts.

## How to get to it (user POV)

Choose Import… in the task toolbar. Choose a file, preview its changes, then choose
Apply with the displayed change count. Import matches external ids within the selected Profile.

## Driving it with headless Swift and offscreen rendering

During native HOLD, run the existing `apps/macos/scripts/verify-write-state.py`
through the run's Swift slot wrapper. `ImportStateTests` exercises the production
TodoModel and regenerated HTTP client against its compiled scratch server.
It previews two new Tasks, applies them, then previews and applies literal counts
of one created, one updated and one unchanged Task. A new model reads three
unchanged Tasks after reload. A competing HTTP edit produces one Conflict after
Apply and preserves the accepted title at Version 3. `import-http.json` retains it.
`GeneratedContractTests` runs unhosted through the Swift package and verifies
external ids, nullable fields, expected Versions and per-Task errors.

Run `apps/macos/scripts/verify-design.py` through the same slot wrapper.
It captures the production ImportView in both appearances at 1100 × 720 and
393 × 426. The `import-*` and `compact-import-*` files include file selection,
preview, results, Conflict, empty, parse error and offline states. Full-size
captures place the view over fixture task content in an unordered window.
The Compact view is the production sheet content. No Todo.app is launched.
The system file panel itself remains a supervised native check.

Run an unsigned Xcode build with `CODE_SIGNING_ALLOWED=NO` and preserve its real
exit code. `check-design-identifiers.py` must keep all existing identifiers.

## Gotchas

Import preserves omitted fields and clears explicit nulls. Preview captures a
Version for every Task, including null for a new external id. Apply rejects a
concurrent change. Apply creates a named owner Snapshot first; preview creates
none. Profile changes clear the pending import. Offline state disables writes.
Native file-panel interaction and actual Liquid Glass remain held.

Cancel missing Tasks is available before preview. The headless import test
also previews two cancellations, applies them and reloads their cancelled statuses.
The model sends those Task ids and Versions in a separate cancellation set. A rejected file row skips that entire set. The live test edits a file Task after preview and requires both missing Tasks to remain open before a fresh preview and successful retry.

A delayed HTTP transport proves an obsolete preview cannot attach to a newly selected file. File selection is disabled during a request. Created rows show New Task plus set fields, excluding External id. Apply states the accepted change count; rejected rows show their recovery reason and a skipped-item notice.

The 12-Task scrolling captures exercise a separate, clipped ScrollView above a footer divider. Render assertions measure the viewport, visible rows and footer so no row can be covered by the buttons, in both layouts and appearances.

Compact uses the 4/8 pt spacing steps to group title, external id and changes.
Its 224 pt viewport shows four complete 56 pt rows; no row intersects the footer.
The summary contains only non-zero outcomes on one line. Change… sits beside
the filename in both layouts, leaving Cancel and Apply in the preview footer.
`import-layout.json` records complete/partial row counts, summary height and
button targets; renders assert at least four whole rows and 28 pt targets.

External ids survive Move and are cleared by Copy into another Profile. A live
TodoModel test attempts a Move into an existing external id, requires the server's
named Profile and id message in the focused transfer feedback, preserves the
unsaved draft, and reloads both unchanged Tasks. Both appearances and layouts
render this rejection with Choose Another Profile and Cancel directly below the message. The primary action reopens the destination picker without losing the draft. `transfer-layout.json` asserts button targets and message-to-action spacing in Compact.
