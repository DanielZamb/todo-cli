# concurrency

## Sub-features

Two independent compiled writers read Version 1 before either attempts the opposite edge. The writer lock serializes validation and commit.

## How to get to it (user POV)

Two agents add opposite Dependencies at the same time, with independently valid expected Versions.

## Driving it with the compiled library

Run the one command in [SKILL.md](../SKILL.md). It asserts literal outcomes and
retains action/result receipts. The durable projection is compared after both
full replay and checkpoint replay.

## Gotchas

Never use the owner's Todo directory. Keep each scratch database in its own
parent directory so its Purge journal cannot contaminate another case.
This drive does not prove public graph commands, UI or formal unbounded safety.
