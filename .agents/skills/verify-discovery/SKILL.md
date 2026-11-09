---
name: verify-discovery
description: Verify authorized read-only Todo Profile-to-Project directory and explicit Task id-prefix lookup through compiled CLI, HTTP and SSE on scratch SQLite, including real auth, WAL snapshot consistency and a no-leak mutation control.
---

# Verify authorized discovery

Created with `create-verification-skill`. Read [the feature map](features/README.md).

## Launch

From the checkout root, run:

```sh
.agents/skills/verify-discovery/scripts/verify.sh "$PWD/docs/evidence/discovery/new"
```

Pass a fresh absolute evidence directory. The helper runs real-domain behavior
checks, an isolated source-copy scope-removal mutation control, then caches compiled CLI and
server binaries by source hash in this worktree's `.scratch/bin`. It drives both
artifacts with a fresh scratch HOME, database, Attachment root and port 0.
It never touches installed binaries, the owner's database, native apps or Keychain.
The server readiness deadline is 60 seconds. The driver stops its recorded server
PID in its finalizer, including on failure. No server survives a completed run.
The mutation stage copies domain source and its tests into a disposable package
root. Only installed dependencies are shared by symlink. It removes scope checks
only in that copy, then restores the copied bytes and reruns both the copy and
the live worktree. Live tracked auth bytes are checked around every stage and
never written, including on failure or interruption.

## Doctor

Require Bun 1.4.4 or newer, pnpm-installed dependencies and `pnpm typecheck`.
`compiled/binary-provenance.json` records source hash, HEAD and exact binary paths.
The driver requires health's contract id to equal the generated `CONTRACT_ID`.
Inspect domain.log, properties/result.json, compiled/actions.json and server.log
when a check fails. All CLI calls inspect the real subprocess status; HTTP calls
inspect actual status and body. A running process alone never counts as success.

## Drive

The launch command drives both mapped features. The compiled matrix uses an
owner Session, unscoped Token, scoped read-only and read-write Tokens, expiry,
revocation, invalid credentials and a deleted Profile's credential. CLI, HTTP,
foreign SSE denial and an authorized SSE ready frame prove scope boundaries.
Successful reads are compared against persistent Tasks, Projects, Profiles and
History before and after; rejected auth may append existing bounded auth History.
Directory reads include empty Profiles and Projects without visible Tasks.
Lookup checks original uppercase prefix, all four row keys, null Project,
closed statuses, Deleted Task exclusion, empty success, exact next commands in
Markdown/table, schema/manual discovery and invalid or unknown query rejection.

The compiled credential-selection recipe signs in under source and dest, logs
dest out and executes the printed Show command using source. It checks global
precedence, reads and mutations, scoped refusal, missing-file isolation, explicit
login/logout storage and shell-safe leading -- values. JSON row keys stay fixed.

The domain WAL tests commit a competing connection's write between Profile
reads. Directory and lookup must return the complete old snapshot, then the
next read returns the complete new snapshot. A synchronous Clock advances past
credential expiry between reads; no response is returned and exactly one auth
rejection is visible from a separate connection after rollback. The scheduling
hook wraps the real diagnostics credential-use callback; auth and query code
remain unchanged. The scope-removal control must fail a behavioral assertion,
restore the copied source bytes, then pass the same generated projection checks
in the isolated copy and live worktree.

## Evidence

Keep domain.log, properties/{baseline,scope-removal,restored,clean-worktree}.log,
properties/result.json, build.log and compiled/{actions.json,authorized.sse,
server.log,binary-provenance.json,cleanup.json,result.json}. Actions pair input
with actual process exits or HTTP statuses. Bearer credentials are omitted.
Outputs remain ignored by Git; reusable scripts and expected values are tracked.

## Cleanup

The driver terminates only its recorded server PID and waits for its exit.
It removes only its new `todo-discovery-verify-*` scratch directory, retaining
all evidence. cleanup.json records the PID, exit and scratch removal. Failed
runs retain evidence too. Never kill by process name.
The checkout-local `.claude/skills/verify-discovery` relative symlink resolves to
this skill. Fresh Claude discovery is a separate coordinator check; a symlink
alone does not establish registration.

## Helpers

Executable `scripts/verify.sh <fresh-absolute-evidence-directory>` runs all stages.
`bun scripts/drive.ts <fresh-absolute-evidence-directory>` drives the existing
cache manifest. `bun scripts/properties.ts <absolute-evidence-directory>` runs
only the isolated no-leak control. Resolve those script paths from this skill. `scripts/credential-selection.ts`
is called by drive.ts with the owned scratch HOME and compiled binary; it never
opens the real HOME or reads an installed credential.
Use `/maintain-verification-skill` when the command or route contract changes.
