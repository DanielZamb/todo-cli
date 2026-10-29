# Port to Effect with one shared domain package

The Go CLI is being replaced by an Effect TS codebase: one domain package that holds every rule (validation, OCC, review grouping, rendering), used by both the CLI (`@effect/cli`) and the desktop server (`@effect/platform`). Exactly one implementation of the rules may write the database. We rejected keeping Go for the CLI next to an Effect server, because two codebases writing the same SQLite file with duplicated rules would drift. The Go v0.1 code is frozen as the reference until parity, then retired (see ADR-0007), and its golden tests are the acceptance spec for the port.

## Consequences

- The CLI still opens SQLite directly through the shared package, so it works without the server running.
- Server and CLI ship as single binaries built with `bun build --compile`. The server runs as a launchd user agent that the SwiftUI app installs and supervises.
- The monorepo uses pnpm workspaces. Bun is only the runtime and the binary compiler, not the package manager.
