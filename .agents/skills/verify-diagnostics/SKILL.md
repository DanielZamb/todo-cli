---
name: verify-diagnostics
description: Verify owner-only Todo diagnostics, JSON/NDJSON and the terminal and desktop monitoring views against an isolated compiled server. Use after diagnostics collection, metadata projection, or panel changes.
---

# Verify diagnostics

Created with `create-verification-skill`.
Read [the feature map](features/README.md) before selecting coverage.

## Launch

From the checkout root run:

```sh
.agents/skills/verify-diagnostics/scripts/verify.sh "$PWD/docs/evidence/f12/diagnostics-new"
```

The helper hashes apps/cli, apps/server, packages and the lockfile, reuses matching
compiled binaries in .scratch/bin, creates a
new temporary `todo-s01-verify-*` HOME and database, then starts the server on
loopback port 0. `Listening on http://127.0.0.1:<port>` signals readiness.
It never reads the real HOME, credentials, database, backups, or server.
It needs installed pnpm dependencies, Bun 1.4.4+, curl and SQLite support.
A zero process exit and result.json with result PASS prove completion.

For iterative UI work run `bun apps/server/scripts/scratch-diagnostics.ts`. It
uses only .scratch/home and .scratch/dev.db, writes its owned PID and loopback URL
to .scratch/server.json, and reuses the server while its source hash matches.
`bun apps/server/scripts/scratch-diagnostics.ts stop` stops only that recorded
process. `build` updates the cached binaries without starting a server. Set
TODO_SERVER_BINARY and TODO_CLI_BINARY to override the copied proof binaries.
Final proof runs always use fresh data and binaries matching the report source hash.

## Doctor

Run `pnpm typecheck` and `bun --version`. The driver checks the child process
is alive and GET /health equals `{"service":"todo-server"}` before signing in.
After failures inspect commands.log, server.log and actions.json in evidence.

Polling waits one second after success. After errors, panels wait 2, 4, 8, 16,
then 30 seconds. A successful read resets the interval. Non-interactive follow
ends on error, writes the shared JSON error to stderr and preserves snapshot-only
NDJSON on stdout.

## Drive

The executable helper drives the compiled server with curl, signs in an owner
Session, denies missing credentials and an Access Token, opens an SSE client,
creates and edits a Task and attempts a stale Version. It requires literal
record counts and accepted/rejected operation labels, the client's Profile and
cursor, the Conflict route and latency count, credential metadata, and a
non-null last-used observation. It Deletes then Purges through a compiled
provisioning driver and proves both disappearance and retained redacted labels.
No content, bearer credentials or credential hashes may appear in snapshots.
Stopping the SSE client must remove it from the next snapshot. A real compiled
CLI Snapshot restore changes restore_generation even when maximum seq stays
the same, clears throughput samples and diagnostic client cursors, and reloads
one remaining Task. Last Snapshot exposes only id, created_at, seq, size and
schema_version. Snapshot file paths and checksums are excluded.

## Evidence

The selected evidence directory keeps commands.log, server.log, actions.json,
snapshot.json, purged.json, restored.json, client.sse, cleanup.json and result.json.
The CLI proof retains diagnostics.ndjson, diagnostics.schema.json, top.ansi,
top-proof.json, full/compact terminal text and light/dark terminal PNGs. Only the
SSE fixture contains scratch Task content. Snapshot assertions explicitly
exclude that content. Credentials never enter the evidence. Actions record
HTTP method, path and real response status. Snapshot counts come from actual
writes; there are no mock endpoints or direct projection writes.

## Cleanup

The driver terminates only its child curl and server processes, awaits their
exits and writes cleanup.json. The shell trap removes only its own temporary
directory and compiled binaries. Evidence remains outside scratch and survives.
Never kill by process name. Never connect to the owner's launchd server.

## Helpers

`scripts/verify.sh <absolute-evidence-directory>` runs the complete recipe.
`apps/server/scripts/verify-diagnostics.ts <scratch-directory> <absolute-evidence-directory>` is the
internal Bun driver. Invoke the shell helper for builds and cleanup.
The checkout-local `.claude/skills/verify-diagnostics` symlink resolves here.
Fresh Claude discovery requires a separate receipt; a symlink is not proof.
Use `/maintain-verification-skill` when these monitoring routes or commands change.

