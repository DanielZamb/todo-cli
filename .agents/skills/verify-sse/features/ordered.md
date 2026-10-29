# Ordered operations

## Sub-features

Committed operations retain their global sequence IDs and resolved payloads.
Rejected History stays out of the stream. All committed event kinds qualify.

## How to get to it (user POV)

Subscribe to `GET /profiles/work/events` with a work credential.

## Driving it with curl

Run the helper in [verify-sse](../SKILL.md). It records raw SSE and compares
IDs with committed work rows in SQLite, including `AuthChanged` and Task events.
It checks literal titles and Version changes after an accepted and stale edit.

## Gotchas

IDs can have gaps because rejected and other Profile operations share the
sequence. `ready` has no ID and changes no resume cursor. No Last-Event-ID
means replay from the beginning, then follow future commits.

A connected owner Session receives ProfileDeleted for its current Profile before
the next authorization check closes that stream. A reconnect to the deleted
Profile returns the shared 404. Scoped Tokens fail after revocation. The compiled
verify-profiles helper captures the notice in profile-deleted.sse.
