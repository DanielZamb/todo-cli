---
status: accepted
---

# Profile deletion preserves History and reserves IDs

The owner can delete an empty Profile, or explicitly Delete its visible Tasks
first with `--with-tasks`. Deleted Tasks do not count toward emptiness. The last
remaining Profile cannot be deleted. Both desktop clients require a second
confirmation before deleting Tasks with a Profile.

Deletion records TaskDeleted events followed by ProfileDeleted in the operation
log, atomically with the tombstone and scoped credential revocations. The domain
takes a Snapshot after authorization and preview checks, before opening the
deletion transaction. A Snapshot failure aborts deletion. The deletion transaction
rechecks emptiness and the last Profile rule because another write can arrive
after the Snapshot. Task content and History remain stored;
this operation never Purges. Profile deletion is final in place. The owner
recovers from the pre-deletion Snapshot through the Snapshot capability.

A tombstoned Profile keeps its immutable ID forever. Its name can be reused by
a newly created Profile with a new ID. History continues to reference the old
ID. Migration 0004 only adds the tombstone table and guards. It does not rewrite
existing data. Replay reconstructs tombstones from committed ProfileDeleted
events, including when replay starts from a Task Snapshot.

ADR-0005's Sessions are owner-wide. No Session belongs to a Profile, so Profile
deletion does not revoke Sessions or unscoped Access Tokens. It revokes all
unrevoked Profile-scoped Access Tokens in the same transaction. Owner Session
authorization is required to delete a Profile.

GET /profiles excludes tombstoned Profiles. Every Profile-scoped route returns
404 with the shared generated_at, code and message error shape for a deleted
Profile. An already connected owner Session receives the ProfileDeleted SSE
operation before the stream closes. The client clears unavailable Task state
and switches to a remaining Profile. On reconnect or reload, a 404 triggers
Profile discovery and the same switch. Scoped Tokens instead fail authorization
after revocation.

A dry run computes the same deletion report without a Snapshot, Task changes,
credential revocations, tombstones or operation log writes. Refused real
attempts against an active Profile remain in the operation log.