For Electron use `scripts/verify-electron.sh <absolute-new-evidence-directory>`.
Set TODO_DIAGNOSTICS_DEV=1 to use the long-lived scratch server for layout work.
The default recipe uses fresh data and proves disconnect/error states too.
Swift commands run through the coordinator
`./scripts/swift-slot.sh`
and Electron builds through `/usr/bin/lockf -k /tmp/todo-fixes-electron.lock`.

Profile deletion is part of the compiled drive. It deletes Personal through the
CLI, requires one active entity Profile, one profile_deletions row and the
retained Personal name in deleted_profiles. ProfileDeleted remains typed recent
metadata; human renderers add the (deleted) suffix without exposing Task content.

## Collection cost

Run only after the coordinator's quiet-host approval. The driver aborts when
one-minute host load exceeds 4. It compares five alternating rounds per side,
with 100 literal Tasks and zero tolerated failures. It profiles in a separate
untimed run, records server and generator CPU, and reports each round's p50/p95.
Each side uses its own compiled CLI to create a compatible scratch database.

```sh
TODO_DIAGNOSTICS_BENCHMARK=1 bun apps/server/scripts/benchmark-diagnostics.ts "$PWD/docs/evidence/f12/polling-cost-new"
TODO_DIAGNOSTICS_BENCHMARK=1 TODO_DIAGNOSTICS_POLLING=0 bun apps/server/scripts/benchmark-diagnostics.ts "$PWD/docs/evidence/f12/collection-cost-new"
```

The default baseline is 3618e09. TODO_DIAGNOSTICS_BASELINE selects another
commit for attribution controls. It does not replace the requested baseline.
The no-poll run must report null poll_interval_ms and zero polls in every round.
Request/error rings use preallocated numeric arrays and monotonic timestamps;
reads construct the JSON objects and format error timestamps.

The quiet 1 Hz run at fb40177 measured median p50 0.786125 ms before and
0.838625 ms after, five runs per side. Baseline range was 0.750250–0.787500 ms,
current range 0.827542–0.860250 ms, with zero failures. The coordinator accepted
that 0.052500 ms cost for an open diagnostic session. The first no-poll run
measured 0.780584 ms before and 0.857083 ms after, outside the baseline range,
which triggered collection changes. The accepted no-poll baseline after collection changes at b6880ba is
0.747250 ms before and 0.817083 ms after, a 0.069833 ms increase. Baseline range
is 0.744333–0.752583 ms; current range is 0.814125–0.833792 ms. Both accepted
comparisons use baseline 3618e09, five alternating runs per side, 100 literal
Tasks, authenticated HTTP plus SQLite plus JSON parse, zero failures and a load
ceiling of 4. Validation follows every timed read. The no-poll run has zero
diagnostics reads. The separate untimed CPU profile identifies schema parsing,
JSON parsing and SQLite as the main server-core costs; the generator is below
one quarter of a core. The coordinator accepted both costs for this local
single-owner server. Collection versus HTTP-adapter attribution remains a
follow-up question, not an open acceptance gate.

Regression guard: fail a future no-poll run when its current median p50 exceeds
the interleaved baseline median p50 by more than 0.15 ms under the same load
ceiling. The benchmark asserts this limit after writing the result, so failure
evidence survives. Preserve result.json, spread, CPU profile and source hash.

Storage external_id_tasks counts non-null Task external_id values through the
shared generated column/index. No external ID values enter diagnostics JSON,
the apps' Profile views or the terminal panes. The compiled drive creates one
such Task and requires count 1 without its external ID appearing in the read.

Storage attachments counts current Task attachment references, including links
and referenced files. attachment_store_bytes counts regular files under the
managed attachment root, skipping symbolic links. The compiled HTTP, Electron
and Swift drives upload a 67-byte PNG, require one additional Attachment and
67 additional store bytes, and reject its private label from diagnostics.
