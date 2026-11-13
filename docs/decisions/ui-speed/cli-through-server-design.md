# CLI writes through the running server

Status: design gate, 2026-11-12. No product implementation is authorized by this document.

Source baseline: `6b167266fc34c3304e30ed220bb652b4d17c05ab`, branch
`feat/cli-through-server`. The required ancestry check passed. All source citations
below refer to that baseline. Paths and line numbers are repository-relative.
The draft decision is [ADR-0023](../../adr/0023-cli-writes-through-the-running-server.md).

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
  close and is independent of HOME/TMPDIR. A multiply linked database (link count
  other than 1) never stops the server: it starts and serves exactly as on the
  base, takes no guard, publishes no record, gives no proof, authorizes no command
  or nudge and logs the reason once, as when descriptor evidence is missing. Backup
  tools can link a live file without the owner knowing, and different hard-link
  directories share no beside-file guard. If the link count leaves 1 while the
  server runs, that incarnation withdraws for good, as for a lost guard; removing
  the link does not restore its record. Two servers on one multiply linked file are
  possible, as on the base, but neither ever proves, so no CLI write can be sent to
  the wrong one. The CLI writes directly to hard-linked databases. At publication,
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

## 1. Prove the database before sending a credential

The invariant is physical file identity: a routed command must use the same SQLite
file the invocation would open directly. A matching Profile, owner, database UUID,
URL, or database contents does not prove this. A copied database can preserve all
of those logical identities.

Today `apps/cli/src/main.ts:249-266` selects `--db`, then `TODO_DB`, then
`config.json`'s `db_path`, then the HOME-relative default. Preserve that precedence,
relative-path semantics, and errors in a single database-selection function.
Credential selection is separate in `apps/cli/src/credential-profile.ts:17-57`.
Diagnostics and top use a different URL selection at `main.ts:2021-2068`.
Neither `--server`, `TODO_SERVER_URL`, nor port 4310 participates in write discovery.

### Discovery and ownership

Use a private coordination directory beside the canonical database file, with a
separate entry for each encoded database basename. For example,
`<database-directory>/.todo-routing/<encoded-basename>/`. Directory modes are
0700. The enrollment marker, endpoint record, coordination SQLite database, and
any journal files are 0600 and owned by the invoking UID. Reject symlinked runtime
entries, foreign ownership, permissive modes, malformed records, and oversized
records. Do not silently repair untrusted discovery data. This follows the current
private database modes in `packages/domain/src/store/store.ts:127-143` and
ADR-0011/0012's private file stores.

The coordination SQLite file is separate from the Task database. Use Bun's existing
SQLite support, DELETE journaling, `busy_timeout=0`, and a held `BEGIN EXCLUSIVE`
transaction. It supplies a crash-released ownership lock without a new dependency,
PID liveness guesses, a heartbeat, or holding SQLite's Task writer lock for the
server lifetime. Never unlink this coordination file during ordinary cleanup.
Replacing a locked file would create two independent locks.

Both the server and an automatic direct writer acquire this same lock **before**
opening the Task database. The server holds it through migrations, listener
startup, all requests, scheduler work, listener shutdown, and store close. A direct
invocation holds it through its store close. A second server fails before opening
the store. A busy lock can also belong to another direct invocation or a starting
server; it never means that direct writing is safe.

After binding its actual loopback port, the server atomically publishes a bounded
endpoint JSON record. It contains protocol version, command capabilities, numeric
loopback address and actual port, random incarnation, random proof secret,
canonical database path, file identity, and file-storage context. PID is diagnostic
only. The server removes only a record bearing its own incarnation on orderly
shutdown. A crash may leave a record. A missing record while the lock is held means
startup or uncertainty, never absence. No database content or bearer is published.

The identity is the decimal-string device and inode plus the file birth timestamp
from `fstat`, with an open descriptor retained for the command or server lifetime.
The CLI reads this independently from its selected database, without `openStore`,
migration, or a readwrite SQLite connection. The server captures and rechecks the
identity around its actual store open under the ownership lock. It refuses service
if its named database is replaced, its descriptor and path disagree, or its path
acquires another hard link. The open descriptor prevents inode reuse while a
proof is in use. An application UUID alone is deliberately insufficient.

The proof also compares the attachment root and Snapshot location. The current
constructor computes Attachment storage from the supplied path and
`TODO_ATTACHMENT_ROOT` *before* canonicalizing the database path
(`store/store.ts:166-185`). Two aliases of one database can therefore have different
file-storage contexts today. Preserve the invocation's current effective context;
refuse routing if the server's differs. Do not change attachment paths as a side
effect of canonicalizing discovery.

### Proof and connection binding

Add an unauthenticated, bounded, no-store HttpApi proof endpoint, proposed
`POST /local/database-proof`. It accepts only a fresh nonce. It returns the nonce,
actual file identity, storage context, protocol, incarnation, command capabilities,
and an HMAC over these fields using the private endpoint-record secret. It reads
no Tasks and authenticates no Session or Token. The record secret is never sent.
The CLI compares these values to its own file descriptor and the private record.
The server calculates identity from its own open file, not the submitted nonce or
values copied from the record. The proof handler refuses while shutdown starts.

Bind the subsequent request to that **same TCP socket**. Use `node:http` with one
owned keep-alive Agent and one outstanding request. Initially construct the
mutation request without Authorization, local provisioning proof, or body. In its
socket callback, require the still-open proved socket before adding credentials
and ending the request. Never flush headers earlier. Destroy a replacement socket
without adding credentials. No redirects, proxies, DNS names, automatic reconnect,
or automatic request retries are allowed. Reproof is mandatory on a new socket
before any credential is attached. The first implementation must prove this
ordering with captured bytes on a replacement listener; fetch alone is not enough.

