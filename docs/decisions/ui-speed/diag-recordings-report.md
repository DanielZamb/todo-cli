# Private Diagnostics recordings

The current delivery corrects SQL7 and SQL8 from the second SQLite review. See
"Resume verification after disk hold" below for the completed gate. Earlier
sections record the
previous implementations and their receipts.

The SQLite implementation replaces the unshipped file journal with a separate
SQLite database in a worker thread. The SQLite replacement section at the end
of this report contains the current design and receipts. Earlier sections and
the manifest lifecycle table are historical, including their PASS claims for
superseded implementations. The contract remains
55c6d138cc924128593b25ef0313d898a6725bd0c0d91e026d09ad24536f28c8.

U06 and U07a implement the accepted recording policy in ADR-0020. Recording
files are separate from the Task database. Owner-authenticated loopback HTTP
and CLI commands share the same schemas and frozen-run reducer. App capture,
local app journals/uploaders, native controls and physical presentation proof
remain with the client units. No native app, Keychain, real Todo database,
installation or push was used.

The reviewed clock fix was merged first, as requested: merge
f25fbfc4b458a814c589ea9c42f49142c05bd9f0 contains exactly
6b167266fc34c3304e30ed220bb652b4d17c05ab and the prior core head. The first
implementation commit is 3ef9e674307378dde914059cb7581d6bdccb05d0; subsequent
corrections strengthen acknowledgements, incomplete-data accounting and recovery.

## Contract and client handoff

Old contract:
`57724665f2589fdec09d845635a9e2b87914a84569056085f89fe5700fa5cb64`.
New contract:
`cf81754585ee1525358bfe8a3357ff83a2024f8a350fe7a6d493afc9c61f7668`.
Existing Diagnostics keys and meaning, default/follow behavior, compatibility
refusal and Task/export goldens are retained. The optional shared envelope
fields and new recording endpoints change the generated contract. The new
CLI-only import report does not add an HTTP endpoint.

The only Swift action is the repository generator, through
`scripts/swift-slot.sh apps/macos/scripts/generate-api.sh`. Its own generator
build is included in that allowed command. No Swift app build/test, manual
Swift edit or launch was performed. Integration owes Mac compilation, native
capture and UI proof. Both apps and the server must move to the new contract
together; the existing client/server mismatch behavior remains in place.

| Surface | Behavior |
| --- | --- |
| POST /diagnostics/profiler/ingest | Strict batch, optional dry_run=true. HTTP reads at most 131,072 bytes before parsing, including chunked bodies; at most 128 events. |
| GET /diagnostics/profiler/runs | At most 100 run descriptors with an explicit numeric next cursor. |
| GET /diagnostics/profiler/runs/:run | Per-category/subtype, process, mode, input and workload summaries; at most 256 groups with an omission count. |
| GET /diagnostics/profiler/runs/:run/export | One bounded batch per page. A batch-id cursor resumes that batch; an evicted cursor is refused. |
| GET /diagnostics/profiler/compare | Requires before/after run ids and matching declared comparison conditions. |
| todo diagnostics runs/show/export/import/compare | One JSON object; --ndjson emits compact objects, and export traverses pages. Each command and the batch input have a todo schema entry. |

A batch contains schema_version=1, a random UUID-v4 batch_id, one run descriptor
and events in the shared vocabulary. The run descriptor contains run_id, app,
build_id, contract_id and optional comparison metadata: fixture_hash, script_hash,
environment_hash, release/debug configuration, render_stage and concurrency.
Ordinary always-on runs may omit comparison context and remain inspectable and
exportable; comparing them is refused. All hashes are fixed hexadecimal strings. Run and event identities must agree;
app/producer roles must agree. Event sequence is per producer; use a consistent
UUID spelling and a fresh run/ordinal map for a new process/authorization or
restore epoch. Sequences are bounded to uint32 and reported client loss counters
to one billion, keeping aggregate arithmetic exact within the file bounds.

Comparison permits different known build hashes but refuses different app,
contract, fixture/script/environment hashes, configuration, renderer capability
or concurrency. dev/unknown measurement identities cannot establish comparable
builds. environment_hash must describe the measurement conditions, including
input origin, capture method, cache state, display/device and power/load class.
Declared comparability is not proof that the script ran correctly; incomplete
or unproven results remain visible. There is no cross-clock subtraction or
physical-paint claim.

Producers may send profile_ordinal from 1 through 65,535, valid only in that run.
input_timing carries basis press/release, separate hold_ms and
derived_from_native_selection. selection_context has only list_rows,
refresh_in_flight, process_uptime_ms and journal_bytes. No Profile name/id or
Task content is accepted. The uploader must exclude its own profiler HTTP
traffic from automatic capture. The server never feeds journal writes back into
ingestion; the compiled producer's three events remain exactly three on retry.

Ingestion's internal queue is bounded, asynchronous and independent of Task
transactions. HTTP awaits persistence asynchronously and returns durability
stored only after the atomic write; dry run returns validated. A refused queue
or disk failure returns accepted=false, with losses, without changing a Task
response or write. Clients retain local batches until stored and retry uncertain
responses using the same batch id. Conflicting reuse of a batch id is refused.

## Storage, privacy and completeness

New domain files have these jobs:

- diagnostic-recordings.ts: strict wire schemas, limits and ingestion validation.
- diagnostic-run-summary.ts: pure event reduction, producer clocks and comparable-run rules.
- store/diagnostic-recordings.ts: private files, serialization of asynchronous work, admission, retention and queries.

The server creates diagnostic-recordings beside the configured Task database,
with a 0700 directory and 0600 files. Immutable JSON segments use exclusive,
no-follow temporary creation, file sync and atomic rename. An empty 0600 SQLite lease file holds an exclusive OS lock, admitting only one
writer for this directory. It contains no recording data; a killed process
releases ownership automatically. A second writer declines admission without
scanning or changing the active writer's files. Startup validates
segments, removes orphan/corrupt files and counts them. Uppercase UUID spellings
accepted by the event schema survive restart too. No journal payload enters
SQLite, op_log, Task Snapshots, migrations or business transactions.

Limits are 32 MiB per app across runs, seven days from server receipt, and at
most 256 MiB total. Electron main/renderer share one app quota. The app enum
currently permits four app classes, so their combined app quotas are stricter
than the global ceiling. There are at most 4,096 segments and 1 MiB of encoded
pending batches. Files are charged in filesystem block units; two status-file
blocks and one empty SQLite lease block are reserved for atomic replacement
and exclusive writer ownership. Oldest received segments go first.
The implementation does not trust producer wall time for retention. An
unreferenced timer prunes idle recordings without a later request; filesystem
failures are counted and retry at most once a minute. A literal fake-clock
control first failed with one segment remaining and now expires it without
calling a read. The timer does no work in a Task handler.

Loss/status accompanies reads, exports and import reports. Expiry, capacity,
corrupt/orphan segments, storage failures, duplicate batches and restart
uncertainty are separate. Admission-drop counters count declined attempts;
clients may recover them by retry. Capacity/expiry counters count removed stored
events. They are not invented counts of lost UI actions.

Known input/handler starts, including an input swallowed before its handler,
remain in the denominator. A visible rendered result contributes a duration;
an ended action without the required render/correctness proof does not become
successful. Failed/refused/conflicted handler endings without a rendered
result retain their outcome and remain unfinished. Pending, cancelled, lost and
crashed starts remain counted. Raw
completed quantiles use nearest rank; deadline fractions use all known starts.
A clock discontinuity, unknown-category lost starts, sequence gap or uncertain
recovered tail makes the all-start denominator unproven: deadline fractions
are null, not a misleading fraction of surviving successes. Descriptive raw
completed quantiles and known counts remain next to those flags. Losing an old
run does not poison a fresh complete run. Producer clocks and termination
outcomes are isolated by process role. A recovered producer without a clean
termination remains uncertain; a process/power failure is not silently called
complete. This is process-crash recovery, not a hardware power-loss guarantee.

Owner checks precede ingestion decoding and run existence checks, and are
repeated before returning asynchronous reads. Access Tokens, missing, expired
and revoked Sessions receive no recordings. The listener is loopback-only, and
these routes additionally check the actual peer, loopback Host and absence of
forwarded/proxy headers. Redirects and non-loopback CLI destinations are refused.
Unknown fields, nested metadata and arbitrary values are refused with generic
errors, never stored or echoed. Controls try title, task_id, profile_name,
search_text, path and token. Files contain neither the scratch Task title nor
bearer credential. Rejected input is not included in a validation error.

CLI import validates all local input before the first POST. It accepts one batch,
a bounded export page or NDJSON pages, up to 64 MiB including export envelopes.
The larger local envelope bound permits a full 32 MiB app recording to round-trip.
Dry run performs no journal write. Apply is a sequence of acknowledged batches;
a partial failure reports the accepted count. It is not a Task import or an
atomic multi-batch operation. Export/import can encounter explicit retention
loss; neither bypasses the configured quotas.

## Attribution and model review

Joined read routes now time history JSON/schema decoding, Task materialization
and actual response schema/JSON encoding. There is one span per materialization
pass, not one per row. Entry metadata has first_use per fixed method/route;
unmatched method names collapse to a fixed OTHER key. The writer-lock metadata
class is external_or_unknown: SQLite does not expose the external holder's
process identity. No invented holder identity, Profile id or SQL text is recorded.
Encoding is covered for Task lists, Profiles, Projects, Tags and planning views;
other encoders, socket acceptance/dispatch, flush/body completion and physical
receipt remain gaps. These spans are in the existing bounded recorder and do
not introduce journal writes into the Task path.

The 10,000-request budget control caught the extra stage cardinality. Stage
space increased from 6,144 to 8,192 bytes and category space decreased from
16,384 to 14,336 within the same total allocation. Both complete count assertions
and the unchanged 49,152/65,536 body caps pass; no assertion or timeout was relaxed.

AtomicCAS initially stopped only on store.ts and projection.ts hashes, after
its behavioral/model stages. The reviewed product for renewal is 3ef9e674.
readTasks wraps the same ordered JSON/schema map in guarded timing; historySync
wraps the same map after the unchanged SELECT. The lock-class metadata is
constructed before BEGIN. There is no await, yield, file I/O, new SQL mutation,
changed statement order or transaction boundary in those mapped changes.
applyEvent is byte-identical to f25fbfc4, SHA-256
f17a6f4792bf970de03b2a5889403c54c670aefa0d6ee98102001ea6dc333863.
Recorder failures still pass through observeDiagnostic. The 47 compiled fault
controls and the new broken-journal HTTP control preserve outcomes and exactly
one durable TaskCreated entry. The renewed AtomicCAS command and its two real
source mutations pass: each broken variant fails before the source gate and
restored code passes. Models, assumptions, invariants and bounds are unchanged.

The search formal command found pre-existing task-client.ts drift from
2c147ad9: snapshot() became snapshot({ query: {} }). Its URL and modeled Task
list/search branches are unchanged. Only that hash was renewed against immutable
f25fbfc4. The full safety/liveness and sensitivity command then passed. No
matcher, ordering, publication or atomicity assumption changed.

## Measured cost

Journal disk work is asynchronous and is awaited only by the recording request.
The synchronous ingress path does bounded JSON/schema validation, identity and
size checks, a digest and queue admission, plus existing owner authentication
and response encoding. It does not run synchronous filesystem calls or add an
await/I/O dependency to a Task handler. It still shares the server's event loop
and auth boundary; zero CPU interference is not claimed. Allocations were not
counted. The pending encoded-byte limit is not a JavaScript heap measurement.

The same-binary ingestion comparison counterbalances AB/BA over ten pairs for
each cell, 100 literal 15-Task reads per run, with/without a concurrent producer.
Every reply and admission is checked. There is at most one Task read and one ingestion in flight; this does not
measure maximum offered-load capacity. Each cell has 2,000 Task requests and
1,000 stored batches: 16,000 or 128,000 events. Loads are recorded at both run
boundaries. There is no imposed CPU pressure, app launch or input automation.
These are ambient-host comparisons, not a quiet-host certification.

| Events/batch | Task p50 without, median [range] ms | Task p50 with, median [range] ms | Paired p50 difference, median [range] ms | Verdict |
| ---: | --- | --- | --- | --- |
| 16 | 0.2922 [0.2830, 0.4209] | 0.3017 [0.2987, 0.3706] | 0.0105 [-0.0503, 0.0631] | Inconclusive |
| 128 | 0.2934 [0.2848, 0.4347] | 0.3229 [0.3061, 0.4247] | 0.0296 [-0.0100, 0.0428] | Inconclusive |

Ingest handler p50 including asynchronous persistence is 0.5725 ms
[0.542, 0.623] for 16 events and 0.9755 ms [0.913, 1.122] for 128.
Per-run ingest p99 medians are 1.7465 [0.838, 2.978] and
2.199 [1.997, 4.388] ms. Payloads average about 9.9 KB and 74.9 KB.
The 128-event cell rotated 72,832 older events at the app cap, with no
admission failures or storage failures; the 16-event cell had no losses.
Boundary one-minute loads were 3.04 and 3.04–3.36. Detailed p99 distributions, each
paired difference, bytes, loss status and server/driver CPU are retained in raw
and result files in cost-release-16 and cost-release-128. In the first pair,
producer CPU was 11.8 ms versus 40.2 ms of Task response time at 16 events,
and 19.8 versus 47.1 ms at 128; the generator was not CPU-saturated. Server
CPU/RSS boundaries are retained separately; RSS is not an allocation count.
Earlier durable-ack and five-pair queued-ack experiments is retained but not
pooled with the durable-ack comparisons.

The separate ten-pair recorder disabled/enabled control observes 14 spans per
probe request, 24,165 compact profiler bytes, capacity 2,048 recent / 256 active,
zero lost starts and 212,517 detail-ring displacements after sustained traffic.
Displacements are detail loss, not vanished aggregate starts. Its Task-p50
paired lower-median difference is 0.000876 ms [-0.023833, 0.050124], inconclusive.
For its 100-Task fixture, run p50 medians were 1.092667 ms
[1.058125, 1.123291] disabled and 1.089458 [1.066208, 1.157833] enabled;
p99 medians were 2.190334 [1.782084, 3.396708] and
2.218375 [1.952750, 6.141375]. Every pair and both load boundaries
are in instrumentation-release/result.json. The separate untimed source-server CPU profile is retained, never mixed into
compiled latency data. A quiet-machine confirmation under the unchanged ceiling
is owed at integration. No result here proves native input-to-render targets.

## Commands, real exits and evidence

Evidence root is docs/evidence/ui-speed/recordings. Each named receipt is local
and ignored. All commands ran from this checkout with scratch data. No package
was added or upgraded. The reusable producer and cost controls live under
verify-ui-profiler, created through create-verification-skill and proven through
its real CLI/HTTP surface; fresh Claude discovery and native client work remain owed.

| Command | Exit | Receipt |
| --- | ---: | --- |
| git merge --no-ff 6b167266fc34c3304e30ed220bb652b4d17c05ab | 0 | f25fbfc4 merge, first action |
| pnpm --filter @todo/domain test diagnostic-recordings.test.ts | 1 before implementation | red-schema.log/.exit |
| pnpm --filter @todo/server test diagnostic-recordings.test.ts | 1 before routes | red-http.log/.exit; literal 404 versus required 401 |
| pnpm --filter @todo/domain test diagnostic-recording-store.test.ts | 1 then 0 | red-store, red-retry, red-swallowed, red-scoped-loss, red-uppercase, red-gap-fraction, red-producer-clocks, red-json-order, red-uncontrolled, red-writer-owner, red-idle-expiry; literal green controls retained |
| ./scripts/swift-slot.sh apps/macos/scripts/generate-api.sh | 0 | generate-api-uncontrolled.log/.exit, final identity |
| pnpm --filter @todo/domain test diagnostic-recording-store.test.ts | 0 | green-idle-expiry-2.log/.exit; 20 literal controls including crash ownership and idle expiry |
| HOME=<scratch> TODO_DB=<scratch> .scratch/bin/todo schema 'diagnostics batch' | 0 | recording-batch.schema.json and schema-batch.exit |
| bun apps/server/scripts/scratch-diagnostics.ts build | 0 | build-final-4.log/.exit; same-source CLI/server/seed |
| bun build --compile apps/server/scripts/diagnostic-fault-cli.ts --outfile .scratch/bin/diagnostic-fault-cli; bun build --compile apps/server/scripts/verify-diagnostic-faults.ts --outfile .scratch/bin/verify-diagnostic-faults | 0 each | both completed before faults-final-4, which exited 0 |
| pnpm typecheck | 0 | types-delivery-2.log/.exit; repeated by final root |
| bun packages/api/scripts/openapi.ts --check | 0 | contract-delivery-2.log/.exit, cf817545… |
| TODO_PROFILER_STRESS=1 bun .agents/skills/verify-ui-profiler/scripts/verify.ts "$PWD/docs/evidence/ui-speed/recordings/producer-final-4" | 0 | real producer, CLI JSON/NDJSON, privacy, comparison and 700-batch cap |
| TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh "$PWD/docs/evidence/ui-speed/recordings/diagnostics-final-4" | 0 | terminal PNG explicitly HOLD, HTTP/CLI/PTY checks PASS |
| TODO_SERVER_BINARY="$PWD/.scratch/bin/todo-server" TODO_SEED_BINARY="$PWD/.scratch/bin/seed" .agents/skills/verify-server-api/scripts/verify.sh "$PWD/docs/evidence/ui-speed/recordings/api-final-4" | 0 | api-final-4.exit |
| .agents/skills/verify-auth/scripts/verify.sh "$PWD/docs/evidence/ui-speed/recordings/auth" | 0 | auth.exit |
| .scratch/bin/verify-diagnostic-faults "$PWD/docs/evidence/ui-speed/recordings/faults-final-4" | 0 | faults-final-4.exit, 47 cases; drivers compiled from their production adapters |
| bun .agents/skills/verify-occ-atomicity/check.ts | 1, then 0 | source drift only, then fv01-check-zq3fVn |
| bun .agents/skills/verify-occ-atomicity/prove-sensitivity.ts | 0 | sensitivity-541kHQ; both literal breaks fail, restored command 0 |
| bun .agents/skills/verify-task-search-formal/check.ts | 1, then 0 | pre-existing typed-call hash, then complete check-G7JBXV |
| TODO_PROFILER_PAIRS=10 bun .agents/skills/verify-ui-profiler/scripts/benchmark.ts "$PWD/docs/evidence/ui-speed/recordings/cost-release-16" | 0 | 16-event ten-pair control |
| TODO_PROFILER_PAIRS=10 TODO_PROFILER_EVENTS=128 bun .agents/skills/verify-ui-profiler/scripts/benchmark.ts "$PWD/docs/evidence/ui-speed/recordings/cost-release-128" | 0 | maximum-event ten-pair control |
| TODO_DIAGNOSTICS_BUSY_BENCHMARK=1 bun apps/server/scripts/benchmark-diagnostic-recording.ts "$PWD/docs/evidence/ui-speed/recordings/instrumentation-release" | 0 | ten pairs and separate CPU profile |
| /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check, disk guard first | 0 final; earlier 0, 0, 1, 0 | root-release.log/.exit; root-1, root-2, root-final, root-delivery retained |

The final root-release run passed 432 domain, 38 server, 168 Electron and
80 CLI tests; one existing Electron test was skipped. Type checks, contract
check and lint passed; existing lint warnings remain. The disk guard ran first
with 61.3 GB free, above the 30 GB soft floor. One-minute load was 3.01 at
start and 5.14 at completion. No other measurement or compiled verification job
from this worker ran during it. No worker cap, tracked recipe, timeout or
assertion changed.

The root-final failure was the existing auth-history fixture's expired HTTP edit:
it expected expired, but the live scheduler had removed the credential, producing
invalid_credential. The request still returned the required Unauthorized response,
left the Task unchanged and recorded one rejection. The focused auth-history control
passed all 12 tests, and root-delivery passed the entire plain command. Both receipts and the final plain root rerun are
retained; no assertion, timeout or scheduler behavior is weakened.
The first attempted compiled red probe lacked the old cached binary and failed
provisioning; it is not counted as a behavioral red proof. Other development
failures, including the deliberate stale cap/field assertions, remain in evidence.

The capped production drive admits 700 batches and retains 585 segments,
33,546,240 charged data bytes / 33,550,336 allocated file bytes, with 7,370
capacity-evicted events, zero pending bytes and zero storage failures. It verifies
0700/0600 modes, no forbidden content/credentials, and literal Task reads during
upload. A real disk-full condition was not induced on the host; actual filesystem
open/write failures exercise the same contained promise path. The 7-day bound,
orphan recovery, conflicting retries and clock/sequence cases have literal controls.

## Delivery identity and remaining work

