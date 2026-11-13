---
name: verify-cli-routing
description: Verify Todo database-bound CLI discovery, same-connection proof, direct-write nudges, lasting write-mode and the test-only typed add operation on compiled scratch servers.
---

# Verify CLI routing

Created with create-verification-skill. Read [the feature map](features/README.md).
Production commands remain direct in slice 1. The typed operation is exercised
by a compiled companion and is not a production CLI switch.

## Launch

From the checkout root, run:

```sh
.agents/skills/verify-cli-routing/scripts/verify.sh "$PWD/docs/evidence/cli-routing/final"
```

Use a new absolute evidence directory. The helper caches same-source CLI, server
and seed binaries, compiles the routing driver and deterministic companion, and
starts only recorded child servers on free loopback ports. Readiness is a valid
published record plus successful proof, with a 60-second readiness deadline.
The driver owns a new todo-cli-routing-* scratch HOME and databases. No managed
server, launchd, native application, real credentials or real database is used.

## Doctor

Run `pnpm --filter @todo/cli typecheck` and
`pnpm --filter @todo/server typecheck`. The driver checks that each owned server
publishes a physical binding matching the scratch file and proves its nonce.
Inspect commands.log and actions.json if readiness or a command fails.

## Drive

The compiled apps/cli/scripts/verify-routing.ts driver exercises record discovery,
foreign and copied records, stale and unproved listeners, server singleton,
disconnect before send, persistent configuration, flag precedence, no-write
refusals, and the typed add differential. The companion fixes Date and generated
Task/metadata UUIDs at its compilation entry point, not through production flags.
Direct and HTTP copies use the same scratch pathname and original credential.
Every stdout/stderr byte, process exit and logical row of every SQLite table is
compared. Newline, missing-row and wrong-exit negative controls must differ.

The default-port case uses a separately compiled HTTP-boundary guard. Any request
to port 4310 is diverted to the owned unrelated listener and recorded. This proves
the absence-of-record case sends no default-port request and a stale default-port
record cannot send a credential. It deliberately never binds, stops, or contacts
the managed server. The two actual scratch servers use free ports; Diagnostics
route-count deltas independently prove zero discovery/command requests reached
the foreign database, whose complete dump stays unchanged.

The driver also runs a lost-response proxy against its owned server. It drops the
reply after the real command committed and requires write_outcome_unknown with
one new Task and no retry. Its alternating AB/BA wall-time sample defaults to
1,000 pairs; TODO_ROUTING_BENCH_PAIRS can select a short verification rerun.
The live server stays running in both timing conditions. Hiding its private
record creates the unproven condition. Task count grows equally across pairs;
this is a loaded-host wall-time observation, not a fixed-size throughput claim.

Run verify-cli, verify-server-api and verify-sse separately with these cached
binaries. Existing SSE external writer cases remain direct and retain their
one-second delivery checks. This skill does not replace those recipes.

## Evidence

The chosen directory retains commands.log, actions.json, differential.json and
result.json. Actions retain input argv, raw outputs, exits, process timings and
owned server pids. Bearer values never enter actions. Only scratch credentials
exist in the driver's private temporary tree. The differential uses real domain
commands, the real HttpApi, and compiled processes. Normal compiled CLI tests
remain the separate evidence for unchanged goldens and JSON schemas.

## Cleanup

The driver's finalizer stops only children recorded in its own set, awaits exit,
closes its owned foreign HTTP listener, and removes its newly created scratch
tree. It preserves evidence on failure. Never kill by process name. Persistent
server-lock registry entries are private coordination files, deliberately not
unlinked on server close because concurrent startup must share their inode.
The helper removes its own closed Bun compiler temporaries after compilation.

## Helpers

scripts/verify.sh takes one new absolute evidence directory. Its driver is
apps/cli/scripts/verify-routing.ts; deterministic entry point is
apps/cli/scripts/routing-companion.ts. Preserve the relative checkout-local
.claude/skills/verify-cli-routing symlink. Fresh Claude discovery remains a
separate coordinator check; do not claim it from directory creation alone.
Use maintain-verification-skill when this feature map changes.