Each mutation includes expected identity and incarnation headers. The server
rechecks its binding before authentication or command execution. Losing the proved
socket cannot send a credential to a process that later takes the same port.
HMAC prevents an unrelated listener from asserting copied identity values. This
is protection against stale records and accidental endpoints, not isolation from
malicious code already running as the owner and able to read private files.

### Cases and their outcomes

| Case | Automatic behavior and reason |
| --- | --- |
| Fresh database, no server | Acquire the path's coordination lock before file creation, create through the domain, enroll, and write directly while retaining the lock. No endpoint request occurs. |
| Enrolled database, missing endpoint record | Direct only after acquiring the ownership lock. If busy, refuse after the discovery deadline. |
| Stale record or dead server | Try the lock first. If acquired, revalidate identity and enrollment, ignore the stale endpoint, and write directly. No request to the stale port is needed. |
| Record exists, lock busy, matching ready server | Complete proof and route on the same socket. |
| Connection refused, timeout, malformed proof, or HMAC failure while lock busy | Refuse. A listener failure does not prove the database owner is gone. Reacquiring the lock within the deadline permits direct execution only before a command request was sent. |
| Port reused by a server serving another database | Identity and HMAC fail before credentials. Refuse while the selected database's ownership lock remains held; otherwise direct after acquiring it. |
| Second server for the same file | Startup fails its lock acquisition, before `openStore`, migrations, or scheduler. It does not overwrite the first endpoint. |
| Symlink to the same file | Resolve to the target and use the same coordination directory. Route only if identity and the invocation's current storage context also match. Broken or cycling links refuse. |
| Hard-linked file, including aliases in one directory | Refuse automatic routing and automatic direct writes when `nlink != 1`. SQLite WAL and SHM names are path-based; accepting both aliases cannot promise safe or identical behavior. Recovery requires removing the extra link while offline, or an explicit `--direct` override. |
| Database copied or replaced at a familiar path | Refuse on enrollment identity mismatch, even if logical UUID, owner, and contents match. Re-enroll explicitly while offline. Restore in place under ADR-0012 keeps identity. |
| `TODO_SERVER_URL` points elsewhere | Ignore it for database mutations. Never probe it. Diagnostics/top keep their existing explicit read contract. |
| Private record permissions, ownership, or schema invalid | Refuse without a network request. An untrusted record is not evidence of absence. |
| `:memory:` | No discoverable shared file. Automatic mode is direct for this process-local database; require-server fails. Never associate it with an external server. |

### Legacy-server activation gate

An old server holds no coordination lock. A missing record cannot prove that it
is stopped. Neither probing the default port nor a PID file fixes that fact.
Existing, unenrolled databases therefore fail closed in automatic mode.
Fresh databases created under the protocol can enroll automatically. An existing
database enrolls only during an explicit offline activation of the upgraded
server, after the maintainer has stopped legacy writers and prevented an old
binary from starting concurrently. The activation command must reject observed
open legacy handles; handle enumeration is a check, not an atomic substitute for
that deployment precondition. Recovery `--direct` remains available.

The coordinator must approve this transition behavior. This unit must not inspect,
stop, contact, or enroll the managed server or the real database. All rehearsals
use newly created scratch databases and owned scratch servers.

## 2. Absence, uncertainty, and timing

The only automatic proof of absence is ownership-lock acquisition for an enrolled
database or a new database created under that lock. A successful health response,
TCP refusal, a stale PID, elapsed lease time, or a missing file is not that proof.
The lock also closes the race between deciding absence and a new server starting.

Discovery has a nominal 1,000 ms monotonic deadline, including startup-record
rechecks and proof. Each connection attempt has at most 250 ms, bounded by the
remaining deadline. Lock acquisition never waits in SQLite. Uncontended absence
needs one immediate acquisition and no network round trip. These are proposed
timeouts, not measured latency claims. Host scheduling can delay timer delivery;
record elapsed time and load. Owned-server verification readiness still allows at
least 60 seconds and is separate from command discovery.

Before any command-request byte can leave the process, mark the attempt as sent.
Once sent, no failure causes a direct retry, another HTTP submission, or a mode
switch. This includes a lost reply, invalid reply, disconnect, timeout, and a
server crash after commit. A complete validated rejection is a known failure and
retains its existing CLI exit status. It still does not trigger fallback.

An ambiguous attempt exits 1, runtime failure. JSON uses the existing error shape
and adds only details, for example:

```json
{"generated_at":"<instant>","code":"write_outcome_unknown","message":"The server may have applied this command. Inspect History before retrying.","exit_code":1,"exit_meaning":"runtime failure","details":{"outcome":"unknown","command":"add","request_id":"<id>","automatic_retry":false}}
```

The request id helps local diagnostics. It is not a durable idempotency key and
does not imply a searchable History field. Do not offer an automatic retry of
add, Copy, import, login, or restore. A later reconciliation capability would need
its own durable design. Batch unknown outcomes may contain an accepted prefix;
they are not reported as all rejected.

Uncertainty before submission exits 1 with `server_unverified` and
`details.outcome="not_sent"`. Require-server absence exits 1 with
`server_required` and the same outcome. Identity/context mismatch uses
`server_database_mismatch`; unsupported protocol or command uses
`server_command_unsupported`. JSON remains one object; human errors retain the
existing stderr channel and exit-meaning line (`main.ts:2493-2531`).

## 3. Modes and command boundaries

The coordinator's defaults are retained. Reads stay direct. Automatic writes use
the verified server when present, or direct mode under the absence lock. The CLI
does not start the server. Add mutually exclusive global `--direct` and
`--require-server` flags. Default is automatic. Document them in root help, manual,
every relevant schema's global-options comment, and error recovery. Conflicting
flags fail with exit 2 before file creation, prompts, or auth.

