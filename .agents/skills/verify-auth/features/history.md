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

The compiled CLI/HTTP regression in apps/cli/test/auth-history.test.ts uses a fresh
scratch database per revoked/expired show/edit case. It asserts exactly one row
with profile default, action read for show or mutate for edit, and the literal
denial detail. Selection uses auth.resolveProfile with that action before CLI
pre-reads. Run it with TODO_CLI_BINARY and TODO_SERVER_BINARY from the same source
hash; TODO_CLI_EVIDENCE retains auth-history-actions.json without bearer secrets.
Four revoked move/copy cases also require exactly one authenticate rejection
through the CLI and HTTP, with the same selected Profile and unchanged Task.

## Durable repetition

Run ../scripts/verify-durable.sh with a fresh absolute evidence directory from
the checkout, using the full path .agents/skills/verify-auth/scripts/verify-durable.sh.
The compiled process matrix and domain lifecycle drive are described in SKILL.md.
Require all six literal counts to equal one, including mixed processes and
restart. The same-minute restored History must allow recording again. Keep the
explicit two-row older-than-horizon limit and the one-row prior-minute barrier.
Malformed, future, migration, redaction and supplied Task-rejection stamps must
not stop the walk. Wrong passphrases retain every row.
