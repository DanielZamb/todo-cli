# Rejected auth History

Every authentication or authorization denial appends a rejected `auth` operation,
even when the database has no Profiles yet.

## Sub-features

- `auth-rejection` records the action and safe reason after rollback.
- `global-rejection` permits a null Profile for failures before Profile selection.
- `secret-redaction` keeps passphrases and bearer credentials out of History.
- `replay-isolation` ignores auth records while rebuilding Task projections.

## How to get to it (user POV)

Attempt a denied `store.auth` action, then inspect `store.history()` through a
trusted local consumer. Scoped `store.auth.read` returns only its Profile's History.

## Driving it with the compiled driver

Preconditions: run Doctor and Launch from [verify-auth](../SKILL.md).

- The driver attempts a wrong passphrase, cross-Profile read, denied write,
  Token management, revoked credentials, expired credentials and denied Series
  starts, completions and cancellations.
- `result.json` contains fifteen rejected `AuthAttemptRejected` operations, all
  with reason `auth`. The first has a null Profile.
- Hash and History checks reject any stored bearer credential or passphrase.
- Replay returns the same Task title and Version after those failures.

## Gotchas

SQLite failures use `StoreError`; denials use `AuthError` with code `auth`.
A rejection's safe detail names the denial without copying submitted input.
Auth records remain in History during projection rebuild.