`--direct` is an explicit bypass for recovery and verification, including while
the server runs. It deliberately restores today's multi-process writer behavior
and keeps the timer paths testable. It cannot be described as proof that the
server is absent. It never stops a server. Preserve SQLite's normal transaction
and OCC rules. `--require-server` never creates a Task database or falls back.
The flags govern database operations; help, schema, local config, file export,
Obsidian output, and lifecycle operations retain their stated local behavior.
Diagnostics/top still require their selected HTTP server.

Dry runs for mutation families use the same selected command executor and its
in-memory fork, so Versions, refusal order, and accidental-write checks match.
Do not locally invent a successful preview for a command the live server lacks.
During slices, an unsupported writing command fails closed with a verified live
server. Offline direct mode remains complete. This is an intermediate branch,
not a releasable partial implementation.

### A literal single writer needs a separate prerequisite

Direct reads are not physically read-only today. `openStore` opens readwrite,
sets WAL, enters a writer transaction, runs migration/redaction, and cleans up
Attachments (`store/store.ts:171-213`). Authentication normally executes inside
the store's transaction function and records denials in another transaction
(`auth/auth.ts:266-301`). Even discovery uses a deferred read transaction followed
by rejected-auth recording (`auth/auth.ts:717-743`).

Thus routing writing commands alone does **not** establish "the server is the
only writer" or permit removing external-change observers. In the first slice,
routed writes must never call local `openStore`. Existing direct reads remain as
today, and this limitation is explicit. To complete the literal invariant later:

- Add a true read-only store-open path which performs no migration, maintenance,
  `BEGIN IMMEDIATE`, or cleanup while the server owns the database. Older schema
  reads refuse with a server-upgrade instruction instead of migrating.
- Retain direct authorized reads. Send failed read-auth attempts through a typed
  server operation that **re-executes authorization with the original AuthAction
  and target**, rather than trusting a client-supplied rejection event. Preserve
  denial attribution and one rejection; never make a read error disappear on a
  race with credential revocation or restore. The command-failure result must be
  captured once and rendered once. This needs its own reviewed concurrency design.
- When absent, hold the ownership lock for any CLI operation which may migrate,
  maintain, or record rejection, including reads. An explicit direct override is
  still the documented exception.

The first bullet changes `OperationStore.constructor` in a file pinned by
`.agents/skills/verify-occ-atomicity/coverage.json`. No such edit is authorized.
Request a separately ordered pin exception, review, and AtomicCAS proof, or accept
the narrower command-routing claim for this unit. Do not silently weaken the pin.

## 4. Complete CLI and HTTP inventory

`M` means the command can change the database or Snapshot files. `R` means a
logical read, still subject to the incidental-write issue above. `L` means a local
file or process operation. API citations name `packages/api/src/index.ts`; server
citations name `apps/server/src/server.ts`; CLI citations name `apps/cli/src/main.ts`
unless another path is given. `P` below means `/profiles/:profile` and `T` means
`P/tasks/:task`.

The CLI command registration is `main.ts:2258-2300`. Schema registrations are
`apps/cli/src/schema.ts:119-169`, plus `main.ts:604`, `1133-1134`, `1200-1207`,
`1517-1527`, `2070`, `2102-2104`, and the imported schema modules. The inventory
must later be checked against compiled `schema --list` and discovered help, not a
hand-maintained count alone.

