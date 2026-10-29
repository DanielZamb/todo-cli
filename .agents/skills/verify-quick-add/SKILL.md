---
name: verify-quick-add
description: Verify Todo quick-add drafts through a compiled Bun library driver. Use after changing quick-add token parsing, explicit clocks, time zones or draft metadata.
---

# Verify quick-add

Generated with `create-verification-skill`.
Read [the feature map](features/README.md) before selecting coverage.
The public library entry is `@todo/domain`'s `parseQuickAdd`. The HTTP entry is
`POST /profiles/:profile/quick-add/parse` and is also covered by verify-server-api.

## Launch

Resolve the checkout with `git rev-parse --show-toplevel`. From that root:

```sh
.agents/skills/verify-quick-add/scripts/verify.sh "$PWD/docs/evidence/s04/parser-new"
```

Choose a new absolute evidence directory. The helper compiles
`packages/domain/scripts/verify-quick-add.ts` with `bun build --compile` into its
own `todo-s04-parser-*` temporary directory and runs that binary. No server,
credentials, database, environment clock or shared state is required. Exit zero
and `PASS; evidence survived cleanup` mean the recipe completed.

## Doctor

Run `bun --version` and `pnpm --filter @todo/domain typecheck`. Bun 1.4.4 or newer
and pnpm-installed dependencies are required. Inspect `commands.log` first when
a drive fails. Every call must supply `now` and `time_zone`; never replace them
with the host clock or zone.

## Drive

The launch command drives the public library function. It parses a relative due
date, a scheduled weekday and wall time, priority, duplicate Tags and a Project.
It repeats the identical request and requires the identical literal draft. It
then preserves quoted literal tokens and rejects an empty title, conflicting
dates, out-of-range minutes, a daylight-saving gap and a daylight-saving overlap.

Additional literal behavior tests run with `pnpm --filter @todo/domain test`.
HTTP authorization, read-only access and no Task writes are covered by:

```sh
.agents/skills/verify-server-api/scripts/verify-reads.sh "$PWD/docs/evidence/s04/parser-http-new"
```

## Evidence

The chosen evidence directory retains `commands.log`, `actions.json` and
`result.json`. Actions pair each explicit text/clock/zone input with the draft or
error. The compiled driver asserts literal UTC instants, calendar dates and
metadata. It calls production code directly, without mocks or internal setters.
The parser is pure and has no write dependency. The HTTP proof independently
checks the durable Task count after repeated parsing.

## Cleanup

The helper removes only its own new temporary directory on success or failure.
It verifies that scratch is gone and that evidence remains outside scratch.
No process stays running. Keep the evidence directory.

The checkout owns `.claude/skills/verify-quick-add`, a relative symlink to this
directory. Check `realpath .claude/skills/verify-quick-add`. A fresh Claude
session is required before claiming discovery; filesystem resolution alone is
not registration proof.

## Helpers

Executable `scripts/verify.sh <absolute-new-evidence-directory>` resolves the
checkout and compiles/runs the driver from any working directory. Use
`/maintain-verification-skill` when grammar or draft behavior changes.
