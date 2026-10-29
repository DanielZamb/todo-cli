# Rule boundaries

## Sub-features

DTSTART/TZID, weekly weekdays, monthly position, COUNT, inclusive UNTIL, EXDATE,
strict invalid-rule rejection and bounded expansion.

## How to get to it (user POV)

A Recurrence contains a TaskTime DTSTART, one RRULE string, and EXDATE TaskTimes.
`nextOccurrenceTime(recurrence)` includes DTSTART if the rule selects it.
Passing a cursor finds the next time strictly after it.

## Driving it with the compiled Bun driver

Run the helper. `02-bysetpos.json` contains January 30, February 27 and March 31.
`actions.json` shows cancellation skipping the March 10 EXDATE and Wednesday
completion producing no successor because COUNT is exhausted. The driver
asserts March 9 at 13:00Z is included by UNTIL. The behavior suite checks the
next call returns null and rejects invalid rule combinations.

## Gotchas

EXDATE exclusions still consume COUNT positions. EXDATE must use the DTSTART
value kind. A date recurrence cannot use hourly frequency or time selectors.
One rule has iteration and candidate limits. Exceeding a limit is a failure,
not silent exhaustion.
