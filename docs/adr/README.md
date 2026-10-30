# Decisions

These records are the project's architecture. Agents treat them as binding, and
so does the code. If a change would contradict one, stop and write a new record
or an explicit supersession instead of drifting.

[SPEC.md](../../SPEC.md) describes the retired Go v0.1 CLI. Where that document
and an accepted record disagree, the record wins. Domain words come from
[CONTEXT.md](../../CONTEXT.md).

## Shape of the system

The Go CLI is gone. One Effect TypeScript domain package holds the rules.
The CLI (`todo`) and the local server (`todo-server`) both call it. Two writers
with copied rules would drift, which is why Go was retired rather than kept
beside the new server.

[ADR-0001. Port to Effect with one shared domain package](0001-port-to-effect-with-shared-domain.md)

Desktop apps do not open SQLite. They go through the local server. A Swift
read of the file looked simpler until writes appeared. Writes would have needed
a third copy of the rules. A later phone client would need a server anyway.
The CLI remains the other process that opens the file, and it does so through
the same package.

[ADR-0002. The server is the gateway for UI and remote clients](0002-server-is-the-gateway-for-ui-and-remote-clients.md)

There is one HTTP contract: an Effect HttpApi whose OpenAPI document is generated
from that definition. Electron imports the TypeScript API. macOS generates a
Swift client from the document. Effect RPC was rejected because Swift would have
had to reimplement a TypeScript-only wire format.

[ADR-0003. HttpApi with OpenAPI is the single client contract](0003-httpapi-openapi-as-the-single-contract.md)

Agents and the owner use Todo every day. A capability that exists only in a UI,
or only in the CLI, is unfinished. Each one ships an agent command (JSON on
stdout, documented schema, dry-run for destructive work) and a human UI in both
desktop clients, plus a terminal view when the work is live or for monitoring.

[ADR-0009. Every capability is native to agents and humans](0009-every-capability-is-native-to-agents-and-humans.md)

## What the database remembers

The first live-update design used SQLite triggers to fill a `change_log`, then
streamed `seq` over SSE. That captured every writer, including a manual
`sqlite3` session. It did not make History replayable, and it still allowed
more than one writer to touch task tables.

[ADR-0004. Change log filled by SQLite triggers, streamed over SSE](0004-change-log-via-triggers-streamed-over-sse.md)
(superseded)

The source of truth is now `op_log`. Each attempt is an event with actor,
Profile, resolved payload, versions, and `committed` or `rejected`. A committed
event and its projection update share one transaction. The Version check is
compare-and-swap. Rejected attempts are stored so Conflicts stay visible, and
they are never replayed. SSE streams committed ops by `seq`. Guard triggers
reject direct writes to projection tables.

[ADR-0007. The operation log is the source of truth](0007-operation-log-is-the-source-of-truth.md)
(accepted, supersedes ADR-0004)

Purge has to erase a Task without punching holes in the log. Entries keep their
seq, type, versions, and timestamps, and lose title, description, tags, Project,
Series, and rejected payloads. Snapshots that still contain the Task are
redacted the same way. Replay still ends with the Task gone. Revert is no
longer offered.

[ADR-0008. Purge redacts History content](0008-purge-redacts-history-content.md)

The owner can copy the whole database to `~/.todo-cli/snapshots`, restore one,
and prune old copies. Pre-change Snapshots happen before migration, Profile
Delete, Purge, import apply, and restore. A daily Snapshot runs on the server.
Restore replaces database content in place so open connections do not keep
writing a discarded file. Purge redaction is applied to stored copies too.

[ADR-0012. Owner Snapshots preserve a point in time and every Purge](0012-owner-snapshots.md)

## Who can act

The database has one owner. Multiple users were removed. Work is partitioned by
Profile and grouped by Project. A Session comes from the owner passphrase and
lasts seven days with no sliding renewal. Agents use a separate Access Token:
named, optional Profile scope, read-only or read-write, revocable. Prefixes
`ses_` and `tok_` distinguish them on the same `Authorization` header.

[ADR-0005. Single owner, Profiles instead of users, two credential kinds](0005-single-owner-profiles-and-two-credential-kinds.md)

Deleting a Profile hides it and records Task Deletes plus ProfileDeleted after
a pre-change Snapshot. The last Profile cannot be deleted. Visible Tasks need
an explicit Delete-Tasks-too confirmation. The Profile ID stays reserved.
The name can be reused on a new ID. Recovery is restore from that Snapshot, not
an in-place undelete. Owner Sessions survive. Profile-scoped tokens are revoked.

[ADR-0010. Profile deletion preserves History and reserves IDs](0010-profile-deletion.md)

## Time and files

Times are dates (`YYYY-MM-DD`) or instants (UTC plus the IANA zone the owner
meant). Recurrence is RFC 5545 on a Series. Each Occurrence is a real Task.
The next one is created in the same transaction that completes or cancels the
current one, so the CLI does not need the server for the chain to continue.
Effect Cron is not used to expand RRULE. The server uses its scheduler only for
reminders, snooze, and credential cleanup.

[ADR-0006. Time model and RFC 5545 recurrence](0006-time-model-and-rfc5545-recurrence.md)

An Attachment is a file path, a copied image, or an HTTP(S) link. Ordinary files
stay where they are. Pasted images are copied under
`~/.todo-cli/attachments/…`. The server will serve those copied bytes after
authorization. It will not read an arbitrary local path. Purge erases copied
images and redacts paths from History. External files are never deleted.

[ADR-0011. Attachments reference local files and links](0011-attachments-reference-local-files-and-links.md)

## Index

| ID | Title | Status |
| --- | --- | --- |
| [0001](0001-port-to-effect-with-shared-domain.md) | Port to Effect with one shared domain package | accepted |
| [0002](0002-server-is-the-gateway-for-ui-and-remote-clients.md) | The server is the gateway for UI and remote clients | accepted |
| [0003](0003-httpapi-openapi-as-the-single-contract.md) | HttpApi with OpenAPI is the single client contract | accepted |
| [0004](0004-change-log-via-triggers-streamed-over-sse.md) | Change log filled by SQLite triggers, streamed over SSE | superseded by 0007 |
| [0005](0005-single-owner-profiles-and-two-credential-kinds.md) | Single owner, Profiles, two credential kinds | accepted |
| [0006](0006-time-model-and-rfc5545-recurrence.md) | Time model and RFC 5545 recurrence | accepted |
| [0007](0007-operation-log-is-the-source-of-truth.md) | Operation log is the source of truth | accepted |
| [0008](0008-purge-redacts-history-content.md) | Purge redacts History content | accepted |
| [0009](0009-every-capability-is-native-to-agents-and-humans.md) | Every capability is native to agents and humans | accepted |
| [0010](0010-profile-deletion.md) | Profile deletion preserves History and reserves IDs | accepted |
| [0011](0011-attachments-reference-local-files-and-links.md) | Attachments reference local files and links | accepted |
| [0012](0012-owner-snapshots.md) | Owner Snapshots | accepted |

Track notes under [docs/decisions/](../decisions/) record how a port unit
implemented one of these choices. They are not a second decision log.

To add a record, take the next number, link it from this page, and state what
was rejected. If it replaces an older record, mark that file superseded and
say so here.
