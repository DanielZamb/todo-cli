---
status: proposed
---

# CLI writes through the running server

Proposed 2026-11-12, following the owner's decision to route CLI writes through
the local server when it runs. This record awaits coordinator review and owner
acceptance. It does not authorize implementation or change accepted records yet.
ADR-0022 is reserved for another decision.

## Decided, 2026-11-13 corrections

- The CLI sends one data-free, bounded, best-effort nudge after every writing
  command that reaches the store, on success, refusal, dry run or partial failure.
  It uses the same writing classification as server mode. There is no commit
  observation, History/generation comparison, file-only special case, TEMP trigger
  or extra connection. Early refusals and all reads send none, including a read
  that records a refusal. No proved server means no nudge. "Reaches the store"
  means the store opened: the nudge runs in the store's release, after the
  connection closes, so a command whose store never opened sends none. The cost is one empty
  stream pass when a writing command changed nothing. Discovery and nudge each
  retain their separate nominal 50 ms timer budgets, subject to host scheduling.
- Identity is fstat of the kept database descriptor. Before publication, the
  synchronous store acquisition must open an independent matching main-file
  descriptor. macOS uses /dev/fd and Linux uses /proc/self/fd. Missing platform
  evidence disables publication, proof and local authorization, with one log.
  Evidence of a different store file stops startup with a cause-specific error.
  No pinned constructor or transaction changes implement this check.
- The SQLite singleton guard lives in the private .todo-routing directory beside
  the canonical database, named by device, inode and birth time. It outlives store
  close and is independent of HOME/TMPDIR. Server startup refuses multiply linked
  database files because different hard-link directories have no common beside-file
  registry. The CLI still writes directly to hard-linked databases. At publication,
  proof and authorization, losing the guard inode or database binding permanently
  withdraws that incarnation and removes only its own record. It never recreates
  a missing guard while serving. No production guard is created under /tmp.
- A validated typed not_run reply on the proved connection means the command did
  not execute or write, exit 2, server_command_not_run. It never triggers fallback
  or retry. Every other post-send failure remains write_outcome_unknown, exit 1,
  with the History warning and no automatic retry.
- The MAC-covered protocol is the capability. Protocol 1 is discovery, proof and
  nudge only for production CLI use. The test companion may exercise the prepared
  operation. The first production build routing a command must carry protocol 2
  and route only to a server that proved 2, after the reviewed integrated durable
  repeated-denial fix. Schema contract identity alone cannot attest that fix.
  The CLI states this rule in code as `ROUTING_PROTOCOL` and `routable()` in
  apps/cli/src/server-connection.ts, named at the server-mode gate in
  apps/cli/src/main.ts `withStore`; the proof check also requires the proved
  protocol to equal the record's.
- Preserve the merged strict read leases, early flag refusals, in-place Snapshot
  restore admission, preview isolation, configured Attachment root and durable
  cleanup. Shared add create and subsequent read remain separate checked phases.

The earlier Decided text below is retained as decision history; this correction
supersedes its commit observation and temporary/global guard wording.

## Decided, 2026-11-12

This section records the owner's O44 answers and the coordinator's slice-1 order.
It governs implementation. The original proposal below remains an alternative
considered wherever it differs.

- Keep CLI input and printing. Add one typed run-command operation in TodoApi,
  carrying a discriminated union of prepared commands, starting with add. Both
  adapters execute the same shared command function and receive the same result.
  There are no per-family endpoints, argv execution, or rendered output strings.
- Discovery uses only a private record beside the canonical selected database.
  Independently compare device, inode, birth time and storage context, verify a
  fresh-nonce HMAC, then attach credentials only to that proved connection.
- When proof fails or no compatible server is proven, automatic mode writes
  directly as today. Direct writers take no ownership lock. No enrollment,
  legacy activation, hard-link refusal, staged input, or fail-closed automatic
  fallback is retained. Hard links, copied/stale records, busy, older or starting
  servers use direct mode. Only require-server or the lasting server setting refuses an unproven server.
- Retain a server-only coordination SQLite lock before opening its store, held
  through store close, to prevent a second participating server for one database.
  Use a UID-private device/inode-keyed lock registry so hard-link aliases share
  that guard. CLI direct writers never acquire this lock.
- Once any command byte may have reached the server, never fall back or retry.
  Unknown outcome is write_outcome_unknown, exit 1. A message above the HTTP body
  limit chooses direct mode before sending anything.
- Reads stay direct and the CLI never starts the server. Global --direct and
  --require-server are mutually exclusive. init and reset-passphrase remain
  direct exceptions. There is no HTTP provisioning capability.
- After a committing direct write, send a best-effort data-free nudge to a proven
  server. Discovery has a 50 ms budget and the post-commit nudge a separate 50 ms
  budget, excluding direct command execution. A nudge failure never changes output or exit status. No proven
  server means no nudge. Ordinary pre-write discovery is bounded by 1,000 ms for
  require-server, and by the nudge budget for automatic/direct mode.
