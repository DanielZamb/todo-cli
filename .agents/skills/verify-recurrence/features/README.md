# Recurrence feature map

| Feature | Observable proof |
| --- | --- |
| [Dates and instants](time.md) | UTC instants retain IANA zones, date values retain date-only semantics. |
| [Series advancement](advancement.md) | Complete and cancel create one successor atomically and reject stale versions. |
| [Rule boundaries](rules.md) | BYSETPOS, COUNT, UNTIL and EXDATE choose the literal expected dates. |
| [Resolved replay](replay.md) | Full and snapshot replay work with recurrence expansion disabled. |

The compiled driver covers all four rows using one scratch database. The
`@effect/vitest` suite adds failures and invalid input. Neither uses real data.

For the combined authenticated path, run [verify-auth](../../verify-auth/SKILL.md).
Its [recurrence recipe](../../verify-auth/features/recurrence.md) uses the same
production recurrence handlers after domain authorization. It proves denied
credentials create no successor and records their rejected auth History.

[Review regressions](review-regressions.md) documents the compiled proof of the
seven C03 review findings, including frozen v2 compatibility and rejected input.
