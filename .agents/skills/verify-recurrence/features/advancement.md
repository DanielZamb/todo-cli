# Series advancement

## Sub-features

Atomic first Occurrence creation, complete, cancel, stale Version rejection,
failed-insert rollback, standalone completion and duplicate-successor prevention.

## How to get to it (user POV)

Call `startSeries` with Series facts and first task and Occurrence IDs. Call
`finishTask` with the current task ID and Version, action, explicit timestamp,
and candidate next IDs. The domain resolves and stores the next Occurrence.

## Driving it with the compiled Bun driver

Run the helper. `actions.json` shows the accepted completion, stale rejection,
forced insert failure and successful cancellation. Inspect `01-dst.json` for
the finished task and its successor in the same committed event. The failed
insertion leaves History at three operations and Monday open before retry.

## Gotchas

The library owns one SQLite transaction for each command. No clock lookup or
server is required. Deleted Series stop advancement. A terminal task cannot
advance again. Scheduling edits do not change a new Occurrence's original
recurrence cursor. Callers choose IDs before the operation; replay retains them.