| Command and kind | Current HTTP equivalent and code | Reply or behavior gap; proposed handling |
| --- | --- | --- |
| `add`, `add --parse`, M, CLI 636-722 | `POST P/tasks`, API 311, server 662; structured `POST P/series`, API 351, server 725. Parse-only route `POST P/quick-add/parse`, API 441, server 851 | CLI calls `createTask` with raw TaskFlags, draft, references, definitions, and Dependencies, then renders named metadata. HTTP returns TaskWrite. Add typed `POST /commands/add` calling that same complete shared command, returning a presentation result and canonical failure. Keep quick-add parsing local with its explicit invocation clock and zone; do not add preliminary HTTP auth. |
| `parse`, R without store, CLI 621-635 | Parse route above requires read auth | Keep local and auth-free. No Task or History write. |
| `edit`, M, CLI 1385-1515 | `PATCH T`, API 317, server 672; Series `PATCH T/series`, API 357, server 736 | Raw flags, named definitions, recurrence edits/clears, rejection inputs, and CLI error/latest view differ. Add `/commands/edit` sharing `mutateTask` and its preparation; return the same presentation result. |
| `done`, `cancel`, `reopen`, M, CLI 1385-1515 | `POST T/transition`, API 323, server 682 | Existing result has raw Task and successor facts, not CLI rendered metadata or exact errors. Add typed command-family routes or one discriminated transition command using shared CLI semantics and explicit expected Version. |
| `rm` Delete, M, CLI 1400-1507 | `DELETE T`, API 377, server 758 | TaskWrite already has Dependency metadata, dry_run, fingerprint, and confirm_from_version. CLI has status envelope, preview/prompt behavior, and its own failure text. Add `/commands/delete` using `mutateTask`; keep confirmation in CLI and submit the preview's original Version and fingerprint. Never confirm a projected after-Version. |
| `rm --force` Purge, M, CLI 1477-1490 | None. DELETE invokes `commands.delete`, not `commands.purge` | Add `/commands/purge` with expected Version and dry_run, using existing Purge and fork path (`commands.ts:1204-1229`). Preserve `would_purge` or `deleted` output, pre-Purge Snapshot, redaction and managed-file cleanup. |
| `move`, `copy`, M, CLI 836-1094 | `POST T/move` and `/copy`, API 333/339, server 692/703 | One-Task route lacks selection/filter loop, destination-name resolution, dry-run, managed-image stats, aggregated results and exit precedence. Extract the complete current transfer command into shared `task-transfer-command.ts` and add typed `/commands/move` and `/commands/copy`. Keep per-Task commits and partial reports; do not replace them with a new all-or-nothing transaction. |
| `batch-edit`, M, CLI 1133-1199 | `POST P/batch-edit`, API 288, server 551 | Report exists. CLI adds credential-key-aware missing-Task context and exit precedence. Reuse batchEditTasks through a typed command adapter with the same resolution/enrichment; retain current body and row schema. |
| `attach-many`, M, CLI 1200-1275 | `POST P/attachments/batch`, API 233, server 541 | Report exists. Same resolution/enrichment gap; CLI exit precedence is Conflict then 2, even for not-found rows. Preserve it rather than applying batch-edit precedence. Use shared command adapter. |
| `batch-depend`, M, CLI 1642-1679 | `POST P/dependencies/batch`, API 218, server 595 | Shared report exists; CLI resolves Profile first and exits with maximum row exit. Add command context without a second mutation implementation. |
| `import`, `--close-missing`, M, CLI 1946-1988 | `POST P/import`, API 294, server 562 | Report exists. Parse file/stdin locally into items and basename, send contents, never ask server to read a path. Preserve close_missing plan, pre-import Snapshot, dependency order, row order, partial commits, lookup context and Conflict-then-2 exit. Shared import command adapter. |
| `attach` link or path, M, CLI 1276-1326, `attachments.ts:48-121` | `POST T/attachments`, API 239, server 463 | CLI pre-reads the Task and uses current Version when none supplied. It returns AttachmentCommandResponse in JSON, full rendered Task otherwise, with local existence checks. Move complete authorization/version/pre-read ordering to a shared command adapter. Send absolute path **as a reference string only**, or the absolute URI. Server must never stat/read an arbitrary reference. CLI adds exists locally after result. |
| Copied image input, HTTP capability, no current standalone CLI upload command | `POST T/attachments/upload`, API 269, server 502; managed image read API 279, server 515 | Do not mislabel current `attach <image-path>` as copied upload; it is a file reference. Any later CLI copied-image entry point reads its own bytes and sends MIME plus bounded base64, name and Version, using the existing upload command. Never send a source path for server reading. Copy's existing managed-image duplication stays server-side inside the managed root. |
| `detach`, M or preview, CLI 1276-1326, `attachments.ts:78-108` | `POST T/attachments/detach`, API 249, server 476 | Route lacks CLI's preview and implicit Version semantics. Add command adapter preserving preview authentication, unchanged Version on preview and missing Attachment wording. |
| `label-attachment`, M, CLI 1327-1365 | `POST T/attachments/label`, API 259, server 489 | Same implicit Version and JSON projection gap. Preserve its exact human stdout `Attachment label updated`, currently without newline. Shared adapter. |
| Series and Occurrences through `add --recurrence`, `edit --recurrence`, `done`, `cancel`, M | Create/edit/skip routes API 351/357/367, server 725/736/747 | CLI uses createTask/mutateTask recurrence options. Preserve rule parsing and clearing, Occurrence-to-plain behavior and atomic successor generation. There are **no** standalone CLI `series`, `occurrence`, or `skip` commands in registration or schema. Do not invent them in this unit. Existing HTTP-only skip is unchanged. |
| `depend`, `undepend`, M, CLI 1528-1593 | `POST T/dependencies`, `/dependencies/remove`, API 198/208, server 573/584 | EdgeReport matches success. CLI edgeFailure/latest/error projection differs from HTTP's translation. Share the canonical command result, preserve no-op and stale-Version order, warnings and witnesses. |
| `revert <seq>`, M, CLI 1680-1765 | `POST T/revert`, API 345, server 714 | CLI finds the Task from the selected Profile's History by seq, then returns a named Task view. HTTP requires task id. Add `/commands/revert` resolving seq exactly as today without cross-Profile discovery. Preserve redaction refusal and graph checks. |
| `profile delete`, M, CLI 2135-2183 | `DELETE P`, API 409, server 775 | ProfileDeletionReport exists. CLI accepts name/id and prints refused result to stdout even in human mode. Share resolution and refusal handling; preserve Snapshot-before-transaction, scoped revocations, last-Profile rules and stdout channel. |
| `snapshot create`, M, CLI 2189-2198 | `POST /snapshots`, API 575, server 970 | Manifest exists; CLI supplies generated_at and snapshot wrapper. Canonical owner/failure mapping must preserve CLI text, not generic HTTP Snapshot failure. Command adapter. |
| `snapshot restore`, `snapshot prune`, M, CLI 2213-2229 | `POST /snapshots/:snapshot/restore`, `/snapshots/prune`, API 589/595, server 974/980 | Domain reports exist. Preserve wrappers, generated_at capture before execution, # Snapshots human body, dry-run, owner auth, exact errors, restore generation and external Purge journal. Command adapters call the same Snapshots API. |
| `snapshot list`, `snapshot show`, R, CLI 2199-2211 | `GET /snapshots`, `/snapshots/:snapshot`, API 571/584, server 969/972 | Keep direct reads and existing wrappers. Read-only-open prerequisite applies. |
| `init`, M, CLI 392-431 | No owner setup or ensure-Profile HTTP route | Add locally authorized `/commands/init`, calling setupOwner if a password was supplied, then ensureProfile in the same sequence as today. No password still ensures Profile. Preserve password warning and stdin rules in CLI. Ordinary Access Tokens must not gain provisioning power. See section 6. |
| `login`, M, CLI 432-476 | `POST /auth/sessions`, API 515, server 874 | Current HTTP sign-in lacks ensureProfile; CLI sign-in can create a missing Profile before storing the Session. Add `/commands/login` preserving signIn then ensureProfile and return credential privately plus existing identity fields. Keep the local 0600 credential-file write in CLI. Do not sign in twice or retry after unknown outcome. |
| `logout`, M plus local file, CLI 558-573 | `DELETE /auth/session`, API 529, server 906 | Preserve conditional no-file no-op and explicit credential selector error. Revoke on server first, then remove file only after known success. On unknown result retain file and return unknown outcome. |
| `reset-passphrase`, M, CLI 477-557 | None. CLI-only local-presence exception in ADR-0005 | Add locally authorized `/commands/reset-passphrase` with the same macOS account verification and domain reset. It must require private local capability and an actual account-password check, never a caller-supplied verified boolean. See section 6; no live password or native verification is authorized in this unit. |
| Other passphrase commands | None in CLI registration/schema | Do not invent change-passphrase or setup subcommands. Existing init and reset are the complete inventory. |
| Token issue/list/revoke, credentials | HTTP `/auth/tokens` POST/GET and DELETE `/auth/tokens/:name`, API 532-544, server 911-928 | No token-management CLI command exists in this source. Do not claim one is routed. Existing HTTP behavior remains. Local credential-file selection and persistence remain CLI-owned; future token commands use the same route selection. |
| `whoami`, R, CLI 574-598 | No exact identity endpoint; HTTP credentials authenticate within other commands | Keep direct, preserving authenticate action and selected-Profile behavior. |
| `list`, `show`, `history`, `graph`, R, CLI 723/1095/1366/1594 | API 300/306/436/228; server 621/648/841/606 | Keep direct, filters, selected Profile and recovery unchanged. No automatic cross-Profile lookup. |
| `lookup`, `profile list`, `profile list --projects`, R, CLI 2071-2134 | API 404/415; server 795/801 | Keep direct authorized discovery. No new all-Profile SSE or credential fallback. |
| `review daily`, `review weekly`, R, CLI 1767-1787 | Related `GET P/views/:view`, API 430, server 828; no exact rendered CLI report endpoint | Keep direct shared renderReview; preserve the golden bytes. |
| `export`, R and optional L, CLI 1788-1824 | No CLI export HTTP route | Keep database read and local output file as today. Do not send an output path to server. Export goldens remain unchanged. |
| `sync obsidian`, R plus L, CLI 1825-1879 | No route | Keep direct read and local managed-block write, canonical vault containment, Dependency links/Mermaid and outside_projection report. This does not mutate Todo. |
| `config get`, `config show`, `config set`, L, CLI 1897-1945 | No routes | Keep local HOME config. A config write changes later database selection, not Task data. |
| `help`, `--help`, `--version`, `man`, `schema`, R without store, CLI 1880/1989/2302/2468 | Related `/openapi.json` server 984-986 and `/health` API 561, server 934; no identical CLI help route | Keep local and auth-free. Container commands todo/review/sync/config/snapshot/profile keep help and missing-subcommand errors. |
| `diagnostics`, `diagnostics --follow`, `top`, HTTP reads, CLI 2021-2068 | `GET /diagnostics`, API 549, server 449 | Already server reads. Keep schema/NDJSON/TTY behavior and existing URL options separate from write discovery. No requests to them in this design unit. |
| Server lifecycle commands | Not `todo` commands. `todo-server install`, `uninstall`, `status`, `--version`: `apps/server/src/main.ts:9-67`; no HTTP lifecycle routes | Keep local process management. Routing must not auto-install, auto-start or stop a server. This unit never invokes launchd or these lifecycle commands. |