Final executable source is 7a117b79947ad116957261038d560078a54338bc; the
later report commit changes no executable source. The cached compiled source
manifest has SHA-256 d31b125514d417ecbc72b6c57862c1de4958e3b02f4c4844e2025a632a78c2ed.
CLI SHA-256: 20ffb64a0538c53f8b539182e2541108308776234c4250041ebf5c9e2ab3064c.
Server SHA-256: 66af3bdc90916d838c2d5d7c91c821f5278405daa8244c1cfad60d11305af136.
Cleanup removed only closed Bun compile temporaries from this checkout, with
lsof checked before unlinking each file. The first pass removed 28 files and
2,482,536,448 allocated bytes; the final pass removed 20 and 1,773,240,320 bytes,
with zero open-file skips. Total freed is 4,255,776,768 allocated bytes (4.26 GB).
Receipts: cleanup-pre-final.json and cleanup-final.json. The last disk guard
reported 60.3 GB free. Owned producer/server/HTTP scratch data was removed by
the recipes; evidence and cited compiled artifacts remain local and ignored.
No other worker's files or processes were touched.

The native units owe app-local 32 MiB journals, automatic upload/ack/retry,
release-time capture and native views. This unit proves their shared schema and
real client-shaped producer, not either installed app. Mac compilation, terminal
PNG rendering by a unit holding the shared Swift slot, fresh Claude skill
discovery, and quiet-machine confirmation under the unchanged ceiling remain
integration receipts. Hardware power-loss durability, allocation counts and
physical presentation were not measured. No product change is proposed outside
the accepted shared policy; cross-clock calibration remains proposed.

The local audit found no new suppression or source comments in the implementation;
no independent review is claimed. The coordinator's correctness seat reviews
this delivery. Existing JSON keys, Task/export goldens, mismatch behavior and
business transaction models remain intact.


## Recording review correction, 2026-11-12

The seat found three P2 defects and one P3. Product corrections are f53213a3;
b1ce3f3c repairs the verification entry's argument handling and scratch guard;
39d9ad40 preflights the whole CLI input before uploading. There is no HTTP schema
change. The contract check proves the same full id stated above, and generated
OpenAPI/Swift sources are unchanged from d1541167. No Swift command was run.

### Conflicting observations and imports

The chosen rule is refusal before admission. Run, producer and sequence identify
an event; a canonical content fingerprint must match every retained or pending
copy. Different content returns HTTP 400 and CLI exit 2 with the static message
"Recording sequence conflicts; resend the original data or begin a new run."
The whole batch is refused, including any completion it contains. The seat's
one start plus a conflicting start/completion therefore stays at one unfinished
start, zero duration samples and both deadline fractions zero. It cannot turn
into a perfect completed run. Refusal was chosen because producer data is
contradictory and no duration or denominator can be invented to repair it.

Fully retained identical events are no-ops, including reordered JSON keys.
Mixed batches deduplicate identical events in their observations. A second batch
whose events are still pending is queued and cannot claim stored durability.
The pending/stored fingerprint reference counts are separate. Existing batch-id
content comparisons remain, and a conflicting batch-id retry has its own safe
recovery message. The existing per-batch unique-sequence validation remains.

Legacy files may already contain contradictory data. Export retains their raw
metadata for inspection, while show/compare refuse instead of silently choosing
a payload and producing a score. The public pure reducer applies the same rule.
The related-pattern audit also found repeated conflicting phases for one action:
two different results could keep the faster first one. That now refuses with an
action-phase message. One input followed by its handler, and one handler end
followed by its rendered result, remain valid distinct phases of one action.

Import and dry run validate every local batch and all cross-batch event/run
identities before the first POST. A fresh NDJSON file with contradictory batches
is refused locally in both modes and creates no server run. Conflicts with an
already stored run are refused by the server in apply and dry-run modes. The
compiled controls assert the HTTP body, one CLI JSON object, empty stderr,
exit 2, its unchanged meaning "validation or usage", and the resulting summary.

### Expiry and identity bounds

The previous report incorrectly claimed the one-minute failure backoff. The
callback still used armExpiry's one-millisecond default. The retained red
control observed 1 instead of 60000. The callback now counts the failure and
enters backoff. Its existing timer is preserved across other status writes,
so they cannot shorten or postpone the retry. The next background attempt is
at least 60000 ms later; success restores normal expiry scheduling. There is
one unreferenced expiry timer, not an immediate retry loop. The literal test
checks no retry for 59999 ms, retry at 60000, a concurrent failed upload without
rearming the timer, counted failures, and normal scheduling after recovery.

Manifests now reference actual retained segments or pending batches, using a
batch-to-run map. Cleanup no longer waits for the entire pending queue to empty.
The 1001-run witness keeps one 4096-byte segment and one pending write, with at
most two manifests and two event identities on every iteration. A separate
literal test admits 1024 pending batches and refuses the 1025th before the
encoded queue reaches one MiB. The caps are now stated in ADR-0020 and the skill:

| State | Upper bound |
| --- | ---: |
| Retained segments / batch digests | 4096 |
| Pending batches / run references | 1024 |
| Encoded pending data | 1048576 bytes |
| Retained or pending run manifests | 5120 |
| Retained or pending event fingerprint references | 655360 |
| Recovered-run flags | 4096 initially, trimmed with identity cleanup |

The event bound is (4096 + 1024) times 128 events. Fixed-length digests and
bounded run/role/sequence keys prevent variable content retention in that index.
These are cardinality bounds, not measured JavaScript heap bytes. Every evicted
segment or failed pending write releases its fingerprint references. Startup
rejects/counts duplicate batch-id files instead of overwriting their identity
bookkeeping. Original byte/age/file-mode and Task isolation caps remain.

### Safe comparison explanations

Shared allowlisted messages identify missing comparison context, unknown build,
contract, configuration or render capability, and mismatched app, contract,
fixture, script, environment, configuration, render capability or concurrency.
No uploaded condition value, dynamic error text, path or credential is returned.
The HTTP sanitizer and CLI accept only an exact message from this allowlist;
unknown decoding/errors stay generic. The environment-only control now returns
"Recording comparison refused: environment differs." in HTTP and the CLI.
Its HTTP status remains 400; the CLI still exits 2 for validation or usage.
Missing/expired runs and expired export cursors have safe recovery messages too.
Unauthenticated/refused-auth callers still take the owner guard first.

### Audit of the three related shapes

| Location | Rule and result |
| --- | --- |
| Store batch UUID and manifest keys | Full canonical decoded metadata/digest comparison precedes reuse. Contradictions refuse; duplicate files at recovery are counted corrupt. |
| Event index, stored-event reader and public reducer | Producer sequence content is compared; exact duplicates are no-ops. Pending data is not stored data. No first-payload selection on conflict. |
| Reducer action keys | One action intentionally joins different phases. Repeated conflicting phases now refuse; a result can supersede its handler end. |
| Clocks, sequence positions and run-list grouping | These aggregate validated observations, not competing payloads. Clock/gap uncertainty stays visible, and run event totals describe retained wire data. |
| Expiry timer | One timer, explicit failed state, at least one minute per automatic retry, preserved across other journal activity, cleared at close. |
| Queue/save promises and CLI HTTP/export loops | No automatic failure retry. Work is serialized, failures counted or returned, export advances one bounded cursor or stops. saveLater coalesces status work. |
| Manifests and recovered-run flags | Trim by actual retained/pending references on completion/rotation, never global queue idleness. |
| Fingerprint/digest indexes | Release per failed batch or removed segment; maximum follows explicit segment and pending-batch caps. |

No Task store/projection, model or formal coverage pin changed. The source delta
check for those mapped inputs exits 0; their previous seat-proven formal receipts
remain applicable. There is no pin renewal or changed atomicity assumption here.

### Current measurements

Ingestion adds bounded canonical serialization and at most 128 event hashes to
the existing metadata-validation/admission work. There is no new Task-handler
journal I/O dependency or synchronous disk write. Allocations were not counted.
Both ten-pair comparisons use the same compiled server and verify 2000 Task
responses plus 1000 uploads per batch-size cell, with both load boundaries.

| Condition | Task p50 baseline median [range] ms | With condition median [range] ms | Paired difference median [range] ms |
| --- | --- | --- | --- |
| Permanent failed expiry, 5 AB/BA pairs | 0.7151 [0.7023, 1.4809] | 0.7185 [0.6517, 1.0561] | -0.0634 [-0.4247, 0.0634] |
| 16-event ingestion, 10 AB/BA pairs | 0.3021 [0.2755, 0.4119] | 0.3074 [0.3015, 0.3754] | 0.0075 [-0.0365, 0.0424] |
| 128-event ingestion, 10 AB/BA pairs | 0.2954 [0.2894, 0.4289] | 0.3287 [0.3177, 0.3888] | 0.0318 [-0.0401, 0.0485] |

All differences are inside pair-to-pair variation and are inconclusive. No Task
cost from the failed expiry was distinguishable here, which is not a zero-cost
or general starvation claim. The actual permanent unlink failure was a scratch
segment replaced with a directory in the same process/event loop as the real
server. Across ten 6.5-second cells, 2765 verified 15-Task responses succeeded
and exactly two failed automatic attempts were counted. Driver CPU stayed below
2.6 percent of a core. Boundary one-minute load ranged 1.77 to 2.63. The p99
round medians were 7.1218 [3.8420, 7.5563] ms baseline and
6.7974 [3.7940, 7.4338] with the fault. Paired p50 differences were
[-0.424750, -0.070249, 0.063375, -0.063416, 0.000208] ms.

Ingestion handler p50 including async persistence was 0.6215 [0.604, 0.665] ms
for 16 events and 1.3585 [1.290, 1.414] for 128. Boundary loads were 2.56 and
2.76. Every pair, raw duration, load boundary and loss status is retained in
recordings-correction/ingestion-16, ingestion-128 and expiry-cost-2. The final
server executable is byte-identical before and after the CLI-only preflight
change; server-cli-delta.diff is empty. The measurement finished before the
later CLI red control. A quiet-machine confirmation under the unchanged ceiling
is owed at integration. No imposed CPU pressure, native app or owner input was
used.

### Correction commands and receipts

Evidence root: docs/evidence/ui-speed/recordings-correction, local and ignored.
In the table, E is "$PWD/docs/evidence/ui-speed/recordings-correction", C is
"$PWD/.scratch/bin", and P is ".agents/skills/verify-ui-profiler/scripts".
The executable source is 39d9ad40ffa1de56c924395b9301e3b071a8e0d9. Cache manifest
source hash is 6c76ad6b3ad27e9fddbde3120a5c56c4359cd1895e3c8126b0e994471b7bf6de.
The later report commit changes no executable source.

| Command | Real exit | Receipt |
| --- | ---: | --- |
| pnpm --filter @todo/domain test diagnostic-recording-corrections.test.ts before fixes | 1 | red-core: no conflict refusal, 1 vs 60000 ms, 3 vs at-most-2 manifests |
| bun "$P/corrections.ts" "$E/red-compiled" | 1 | HTTP/CLI reason and hidden-completion witnesses |
| Focused pending, pure, action-phase and whole-import controls before their fixes | 1 each | red-pending-ack, red-pure, red-action-phase, red-import-preflight |
| pnpm --filter @todo/domain test diagnostic-recording-corrections.test.ts | 0 | green-core-8, nine controls |
| pnpm typecheck; bun --bun node_modules/typescript/bin/tsc --noEmit -p .agents/skills/verify-ui-profiler/tsconfig.json | 0 each | types-2, harness-types-3 |
| bun packages/api/scripts/openapi.ts --check | 0 | contract.exit; same cf817545… id |
| bun "$P/corrections.ts" "$E/compiled-final" | 0 | compiled-corrections.exit |
| TODO_PROFILER_STRESS=1 bun "$P/verify.ts" "$E/producer" | 0 | producer.exit, 700 admitted, 585 retained segments, 7370 capacity events, zero storage failures |
| TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh "$E/diagnostics" | 0 | diagnostics.exit; PNG remains HOLD |
| TODO_SERVER_BINARY="$C/todo-server" TODO_SEED_BINARY="$C/seed" .agents/skills/verify-server-api/scripts/verify.sh "$E/server-api" | 0 | server-api.exit |
| TODO_CLI_BINARY="$C/todo" .agents/skills/verify-cli/scripts/verify.sh "$E/cli" | 0 | cli.exit |
| bun build --compile apps/server/scripts/diagnostic-fault-cli.ts --outfile "$C/diagnostic-fault-cli"; bun build --compile apps/server/scripts/verify-diagnostic-faults.ts --outfile "$C/verify-diagnostic-faults"; "$C/verify-diagnostic-faults" "$E/faults" | 0 each | faults.exit; all 47 cases |
| bun build --compile "$P/expiry-server.ts" --outfile "$C/expiry-fault-server"; bun "$P/expiry-cost.ts" "$E/expiry-cost-2" | 0 each | expiry-build-2, expiry-cost-2 |
| TODO_PROFILER_PAIRS=10 bun "$P/benchmark.ts" "$E/ingestion-16"; TODO_PROFILER_PAIRS=10 TODO_PROFILER_EVENTS=128 bun "$P/benchmark.ts" "$E/ingestion-128" | 0 each | ingestion-16, ingestion-128 |
| /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check, disk guard first | 1, then 0 unchanged | root.log/.exit, root-retry.log/.exit |

The first expiry-cost setup exited 1 before measuring because its test-only flag
reached the real server argument parser. The wrapper now consumes that flag and
requires the fixture's scratch database/HOME before loading the server. The
successful run is separate. One development test edit had a missing closing
brace, and the first helper typecheck needed explicit inference annotations;
those setup failures are retained, not attributed to product behavior. The
quota test now uses a distinct event for its second segment, preserving all
original byte/eviction assertions after identical events became no-ops.

The first correction root run exited 1 on the existing auth-history fixture,
"records one selected-Profile rejection for expired http show". The expected
expired detail was invalid_credential after live cleanup removed the credential;
its Unauthorized status and single rejection were correct. Boundary load rose
from 3.01 to 5.42. The focused unchanged auth-history control passed all 12 tests
with exit 0, and the compiled verify-cli recipe passed all 80 tests with exit 0.
The exact root command is repeated without changing an assertion, timeout,
worker cap or tracked recipe. Both root logs and boundary loads are retained.

The unchanged root retry exited 0. It passed 441 domain, 38 server, 168 Electron
and 80 CLI tests, with the same one existing Electron skip; type checks, lint
and contract checks passed. The guard ran first with 51.7 GB free, above the
30 GB soft floor. Retry boundary load was 3.55 to 4.28. No other measurement or
compiled recipe from this worker ran during either root check. No assertion,
timeout, worker cap, standing recipe or business-code pin was weakened.

The source-delta proof for formal inputs exits 0, so neither formal command nor
pin renewal was required for this correction. The seat's unchanged-input
formal passes at d1541167 remain the evidence; this report does not claim a new
formal execution. Full Task/JSON goldens and existing client/server mismatch
behavior remain unchanged and pass the root/CLI recipes.

The compiled verification entry also refuses a missing scratch database before
loading main: actual exit 1, no files in its new scratch HOME. The initial shell
cleanup request was rejected before execution for rm -rf syntax. Cleanup then
used only its newly created directory with an explicit prefix check, and closed
Bun temporaries in this worktree after lsof checks. It removed 19 closed files,
1,684,578,304 allocated bytes, with zero open-file skips. Receipt cleanup.json
and cleanup.exit are retained. The last disk guard reported 50.8 GB free.
Owned servers and scratch data were removed by their recipes. No other unit's
files or processes were touched.

CLI SHA-256: 6da82544e5c7d1631ad1dc7765457d4b46d647505d129d1c68f3a7297abe2959.
Server SHA-256: c3e1eda775875675c3daf8bd825b2c659a8029be4f7e2f62bb0aca95b9765009.

Expiry verification entry SHA-256: 3f5cd7b66d390f24f38158cbcf1fcf4382f7980371d92f5561f39c9a9cb5d9e0.

All four requested findings have executable red/green controls and are ready for
the seat's re-check. No independent correction verdict is claimed here. Native
client integration, held PNG rendering, fresh Claude discovery, quiet-machine
confirmation, hardware power-loss durability and allocation accounting remain
as stated in the original delivery; none was performed or claimed by this fix.

## C1 and C2 correction of 3cf1e3b0

C1 uses whole-batch refusal. A conflicting submission admits no events and leaves
a content-free mark on its run before HTTP acknowledges the refusal. Its response
says "Whole batch refused; no events were admitted", names the safe conflict
class and instructs the producer to retry the non-conflicting events unchanged
with a new batch id. A retry containing the valid slow start/result succeeds.
The mark remains because a successful subset retry cannot establish that all
omitted facts arrived.

The version-1 `run.admission` object declares policy `whole_batch`,
`refused_batches`, `unadmitted_events` and `incomplete`. Counts describe refused
submission attempts, not invented missing actions. Null means unknown, including
arithmetic overflow. The accepted 8 ms action still has one known start after a
three-event refusal, but both all-start deadline fractions become null and its
evidence becomes incomplete. Retrying the omitted 10000 ms action gives two
known starts and p99 10000 ms; neither fraction becomes 1. An unrelated clean run
keeps its fraction 1. Comparing marked and clean runs returns HTTP 400 / CLI
exit 2 with "Recording comparison refused: a run is incomplete because admission
facts are missing."

Each opaque run's mark is stored outside todo.db in a 0600 file in the existing
0700 private directory. Atomic writes use the same recording writer queue.
Markers survive restart, segment rotation and complete data eviction, and remain
listable/exportable without events. An empty marked batch is explicitly valid.
Import preserves the mark, including JSON/NDJSON and no-write dry run. Applying
snapshots merges counts by maximum rather than adding the same exported refusal
on every page. This is a lower bound across imports. Unknown stays unknown; a
zero, older or identical snapshot cannot clear uncertainty. Marks expire only
when more than seven days old and no retained or pending data for their run remains.

Marks have a 2048-byte encoded bound, one filesystem-block charge each and an
atomic replacement allowance in the existing per-app and total quotas.
`status.admission_bytes` reports that charge; `status.bytes` keeps its existing
segment meaning. At most 5120 identities are retained across data, pending work
and marks. At capacity a new run is refused and its producer retains the batch;
an older run's mark is never forgotten to make room. Repeated refusals coalesce
to one metadata job per run. The 1000-refusal control observes one queued job and
counts 1000 refused submissions and 1000 unadmitted events. There is no retry loop
on metadata I/O failure. Shutdown makes one bounded persistence attempt per
remaining dirty mark after draining work, while rejecting new admissions.

If storage cannot persist the mark, HTTP returns 500 rather than a definitive
400 or successful admission acknowledgement. The CLI exits 1, runtime failure,
with the exact allowlisted instruction to keep the entire batch and retry when
storage is available. It never echoes arbitrary server errors. The compiled
unwritable-directory control observes that response and exactly one successful
Task through the normal Task path. The server preservation control also checks
exactly one TaskCreated entry. The recovery unit
control restores storage, shuts down, reopens and finds the mark and null fraction.
Unreadable private metadata refuses summary queries instead of publishing a
complete-looking empty run. The server preservation control now asserts that
literal safe BadRequest while retaining all Task-body, count and History checks.
Loss counters for failed opens remain covered by the domain controls.

C2 partitions mixed-run input and scopes every key by run. Action, latest-clock,
crash, sequence and phase keys include run identity and producer. Analysis merges
only aggregate diagnostic counts and concatenates separate run rows. Uncertainty
applies to affected rows only. The shared-identity control gives independent
8 ms and 400 ms rows, with fractions 1/1 and 0/0, rather than one 8 ms row.
Pending ages remain 0 and 499 ms; a crash or clock reversal in one run cannot
alter the other's outcomes or deadline fraction.

| Exported input path | Mixed-run rule and control |
| --- | --- |
| recordingEventKey, uniqueRecordingEvents | Run/producer/sequence key; action phase keys also include run. Identical facts are idempotent; contradictory content refuses. |
| recordingObservations | Run/producer/action state; per-run clock validity and per-producer ages/crashes. Two rendered observations survive. |
| recordingClockDiscontinuities, recordingSequenceGaps | Run/producer keys; independent sequence restarts do not create false gaps or reversed clocks. |
| analyzeRecording, summarizeRecording | Partition by run; return separate rows and accept a run-keyed admission map for external refusal uncertainty. |
| summarizeInteractions | Its existing grouping already includes run; mixed observations keep two rows. |
| validateRecordingBatch | Explicitly one run per batch; mixed-run events refuse at the boundary. |
| CLI import | Full-file uniqueness preflight already used run keys. Mutable admission state is excluded from immutable run identity; two runs sharing action/sequence ids import and show 8/400 ms separately. |
| HTTP/CLI compare | Single-run show calls remain isolated; marked run descriptors refuse complete comparison before any conditions are scored. |

The consumer search covers apps/cli, apps/electron and apps/macos TypeScript,
TSX and Swift source for all exported event reducers. Only CLI import directly
uses uniqueRecordingEvents in this checkout. No native consumer was exercised.
Raw events cannot contain a server-side refusal that was never admitted. Future
Electron/Mac local export reducers must preserve run.admission and pass its map
to analyzeRecording/summarizeRecording, or use the server's masked summaries.
This client integration is owed, not claimed by the shared reducer tests.

