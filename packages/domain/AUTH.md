# Owner authentication

`store.auth` is the authenticated domain entry point. `setupOwner(passphrase)`
bootstraps the single owner once. `signIn(passphrase)` uses Bun's asynchronous
Argon2id implementation with 64 MiB and three iterations. It returns a `ses_`
credential with a fixed 7-day expiry. Reads never renew it. `signOut` revokes it.

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
failed transaction rolls back. Denials fail with `AuthError`, code `auth`.
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
