# Migration 0002

## Sub-features

Legacy profiles, projects, tags, task scheduling, versions, series, and baseline
events. WAL, timeout, credential retirement, atomic failure, and repeat opens.

## How to get to it (user POV)

Open an existing v0.1 database through `openStore({ path, create: false })`.

## Driving it with the compiled Bun driver

Run the helper in SKILL.md. Compare `00-legacy.sql` and `01-migration.sql`.
Expect two profiles, two tasks at versions 7 and 2, three tags, one project,
one series, and two committed migration events. The driver checks WAL and the
5000ms timeout. The behavior suite checks failed migration and repeat opens.

## Gotchas

Only use the helper's scratch fixture. Legacy UTC instants retain their instant,
with UTC as the zone because the old database did not retain the intended zone.
Migration preserves recurrence text without expansion. The Go writer is retired
after migration 0002. Existing sessions and password hashes are not carried over.
