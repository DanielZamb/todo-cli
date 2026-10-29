---
name: verify-filters
description: Verify combined Task filters through the compiled Todo CLI and authenticated HTTP on scratch SQLite. Use after changing Project, Tag, Status, Priority, date, Attachment text, Energy or Estimated time filtering.
---

# Verify Task filters

Created with `create-verification-skill`.
Read [the feature map](features/README.md) before choosing coverage.

## Launch

From the checkout root, run:

```sh
.agents/skills/verify-filters/scripts/verify.sh "$PWD/docs/evidence/filters/compiled-new"
```

Pass a fresh absolute evidence directory. The helper compiles the production CLI
and server with Bun, initializes a scratch owner and Profile through the CLI,
imports the reusable business fixture, then starts its own server on port 0.
It never opens the owner's database, starts either desktop app, or uses Keychain.

## Doctor

Require installed pnpm dependencies, Bun 1.4.4 or newer and a passing
`pnpm typecheck`. The helper runs the disk guard before compilation and requires
the server's loopback listen log and literal health response.
Read `actions.json`, `server.log` and `result.json` on failure.

## Drive

`apps/cli/scripts/verify-filters.ts` runs literal expected-title cases through
the compiled CLI and the authenticated HTTP Task List. It combines Project,
Tag, open/closed Status, Priority, Due date, Scheduled date, Attachment text,
Energy and Estimated time. It includes missing values, empty intersections,
Deleted Tasks and an instant whose stored time zone has the previous date.
It queries file paths, link URLs, labels and a real copied image's original name.
Invalid values must return CLI exit 2 and HTTP 400.
The emitted OpenAPI parameter schemas must retain literal Status, Priority and
Energy choices and date/minute patterns. `filter-parameters.json` records them.

For both desktop entry points, also run the existing
[Electron](../verify-electron/SKILL.md) compiled host and
[macOS](../verify-macos/SKILL.md) offscreen/headless recipes. Their native HOLD
remains in force. Their feature maps cover full and Compact appearances,
clear/reset behavior, SSE and client filter panels.

## Evidence

`actions.json` records commands, exit codes and HTTP responses without credentials.
`result.json` reports PASS only after every literal case succeeds. Evidence stays
in the requested directory. All database and referenced file paths belong to
the unique `todo-filters-verify-*` directory.
The helper overrides inherited `TODO_ATTACHMENT_ROOT` with its own scratch root.

## Cleanup

The finalizer stops only its own server, escalates after two seconds, waits for
exit, and removes only its scratch directory. It checks scratch removal and
preserves evidence on success and failure.

## Helpers

Executable `scripts/verify.sh <fresh-absolute-evidence-directory>` resolves the
checkout and runs the TypeScript driver through pnpm. No server stays running.
