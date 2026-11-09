# Grouped lifecycle and replay

## Sub-features

Delete with Dependencies, Revert of modeled operations, exact affected Versions,
resolved replay, private pending state, crashes and captured rejection evidence.

## How to get to it (user POV)

Delete removes incident Dependencies in one History event. Revert applies the
inverse after checking current graph rules and the original event's Versions.
This checkpoint drives the committed OperationStore. Public confirmation and
final command controls remain pending B.

## Driving it with TLC and compiled production imports

Run the skill command. The finite model checks Delete fan-out and fan-in,
competing endpoint deletion/addition, cancellation/completion and one later
Revert. The independent replay driver compares literal issued edges, Versions
and complete Tasks against raw SQL through 93 cases and 186 rebuilds. It uses
compact deltas and TaskCreated v2 initial edges. The unchanged candidate DAG
fixtures add Delete/Revert/Move/Purge, authenticated initial edges, FK checks,
Purge row-effect audit, rejection redaction and Snapshot restore. Every owned
candidate mutation restores exact bytes and must pass a clean targeted rerun.

## Gotchas

The model inverts edge deltas, never old adjacency arrays. A Revert must reject
when a newer accepted change advanced an affected dependent. Refusal witnesses
belong to the validation graph, not the graph at RejectCommit. Crashes can lose
uncommitted rejected History. Move, Purge, creation, checkpoints and filesystem
protocols are concrete drives, outside the finite TLA+ claim.