## 5. Identical observable behavior and the differential

The existing HTTP routes are not a drop-in CLI implementation. `taskResult` loses
parts of CLI error projection (`server.ts:76-106`), HTTP missing-Task errors select
HTTP recovery (`server.ts:299-315`), and validation middleware records
`{schema: Payload|Query}` rather than the raw CLI attempt
(`server.ts:341-430`, compare `commands.ts:1091-1134`). HTTP auth errors also have
different messages (`apps/server/src/errors.ts:10-22` versus
`commands.ts:1298-1315`). Mapping only HTTP status codes cannot meet the brief.

Use typed command operations in **the same TodoApi/OpenAPI contract**, not shell
execution, an argv endpoint, a second RPC protocol, or strings containing rendered
terminal output. Share the complete command semantics once in domain command
modules, retaining existing `createTask`, `mutateTask`, batch and Snapshot rules.
Both direct and HTTP adapters call them. The result contains the existing
presentation data or a schema-derived canonical CommandFailure with exit, code,
message, latest, details and Dependency witness. CLI renders once through today's
terminalSafe, renderTask/renderError and response schemas. HTTP middleware must
not authenticate or record a second rejection before/after this command boundary.
Pass credential-profile name as presentation context only; it grants no authority.

For add, the proposed caller shape is:

```ts
const result = yield* executeWrite(database, mode, {
	kind: "add",
	profile: cfg.profile,
	credentialProfile: credentialProfileName(cfg),
	flags,
	draft,
	attachments,
	depends_on,
});
yield* renderAddResult(result, cfg.format);
```

`executeWrite` hides discovery, ownership, proof, and the dispatch choice. It loads
the selected credential only after safe dispatch selection. Its internal decision
is a discriminated union: `direct` with a held ownership resource, `server` with a
proved connection, or a typed failure. A server outcome is `known` or `unknown`;
there is no boolean combination allowing unknown plus direct retry. Effect scopes
own descriptors, the coordination transaction, socket and store. Callers do not
sequence discover/prove/send themselves.

Proposed modules are `packages/domain/src/runtime/database-route.ts` for file and
ownership rules, `apps/cli/src/write-executor.ts` for dispatch, and
`apps/cli/src/server-connection.ts` for proved sockets. Shared complete commands
live by family, starting with `packages/domain/src/task-add-command.ts`, later
`task-transfer-command.ts`, `credential-commands.ts` and
`command-failure.ts`. API schemas derive from those domain schemas.
`apps/server/src/command-routes.ts` and `database-proof.ts` are thin handlers.
`server.ts` only acquires ownership and installs those groups. New domain modules
are named explicitly here; no store/projection pin change belongs to slice 1.

