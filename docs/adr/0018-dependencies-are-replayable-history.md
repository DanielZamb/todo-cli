# Dependencies are replayable History

Accepted with coordinator corrections G1 through G10, 2026-11-09. Extends ADR-0007 and ADR-0008.

DependencyAdded and DependencyRemoved record endpoint ids and the dependent's
resolved Version transition. Only the dependent changes Version. Their edge
projection, Version and committed op_log row share one transaction. Refusals
record captured graph evidence in a rejected attempt after rollback. Unchanged
operations write no History.

A lifecycle operation records its grouped edge changes in that operation's
single event, with every affected surviving dependent's resolved Version.
A Delete removes all incident edges; Purge later redacts History content while
retaining structural ids and surviving Versions. Revert inverts edge deltas
against the current graph, rechecking cycles, status rules and in-degree inside
the writer lock before committing the entire inverse.

Migration 0007 adds the guarded direct-edge table and covering indexes without
rewriting old rows. New lifecycle payload variants use entity_version 2 while
old v1 events remain readable. Replay applies resolved edge facts without clocks
or current command validation. Internal replay checkpoints add optional edges;
old checkpoints mean an empty graph and snapshots.entity_version remains 1.
Rebuild drops edges before endpoints and reproduces edges exactly.
Purge understands either endpoint in events, rejection details, replay
checkpoints and owner Snapshot copies, without erasing unrelated replay facts.

The schema and event details are in
[Task DAG Phase 0](../decisions/task-dag-phase-0.md). DagAcyclic complements the
existing Task compare-and-swap verification; neither replaces compiled replay
and both-client proof.

We rejected storing depends_on inside Task content, silent foreign-key cascades,
one independent event per removed edge, and stale adjacency-array Reverts.
They duplicate facts, hide grouped History, or overwrite newer graph changes.
