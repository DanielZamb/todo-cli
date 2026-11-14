# Profile changes

## Sub-features

A switch displays the requested Profile's current catalog and preserves ordered
replay even when the saved cursor is behind.

## How to get to it (user POV)

Switch to a Profile changed by the CLI while it was not visible.

## Driving it with the scratch command

Run the three 0/50/300 backlog cases. Require the literal operation counts,
canonical Task equality and correct Profile identity. Report switch-to-live,
switch-to-current and final replay drain separately. Compare actor gaps,
loading and read-only intervals with the same baseline.

## Gotchas

Reset only scratch cursors. A stale response must never publish after another
switch, credential change or restore. The installed app's native Profile picker
and selection preservation remain separate coordinator gates.