### A second parity gate in current auth code

`Authentication.record` deduplicates denials using an in-memory minute/set
(`auth/auth.ts:200-263`). Each direct CLI invocation gets a fresh set. A long-lived
server can suppress a second identical expired/revoked/scope rejection that two
separate direct invocations both record. Equal inputs across process lifetimes
therefore do not currently imply equal History.

Before claiming full parity for repeated failures, add a separately reviewed
domain fix which checks the durable rejection key within the existing transaction,
matching ADR-0007's per-minute rule across processes. Keep wrong-passphrase attempts
exempt. This is not a transport mapping fix. Do not suppress all auth recording,
change AuthAction to a generic authenticate, or call signIn twice. The coordinator
must order this correction or explicitly limit slice 1 to one failure per fresh
clone while keeping full repeated-failure parity unproven.

### Differential procedure

1. Build one same-source CLI/server pair in the worktree's ignored binary cache.
   Create a new scratch HOME and seed through public domain commands. Close the
   seed and clone its database, Snapshots, purge journal, Attachments and credential
   files. Never clone or read owner data. Use the *same scratch pathname* for each
   sequential member of a pair so stored image paths and manifest paths agree.
2. Run `--direct` on clone A with no server. Save raw stdout bytes, raw stderr,
   exact process exit, and sorted logical rows from **every** SQLite user table,
   including sqlite_sequence, credentials, owner, tombstones, op_log, replay
   checkpoints and cleanup queues. Inspect Snapshot manifests, purge journal and
   managed image bytes too. Compare logical table content, not SQLite page layout
   or WAL file bytes.
3. Restore clone B at that pathname and start only its owned server on port 0.
   Seed scheduler preconditions before either command. Verify readiness and proof,
   then run `--require-server` with identical input/stdin/format. Capture the same
   artifacts. Stop only that recorded child before reading the closed database.
   A network receipt must prove the command ran through HTTP, not through a hidden
   local fallback. A local-store-open control must prove the routed CLI did not
   open the Task database through openStore.
4. Compare output channels byte for byte, exit codes literally, and serialized
   logical rows byte for byte in deterministic companion builds. Control Date,
   Effect Clock, UUIDs, credential randomness, password salt and Snapshot timestamps
   at the **test compilation boundary**, shared by both adapters. Use compiled
   test entry points/build substitutions with no production environment backdoor
   or changed public flags. Keep per-command deterministic streams independent of
   proof/transport randomness so discovery does not consume Task identifiers.
5. Repeat through the ordinary unmodified compiled artifacts. Those runs cannot
   produce identical independently generated UUIDs/timestamps/secrets: retain raw
   evidence and compare only with an explicit allowlist of nondeterministic fields
   and a consistent bijection of generated identities. Assert all relationships,
   row counts, actor, action, Profile, versions, payload, reason, outcome, channels
   and exit literally. Never describe normalized comparison as raw-byte equality.
   Existing goldens already normalize selected dates (`verify-cli/SKILL.md`).
6. Scheduler writes must not be mistaken for command differences. It runs due work,
   credential cleanup and daily Snapshot immediately (`scheduler.ts:4-9`). The
   deterministic companion runs park its clock after an observed initial pass and
   seed identical post-pass state in the direct member. Ordinary compiled cases
   assert a quiescent baseline and identify any unrelated scheduled operation;
   an expired credential may be removed by the scheduler before the command and
   needs an explicitly controlled auth fixture. No arbitrary ignored History rows.

The cases cover every routed family in JSON, md and table where supported, exact
newline and terminal escaping, stdin and TTY confirmation paths, empty results,
dry-run no-change, success, refusal, not-found, stale expected Version, invalid
schema, valid schema/domain-invalid input, oversized input, expired/revoked Session
and Token, read-only Token, out-of-Profile scope, missing Profile and reused Profile
name, alternate credential file, and a missing local credential. Add creates no
missing Profile; init and successful login keep their existing ensureProfile behavior.
Compare exact rejected authentication and rejected Task History, including attempts
that fail during preparation. Missing credentials rejected before a domain call
must not acquire a new History row through transport middleware.

Each comparator has negative controls. Drop one rejected row, change mutate to
authenticate, change the Profile to null, add a newline, alter a Dependency witness,
change one exit, and introduce direct retry after a committed-but-dropped add
reply. Each control must fail its named comparison. Restore controls byte-exactly.
Also run a wrong-database routing control with two owned scratch servers: the
foreign server must receive zero credentials and zero mutation requests, and its
full logical dump must remain unchanged.

No Python workaround is proposed. Use compiled TypeScript drivers, the CLI, curl
where appropriate, and scratch SQLite inspection. Analysis of SQLite internals is
verification work, not a missing Todo command. If later work uses Python to fill
a missing CLI capability, first check the published contract and follow AGENTS.md's
feature-Task rule, without violating the prohibition on real data in this unit.

## 6. Credentials, provisioning, and lockout

Load only the credential file chosen by the current resolver. Send the exact
Session or Access Token as `Authorization: Bearer`, only to the proved numeric
loopback connection. No credential scan, cross-Profile retry, remote URL, redirect,
or fallback key is allowed. Server command execution resolves the Profile using
the original AuthAction before Task pre-reads, matching ADR-0019 and
`main.ts:305-316`. Actor comes from Authentication, not a new `cli` or `http` actor.

Login sends its passphrase once on the proved connection, calls the same signIn,
then ensureProfile, and persists the returned Session locally at 0600 only after
a known response. Direct login retains exactly that sequence. The failed Profile
creation after a successful sign-in can already leave a Session in the database;
do not invent a transaction that silently changes this behavior. A lost local
credential-file write similarly does not retry sign-in or undo its History.

