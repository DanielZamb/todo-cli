# Operation store feature map

| Feature | Proof |
| --- | --- |
| [Migration](migration.md) | Legacy profiles, task metadata and versions survive migration and replay. |
| [Append and conflict](append.md) | Accepted changes and rejected attempts keep ordered history. |
| [Rebuild and snapshots](rebuild.md) | Full replay and snapshot replay reproduce task rows and tag relations. |
| [Purge redaction](purge.md) | Erased content stays absent through replay, rejected attempts and raw-byte compaction checks. |
| [Revert](revert.md) | An inverse event restores facts at a newer version and keeps prior history. |

The compiled driver covers every row. The `@effect/vitest` suite adds failure
and isolation cases. Both use scratch databases only.
