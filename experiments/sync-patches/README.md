# Patch protocol experiment

Throwaway code on exp/sync-experiment. No ordinary product route imports it.
Do not merge, install or push this branch.

The compiled builder instruments the shared domain transaction without editing
product sources. E1 compares an atomic stored outbox and a consistent-read memory
Replica. The other drivers measure list representations, ring retention, JSON and
Codable decoding, external commit detection, and SSE versus WebSocket delivery.

Read docs/decisions/ui-speed/sync-experiment-report.md for methods, numbers and
unqualified paths. The project-local verify-sync-experiment skill describes the
scratch-only reproduction. No dependency or signing change is needed.

The 300-edit burst uses a persistent compiled domain process. A smaller set of
actual compiled CLI invocations proves that path separately. Transport routes
are prototypes using Bun's built-in server and WebSocket support. They do not
qualify the production HttpApi adapter or generated clients.
