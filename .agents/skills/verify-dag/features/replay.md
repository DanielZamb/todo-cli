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
