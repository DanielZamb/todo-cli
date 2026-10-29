---
name: verify-cli
description: Verify the compiled Todo CLI in a scratch HOME. Use after changing CLI commands, shared task commands, rendering, review, export, or Obsidian projection.
---

# Verify the CLI

Generated with `create-verification-skill`.
Read [the feature map](features/README.md) before selecting coverage.

## Launch

From the checkout returned by `git rev-parse --show-toplevel`, run:

```sh
.agents/skills/verify-cli/scripts/verify.sh "$PWD/docs/evidence/c05/compiled-cli-new"
```

Choose a new absolute evidence directory each time. The executable helper builds
`apps/cli/src/main.ts` with `bun build --compile`, then drives the actual `todo`
binary through `@effect/vitest` integration tests. Bun 1.4.4 or newer and installed
pnpm dependencies are required. No server or external credentials are needed.
Every process receives a scratch HOME. No test opens the owner's real database
or backup. The helper runs to completion and cleans up its binary and HOME.

To drive an installed binary, set `TODO_CLI_BINARY` to its absolute executable
path before invoking the helper. This skips compilation and preserves that
binary during cleanup. The same acceptance cases and scratch HOMEs still run.

## Doctor

Run `bun --version` and `pnpm --filter @todo/cli typecheck` from the checkout.
The helper also runs its compiled binary with `--version` and requires exit zero.
If a drive fails, inspect `commands.log` and `actions.json` in its evidence directory.
Confirm each database belongs to `todo-c05-test-*` and the binary is either the
explicit installed executable or belongs to `todo-c05-verify-*`. Tests compile
their own binary when `TODO_CLI_BINARY` is unset.

## Drive

The Launch command drives every mapped feature. It initializes a scratch owner,
checks `init --password-stdin` with first-line/CRLF input, rejects empty input
and simultaneous password flags, signs in through stdin, adds and edits tasks, completes, reopens and cancels them,
checks stale Version failures in md/json/table, Deletes then Purges, reads redacted History in all three formats, isolates two
Profiles, revokes a Session, exports to disk, and replaces an Obsidian managed block.
The compiled binary uses the domain's public auth/store APIs for every mutation.
A structured Series case also creates and inherits Project and Tag definitions,
completes an Occurrence, edits and clears a rule, and makes a standalone Task recur.
CLI boundary regressions reject canonical vault escapes and empty vault paths,
map malformed Session files to exit 3/auth_required, and check every help path
plus the manual index and command reference sections from the Go acceptance suite.

The agent-contract case discovers every command from compiled help, checks the
registry is complete, and validates every JSON success response against its
published JSON Schema. It checks one object on stdout, diagnostics on stderr,
JSON usage errors, dash-leading descriptions and current-Version recovery for
all five mutation commands. History uses the approved generated_at/entries
envelope. See [the contract recipe](features/agent-contract.md).

The C05 review case also reapplies a rule on the second Occurrence, changes
a date rule to an instant rule before both completion and cancellation, clears
a migrated rule, inspects recurrence and Series identity in JSON show/list/export,
checks rejected validation History, and filters an uppercase Tag.

The golden case seeds the same three resolved tasks as the Go fixture through
public domain events, then drives `review daily`, `review weekly`, `export`,
`export --template jira-context`, and `--format json export`. Each output must equal
its original file under `apps/cli/test/golden` byte for byte.
JSON uses the Go test's normalization of generated_at, created_at and updated_at.
The test enumerates the directory and fails if any golden lacks a case. No
expected file is rewritten. Other cases create tasks exclusively through the CLI.

For the acceptance tests without a durable proof run:

```sh
pnpm --filter @todo/cli test
```

## Evidence

The selected directory retains `commands.log`, `actions.json`, `goldens.json`,
all five normalized `.golden` outputs plus `.raw` outputs, `crud-history.json`,
`export.md`, `obsidian.md`, `c05-review.json`, `contract-actions.json`, and
`contract.json`. Commands record exit codes, stdout and stderr.
Passphrases and bearer credentials are omitted. The hash list records equal
expected and actual SHA-256 values and byte counts. The history query observes
accepted mutations and four rejected conflicts in the scratch SQLite database.
File assertions prove export and Obsidian effects and preserve surrounding text.
This is the real compiled user path with no mocks or test-only production flags.

## Cleanup

The helper's exit trap removes only its own temporary directory on success or
failure. Tests independently remove their scratch directories in `afterAll`.
Evidence lives outside scratch and survives cleanup. The helper checks this
before printing `PASS; evidence survived cleanup`. Keep all evidence directories.
There is no long-running process to kill.

The checkout owns `.claude/skills/verify-cli`, a relative symlink to this directory.
Verify it with `realpath .claude/skills/verify-cli` after moving the checkout.
A fresh Claude discovery receipt belongs at `docs/evidence/c05/skill-discovery.md`.

## Helpers

`scripts/verify.sh <absolute-new-evidence-directory>` resolves its checkout and
works from any directory. `apps/cli/test/cli.test.ts` and `apps/cli/test/contract.test.ts` are the compiled-binary drivers.
Use `/maintain-verification-skill` when commands or this feature map change.

## Server diagnostics

`todo diagnostics --format json`, `--follow` NDJSON and `todo top` use the
owner-only HTTP read instead of opening SQLite. Follow errors go to stderr in
the shared JSON error shape. Each stdout line uses `todo schema diagnostics`.
The [diagnostics skill](../verify-diagnostics/SKILL.md) owns the compiled-server,
PTY, Profile/resize/quit and desktop monitoring proof. The CLI contract test
also checks schema discovery, missing Sessions and JSON usage errors.
U01 keeps `add <title>` literal. `add --parse <text>` opts into the shared quick-add
parser. `parse <text> --format json` returns one `{generated_at, draft}` object
without writing a Task. `schema parse` publishes that response. Invalid parsed
text uses the shared JSON error and exit 2. Quoted names use `#"deep focus"` and
`@"Client Project"`; whole quoted tokens such as `"#821"` remain literal.

Move and Copy also run through this compiled drive. The batch cases check named
Project and Tag resolution, dry-run, completed status, unchanged unrelated Tasks,
current Versions on Conflicts, one JSON object, and `todo schema move` and `copy`.
