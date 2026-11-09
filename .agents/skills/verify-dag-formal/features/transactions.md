# Dependency writes and concurrent writers

## Sub-features

Add/remove, unchanged edge edits, stale observations, cross-Profile endpoints,
self-edge refusal, cycle refusal, count boundaries and completion/reopen races.

## How to get to it (user POV)

The approved product entries are depend, undepend, completion, cancellation and
reopen through CLI/HTTP and clients. They are not present at this reviewed base.
This checkpoint exercises their approved transaction semantics as a model.

## Driving it with TLC

Run the skill command. statuses enumerates 64 initial status assignments.
opposite/transitive explore loop races. degree-two-race has four Tasks and two
competing inserts against a dependent with one existing blocker. profiles checks
foreign endpoints. noop/noop-add admit stale valid Versions without History;
malformed/unauthorized enter boundary failure instead. boundary13/boundary14
check 15-Task single-add model outcomes. Positive queues must empty.

## Gotchas

The 13/14 model is separate from the smaller count race. No warning-text, parser,
authorization implementation or public exit-code behavior is proved here.
Five mutants must fail the intended invariant with exit 12 and a trace.
