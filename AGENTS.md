# Agent instructions

This repo is being ported from a Go CLI to an Effect TypeScript monorepo with a local server, an Electron client and a SwiftUI client.

- Read `CONTEXT.md` for the domain language and use its terms exactly.
- `docs/adr/` holds binding decisions. If the code you are about to write contradicts an ADR, stop and report it instead of diverging.
- `SPEC.md` describes the Go v0.1 behavior. Where an ADR disagrees with `SPEC.md`, the ADR wins.
- Every logic subsystem gets a verification skill at `.agents/skills/verify-<subsystem>/`, created with `~/.agents/skills/create-verification-skill/SKILL.md` and proven once end to end. Before changing a subsystem, read its verify skill and use it to prove the change.
- Tests assert behavior against literal expected values and use scratch databases. Only the core track migrates the real `~/.todo-cli/todo.db`, after backing it up.
- Package manager is pnpm. Bun is only the runtime and the binary compiler.
- Verification output stays local and is ignored by Git. Keep reusable inputs in test fixtures and preserve the project verification skills.