### Contract and red evidence

The new declared mark and charged metadata field change the contract from
`cf81754585ee1525358bfe8a3357ff83a2024f8a350fe7a6d493afc9c61f7668` to
`55c6d138cc924128593b25ef0313d898a6725bd0c0d91e026d09ad24536f28c8`.
The generator updates every TypeScript pin and OpenAPI/Swift sources. Existing
keys, their meanings, Task/JSON goldens and mismatch behavior remain unchanged.
`./scripts/swift-slot.sh apps/macos/scripts/generate-api.sh` exited 0. It was the
only Swift operation. A redundant second queued pass was canceled before taking
the slot or starting Swift, exit 143; the successful first output and subsequent
contract checks prove generation is current. No other unit's holder was stopped.
Native compilation, app recording/UI behavior and client adoption remain owed.

Evidence is local and ignored under docs/evidence/ui-speed/recordings-completeness.
E below is its absolute path, C is "$PWD/.scratch/bin", P is
".agents/skills/verify-ui-profiler/scripts". Seat sources are byte-identical
copies at .scratch/recordings-correction-s1; cmp exits 0 and source hashes are in
witness-sources.sha256. Both unchanged witnesses ran red before production edits.
The compiled identity witness exited 1 with C1/C2 failures, and the real HTTP
witness exited 1 with perfect fractions after refusal and restart. Own focused
admission and mixed-run tests also exited 1 before fixes.

After the fix, the unchanged real HTTP witness exits 0 and preserves uncertainty
across restart. The unchanged identity process still exits 1, with exactly two
old narrow assertions expecting fraction 0 rather than null. Its C1 and C2 class
cases and the other nine cases pass. The raw process failure is retained as
witness-identity-release.exit/json, not relabeled green. The production regression
tests and compiled CLI controls assert the new null-fraction policy literally.

The first two full domain runs exited 1 at "releases writer ownership after a
process crash" while its isolated 20-test file passed. A new forced-GC child
control proves why. Both children are alive, but an empty timer allows the store
and SQLite lease to be collected; the contender then opens with zero failures.
Capturing the store in the timer retains the lease and the contender records one
failure. The crash fixture now captures its store until killed. Production lease
logic and the ownership assertions did not change. The full domain suite then
passes all 447 tests. The first server run also exposed the old expectation of
an available runs body after a failed metadata open. That now safely refuses;
the updated test asserts the exact refusal. One intermediate test edit expected
the CLI-style code instead of the typed HTTP BadRequest tag; its setup failure
is retained in server-last, and the corrected expectation retains the error
shape already used by this endpoint.

### Current commands and receipts

The executable implementation is committed through f963bbeed176e433f16dc584bdf8fa07bbc17d3c.
Subsequent commits correct the two verification fixtures described above.
Frozen cache head is cfd962499c9f2822013969f85263a97540369b26, source hash
97338f951d4d510089c87a84343002a2da3fc6ec72207a9b57441fd5a1018e61.
product-source-unchanged exits 0 for all domain, CLI and server production source
between those heads, so the earlier compiled release controls use the same
implementation. Each cache source hash was compiled once. Later report-only
changes do not affect executable inputs.

| Command | Real exit | Receipt under E |
| --- | ---: | --- |
| bun build --compile .scratch/recordings-correction-s1/identity.ts --outfile "$C/recordings-identity-class" | 0 before and after | witness-build, witness-build-release |
| HOME="$PWD/.scratch/recordings-correction-s1/home" "$C/recordings-identity-class" | 1 before; 1 after with the two superseded zero-fraction assertions only | red-identity, witness-identity-release |
| HOME="$PWD/.scratch/recordings-correction-s1/home" TMPDIR="$PWD/.scratch/recordings-correction-s1/tmp/" bun .scratch/recordings-correction-s1/refusal-http.ts | 1 before; 0 after | red-http, witness-http-release |
| pnpm --filter @todo/domain test recording-admission.test.ts recording-run-isolation.test.ts | 0, six literal controls | complete-unit-final |
| Focused admission and mixed-run controls before fixes | 1 each | red-admission, red-reducers |
| Recovered-storage shutdown control before fix | 1 | red-shutdown, lost mark after restart |
| bun "$P/admission-fault.ts" "$E/fault-green" | 1 before; 0 after | red-fault, fault-green; 500, CLI 1, Task count 1 |
| bun "$P/lease-liveness.ts" | 0 | lease-liveness, two live children with contender failures 0 and 1 |
| pnpm --filter @todo/domain test | 1, 1 before lifetime correction; 0 after | domain-release, domain-retry, domain-last; 447 tests |
| pnpm --filter @todo/domain test diagnostic-recording-store.test.ts | 0 | lease-control, 20 tests |
| pnpm --filter @todo/server test | 1 for superseded query expectation; 1 for wrong test tag; 0 after | server-release, server-last, server-final; 38 tests |
| pnpm typecheck | 0 | types-release |
| bun --bun node_modules/typescript/bin/tsc --noEmit -p .agents/skills/verify-ui-profiler/tsconfig.json | 0 | harness-types-last |
| ./scripts/swift-slot.sh apps/macos/scripts/generate-api.sh | 0; redundant queued pass canceled, 143 | generate-api, generate-api-final |
| bun packages/api/scripts/openapi.ts --check | 0 | contract-release; new 55c6d138… id |
| bun apps/server/scripts/scratch-diagnostics.ts build | 0 | build-measured; matching cache above |
| bun "$P/completeness.ts" "$E/compiled-release" | 0 | completeness-release; transfer, eviction, 8/400 ms CLI isolation |
| bun "$P/corrections.ts" "$E/corrections-release" | 0 | corrections-release |
| TODO_PROFILER_STRESS=1 bun "$P/verify.ts" "$E/producer-stress-release" | 0 | producer-stress-release; 700 accepted, 585 retained segments, 7370 capacity events, zero storage failures |
| TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh "$E/diagnostics-release" | 0 | diagnostics-release; terminal PNG HOLD |
| TODO_SERVER_BINARY="$C/todo-server" TODO_SEED_BINARY="$C/seed" .agents/skills/verify-server-api/scripts/verify.sh "$E/api-release" | 0 | api-release |
| .agents/skills/verify-auth/scripts/verify.sh "$E/auth-release" | 0 | auth-release |
| TODO_CLI_BINARY="$C/todo" .agents/skills/verify-cli/scripts/verify.sh "$E/cli-release" | 0 | cli-release; 80 tests |
| bun build --compile apps/server/scripts/diagnostic-fault-cli.ts --outfile "$C/diagnostic-fault-cli"; bun build --compile apps/server/scripts/verify-diagnostic-faults.ts --outfile "$C/verify-diagnostic-faults"; "$C/verify-diagnostic-faults" "$E/faults-release" | 0 each | fault-cli-build-release, fault-driver-build-release, faults-release; 47 cases |
| bun apps/server/scripts/verify-diagnostic-payload-budget.ts "$E/payload-release" | 0 | payload-release; 10000 requests, 200 clients, 306 operations through three clients |
| TODO_PROFILER_PAIRS=10 bun "$P/benchmark.ts" "$E/ingestion-16"; TODO_PROFILER_PAIRS=10 TODO_PROFILER_EVENTS=128 bun "$P/benchmark.ts" "$E/ingestion-128" | 0 each | ingestion-16, ingestion-128 |
| bun build --compile "$P/expiry-server.ts" --outfile "$C/expiry-fault-server"; bun "$P/expiry-cost.ts" "$E/expiry-cost" | 0 each | expiry-build-release, expiry-cost |

The no-Swift recipe's terminal PNG render is owed by a unit holding the Swift
slot. The payload control keeps both limits, 49152 and 65536 pretty JSON bytes,
and uses the default spawnSync buffer. The 700-batch recording stress holds
33550336 allocated bytes, with data at 33546240 bytes and no storage failures.
The completeness control independently verifies marked-run eviction and metadata
charges. The new admission fields reject title, Profile id/name, path, search
text and token injection before storage, with no private value echoed.

No Task store, projection or formal
mapping changed; formal-input-delta exits 0 for both mapped source files. Neither
formal command was rerun and no pin was renewed. The seat's prior formal passes
remain historical evidence. No real Profile/database, native app, Keychain,
installation, push, timeout, worker cap or tracked measurement ceiling changed.

### Correction cost

No Task request receives another span, synchronous filesystem operation or
dependency on the recording queue. The Task store, projection and Task route
code are unchanged. Ingestion still performs bounded JSON/schema validation,
identity hashing and admission on the shared event loop, at most 128 events and
131072 encoded bytes. New run bookkeeping is bounded by 5120 identities. Disk
I/O is asynchronous on the private queue; the ingest response waits for its
durability, while Task writes do not await it. A refusal adds one small atomic
metadata write and status update, coalesced for that run, outside the Task path.
This does not make synchronous ingestion work free or remove shared CPU/I/O
contention. JavaScript allocation counts were not measured.

The same compiled server serves 15 literal Tasks in both modes. Each size uses
ten alternating AB/BA pairs of 100 reads per cell, with one concurrent upload per
enabled read. There are 2000 successful reads and 1000 accepted ingestions per
size. The 16-event case actually sends 9892300 bytes; the 128-event case sends
74869100. Both end with zero storage failures. raw.json retains every latency,
handler interval, accepted count, byte count, driver CPU, server CPU/RSS and load
at the start and end of each run. No failure or warmup pair was omitted.

| Concurrent batch | Baseline p50 median [range], ms | Enabled p50 median [range], ms | Paired difference median [range], ms | Ingest handler p50 median [range], ms | Boundary one-minute load |
| --- | --- | --- | --- | --- | --- |
| 16 events | 0.2984 [0.2785, 0.4639] | 0.3181 [0.3076, 0.3920] | +0.0199 [-0.0720, +0.0557] | 0.7085 [0.6820, 0.7820] | 3.35 to 3.40 |
| 128 events | 0.3064 [0.2875, 0.4995] | 0.3613 [0.3255, 0.4615] | +0.0464 [-0.0706, +0.1399] | 1.4495 [1.3570, 1.8660] | 3.37 to 3.40 |

| Pair | 16-event paired p50 difference, ms | 128-event paired p50 difference, ms |
| --- | ---: | ---: |
| 1 | -0.0720 | -0.0706 |
| 2 | +0.0557 | +0.0496 |
| 3 | +0.0263 | +0.0432 |
| 4 | +0.0027 | +0.0660 |
| 5 | +0.0157 | +0.0641 |
| 6 | +0.0196 | +0.0201 |
| 7 | +0.0202 | +0.0323 |
| 8 | +0.0142 | +0.0302 |
| 9 | +0.0267 | +0.0597 |
| 10 | +0.0291 | +0.1399 |

Both comparisons are inconclusive within pair variation, not proof of no
overhead. The generator used 173.5 and 277.4 CPU ms across the corresponding
cells, with outputs checked throughout. No bottleneck profile was taken for this
correction, so these end-to-end observations cannot identify a limiting stage or
support a speedup claim. They measure ingestion contention, not app capture or
physical rendering. The tracked quiet-host ceiling is unchanged. A quiet-machine
confirmation under the unchanged ceiling is owed at integration.

The permanent real unlink-failure control also passes five alternating pairs,
6.5 seconds per cell, with two actual failures counted, a single retained segment
and 2887 successful literal Task reads. Baseline p50 median is 0.7181 ms, range
0.5538 to 0.7885; failed-expiry median is 0.6082 ms, range 0.5409 to 0.7126.
Paired differences are +0.0121, -0.1772, +0.0544, -0.2205 and -0.0329 ms,
median -0.0329 and range -0.2205 to +0.0544. This is also inconclusive. Its
raw.json retains both load boundaries per cell. The fake-clock regression keeps
the literal 59999/60000 ms minimum-backoff checks.

### Final gate and cleanup

The exact standing-order-27 command,
`/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`, exits 0 on the first
current root run. The disk guard ran first with 44.1 GB free. Type checks,
contract validation and lint pass, followed by 447 domain, 80 CLI, 38 server and
168 Electron tests with one existing Electron skip. Lint reports warnings and
informational findings without an error. Root boundary load is 2.31 to 4.07.
Receipts are root.log, root.exit, disk-root and root-load-start/end. No other
measurement or compiled recipe from this worker ran during the check.

The final same-source compiled replay also exits 0 for each of completeness.ts,
admission-fault.ts, the no-Swift Diagnostics recipe and verify-server-api.
Receipts are completeness-frozen, fault-frozen, diagnostics-frozen and api-frozen
with their .exit files and result.json. They use the frozen source-hash cache
above. API generation is current; only documentation changes follow these gates.

New domain modules and their jobs are recording-admission.ts for the versioned
mark and pure admission policy, store/recording-admissions.ts for bounded private
run-state persistence, store/recording-files.ts for the existing atomic files and
writer lease, and store/recording-queries.ts for run reads/export/comparison.
The writer queue remains in store/diagnostic-recordings.ts. Its one added comment
explains why the coordinated budget/queue module crosses the structure skill's
600-line review threshold. No suppression was added. The brief's single-worker
restriction precludes the no-comments skill's child reviewer; the comment diff
was checked directly, without claiming an independent comment review.

Cleanup checks lsof before removing only this worktree's closed Bun compile
temporaries. It removes 27 files, 2393874432 allocated bytes, with zero open-file
skips. cleanup.json, cleanup.log and cleanup.exit preserve the paths, sizes and
real exit 0. The last disk guard exits 0 with 42.7 GB free, above the 30 GB soft
floor. All owned recipe servers and scratch databases were stopped/removed by
their helpers; no other unit's files or processes were touched.

Final CLI SHA-256: b91fa40478d1c482429134bfacbde3bf77aba0f209db9c542683d1a5b0886cbe.
Final server SHA-256: 8833af1c39a2c14446ecbbf704f0b227c5ce1717731c5073b3f2d4ad788f6b45.
Both C1/C2 corrections are ready for the seat's re-check. No independent verdict
is claimed. Client adoption, native compilation/UI proof, terminal PNG rendering,
fresh Claude discovery, quiet-machine confirmation, hardware power-loss proof
and allocation accounting remain unproven as stated above.

## C3 and C4 durability correction of 241306a2

C2 remains resolved. C1's null fractions are correct; the seat's corrected
13-case identity witness is now the preservation control. The new failures are
the ordering and recovery of a qualifying mark and its data, and idempotent
expiry of a mark that never reached disk. Both unchanged compiled seat witnesses
exit 1 before this correction. The import witness commits a data segment, returns
500 again on exact retry after repair, then exposes clean fractions after SIGKILL.
The expiry witness records ENOENT on three list queries and the fresh-run show.
Receipts are retained under docs/evidence/ui-speed/recordings-durability.

### Joint file lifecycle specification

Data and its qualifying mark now share one atomic segment publication: the
stored batch keeps the versioned run.admission snapshot. A separate checkpoint
is still required for a refusal that admits no data, subsequent refusal counts,
and uncertainty that must outlive segment eviction. One queue job writes the
checkpoint first, checks that it is current, then writes the self-describing
segment. A failed checkpoint cannot publish data. A failed data write may leave
an incomplete, empty run, but no newly admitted events. Such a mark is not a
successful batch acknowledgement. Explicit retries of dirty metadata schedule
bounded work even if the incoming metadata is unchanged or its events duplicate
retained events. There is no autonomous retry loop.

This avoids replacing a run's entire retained history on every upload. Only
marked segments gain a copy of their small allowlisted admission object; clean
segments keep their existing encoding. Missing checkpoints can be reconstructed
from those segment snapshots before reads become available. A corrupt published
checkpoint fails closed; an uncommitted temporary is discarded. Atomic rename
and file sync establish process-crash publication points. These tests do not
claim hardware power-loss durability. Pre-fix segments that already lost all
evidence of a mark cannot reveal facts that are no longer present; no recovery
of that historical damage is claimed.

In the table, data means newly submitted events, checkpoint means the per-run
admission file, and marked means incomplete with null all-start fractions.
Readers serialize behind pending writer work. File-state construction tests
cover all three data states crossed with all four checkpoint states, then run
export, eviction and expiry on the healthy states. Compiled producer and CLI
import controls exercise every named publication point with the same genuine
export from a refused run.

| Lifecycle step / failure | Data file | Checkpoint | Reader / export result | Explicit retry | Control |
| --- | --- | --- | --- | --- | --- |
| Clean run admission | Existing clean encoding | None required | Ordinary observed summaries | Stored duplicate, no new events | Existing producer recipe |
| Before marked admission starts | Absent | Absent | Absent after crash | Write checkpoint then data | before_mark, both surfaces |
| Checkpoint write fails | Absent | Dirty in memory, absent on disk | Live marked empty run; 500 requires retaining entire batch; absent after a crash before persistence | Retry dirty checkpoint, then data | fail_mark, C3 witness, literal import unit |
| Crash with partial checkpoint temporary | Absent | Uncommitted partial temporary | Temporary removed on startup; run absent | Fresh ordered publication | mark_temp, both surfaces |
| Checkpoint durable, before data | Absent | Durable marked descriptor | Marked empty run; zero-event export | Publish data once | after_mark, both surfaces |
| Data write fails | Absent | Durable mark, including counted failed submission | Marked empty run; no accepted events | Publish data once | fail_data, both surfaces |
| Crash with partial data temporary | Partial temporary | Durable | Temporary removed; marked empty run | Publish data once | data_temp, both surfaces |
| Data rename complete, before acknowledgement | Committed with mark snapshot | Durable | Marked 8 ms action; null fractions | Idempotent stored duplicate | after_data, both surfaces |
| Crash after acknowledgement | Committed with mark snapshot | Durable | Same marked action after restart | Idempotent stored duplicate | after_ack, both surfaces |
| Duplicate retry with a dirty later refusal | Old committed data retained | Dirty newer mark | Marked, never a complete comparison | Requeue mark once without duplicating data | Dirty-duplicate unit |
| Checkpoint absent or partial temporary, qualified data retained | Committed with mark snapshot | Reconstructed and persisted at startup | Marked data; export preserves snapshot; repair failure withholds reads | Retry persistence after repair | File-state cross product |
| Data absent or partial temporary, checkpoint retained | Absent after temporary cleanup | Durable | Marked empty run, zero-event export | Original data can be retried | File-state cross product |
| Both files absent or only uncommitted temporaries | Absent after cleanup | Absent after cleanup | Run absent; no fabricated clean summary | Fresh publication | File-state cross product |
| Published checkpoint corrupt | Any of the three data states | Invalid | Metadata queries/export refused, never a perfect result | Repair private metadata, reopen | Three corrupt-final cases |
| Evict last retained data | Removed | Retained, charged and exportable | Marked empty run | Re-admit original facts without clearing mark | Healthy file-state cases and existing completeness recipe |
| Expire inactive durable checkpoint | No data/pending references | Removed | Run absent; charge released | New admission follows ordinary policy | File-state day-8 cases |
| Expire inactive checkpoint that never existed | Absent | Already absent | Success, state and charge released; fresh run stays readable | No repeated ENOENT | C4 witness and literal expiry unit |
| Other unlink error | Unchanged | Retained in state | Counted failure, no false successful cleanup | Automatic retry after at least 60000 ms | Existing literal backoff and real expiry recipes |
| New refusal arrives during old unlink | Unchanged | New state retained dirty | New counts survive | Persist newer state | Refusal/unlink race unit |
| New qualifying data arrives during old unlink | Pending | State retained dirty after fresh active-reference check | No clean publication | Data job first restores checkpoint | Active/unlink race unit |
| Later refusal fails after this batch's data commit | Committed with this batch's qualifier | This batch's durable mark retained; later update dirty | First request succeeds with its durable qualifier; later request gets 500 and retains its own facts | Later refusal retries independently | Acknowledgement race unit and four-case compiled concurrency drive |
| Pending exact duplicate shares a failed data write | Absent | Failed-submission mark retained | Neither receipt acknowledges stored events | Exact retry commits one action | Pending-duplicate unit and compiled concurrency drive |

Expiry treats only ENOENT as successful removal. It checks both the state
version and current retained/pending references after asynchronous unlink. A
new refusal cannot be deleted with its predecessor, and a new data job cannot
inherit a forgotten mark. Other errors retain their counters and minimum
one-minute backoff. The byte, run, queue, event and age caps remain in force.

### C3/C4 implementation cost

The qualifier is copied into the same atomic segment as its data. The genuine
export adds 116 encoded bytes per marked segment; maximum safe counters add
146. With the existing wrapper bound this is 210 bytes, below the unchanged
256-byte recovery allowance. Filesystem rounding remains charged to the same
32 MiB/app and 256 MiB total caps. Clean segments keep the old encoding.
encoding-cost.json and encoding-cost.exit retain the actual calculation, exit 0.
This does not duplicate an event list or rewrite a run's entire retained history.

