# Delete and recovery

## Sub-features

Delete an empty Profile. Refuse visible Tasks without --with-tasks. Deleted
Tasks do not count. Preserve History and take a Snapshot before deletion.
Refuse deletion of the last remaining Profile. Preview without any writes.

## How to get to it (user POV)

Run `todo profile list`, then `todo profile delete <name> --dry-run`. Use
`--with-tasks` explicitly to Delete visible Tasks first.

## Driving it with the compiled driver

Run the parent Launch recipe. Read the refusal and preview action results,
Snapshot checks, and result.json. The CLI behavior suite checks last Profile
protection and exact Task Versions against scratch SQLite.

## Gotchas

Profile deletion is final in place. Recovery uses the pre-deletion Snapshot.
Never interpret this operation as Purge. A dry run does not take a Snapshot.
