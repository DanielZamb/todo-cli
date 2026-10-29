# Reconnect

## Sub-features

Replay every eligible operation strictly after the received Last-Event-ID.
Continue following writes after catch-up.

## How to get to it (user POV)

Reconnect to the same Profile with the last operation ID in `Last-Event-ID`.

## Driving it with curl

Run the helper in [verify-sse](../SKILL.md). It kills its first live curl
process with SIGKILL, writes through HTTP and CLI while disconnected, and
opens a new curl process with the last received ID. `result.json` pairs the
received IDs with the full durable expected list, without gaps or duplicates.

## Gotchas

Resume IDs are global sequence numbers. Persist a cursor separately for each
Profile subscription. The server retains History; it does not compact it here.

A database restore changes its generation and may lower seq. Persist the
`reload` event's generation with the Profile cursor and send it as
`X-Todo-Generation`. On reload, clear cached Tasks and cursor state, then use
the event's seq as the new cursor. A cursor above the restored seq also earns
reload. The compiled [Snapshot drive](../../verify-snapshots/SKILL.md) proves
a connection opened before restore receives reload and then a reused seq.
