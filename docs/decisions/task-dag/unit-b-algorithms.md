# Unit B algorithm checkpoint

All exports below are available from packages/domain/src/index.ts and their
named modules. TaskGraph is a consistent Profile snapshot with readonly tasks
and edges arrays. indexGraph removes deleted Tasks and creates ephemeral
upstream/downstream adjacency maps. No computed graph values are stored.

- dependency-rules.ts retains A's dependencyCycle(edge: Edge, traversal: DependencyTraversal): TaskId[] | null and shortestUpstreamPath(start: TaskId, target: TaskId, upstream: DependencyTraversal["upstream"]): TaskId[] | null.
- graph-order.ts exports topologicalOrder(graph: TaskGraph, remaining?: ReadonlyMap<TaskId, { readonly energy: number }>): TaskId[]. Omit remaining for topo. Supply graphEnergy(graph).values for lightest. Both use the same Kahn min-heap and keep terminal edges. compareGraphTasks(a: Task, b: Task): number owns priority/due/created/id ties, with missing due last.
- graph-energy.ts exports graphEnergy(graph: TaskGraph), returning values: Map<TaskId, RemainingEnergy>, contains(root: TaskId, id: TaskId): boolean and lightestNext(id: TaskId): TaskId[]. RemainingEnergy is { readonly energy: number; readonly unweighted: number }. Temporary Uint32Array ancestor sets include unresolved roots, prune terminal branches, and use masks for unknown and weights 1 through 5. lightestNext returns Ready members, known own energy first then whole-Profile topo position.
- graph-model.ts exports indexGraph(graph: TaskGraph): GraphIndex and dependencyState(task: Task, graph: GraphIndex): { ready: boolean; blocked: boolean }. Both statuses exclude done/cancelled. reachable(start: TaskId, adjacent: ReadonlyMap<TaskId, readonly TaskId[]>): Set<TaskId> returns strict reachability.
- graph-queries.ts exports graphShape(graph: TaskGraph), for a connected component, returning { shape: "tree", orientation: "converging" | "diverging" | "mixed" } or { shape: "single" | "chain" | "dag" }. queryGraph(graph: TaskGraph, task_id: TaskId, generated_at: Instant): GraphReport | null selects the weak component and computes degree, sources/sinks, strict ancestry, longest-source depth and remaining energy.
- graph-mermaid.ts exports graphMermaid(graph: TaskGraph): string. Safe node names map to typed Task identities; entity-escaped quoted labels and deterministic blocker-to-dependent arrows retain redundant edges.
- A's OperationStore.graph(profile: ProfileId), dependencies(), rebuild() and takeSnapshot() retain their existing signatures and implementation. graph reads Tasks and edges in one SQLite read transaction.

L1 literal graph test exits 0. The compiled verify-dag exits 0 including this
production-imported corpus. pnpm check exits 0. Absolute evidence directory:
docs/evidence/task-dag/unit-b/algorithms.
No command/API/client completion is claimed at this checkpoint. F's finite
model and generated production corpus remain with L1/F; these fixtures do not
replace F or implement independent copies of the algorithms.

Added domain source files: graph-model.ts, graph-order.ts, graph-energy.ts,
graph-contract.ts, graph-queries.ts and graph-mermaid.ts. Added proof inputs:
scripts/graph-proof.ts and test/graph.test.ts. The existing verify-dag skill
covers the same Dependency subsystem and now maps its read algorithms.
Local comments/structure audit found no added source comments or suppressions,
no wrapper-only modules and no graph policy in transport code. No child used.