- Fix durable repeated-denial handling first, in a separately reviewed integrated
  Authentication.record change. This unit does not edit that function. No
  production command routes until that prerequisite lands.
- Slice 1 publishes/removes records, implements proof, the server singleton
  guard, the nudge hook and CLI plumbing, and declares/tests the typed add
  operation. All routable production CLI execution stays disabled. Server mode and
  --require-server refuse writing commands; direct exceptions and reads remain
  local. Help states this transitional behavior. The typed operation is exercised by verification only.
- The nudge hook has one integration point for perf/stream-wake. Until integration,
  an in-process notification wakes the existing SSE polling wait so its next
  normal database/auth pass runs immediately; the 250 ms timer remains as fallback.
  The hook carries no Task data and conveys no authorization.
- Differential proof compares both modes on scratch clones restored to the same
  pathname, with byte comparisons and negative controls. Ordinary independent
  randomness must be distinguished from deterministic companion-build evidence.
  Preserve existing CLI goldens and response schemas. New schema comments may
  document mode flags without changing success/error payloads.
- Contract generation updates OpenAPI and its contract id. A Swift worker must
  regenerate and verify its client later. This worker runs no Swift, native app,
  Keychain, signing, launchd, or managed-server operation.

### Lasting write mode, decided 2026-11-12

The owner's O44/Q5 answer adds the local config key `write-mode`, exposed through
`todo config get write-mode` and `todo config set write-mode <value>`.
Command flags override the setting; the setting overrides the default automatic
mode. --direct and --require-server remain mutually exclusive. Unknown configured
values fail with usage exit 2 before prompts, authentication, or writes and name
automatic, direct and server.

| Mode | Who it is for | Behavior and cost |
| --- | --- | --- |
| automatic, default | People using CLI and apps together | Use a proven server when that command is routable; otherwise direct. Discovery adds a bounded check. |
| direct | People who prefer the CLI writing SQLite | Always direct, including when a server exists. A proven server still receives a bounded best-effort nudge after commit. |
| server | People requiring server execution | Refuse if no server is proven or the command is not routable. It requires the server and a supported command. |

Slice 1 accepts and persists the setting now. It refuses every writing command in
server mode because none is production-routable yet, even if the server proves
itself. This avoids surprising someone who explicitly requires server execution.
--require-server has the same refusal behavior. A --direct flag can override a
lasting server setting. Reads, init and reset-passphrase remain direct in every
mode. There is no implicit activation later without a reviewed routed command.
Configuration output adds optional write_mode; other response payload schemas and
all export/review golden files remain unchanged. Schema comments document flags.
Automatic/direct discovery is bounded by 50 ms and the post-commit nudge by a
separate 50 ms, excluding command execution time. Require-server discovery is
bounded by 1,000 ms before refusal.

The remaining text is the original design reviewed at 0ad107b6. Its ownership,
enrollment, provisioning and staged-upload recommendations are alternatives,
not current implementation instructions.

## Context

The CLI opens SQLite through the shared Effect domain package. The local server
finds external changes through 250 ms database polling. Routing CLI writing
commands through the running server lets those commands use its live store,
caches and future in-process stream wakeups while preserving offline CLI use.

Database selection is a correctness boundary. A CLI in a scratch HOME must never
send a write to the owner's database merely because a server answers at a default
port. An explicit URL or environment variable does not establish which database
the server serves. A failed connection does not establish that no server owns the
selected database.

## Proposed decision

Every CLI command that changes the Todo database, credentials, or owner Snapshots
uses the server serving that invocation's selected physical database when that
server is running. It uses the domain package directly only after proving absence,
or when the caller explicitly selects recovery direct mode. Logical reads remain
direct in this unit. The CLI does not start, install, or stop the server.

Database selection retains the existing precedence: `--db`, `TODO_DB`, configured
db_path, then the HOME-relative default. Write discovery never uses the Diagnostics
`--server` option, `TODO_SERVER_URL`, or a default port.

The server publishes a private endpoint record beside the canonical database. It
holds a separate crash-released coordination SQLite ownership lock before opening
the Task database until after closing it. Automatic direct invocations hold that
same lock across their own database use. A second server cannot open the store
while another owner holds the lock. Private directories use 0700; private files
and journals use 0600. The coordination lock file is never unlinked as stale.

Before sending credentials or a command, the CLI independently reads its database's
physical file identity and storage context. It verifies a fresh HMAC challenge
response from the server against the private record, the server's independently
read device/inode/birth identity, incarnation, and context. The command uses the
same proved TCP socket, with no redirect, proxy, reconnect, or automatic retry.
The server checks the expected identity and incarnation before authentication.
Hard-linked databases refuse automatic operation because alias paths can split
SQLite WAL state. Symlinks resolve to the same canonical file and must also match
the invocation's existing Attachment and Snapshot context.

