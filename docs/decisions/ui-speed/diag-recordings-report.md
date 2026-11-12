# Private Diagnostics recordings

The correction after the d1541167 review addresses S1-1 through S1-4. The
contract remains cf81754585ee1525358bfe8a3357ff83a2024f8a350fe7a6d493afc9c61f7668.
The correction evidence and current gates are in the final section below. The
original delivery sections describe d1541167 and retain their original receipts.

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

