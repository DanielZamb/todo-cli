# Resolved replay

## Sub-features

Persisted successor facts, full replay, snapshot replay and rejected-attempt
exclusion from projections.

## How to get to it (user POV)

Call `store.history` to inspect resolved completion/cancellation events. Call
`store.rebuild` with or without `useSnapshot` to restore projections.

## Driving it with the compiled Bun driver

Run the helper. `03-replay.json` records both equality checks while the library's
expansion function throws on every call. The replayed tasks retain their literal
IDs, dates, UTC instants, zones, statuses and Versions. History still includes
the stale rejection, but there is no task with the rejected candidate ID.

## Gotchas

Replay imports projection code, which applies event facts. It does not import
recurrence code. The fault injection proves this at runtime in the compiled
artifact and is restored even when an assertion fails.
