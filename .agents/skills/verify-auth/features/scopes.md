# Profile and write scopes

Access Tokens can span all Profiles or one Profile, with read-only or read-write
access. Sessions have full owner access.

## Sub-features

- `profile-read` filters public reads to the requested authorized Profile.
- `profile-denial` rejects requests outside a Token's Profile.
- `write-denial` rejects mutations made with a read-only Token.
- `authorized-mutation` uses the credential's actor and the requested Profile.
- `shared-mutation` checks auth and executes a synchronous domain operation
  under the same database lock.

## How to get to it (user POV)

Domain consumers call `store.auth.read`, `append`, `revert`, `startSeries`,
`finishTask`, or `mutate`.
The `mutate` callback belongs to trusted adapter code and runs an existing
synchronous domain method with the supplied actor and Profile.

## Driving it with the compiled driver

Preconditions: run Doctor and Launch from [verify-auth](../SKILL.md).

- Reading Personal with `work reader` fails with `profile_scope`.
- Creating a Task with `work reader` fails with `write_scope`.
- `work writer` creates and edits a Task. A reader sees `Ship the auth proof`
  at Version 2, also present in `02-scopes.sql` and `result.json` after replay.
- `all profiles` can read Personal. The scoped read returns only that Profile.
- The [authenticated recurrence recipe](recurrence.md) checks the explicit Series
  and Occurrence mutation methods with the same scoped credentials.
- The scratch behavior suite also drives authenticated Revert and mutation rollback.

## Gotchas

Adapters use the supplied actor and Profile in the callback. `mutate` runs
synchronous database Effects only. HTTP, timers and cryptography run outside
that callback. The privileged store methods remain for trusted local consumers.