Logout routes signOut when a file exists, then deletes the file after a known
success. Direct mode does the same. No-file logout stays a local success under
today's explicit-selector rules. Neither an expired key nor ambiguous revocation
silently becomes success or deletes the credential file.

Both modes use Authentication's 10-wrong-passphrase, one-hour lockout, shared
History, transactional hash/lock recheck, seven-day Sessions and revocation rules
(`auth/auth.ts:120-197`, `407-509`; ADR-0005). The command endpoint preserves the
CLI's exact sign_in_locked/sign_in_busy/auth_required messages, not the different
current `/auth/sessions` wording. Failures while locked do not run Argon2, and
existing credentials continue to work. Concurrent mixed-mode attempts and restart
are explicit proof cases. A server queue can return sign_in_busy under load; test
concurrency separately from sequential byte parity rather than calling it equal.

Init and reset have no bearer prerequisite today and must not become remotely
available to an Access Token. Proposed local provisioning requires an HMAC over
method, path, incarnation, nonce and body digest using the private record secret,
on the already-proved socket. This capability is limited to these explicit typed
operations, never a general execution endpoint. Reset still requires the real
macOS account-password verification in the server's local host adapter and then
domain reset. Never trust `verified:true` from a client. The account password and
new passphrase cross only the proved local connection and are never logged; the
account password is never put in argv or persisted. Direct reset keeps the same
check locally. Authenticated Session or Token alone is insufficient.

This expands local transport of provisioning secrets and needs coordinator/owner
approval in the draft ADR. A safe alternative is to require offline recovery for
init/reset, but that is an explicit exception to "every writing command routes",
not an unnoticed direct escape. This worker recommends the locally authorized
typed operations, subject to review. Do not implement provisioning in slice 1.

## 7. Other subsystem effects

Purge, restore and Profile deletion executed in the server operate on its live
store and immediately clear/fence its relevant search cache state
(`docs/architecture.md:159-178`). They avoid waiting for another process's observed
change. The ownership mechanism alone does not wake SSE. This branch leaves
`sse.ts` and cache observers unchanged and must not claim to have removed polling.
Coordinate later integration with the separate stream-wake/server-reads units
without reading or copying their branches. Existing timers remain necessary for
explicit direct mode, pre-routing readers' auth/maintenance writes, and other
domain-library writers.

Skills must retain real external-process coverage. Add explicit `--direct` to CLI
calls intended to test external SSE observation in verify-sse, external Purge,
restore and Profile deletion in verify-task-search-cache, and relevant external
writer cases in verify-snapshots, verify-profiles, verify-discovery,
verify-diagnostics and verify-scheduler. Audit their scripts instead of changing
all calls indiscriminately. Add separate require-server cases to prove routing.
Offline-only verify-cli and fixture setup remain scratch-local, with modes explicit
when setup uses an unenrolled database. Run verify-auth, verify-import,
verify-attachments, verify-recurrence, verify-dag and verify-server-api as their
families change. Do not launch either desktop app or any Keychain operation.

Create `verify-cli-routing` with the project create-verification-skill workflow
and its relative `.claude/skills` link, prove it end to end, and keep receipts under
ignored evidence directories. Extend it in the same slice as each command family;
the final skills slice audits remaining recipes. Verification cannot wait until
all command migrations finish.

No migration runs in the routed CLI path. The server migrates under its ownership
lock before publishing ready. Offline automatic CLI migration requires the held
lock and existing pre-migration Snapshot. A literal read-only path requires the
separate pinned-constructor permission described above. Recovery direct mode
retains today's locking and is outside the single-writer claim.

ADR-0009 JSON fields, envelopes, generated_at, one-object stdout, existing exit
codes and meanings, dry-run semantics, NDJSON and goldens remain unchanged.
Routing failures add error codes/details within that contract. API changes are
additive, generated from TodoApi, with no hand edits to OpenAPI or Swift output.
Required headless client contract regeneration/checks need coordination before an
API slice; no Swift product logic or native launch is authorized by this brief.

## 8. Reviewable slices and evidence

| Slice | Deliverable and stopping point | Proof and measurement |
| --- | --- | --- |
| 0, this delivery | This source-cited design plus proposed ADR-0023. No product code, accepted-ADR edits, install or real-data work. Send to coordinator and stop. | Ancestry, source inventory, document links/diff only. No product tests or benchmark claimed. |
| 1, only after explicit go-ahead | Discovery, enrollment/ownership, proof, socket binding, absence/unknown outcomes, help/schema mode docs, and **add only**, including its already-supported options through the shared add command. Other live-server writing commands fail unsupported. Stop again. | New verify-cli-routing skill; compiled scratch CLI/server with port 0. Both dispatch modes and all identity/stale/crash/start races, foreign server untouched, lost post-commit reply with exactly one Task, literal add output/History matrix and comparator controls. verify-cli, verify-server-api, verify-auth and affected add/Attachment/recurrence/DAG cases. Preserve pin hashes. |
| 2, Task lifecycle | edit, done/cancel/reopen, Delete/Purge, Revert and recurrence behavior already exposed by them | Family differential, expected-Version failures, preview confirmation/fingerprint, dependency refusals, redaction/Snapshot/copied-file checks; verify-cli/server-api/op-log/attachments/recurrence/dag/snapshots and applicable formal checks. No pinned changes without separate order. |
| 3, bulk and transfer | Move/Copy, three batches, import/close-missing | Differential for per-row success/refusal/conflict, mixed accepted prefixes, exact exit precedence, original row order, dry-run, definitions and managed bytes. verify-cli/import/attachments/dag plus server-api. |
| 4, owner lifecycle | Profile deletion, Snapshot create/restore/prune, login/logout and approved init/reset handling | verify-profiles/snapshots/auth/server-api and routing differential; lockout/revocation, deleted name reuse, generation/caches, file-write failure and ambiguous provisioning. No real OS password check; negative nonexistent-account proof only. |
| Separately ordered prerequisite | Durable auth-denial deduplication and, if required, true read-only opening/auth-rejection forwarding | Reproduce direct/server History divergence first. verify-auth/discovery and literal repeated-denial rows. Read-only work requires constructor pin exception, fresh correctness review, verify-occ-atomicity, applicable formal mapping and concurrency controls. Do not bundle into slice 1. |
| Final skills/integration | Audit every compiled CLI call; preserve direct timer proofs and add routed cases. Update architecture, diagrams and ADR index/supersession only after acceptance. | verify-sse and cache external/routed controls, complete help/schema inventory and family matrix, locked pnpm check, generated-client compatibility under authorized headless rules. Independent correctness and coordinator review before install. |