There is at most one additional durable admission snapshot per marked run, under
the same 5120 identity bound. Weak receipt identity flags retain neither completed
requests nor event payloads. Heap bytes and allocation counts were not measured.
No synchronous filesystem work, recording wait or new span was added to Task
handlers. Upload parsing, hashing and bounded metadata work still share the
event loop; private I/O remains asynchronous and can contend with other work.

Ten alternating AB/BA pairs per size use one compiled server, 15 literal Tasks,
100 reads/cell and one concurrent marked upload per enabled read. Each size
checks 2000 reads and 1000 accepted uploads. Actual uploaded bytes are 10008300
and 74985100. Both end with zero storage failures and 40960 charged checkpoint
bytes. The 16-event run retains 1000 segments and 12288000 data bytes. The
128-event run retains 430 segments and 33464320 data bytes, with 72960 explicitly
counted capacity-evicted events. No warmup pair or failure was dropped.

| Concurrent upload | Baseline p50 median [range], ms | Enabled p50 median [range], ms | Paired difference median [range], ms | Ingest handler p50 median [range], ms | Boundary one-minute load |
| --- | --- | --- | --- | --- | --- |
| 16 marked events | 0.2970 [0.2672, 0.3897] | 0.3049 [0.2943, 0.3609] | 0.0083 [-0.0288, 0.0321] | 0.6455 [0.6360, 0.7020] | 3.85 to 3.92 |
| 128 marked events | 0.3142 [0.3068, 0.4684] | 0.3159 [0.3070, 0.3974] | -0.0008 [-0.0710, 0.0180] | 1.3945 [1.3010, 1.4510] | 3.85 to 3.85 |

| Pair | 16-event paired p50 difference, ms | 128-event paired p50 difference, ms |
| --- | ---: | ---: |
| 1 | -0.0288 | -0.0710 |
| 2 | 0.0194 | 0.0180 |
| 3 | 0.0018 | 0.0120 |
| 4 | 0.0157 | 0.0128 |
| 5 | -0.0027 | -0.0016 |
| 6 | 0.0177 | 0.0001 |
| 7 | 0.0148 | 0.0019 |
| 8 | -0.0002 | -0.0062 |
| 9 | -0.0002 | -0.0083 |
| 10 | 0.0321 | -0.0021 |

Both differences are inconclusive within pair variation, not proof of no
overhead. Driver CPU across all cells is 154.1 and 241.0 ms respectively;
raw.json retains every latency, both load boundaries of every run, bytes,
accepted counts, server CPU/RSS and status. No limiting-stage profile was taken,
so these observations cannot identify a bottleneck or support a speedup claim.
The tracked quiet-host ceiling is unchanged. A quiet-machine confirmation under
the unchanged ceiling is owed at integration.

The separate permanent real unlink-failure drive exits 0 with 2861 checked
Task reads and exactly two counted failures across five alternating pairs,
6.5 seconds per cell. Baseline p50 median [range] is 0.5648 [0.4228, 0.7749] ms;
failed-expiry is 0.8332 [0.8077, 0.9579] ms. Paired differences are
0.1738, 0.5130, 0.2429, 0.4104, 0.0411 ms, median
0.2429 and range [0.0411, 0.5130] ms. This comparison is
also inconclusive within pair variation. Raw samples and load boundaries remain
in expiry-cost/raw.json. The literal 59999/60000 ms unit controls remain green.



### C3/C4 contract, controls and receipts

The contract does not change. Before and after this correction it is
`55c6d138cc924128593b25ef0313d898a6725bd0c0d91e026d09ad24536f28c8`.
The canonical contract check exits 0, and a literal identity assertion exits 0.
No API schema, TypeScript pin, Swift source, existing JSON key or golden changes.
No Swift command was run. Task store/projection, shared event/reducer/identity
sources and the event index are byte-identical to 241306a2, as are the API,
generated client and CLI golden inputs. preserved-inputs exits 0. No formal pin
was renewed and neither formal command was rerun for these unchanged mappings.

The executable implementation is cdbf77268c0c749c482cc2a14a605a62ab01016a. The
following commit c674e6ddd9cca3cf88b9b2482deecde27dda1092 only sorts two test
imports. Its cache source hash is
46826df140affbb7fb91e806a8b6f895fe8012b8d11442221f5d4f5c55be6a05.
Recompiling that hash produces byte-identical CLI, server and seed binaries;
binaries-identical exits 0. This preserves the compiled and measurement receipts
at the final implementation. Later report/feature-map changes affect no runtime
input. Each source hash was compiled once.

The unchanged C3/C4 probes are copied into .scratch/recordings-correction2-s1.
Their cmp receipts and the seat's corrected identity source match, all exit 0;
seat-sources.sha256 records the copies. C3 and C4 each exit 1 before the fix and
0 after it. C3 now reports an empty initial summary and zero data bytes, then
HTTP 200 on exact retry and an incomplete run after SIGKILL/restart. Its raw
`stored_segments_after_500` counter is 1 because its loose digit-prefix filter
also counts the deliberately created numeric-UUID blocking directory. The red
counter was 2 for one data file plus that blocker. Neither probe was edited.
The precise 13-digit timestamp/file-extension checks in our literal and compiled
controls assert zero committed data files on the failed admission. C4's three
list queries and fresh-run show succeed; its expired state and 4096-byte charge
are gone. The corrected 13-case identity witness passes without the obsolete
zero-versus-null expectations.

The initial three literal regressions fail before the fix. The two unlink-race
controls fail before their repairs. Two additional receipt regressions fail on
committed cdbf7726's predecessor: a later failed refusal incorrectly invalidates
a committed receipt, and a pending exact duplicate incorrectly acknowledges its
failed shared data write. The final 19-case durability file passes, as do all
51 adjacent admission, correction and store controls. Four real HTTP/compiled
CLI controls reproduce those concurrent request timings and pass. A helper
TypeScript setup error declared a union of Promises rather than a Promise of the
outcome union; helper-types-3 retains that exit 1 and helper-types-4 exits 0.
No production assertion or timeout was weakened.

In the table, E is "$PWD/docs/evidence/ui-speed/recordings-durability", C is
"$PWD/.scratch/bin", and P is ".agents/skills/verify-ui-profiler/scripts".
Receipts are the named .log/.exit files under E; result.json is inside each
recipe's directory. Intermediate passing runs are retained separately. Only
final same-source runs are counted below.

| Command | Real exit | Receipt |
| --- | ---: | --- |
| sh scripts/disk-guard.sh | 0 before compile batches and measurements | disk-final-build, disk-cost |
| bun build --compile .scratch/recordings-correction2-s1/fault-recovery.ts --outfile "$C/recordings-fault-recovery"; same for expiry-unpersisted.ts and identity-corrected.ts | 0 each | fault-build-final, expiry-build-final, identity-build-final |
| HOME="$PWD/.scratch/recordings-correction2-s1/home" TMPDIR="$PWD/.scratch/recordings-correction2-s1/tmp/" "$C/recordings-fault-recovery" | 1 before, 0 after | red-c3, final-c3 |
| HOME="$PWD/.scratch/recordings-correction2-s1/home" "$C/recordings-expiry-unpersisted" | 1 before, 0 after | red-c4, final-c4 |
| HOME="$PWD/.scratch/recordings-correction2-s1/home" "$C/recordings-identity-corrected" | 0, all 13 cases | identity-final |
| pnpm --filter @todo/domain test recording-durability.test.ts | 1 before each repair; 0 after | red-unit, red-race, red-active-race, red-ack-race, red-receipts; lifecycle-files and green-receipts |
| pnpm --filter @todo/domain test recording-durability.test.ts recording-admission.test.ts diagnostic-recording-corrections.test.ts diagnostic-recording-store.test.ts | 0, 51 controls | green-receipts |
| pnpm --filter @todo/domain test | 0, 466 tests | domain-final |
| pnpm --filter @todo/server test | 0, 38 tests | server-final |
| pnpm typecheck | 0 | types-2 |
| bun --bun node_modules/typescript/bin/tsc --noEmit -p .agents/skills/verify-ui-profiler/tsconfig.json | 0 final | helper-types-4 |
| bun packages/api/scripts/openapi.ts --check | 0 | contract-final |
| bun apps/server/scripts/scratch-diagnostics.ts build | 0 | build-final, build-retry; byte-identical executable proof above |
| bun build --compile "$P/durability-server.ts" --outfile "$C/durability-server" | 0 | lifecycle-build-2 |
| bun "$P/durability.ts" "$E/lifecycle-final" | 0, 16 producer/import cases | lifecycle-final |
| bun "$P/durability-concurrency.ts" "$E/concurrency" | 0, four concurrent producer/import cases | concurrency |
| bun "$P/completeness.ts" "$E/completeness-final"; bun "$P/corrections.ts" "$E/corrections-final"; bun "$P/admission-fault.ts" "$E/admission-fault-final" | 0 each | completeness-final, corrections-final, admission-fault-final |
| TODO_PROFILER_STRESS=1 bun "$P/verify.ts" "$E/producer-final" | 0 | producer-final; 700 accepted, 585 retained segments, 7370 capacity events, zero storage failures |
| TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh "$E/diagnostics-final" | 0 | diagnostics-final; terminal PNG HOLD |
| TODO_SERVER_BINARY="$C/todo-server" TODO_SEED_BINARY="$C/seed" .agents/skills/verify-server-api/scripts/verify.sh "$E/api-final" | 0 | api-final |
| .agents/skills/verify-auth/scripts/verify.sh "$E/auth-final" | 0 | auth-final |
| TODO_CLI_BINARY="$C/todo" .agents/skills/verify-cli/scripts/verify.sh "$E/cli-final" | 0, 80 tests | cli-final |
| bun build --compile apps/server/scripts/diagnostic-fault-cli.ts --outfile "$C/diagnostic-fault-cli"; bun build --compile apps/server/scripts/verify-diagnostic-faults.ts --outfile "$C/verify-diagnostic-faults"; "$C/verify-diagnostic-faults" "$E/faults-final" | 0 each | fault-cli-build-final, fault-driver-build-final, faults-final; 47 cases |
| bun apps/server/scripts/verify-diagnostic-payload-budget.ts "$E/payload-final" | 0 | payload-final; 10000 requests, 200 clients, 306 operations through three clients; both byte caps hold |
| /usr/bin/lockf -k /tmp/todo-ui-profiler-benchmark.lock env TODO_PROFILER_MARKED=1 TODO_PROFILER_PAIRS=10 bun "$P/benchmark.ts" "$E/marked-16"; same with TODO_PROFILER_EVENTS=128 and "$E/marked-128" | 0 each | marked-16, marked-128 |
| bun build --compile "$P/expiry-server.ts" --outfile "$C/expiry-fault-server"; /usr/bin/lockf -k /tmp/todo-ui-profiler-benchmark.lock bun "$P/expiry-cost.ts" "$E/expiry-cost" | 0 each | expiry-server-build-final, expiry-cost |

No new domain module is added. RecordingAdmissions owns current/durable mark
state and its expiry; DiagnosticRecordings owns the single writer queue, ordered
publication and weak receipt facts. The HTTP adapter supplies the requesting
receipt's required qualifier to that shared guard. No domain rule was copied
into the adapter. New reusable harnesses stay under verify-ui-profiler and the
literal controls stay under packages/domain/test. No children, push, native app,
Keychain, installation or real Todo data were used. The existing single queue
comment remains the only added explanatory production comment from the earlier
correction; the single-worker restriction still precludes a delegated comment
review. Client integration, terminal PNG rendering, native compilation/UI proof,
fresh Claude discovery, allocation counts and power-loss proof remain unclaimed.

### C3/C4 root gate and cleanup

The first exact locked root run exits 1 at Biome's import-order check in the new
test file, before tests execute. root.log/.exit preserve it. lint-detail identifies
the sole error: readdir must sort before readFile. lint-fix exits 0 and changes
only those two imports. No assertion, timeout, worker cap or tracked recipe
changes. Rebuilt CLI, server and seed hashes are identical to the measured and
compiled artifacts, as recorded above.

With the disk guard first, the unchanged command
`/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` then exits 0.
root-retry.log/.exit pass the contract, type checks, lint, 466 domain, 80 CLI,
38 server and 168 Electron tests with the same one existing Electron skip.
Boundary one-minute load is 2.66 to 4.95. The disk guard exits 0 with 44.6 GB free.
The initial lint-only run's load is 2.81 to 4.34, with 45.0 GB free. No own timed
measurement or other compiled recipe ran during either root command. Both runs
use the standing command exactly; there is no supplementary worker-capped run.

Cleanup checks lsof before deleting only this worktree's closed Bun temporaries.
It removes 25 files, 2216550400 allocated bytes, with zero open-file skips and
real exit 0. cleanup.json lists paths and sizes; cleanup.log/.exit and disk-final
retain the receipts. Final free space is 43.6 GB, above the 30 GB soft floor.
All owned fixture servers and scratch data were stopped/removed by their helpers;
the owned-binary process check is empty. No other unit's files or processes were
touched. Evidence remains local and ignored.

Final CLI SHA-256: b91fa40478d1c482429134bfacbde3bf77aba0f209db9c542683d1a5b0886cbe.
Final server SHA-256: ecf91579ec099b6b2d3897214bc1aa520dc84086e9fc1727d471dc719b21cb84.
Verification-only durability server SHA-256: 0eabb813a219590dd5bfedbfc00e99d214465829dd6b7359c3ef463ca41866b8.
C3 and C4 are ready for the seat's re-check. No independent verdict is claimed.

## C5/C6/C7 replacement: one manifest authority

This replaces the two-file qualification design in 44da13f3. The seat's original
C5, C6 and C7 compiled witnesses each exit 1 before implementation. Their sources
are unchanged and hashed in recordings-manifest/seat-sources.sha256. All receipts
below are under ignored docs/evidence/ui-speed/recordings-manifest. No independent
review verdict is claimed.

A valid version-2 run manifest is the only authority. It contains the run
definition, admission counts/uncertainty, per-run capacity/expiry/corruption event
counts and immutable segment descriptors. Descriptors include sizes, checksums,
event counts, original batch identity and a fingerprint of the entire original
batch. The manifest itself has a checksum and a 256 KiB encoded cap. The legacy
internal filename suffix .admission.json remains so existing filesystem fault
controls can target the same atomic boundary. There is no separate admission
checkpoint and no mark in any segment. The RecordingAdmissions class is deleted.
There is no legacy blob reconstruction or migration of this unshipped private
format; an old checkpoint is invalid authority and its blobs become orphans.

Each writer job stages all bounded immutable segments first. It writes, flushes
and atomically renames the manifest naming all of them last. A refusal changes
only that manifest. An interrupted split leaves the old manifest and orphan
blobs, never a partially published batch. Lost acknowledgements retry all events
idempotently across splits. Retained fingerprints compare content, not only keys.
An exact retry is queued until disk authority has been rechecked; HTTP and CLI
still report stored only after that check completes. A failed manifest write
cannot expose the staged data. Retrying a dirty qualifier or its original batch
retries the write, without a timer loop.

Missing or corrupt manifest means absent, for both previously clean and marked
runs. List omits it; show/export/compare return the existing safe missing-run
refusal. Startup deletes orphan blobs and releases derived indexes and charges.
A missing/corrupt named blob instead causes an incomplete manifest replacement
before surviving events are returned. If repair cannot publish, queries about
that run refuse safely while healthy peers continue. Likewise, a pending refusal
whose publication failed cannot expose a clean-looking live summary. It refuses
until explicit retry persists the command. Pending commands are not authority.
Global loss status recovers at least the counted losses of surviving manifests
if its ancillary status file is absent or behind; it never qualifies a run.

One helper in recording-files.ts handles every unlink. ENOENT is success. The
writer retires segment references/indexes only with authority publication and
keeps failed physical removals charged. Failed cleanup blocks recording growth,
not Task requests. Other errors remain visible and retry no sooner than 60000 ms.
The normal timer's data selector now requires the full 13-digit timestamp prefix;
its old digit-only predicate could mistake a numeric UUID manifest for data.
No existing retry delay, timeout, production quota or comparison assertion changed.

### Bounds and new modules

recording-manifest.ts owns the strict internal codec, checksum, admission merge,
publication descriptors, bounded split planning and the pure recovery
inspection used by production and the generated controls. DiagnosticRecordings
owns the sole writer queue and all publication, budgets, receipts and removal.
RecordingQueries projects only manifest-owned batches. recording-files.ts owns
native lease/read/atomic-write/idempotent-remove boundaries. No business rules
moved into HTTP. The server changes only construction to start recovery without
awaiting it. Task store.ts and projection.ts remain byte-identical to the base;
no formal mapping or pin is renewed.

Metadata admission_bytes now charges the complete qualifying manifest, including
segment references. The app/total budget includes its charged size and one
maximum manifest replacement reserve for the single writer, plus the existing
three blocks for status replacement and the lease. Failed garbage stays charged.
The 32 MiB app, seven-day, 256 MiB total, 4096-segment, 5120-run, 1 MiB queue and
1024-pending bounds remain. A full manifest rotates its own oldest references;
this local bound cannot evict another run's data. Ordinary app/global capacity
still evicts oldest eligible data under those independent limits.

The default-cap census admits 1100 three-event batches into one run beside a
healthy peer. Its final manifest holds 878 segments / 2634 events in 261639 bytes,
with 296-byte descriptors. It counts 222 evicted segments / 666 events, preserves
incomplete fractions and leaves the peer manifest byte-identical. Total physical
allocation is 3870720 bytes; data/garbage charge is 3600384 and metadata charge
266240. Capacity depends on descriptor/run metadata length and event size; 878
is this literal fixture, not a universal events-per-run promise. The 128-event
and app-byte caps also apply. The full census remains in the compiled recipe;
the unit test uses a 2048-byte planning seam and 20 admissions to exercise the
same rotation without another 1100-write job inside parallel unit suites.

Export reserves the maximum legal admission object and the response/status
wrapper before acknowledgement. The C7 input is 131004 bytes / 95 events. It
returns two pages, each at most 131072 bytes, with the mark on both, in original
order. All 95 events remain after normal restart. Exact retry creates no segment;
a changed final event under the same original batch id is refused. The wire
schema and contract id do not change. Old and new are both:
55c6d138cc924128593b25ef0313d898a6725bd0c0d91e026d09ad24536f28c8.
No generator or Swift command is needed or run.

### Executed lifecycle and oracle changes

The [generated lifecycle table](recordings-manifest-lifecycle.md) comes from
the executed model, not a hand-maintained second specification. Each
row lists operation prefixes, data/manifest state combinations, reader outcomes
and retry semantics. Clean and marked two-segment runs cover ingest, refusal,
import, export, own-manifest rotation, eviction, expiry and restart. Every
existing run file independently takes valid, missing, truncated and corrupt
states. The production recovery inspector and production query reducer execute
for each image, followed by a real scratch-directory reopen through the writer.
All 14537 states pass with their captured clock, physical cleanup, index/byte
charges, export pages, a marked import retry and a second idempotent retry.
The 362 captured prefixes produce 143 distinct file/clock images. A second
healthy run is read and compared in every combination.
The real-directory unit test separately reopens all 64 combinations for two
blobs and one refused manifest, plus explicit clean/marked deletion/corruption.

The 190 compiled process cases include 174 SIGKILLs of their owned child at
each mutation boundary,
including before/after immutable writes, manifest publication, unlink and
constructed empty/partial/flushed temporaries. Every recovered state checks the
healthy peer, absence or qualified data, explicit retry and a second idempotent
retry. A separate sixteen-case real HTTP/CLI control imports a genuine marked
export, interrupts data/manifest publication and injects write failures. Four
held-write controls cover later refusal and pending duplicates. Their barrier
moved from data publication to manifest publication because that is now the commit
boundary. These controls do not claim to interrupt a kernel write or prove
power-loss durability. The native file is flushed before rename; filesystem
power-loss guarantees remain unclaimed.

The coordinator explicitly confirmed the two changed seat oracles. The original
C6 witness remains red because show of the deleted sole manifest safely refuses
instead of returning a reconstructed run. The original C7 witness remains red
because its first-page-only assertion sees 91 rather than 95 events; the approved
pagination control sees all 95 in two pages, before and after restart. Raw
red/final logs are retained, not relabelled as passes. The unchanged C5 probe
passes. The earlier unchanged C3 fault/retry probe also passes. C4's unchanged
probe reaches successful fresh-run queries but then throws on its removed
admissions.states private seam; the corresponding manifest-expiry control passes.
The unchanged identity witness passes 10 of 13 cases. The three obsolete
expectations are an immediate in-memory stored receipt, a 4096-byte quota that
cannot hold data plus authority plus replacement, and reconstruction from an
unreferenced contradictory blob. The manifest-identity variant keeps all 13
behavioral cases with queued/settled receipts, a 12288-byte fixture quota and
orphan removal. It passes all 13; the raw unchanged receipt is retained.

