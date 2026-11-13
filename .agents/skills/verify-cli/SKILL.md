---
name: verify-cli
description: Verify the compiled Todo CLI in a scratch HOME. Use after changing CLI commands, shared task commands, rendering, review, export, or Obsidian projection.
---

# Verify the CLI

New DAG usage boundaries also require verify-dag/scripts/verify-closure.sh.
Its matrix asserts actual exit 2, one invalid_args JSON object, flag-specific
recovery and unchanged projection for malformed/zero/negative inputs, before
no-op detection. Missing files retain runtime classification.

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

## Version guardrails

The install verifier requires --version to report build and contract without changing the database directory. See [the feature recipe](features/agent-contract.md) for commands and expected evidence.

## Batch edit

Read [Edit several Tasks](features/batch-edit.md) for the shared batch-edit contract and the compiled scratch proof. Both client flows retain selections and loaded Versions through preview, apply and Conflict reload.

Dependency commands and graph responses also run through the compiled public
[verify-dag](../verify-dag/SKILL.md) drive. The command registry publishes depend,
undepend, graph, batch-depend and revert. contract.test.ts discovers their help,
validates real responses against published schemas, and covers add --depends-on,
list --ready/--blocked and ordering through the dedicated public drive.
## Exit meanings and empty lists

`test/error-list.test.ts` drives cached compiled CLI and server binaries on its
own scratch HOME. Set TODO_CLI_BINARY and TODO_SERVER_BINARY to the binaries
built from the same source hash. It checks actual process exits, every empty
list filter mode, the matching exit pair, selected Profile context, both generic
recovery commands, transfer rows and unauthorized Profile isolation. Its HTTP
cases cover Task, Attachment and Series failures, batch context, malformed
requests, missing authentication and forbidden Profile access. Evidence includes
error-list-actions.json. The server is stopped before the test removes scratch.
`todo schema error` constrains matching exit_code/exit_meaning pairs. List uses
its own required-tasks schema; export and review keep their original schemas.

Lookup recovery also names the credential key used by the failed CLI call.
`taskLookupError` requires transport and fifth `{action, credentialProfile?}`
arguments. There is no default auth action. CLI lookup hints always include
--credential-profile; scoped list
hints include it when the credential key differs from the target Profile id.
HTTP hints are unchanged. `cliLookupError` in main.ts is the single integration
point for credentialProfileName(cfg), and passes the operation's AuthAction to
metadata-only auth.resolveProfile. Both transports preserve rejected History
attribution without reading the Profile's Task data to get its name.
Batch edit, attach-many and import preserve their row fields while reusing that
same CLI presentation path for missing Tasks. Domain commands and authorization
do not resolve credential names.

`test/auth-history.test.ts` drives revoked and expired Sessions through compiled
CLI show/edit and HTTP GET/PATCH on fresh scratch databases. Each request must
leave exactly one rejected auth History row for default, with read for show and
mutate for edit, and keep the Task at Version 1. Profile selection calls the
shared auth.resolveProfile with the operation's action before any Task pre-read.
The error-list test also requires a scoped credential to receive the same generic
Profile-not-found response for a spaced foreign name and the absent name No Such.
Neither case may expose another Profile's name or Task data.

Move and copy resolve the destination through the same authorized Profile
resolver, then retain both write-access checks. The error-list regression compares
the exact table output and process exit for a scoped credential targeting Private
Profile or No Such, in apply and dry-run modes. Owner requests for No Such keep
the existing target Profile-not-found response. The auth-history regression also
checks one authenticate rejection for revoked move/copy through CLI and HTTP.

`test/discovery-integration.test.ts` logs out the destination credential, then
executes both printed recovery hints and the resulting Show command unchanged
through an owned scratch PATH. It checks the actual stored credential selector,
a credential name containing a colon and apostrophe, and the `--prefix=-a`
boundary. The domain enrichment regression also requires one mutate rejection
when that is the operation supplied to the metadata resolver.

## Authorized discovery

[verify-discovery](../verify-discovery/SKILL.md) owns the compiled Profile directory
and cross-Profile id-prefix lookup matrix, credential no-leak properties, WAL
snapshot tests and auth-failure rollback proof. Run its single command after
changing these reads or their CLI/HTTP contracts. Existing Profile-scoped SSE
and Task search behavior retain their current recipes.

## Accepted flags and early refusals

Read [the compiled flag inventory](features/flag-contract.md). The normal recipe
also runs mutation-flags.test.ts against its selected compiled binary. It proves
64 unsupported mutation flag pairs refuse without changing any table or database
bytes, and 32 md/JSON refusals happen before opening a store. Its help discovery
walks every command and checks the schema registry, then compares normalized
help and response-schema hashes with the reviewed fixture. flag-inventory.json,
flag-consumers.json, mutation-flags.json and mutation-flags-early.json retain the
actual outputs and each accepted flag's consumer or explicit exception.

Task editing flags belong only to add/edit. Delete/Purge flags belong only to
rm. Changes to those registrations must preserve rm's dry run, Dependency
preview/fingerprint and Purge through verify-dag's public and closure recipes.
The inventory retains init/login username as explicit compatibility exceptions
with their exact help text. Detach rejects label, which remains available on
attach and label-attachment. The same compiled test preserves all table bytes
and the external file, covers early md/JSON refusals, and checks label values.
The flag contract also records the intentional --force compatibility change
for edit/done/cancel/reopen, including before and after behavior.
