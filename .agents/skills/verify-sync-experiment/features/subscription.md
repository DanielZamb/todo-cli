# Serial subscription recovery

## Sub-features

Connection epochs, continuity, duplicates, caught-up marker and byte overflow.

## How to get to it (user POV)

Run `bun experiments/sync-patches/protocol-check.ts` after bench.

## Driving it with the reducer

Require `protocol 5`. Inspect protocol.json and literal assertions for remote
rename and removal, both reply/stream labels, and refused pending actions.

## Gotchas

This is a reducer experiment. It does not prove an app's action overlay or UI.
