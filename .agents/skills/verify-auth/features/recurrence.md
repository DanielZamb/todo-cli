# Authenticated Series and Occurrences

The owner or a scoped read-write Access Token can start a Series, complete an
Occurrence or cancel it. The domain creates each successor inside the same
transaction as the authorization check and accepted Task change.

## Sub-features

- `auth-series-start` checks write and Profile scope, then creates the first Occurrence.
- `auth-occurrence-finish` completes or cancels an Occurrence and creates one successor.
- `auth-recurrence-denial` rejects read-only or out-of-Profile requests before any change.
- `auth-successor-rollback` leaves Tasks and History unchanged if successor insertion fails.
- `auth-recurrence-replay` restores the combined result without expanding recurrence.

## How to get to it (user POV)

Call `store.auth.startSeries` with a credential, Profile, Series and candidate
first Task and Occurrence IDs. Call `store.auth.finishTask` with credential,
Profile, Task ID, Version, `complete` or `cancel`, and candidate successor IDs.
The domain supplies actor and timestamp and resolves the successor.

## Driving it with the compiled driver

Preconditions: run Doctor and Launch from [verify-auth](../SKILL.md).

- The driver denies three read-only or out-of-Profile Series starts. No Series
  or Occurrence exists after those attempts. Each appends rejected auth History.
- `work writer` starts a daily Series for October 27, 28 and 29. A submitted
  spoofed actor and timestamp do not replace the authenticated actor and Clock.
- Read-only and out-of-Profile finish attempts leave the first Occurrence open.
  Denied cancellation leaves the second Occurrence open without a successor.
- An injected SQLite trigger rejects successor insertion on both complete and
  cancel. Each operation fails with StoreError and preserves Tasks and History.
  After removing the run-owned trigger, retry commits exactly one successor.
- `02-recurrence.json` and `02-recurrence.sql` show `auth-first` done at Version 2,
  `auth-second` cancelled at Version 2 and `auth-third` open at Version 1, on the
  literal dates above. `actions.json` records each denial, failure and retry.
- Full replay and snapshot replay reproduce those exact Tasks with recurrence
  expansion disabled. The snapshot precedes cancellation, so its tail must apply
  the resolved cancellation and successor. History remains unchanged.

## Gotchas

Use the authenticated recurrence methods rather than submitting a resolved
completion event from a client. A Session or Token must still be valid when
execution starts. All trigger failures, Clock changes and replay probes belong
to scratch verification and are cleaned up; evidence stays outside scratch.
