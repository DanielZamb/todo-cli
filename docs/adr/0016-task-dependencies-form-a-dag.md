# Task dependencies form a DAG

Accepted with coordinator corrections G1 through G10, 2026-11-09.

A Dependency is a directed relation between two Tasks in one Profile. B depends
on A means A blocks B, drawn A -> B. Nodes and edges are independent domain
facts. A connected group is computed from edges. It is not a stored entity.
Trees, chains and a single Task are special cases of the DAG.

Store direct edges in task_dependencies, keyed by Profile, dependent and blocker,
with the reverse covering index. Composite foreign keys enforce Profile
membership; domain guards enforce acyclicity, visible endpoints and lifecycle
rules. BEGIN IMMEDIATE precedes all graph validation. BFS upstream returns the
shortest loop without a depth limit and follows all statuses. The direct
in-degree limit is 13, with many_dependencies above 8. Redundant edges remain
stored and return an implying-path warning. The counted many_dependencies
advice is: "This Task depends on N Tasks. That's a lot for one Task. It might
be a whole Project, or it might be clearer split under a few more parent Tasks."
The refusal above 13 uses the same advice. A no-op succeeds despite a stale
Version. A real edge change advances only the dependent's Version.

Ready and Blocked both exclude done and cancelled Tasks. Ready requires every
direct blocker to be done or cancelled. Blocked requires an open or snoozed
direct blocker. Ready and Blocked filters accept only true; false is a usage
error pointing to --blocked or --status. Open and snoozed blockers block completion. Reopen and Revert
cannot reopen a blocker of a done Task. Both apps offer Create follow-up.
Delete removes all incident edges in one event. CLI confirmation is [y/N] only
on a TTY in md mode; agents use --with-dependencies or receive has_dependencies.
--force retains its Purge meaning. Move drops edges; copy carries none.
Occurrences can have edges, but their successors inherit none. Series-level
edges are deferred. List drag makes the target depend on the source, shown
as "<target> will depend on <source>". Apps and TTY confirmations always submit
the reviewed Delete dependency_fingerprint; agents may omit it.

Kahn ordering runs on the whole Profile graph before filtering. Topological ties
use priority, due date, created time and id. Lightest first uses remaining
energy ahead of those ties without violating any edge. Remaining energy sums
each unresolved reachable ancestor once, plus the unresolved root; done and
cancelled nodes stop that walk. Missing weights count as unweighted. Compute
all graph properties, bitsets and ranks on read. lightest_next includes all
Ready Tasks in the remaining set, including T. A Ready unresolved T gives [T];
a done or cancelled T gives []. A non-chain tree has n-1 edges and an undirected
tree form. Its orientation is converging when every Task blocks at most one
other, diverging when each Task has at most one blocker, or mixed. No graph minutes or critical
path ships in v1.

ADR-0009 requires the shared implementation in CLI, HTTP, Electron and SwiftUI.
The exact requests, events, recovery errors, lifecycle machines and proof plan
are in [Task DAG Phase 0](../decisions/task-dag-phase-0.md).

We rejected a subtask hierarchy, cross-Profile edges, stored closure and ranks,
status-pruned cycle checks, depth-limited traversal, force-completing blocked
Tasks, and automatic edge inheritance between Occurrences. Those choices
would change the owner's graph meaning or weaken its invariants.
