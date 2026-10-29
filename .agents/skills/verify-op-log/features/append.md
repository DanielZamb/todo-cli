# Append and conflict

## Sub-features

Atomic event and projection writes, version comparison, rejected validation,
explicit authorization rejection, profile isolation, and direct-write guards.

## How to get to it (user POV)

Pass resolved event facts and an actor and profile to `store.append`. Call
`store.reject` when an upstream boundary denies an attempt.

## Driving it with the compiled Bun driver

Run the helper. `02-append.sql` has committed sequence 3 with versions 7 and 8.
`03-conflict.sql` adds rejected sequence 4 with reason `conflict`; the task stays
at version 8. The driver also attempts a direct SQL write and requires rejection.
`03-validation.sql` adds sequence 5 with a `TaskAttemptRejected` event and reason
`validation`, retaining the invalid title as received facts.
The behavior suite forces SQLite failure and proves neither event nor task was
committed. It checks invalid input, cross-profile facts and stale connections.
It also rejects missing and foreign Project and Tag references in Series task
defaults on create and edit. Valid defaults produce Occurrences whose Project,
Tags, and versions survive full replay with literal expected values.

## Gotchas

Operational SQLite failures return `StoreError`; they are not domain rejections.
Rejected input must be a serializable JSON value. Actor and profile IDs are
validated before recording. Profiles must exist before attempts can reference them.
