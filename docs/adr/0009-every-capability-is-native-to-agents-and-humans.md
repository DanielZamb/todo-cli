# Every capability is native to agents and humans

Agents and the owner both use Todo every day, so neither gets a second-class path. Every capability ships two primitives over the same `packages/domain` logic and the same HttpApi contract (ADR-0003): an agent primitive in the CLI, and a human primitive in both desktop clients, plus a terminal view when the capability is live or for monitoring. A feature that exists only in a UI, or only in the CLI, is unfinished. We rejected building for one audience and adding the other later, because the other path then reimplements rules or never gets built.

## Agent primitive

- A non-interactive CLI command. It never prompts when stdin is not a TTY or when `--format json` is set.
- `--format json` writes exactly one JSON object to stdout and nothing else. Diagnostics go to stderr. Every response carries `generated_at`.
- Errors in JSON mode use one shape, `{ "generated_at", "code", "message", "details"? }`, with the documented exit codes: 0 success, 1 runtime failure, 2 validation or usage error, 3 not found or auth missing, 4 Conflict. A parse or usage error in JSON mode is a JSON error with exit 2, never help text with exit 0.
- Each command's JSON response has a published JSON Schema, readable with `todo schema <command>`. Changes are additive: existing fields keep their names and meaning, so scripts keep working. The export goldens stay byte-identical.
- Errors say how to recover. A Conflict reports the current Version, and a missing flag names the flag.
- Bulk or destructive changes offer `--dry-run`, which returns the same report shape without writing.
- Live data streams as NDJSON, one JSON object per line, with `--follow`. Every line decodes with the command's schema. A terminal error goes to stderr in the shared error shape, and the process exits with its code.

## Human primitive

- Electron and SwiftUI both get the capability, designed to their own systems (design/electron, design/macos), and reviewed for taste by the coordinator.
- Markdown stays the CLI default for people. A capability that is live or for monitoring also gets a TTY view in the terminal, with color, layout and keyboard control, that falls back to the agent output when stdout is not a TTY.
