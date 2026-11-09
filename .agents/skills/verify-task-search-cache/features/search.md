# Search after another writer changes a Task

## Sub-features

Preserve the same search strings, acceptance, order and UTF-16 highlights after
edits, Delete, Revert, Purge, restore and rebuild. Keep Profiles isolated and
bound retained folded words.

## How to get to it (user POV)

Use `todo list --text cafe --format json` or `GET /profiles/work/tasks?text=cafe`.
Both clients use that same authenticated HTTP list route.

## Driving it with the compiled CLI and HTTP harness

Run the parent skill's one command. The lifecycle driver creates Café rent,
warms the HTTP memo, edits through a separate compiled CLI process, Reverts
through HTTP, restores Version 1, writes different text at Version 2, Deletes,
Purges and restores again. The last restore must leave zero Tasks. Each search
compares complete ordered Task JSON and spans with the uncached baseline.
The generated driver also proves local eviction and mutates the real code.

## Gotchas

Purge from another process cannot erase this process's heap immediately.
Content addressing prevents stale words from matching changed Task strings.
The current CLI does not expose Revert; the proof labels its HTTP step.
Bounds are charged bytes and entry counts, not an RSS guarantee.