Five additional literal regressions failed first during the replacement's own
review. A failed refusal publication could still display the old clean summary;
a producer could enter midway through background recovery; and losing ancillary
status could hide an authority's counted eviction. Their raw red receipts are
red-dirty-summary, red-ready-race, red-loss-status, red-ready-http and
red-temp-charge. Final controls cover safe query refusal until retry, no internal
admission before recovery completes, an owner upload waiting across recovery,
recovered loss counts from the sole manifest and charged failed temporaries.
Failed atomic cleanup is routed through the same removal guard. Only an explicit
retry for a run with refused facts can attempt cleanup during an armed backoff;
ordinary activity preserves the timer.

### Startup and request-path cost

No synchronous filesystem operation was added to a Task request. Startup launches
the private recovery task and returns; each file/run yields to the event loop.
Authenticated ingestion awaits readiness, then performs bounded decoding,
producer fingerprints, validation and split planning on the server thread. File
writes and publication are asynchronous and use one queue. Synchronous parsing,
hashing and schema work are real cost, not zero. No allocation or limiting-stage
profile was taken. This is not a claim about app capture or physical paint.

The seat-shaped full fixture has 4096 data segments, 5120 marked manifests,
9218 files and 54530048 allocated bytes. Charged data is 33554432 and manifest
metadata 20971520 bytes. Five alternating light/full pairs use a warm OS file
cache, ten literal 15-Task reads per process and one first recording-list query.
All 100 Task reads pass, plus a separate held-recovery Task control. The first
query time includes both startup validation and the list's fresh validation; it
is not a standalone timing of initialize(). No run is reconstructed from blobs.

| Measurement, ms | Light, median [range] | Full, median [range] |
| --- | --- | --- |
| Process to Listening | 96.155 [96.125, 101.954] | 96.197 [96.076, 102.556] |
| Start through first recording-list response | 110.713 [110.003, 114.351] | 3544.864 [3529.076, 4234.096] |
| First recording-list request | 0.926 [0.842, 1.035] | 3436.036 [3414.290, 4124.108] |
| Per-run Task-read p50 | 0.826 [0.693, 0.933] | 0.838 [0.772, 0.868] |

Full-store maximum checked Task read is 6.236 ms; light
is 6.292 ms. Boundary load is 3.297 to 3.667. The
verification entry also holds the first manifest read before recovery completes;
a literal Task read still succeeds. The owner upload control requires a stored
receipt after release, rather than silently dropping that early batch. Compared
with the seat's historical 3.4-second reconstruction-before-Listening observation,
the structural change is that recording recovery no longer gates Task readiness.
The machines/times differ, so no controlled cross-build speedup is claimed.
An initial supplementary startup run overlapped owned verification; startup-final
is the isolated owned-job run reported here.

Marked-ingestion cost uses one compiled binary, 15 Tasks, 100 reads per cell, ten
AB/BA alternating pairs per batch size, and a concurrent upload only in the
enabled cells. Every boundary load and individual duration is in raw.json.
Each size has 2000 successful reads and 1000 stored uploads, zero storage failures.
The 128-event run rotates 575 segments / 73600 events at the app quota, all counted.
The 16-event run ends with 1000 retained segments and no capacity loss. These
are ambient-host observations, with no imposed CPU pressure. The existing quiet
recipe and its ceiling remain untouched.

| Batch | Read p50 without uploads, ms | With uploads, ms | Upload handler p50, ms | Paired median addition [range], ms |
| --- | --- | --- | --- | --- |
| 16 events | 0.306 [0.298, 0.414] | 0.343 [0.334, 0.409] | 1.931 [1.872, 2.104] | 0.039 [-0.005, 0.061] |
| 128 events | 0.304 [0.293, 0.402] | 0.541 [0.531, 0.612] | 22.686 [21.951, 23.011] | 0.234 [0.210, 0.290] |

| Pair | 16-event read-p50 addition, ms | 128-event read-p50 addition, ms |
| ---: | ---: | ---: |
| 1 | -0.005 | 0.210 |
| 2 | 0.061 | 0.290 |
| 3 | 0.056 | 0.246 |
| 4 | 0.041 | 0.234 |
| 5 | 0.037 | 0.260 |
| 6 | 0.026 | 0.229 |
| 7 | 0.044 | 0.244 |
| 8 | 0.023 | 0.221 |
| 9 | 0.040 | 0.230 |
| 10 | 0.034 | 0.233 |

The 16-event difference is inside pair variation and is inconclusive. The
128-event addition exceeds pair variation in this run; it is an observed
0.234 ms read-p50 cost, not a general machine-independent bound. Its 22.686 ms
upload-handler median includes durable storage and is not a Task handler or
input-to-render duration. Loads span 3.264 to 3.563 for 16 events and 2.971 to
3.563 for 128. CPU/RSS and driver CPU are retained, but no bottleneck profile
was taken, so no stronger causal or throughput claim is made.

The permanent-unlink control makes 2933 successful literal Task reads in five
AB/BA pairs of 6.5 seconds per cell. Two actual failed timer attempts are counted.
Its paired p50 differences are 0.068, -0.015, 1.021, 0.107 and 0.025 ms, median
0.068, range [-0.015, 1.021]. This is inconclusive against pair variation. The
expired segment's logical reference is retired; the failed physical removal
remains charged as 4096 bytes. There is no 1 ms failure retry loop.

Quiet-machine confirmation under the unchanged ceiling is owed at integration.
The local measurement-chart.html was previewed and rendered, with no console
errors. Raw data, tables and the chart remain ignored evidence.

### Commands and real receipts

E is "$PWD/docs/evidence/ui-speed/recordings-manifest", C is "$PWD/.scratch/bin"
and P is ".agents/skills/verify-ui-profiler/scripts". Each named receipt is a
.log/.exit pair, with result.json inside recipe directories where applicable.
The source cache's final source hash is
605cbff056b541c0b2a2bc4a9133c8f9f4abf72d6e0e4fbc0de9c57bd494c8676.
Changing only the new unit fixture size changed its prior cache hash without
changing either executable, as binary-frozen.sha256 records. The final server
includes the later readiness and temporary-cleanup guards; its final SHA-256 is
a5269c9276878d567579e8caaa333f6bb69e717a4d3a84d80cbf0dbe2a53d026.
CLI SHA-256 remains b91fa40478d1c482429134bfacbde3bf77aba0f209db9c542683d1a5b0886cbe.
No source mutation occurred during the final measurements or root checks.

| Command | Real exit | Receipt |
| --- | ---: | --- |
| sh scripts/disk-guard.sh | 0 before compile/measurement/root batches | disk-build, disk-cost, disk-root, disk-root-retry |
| bun apps/server/scripts/scratch-diagnostics.ts build | 0 final | build-sealed-final; source-sealed-final.json and binary-sealed.sha256 |
| bun packages/api/scripts/openapi.ts --check | 0 | contract-current; same full contract id above |
| pnpm typecheck | 0 | types-sealed |
| pnpm exec biome check . | 0, existing informational notices only | lint-sealed |
| bun --bun node_modules/typescript/bin/tsc -p .agents/skills/verify-ui-profiler/tsconfig.json | 0, including real-filesystem model | helper-types-files |
| pnpm --filter @todo/domain test recording-manifest.test.ts recording-durability.test.ts diagnostic-recording-corrections.test.ts | 0, 17 controls | authority-sealed-2 |
| pnpm --filter @todo/domain test | 0, 455 tests | domain-sealed |
| pnpm --filter @todo/server test | 0, 38 tests | server-sealed |
| bun build --compile "$P/manifest-model.ts" --outfile "$C/manifest-model"; "$C/manifest-model" "$E/model-files" | 0 each, 14537 real-directory states | model-files-build, model-files |
| bun build --compile "$P/manifest-crash.ts" --outfile "$C/manifest-crash"; "$C/manifest-crash" "$E/crash-sealed" | 0 each, 190 process cases | crash-sealed-build, crash-sealed |
| bun build --compile "$P/manifest-capacity.ts" --outfile "$C/manifest-capacity"; "$C/manifest-capacity" "$E/capacity-final" | 0 each | capacity-build-final, capacity-final |
| bun build --compile "$P/durability-server.ts" --outfile "$C/durability-server"; bun "$P/durability.ts" "$E/http-sealed"; bun "$P/durability-concurrency.ts" "$E/concurrency-sealed" | 0 each, 16 and four cases | http-sealed-build, http-sealed, concurrency-sealed |
| bun build --compile "$P/manifest-wire.ts" --outfile "$C/manifest-wire"; "$C/manifest-wire" "$E/wire-final" | 0 each, all 95 events across pages | wire-build-final, wire-final |
| bun build --compile "$P/manifest-expiry.ts" --outfile "$C/manifest-expiry"; "$C/manifest-expiry" "$E/expiry-approved" | 0 each | expiry-approved-build, expiry-approved |
| bun build --compile "$P/manifest-identity.ts" --outfile "$C/manifest-identity"; "$C/manifest-identity" "$E/identity-approved" | 0 each, 13 cases | identity-approved-build, identity-approved |
| TODO_PROFILER_STRESS=1 bun "$P/verify.ts" "$E/producer-sealed" | 0, 700 batches | producer-sealed |
| bun "$P/completeness.ts" "$E/completeness-sealed"; bun "$P/admission-fault.ts" "$E/admission-fault-sealed"; bun "$P/corrections.ts" "$E/corrections-last" | 0 each | completeness-sealed, admission-fault-sealed, corrections-last |
| TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh "$E/diagnostics-sealed" | 0; terminal PNG HOLD | diagnostics-sealed |
| TODO_SERVER_BINARY="$C/todo-server" TODO_SEED_BINARY="$C/seed" .agents/skills/verify-server-api/scripts/verify.sh "$E/api-sealed" | 0 | api-sealed |
| .agents/skills/verify-auth/scripts/verify.sh "$E/auth-sealed" | 0 | auth-sealed |
| TODO_CLI_BINARY="$C/todo" .agents/skills/verify-cli/scripts/verify.sh "$E/cli-frozen" | 0, 80 tests; CLI byte-identical | cli-frozen; another attempt cli-final failed two expired-HTTP fixture cases |
| bun build --compile apps/server/scripts/diagnostic-fault-cli.ts --outfile "$C/diagnostic-fault-cli"; bun build --compile apps/server/scripts/verify-diagnostic-faults.ts --outfile "$C/verify-diagnostic-faults"; "$C/verify-diagnostic-faults" "$E/faults-sealed" | 0 each, 47 cases | fault-cli-sealed-build, fault-driver-sealed-build, faults-sealed |
| bun apps/server/scripts/verify-diagnostic-payload-budget.ts "$E/payload-sealed" | 0, 10000 requests and 200 clients, replay through three streams | payload-sealed |
| bun build --compile "$P/manifest-startup-server.ts" --outfile "$C/manifest-startup-server"; bun "$P/manifest-startup.ts" "$E/startup-final" | 0 each | startup-sealed-build, startup-final |
| bun "$P/manifest-ready.ts" "$E/ready-final" | 0 | ready-final |
| /usr/bin/lockf -k /tmp/todo-ui-profiler-benchmark.lock env TODO_PROFILER_MARKED=1 TODO_PROFILER_PAIRS=10 bun "$P/benchmark.ts" "$E/marked-16"; same with TODO_PROFILER_EVENTS=128 and "$E/marked-128" | 0 each | marked-16, marked-128 |
| bun build --compile "$P/expiry-server.ts" --outfile "$C/expiry-fault-server"; /usr/bin/lockf -k /tmp/todo-ui-profiler-benchmark.lock bun "$P/expiry-cost.ts" "$E/expiry-cost-final" | 0 each | expiry-sealed-build, expiry-cost-final |

The domain suite's intermediate domain-final-2, domain-frozen, domain-current
and domain-final-alone attempts exit 1 on the unchanged five-second continuous
admission control. Every other test passes in those runs. Some attempts overlap
owned compiled verification and other units are active; boundary load was not
captured for those unit attempts, so no numerical load attribution is claimed.
The later domain-sealed run and both root domain phases pass all 455 tests with
the timeout and assertions unchanged. The full-cap census moved to the compiled
recipe; no capacity coverage was discarded. The focused 17 controls take 1.35 s.
Initial type/setup and quota-fixture failures remain in their named logs; none is
reported as a final passing gate.

The first exact root command exits 1 on one CLI fixture, not a timeout:
"records one selected-Profile rejection for expired http show" expects History
detail expired and observes invalid_credential. Auth cleanup can delete the
fixture's backdated credential before its request. The same CLI suite passes
all 80 in cli-frozen; cli-final observes that race for expired HTTP show and edit.
No auth code, test expectation, scheduler behavior, timeout or worker limit was
changed. The root failure still passes contract/types/lint, all 455 domain,
38 server and 168 Electron tests, with the existing one Electron skip. Boundary
one-minute load is 4.16 to 5.43. root.log/.exit and the two load logs retain it.
The exact command is rerun after all owned heavy verification completes; its
receipt is recorded below. No worker-capped substitute is used.

The second exact root run exits 0. With the disk guard first, the unchanged
`/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` passes contract, types,
lint, 455 domain, 80 CLI, 38 server and 168 Electron tests, with the same one
Electron skip. root-retry.log/.exit retain the full output. Boundary one-minute
load is 2.03 to 3.24, with 31.3 GB free before the command. No owned benchmark,
fixture drive or filesystem matrix runs alongside it. There is no supplementary
worker-capped command. Integration retains its own combined-branch gate.

The terminal PNG render remains owed by a unit holding the Swift slot. Native
app capture/upload integration, native builds/UI, fresh Claude skill discovery,
allocation/limiting-stage profiling and power-loss proof remain unclaimed.
No children, push, install, native app, Keychain or real Todo data were used.
The single-worker brief precludes a delegated comment review; the manual diff
review keeps the one queue-ownership comment and adds no explanatory production
commentary. The new shared module's job and the removed authority are documented
above. ADR-0020 and architecture.md now describe that one authority.

Delivery rechecks compile the seat sources unchanged again against the final
product. final-missing-segment and final-c3 exit 0. final-clean-then-refused and
final-wire-limit retain their coordinator-approved red exits 1; their absence
and paginated alternatives pass above. Every compile exits 0. seat-source-check
exits 0 for the original source hashes, and contract-delivery exits 0. The removed
legacy-seam witnesses are reported explicitly rather than presented as passes.

Cleanup checks lsof before removing only owned closed files. Across cleanup-mid,
cleanup-pre-cost, cleanup-superseded and cleanup-final it deletes 81 files with
7186747392 allocated bytes of file accounting. The seven superseded executable
copies retain hashes and sources/receipts; the other 74 are closed Bun compile
temporaries. Zero open-file skips occur in the temporary cleanups. APFS shared
extents and other units' activity mean this is not an attributed global df delta.
The final guarded reading is 33.3 GB free. An earlier delivery reading was 30.0 GB;
no further build was started there, and the next df reading returned above 33 GB.
All owned fixture processes have exited, and their helpers removed scratch data.
Raw receipts remain local and ignored. No evidence or binary is tracked.

## SQLite replacement after the fourth correction review

The coordinator ruled that SQLite should replace the remaining file bookkeeping.
The seat's C8, C9 and C10 probes were reproduced first against 11536f6c. Their
unchanged sources, source hashes and raw red results are retained under
`docs/evidence/ui-speed/recordings-sqlite` and
`.scratch/recordings-correction4-s1/evidence`. The earlier root timeout is a
reported failure of that head, not a passing receipt for this one.

### Authority and request isolation

`recording-database.ts` opens the private database and declares SQL constraints.
`recordings-sqlite.ts` implements transactions, range reads and bounded DELETEs.
`recordings.ts` owns the bounded worker RPC. The package's existing
`@todo/domain/diagnostic-recordings` subpath points to the new adapter.
The five file-store modules and the tests/recipes specific to their machinery
are deleted. There is no migration, admission checkpoint, manifest, segment
file, independent event index, reconstruction, writer lease or unlink loop.

The database is `diagnostic-recordings/recordings.db`, separate from todo.db.
It is never attached to the Task database. The directory is 0700 and the main,
WAL and shared-memory files are 0600. Symlinks, hard-linked files and databases
containing another subsystem's tables are refused. Task store.ts and
projection.ts remain byte-identical to the starting head. Task Snapshot,
restore, Purge and export continue to operate solely on their existing data.

WAL, synchronous FULL and a 1 ms busy timeout apply on every worker connection.
All recording SQL, filesystem access, hashing and reducers run in that worker.
The Task request thread performs bounded allowlist/schema validation, JSON
encoding, structured cloning and RPC queue admission. It never waits
synchronously for recording locks, pruning or recovery. Recording endpoint
responses await the worker asynchronously; Task readiness does not await its
startup. The queue remains 1 MiB / 1024 batches, reserved before any await.
A rejected queue or failed transaction is counted as dropped, with the existing
safe retain-and-retry response. This does not claim zero main-thread cost.

### Transaction and identity rules

| Operation or failure | Committed truth and retry |
| --- | --- |
| Ingest/import before BEGIN, after BEGIN or before COMMIT | No submitted facts or imported mark are visible. Retry admits the batch normally. |
| Ingest/import after COMMIT, acknowledgement lost | Run, facts and mark are visible together. Exact retry is a no-op. |
| Whole-batch conflict | Roll back its savepoint, count all unadmitted facts and commit the run's incomplete mark before returning HTTP 400. Non-conflicting facts can be retried unchanged under a new batch id. |
| Failure to commit a conflict mark | Roll back the entire transaction and return the reviewed storage failure. Producer retains the whole batch. |
| Expiry or eviction before COMMIT | Facts, marks, counters and identity rows retain their previous state. |
| Expiry or eviction after COMMIT | DELETEs, counted losses and incomplete marks become visible together. Repeating the DELETE is harmless. |
| Export/compare during another writer | A WAL read transaction observes one committed snapshot of facts and admission state. |
| Restart | SQLite recovers committed transactions. No application reconstruction creates a run. |

The primary event identity is (run, producer, sequence). Content fingerprints
separate identical retries from conflicting facts. Producer batch identity is
(run, batch), with its original whole-batch fingerprint. Public export cursors
have a separate unique column; using one as an unrelated producer batch id
cannot alias another identity. Foreign keys and JSON association checks prevent
cross-run reassignment. Retained rows alone own identity, so deletion releases
it through the same transaction. A run's admission state survives complete
fact eviction and masks both deadline fractions with null, as before.

### Fixed bounds and expiry

