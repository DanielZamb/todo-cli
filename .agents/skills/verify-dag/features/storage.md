# storage

## Sub-features

Migration 0007 twice, pre-migration Snapshot, composite foreign keys, three guard triggers, self-edge refusal, dependent-only Versions, 13/14 bound, 103-node cycle and done/reopen checks.

## How to get to it (user POV)

A caller appends a resolved DependencyAdded or DependencyRemoved through OperationStore. The store is authoritative even for forged inputs.

## Driving it with the compiled library

Run the one command in [SKILL.md](../SKILL.md). It asserts literal outcomes and
retains action/result receipts. The durable projection is compared after both
full replay and checkpoint replay.

## Gotchas

Never use the owner's Todo directory. Keep each scratch database in its own
parent directory so its Purge journal cannot contaminate another case.
This drive does not prove public graph commands, UI or formal unbounded safety.
