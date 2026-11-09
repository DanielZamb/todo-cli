# Grouped lifecycle and replay

## Sub-features

Delete with Dependencies, Revert of every modeled operation, exact affected
Versions, resolved replay, private pending state, crashes and rejection evidence.

## How to get to it (user POV)

Delete removes incident Dependencies in one History event. Revert restores the
inverse after checking current graph rules. The product entries are approved;
A's committed implementation and B's public controls are pending.

## Driving it with TLC

The delete scenario removes two incident edges, affecting the deleted Task and
two surviving dependents. The delete-fanin scenario removes two incoming edges from the primary Task, which advances once through its lifecycle transition.
delete-blocker/delete-dependent race an add with deleting either endpoint.
cancel-complete permits cancellation then completion and checks that Revert
cannot reopen that cancelled blocker under a done dependent. The command also
requires reachable grouped Delete, committed Revert and post-rollback witness
traces. AtomicGraphHistory folds only committed resolved facts.

## Gotchas

The model applies edge deltas, never old whole adjacency arrays, for grouped
Revert. Rejection witnesses belong to the validation graph, not the graph at
RejectCommit. A crash can erase an uncommitted rejection. Move/Purge, real FK
ordering, checkpoints and redaction are pending concrete production checks.
