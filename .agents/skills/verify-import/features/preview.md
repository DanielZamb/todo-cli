# Preview changes and resolve Conflicts

## Sub-features

No-write dry run, per-Task rejections, retained Versions, partial batch acceptance and close-missing cancellation.

## How to get to it (user POV)

Run `todo import file.json --dry-run --format json`, or choose Import… in either
client. Select a file, preview its changes, then choose Apply with the displayed change count.

## Driving it with the compiled CLI and clients

Run the parent helper to compare source data before and after dry run.
Supply a stale `from_version` and require one rejected row with `occ_conflict`,
the current Version and exit 4. Apply succeeds for valid Tasks in the same batch.
In clients, preview retains each original Version, including null for a new
external id. A competing edit must appear as a Conflict after Apply.
The Electron host helper and headless Swift state helper verify the durable title.

## Gotchas

`--close-missing` only cancels open or snoozed Tasks with external ids. It never
Deletes Tasks or touches manually identified Tasks. Any rejected input prevents
close-missing cancellations. Client imports retain the Profile selected when opened.

Both clients also offer Cancel missing Tasks. Apply sends the previewed
cancellations with each Task id and Version. Tasks that appear after preview
are not added to that cancellation set. Task-id checks reject identity reuse
at the same external id and Version.

Cancellation candidates are separate from file items in the HTTP request. Any rejected file item skips all candidates. The compiled Electron drive and live Swift state test both reproduce a competing edit to a file Task and assert that missing Tasks stay open. A delayed file read and a delayed Swift HTTP response also prove that obsolete selections cannot replace a current preview.

The driver seeds a scratch legacy snoozed Task, attaches an external id at Version 8,
previews reopening without changing that Version, and applies open at Version 9.
It compares every other Profile's Task payload before and after. Invalid and
duplicate rows with an otherwise valid expected Version retain it in History.

Both clients place Change… beside the filename. Compact summaries omit zero
outcomes, and a four-row viewport keeps every visible row whole. The Electron
and Swift render drives assert row counts, summary height and minimum button
targets in their `import-layout.json` receipts.

Copy only accepts another Profile and clears the external id. Move preserves it
and rejects a destination identity clash with the id and Profile in the message.
Transfer dry runs execute these same shared domain commands in a disposable fork.
The transfer identity driver checks HTTP validation, History, unchanged source
and destination Tasks, and per-Task CLI errors without preview writes.

The compiled migration driver opens schema versions 2, 3 and 4 concurrently,
requires version 5 and one pre-migration Snapshot, and compares every original
row and op_log payload byte for byte. The HTTP import drive requires the shared
404 for both preview and Apply into a deleted Profile. CLI import cannot recreate
the tombstoned Profile or add Tasks to it.
