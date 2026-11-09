---
name: verify-task-search
description: Verify Todo Task search normalization, clauses, typo prefixes, UTF-16 highlights and id-prefix filtering through the domain, compiled CLI and authenticated HTTP on scratch data.
---

# Verify Task search

Created with `create-verification-skill`. Read [the feature map](features/README.md).

## Launch

From the checkout root, run:

```sh
.agents/skills/verify-task-search/scripts/verify.sh "$PWD/docs/evidence/task-search/new"
```

Pass a fresh absolute evidence directory. The helper runs literal domain cases,
then the compiled CLI and HTTP filter drive. It caches production binaries in
this checkout's `.scratch/bin` using the existing cache helper. Each drive gets
a fresh scratch HOME, SQLite database and Attachment root. No installed binary,
owner database, native app or Keychain is used. The server requests port 0 and
must print its loopback listen URL within 60 seconds.

## Doctor

Require Bun 1.4.4 or newer, installed pnpm dependencies and `pnpm typecheck`.
The helper records `.scratch/bin/build.json` as `binary-provenance.json` and
runs the actual cached CLI `--version`. The HTTP drive checks health against the
generated `CONTRACT_ID`. Inspect `domain.log`, `drive.log` and
`compiled/actions.json` on failure.

## Drive

`packages/domain/test/task-search.test.ts` asserts the literal matcher and
boundary cases. `apps/cli/scripts/verify-task-search.ts`, called from the
filter driver, creates Tasks through the compiled CLI and queries each through
both CLI list and authenticated HTTP. It compares original strings and exact
spans from the same response, checks omitted metadata without text, invalid
flags and HTTP queries, empty success, stable order and exact-id commands.
The parent filter matrix also combines text with every existing filter.

Use `todo man list` and `todo schema list` to inspect syntax and response shape.
HTTP remains `GET /profiles/work/tasks?text=...&prefix=...`. Closed quotes are
whole-word phrases. An unclosed phrase permits its last word to prefix-match.
Exclusions use zero-typo prefixes. Hyphens inside a term separate positive words.

## Evidence

The requested directory keeps `domain.log`, `drive.log`, `doctor.log`,
`binary-provenance.json` and `compiled/`. `compiled/task-search.json` contains
literal cases and CLI/HTTP responses. `compiled/actions.json` records actual
process exits and HTTP statuses, and `compiled/result.json` reports PASS only
after the complete matrix and cleanup. No credentials are retained.

## Cleanup

The filter driver's finalizer stops only its child server, waits for exit and
removes only its scratch directory. Cached binaries and evidence survive.
The script checks that the PASS result and search receipt still exist.

## Helpers

Executable `scripts/verify.sh <fresh-absolute-evidence-directory>` resolves its
checkout and runs domain tests plus the compiled filter drive. It reuses
`TODO_CLI_BINARY` and `TODO_SERVER_BINARY` from the cache manifest.
`.claude/skills/verify-task-search` is a relative link to this directory.
Fresh Claude discovery remains a separate coordinator check; a resolved link
alone does not prove discovery. Use `/maintain-verification-skill` when syntax
or the response contract changes.

## Authorized discovery

[verify-discovery](../verify-discovery/SKILL.md) owns the compiled Profile directory
and cross-Profile id-prefix lookup matrix, credential no-leak properties, WAL
snapshot tests and auth-failure rollback proof. Run its single command after
changing these reads or their CLI/HTTP contracts. Existing Profile-scoped SSE
and Task search behavior retain their current recipes.
