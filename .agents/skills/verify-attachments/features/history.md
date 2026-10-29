# History and Purge

## Sub-features

Attach and detach increment the Version, appear in History and support Revert.
Delete retains files. Purge erases managed files and redacts references.

## How to get to it (user POV)

Detach through the editor or CLI, then Revert its History entry. Delete a Task
before Purge. External referenced files stay where they are.

## Driving it with CLI and curl

The helper detaches with the compiled CLI, receives its SSE event, then Reverts
through HTTP. It Deletes and Purges with the compiled CLI and observes the
actual copied image disappearing. History must contain no erased paths.
Domain tests also replay snapshots and preserve every Task in another Profile.

## Gotchas

Copied files detached earlier remain until Purge so Revert can recover them.
Purge cleanup refuses symlinks and retries durable queued work after failure.
