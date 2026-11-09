# Planning queries and generated inputs

## Sub-features

Whole-Profile Kahn orders, weighted lightest, distinct pruned energy, shortest BFS
loops, Ready/Blocked, inclusive lightest_next and tree orientation.

## How to get to it (user POV)

The approved entries are list --ready/--blocked/--order, graph, HTTP planning
reads and both clients. B has not committed these algorithms at this checkpoint.

## Driving it with production imports

This coverage is pending. mapping.md specifies the exhaustive directed graphs
through four nodes, status/weight subsets, seeded DAGs through 40 nodes, literal
diamond and long cycle, independent oracles, replay comparisons and real-code
sensitivity obligations. A has supplied candidate traversal signatures; that
interface information is not a committed proof. No stand-in query implementation
or hand-copy is shipped to make a test pass.

## Gotchas

Done and cancelled are neither Ready nor Blocked. Filters accept true only.
lightest_next includes a Ready unresolved root. Terminal nodes prune energy,
but never cycle detection or whole-Profile Kahn ordering. Tree classification
uses n-1 edges with converging/diverging/mixed orientation and chain precedence.
The exact seed and corpus counts must accompany actual executed production
checks later. None are fabricated for this checkpoint.
