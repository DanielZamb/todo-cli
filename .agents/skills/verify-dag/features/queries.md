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
descendants and lightest_next describe the requested root at report level.
Ancestors and descendants use whole-Profile topological order; lightest_next
uses own energy ascending, unknown energy last, then topological position.
The literal branch has topo A(4),B(1),U(unknown),R,C,D and requires root sets
A,B,U / C,D / B,A,U. Direct, encoded, CLI, HTTP and both client decoders assert it.
TODO_GRAPH_RESPONSE_MODE=order runs this graph-response regression without
repeating or relabeling the retained candidate-specific chain measurement.
The 1,000-node closure drive checks direct and encoded fields and retained bytes.

Pure query behavior is L1 plus compiled library proof. Public CLI and HTTP
entry-point proof is recorded separately when commands are wired.
