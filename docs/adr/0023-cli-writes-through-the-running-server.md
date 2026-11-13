---
status: proposed
---

# CLI writes through the running server

Proposed 2026-11-12, following the owner's decision to route CLI writes through
the local server when it runs. This record awaits coordinator review and owner
acceptance. It does not authorize implementation or change accepted records yet.
ADR-0022 is reserved for another decision.

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