## Correction controls, 2026-11-13

Launch enters scripts/isolate.sh automatically on macOS. Every child inherits OS
denial of the real Todo directory and TCP/UDP 4310 and 14310, with loopback-only
networking. The compile-time default-port shim is a test control, not the network
boundary. Other verification recipes must also run through isolate.sh.
The profile is the run store's reference (2026-11-13): outbound network is
loopback only. Before relying on it, run
`node .agents/skills/verify-cli-routing/scripts/isolation-controls.mjs` (node,
not bun, which reports a denial as ECONNREFUSED). It requires EPERM for an owned
14310 listener and for 1.1.1.1:80, a loopback connect, EPERM on the protected
directory, and the same four in a child. The profile used before 2026-11-13
(deny network*, then allow localhost both ways) let outbound connects through.

The correction driver independently seeds scratch databases and owns a barrier
build of the real server. It reproduces rename-over and swap-back on immutable
8d85f5e2 and requires current startup to fail with the literal file mismatch.
The builder adds only two waits and a store-opened marker. The driver also tests
persistent guard unlink, aliases, different HOME/TMPDIR, killed holders, typed
pre-execution refusal, replacement direct fallback and help-derived nudge counts.
After the guard unlink it counts, from each server's own access log, the proofs,
nudges and commands that two CLI writes deliver: zero reach the withdrawn first
incarnation, two proofs and two nudges reach the second, and the first logs its
withdrawal exactly once. Duplicate starts through a symlinked directory and a
differently cased path, each with another HOME and TMPDIR, exit 1 with the literal
guard message and leave the first record byte-identical.
Reset uses a compiled native-presence-only bypass. No native password is checked.

Every writing store attempt nudges once, including dry run, refusal and a batch
with a committed prefix. All reads, including recorded auth refusals, and early
flag refusals nudge zero times. No sequence, generation, table or file-change
observer exists. The nudge runs in the store's release after close, so a
writing command whose store never opened sends none. A needless nudge costs one
empty pass. Protocol remains 1. The
first production routing requires MAC-proved 2 and the reviewed durable-denial fix.

The endpoint independently fstats newly opened descriptors across synchronous
store acquisition on macOS and Linux. Missing platform evidence disables all
local routing with one log; differing evidence aborts startup. The persistent
guard outlives store close. A multiply linked database starts and serves as on
the base with no guard, record, proof or authorization and one withdrawal log; a
link added after start-up withdraws that incarnation for good, and removing it
does not bring the record back. CLI writes go direct with zero server requests.
The typed refusal is exit 1, server_command_not_run, with no History warning.

## Pin audit

Before reporting a slice, run
`node .agents/skills/verify-cli-routing/scripts/pin-audit.mjs <commit> <out.json>`
(or `--worktree`). It reads every file under every `.agents/skills` directory
and accounts for every run of exactly 64 hex digits, in any case. Each one is:

- compared: a pin hashed against the commit's bytes;
- historical, by a named rule: change records, review-record contracts, tools
  pinned by URL, Git-ignored docs/evidence receipts, names, function hashes
  covered by a matching whole-file pin, or a ledger entry;
- unknown.

Any drift or unknown exits 1 with file and line. Paths may be repo-relative,
./ or ../ relative, absolute inside the checkout, or relative to
packages/domain/src. The map form and any hash key are read. A top-level
`contract` is compared with CONTRACT_ID, and `modelSha256` with the skill's
.tla model.

Values no rule reads go in scripts/pin-ledger.json, one entry per file and
value with a reason, and a `path` when it is a pin to compare. Add one only
after reading the value in context. `node .agents/skills/verify-cli-routing/scripts/pin-audit-selftest.mjs`
proves that the shapes the seat used to defeat the first version now come out
as drift or unknown.

Exit 1 means a pinned mapping is stale: renew it by its own skill's procedure,
never by hand. A fixed list of pin files missed eight DAG public rows, and the
public pin's contract, from slice 1 to the c9 merge.
