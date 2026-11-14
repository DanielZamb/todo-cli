# Time model and RFC 5545 recurrence

Times are either **instants** (stored in UTC together with the IANA time zone the user meant) or **dates** (an ISO 8601 date with no time). All timestamps are ISO 8601 / RFC 3339. Recurrence follows IETF RFC 5545 (`DTSTART;TZID`, `RRULE`, `EXDATE`), since no ISO standard can express weekday or position rules. A recurring **Series** holds the rule. Each **Occurrence** is a real task, and the next one is created inside the same transaction that completes or cancels the current one, so it works from the CLI without the server. Effect's `Cron` and `Schedule` cannot express full RRULE and are not used to expand it. The server uses them only for time-driven work (reminders, snooze wake-ups, cleanup), recomputing the next wake-up from the database so restarts never lose anything.

## Amendment, 2026-11-13: today follows the reader's zone

As the owner decided on 2026-11-13, planning views and their counts take "today" from the time zone sent with the read, or the server's own zone when none is sent (the CLI, reading the database directly, uses the machine's zone). The earlier UTC date for a read without a zone was a defect against this ADR.
