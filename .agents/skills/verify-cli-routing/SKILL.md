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
