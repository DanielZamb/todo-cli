# Purge restore raw History and immediate erasure

R1 and R2 from the second correctness review are implemented on top of
`e99d146ca8062fe71d9862f94403e94491a902c4`. The product and verification source
is `e520abd4f23862e71c8df2376b57cd878b8219a6`. The approved AtomicCAS mapping
renewal is `41405b033b90a90a5207a10c9cca9924732ec60d`. This report adds no
product change. The constructor mapping remains a candidate pending the seat.

## Raw stored bytes decide the skip

`redactTaskHistory` reads the actual `op_log.event` text and SQL `entity_version`
for the selected row. It skips UPDATE only when that text equals the generated
redacted output and the column is already 1. A decoded event no longer decides
whether stored private content can remain.

Six cases cover live startup, stored-copy redaction and restore staging. Each
path has a private-key case and a metadata-only History-row case. The private
keys are deliberately unknown to the decoder, which demonstrably drops them.
After reapplication, the stored text contains neither private key and the SQL
column is 1. Raw checkpoint payloads also receive unknown-key controls.
Their existing skip compares generated content with the original `payload`
string from SQLite. No decoded checkpoint value stands in for stored bytes.

Canonical copies remain byte-stable. The probes compare actual file checksums
with manifests across three additional applications after repair. The existing
checksum-stability, orphan-repair, foreign-key and immutable-trigger tests pass.

## Cleanup finishes before restore returns

The only store.ts change is the approved fifth argument to new Snapshots:
`this.attachmentRoot`. Snapshots stores it in the matching readonly constructor
parameter. No other store statement, cleanup flag, callback or function changed.

After restore's transaction returns, the pass runs only for an applied
persistent restore with no transaction still open. Each job gets its own
supplied guarded transaction. That transaction checks the id against the durable
Purge union again, calls the existing `eraseTaskAttachments`, then deletes the
job. A queue row alone does not authorize erasure.

An erasure failure rolls back that job's deletion and leaves the successful
restore report unchanged. No response field or contract id was added. Repeating
an applied restore retries the job. Existing store-open and Purge cleanup paths
also retry it. There is no dedicated CLI, HTTP or desktop view of pending jobs
today. The remaining row is visible through SQLite inspection of
`attachment_cleanup`, rather than a new restore status field.

The compiled drive now checks these cases:

| Case | Literal requirement |
| --- | --- |
| Eight warm/fresh, older/newer, pending/drained combinations | Purged PNG and job absent at restore return, before reopening or another Purge |
| Deleted but non-Purged Task | Restored alive as `Deleted but recoverable`, PNG retained |
| Option Attachment root | Custom PNG erased, default-root PNG retained |
| TODO_ATTACHMENT_ROOT | Environment-root PNG erased, default-root PNG retained |
| Failed erasure using an owned symlink refusal | Restore succeeds with the original report keys, job and PNG remain, next applied restore succeeds after fixing the path |
| Dry run | No erasure and live queue unchanged |
| Refused restore | No erasure and live queue unchanged |
| Forced rollback before commit | No erasure and live queue unchanged |
| Applied in-memory preview | No post-restore erasure under the shared real Attachment root |
| Non-Purged job injected after stage filtering | Membership recheck preserves its PNG and does not erase from that row |
| DELETE trigger requiring domain_write_allowed() | Cleanup removes the job through the supplied guarded transaction |

The preview test isolates this new pass. It forks before the crash, supplies
scratch Snapshot publication for the in-memory fixture and neutralizes that
preview's unrelated Purge cleanup. This matters because existing construction
of a preview containing pending jobs can itself drain the cloned queue against
the shared root. That behavior was observed during fixture setup and remains
unchanged by the one-argument approval. These tests establish the new pass's
preview guard, not a claim about every existing preview cleanup entry point.

## The Init mapping has concrete evidence

The coordinator approved exactly one added store.ts argument. Removing that
line produces byte-for-byte equality with e99d146c. `covered-functions.json`
lists every covered function: 44 are byte-identical, and the constructor has
only that approved change. Nine whole-file pins remain unchanged.

Construction before and after uses the same scratch database reset from one
Version-1 Task seed, with no Purge, matching Init. The seed SHA-256 is
`fd68adcacf2ab99704d59ef4abae846ce20a1caa47ac795d886138ca7e4c9157`.
All ten executed public SQLite statements, their bindings and both immediate
transaction entry/commit observations are identical. The tracer wraps actual
public statement execution and transaction calls. It does not claim native
SQLite internal tracing. `constructor-before.json`, `constructor-final.json`
and `constructor-comparison.json` retain the traces and comparison.

The pre-renewal checker completed the model and production stages, then failed
only the store.ts source gate. Real-code sensitivity ran in an owned archive of
exactly e520abd4. Only the scratch mirror received a temporary candidate pin.
Both mutations failed at the intended behavior assertions, source restoration
was exact, and the restored command passed. The actual worktree pin stayed
unchanged until those proofs completed.

