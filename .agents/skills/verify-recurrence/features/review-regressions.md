# Review regressions

## Sub-features

Existing v2 legacy Series, inherited Project and Tag definitions, Revert followed
by completion, date metadata across midnight, invalid command History, unique
RRULE parts and FREQ in any position.

## How to get to it (user POV)

Use `store.startSeries` and `store.finishTask`, or their authorized `store.auth`
counterparts. Open an existing version 2 database through `openStore` to preserve
its original migration representation. Read rejected attempts through History.

## Driving it with the compiled Bun driver

Run the helper in SKILL.md. Its additional proof uses two scratch databases and
writes `04-review-fixes.json`, pairing each finding number with commands and
resolved events. It opens the frozen pre-C03 v2 fixture and completes legacy-1
at Version 7. The next Occurrence is October 28 at 14:00Z. It starts a Series
with a stored Project and Tag, reverts completion and finishes again with a
visible March 9 successor, and crosses midnight within a two-hour rule while
advancing the date-only due value to March 7. Invalid command schemas and
repeated COUNT or UNTIL parts enter rejected History. COUNT preceding FREQ
creates exactly January 30 and January 31, then stops. Full and snapshot replay
retain the resulting tasks. The behavior suite also covers the auth wrappers.

## Gotchas

The fixture is the original v2 SQL dump from C02, with its user_version set to 2.
Do not regenerate it with current migrations: that would miss existing-file
compatibility. Deleted successors do not suppress a new visible Occurrence.
A nondeleted successor still prevents duplicate creation after reopening.
Malformed actor, Profile or timestamp envelopes still fail with StoreError;
valid envelopes with invalid command facts produce a rejected task attempt.
