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

G11 keeps only eight fields on each node. Strict ancestors,
descendants and lightest_next describe the requested root at report level, in
whole-Profile topological order. The literal branching case orders A,B,R,C,D
topologically and B,A,R,D,C by energy, requiring root sets A,B / C,D / A,B.
The 1,000-node closure drive checks direct and encoded fields and retained bytes.

Pure query behavior is L1 plus compiled library proof. Public CLI and HTTP
entry-point proof is recorded separately when commands are wired.
