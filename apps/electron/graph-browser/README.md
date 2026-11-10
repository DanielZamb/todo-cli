# Canonical graph browser resource

This is the host-neutral implementation of Graph host protocol v1. It imports no
Electron, React, Swift or domain code. Pele 1.13.0 supplies render output only.
Both apps own authorized reports, viewport, selection, expansion and accessible
Task/Dependency lists. SVG text is never parsed into Task identity.

From the repository root with the frozen pnpm dependencies installed:

```sh
bun apps/electron/scripts/build-graph-browser.ts
bun apps/electron/scripts/build-graph-browser.ts --check-only
```

The first command emits `apps/electron/dist/graph-browser/` and checks each byte
against `graph-browser.lock.json`. The output is already covered by the repository
`dist/` ignore rule. Track the source and lock only. `--update-lock` is for a
reviewed source/dependency change; ordinary builds never update it.

Copy the entire emitted directory to the consumer's bundle resources, including
`index.html`, `graph.js`, `graph.css` and `THIRD-PARTY-NOTICES.txt`. Copy it only
after the build/check passes, then verify the copied files against the same lock.
No consumer imports another worktree. L1 supplies the canonical source commit.
The Electron package build includes this directory; S owns the Mac build step.

`protocol.ts` exports schemas and derived types `GraphHostIdentity`,
`GraphViewport`, `GraphTheme`, `GraphNodeState`, `GraphHostRender`, `GraphHostReply`,
plus `decodeGraphRender`, `decodeGraphReply` and `graphNodeAccessibleName`.
`adapter.ts` exports `GraphBrowserAdapter` and `fitGraphViewport`.
Input theme token keys are `ink`, `paper`, `card`, `border`,
`muted-text`, `primary`, `on-primary`, `accent`, `warning`, and `danger`.
Absent colors use the neutral fallback. No host epoch field is read by the module.

After the local document finishes loading, call `window.todoGraph.receive(render)`
or post the render from its parent frame. A native host receives replies through
`webkit.messageHandlers.todoGraph.postMessage`. A parent frame receives replies
through postMessage and must check the source window and its own current identity.
`ready` is emitted on the first accepted render with that render's opaque identity,
followed by `rendered` or `renderError`. Do not wait for an unscoped startup reply.

The host codec rejects unknown protocol versions, message kinds, duplicate
mappings and unknown Task ids. The app must also compare every reply to its
current authorized Profile/root/auth/request identity before acting. The adapter
never makes a server call. A render error is an app-owned accessible-list/Retry
state, never another runtime renderer.

`root_id` is required and must be in `nodes`. Its primary border is independent
of `selected_id`. Optional node `title` supplies only the accessible name; the
full Task id is the fallback. Optional `state` supplies the state suffix and
semantic border/text styling. Unknown states are ignored. The module does not
derive state, parse labels or read opaque identity fields.

Omit `viewport` for the initial scope render. The module fits and centres the
visible region at scale at most 1 and emits one resolved `viewport` reply.
Supply a stored viewport to preserve its values unchanged without that initial
reply. Reset fits the current visible region. The app owns stored scope state.

`verify-graph-browser.ts` proves local offline loading, identity echo, real pointer
activation before/after zoom, the adapter's focus-return observer when a test
Reset button hides, and byte-lock refusal/restoration. It does not establish a
production app Reset control, native key dispatch or VoiceOver. These remain in
the client integration proof.
