---
name: verify-auth
description: Verify Todo owner sign-in, the 10-attempt sign-in lockout and passphrase reset, fixed Sessions, scoped Access Tokens, rejected auth history and private database permissions through a compiled Bun domain driver on a scratch SQLite database. Use after changing auth, migration 0003 or database opening.
---

# Verify authentication

Generated with `create-verification-skill`.
C04 exposes a domain library. CLI and HTTP adapters belong to later units.
Read the [feature map](features/README.md) before selecting coverage.

## Read lease exit window

`pnpm --filter @todo/domain test read-lifetime.test.ts` covers retained query
authorities in a new native transaction before the prior transaction runner
returns. Commit, rollback, thrown callback, attachment cleanup and grouped
Discovery nesting must all refuse the old value with StoreError and no Task.
Inner scopes remain usable until the outer callback ends. Failed admission
still runs final cleanup, and a new request on the same tick has a fresh lease.
The root lease closes in the checked callback's finally, before native COMMIT
or any post-commit work; the final fallback also handles failed admission.

With exclusive use of this checkout, run
`bun .agents/skills/verify-auth/scripts/check-read-lease-window.mjs <evidence>`.
It temporarily restores the late-close defect in auth.ts: all five exit-window
cases must fail their literal StoreError/no-row expectation. A separate mutation
removes failed-admission cleanup and must fail its literal clear-count assertion.
The helper restores exact source bytes in finally and reruns all scope controls.
No compiler, test, or builder may read this checkout during those mutations.

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
A second scratch database, `lockout.db`, proves that 10 wrong passphrases lock
sign-in for an hour, that the lock holds after reopening, and that
`resetPassphrase` ends it and revokes the Session (`07-lockout.json`). The macOS
password check in `todo reset-passphrase` is proven only with a nonexistent
account (`apps/cli/test/macos-password.test.ts`), never with a real password.

## Doctor

Run `bun --version`, `command -v sqlite3`, and
`pnpm --filter @todo/domain typecheck` in the checkout. The driver's first
public `openStore` call requires schema version 7, WAL, a 5000ms busy timeout,
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

## Authorized discovery

[verify-discovery](../verify-discovery/SKILL.md) owns the compiled Profile directory
and cross-Profile id-prefix lookup matrix, credential no-leak properties, WAL
snapshot tests and auth-failure rollback proof. Run its single command after
changing these reads or their CLI/HTTP contracts. Existing Profile-scoped SSE
and Task search behavior retain their current recipes.

## Authorized Profile resolution

`pnpm --filter @todo/domain test profile-resolution.test.ts` drives the shared
`Authentication.resolveProfile({credential, profile: nameOrId, action})` query.
It returns only id/name; absent or unauthorized targets share ProfileResolutionError.
Credential rejections retain the supplied real AuthAction. Four literal cases
cover scoped metadata, direct-id versus name History, deleted-id/active-name
collisions and owner/scoped expiry/revocation. Each comparison uses an isolated
serialized seed clone, preserving per-minute rejection policy.
[verify-discovery](../verify-discovery/SKILL.md) additionally compiles and drives
real CLI/HTTP action-attribution parity. No public read/profiles call is nested
inside resolution, and no caller learns foreign metadata.

## Bound read requests

`pnpm --filter @todo/domain test read-authorization.test.ts` drives mutation of
caller-owned Profile, Task id and filter fields during the real credential-use
callback and graph read. It also proves owned frozen fields, nominal query-port
types and a Profile inserted between discovery and count reads. Counts must use
the checked Profile set. The HTTP and overlapping-request controls are documented
in [verify-server-api](../verify-server-api/SKILL.md).

`pnpm --filter @todo/domain test authority-runtime.test.ts` attempts clone,
spread, assignment, prototype and JSON copies, subclasses, a Proxy and mutation
at every query port. Each must fail before returning rows. Genuine authorities
also carry their originating database identity. Creation is private to the
credential-check module; ports inspect private fields, kind and database before
using any Profile or parsed field. Optional `TODO_AUTHORITY_EVIDENCE` writes the
complete attempt matrix to an ignored local JSON path.

## Durable repeated refusals

The normal Launch command also runs scripts/verify-durable.sh. Set
TODO_CLI_BINARY, TODO_SERVER_BINARY and optionally TODO_AUTH_DENIAL_BINARY to
source-matching scratch binaries to reuse builds. Run that helper independently
with a fresh absolute evidence directory for a focused proof. It builds
packages/domain/scripts/verify-durable-denial.ts and drives the real domain API,
then check-cross-process.mjs drives the compiled CLI/server process matrix.
Both use only fresh scratch data; HTTP ports come from owned listen logs.

The literal process counts are [1,1,1,1,1,1] for CLI/CLI, server/server,
CLI/server, server/CLI, server restart and two ready CLI processes plus a server
request released over an IPC barrier. Every CLI refusal exits 3 and HTTP returns
401. The domain driver proves Snapshot restore re-recording, four key changes,
ten wrong-passphrase rows and one locked row, Profile deletion/name reuse and
Purge retention. Its two race workers read clocks 50 ms apart; a later-clock
process committing first must not let the earlier-clock refusal append (one
row in race.json and clock-skew.json). Its barrier proves 5,000
preceding-minute rows do not hide the first refusal. An older-than-horizon row
deliberately permits a second refusal. The process matrix starts a case in the
next minute when fewer than 15 seconds remain. Bench mode
(`driver bench <dir> <evidence> <scenario>`) times the first refusal, a burst
of 1,000 and each rejection transaction for quiet, null, whole-window,
prior-before/after and import-before/after; it is a measurement, not a gate.
See features/history.md and docs/decisions/ui-speed/durable-denial.md.

Doctor requires both compiled --version contracts to match this checkout.
Evidence contains domain/proof.json, processes/parity.json and commands.log.
Cleanup removes only newly created scratch state and awaits owned children;
evidence survives. No native app, Keychain or launchd is needed.