Coverage then advanced once, changing only store.ts SHA-256 and confirmedCommit.
The new hash is `463a1fff300c5eb544bbc0b0534e6398608706b1944227e0673a388397eab65b`.
Confirmed source is e520abd4. The final normal checker passed in the actual
worktree. All ten current covered hashes match. The model, bounds, invariants,
fixtures and crash boundaries are unchanged.

[The mapping candidate](../.agents/skills/verify-occ-atomicity/PURGE-RESTORE-MAPPING.md)
contains the complete function list and evidence review. It is not accepted
before the correctness seat re-checks it. No perf/server-reads content was read.

## Verification receipts

Paths below are relative to `docs/evidence/purge-restore/r3/`. Evidence remains
local and ignored by Git.

| Check | Exit and result | Receipt |
| --- | --- | --- |
| Final targeted tests against unchanged e99d146c production files | 1, 16 failures and eight controls passing | `red-final.log`, `red-final.exit` |
| Final targeted tests on the fixed source | 0, 24 passed | `green-24.log` |
| Combined Snapshot, Attachment and Dependency behavior tests | 0, 74 passed | `focused.log` |
| Domain typecheck | 0 | `typecheck-final.log` |
| verify-snapshots, including a genuine base-CLI damaged copy repaired twice | 0 | `snapshots.log`, `snapshots/commands.log` |
| Raw History, SQL metadata and checkpoint repair | 0, six cases | `snapshots/raw-history.json` |
| Immediate cleanup and custom-root/guard controls | 0 | `snapshots/cleanup-recovery.json`, `snapshots/cleanup-guards.json` |
| Canonical copy checksum stability | 0 | `snapshots/redaction-stability.json` |
| verify-attachments | 0 | `attachments.log` |
| verify-dag | 0 | `dag.log` |
| Pre-renewal AtomicCAS check | 1 only at source gate after model and production passed | `atomic-pre-renew.log` |
| Real-code sensitivity | Mutants 1 and 1, restored command 0 | `atomic-sensitivity/sensitivity-ByTuWH/result.json` |
| Final actual-worktree AtomicCAS check | 0 | `atomic-final.log`, `atomic-final.exit` |
| Exact locked root check | 0 on first attempt | `root.log`, `root.exit` |

The final AtomicCAS result is also under
`docs/evidence/fv01/fv01-check-5BpvSK/`. It records 216 enumeration cases,
432 replay checks, seven crash points and two competing writers. The baseline
model and both model controls complete with their required exits. The earlier
source-only refusal is `fv01-check-D6Cc04`.

An initial sensitivity invocation used the parent directory. Its pin
precondition rejected it before any mutation. The refusal is preserved in
`sensitivity-pin-refusal.log`. The complete run then used the owned mirror.

The root command was exactly `sh scripts/disk-guard.sh`, then
`/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`. It passed 417 domain,
69 CLI, 32 server and 168 Electron tests, with one existing skip. No existing
deadline changed. Launch load was 4.94, 5.71 and 6.96. No root retry was needed.
Contract id remains `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`.

## Main and cleanup

The shared production patch applies to origin/main at
`72a5413d647ba624903b01aa0721e221f95c77ec`. `main-shared.patch` contains the net
three-file port, including store.ts. It passes both git apply --check and actual
application on a clean mirror. The ported snapshots.ts matches this source.
The main port now also sets op_log.entity_version to 1. Keeping main's older
event-only UPDATE would leave the metadata half of R1 unfixed.

Main's current store pin is
`bb3f0f0855c3bd5128b8d5f4c164734d13a04250ad7dfe32eacc18cf3ac69a60`.
The isolated port produces
`e86fcfd78c0f6c37e6ffef95db240d158820e57ecd9d3bd5b18690af836a3392`.
Main needs that source reviewed and its own confirmed product commit, Init
trace, sensitivity and AtomicCAS renewal. The DAG pin and confirmedCommit
cannot be copied verbatim. This is applicability evidence, not a full main
build or formal verification run. `main-apply.json` records the checks.

The Snapshot skill compiles both new drives and checks warm return-time erasure.
The reference inventory and architecture are updated. New domain verification
files are `scripts/snapshot-raw-history-proof.ts` and
`test/snapshot-raw-history.test.ts`. No production module or dependency was added.
The constructor trace helper and mapping candidate are under verify-occ-atomicity.

All data, images and processes were scratch-owned. Recipe servers and streams
exited. Every crash child exited 73. Cleanup removed 13 closed Bun build
files totaling 1,152,591,232 bytes after lsof checks, the exact-source mirror,
constructor seed databases and temporary probe inputs. Text receipts and helper
sources remain local. Source/binary hashes are in `binaries.json`, current pins
in `final-pins.json`, and cleanup counts in `cleanup-summary.json`. Last available
disk was 64,577,396 KiB, above the soft floor. No real Todo directory, native app,
Keychain, signing, push, PR, merge or agent child was used.
