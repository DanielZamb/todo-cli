# replay

## Sub-features

TaskCreated v2 at Version 1, grouped Delete, Move cleanup, Profile deletion with fresh Versions, delta Revert, cycle refusal on restore, Purge of either endpoint, redacted owner Snapshot restore, full and checkpoint replay including old checkpoints.

## How to get to it (user POV)

A caller creates, Deletes, moves, Purges or Reverts a Task. Recovery must reproduce Tasks and edges without rerunning current commands.

## Driving it with the compiled library

Run the one command in [SKILL.md](../SKILL.md). It asserts literal outcomes and
retains action/result receipts. The durable projection is compared after both
full replay and checkpoint replay.

## Gotchas

Never use the owner's Todo directory. Keep each scratch database in its own
parent directory so its Purge journal cannot contaminate another case.
This drive does not prove public graph commands, UI or formal unbounded safety.

The Purge endpoint cases install a scratch SQLite AFTER DELETE audit trigger.
They require Delete itself to remove the literal incident edge set, then require
Purge to add zero audit rows. The defensive production cleanup stays enabled.
A missing Delete cleanup fails before Purge could hide it. The audit connection
closes in finally; no production flag or test hook changes Purge behavior.