For each implemented family measure one representative command through unmodified
compiled binaries in direct and require-server modes. Alternate paired order AB/BA
over at least 1,000 invocations per mode on equivalent restored seeds. Measure
process start to process exit, report median and empirical nearest-rank p99 with
sample count, raw times and failures. Record build hashes, Task/History sizes,
command options, warmup policy, listener ownership, host load/core count, memory
pressure and free disk. Count startup/proof/serialization, not just HTTP execution.
Report direct-with-no-server and explicit-direct-with-server as distinct conditions.
Login's Argon2 and bulk file I/O need separate representative commands rather than
being inferred from add. Timeouts stay in the data and retain the host load.
Use benchmark-checklist and explain-the-number before reporting any result.
No measurements have been run for this design.

## 9. Remaining risks and decisions required

The coordinator's explicit decisions are needed before the first implementation:

1. Accept the proposed ADR's change to ADR-0001/0002 before writing product code,
   and approve per-database ownership, private proof and offline enrollment of
   existing databases. An older server cannot satisfy the absence proof.
2. Confirm that slice 1 may preserve existing direct reads and their incidental
   writes, with no literal single-writer or polling-removal claim. Alternatively
   order the pinned-constructor prerequisite before the routing slice. This worker
   will not change covered functions on its own.
3. Order the durable auth-rejection dedup fix before full repeated-failure parity,
   or keep that parity gate explicitly open. Current code contradicts the desired
   process-independent History behavior.
4. Review the proposed local provisioning capability and account-password transport,
   or approve an explicit offline-only init/reset exception in the decision record.
5. Approve the proposed 1,000 ms discovery deadline, hard-link refusal, explicit
   direct override while live, and canonical command-family HttpApi additions.

Additional risks are concrete implementation proof obligations:

- Holding a coordination transaction for a long server lifetime must be exercised
  through SIGKILL, abrupt descriptor close, restart, two direct writers, startup
  rollback and process exit. Never infer release from a mocked lock.
- Removing/replacing the private coordination directory while its owner runs can
  split ownership. Runtime file inode changes fail closed. Treat deletion by the
  same UID or external tools as unsupported recovery requiring all participants
  offline. Do not implement automatic lock-file reclamation based on age.
- Path replacement, symlink retargeting and file-context changes require repeated
  identity checks. Concurrent arbitrary file renames by owner code are outside the
  cooperative protocol; detected replacement refuses instead of following it.
- Database directories on network filesystems may not provide the assumed SQLite
  locking semantics. The protocol is for local filesystems. Unsupported locking
  errors refuse rather than becoming absence.
- A same-UID malicious process can read the proof secret and the database. The
  design prevents accidental cross-database routing, not that attacker. Snapshot
  copies must not preserve endpoint capabilities as active enrollment for a new file.
- Body limits matter. Whole CLI bulk files can exceed the current 28 MiB server
  limit (`server.ts:1022`) despite item-count limits. AttachManyRequest even accepts
  arbitrary JSON rows for per-row validation (`attachments.ts:146-149`). A new
  total-size limit would change today's direct behavior. The bulk slice must use
  typed staged input transport when the encoded command exceeds the body limit:
  private server-chosen staging ids, bounded chunks on proved connections, checked
  offsets and digest, then one command execution over the reconstructed payload.
  Stage requests require the private local capability, carry no bearer, run no
  domain authorization, and write no History. Final execution authenticates once
  in the original command order. Staging must never read a caller-supplied path,
  split an atomic group, or apply any row before final submission. Delete staging
  on completion, abandonment or restart under an explicit retention rule, with
  crash/partial-upload controls and its own verification feature. This extra
  transport work belongs to the bulk slice, not slice 1. A 413 never triggers
  fallback or automatic replay. File-system or memory exhaustion remains a runtime
  failure, not permission to weaken command validation or silently drop rows.
- A slow server can leave an ambiguous committed result after the CLI exits.
  Coordination proves absence before sending, not exactly-once replay afterward.
- Shared execution can become a generic command bus with duplicated rules.
  Keep typed family operations, reuse the existing domain commands, and keep
  terminal rendering and local filesystem observations in the CLI.
- Restore may revoke the requesting Session by restoring older credential rows.
  Send the already-decided result without a second auth pass. Reproof of file
  identity must not treat restored logical identity as a new physical database.

Two whole designs were considered in this single worker, as required by the
no-children brief. Port/PID/endpoint-record discovery alone is smaller but cannot
prove absence or close startup and port-reuse races. A private Unix socket alone
avoids numeric port discovery but does not identify the database or prove a stale
socket's owner is gone, and it adds a transport integration cost. The selected
design keeps the existing HttpApi transport and adds one ownership boundary that
hides identity, startup and fallback rules from command callers. Persistent-socket
proof is an implementation gate, not an assumption to waive if the HTTP client
reconnects. No alternate model, delegated reviewer, or child was used.
