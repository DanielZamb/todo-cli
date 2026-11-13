---
name: verify-server-api
description: Verify the Todo local authenticated HttpApi through curl against a compiled Bun server on a scratch SQLite database. Use after task HTTP, authorization mapping, OpenAPI, or server startup changes.
---

# Verify the server API

## Projection read differential control

`apps/server/scripts/read-control-server.ts` is a verification-only server with
fixed Date and Effect wall clocks. Compile it before a read-path change and keep
that binary only in ignored scratch storage. Compile the candidate separately.
`read-control.ts <before> <after> <fixture-manifest> <evidence-directory>` compares
raw statuses and base64-encoded body bytes over Task lists, Show, graph, all planning views,
Projects, Tags, Task History, Profile discovery, lookup, credential lists,
health, OpenAPI, Snapshot list/Show, quick-add parsing, managed image bytes and
SSE catch-up. It also
compares auth History fields and credential last-use values. SQLite's physical
recording timestamps naturally differ between processes; event timestamps are fixed.
It uses real
HTTP and private copies of every manifest checkpoint. It preserves one scratch
Snapshot directory across each pair so file identities and paths match.
Diagnostics' process measurements require their own recipe and cannot have
byte-identical memory, uptime and latency values across processes.

`bun apps/server/scripts/read-fixture.ts <new-checkout-scratch-directory>` creates
the reusable lifecycle fixture with Series, Occurrences, Dependencies, metadata,
Attachments, scoped/unscoped Tokens, Profile deletion, Move, Copy, Delete, Purge,
Revert and older v1 events. Its private fixtures.json feeds the differential.
Keep manifests and credentials ignored. The domain regression
`pnpm --filter @todo/domain test client-projection.test.ts` requires literal
responses without decoding History and one decode per returned History row.

`build-read-control.ts before|after <output>` builds a verification-only timing
observer over exact baseline or candidate source. It adds handler timing,
request correlation and decoded-operation count headers without modifying the
API schema or product source. `prepare-read-benchmark.ts <cold-path-checkout>`
copies the cold-path report's scratch checkpoints and creates an ignored paired
ambient adapter of its driver. It retains response/count assertions, alternates
before/after per pair and requires zero unneeded operation decodes after the fix.
It omits newer Diagnostics stage assertions unavailable in the unchanged contract.

The strict-scope controls also capture every never-created Profile read before
classification changes. `read-presence-control.ts` compares those fixtures and
requires exactly credential lookup plus classification and zero operation decodes.
Its blanket-404 and present-query mutants must fail their literal assertions.
`read-scope-stream-control.ts` compares compiled CLI/server frames, including the
approved owner-only terminal exception and a separate CLI creating an absent
Profile between polls.

`scripts/read-caller-audit.mjs` emits the production read-port selector inventory
for review; runtime leases enforce retention. `read-mapping-review.mjs <SHA>`
compares the reviewed cache/matcher/runner/integration bodies against the earlier
authority product and writes each before/after hash. It never renews a pin.
`build-read-lock-observer.mjs before|after <binary>` instruments physical SQLite
transactions only in proof binaries. `paired-read-locks.mjs <before> <after>
<fixture-manifest> <evidence>` measures five alternating pairs per route, marking
deferred reader scopes separately from writer holds. Its Snapshot comparisons
normalize separate scratch ids/paths; strict reply parity uses read-control.ts
with shared file identities. Absolute timing values are evidence, not test gates.

Created with `create-verification-skill`.
Read the [feature map](features/README.md) before choosing coverage.

