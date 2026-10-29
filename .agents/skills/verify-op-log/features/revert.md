# Revert

## Sub-features

Restore prior facts, preserve increasing versions and history, reject stale
reverts, reject a purged task, and revert resolved occurrence changes together.

## How to get to it (user POV)

Call `store.revert({ actor, profile, seq, occurred_at })` with the accepted
operation's sequence and an explicit UTC instant.

## Driving it with the compiled Bun driver

Run the helper. `05-revert.sql` has six history entries, including the rejected
conflict, the rejected invalid title, and the accepted inverse event. The edited task's title is again
`Ship the port`, now at version 9. The behavior suite also checks Purge refusal
and that a repeated stale revert becomes a conflict.

## Gotchas

A revert compares every affected task and series with the original operation's
result. Later changes cause a conflict. Reverting creation records Delete with
a newer version. It preserves history and does not erase the original event.

Purge permanently blocks Revert of accepted and rejected entries with the
literal reason `task_purged`. See [Purge redaction](purge.md).
