# Authentication feature map

The domain library is C04's public entry point. Run the compiled driver through
the Launch recipe in [verify-auth](../SKILL.md). Each run owns a fresh scratch
database and retains evidence after cleanup.

| Feature | Observable proof |
| --- | --- |
| [Owner and Sessions](sessions.md) | Argon2id sign-in issues a fixed 7-day Session; sign-out and expiry deny access. |
| [Access Tokens](tokens.md) | Issue, list and revoke named Tokens with hashed secrets and default or explicit expiry. |
| [Profile and write scopes](scopes.md) | Authorized mutations work, denied writes and cross-Profile reads fail. |
| [Authenticated recurrence](recurrence.md) | Authorized Series start, completion and cancellation create one successor; denied credentials create none; failures roll back; replay preserves results. |
| [Rejected auth History](history.md) | Every denied auth call records an ordered rejected operation without secrets. |
| [Private database files](permissions.md) | Create and reopen enforce literal 0600 modes on database, WAL and SHM files. |

The compiled driver covers every row. The scratch behavior suite adds migration,
Revert, rollback, and connection isolation cases. The helper command is the same
for all feature files; the actions and SQL stages identify the feature proved.
