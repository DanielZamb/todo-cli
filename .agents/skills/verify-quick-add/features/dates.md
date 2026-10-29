# Dates and time zones

## Sub-features

`today`, `tomorrow`, weekday names and ISO dates produce dates. A following
12-hour time such as `10am` produces a UTC instant with the supplied IANA zone.
Bare dates set due time. `due:` and `scheduled:` choose the destination. A weekday
means its next occurrence, seven days ahead when it matches today.

## How to get to it (user POV)

Call `parseQuickAdd` from `@todo/domain`, or POST to
`/profiles/work/quick-add/parse` with `text`, `now` and `time_zone`.

## Driving it with the compiled library

Run `scripts/verify.sh` as shown in the skill. The input clock is
`2026-10-27T02:00:00Z` in `America/Bogota`. The literal expected tomorrow is
`2026-10-27`; Friday 10am is `2026-10-30T15:00:00Z`.

## Gotchas

The parser never reads the host clock. Dates carry no zone; instants retain the
input zone. Ambiguous and nonexistent local times fail rather than shift.
