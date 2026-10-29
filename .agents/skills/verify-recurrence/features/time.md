# Dates and instants

## Sub-features

Date-only scheduling, UTC instants with IANA zones, spring and fall DST,
nonexistent local times, and shifted task scheduling and due metadata.

## How to get to it (user POV)

Pass a structured Recurrence to `nextOccurrenceTime`, or a Series to
`store.startSeries`. Read `store.tasks` after advancement.

## Driving it with the compiled Bun driver

Run the helper from SKILL.md. Inspect `01-dst.json` for March 6 at 14:00Z and
March 9 at 13:00Z, both at 09:00 America/New_York. Inspect `02-bysetpos.json`
for date values with no time or zone. The behavior suite adds fall DST and a
02:30 spring gap, which the recurrence skips without counting it.

## Gotchas

Instants use UTC plus an IANA zone. A date does not mean midnight in the host
zone. Recurrence values require whole seconds. General task instants may have
fractional seconds.
