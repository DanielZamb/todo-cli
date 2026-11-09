# Coordinator approval and corrections

Approved with corrections on 2026-11-09 after review of e2a3c679. These replace
conflicting wording in the original DAG-L1 CONTRACT and research reports.
No additional gate is required before units A and F.

- G1. Blocked means status open or snoozed AND at least one open or snoozed
  direct blocker. Done and cancelled Tasks are neither Ready nor Blocked.
- G2. Ready and Blocked filters accept true only. CLI switches and HTTP
  ready=true and blocked=true are accepted. false is a usage error, exit 2 or
  HTTP 400, with a message pointing to --blocked or --status.
- G3. Keep the n-1-edge tree rule. Tree results add orientation: converging
  when every Task blocks at most one other, diverging when every Task has at
  most one blocker, or mixed. single and chain take precedence.
- G4. lightest_next contains Ready Tasks in T's remaining set, including T.
  A Ready unresolved T gives [T]. A done or cancelled T gives [].
  Sort by each Ready Task's own energy ascending, unknown energy last, then
  whole-Profile topological position.
- G5. Per-item atomic batch-depend is approved.
- G6. Dropping source onto target makes TARGET depend on SOURCE. Source blocks
  target. The hover label is "<target> will depend on <source>". Already depends
  on, self and foreign-Profile rules remain.
- G7. Obsidian block links stay inside the existing one projection note.
- G8. dependency_fingerprint is approved. Both apps and the TTY prompt always
  send it. Agents may omit it.
- G9. Exact warning advice, with N replaced by the count: "This Task depends on
  N Tasks. That's a lot for one Task. It might be a whole Project, or it might
  be clearer split under a few more parent Tasks." too_many_dependencies uses
  the same advice with the refused count.
- G10. V1 has no second renderer at runtime. A Pele render error shows the
  keyboard-accessible Task/Dependency list, the error and Retry. Our own
  renderer is a deferred strategic replacement if Pele is abandoned, alongside
  the deferred Excalidraw idea. Dagre remains rejected.
- G11. Coordinator seat 2 amended the graph response after reviewing unit B
  source e7170510 on 2026-11-09. GraphNode has only mermaid_id, task, in_degree,
  out_degree, ready, blocked, depth and remaining_energy. GraphReport carries
  ancestors, descendants and lightest_next for its requested Task only.
  Ancestors and descendants use whole-Profile topological order; lightest_next
  uses the G4 order. A client requests another Task's graph to obtain its sets.
  Response size is O(n+m) plus the root's O(a+z) sets. This replaces the approved
  per-node closure fields. Prove exact root ancestors and node keys
  on a 1,000-Task chain; record actual response bytes before and after on a
  scratch database. Regenerate OpenAPI and Swift, update both client decode
  tests, and re-pin F to the corrected source. Unknown-energy sort changes
  remain deferred.

The coordinator corrected G11's ordering wording after reviewing source
3cceb41e. G11 changes where the sets appear, while lightest_next retains G4's
energy order. A literal branching fixture must distinguish energy order from
topological order and put unknown energy last.

Standing order 26 replaces delegate_task. Workers and seat-1 reviewers launch
as top-level t3_thread_launch threads in worktrees, from feat/task-dag, with
Codex gpt-6.1-sol xhigh for workers and max for seat 1. Every thread sends its
terminal status to DAG-L1 and the coordinator. If launch is unavailable, report
blocked without fallback. Client-base clearance for E and S comes separately.
The graph frame legibility pass is due before Phase 2.
