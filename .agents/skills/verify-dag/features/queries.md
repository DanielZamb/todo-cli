# Graph queries and ranking

The same compiled DAG command runs graph-proof.ts against production exports.
It asserts a 1,2,3,4 diamond totals 10, shared ancestors count once, missing
weights count as unweighted and still traverse, and terminal branches prune.
Ready lightest_next includes its root; terminal roots return []. A cancelled
Task with an open blocker is neither Ready nor Blocked and still follows that
blocker in topo/lightest. Priority, due and id ties have literal orders.

The cases check connected nodes/edges, degree, sources/sinks, strict ancestry,
longest-source depth and single/chain/tree/dag precedence. Converging, diverging
and mixed trees have literal fixtures. A 105-node chain crosses multiple bitset
words and closes a 105-edge cycle through the shared shortest-cycle BFS.
Mermaid keeps redundant edges, uses safe identifiers and entity-escaped labels.
No renderer, stored closure, minutes or critical path participates.

Pure query behavior is L1 plus compiled library proof. Public CLI and HTTP
entry-point proof is recorded separately when commands are wired.
