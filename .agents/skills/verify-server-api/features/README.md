# Server API feature map

- [Credentials](credentials.md): Session sign-in/out and scoped Access Tokens.
- [Tasks](tasks.md): Profile-scoped list, show, create and patch.
- [Lifecycle and conflicts](lifecycle.md): Version checks, transitions and Delete.
- [Client reads and quick-add](client-reads.md): counts, planning views, scoped History, Purge redaction and parser.
- [Client writes](client-writes.md): move, Revert, Series writes and Occurrence skip.
- [Contract and listener](contract.md): health, loopback binding and OpenAPI.

Run the helper in [the skill](../SKILL.md) for the complete curl drive. The
HTTP contract suite adds malformed requests, recurrence and durable History.

Owner-only Snapshot create/list/show/restore/prune routes are covered by the
compiled [Snapshot drive](../../verify-snapshots/SKILL.md). It checks Session
access, Token refusal, dry-run counts, Restore, SSE reload and reminder recovery.
