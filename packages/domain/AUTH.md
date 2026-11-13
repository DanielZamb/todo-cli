# Owner authentication

`store.auth` is the authenticated domain entry point. `setupOwner(passphrase)`
bootstraps the single owner once. `signIn(passphrase)` uses Bun's asynchronous
Argon2id implementation with 64 MiB and three iterations. It returns a `ses_`
credential with a fixed 7-day expiry. Reads never renew it. `signOut` revokes it.

Sign-in checks one passphrase at a time and refuses a full queue with
`sign_in_busy`. After 10 wrong passphrases in a row it refuses every attempt for
an hour with `sign_in_locked` and `AuthError.locked_until`, without running
Argon2. The count comes from the wrong-passphrase History rows since the last
owner setup, sign-in or reset, so the CLI and the server share it.
`resetPassphrase(passphrase)` sets a new owner passphrase, ends a lock and
revokes every Session. It takes no credential: only code that opens the
database can call it, and the CLI calls it after macOS accepts the account
password. See the ADR-0005 amendment.

`issueToken({ credential, token: { name, profile, scope, expires_at? } })`
requires a Session. A null Profile grants access across Profiles. Scope is
`read-only` or `read-write`. The default expiry is 90 days from issue, independent
of the issuing Session's lifetime. An explicit expiry must be in the future.
The returned `tok_` secret is available only at issue. `listTokens` returns
metadata, including expired and revoked Tokens. `revokeToken({ credential, name })`
revokes by name and is idempotent. Names stay reserved after revocation.
Access Tokens cannot issue, list or revoke credentials or sign out Sessions.

Bearer credentials contain 32 random bytes, stored as a SHA-256 hash indexed
for lookup. Credential IDs are separate random identifiers for History actors.
Passphrases use salted Argon2id. Credential metadata and History contain neither
bearer secrets nor passphrases. These choices use [Bun's password API](https://bun.sh/docs/runtime/hashing).

## Authenticated reads and mutations

`read({ credential, profile })` returns only that Profile's Tasks, Series,
Projects, Tags, Profile metadata and History. `append` and `revert` take the
same credential and Profile. They derive the actor from the credential and
reject out-of-scope operations in the domain layer. `authenticate` checks a
credential for a requested Profile and `read` or `write` access without returning
its secret hash. Consumers recheck on each request; they do not cache that result.

`mutate({ credential, profile }, identity => synchronousDomainEffect)` supports
other domain mutation methods. It validates auth and runs the callback under
one immediate transaction, so another connection cannot revoke the credential
between the check and the write. Callback failure rolls back all its changes.
The callback is trusted adapter code and uses the supplied actor and Profile.
It must finish synchronously and must not wait on HTTP, timers or cryptography.
The local CLI and migration code can still use the privileged OperationStore.

`resolveProfile({ credential, profile: nameOrId, action })` returns only the
authorized Profile's id and name. It uses the same authorized set as `profiles`.
Absent, Deleted and unauthorized targets return the same caller error. Pass the
real operation's AuthAction so a rejected credential records the same selected
Profile and action as that operation. Resolution grants read visibility; the
operation must still enforce its existing write access.

`readSnapshot(reads => synchronousReadEffect)` encloses credential checks and
all authorized Profile reads in one deferred SQLite transaction. Its callback
must finish synchronously: do not use asynchronous search matching, yielding,
HTTP, timers or cryptography inside it. Directory and id-prefix lookup use the
synchronous prefix matcher. A credential failure rolls back the whole read,
then records the rejection once; consumers never receive a partial aggregate.

`startSeries` and `finishTask` accept authenticated requests derived from C03's
command schemas. They check write access before calling the store's synchronous
recurrence ports in the same transaction. They derive actor from the credential
and occurred_at from Effect's Clock; client input cannot replace either.
`startSeries` also checks the Series Profile. `finishTask` checks the target
Task's Profile, including when a client disguises it behind an allowed Profile.
Consumers submit the command and candidate IDs; the domain resolves the next
Occurrence rather than accepting a client-resolved completion event.

```ts
store.auth.finishTask({
  credential,
  profile,
  task_id,
  from_version,
  action: "complete",
  next_task_id,
  next_occurrence_id,
});
```

The compiled auth proof drives Series start, completion and cancellation. A
forced successor insertion failure leaves both the Task and History unchanged;
retry creates exactly one successor. Read-only and out-of-Profile requests
create no successor and append rejected auth History. Full and snapshot replay
restore the combined result while recurrence expansion is disabled.

## Storage and History

Migration 0003 upgrades v2, preserving operation sequences, snapshots and foreign
keys. It adds the owner hash and credential tables. `op_log.profile` is nullable
so sign-in failures can be recorded before any Profile exists. Task mutations
still require an existing Profile. Successful credential changes append
`AuthChanged`; denials append `AuthAttemptRejected` with reason `auth` after the
failed transaction rolls back. The repeated-denial decision comes from History inside the same immediate
write transaction as its append, so CLI and server processes decide alike.
For a denial at time t, search that Profile by descending sequence for the same
actor, action and detail in minute floor(t / 60000). Stop at a usable recording
clock before the start of the preceding minute. Ignore missing, invalid, future
and non-recording stamps. Wrong passphrases always append for the lockout.

This look-back has a deliberate limit. A row committed more than a minute after
its writer read the clock can hide an earlier matching refusal; the next repeat
then appends one more row. A whole History inside the window must be searched on
absence. Migration stamps, copied redaction stamps and supplied rejected-Task
stamps never end the walk. See the
[timestamp audit](../../docs/decisions/ui-speed/durable-denial.md).
Denials fail with `AuthError`, code `auth`.
SQLite, corrupt storage and cryptographic failures use `StoreError`.
Task projection replay ignores auth events and retains credential tables.
Auth tables hold canonical credential state and are outside Task snapshots.

The open/create boundary resolves the file to its canonical path for SQLite
and permission checks. File symlinks therefore use the target database and its
actual WAL/SHM siblings. It applies `0600` before opening an existing database and
after SQLite creates its WAL/SHM siblings. New files start with `0600` independently
of umask. Filesystem failures abort opening. No process-wide umask is changed.

Run `.agents/skills/verify-auth/scripts/verify.sh` with an absolute evidence path
for the compiled scratch proof. See the generated skill for all prerequisites
and the feature map. All tests and drives use scratch databases.