Limits remain 32 MiB per app, 256 MiB total, seven days, 4096 retained producer
batches and 5120 runs. Transactional SQL sums enforce app and total usage.
Event charges round 2 * encoded bytes + 4096 upward to a KiB; each run charges
4096 and each retained batch 512. A reserve of up to 1 MiB per quota leaves
engine replacement space. Charges intentionally exceed payload bytes and cover
index/page overhead. A physical database page ceiling leaves 16 MiB below the
total limit; WAL checkpoints and journal_size_limit bound the WAL separately.
A pre-commit physical guard reserves the main file, existing WAL, a whole
database of possible new WAL frames and overhead. With cache_spill=OFF there
are no pre-commit spills, including during a dry run. If a reader pins the WAL,
an over-budget transaction rolls back, counts a drop and makes one bounded
checkpoint attempt; an explicit retry succeeds after the reader releases. The
2 MiB control initially grew to 21,221,376 bytes with a pinned reader; its red
receipt is retained, and the guarded version stays within 2 MiB. This is why
max_page_count and journal_size_limit alone are insufficient. The latter applies
at WAL reset, as documented by [SQLite](https://www.sqlite.org/pragma.html#pragma_journal_size_limit).
Physical allocation is also checked by the real producer recipe.

Each incoming transaction accepts at most 128 events / 131072 encoded bytes.
It prunes at most 128 expired events, removes at most 256 expired identities
matching the input batch/keys, and evicts at most 512 old events. A bounded
sweep removes at most 128 events and 128 empty expired runs. Oldest retained
batches go first; incoming facts cannot evict themselves and then receive a
stored receipt. A batch that cannot fit rolls back and is counted as dropped.
Run and batch metadata are charged even when facts are absent.

A one-second unreferenced tick checks a monotonic minute deadline. Successful
sweeps drain bounded chunks; automatic retries after failure wait at least
60000 ms. Wall-clock jumps affect retention, not that delay. Reads exclude
expired facts even when deletion fails and mark any partially retained run
incomplete. No seven-day timer exists to preserve accidentally.

Exports are ordered range reads, at most 128 events, with the maximum admission
mark reserved before page admission. Every transfer page is below 131072 bytes.
Large accepted batches can span pages without changing order or duplicating
facts. Their ingestion remains one atomic transaction, and retry fingerprints
cover the original batch rather than any export page.

Expiry admission also removes that input's expired identities before evaluating
retained duplicates. The regression queues 100 old runs ahead of a retry; the
acknowledged three facts must still export immediately. Cursor age uses the same
logical retention boundary even before a bounded sweep reaches its row.

### Behavioral witnesses

| Reviewed rule | Current control |
| --- | --- |
| C1 and C2 | Whole-batch refusal, null fractions, restart/import/export and two-run reducers retain their literal behavioral assertions. |
| C3 and acknowledgement races | Transaction kills before/after BEGIN and COMMIT, marked import, failure/retry and exact duplicate controls. |
| C4 and C5 | SQL DELETE is idempotent; no unrelated file unlink or repair path exists. Expiry/eviction controls check healthy peers. |
| Corrected C6 | There is no per-run authority file to lose or rebuild. Only committed database rows create a run. An unavailable recordings database fails closed without touching Tasks. |
| Corrected C7 | The real 95-event / 131004-byte HTTP witness retrieves all acknowledged events across bounded pages before and after restart. |
| C8 | SQL foreign keys and association checks reject a run claiming a peer's facts; both peer summaries remain intact. The old private-manifest mutation probe is historical. |
| C9 | A persistent DELETE failure across a clock jump produces minute-spaced retry counts while Task writes continue. The old private timer probe is historical. |
| C10 | The unchanged real-HTTP alias/expiry/retry witness passes; 80 alias/eviction controls retain exactly three event rows. No manual event index exists. |
| Continuous admission | 1001 admissions through the worker retain a bounded batch under the unchanged default 5000 ms test timeout. |

The retired file probes are not reported as unchanged passing SQL tests. Their
public HTTP/CLI expectations remain the compatibility oracle; private filesystem
fault inputs are replaced with SQLite constraints, aborting triggers, locks and
real volume exhaustion. No mock database establishes atomicity.
### Root checks and fixture parity

The exact standing-order command was run after its disk guard, without an
environment override, timeout change or assertion relaxation. The first two
attempts exited 1 on `keeps a 1001-admission worker path within its unchanged
default timeout`, at 5002 ms. Boundary one-minute loads are retained in
load-root-start/end and load-root2-start/end. The isolated three-event version
passed in 3060.723292 ms. These are raw failures, not passing receipts.

The original continuous fixture at 11536f6c has one event per admission and a
12288-byte app quota. My first port accidentally used three events, comparison
metadata and a 49152-byte quota. The root fixture now uses the original one-event
payload, 1001 admissions, the original quota and the unchanged 5000 ms timeout.
The SQL pruning change also replaces repeated row decoding/deletion with one
set update and DELETE; counts use the engine's actual changes. All 18 SQL
controls still pass. The stronger three-event serial case is retained as a
compiled control, and retrieves all 3003 acknowledged facts in 3452.647833 ms
with boundary loads 4.0195 and 3.9375.

The third exact root run exits 0: 444 domain, 38 server, 80 CLI and 168 Electron
tests pass, with the existing one Electron skip. `root3.log` and `root3.exit`
retain the entire command output. The standalone original-payload control also
passes in the normal timeout. No worker ceiling or supplementary capped run
replaces this result.

### Frozen-binary cost and startup

All recording transactions and private-file operations are in the worker. The
largest observed 128-event transaction at the full-store fixture was
19.739 ms, above the 2 ms limit for synchronous work on the Task thread.
The main HTTP path retains bounded JSON/schema validation and structured-clone
work. The pending encoded queue is at most 1 MiB / 1024 batches. The worker has
an 8 MiB suggested SQLite page cache and a 256-sample timing ring; disabled
spilling can retain additional dirty transaction pages. JavaScript/native
allocation counts were not measured. Encoded bytes are not heap bytes.

The busy-host comparison uses one frozen server/CLI source hash,
`2a87603e297512b5f72934d84610b9e00b390d5445505346f4b72798bb071124`.
The executable was compiled from the dirty working tree based on 11536f6c;
`source-frozen.json` records both identities. Every pair uses the same binary.
Each challenge has ten alternating pairs, 20 checked Task reads and writes per
cell, 15 initial Tasks and three warmup reads. All 2000 timed reads and 2000
writes return their literal expected results, with no tolerated Task failures.
The ingestion flood has 32 independent run/sequence producers and rotates
submission order. Full-store cells start with at least 30 MiB of charged facts.
Expiry advances only the scratch recording clock, leaving Task/auth clocks
unchanged, and measures bounded demand/background sweeps.

The generator submits ingestion before each Task write, reads after that write,
and then awaits the producer barrier. This is a burst-before-write challenge;
it does not establish an intrinsic read/write difference or maximum throughput.
Client timings include body decode and pre-handler waiting. Server CPU includes
all threads at the coarse ps TIME resolution; it does not isolate main-thread
validation from worker CPU. The server dominates driver CPU under the flood.
One-minute load is recorded at both boundaries of every cell. No imposed CPU
pressure or owned test suite runs alongside this comparison.

Values below are milliseconds. Each p50 uses nearest rank among 20 requests;
the displayed median across ten cells averages the middle two values, with the
full cell range in brackets. Pair differences are enabled minus disabled.
Read changes are inconclusive against pair-to-pair variation, including the
small all-positive eviction sample. Write increases remain positive in every
pair and exceed their pair spread in this challenge. These are measured costs,
not a claim of no overhead. The flood accepts 2445 batches and explicitly drops
3955 of 6400; its latency is not reported as if all recordings were retained.
Clients must keep the refused batches for retry. Ordinary 16/128-event cells
have no dropped batches. The unchanged quiet collection-cost recipe and ceiling
remain untouched. A quiet-machine confirmation under the unchanged ceiling is
owed at integration.

| Challenge | Read p50 without / with | Write p50 without / with | Accepted / dropped batches |
| --- | --- | --- | --- |
| 16 events | 0.952 [0.758, 0.986] / 1.099 [0.797, 1.230] | 0.960 [0.774, 1.029] / 1.644 [1.370, 1.779] | 200 / 0 |
| 128 events | 0.787 [0.705, 1.134] / 0.914 [0.793, 1.070] | 0.778 [0.699, 1.147] / 2.196 [2.022, 2.762] | 200 / 0 |
| 32 producers | 0.940 [0.746, 1.448] / 1.030 [0.788, 1.230] | 0.937 [0.674, 1.309] / 14.107 [10.969, 18.215] | 2445 / 3955 |
| Expiry | 0.882 [0.787, 1.081] / 0.861 [0.783, 1.161] | 0.892 [0.776, 1.126] / 1.401 [1.356, 1.660] | 0 / 0 |
| Eviction | 0.817 [0.725, 0.922] / 0.945 [0.912, 1.041] | 0.807 [0.718, 0.926] / 2.220 [2.096, 2.502] | 200 / 0 |

| Challenge | Read paired differences, pairs 1 through 10, ms | Write paired differences, ms |
| --- | --- | --- |
| 16 events | -0.014, -0.008, 0.472, 0.150, 0.078, 0.243, 0.136, 0.212, 0.143, 0.110 | 0.596, 0.615, 1.004, 0.800, 0.654, 0.774, 0.552, 0.749, 0.635, 0.618 |
| 128 events | 0.081, -0.240, 0.178, -0.006, 0.346, 0.282, 0.128, 0.018, 0.106, 0.196 | 1.733, 1.062, 1.632, 1.243, 1.556, 1.685, 1.363, 1.350, 1.288, 1.366 |
| 32 producers | 0.024, 0.061, 0.031, -0.020, 0.293, -0.033, -0.235, 0.081, -0.400, -0.074 | 10.911, 10.638, 10.808, 10.211, 13.644, 16.927, 15.681, 15.184, 14.886, 12.792 |
| Expiry | 0.196, 0.053, -0.043, -0.116, 0.025, -0.044, 0.020, -0.003, 0.070, -0.086 | 0.578, 0.534, 0.603, 0.428, 0.564, 0.442, 0.591, 0.618, 0.560, 0.518 |
| Eviction | 0.151, 0.316, 0.098, 0.098, 0.103, 0.153, 0.179, 0.173, 0.247, 0.013 | 1.272, 1.781, 1.404, 1.331, 1.380, 1.574, 1.426, 1.492, 1.615, 1.208 |

| Challenge | Server CPU without / with, ms | Driver CPU with, ms | Boundary one-minute load range |
| --- | --- | --- | --- |
| 16 events | 120.000 [100.000, 130.000] / 220.000 [180.000, 240.000] | 17.855 [14.372, 28.492] | 3.715 to 5.308 |
| 128 events | 100.000 [80.000, 120.000] / 380.000 [350.000, 430.000] | 20.509 [16.371, 50.456] | 4.708 to 5.523 |
| 32 producers | 110.000 [90.000, 160.000] / 5515.000 [4170.000, 6140.000] | 479.796 [353.867, 547.924] | 4.446 to 5.086 |
| Expiry | 105.000 [100.000, 130.000] / 210.000 [190.000, 270.000] | 8.599 [6.010, 13.076] | 4.929 to 5.961 |
| Eviction | 100.000 [90.000, 110.000] / 520.000 [510.000, 580.000] | 22.828 [20.946, 28.559] | 4.836 to 5.718 |

All raw per-request values, boundary loads and receipts are in
`cost-frozen/raw.json`. `comparison.html` renders their paired ranges. The two
partial earlier runs, `cost` and `cost-final`, were intentionally stopped before
finalization and exited 70. Their raw cells and stop reasons are retained; they
do not support the final cost claim.

There is no migration of the seat's old file fixture. The equivalent maximum
reference-count SQL fixture holds 4096 one-event batches. Five alternating
empty/full opens, using warm filesystem caches, measure empty 0.521 ms
[0.505, 3.359] and full 7.980 ms
[7.789, 8.187]. This is a different storage fixture
from the seat's 3.4 s reconstruction / 0.1 s light measurement. It establishes
that SQL opening has no application event reconstruction. With the recordings
writer deliberately locked, the compiled server is ready at 103.304 ms
and serves the literal Task read at 110.019 ms, while a recording query
remains pending. Releasing the lock completes that query at 156.289 ms.

The persistent expiry-failure control records 2 attempts over 64 seconds,
60319.054 ms apart, and 64 successful Task writes.
The counted storage failure is visible. Repair followed by explicit admission
expires exactly three old facts. This proves a bounded retry schedule and Task
responsiveness, not zero overhead. A genuinely full 10 MiB volume returns the
safe ingestion 500 while Task creation and the real scheduler commit exactly
two TaskCreated entries and one ReminderFired entry.

### Commands and real exits

Here `E=$PWD/docs/evidence/ui-speed/recordings-sqlite`,
`P=.agents/skills/verify-ui-profiler/scripts`, and `C=.scratch/bin`.
Every row has its log and .exit receipt beneath E. Evidence is local and ignored.

| Command | Exit / evidence |
| --- | --- |
| Original compiled C8, C9, C10 witnesses against 11536f6c | 1 each, red-c8.log, red-c9.log, red-c10.log |
| pnpm --filter @todo/domain test | 0, 444 tests in root3; domain-final also 0 |
| pnpm --filter @todo/server test | 0, 38 tests, server-final and root3 |
| pnpm typecheck | 0, types-delivery and root3 |
| bun --bun node_modules/typescript/bin/tsc -p .agents/skills/verify-ui-profiler/tsconfig.json | 0, helper-types-final6 |
| bun packages/api/scripts/openapi.ts --check | 0, contract-frozen and root3 |
| sh scripts/disk-guard.sh | 0 before each root run, disk-root / disk-root2 / disk-root3 |
| /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check | 1, 1, then 0; root / root2 / root3 |
| bun apps/server/scripts/scratch-diagnostics.ts build | 0, build-frozen |
| TODO_PROFILER_STRESS=1 bun "$P/verify.ts" "$E/producer-frozen" | 0, 700 batches plus client-shaped HTTP/CLI import/export/compare |
| bun "$P/completeness.ts" "$E/completeness-frozen" | 0, durable whole refusal, null fractions, retry, rotation, eviction and import |
| bun "$P/corrections.ts" "$E/corrections-frozen" | 0, HTTP/CLI safe refusal reasons and identities |
| bun "$P/admission-fault.ts" "$E/fault-frozen" | 0, failed mark commit gives HTTP 500 / CLI 1, Task exactly once |
| bun build --compile "$P/sqlite-crash.ts" --outfile "$C/sqlite-crash"; "$C/sqlite-crash" "$E/crash-frozen" | 0 each, 20 transaction-boundary SIGKILL cases |
| bun build --compile "$P/sqlite-continuous.ts" --outfile "$C/sqlite-continuous"; "$C/sqlite-continuous" "$E/continuous-frozen" | 0 each, 1001 batches / 3003 retrieved facts |
| bun "$P/sqlite-writers.ts" "$E/writers-frozen" | 0, two compiled servers, 32 simultaneous exact retries, three stored facts |
| bun build --compile "$P/sqlite-clock-server.ts" --outfile "$C/sqlite-clock-server" | 0, clock-frozen |
| bun "$P/sqlite-expiry.ts" "$E/expiry-frozen" | 0, minute backoff and healthy Task writes |
| bun "$P/sqlite-wire.ts" "$E/wire-frozen" | 0, corrected C7, all 95 facts across bounded pages after restart |
| "$P/sqlite-full.sh" "$E/full-volume-frozen" | 0, actual ENOSPC and scheduler |
| bun "$P/sqlite-startup.ts" "$E/startup-frozen" | 0, 4096-batch startup and Task readiness during locked recording opening |
| bun "$P/sqlite-identity.ts" "$E/identity-frozen" | 0, reusable C10 HTTP witness with unchanged assertions |
| bun .scratch/recordings-correction4-s1/identity-http.ts | 0, original HTTP source, c10-frozen; only its clock-server import is relocated |
| bun .scratch/recordings-correction4-s1/http-probes.ts | 0, seat-http-frozen; credential/content matrix, dry run and Task DB/WAL byte identity |
| bun .scratch/recordings-correction4-s1/restore-probe.ts | 0, seat-restore-frozen; Snapshot/Purge/restore leave recording files byte-identical |
| bun build --compile "$P/sqlite-auth-server.ts" --outfile "$C/sqlite-auth-server"; bun "$P/sqlite-auth.ts" "$E/revoked-frozen"; bun "$P/sqlite-auth.ts" "$E/revoked-read-frozen" read | 0 each, revocation during asynchronous error returns 401 |
| TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh "$E/diagnostics-frozen" | 0; terminal PNG is explicit HOLD |
| .agents/skills/verify-server-api/scripts/verify.sh "$E/api-frozen" | 0 |
| .agents/skills/verify-auth/scripts/verify.sh "$E/auth-frozen" | 0 |
| TODO_CLI_BINARY="$PWD/.scratch/bin/todo" .agents/skills/verify-cli/scripts/verify.sh "$E/cli-final" | 0; CLI source is unchanged by the later SQL-only pruning reduction, and root3 reruns all 80 CLI tests |
| bun build --compile apps/server/scripts/diagnostic-fault-cli.ts --outfile "$C/diagnostic-fault-cli"; bun build --compile apps/server/scripts/verify-diagnostic-faults.ts --outfile "$C/verify-diagnostic-faults"; "$C/verify-diagnostic-faults" "$E/recorder-faults-frozen" | 0 each, all 47 fault controls |
| bun apps/server/scripts/verify-diagnostic-payload-budget.ts "$E/payload-frozen" | 0, 10000 requests, 200 clients and the 49152/65536 byte caps |
| TODO_RECORDING_COST_REQUESTS=20 /usr/bin/lockf -k /tmp/todo-ui-profiler-benchmark.lock bun "$P/sqlite-cost.ts" "$E/cost-frozen" | 0, all 100 cells |
| bun "$P/sqlite-report.ts" "$E/cost-frozen" | 0, cost-report-final; tables, summary and HTML use the raw values |

The contract is unchanged. Old and new are both
`55c6d138cc924128593b25ef0313d898a6725bd0c0d91e026d09ad24536f28c8`.
No TypeScript pin, OpenAPI artifact, golden or generated Swift file changed.
No Swift command, native app, Keychain, installation, real HOME/database or push
was used in this correction. Mac/client native integration and terminal PNG
rendering remain owed to the appropriate integration unit.

Task store.ts and projection.ts hashes are identical to 11536f6c, recorded in
`task-source-immutability.json`. No formal pin is renewed; those mapped Task
transaction inputs did not change, so the formal commands were not rerun for
this recording-store replacement.

Cleanup removed 30 owned closed Bun temporary files, checked with lsof before
each unlink: 2659860480 allocated bytes, about 2.66 GB, plus the two stopped
owned scratch fixtures. Both cleanup receipts retain individual paths/sizes.
Final df records 127.3 GB free; concurrent units also changed disk use, so that
volume delta is not attributed to this cleanup. Reusable sources and every
cited red/green receipt remain. All owned fixture processes and the temporary
full-volume mount are stopped/removed.

## SQLite review corrections

Base: 475d6a2b94cb3c9a21398eae45705c7d6e6746d7. The review is read in full;
its original sources are archived locally in .scratch/recordings-sqlite-s1.
C1 through C10 remain closed under the SQLite design. This correction changes
worker availability, counter accounting and read/permission boundaries. It does
not change the Task store, projection, recording schemas or HTTP contract.
Evidence for this section is docs/evidence/ui-speed/recordings-sql-corrections.

### Decisions and red/green controls

| Finding | Red on 475d6a2b | Correction and green |
| --- | --- | --- |
| SQL1 | Original compiled client-hang witness exits 1, retaining 1101 RPCs while only ingestion charged the queue. | All calls reserve count and bytes synchronously. At most 1024 requests / 1 MiB of full encoded envelopes plus 256 bytes per call are held. The real held-worker control settles in about five seconds, clears pending calls and recovers after backoff. Original witness exits 0. |
| SQL2 | Original compiled factory-failure server exits before Listening; start-fault.ts exits 1. | RecordingService catches the factory itself, serves Tasks immediately and retries it. Original witness exits 0. Factory/repaired controls prove Task HTTP, the owner Diagnostics note and automatic recovery. Removing an owned bundled worker module exercises a real native worker loading failure and recovery, without resource exhaustion. |
| SQL3 | Literal native run-capacity control sees dropped_batches=0 and dropped_events=0 instead of 1 and 3 after the 5120th mark-only run. | Native refusal accounting counts that valid batch without registering run 5121. Counters are 1 and 3; capacity_events is 3. Conflicts and other valid-batch refusal paths are audited below. |
| SQL4 | Literal pinned-reader control sees storage failures and unclassified drops. Materialization control sees active snapshots during JSON parsing. Both fail. | Capacity refusals carry counted batches/events. A reader-held store reports that reason in Diagnostics. Maintenance retries on its minute backoff without adding storage failures. Releasing the independent reader permits automatic expiry with no further recording RPC; the control observes 178 dropped batches / 534 events, zero storage failures and recovery in 60961.514 ms. Materialization is outside read snapshots. |
| SQL5 | Source guard rejects the dead auto_vacuum=INCREMENTAL setting. | Setting removed; no vacuuming added. A native control verifies zero retained event charge after expiry, positive freelist_count and unchanged main file size after a TRUNCATE checkpoint. The seat's full three-app fixture retained about 32.6 MB at high water; that is expected. |
| SQL6 | Literal foreign-file control sees 0600 / 0700 instead of unchanged 0640 / 0750. | Existing nonempty files pass a read-only ownership/integrity check before chmod or WAL setup. Refused foreign/unreadable files keep their bytes and modes. The real scratch Task database and its copy pass the archived boundary witness; unknown read-only validation failures are refused safely. |

The original held-client and startup-factory witnesses are retained unchanged.
The new native tests have literal expected values; they are red before edits and
green after. The additional high-water control documents accepted physical
behavior rather than claiming the file shrinks. Preparation failures, the first
boundary attempt's read-only copy error and the first factory-label assertion
are preserved in their logs; none is relabeled green.

### Availability policy

Readiness and each RPC have a 5000 ms deadline, including time queued behind
startup. This is over 250 times the worker's measured 19.7 ms transaction and
still over 57 times the seat's 86.6 ms maximum under load. Readiness is one shared
bounded startup barrier, not an unbounded queue of read calls. HTTP ingestion
no longer waits outside RPC admission for that barrier.

Every ingestion, run list, Show, export, compare, flush and close reserves the
same 1024-call / 1 MiB queue. Byte charging includes the complete JSON request
and a fixed 256-byte envelope allowance; it does not claim to measure heap use.
The 1024-marker fixture omits optional comparison metadata so that its count
bound, rather than the newly charged wrapper bytes, is the limiting constraint.
The independent byte-bound control uses large read arguments and a held worker.

A deadline fails the call with an allowlisted, content-free reason. Three
consecutive deadlines retire the worker, reject its other pending calls and
enter unavailable. A successful response resets the streak; late replies cannot
reset it or complete a timed-out call. Startup, worker error/exit and malformed
reply failures use the same unavailable state. A 60000 ms unreferenced backoff
starts a fresh worker. Closing cancels recovery and cannot wait indefinitely on
an RPC. There is no Task request, stream or scheduler dependency on those waits.

The server also catches an exception from DiagnosticRecordings.start itself.
Its factory retry uses the same minute policy. Health is sampled from memory by
Diagnostics; no worker RPC is needed to show unavailable. One operational note
uses the existing error list and its byte budget. Its strings contain state and
numeric failure/drop counts only, with fixed route "Recording storage". Regular
HTTP operation, route, latency and error totals are unchanged. The note's reserved
id gives current operational state priority over older request error samples.

The real watchdog observes 1024 pending calls and settles the 1101 offered calls
in 5008.671 ms, including capacity refusals, deadlines and worker retirement.
The one valid ingestion is counted once as a dropped batch with three events.
The automatic restart admits/retrieves exactly those three events. The factory
control serves the literal Task and creates a second Task during the failure,
then admits a recording after the repair/backoff. The native missing-module
control recovers with one counted worker failure. No OS resource exhaustion was
attempted.

### Refusal counter audit

Counters below count submission attempts and facts in those attempts, not an
estimate that a distinct event was lost permanently. Producer retries remain
idempotent in storage. Some failed-attempt counters are process-local; durable
admission qualifiers and successful truth remain in SQLite.

| Path | Counter and qualifier |
| --- | --- |
| Valid sequence, batch, run or action-phase conflict | Real ingestion commits dropped_batches +1 and dropped_events +N with its whole-batch run mark. No submitted fact is admitted. |
| Same conflict in dry run | Process-local dropped_batches +1 and dropped_events +N; no run mark or facts are persisted by preview. |
| Run capacity | dropped_batches +1, dropped_events +N, capacity_events +N; no new run and no storage failure. |
| App/total/transaction/physical capacity | dropped_batches +1, dropped_events +N, capacity_events +N. |
| Pinned-reader capacity | The same capacity counters; held-reader reason, no repeated storage failure per maintenance retry. |
| SQL/I/O or failed qualifier commit | dropped_batches +1, dropped_events +N, storage_failures +1; producer retains the whole batch. |
| Parent RPC queue, deadline or unavailable worker | Parent dropped_batches +1 and dropped_events +N for a valid ingestion, plus counted worker/control refusals. Read refusals count worker/control failures without inventing event losses. |
| Synchronous factory unavailable | Service-local dropped_batches +1 and dropped_events +N for a valid ingestion; factory failures remain visible in Diagnostics. |
| Identical retained retry | duplicate_batches +1; no event loss or refusal. |
| Invalid metadata, excess fields, invalid counters, auth or network refusal | No valid recording batch has been admitted/decoded at that boundary; existing content-free refusal and privacy policy stand. |

### Retention and owned readers

The accepted external-reader exception keeps logical seven-day hiding and the
physical cap while a reader prevents checkpoint/deletion progress. It never
breaks another process's transaction. Explicit valid offers can attempt bounded
recovery; automatic maintenance has a 60000 ms retry floor. Failed maintenance
while reader-held does not count a new storage failure. Worker maintenance posts
health updates so Diagnostics learns recovery even without a new recording RPC.
The compiled recovery control inspects SQLite directly after release and waits
for automatic physical deletion and the parent's available state.

Export captures at most 129 row strings, run state and status in a short read
transaction, commits, then formats/adopts at most 128 events outside it. Show
reads at most 128 row strings per transaction, commits, then materializes and
reduces. Compare has no outer snapshot. A data_version token checked from before
metadata capture through the steps refuses a concurrently changed read with an
allowlisted retry reason. The single worker cannot interleave its own writes
inside a synchronous read; external commits are detected. The run list reads at
most 101 descriptors per page. No formatting/reducer or step boundary holds a
snapshot. Queries are bounded by the existing store caps as well as row limits.

The main SQLite file remains at its high-water allocation inside the physical
cap. Expiry reduces charged usage and makes pages reusable; it does not promise
OS space reclamation. No auto_vacuum setting or incremental_vacuum call remains.

### Admission fixture and limits

Only the original continuous-admission fixture now has the authorized 30000 ms
heavy-fixture hang guard. Its 1001 admissions, payload, quota and literal bounds
are unchanged. No other pre-existing deadline or assertion is relaxed. The new
worker deadlines are part of the requested production policy. Performance claims
remain in the alternating benchmark, not the test wall-clock guard.


### Final compiled controls

The byte-only guard offers ten large read calls behind a held ingestion. Exactly
three reads refuse capacity; eight calls remain held and charge 922468 bytes,
below 1048576. Close settles the held calls. The separate count control admits
at most 1024 calls. Neither control claims those encoded charges measure heap.
Both use the real worker.

The unchanged archived hang-task-stream.ts control passes against the new
compiled server. A held recorder still permits the literal Task creation,
scheduler row_version 2, two TaskCreated and one ReminderFired stream entries;
the three sequence numbers are unique and ordered. The controlled factory
failure and native missing-module controls recover after the minute backoff.

The additional default-cap real-HTTP reader control passes. Nine valid refused
batches add exactly 1152 dropped events. Diagnostics contains the literal
reader-held explanation with the final counts, and ingestion recovers after the
independent reader releases. Its initial assertion wrongly treated the global
counters as zero: prior quota evictions already counted 140 batches / 17920
events in that run. The first two prepared executions therefore exit 1, with
the actual note preserved in reader-http3/diagnostics.json. The corrected control
asserts nine / 1152 increments over the last accepted receipt and exits 0.
The original archived HTTP witness remains unchanged. The earlier attempt to
create this helper via Bun stdin without its run command also exits 1 before
execution and is not a product failure. The later helper type check also caught a
mutable optional baseline captured in a closure; binding its expected label
before the closure fixes that preparation error. helper-types-final3 exits 0.

### Frozen cost comparison after corrections

Ingestion has observable cost. The strongest association is the synthetic
32-producer flood: Task write p50 changes from median 3.037 to 38.000 ms;
paired differences are 35.339 ms [29.241, 39.489]. All 2000 measured reads and
2000 writes satisfy literal response and state assertions. Of 6400 flood
batches, 2519 are accepted and 3881 refused. Correctness and prompt failure
containment do not promise latency isolation under a flood.

For the 16-event, 128-event and eviction cells all ten write differences are
positive, but their magnitudes lie inside the pair-to-pair spread. Treat the
size of those effects as inconclusive on this busy host; do not read that as
no overhead. All read differences and the expiry write difference are also
inconclusive. Raw boundaries record one-minute loads from 7.722 to 18.269.
No imposed CPU pressure or extra verification run overlapped this comparison.

The same compiled server/CLI pair is used on both sides, with ingestion absent
or present, ten alternating pairs per scenario and twenty checked reads and
writes per cell. The frozen recipe and its assertions are unchanged. Its
source manifest is source-frozen.json, hash
057a2b81f7d026986b175ba165d6cc67d06f1bf8ab8da9550890102a90c21781.
HEAD in that precommit manifest is the base; the source hash identifies the
corrected working tree. Earlier build manifests and failed preparations remain
separate receipts. raw.json records every duration, producer outcome, load
boundary and CPU value; summary.json, tables.md and comparison.html reduce
those same 100 cells.

There is no synchronous recordings SQLite call on the Task request thread.
The native seed transaction maximum observed here is 175.048 ms, beyond the
2 ms criterion, so SQLite remains in the worker. The 5000 ms watchdog still
has over 28 times that observed maximum as margin. Request decoding, metadata
validation, request encoding and bounded queue admission still execute on the
server thread. Under the flood, server CPU across threads is median 9945 ms
per cell against 250 ms without ingestion; driver CPU with ingestion is
806 ms. This locates substantial work in the server process, not merely the
load generator. It does not distinguish HTTP schema/encoding work, SQLite,
fsync or scheduling contention: the exact limiter is not profiled, so these
are end-to-end observations rather than a causal component estimate.
No allocation count is claimed. A quiet-machine confirmation under the
unchanged ceiling is owed at integration.

| Challenge | Read p50 without / with | Write p50 without / with | Accepted / dropped batches |
| --- | --- | --- | --- |
| 16 events | 2.414 [2.025, 3.062] / 2.547 [1.958, 2.861] | 2.392 [1.968, 2.700] / 3.842 [3.072, 4.126] | 200 / 0 |
| 128 events | 2.598 [2.406, 3.384] / 2.619 [1.808, 3.749] | 2.542 [2.232, 3.886] / 5.354 [3.756, 7.867] | 200 / 0 |
| 32 producers | 3.062 [2.403, 3.384] / 2.768 [2.564, 3.231] | 3.037 [2.529, 3.280] / 38.000 [32.287, 42.504] | 2519 / 3881 |
| Expiry | 2.197 [1.389, 2.823] / 2.382 [1.421, 3.394] | 2.268 [1.470, 2.845] / 2.842 [1.926, 3.982] | 0 / 0 |
| Eviction | 1.590 [1.284, 3.681] / 2.002 [1.261, 3.735] | 1.657 [1.298, 3.889] / 4.174 [2.841, 9.372] | 200 / 0 |

| Challenge | Read paired differences, pairs 1 through 10, ms | Write paired differences, ms |
| --- | --- | --- |
| 16 events | -0.628, 0.579, 0.257, -0.632, 0.493, -0.126, 0.111, 0.179, 0.051, 0.338 | 0.663, 2.004, 1.247, 0.494, 1.432, 1.457, 1.010, 1.539, 1.760, 1.485 |
| 128 events | -0.277, -0.658, 0.069, -0.093, -0.914, 0.330, -0.200, 0.671, 0.456, 0.426 | 2.982, 1.518, 3.159, 3.299, 0.508, 1.536, 0.933, 4.770, 5.004, 4.079 |
| 32 producers | -0.174, -0.777, 0.500, -0.085, -0.574, 0.328, -0.481, -0.010, 0.057, -0.405 | 35.034, 32.305, 29.241, 39.489, 30.192, 35.645, 32.133, 38.745, 38.188, 36.729 |
| Expiry | 0.887, 0.274, 0.385, -0.572, 0.520, 0.032, 0.134, -0.696, 0.026, 0.570 | 1.548, 0.930, 0.831, -0.077, 0.654, 0.456, 0.713, -0.181, 0.671, 1.141 |
| Eviction | -0.658, 0.649, 0.882, 0.905, -0.900, 0.304, 0.367, 0.661, 0.112, -0.016 | 0.974, 2.730, 3.520, 2.725, 0.851, 2.008, 2.135, 2.685, 4.803, 5.483 |

| Challenge | Server CPU without / with, ms | Driver CPU with, ms | Boundary one-minute load range |
| --- | --- | --- | --- |
| 16 events | 220.000 [200.000, 230.000] / 400.000 [340.000, 420.000] | 28.715 [19.517, 58.658] | 7.846 to 8.339 |
| 128 events | 235.000 [210.000, 290.000] / 730.000 [670.000, 880.000] | 45.861 [32.315, 84.659] | 7.722 to 9.767 |
| 32 producers | 250.000 [220.000, 260.000] / 9945.000 [9700.000, 10420.000] | 805.712 [776.301, 862.504] | 10.097 to 14.618 |
| Expiry | 210.000 [160.000, 240.000] / 420.000 [330.000, 490.000] | 16.099 [11.382, 20.311] | 9.157 to 12.377 |
| Eviction | 180.000 [140.000, 320.000] / 900.000 [720.000, 1330.000] | 37.620 [30.772, 60.621] | 8.452 to 18.269 |


### Commands, exits and integration debt

Evidence root is docs/evidence/ui-speed/recordings-sql-corrections (E below).
All receipts, scratch data, binaries and visuals are ignored. Reusable controls
are in the verification skill. The original reds were run before product edits
at 475d6a2b and retained with their unchanged sources.

| Command / control | Real exit and receipt |
| --- | --- |
| pnpm --filter @todo/domain test recordings-sql-review.test.ts, before corrections | 1; red-native.log, five failing controls |
| Original compiled client-hang.ts | 1 before / 0 after; red-hang and green-hang |
| Original start-fault.ts with compiled start-failure-server | 1 before / 0 after; red-start and green-start |
| pnpm --filter @todo/domain test recordings-sql-review.test.ts, corrected | 0; green-native-final.log, six controls |
| Original compiled boundary.ts against scratch Task DB and copy | 0; green-boundary2.log; prior copy validation attempt 1 is retained |
| .scratch/bin/sqlite-watchdog E/watchdog | 0; watchdog.exit |
| bun .agents/skills/verify-ui-profiler/scripts/sqlite-factory.ts E/factory-green | 0; factory-green.exit |
| bun .agents/skills/verify-ui-profiler/scripts/sqlite-worker-missing.ts E/native-worker | 0; native-worker.exit |
| bun .agents/skills/verify-ui-profiler/scripts/sqlite-reader.ts E/reader | 0; reader.exit |
| .scratch/bin/sqlite-byte-bound E/bytes | 0; bytes.exit |
| Original hang-task-stream.ts and compiled worker-fault-server | 0; isolation.exit, isolation.json |
| bun .agents/skills/verify-ui-profiler/scripts/sqlite-reader-http.ts E/reader-http-final | 0; reader-http-final.exit |
| pnpm --filter @todo/domain test | 0; domain.exit; 450 tests |
| pnpm --filter @todo/server test | 0; server.exit; 38 tests |
| bun --bun node_modules/typescript/bin/tsc -p .agents/skills/verify-ui-profiler/tsconfig.json | 0; helper-types-final3.exit |
| bun apps/server/scripts/scratch-diagnostics.ts build | 0; build-frozen.exit and source-frozen.json |
| TODO_PROFILER_STRESS=1 bun .agents/skills/verify-ui-profiler/scripts/verify.ts E/producer | 0; producer.exit, 700-batch pressure plus HTTP/CLI/privacy assertions |
| bun .agents/skills/verify-ui-profiler/scripts/completeness.ts E/completeness | 0; completeness.exit |
| bun .agents/skills/verify-ui-profiler/scripts/corrections.ts E/identities | 0; identities.exit |
| bun .agents/skills/verify-ui-profiler/scripts/admission-fault.ts E/admission-fault | 0; admission-fault.exit |
| .scratch/bin/sqlite-crash E/crash | 0; crash.exit, 20 real kills around SQL transaction boundaries |
| bun .agents/skills/verify-ui-profiler/scripts/sqlite-wire.ts E/wire | 0; wire.exit, 95-event paging and restart |
| bun .agents/skills/verify-ui-profiler/scripts/sqlite-writers.ts E/writers | 0; writers.exit, two real servers |
| .agents/skills/verify-ui-profiler/scripts/sqlite-full.sh E/full | 0; full.exit, real ENOSPC with Task/scheduler controls |
| bun .agents/skills/verify-ui-profiler/scripts/sqlite-expiry.ts E/expiry | 0; expiry.exit, retry floor |
| TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh E/diagnostics | 0; diagnostics.exit, terminal_pngs HOLD |
| .agents/skills/verify-server-api/scripts/verify.sh E/api | 0; api.exit |
| .agents/skills/verify-auth/scripts/verify.sh E/auth | 0; auth.exit |
| Compiled apps/server/scripts/verify-diagnostic-faults.ts driver | 0; recorder-faults.exit, 47 fault controls |
| Compiled apps/server/scripts/verify-diagnostic-payload-budget.ts | 0; payload.exit, 10000 requests / 200 clients |
| TODO_RECORDING_COST_REQUESTS=20 /usr/bin/lockf -k /tmp/todo-ui-profiler-benchmark.lock bun .agents/skills/verify-ui-profiler/scripts/sqlite-cost.ts E/cost | 0; cost.exit, 100 cells |
| bun .agents/skills/verify-ui-profiler/scripts/sqlite-report.ts E/cost | 0; cost-report.exit |
| bun packages/api/scripts/openapi.ts --check | 0; contract.exit, also in root check |
| sh scripts/disk-guard.sh, then /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check, first run | guard 0 / check 1; disk-root and root receipts |
| Same disk guard and exact locked root command, second run | 0 / 0; disk-root2 and root2 receipts |

The first root run fails only the unchanged CLI auth-history assertion
"records one selected-Profile rejection for expired http show": expected
expired, observed invalid_credential. Its boundary one-minute loads are
8.50 and 8.37. The exact rerun passes 450 domain, 38 server, 80 CLI and 168
Electron tests, with the existing one skip; loads are 8.08 and 6.47. No worker
cap, timeout override or tracked recipe change was used for either root run.
The sole authorized fixture timeout change is the 1001-admission worker
fixture's heavy-fixture guard, already stated above. The first guard reports
61.0 GB free; the second 56.6 GB, both above the 30 GB soft floor.

Old and new contract id are both
55c6d138cc924128593b25ef0313d898a6725bd0c0d91e026d09ad24536f28c8.
The HTTP schema and existing JSON keys are unchanged. No pins, OpenAPI goldens
or Swift sources change. Task store.ts and projection.ts are byte-identical
to 475d6a2b; neither formal source mapping is touched.

Cleanup removes 64 closed owned Bun compile temporaries after lsof checks:
5674295296 logical bytes / 5674369024 allocated bytes, zero open-file skips.
The final guard reports 51.3 GB free. APFS sharing and other units' activity mean
these file charges are not an attributed global free-space delta. Cited evidence
and binaries remain. The actual app cadence with two and three producers remains
owed at integration, as does quiet-machine confirmation. Terminal PNG rendering
remains owed to a unit holding the Swift slot. No Swift, native app, signing,
Keychain, real user data or push was used.


## SQLite progress and format corrections

This delivery is on top of 9da2a17ae757d32d820cf1b829bdc384d656c40f and
supersedes its three-deadline retirement rule and incomplete format guard.
The second SQLite review is read in full. SQL1 through SQL6 stand as reviewed;
SQL7 and SQL8 are reproduced before edits and corrected here. No migration is
needed: this unit has never been installed. No Swift, native app, Keychain,
signing, push or real user data is used.

### SQL7: call expiry is separate from inactivity

The unchanged compiled 128-Show witness first passes on the lightly loaded
host. This is a real positive boundary, not a red result. With the explicit
six-process pressure switch it fails as reported: five bursts return 71–91
correct replies before retiring a healthy worker, with 37–57 refused calls,
at end loads 9.75–10.24. The unchanged 224-request HTTP witness under pressure
returns 74 successes / 150 refusals, then unrelated ingestion returns 500.
Its load boundaries are 12.81 and 13.47. Both pressure witnesses exit 1.
The earlier HTTP preparation failure occurred because cached binaries had been
pruned; it is retained separately and not counted as a product reproduction.

The corrected compiled 128-call witness exits 0. The final repeat has boundary
loads 15.11 and 15.25, and individual burst endpoints reach 15.68. Every one of
its five repeats stays available, despite allowed per-call refusals. Its 60–71
successful replies per burst all carry the literal 4096 starts. The corrected
pressure HTTP control returns 83 successes / 141 refusals and ingestion 200,
at loads 10.36–10.73. A further final-source HTTP repeat also exits 0. These
controls never require all reads to complete within five seconds; they require
settlement and correct results without a global recording blackout. Task reads
and the literal subsequent Task creation continue to pass.

The parent now owns the FIFO and dispatches one operation at a time. A call
keeps its 5000 ms deadline from admission. Its expiry is counted and refused
with the fixed content-free rpc_deadline reason. Expired queued calls are
removed before dispatch. An expired dispatched call stays charged in bytes
and count until its actual reply or retirement, while its caller has settled.
A late valid reply releases that charge and updates rate/health without
completing the caller a second time.

Admission retains the 1024-call / 1048576-byte bounds and adds a predicted
work bound of 5000 ms. Each method retains at most eight actual dispatch-to-
reply service samples, expiring after 60000 ms. Its estimate is 1.5 times
the largest sample, with cold floors in milliseconds: Show 25, Compare 50,
export 10, other methods 1. Pending work is the sum of these estimates.
Dispatched work consumes at least its estimate or its elapsed time, whichever
is larger. An overrun therefore cannot be treated as zero remaining work.
New work that exceeds the prediction budget refuses immediately with
rpc_capacity; valid ingestion still counts one dropped batch and its N events.
The model is a recent observed-work estimate, not a real-time guarantee; cold
bursts and outliers may still expire locally. No queued expiry retires a worker.
The separate count and byte controls retain their literal limits.

Only inactivity retires a stalled operation. A 10000 ms watchdog is armed for
an in-flight operation, including initialization. Every valid reply and every
bounded long-read progress message resets it. Show signals after each
128-row capture/materialization step and after reduction. Export and run-list
boundaries also report progress. There is no timer heartbeat on the busy
worker that could pretend a stopped step had progressed. Signals carry only
an internal call number and elapsed milliseconds. Error/exit handling still
retires failed workers; recovery retains the 60000 ms backoff. Closing settles
within the caller deadline and cancels recovery.

The compiled progress control deliberately slows each read step by 350 ms.
On the final source, the caller refuses at 5014.356 ms while the worker stays
available through the long read. Its worst observed step is 541.262 ms and its
load rises from 13.18 to 16.79. The ten-second inactivity limit is over 18 times
that deliberately slowed measured worst step. A subsequent read-rate control
refuses excess admission without retirement. Stopping the third read step
settles the caller at 5003.032 ms, refuses another ingestion immediately at
admission, and retires for inactivity at 10023.594 ms. No signals continue from
the stopped worker. The genuine held-ingestion witness separately settles all
1101 offers around five seconds, waits for inactivity retirement, and recovers
on the minute backoff with exactly three retrievable events.

The first prepared progress control failed because it attempted a new full
read immediately after observing an eleven-second read. The new rate guard
correctly refused that work. The corrected control explicitly asserts that
refusal and uses a fresh client to test ordinary read-rate admission. Its
injected-step, deadline, inactivity and availability assertions are unchanged.
The old watchdog expectation that retirement coincided with caller deadlines
is replaced by separate deadline and inactivity assertions. The caller's old
eight-second settlement guard and every pre-existing product-test timeout
remain unchanged. Readiness still settles within five seconds; initialization
can continue until its separate inactivity bound.

### SQL8: complete recognition before mutation

The archived events(x TEXT) witness exits 1 before the change: its hash and
modes change. It exits 0 afterwards with the same hash and modes. Six new
native controls also fail first and pass after: an overlapping events table,
right table names with a renamed content column, wrong application id, wrong
version, missing index and missing trigger. Each refused file retains its SHA,
0640 file mode and 0750 directory mode. Positive controls initialize an existing
empty file and reopen a genuine store, with the expected identifier/version.

recording-format.ts holds one DDL definition and its expected complete SQLite
catalog. The expected catalog is built once in an isolated in-memory database;
file recognition itself is read-only. Application id is 0x544f4452 and schema
version is 1. Catalog matching includes all tables, columns/constraints via
their exact stored DDL, implicit and explicit indexes and triggers. Integrity
and foreign-key checks still run. A missing or extra object also refuses.

The opener uses exclusive create to distinguish a new file. A file created by
this call, or an existing empty file, may initialize. Any other file must pass
identifier, version and exact-catalog recognition read-only before chmod, WAL
configuration or DDL. Initialization sets schema and identity transactionally.
A refused foreign file receives no repair or format conversion. The earlier
unidentified recording format is intentionally refused, not migrated. The Task
database remains separate and is never attached to this database.

### Seat cost observations carried forward

The seat's profiling-only copy measured mean block totals per 32-upload wave:
JSON parsing 1.880 ms, strict validation 11.857 ms, worker dispatch 2.262 ms.
The latter includes envelope encoding 0.986 ms and structured cloning 1.228 ms.
These block averages are not an additive decomposition of a Task percentile.
They show substantial synchronous validation on the Task-serving thread.
The early-refusal counterfactual reduced Task-write p50, but lost valid-refusal
accounting and malformed-body precedence. It is not shipped here. Queue/rate
admission in this change still follows strict ingestion validation.

At the seat's assumed 128-event cadence, two producers at 10 batches/s each
add median 1.469 ms to Task-write p50 [0.927,2.168]; three add 2.053 ms
[1.002,2.660]. At one batch/s the write estimates lie within variation.
These are assumed server-request rates, not measured app cadence or physical
presentation time. The actual two- and three-app cadence remains integration
debt. No early-validation optimization is implemented in this correction.


### Gates and disk hold

Evidence for this correction is docs/evidence/ui-speed/recordings-sql-progress.
Raw red/green witnesses are retained separately. Reusable controls are in the
verification skill; generated evidence and binaries stay ignored. Final HTTP
control returns 83 successful reads and 141 local refusals, followed by ingestion
200. Its task/state assertions pass.

The final-source root check is root3. Disk guard runs first, then exactly
/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check, without environment worker
caps or timeout overrides. It passes 457 domain, 38 server, 80 CLI and 168
Electron tests, with the existing one skip. The earlier root control also
passes before the final active-overrun admission tightening. The intermediate
root-final run under imposed pressure exits 1 because the unchanged Electron
guarded-run test "preserves literal argv and exit through direct fake delegates"
times out at 5000 ms, observed 6180 ms. No Electron source or test is changed;
the exact final-source rerun after pressure exits 0. Every raw result is kept.
No pre-existing product-test deadline is changed in this correction.

| Receipt label | Actual command | Exit |
| --- | --- | --- |
| producer-final | env TODO_PROFILER_STRESS=1 bun .agents/skills/verify-ui-profiler/scripts/verify.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/producer-final | 0 |
| diagnostics-final | env TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh $PWD/docs/evidence/ui-speed/recordings-sql-progress/diagnostics-final | 0 |
| api-final | .agents/skills/verify-server-api/scripts/verify.sh $PWD/docs/evidence/ui-speed/recordings-sql-progress/api-final | 0 |
| domain | command in domain.log | 0 |
| contract | bun packages/api/scripts/openapi.ts --check | 0 |
| types | command in types.log | 0 |
| helper-types-final | command in helper-types-final.log | 0 |
| completeness | bun .agents/skills/verify-ui-profiler/scripts/completeness.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/completeness | 0 |
| identities | bun .agents/skills/verify-ui-profiler/scripts/corrections.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/identities | 0 |
| admission-fault | bun .agents/skills/verify-ui-profiler/scripts/admission-fault.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/admission-fault | 0 |
| wire | bun .agents/skills/verify-ui-profiler/scripts/sqlite-wire.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/wire | 0 |
| identity | bun .agents/skills/verify-ui-profiler/scripts/sqlite-identity.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/identity | 0 |
| continuous | .scratch/bin/sqlite-continuous $PWD/docs/evidence/ui-speed/recordings-sql-progress/continuous | 0 |
| crash | .scratch/bin/sqlite-crash $PWD/docs/evidence/ui-speed/recordings-sql-progress/crash | 0 |
| writers | bun .agents/skills/verify-ui-profiler/scripts/sqlite-writers.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/writers | 0 |
| startup | bun .agents/skills/verify-ui-profiler/scripts/sqlite-startup.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/startup | 0 |
| full | .agents/skills/verify-ui-profiler/scripts/sqlite-full.sh $PWD/docs/evidence/ui-speed/recordings-sql-progress/full | 0 |
| expiry | bun .agents/skills/verify-ui-profiler/scripts/sqlite-expiry.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/expiry | 0 |
| auth | .agents/skills/verify-auth/scripts/verify.sh $PWD/docs/evidence/ui-speed/recordings-sql-progress/auth | 0 |
| recorder-faults | .scratch/bin/verify-diagnostic-faults $PWD/docs/evidence/ui-speed/recordings-sql-progress/recorder-faults | 0 |
| watchdog-final | .scratch/bin/sqlite-watchdog $PWD/docs/evidence/ui-speed/recordings-sql-progress/watchdog-final | 0 |
| progress-final | .scratch/bin/sqlite-progress $PWD/docs/evidence/ui-speed/recordings-sql-progress/progress-final | 0 |
| http-final | bun .scratch/recordings-sqlite2-s1/http-healthy-burst.ts .scratch/bin/todo-server final224 224 | 0 |
| root | /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check | 0 |
| root-final | /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check | 1 |
| root3 | /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check | 0 |

The frozen cost command is the unchanged sqlite-cost.ts busy-host variant with
TODO_RECORDING_COST_REQUESTS=20, ten alternating pairs per scenario, loads at
every boundary and literal Task read/write assertions. The compiled source
manifest is source-final.json, hash
2dad926ef22fb8ce4d1e6f17b22c834e680ac3708652de98fcb4095c317d66a6.
Its precommit HEAD is the base; the hash identifies the corrected source tree.
There is no imposed pressure or other verification job during this comparison.
Routine progress/disk inventory checks still occur on this busy host.

The coordinator ordered a disk hold while that comparison was in flight. Its
command is allowed to finish. No further compile, suite or large evidence write
starts afterwards. Closed owned temporaries and superseded binaries are retired
with hashes retained, and completed work is committed before parking. The
archived real Task-database/copy boundary control has not been re-executed after
SQL8 in this delivery and remains explicitly owed after the hold. The native
foreign-table and format refusal cases, real-store reopen, existing Task API
and isolation recipes pass. Cost reduction/interpretation and final review can
continue only after the coordinator releases the hold.

Old and new HTTP contract id are both
55c6d138cc924128593b25ef0313d898a6725bd0c0d91e026d09ad24536f28c8.
The contract check and both passing root checks prove that no TypeScript pin,
OpenAPI, golden or generated Swift change is needed. Task store.ts and
projection.ts remain byte-identical to 9da2a17a; no formal mapping is renewed.
Quiet-host confirmation, actual app uploader cadence with two/three producers
and terminal PNG rendering with the Swift slot remain integration debt.


### Parked checkpoint

The in-flight frozen comparison finishes all 100 cells and exits 0. Its raw
result and command receipt remain in docs/evidence/ui-speed/recordings-sql-progress/cost and cost.command.json. No new
suite, compile or cost-reduction run starts after the disk hold. Workspace
prefixes in the command table are normalized to $PWD; exact expanded arguments
remain in the ignored receipts.

Before the cost run, closed compile-temporary cleanup removed 26 files with
2305212416 allocated bytes. After the command finished, retirement removed
14 further closed proof binaries/temporaries with 1256923136 allocated bytes
(1256887290 logical bytes), zero open-file skips. SHA-256 hashes and file paths
are retained in park-retired.json. The current compiled CLI, server and seed
remain; their source manifest matches the final tested source. These are file
charges, not an attributed APFS free-space delta. The final guard reports
32.0 GB free, and the whole checkout measures about 1.95 GiB after retirement.
The original Task-database/copy control and cost interpretation remain owed
under the coordinator's hold. The branch is committed and parked until the
coordinator gives the word to continue.


## Resume verification after disk hold

The coordinator lifted the hold and restored the standing 30 GiB soft floor.
The implementation remains 6468bd05db5b8bef498699b3a72fb07b69f42674. This follow-up
adds a reusable boundary control, its skill instructions and these receipts;
no product source changes. All work deferred by the hold is now complete.

### Finding receipts and chosen limits

SQL7 retains both unchanged seat witnesses and their failing-first results on
9da2a17a: compiled 128-Show client exit 1, real HTTP 224-Show control exit 1.
The lightly loaded pre-fix client positive boundary remains separately labelled
exit 0. After the fix the archived client and HTTP witnesses exit 0. The final
client control passes five repeats at loads 15.10 through 15.68 with no healthy
worker retirement. The HTTP control accepts unrelated ingestion after the burst.
The slow-progress and stopped-read controls, genuine held-worker recovery, and
Task/state assertions remain green in the final-source pre-hold receipts.

Call/readiness deadlines stay 5000 ms and expire only the caller. The separate
inactivity watchdog is 10000 ms. Valid replies and bounded long-read steps reset
it. The largest deliberately slowed step observed at loads 13.18 to 16.79 is
541.262 ms, giving more than 18 times that duration as inactivity margin.
Queued expiry cannot retire the worker. One operation is dispatched at a time;
expired queued work is never dispatched, and expired active work keeps its
charge until reply or retirement. The 1024-call / 1048576-byte admission bounds
remain, plus a 5000 ms work estimate: 1.5 times the maximum of the last eight
service samples per method, with 60000 ms expiry. Cold floors are Show 25 ms,
Compare 50 ms, export 10 ms and other methods 1 ms. Active work consumes the
larger of its estimated service and its elapsed time. Admission refuses overload
with counted content-free refusals. Actual inactivity/failure uses the existing
60000 ms recovery backoff. No product test deadline is relaxed.

SQL8 retains the archived events(x TEXT) witness at exit 1 before / 0 after.
The six broader native refusal cases are red before and green after; the current
seven-test format suite passes again. The original real Task-database/copy
boundary witness now passes on the final source. The new compiled
sqlite-format-boundary control additionally asserts both directories remain
0750 and both files remain 0640, with identical before/after SHA-256 hashes.
A scratch Task database is created through the compiled CLI, not synthesized
as a one-table approximation. Its copy is refused with the same guarantees.
Real store reopen and existing-empty-file initialization controls pass.

Recognition remains read-only before any mode change, journal switch or DDL:
application id 0x544f4452, user_version 1 and the exact owned catalog, followed
by integrity/foreign-key checks. Only an exclusively created or empty file may
initialize. The unit has never been installed; no migration is provided.

### Refreshed gates

The three skill recipes pass again after the hold, using fresh scratch data.
verify-diagnostics uses its explicit no-Swift mode; terminal PNGs remain HOLD.
The exact root command passes on its first resumed run: 457 domain, 38 server,
80 CLI and 168 Electron tests, with the existing one skip. Its one-minute loads
are 5.076 at start and 5.697 at end. Disk guard runs first; the 30 GiB check also
passes. No worker cap or timeout override is used. Earlier pressure failures
and the unchanged Electron five-second timeout remain in the historical section.

| Receipt | Actual command | Exit |
| --- | --- | --- |
| resume-boundary-original | bun .scratch/recordings-sqlite-s1/database-boundary.ts | 0 |
| resume-boundary | .scratch/bin/sqlite-format-boundary $PWD/docs/evidence/ui-speed/recordings-sql-progress/resume/boundary | 0 |
| resume-helper-types | bun --bun node_modules/typescript/bin/tsc -p .agents/skills/verify-ui-profiler/tsconfig.json | 0 |
| resume-types | pnpm typecheck | 0 |
| resume-format | pnpm --filter @todo/domain test recording-format.test.ts | 0 |
| resume-contract | bun packages/api/scripts/openapi.ts --check | 0 |
| resume-producer | env TODO_PROFILER_STRESS=1 bun .agents/skills/verify-ui-profiler/scripts/verify.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/resume/producer | 0 |
| resume-diagnostics | env TODO_DIAGNOSTICS_NO_SWIFT=1 .agents/skills/verify-diagnostics/scripts/verify.sh $PWD/docs/evidence/ui-speed/recordings-sql-progress/resume/diagnostics | 0 |
| resume-api | .agents/skills/verify-server-api/scripts/verify.sh $PWD/docs/evidence/ui-speed/recordings-sql-progress/resume/api | 0 |
| resume-root | /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check | 0 |
| resume-cost | env TODO_RECORDING_COST_REQUESTS=20 /usr/bin/lockf -k /tmp/todo-ui-profiler-benchmark.lock bun .agents/skills/verify-ui-profiler/scripts/sqlite-cost.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/resume/cost | 0 |
| resume-cost-report | bun .agents/skills/verify-ui-profiler/scripts/sqlite-report.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/resume/cost | 0 |
| resume-prior-cost-report | bun .agents/skills/verify-ui-profiler/scripts/sqlite-report.ts $PWD/docs/evidence/ui-speed/recordings-sql-progress/cost | 0 |

Evidence stays under docs/evidence/ui-speed/recordings-sql-progress; resumed fixture output is under its resume directory.
Only reusable inputs are tracked. The compiled product source hash remains
2dad926ef22fb8ce4d1e6f17b22c834e680ac3708652de98fcb4095c317d66a6.
The precommit manifest's HEAD is the earlier base; the source hash and unchanged
apps/packages diff identify the actual tested implementation.

### Frozen cost result

The fresh same-binary comparison completes 100 cells, ten alternating pairs
per scenario, with 20 literal Task reads and writes per cell: 2000 reads and
2000 writes all pass. No imposed pressure or other verification job overlaps.
Boundary one-minute loads range from 4.195 to 6.635. The tracked recipe, defaults,
quiet ceiling and assertions are unchanged; TODO_RECORDING_COST_REQUESTS=20 is
the already declared bounded variant.

The synthetic 32-producer flood adds median 10.329 ms to Task-write p50, with
paired range [8.770,12.683]. It accepts 2423 / 6400 batches and counts 3977
refusals. Server CPU across threads is median 4675 ms per cell with ingestion
versus 105 ms without; driver CPU with ingestion is 395 ms. This confirms real
server work, not just load-generator work. It does not apportion a percentile
among validation, cloning, SQLite and I/O. The seat's component measurements and
assumed real-cadence costs above remain relevant; early validation refusal is
still not shipped. The native seed maximum is 41.352 ms, so SQLite remains in
the worker under the two-millisecond criterion. No allocation count is claimed.

Write differences for 16-event cells and eviction are positive beyond their
pair-to-pair spread. Read effects, expiry writes and the magnitude of the
128-event write effect lie within variation and are inconclusive, not evidence
of no overhead. The earlier pre-hold run also completes and is now
reduced: its flood paired median is 20.215 ms [10.667,38.776]. Both runs use the
same implementation with different host/disk conditions. Their differences do
not establish a software speedup. All pair values, loads, CPU and outcomes are
preserved in each run's raw.json and tables.md.

| Challenge | Read p50 without / with | Write p50 without / with | Accepted / dropped batches |
| --- | --- | --- | --- |
| 16 events | 1.036 [0.743, 1.325] / 1.108 [0.812, 1.209] | 1.069 [0.706, 1.343] / 1.792 [1.327, 1.998] | 200 / 0 |
| 128 events | 1.008 [0.728, 1.314] / 1.122 [0.832, 2.315] | 1.015 [0.691, 1.221] / 2.595 [1.959, 4.008] | 200 / 0 |
| 32 producers | 0.852 [0.719, 1.102] / 0.931 [0.766, 1.145] | 0.871 [0.696, 1.106] / 11.183 [9.522, 13.789] | 2423 / 3977 |
| Expiry | 0.992 [0.808, 1.482] / 0.902 [0.850, 1.245] | 0.958 [0.793, 1.646] / 1.345 [1.322, 2.022] | 0 / 0 |
| Eviction | 0.846 [0.811, 1.258] / 0.979 [0.893, 1.379] | 0.906 [0.827, 1.524] / 2.295 [2.180, 2.841] | 200 / 0 |

| Challenge | Read paired differences, pairs 1 through 10, ms | Write paired differences, ms |
| --- | --- | --- |
| 16 events | 0.113, 0.043, 0.102, 0.077, 0.036, -0.011, -0.144, -0.033, 0.069, -0.063 | 0.800, 0.631, 0.759, 0.669, 0.662, 0.637, 0.655, 0.701, 0.621, 0.479 |
| 128 events | 0.105, 0.130, 0.224, 0.033, 0.033, -0.185, 0.185, 0.020, 1.356, 0.104 | 1.662, 1.615, 1.564, 1.485, 1.505, 1.460, 1.642, 1.364, 3.056, 1.267 |
| 32 producers | -0.031, 0.022, 0.194, 0.165, 0.353, -0.038, 0.043, -0.111, -0.002, 0.064 | 8.889, 8.770, 9.892, 10.351, 10.790, 10.483, 12.683, 9.926, 10.733, 10.307 |
| Expiry | 0.095, -0.132, -0.050, 0.174, 0.026, -0.081, -0.138, -0.564, 0.149, -0.348 | 0.589, 0.401, 0.442, 0.624, 0.518, 0.369, 0.321, -0.314, 0.933, 0.188 |
| Eviction | 0.192, 0.103, 0.129, -0.089, 0.137, 0.097, 0.167, 0.120, 0.082, 0.122 | 1.327, 1.528, 1.374, 1.244, 1.523, 1.376, 1.402, 1.475, 1.353, 1.317 |

| Challenge | Server CPU without / with, ms | Driver CPU with, ms | Boundary one-minute load range |
| --- | --- | --- | --- |
| 16 events | 125.000 [90.000, 160.000] / 240.000 [170.000, 260.000] | 19.006 [10.234, 32.390] | 5.378 to 6.635 |
| 128 events | 125.000 [90.000, 150.000] / 465.000 [340.000, 610.000] | 25.814 [15.576, 46.953] | 5.631 to 6.344 |
| 32 producers | 105.000 [90.000, 140.000] / 4675.000 [4000.000, 5380.000] | 394.944 [333.912, 463.512] | 4.781 to 5.801 |
| Expiry | 110.000 [100.000, 180.000] / 210.000 [200.000, 320.000] | 8.149 [6.879, 13.674] | 4.533 to 5.000 |
| Eviction | 110.000 [100.000, 160.000] / 535.000 [500.000, 690.000] | 24.957 [21.103, 33.114] | 4.195 to 4.833 |


Old and new contract id are both
55c6d138cc924128593b25ef0313d898a6725bd0c0d91e026d09ad24536f28c8.
The fresh contract and root checks pass. No TypeScript pin, golden, OpenAPI or
Swift source changes; no formal mapping changes because Task store.ts and
projection.ts remain byte-identical. No native app, Swift, Keychain, signing,
real user data or push is used. Quiet-machine confirmation under the unchanged
ceiling, actual two/three-app upload cadence and terminal PNG rendering remain
integration debt, as already agreed. No core verification remains held on disk.

Final resumed cleanup retires 5 closed proof binaries/compile temporaries,
446353408 allocated bytes, with zero open-file skips. SHA-256 hashes remain
in resume/retired.json; source inputs and every cited receipt remain. The final
guard reports 126.0 GB free. No global free-space delta is attributed to these
file charges. Archived SQL7/SQL8 input hashes match their originals, recorded
in resume/witnesses-unchanged.json. The current compiled CLI/server/seed stay
for reproducibility; no binary or generated evidence is tracked.
