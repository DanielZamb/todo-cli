# Pele renders Task graphs in both clients

Proposed, 2026-11-09. Phase 0 approval is pending.

Pin Pele 1.13.0 behind a small adapter shared by Electron and SwiftUI's local
WKWebView resources. The domain returns a typed graph and deterministic Mermaid
text. Pele belongs to client rendering and build tooling, never to CLI or
domain graph rules. All resources work offline under the existing CSP.
Both distributions retain Pele's MIT and Lucide's ISC notices. Package age
and third-party-notice checks precede the dependency change.

The application owns selection, keyboard focus, expanded nodes and x/y/scale.
SSE refreshes preserve them. Use render output rather than mount().update(),
which resets fit and lacks a public pan-state API. Bind node pointerdown before
zoom capture for issue 130; return focus when Reset or another zoom control
hides for issue 131. Verify the host fixes in Chromium and offscreen WKWebView.

Open at the selected Task and its direct blockers/dependents, expand one level
with click or keyboard, and provide a whole-group overview. List and search
stay primary above about 50 Tasks. Native accessible lists and menus offer all
actions; diagram semantics alone do not establish VoiceOver support. Click opens
a Task, context/keyboard actions open Depends on or Blocks pickers. List drag
is included; diagram edge dragging is deferred. If Pele fails, the fallback
is our own simple renderer of typed nodes and edges, never Dagre.

The read-only investigation is
`.orchestrator/runs/2026-11-07-task-search-dag/research/pele/report.md` in the
canonical checkout. It proves offline feasibility and known host workarounds,
not production integration or the final Compact UX. The coordinator reviews
both clients' Compact, light and dark designs before integration.

We rejected Mermaid as the application renderer because the tested bundle and
layout costs are larger. Mermaid remains an interoperable export. Dagre is
rejected as a fallback by owner decision. A new layout engine has no v1
justification. An Excalidraw-based renderer remains a deferred experiment.
