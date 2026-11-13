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
failed transaction rolls back. The repeated-denial decision comes from History
alone, so CLI and server processes decide alike. It is made first in a read,
outside any transaction: a match appends nothing and opens no write
transaction. Absence takes the immediate write transaction and decides again
inside it before appending, so two processes that both miss leave one row.
For a denial at time t, search that Profile by descending sequence for the same
actor, action and detail in minute floor(t / 60000), in one pass. A refusal in
that minute matches even when its stamp is later than t: another process may
read its clock after this one and commit first. Stop at a usable recording
clock before the start of the preceding minute. Missing, invalid, future and
non-recording stamps never stop the walk. Wrong passphrases always append for
the lockout.

This look-back has a deliberate limit. A row of at most 4,096 bytes stamped
before the start of the preceding minute and committed after a refusal can hide
it: one from a writer that commits more than a minute after reading its clock,
or from a writer whose clock is behind (or steps back). The next repeat then
appends one more row. The walk reads a row's event only if it is at most 4,096
bytes; a larger row (a Task with a long description) is skipped unread, its
size taken from the record header. A refusal is always far smaller (161 bytes
at most). So that a History of long descriptions cannot carry the walk far past
the window, every 257th large row the walk meets (a count small rows do not
reset) is read for its kind and stamp and treated as ordinary evidence. A large
row can therefore hide a refusal only when it is that sampled row: stamped
before the horizon, committed after the refusal, and the 257th large row the
walk meets since its last sample.

The walk visits every row of that Profile between the newest row and the match
or the stop. A repeat whose match is the newest row costs one step, but rows
committed after the first refusal (an import in the same minute, for example)
are passed again by every repeat until the minute ends. That holds no write
lock, but on the server it runs on the one thread that serves every request.
The cost follows three things: the rows of at most 4,096 bytes in the window,
which are read; at most one large row read per 256 skipped; and at most 256
large rows (plus the one read) beyond the horizon, where a run of large
recording-clock rows ends the walk. The review seat measured, before the size
bound, 7.9 ms per repeat after 5,000 imported Tasks with 200-character
descriptions and 57 to 67 ms after one import of 1,000 Tasks with
100,000-character descriptions (first refusal 139 to 151 ms, about 70 ms under
the write lock). Measured 2026-11-13 with the bound and sampling: after that
1,000-Task import a repeat costs 0.73 ms (p99 1.4), three of those rows being
read; a first refusal after it 7.2 ms. In a Profile whose History before the
window is 20,000 Tasks with 5,000-character descriptions a first refusal costs
5.6 ms (3.5 under the lock), where the bound without sampling cost 44 ms.
Rows under the bound still cost what they cost: after 5,000 Tasks with
200-character descriptions, 9 to 12 ms per repeat at load 8 to 12.
A whole History inside the window must be searched on absence, twice: once in
the read and once under the lock. Migration stamps, copied redaction stamps and supplied rejected-Task
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