A missing or stale endpoint permits automatic direct execution only after acquiring
the ownership lock and validating enrollment. A busy lock, timeout, unexpected
listener, identity mismatch, invalid proof or malformed record never causes an
unproven direct fallback. The proposed discovery deadline is 1,000 ms with connection
attempts bounded by 250 ms and the remaining deadline.

Existing databases require explicit offline enrollment after legacy processes have
stopped. A legacy server holds no new ownership lock, so absence cannot otherwise
be proven. Fresh databases created under the coordination lock enroll automatically.
An explicit `--direct` recovery flag retains today's direct behavior, including as
an intentional external writer while the server runs. `--require-server` fails if
there is no verified compatible server. Both flags appear in help and schemas and
are mutually exclusive.

Once any command-request byte may have reached the server, the CLI never falls
back or resubmits automatically. A lost or invalid response produces exit 1,
`write_outcome_unknown`, with the existing JSON error envelope and explicit unknown
outcome details. A validated command refusal keeps its present exit and meaning.
There is no implied idempotency guarantee for a caller's later manual retry.

The direct and routed paths execute one shared complete command implementation.
Typed command-family operations belong to TodoApi and its generated OpenAPI, not
a second RPC protocol or shell/argv execution endpoint. They preserve existing
CLI preparation, authorization order, expected Versions, per-item transactions,
History attribution, failure projection and reports. Rendering and local file
observations remain in the CLI. Existing JSON fields, output channels, exit codes,
goldens, and dry-run behavior retain their meaning under ADR-0009.

Local paths are references, never instructions for the server to read arbitrary
files. Any CLI copied-image capability sends image bytes, MIME and existing upload
metadata. Import sends parsed contents. Export and Obsidian write local output
files after direct reads. ADR-0011's managed-file boundary remains intact.

Proposed init and reset handling uses explicit local provisioning operations with
a private record-derived capability on the proved connection. A bearer Session
or Token alone cannot provision or reset the owner. Reset still requires actual
macOS account-password verification on the server host, then the shared domain
reset; a client boolean is insufficient. Provisioning secrets travel only over
the proved local connection and are neither logged nor persisted. This transport
choice needs explicit review. The alternative is an explicit offline-only
provisioning exception, which has not yet been selected.

## Exact supersessions upon acceptance

ADR-0001's consequence, "The CLI still opens SQLite directly through the shared
package, so it works without the server running.", becomes: "The CLI reads
directly through the shared domain package and routes writing commands through
the verified server for its selected database when that server runs. It writes
directly under the absence lock when offline, or with explicit recovery direct
mode."

ADR-0002's sentence, "The CLI is the only other process that opens the database,
and it does so through the shared domain package (see ADR-0001).", is narrowed
to direct reads, proved-offline operations, and explicit recovery direct mode.
Desktop clients still never open SQLite, and the domain remains the only
implementation of database rules. These accepted files are unchanged while this
record is proposed.

ADR-0003's single HttpApi contract, ADR-0005's owner and credential rules,
ADR-0007's History guarantees, ADR-0008's Purge redaction, and ADR-0010/0012/0019's
Profile, Snapshot and authorized discovery rules remain binding.

## Limits and prerequisites

Routing writing commands does not yet make the server literally the only writer.
The current store constructor takes a writer transaction and performs maintenance
even for CLI reads, and authentication denials can append History. Literal single
writer behavior needs a true read-only store-open path and reviewed server-side
handling of rejected read authorization. The constructor's file is pinned by
verify-occ-atomicity. That work needs separate permission and proof.

The current authentication denial cache also depends on process lifetime. Full
direct/server History parity for repeated failures requires a durable per-minute
deduplication correction consistent with ADR-0007. These prerequisites must not be
hidden in transport adapters or silently folded into the first slice.

External writers remain possible through explicit direct mode, existing read
maintenance, and domain-library programs. Stream and cache polling remain until
their own reviewed changes retain detection of those writes. This decision does
not itself remove timers or change formal pins.

## Consequences and rejected alternatives

The CLI can continue writing while offline without launching a daemon. While a
verified server runs, commands use its live store and immediate cache invalidation.
The cost is per-database enrollment and ownership, a proof handshake, typed command
result additions, and explicit uncertain-outcome reporting.

Default-port or environment-only routing is rejected because it can write scratch
commands into the wrong database. Health checks, PID liveness, record age and TCP
refusal are rejected as absence proofs. A database UUID alone is rejected because
copies preserve it. A private Unix socket alone is rejected because it still needs
file identity and ownership rules. Status-code-only adaptation of existing routes
is rejected because CLI History and output differ. Automatic retry after a lost
reply is rejected because add, Copy and bulk operations can duplicate accepted
work. A new dependency and changes to pinned store functions are not part of the
first slice.

Implementation and proof are specified in the
[CLI routing design](../decisions/ui-speed/cli-through-server-design.md). Delivery
stops after design review, then again after the separately authorized discovery
and add slice. Further families require separate orders.
