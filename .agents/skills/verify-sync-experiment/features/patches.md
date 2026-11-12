# Patch equality and lifecycle

## Sub-features

Stored and in-memory generation, computed descendants, normal restore, Purge.

## How to get to it (user POV)

Run the compiled experiment driver with `correctness`.

## Driving it with the compiled driver

Both arms must report 115 comparisons. The missing-descendant control must fail.
Actual command outcomes must be committed, and the stale edit must be rejected.

## Gotchas

Post-Purge restore currently fails foreign-key validation. Do not count this
recorded limitation as qualification. All data is synthetic and disposable.
