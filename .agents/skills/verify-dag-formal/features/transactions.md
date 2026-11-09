# Dependency writes and concurrent writers

## Sub-features

Add/remove, stale observations, cross-Profile endpoints, self/cycle refusals,
count boundaries and completion/reopen races. Edge no-op boundary behavior is
modeled; final public command checks remain pending B.

## How to get to it (user POV)

The approved product entries are depend, undepend, completion, cancellation and
reopen through CLI/HTTP and clients. This checkpoint drives their committed
shared OperationStore and algorithm layer, plus the finite transaction model.

## Driving it with TLC and the compiled domain

Run the skill command. statuses enumerates 64 initial assignments. Opposite and
transitive configurations explore loops. degree-two-race uses four Tasks and
two competing inserts; profiles checks foreign endpoints. boundary13/14 check
15-Task single-add outcomes. Positive model queues must empty; the five mutants
must fail their intended invariant with TLC exit 12. The candidate's compiled
DAG drive also runs two real opposite-edge writers and exact replay. Literal
actual-domain checks confirm 9/13 acceptance, 14 refusal and counted advice.

## Gotchas

The small count race does not establish the literal 13 bound. Domain acceptance
and advice are separate from public many_dependencies response warnings. The
model abstracts malformed/auth failures before no-ops; public parser/auth and
true-only filter proof remains pending final B. No whole-feature client parity
or unbounded safety follows from these checks.