Dependency commands, true-only Ready/Blocked filters, graph reports and import
witnesses also require [verify-dag's public drive](../verify-dag/features/public.md).
It drives the compiled HttpApi alongside CLI and preserves structured evidence.

## Launch

From the checkout root, run this exact compiled-server scratch-DB HTTP command:

```sh
.agents/skills/verify-server-api/scripts/verify.sh "$PWD/docs/evidence/s01/compiled-http-new"
```

Use a fresh absolute evidence directory on each run. The helper compiles
`apps/server/src/main.ts` and a scratch provisioning driver with `bun build --compile`.
It provisions one owner and the work and personal Profiles through the domain
library. The real API intentionally has no unauthenticated provisioning endpoint.
The helper launches its compiled server as
`TODO_DB=<scratch>/scratch.db TODO_PORT=0 <scratch>/server` and discovers its
assigned port from the listen log. It uses only its new `todo-s01-verify-*`
temporary directory. A `Listening on http://127.0.0.1:<port>` log line means ready.
A zero exit and `PASS; evidence survived cleanup` prove completion.

To drive an installed server, set `TODO_SERVER_BINARY` to its absolute executable
path before invoking `scripts/verify.sh`. This skips server compilation, retains
the installed binary, and still compiles the scratch provisioning driver.
The helper gives provisioning and HTTP processes its own scratch HOME.

For normal operation, `pnpm --filter @todo/server build` creates
`apps/server/dist/todo-server`. Run it with an explicit `TODO_DB` path to a
provisioned database and optional `TODO_PORT`, which defaults to 4310. The
hostname is always `127.0.0.1`; there is no hostname setting. Never point a
verification run at the owner's real database.

## Doctor

Run `bun --version`, `command -v curl`, `command -v sqlite3`,
`command -v python3`, and `command -v lsof`. Bun 1.4.4 or newer and pnpm-installed
dependencies are required. Run `pnpm typecheck` before driving a changed build.
The helper checks `GET /health` returns `{service:"todo-server",contract,build}` with the generated contract identity.
It retains `lsof` output for its own process and requires a loopback-only listener.
When anything fails, inspect the selected `commands.log` and `server.log`.

## Drive

The launch command drives the original Task and credential features with curl.
For client reads, run the second compiled-server scratch recipe:

```sh
.agents/skills/verify-server-api/scripts/verify-reads.sh "$PWD/docs/evidence/s04/reads-new"
```

This compiles the same production server and provisioning driver, requests the
client-reads fixture, and drives counts, all planning views, Profile-scoped
History and deterministic quick-add through curl. It also proves redacted
History after a compiled domain Purge and HTTP Revert refusal with `task_purged`. It checks S01's isolation
fix through literal rejected definitions and absence of foreign names. Read
[the client feature map](features/client-reads.md) for membership and grammar.

For client writes, run:

```sh
.agents/skills/verify-server-api/scripts/verify-writes.sh "$PWD/docs/evidence/s05/writes-new"
```

Read [the client writes feature map](features/client-writes.md) for routes,
move metadata rules, Revert, Series edits, skip and scoped move SSE events.
The helper uses the existing client-reads fixture, then checks scratch HTTP,
durable state and full plus snapshot replay. It retains both Profile SSE
streams and replay.json in addition to the original evidence files.
It also drives nine recurrence review regressions on independently provisioned
scratch databases and retains each case's HTTP actions, replay and cleanup.
`canonical-validation-history.json` proves authenticated invalid title and
source requests append rejected operations before returning HTTP 400.

The original drive signs in through
`POST /auth/sessions`, creates and shows a Task, patches its title, repeats a
stale patch, and requires HTTP 409 with the exact latest Task. It issues scoped
read-only and read-write Access Tokens, proves denied writes and out-of-Profile
reads, completes and reopens the Task, cancels it, then deletes it using its
Version. Visible list/show responses must hide the deleted Task. It revokes a
Token and signs out the Session; both credentials must then fail authentication.
Finally it reads `/openapi.json` and compares the emitted contract.

Run the broader HTTP contract tests with:

```sh
pnpm --filter @todo/server test
pnpm --filter @todo/api openapi
```

Tests start the actual Effect/Bun HTTP server on port 0 and fresh databases.
They cover required Versions, invalid payloads, domain validation, Profile
isolation, rejected History, recurrence completion and OpenAPI equality.
The domain's verification skills cover replay, recurrence edge cases and expiry.

## Evidence

The selected directory retains `commands.log`, `server.log`, `listener.txt`,
`actions.json`, `database.sql` and `result.json`. The transcript records the
actual compiled build and server invocation. Actions pair curl inputs with
response statuses and bodies. Passphrases and bearer secrets are redacted.
The helper checks literal Task titles, Versions, statuses and conflict bodies.
It also checks the durable SQLite Task and History, then keeps a SQL dump after
the server exits. Provisioning uses the public domain API; every subsequent
action uses HTTP. No mocks or test-only endpoints are involved.

## Cleanup

The Python driver's finalizer terminates only the child server it started and
waits for it to exit, including on failure. The shell exit trap removes only its
new scratch directory, binaries, database and WAL siblings. Evidence stays
outside scratch and survives cleanup. The helper checks that scratch is gone
and the evidence files still exist. Never kill by process name.

The checkout owns `.claude/skills/verify-server-api`, a relative symlink to
this directory. Preserve it and verify `realpath .claude/skills/verify-server-api`
after moving the checkout. Claude session discovery must be checked in a fresh
Claude session before claiming registration.

## Helpers

`scripts/verify-reads.sh <absolute-evidence-directory>` is executable and invokes
`scripts/drive-reads.py <scratch> <evidence>`. Its evidence has the same layout
and cleanup contract as the original helper.

`scripts/verify.sh <absolute-evidence-directory>` is executable and resolves its
own checkout. It calls the executable `scripts/drive.py <scratch> <evidence>`
with Python 3. The driver starts and stops the compiled server and drives curl.
`apps/server/scripts/seed-verification.ts` compiles as the scratch provisioning
driver and refuses directories outside the temporary `todo-s01-verify-*` prefix.
Use `/maintain-verification-skill` when routes or task behavior change.

`scripts/verify-writes.sh <absolute-evidence-directory>` invokes executable
`scripts/drive-writes.py <scratch> <evidence>` and the compiled provisioning
driver's replay mode after server shutdown. Scratch and credentials remain
isolated exactly as in the original helper.

## Version guardrails

The compiled HTTP recipes compare health with CONTRACT_ID and reject unknown query names with HTTP 400. See [the feature recipe](features/contract.md) for commands and expected evidence.

## Batch edit

Read [Edit several Tasks](features/batch-edit.md) for the shared batch-edit contract and the compiled scratch proof. Both client flows retain selections and loaded Versions through preview, apply and Conflict reload.

The compiled public [verify-dag](../verify-dag/SKILL.md) drive exercises the new
Dependency routes and full structured 422 witnesses, equivalent CLI refusals,
true-only filters, Delete previews/fingerprints and public edge Revert. Its
fresh server uses the same readiness/owned-process cleanup policy as this skill.
TaskWrite names additive response metadata; stored Task schemas stay separate.
## Exit meanings and lookup context

Every HTTP error carries the equivalent CLI exit_code and exit_meaning while
retaining its status, tag and existing details. Framework decoding failures use
BadRequest with the validation pair, including sign-in and non-Task routes.
Validation History still authenticates and records rejected mutation inputs.
The compiled test in apps/cli/test/error-list.test.ts covers decoding, missing
credentials, Profile-scope denial, selected Profile lookup context and both
recovery routes. Run it with TODO_CLI_BINARY and TODO_SERVER_BINARY pointing to
same-source cached binaries. No error probes another Profile for a Task.
## Authorized discovery

[verify-discovery](../verify-discovery/SKILL.md) owns the compiled Profile directory
and cross-Profile id-prefix lookup matrix, credential no-leak properties, WAL
snapshot tests and auth-failure rollback proof. Run its single command after
changing these reads or their CLI/HTTP contracts. Existing Profile-scoped SSE
and Task search behavior retain their current recipes.

## Mutation after authorization

`build-read-boundary.ts <scratch-binary>` builds the real server with verification
hooks. It wraps decoded handler arguments, invokes mutations from the real
credential-use callback or immediately after a checked value is constructed, and
can yield at the graph port. Product sources and the HTTP contract are unchanged
by this instrumentation. Both wall clocks use the parity fixture's fixed instant.

Run `read-control.ts` with a normal candidate binary first and this instrumented
binary second, the lifecycle fixture and a new evidence directory. Set
`READ_BOUNDARY_MODE=credential` or `port`, and set `READ_BOUNDARY_BINARY` to the
instrumented binary's absolute path. The comparator requires its emitted hook
receipt and actual changes to Profile, Task, Attachment and Snapshot ids, prefix
and quick-add text. It compares all statuses, raw reply bytes and auth evidence.
The receipt lists every mutated field and handler shape; no credential is logged.

`bun apps/server/scripts/read-boundary-concurrency.ts <scratch-binary>
<fixture-manifest> <new-evidence-directory>` creates two literal Tasks and scoped
Tokens in a fresh scratch database. It runs ten pairs of overlapping requests per
mode on one server. Every pair must return only `aa-work` and `aa-personal` in
its respective Profile. Hook counters must prove actual overlap and mutation.
The driver stops its owned server and removes its scratch database and HOME.

`READ_BOUNDARY_MODE=authority` substitutes a cloned authority at the graph query
port. A valid scoped Task read must return the existing generic storage error
(HTTP 500), without Task rows. This mode tests runtime refusal; use the two
mutation modes above for byte parity of valid requests.
