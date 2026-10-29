---
name: verify-profiles
description: Verify Profile discovery, deletion, credential revocation, Snapshot recovery data, name reuse and SSE through compiled Todo CLI and HTTP on scratch SQLite.
---

# Verify Profiles

Created with `create-verification-skill`.
Read [the feature map](features/README.md).

## Launch

From the checkout root, run:

```sh
.agents/skills/verify-profiles/scripts/verify.sh "$PWD/docs/evidence/f10/profiles-new"
```

Use a fresh absolute evidence path. The helper compiles the production CLI,
server and public command driver. It owns a todo-f10-verify temporary directory,
HOME, database and loopback server on port 0. No real Profile or credential is
used. A zero exit and `PASS; evidence survived cleanup` mean completion.

## Doctor

Run `pnpm --filter @todo/domain typecheck` and `bun --version`. Inspect
commands.log if compilation or startup fails. The driver waits for the owned
server's loopback listen message and checks all process exit codes.

## Drive

The compiled driver creates Profiles and Tasks through the CLI, previews
Profile deletion, checks refusal, then deletes through the owner-only HTTP
endpoint while a real SSE reader waits. It checks the Snapshot, deleted Task,
revoked scoped Token, surviving Session, shared 404 responses, name reuse with
a new ID, and byte-identical foreign rows. It also rejects a stale Move or Move Revert
into a tombstoned destination and races 12 compiled CLI name reuses, requiring
exactly one new active Profile. No production behavior is mocked.

The CLI and schema contract tests also run through
`.agents/skills/verify-cli/scripts/verify.sh <fresh-absolute-evidence>`.
HTTP route coverage uses `pnpm --filter @todo/server test`. Authentication and
replay use the existing verify-auth and verify-op-log compiled helpers.

## Evidence

Keep actions.json, commands.log, profile-deleted.sse, server.log, result.json,
foreign-before.json, foreign-after.json and cleanup.json. The action transcript
records real command exits and HTTP statuses. Credentials are omitted. The
foreign row comparison includes Tasks, Projects, Tags and op_log payloads.
Snapshot inspection proves that pre-deletion Task content survives.

## Cleanup

The driver stops and waits for only its child server. The shell trap removes
only its temporary directory. Evidence survives, including on failure. Never
run this against a real HOME or database.

## Helpers

`scripts/verify.sh <fresh-absolute-evidence-directory>` builds and cleans up.
`packages/domain/scripts/verify-profiles.ts` is the compiled behavior driver.
Both desktop clients have separate recipes in verify-electron and verify-macos.
The relative `.claude/skills/verify-profiles` link resolves within this checkout.
Fresh Claude discovery is a separate proof and is not implied by the link.

TODO_CLI_BINARY and TODO_SERVER_BINARY may point to the current source hash's
compiled binaries in .scratch/bin. The helper copies them into its owned scratch
directory and still uses a fresh HOME and database. The final report must verify
that the cache hash matches its report SHA's source state. The driver restores
the pre-deletion owner Snapshot and reads the recovered Task through the CLI.

The compiled driver also holds a writer lock on a scratch version-3 database,
starts three CLI opens, and releases them together. concurrent-upgrade.json
must show exits [0, 0, 0] and exactly one pre-migration Snapshot at schema 3.
The domain concurrent-open regression uses three real Bun processes and the
same held-writer scenario. Version inspection, Snapshot and migration share
one immediate transaction.
