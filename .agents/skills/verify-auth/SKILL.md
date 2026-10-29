---
name: verify-auth
description: Verify Todo owner sign-in, fixed Sessions, scoped Access Tokens, rejected auth history and private database permissions through a compiled Bun domain driver on a scratch SQLite database. Use after changing auth, migration 0003 or database opening.
---

# Verify authentication

Generated with `create-verification-skill`.
C04 exposes a domain library. CLI and HTTP adapters belong to later units.
Read the [feature map](features/README.md) before selecting coverage.

## Launch

Resolve the checkout with `git rev-parse --show-toplevel`. From that checkout:

```sh
.agents/skills/verify-auth/scripts/verify.sh "$PWD/docs/evidence/c04/compiled-auth"
```

For a fresh proof, use a new absolute evidence directory. The executable helper
builds `packages/domain/scripts/verify-auth.ts` with `bun build --compile`,
creates an isolated `todo-c04-verify-*` directory in the OS temporary directory,
and runs the binary against its new `scratch.db`. Bun 1.4.4 or newer, installed
pnpm dependencies, and `sqlite3` are required. It needs no server, port, real
credential, or shared database. Exit zero and `PASS; evidence survived cleanup`
mean the complete recipe finished. The helper tears down its scratch directory.

## Doctor

Run `bun --version`, `command -v sqlite3`, and
`pnpm --filter @todo/domain typecheck` in the checkout. The driver's first
public `openStore` call requires schema version 6, WAL, a 5000ms busy timeout,
and literal `0600` modes on the database, WAL and SHM files. It refuses a
preexisting database or a path outside its own temporary directory.
When anything fails, inspect `commands.log` in the selected evidence directory.

## Drive

The launch command drives every mapped feature through the production
`store.auth` API. It calls `setupOwner`, `signIn`, `issueToken`, `listTokens`,
`read`, `append`, `mutate`, `startSeries`, `finishTask`, `revokeToken`,
`signOut`, and `authenticate`.
It checks the `ses_` and `tok_` prefixes, Argon2id owner storage, hashed bearer
secrets, Profile isolation, denied writes, owner-only credential management,
revocation and exact expiry boundaries. The same database contains a real
Task creation and edit. Public reads and replay must return the literal title
`Ship the auth proof` at Version 2.

The same drive starts a daily Series, completes its first Occurrence and cancels
its second. Each accepted finish contains exactly one resolved successor.
Read-only and out-of-Profile requests leave Tasks and Series unchanged and
append rejected auth History. Forced successor insertion failures roll back
both completion and cancellation; retries create only one successor. Full and
snapshot replay restore the combined result with recurrence expansion disabled.

Expiry uses Effect's Clock service with controlled time. The driver advances
that service to the exact 7-day Session and 90-day Access Token boundaries.
It does not alter stored expiry values or replace cryptography or SQLite.
Final reopens repair deliberately permissive scratch files to `0600`, both
directly and through a file symlink. The original target connection stays open
while the alias reopen repairs target WAL/SHM modes and preserves Task data.

Run the behavior suite for additional cases, including authenticated Revert,
custom expiry validation, transaction rollback, revocation across connections,
v2 migration with snapshots, and creation plus reopening file permissions:

```sh
pnpm --filter @todo/domain test
```

## Evidence

The selected evidence directory retains `commands.log`, `actions.json`,
`result.json`, `01-issued.sql` through `05-reopened.sql`, and
`02-recurrence.json` plus `02-recurrence.sql`. The recurrence evidence contains
resolved events, the final Occurrences and the expansion-disabled replay proof.
`06-symlink.json` and `06-symlink.sql` retain target permission modes and unchanged
Task data from the live-connection alias reopen.
The transcript records compilation and invocation of the compiled artifact.
The action record pairs public calls with observed outcomes and contains no
bearer secrets. The dumps show hashed credentials and the actual rejected
`auth` rows in `op_log`. `result.json` includes the final Tasks and History.
Check all these alongside the driver's literal assertions before claiming proof.
This uses real SQLite and Bun's production Argon2id implementation.

## Cleanup

The helper's exit trap removes only its newly created scratch directory,
including the binary and database siblings, on success and failure. It checks
that scratch is gone and evidence still exists before reporting success.
Keep the evidence directory. No process remains running.

The checkout owns `.claude/skills/verify-auth`, a relative link to this directory.
Check it with `realpath .claude/skills/verify-auth` after moving the checkout.
Fresh Claude discovery is recorded at `docs/evidence/c04/skill-discovery.md`.

## Helpers

`scripts/verify.sh <absolute-evidence-directory>` is executable and resolves
its own checkout, so it can run from another working directory. Its compiled
driver accepts only a fresh temporary scratch directory and an absolute
evidence directory outside scratch. Use `/maintain-verification-skill` when
these APIs or the feature map change.
