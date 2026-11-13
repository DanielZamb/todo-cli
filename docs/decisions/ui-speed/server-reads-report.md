# Server projection reads

## Final delivery: native-COMMIT lifetime repair first

This gap was found by this worker's own final control after review checkpoint 1c9bf4d4659b2379403bc1e8196db43187ef0661, before delivery. The root lease stayed live until OperationStore.transaction returned, including its post-COMMIT work. A hook opening a fresh native transaction in that window could use the old authority and return task-1. The first literal StoreError/no-row control exited 1 with that Task. The approved correction in auth.ts closes the root lease in the checked callback's finally, before native COMMIT and post-commit work. Final cleanup still handles failed admission.

Corrected immutable capture: `5a996ce55a15cd6145f88c83a220ae2d4b54a956` on perf/server-reads. The final delivery adds only report/mapping metadata after that capture. This section supersedes every pending or qualified statement about an earlier source below. It is a candidate for SERVER-READS-S1; no installation or remote change was made. Contract: `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`.

### Red, green and exit-window controls

Five literal cases cover successful COMMIT, a forced rollback after the callback, a thrown callback, the actual attachment-cleanup exit hook, and outer completion after successful nested scopes. Every new native transaction refuses the retained authority with StoreError and no Task. Removing early closure makes all FIVE cases fail with Task data, exit 1. A separate mutation removes failed-admission finalization and fails the literal one-clear expectation, exit 1. Both exact restorations are checked, then all 36 authority/Diagnostics/lifetime scope tests pass with exit 0.

The nested case first reads task-1 through both outer and inner authorities, and runs Discovery inside the grouped read. Inner completion keeps the outer lease alive. After outer completion both authorities refuse. Failed admission never runs the callback, executes final cleanup exactly once, and a same-tick next request gets a fresh lease. A queued microtask has not run at that next request; its genuine authority works and the retained earlier one refuses. Admission and same-tick identity were already protected by the prior fallback/identity guards; they are regression controls, not falsely labeled newly failing cases. The separate failed-finalization mutation proves the retained fallback is exercised.

Source audit of OperationStore.transaction finds one production callable exit hook after the native transaction returns: cleanupAttachmentsSync. It erases copied images and deletes attachment_cleanup rows. The other work after the checked callback is restoration of the writing flag before COMMIT and return of the result. The lease closes before that flag restoration. Generic native transaction-return hooks, rollback/throw paths, and the cleanup hook are tested. No mapped store body changed for this repair. The five-case sensitivity helper and literal expectations are retained in verify-auth; it requires exclusive checkout access while temporarily changing auth.ts and restores bytes in finally.

The initial expanded test mistakenly attached its exit hook to OperationStore.transaction while choosing a deferred outer snapshot that bypasses that runner. It exited 1 because the hook did not run. The corrected grouped-read case uses the real default runner and nests Discovery within it, then exits 0. This was a test wiring error, not a product-mode change. Immediate ordinary reads and deferred Discovery remain as ruled.

### Complete corrected-source qualification

All 17 compiled artifact builds exit 0. Normal CLI/server/seed provenance is `docs/evidence/ui-speed/server-reads/native-final/normal-binary-provenance.json`, capture 5a996ce55a15cd6145f88c83a220ae2d4b54a956, source hash b43fadef06b14950825b71256ae1ee3278c93234737ddd69a196f4a57990a043. Observer and mutant binaries are separate artifacts. No old binary is relabeled as corrected source.

| Gate on corrected capture | Real exit/result | Evidence relative to `docs/evidence/ui-speed/server-reads/native-final/` |
| --- | --- | --- |
| Native exit-window first reproduction | 1; returned task-1 | ../final-native-commit-lifetime-red.log |
| First correction, three scope suites | 0, 31 tests | ../final-native-commit-green.log |
| Expanded matrix wiring then corrected grouping | 1, then 0 | ../native-window-matrix-green.log; ../native-window-matrix-green-2.log |
| Late-close sensitivity and missing-admission-cleanup sensitivity | 1 / 1 at literal assertions; controller 0, restored 36 tests 0 | ../native-window-sensitivity/ |
| 56 checkpoints plus rich lifecycle | 0 / 0; 23,880 + 1,267 = 25,147 byte-identical pairs | parity-56*, parity-rich* |
| Both credential/port mutation modes | 0 / 0, 1,267 pairs each | mutation-credential*, mutation-port* |
| Interleaved Profiles, copied-authority port refusal | 0 / 0; 60 good replies, 20 generic refusals | interleaving*, boundary-copy* |
| Absent-Profile capture, statement and decode probes | 0; 840 replies, fourteen two-statement/zero-decode probes | absent* |
| Absent blanket-404 and present-query mutants | 1 / 1, intended status/statement failure | absent-404.log; absent-query.log |
| All fourteen compiled SSE scenarios | 0, exact base frames except approved terminal policy | stream* |
| Diagnostics structural/refusal/History/writer control | 0; ten pairs, one row per domain refusal, one physical transaction | diagnostics-structure* |
| Three Diagnostics sensitivity variants | each run 1 at its literal message, controller 0 | diagnostics-sensitivity* |
| Real-image read/lookup/decode structural sweep | 0; one lookup, zero non-History operation decodes | rich-read-statements* |
| Unchanged C1, C2, C3 probes | 0 / 1 refusal / 1 refusal; C2 typecheck 0 | c1.log; c2.log; c3.log; c2-types.log; seat-probes.json |
| AtomicCAS full model/production gate, before and after reference move | 0 / 0 | atomicity.log; atomicity-after-reference.log |
| AtomicCAS sensitivity before/after reference move | controllers 0 / 0, each mutant 1 / 1, restored command 0 | atomicity-sensitivity*.log |
| Full Task search cache gate on corrected source | 0; nine stages including generated/hygiene/admission/compiled drives | cache-full.log |
| Same full cache gate after reference-only move | 0, all nine stages | cache-after-reference.log |
| Compiled op-log, auth, recurrence, HTTP/reads, Profiles, filters, Snapshots, SSE, CLI, Attachments/groups, DAG/public, Discovery and import | all sixteen 0 | recipes.log; skills/summary.json |
| Compiled Diagnostics permitted recipe | 0; only prohibited Swift PNG renderer omitted | diagnostics-recipe* |
| Corrected six-case named Discovery control: unchanged clock-fix base/head | 0 / 0; same-Token actor and auth History parity at command entry | enrichment-base.log; enrichment-head.log |
| Real attribution mutant | build 0, run 1, intended authenticate-vs-mutate assertion | enrichment-mutant*.log |
| Strict Discovery control TypeScript; generated contract; doc links | 0 / 0 / 0 | enrichment-types.log; contract.log; doc-links.log |
| Exact order-27 root after disk guard | 0; 429 domain, 69 CLI, 32 server, 168 Electron, one existing skip | root-disk.log; root-check.log |
| Paired Diagnostics, two fixtures, 200 pairs each | 0; 800 synchronous reads and body equality | diagnostics-holds* |
| Paired per-route physical transaction holds | 0; 22 routes, 110 pairs | lock-holds* |
| Paired owner-shaped eight-read driver | 0; 20 processes, 480 HTTP 200, zero errors/head operation decodes | owner-timing* |
| Same-database construction trace | 0; ten identical statements, no credential lookup, unchanged database hash | constructor.log; constructor-same-db.json |
| Own closed Bun runtime temporary cleanup | 0; 46 files, 4,078,399,744 bytes removed, no open skips | runtime-cleanup.json |
| Final closed-runtime cleanup and artifact hashes | 0; six more files, 531,965,184 bytes, no skips; three normal binary hashes preserved | final-runtime-cleanup.json; binary-hashes.json |

Every root attempt remains in the report. Earlier final-root-check.log exited 1 on the stale hook-write expectation; final-root-check-2.log exited 0. final-root-check-3.log also exited 0 during the self-review cycle but is not substituted for the corrected immutable run. The corrected run above uses sh scripts/disk-guard.sh and then exactly /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check, with frozen TODO_CLI_BINARY, TODO_SERVER_BINARY, TODO_SEED_BINARY and TODO_BINARY_PROVENANCE overrides. Scope and authority counts are from the corrected capture. The final runtime copy matrix records 234 refused attempts and zero failures, with nine more terminal forms in the lifetime suite.

C1 remains closed. C2 refuses at its first copied graphRead. C3 refuses at its first changesRead after authorizeRead has returned, before the probe's later revocation/new-write sequence. Both refusal probes compile normally, run unchanged, and exit 1 with the generic StoreError before returning rows. Their sources are byte-identical to the seat's copies. Later-transition and native-window tests establish the stronger lifetime behavior rather than pretending the unchanged probe reaches its old exploit sequence.

### Corrected-source absent and stream behavior

All 840 replies match the captured base, under ten credential classes and six identifier cases. Present/tombstoned/never-created classification still happens once in the credential-check snapshot after scope validation. An absent value carries no authority or Profile id, and its literal paths execute only credential lookup plus classification. Quick-add resolves supplied Project/Tag text against nothing. The blanket-404 and present-query mutants still fail. The exact owner replies for every Profile-scoped read route are below; History is specifically empty 200, not 404.

| Profile-scoped route on never-created | Base/head status | Exact captured reply |
| --- | ---: | --- |
| `/profiles/never-created/projects` | 200 | `[]` |
| `/profiles/never-created/tags` | 200 | `[]` |
| `/profiles/never-created/tasks` | 200 | `[]` |
| `/profiles/never-created/tasks?text=sentinel` | 200 | `[]` |
| `/profiles/never-created/views/inbox?now=2026-11-11T12%3A00%3A00Z` | 200 | `{"name":"inbox","now":"2026-11-11T12:00:00Z","groups":[{"name":"Inbox","tasks":[]}]}` |
| `/profiles/never-created/views/today?now=2026-11-11T12%3A00%3A00Z` | 200 | `{"name":"today","now":"2026-11-11T12:00:00Z","groups":[{"name":"Overdue","tasks":[]},{"name":"Due today","tasks":[]},{"name":"Scheduled today","tasks":[]}]}` |
| `/profiles/never-created/views/overdue?now=2026-11-11T12%3A00%3A00Z` | 200 | `{"name":"overdue","now":"2026-11-11T12:00:00Z","groups":[{"name":"Overdue","tasks":[]}]}` |
| `/profiles/never-created/views/scheduled?now=2026-11-11T12%3A00%3A00Z` | 200 | `{"name":"scheduled","now":"2026-11-11T12:00:00Z","groups":[{"name":"Scheduled","tasks":[]}]}` |
| `/profiles/never-created/tasks/ab-present` | 404 | `{"_tag":"NotFound","message":"Task not found","exit_code":3,"exit_meaning":"not found or auth missing"}` |
| `/profiles/never-created/tasks/ab-present/history` | 200 | `[]` |
| `/profiles/never-created/tasks/ab-present/graph` | 404 | `{"_tag":"NotFound","message":"Task not found","exit_code":3,"exit_meaning":"not found or auth missing"}` |
| `/profiles/never-created/tasks/ab-present/attachments/missing/image` | 404 | `{"_tag":"NotFound","message":"Task not found","exit_code":3,"exit_meaning":"not found or auth missing"}` |
| `/profiles/never-created/quick-add/parse` | 200 | `{"title":"Prepare","due_at":null,"scheduled_at":null,"priority":"P1","tags":["focus"],"project":"Absent"}` |
| `/profiles/never-created/events` | 200 | `event: ready\ndata: null\n\n` |

The never-created-to-present stream still receives the separate CLI init/add write in order, exactly as the base. Present/deleted/reused transitions retain one snapshot per read. No new presence disclosure appears for the unauthorized credential classes in this fixture. The choice of 200 versus 404 for never-created names remains the owner's later question.

The corrected-source stream's fourteen scenarios compare with the base frame for frame. The exact frame difference table and three complete failure-frame wire strings below remain current; the raw corrected frames are under `docs/evidence/ui-speed/server-reads/native-final/stream/`. Only a still-valid connected owner Session gets the one-shot terminal batch. Revoked/expired credentials and Tokens get no terminal batch and retain their respective existing failure/close sequence. No additional frame difference was introduced by early lease closure. Root values and terminal permissions are consumed inside their live callbacks; only plain state and materialized events cross a poll boundary.

### Corrected-source paired Diagnostics and locks

The coordinator's accepted IMMEDIATE cost remains the decision. Its original owner holds were 3.59/4.26/4.54 to 25.34/28.98/29.70 ms and retained-Snapshot holds 3.67/8.06/8.48 to 31.39/58.51/66.31 ms, median/p99/maximum. The absolute 5/50 ms assertion was withdrawn and is not executable. Fresh corrected-source measurements again show unchanged total read time with the longer continuous hold:

| Fixture | Before hold median/p99/max ms | After hold median/p99/max ms | Total median before/after ms |
| --- | --- | --- | --- |
| owner | 3.45 / 4.61 / 5.06 | 24.83 / 29.46 / 33.39 | 24.84 / 24.90 |
| snapshots | 3.59 / 4.98 / 8.23 | 31.18 / 38.23 / 53.58 | 31.15 / 31.27 |

Each fixture has 200 alternating pairs after warmups. All body hash pairs and the separate fixed Clock/RSS full-body comparisons match. The 16 real checkpoint/8 filesystem Snapshot fixture is unchanged. Fresh one-minute load was 4.19–4.40 on ten logical CPUs. These are physical transaction callback-to-COMMIT holds, so the new earlier logical lease close is not mislabeled as earlier lock release. The writer-attempt control still blocks until the read returns, then commits while the reader stays alive. No deferred owner scope or cheaper metric was built.

The following fresh server holds are medians [minimum, maximum] from five alternating pairs per route after warmup. The longest physical transaction is shown; deferred cells are reader snapshot duration, not writer-lock time. Every corrected ordinary request has one credential SQL lookup. History decodes exactly the 2,049 returned rows; non-History reads decode zero operations. Snapshot list/real Show normalize only their independent scratch ids/paths for this timing control; the full differential uses shared identities with no such normalization.

| Route | Before hold ms | After hold ms | Physical transactions before/after | Mode |
| --- | ---: | ---: | --- | --- |
| `/profiles` | 27.07 [26.66, 27.20] | 1.11 [0.77, 1.25] | 9/1 | immediate |
| `/profiles?include_projects=true` | 213.06 [205.69, 224.13] | 1.37 [1.00, 1.60] | 1/1 | deferred |
| `/tasks/lookup?prefix=a` | 220.53 [213.63, 265.98] | 5.33 [4.99, 6.54] | 1/1 | deferred |
| `/auth/tokens` | 0.02 [0.01, 0.03] | 0.02 [0.02, 0.05] | 1/1 | immediate |
| `/snapshots` | 0.14 [0.09, 0.19] | 0.25 [0.15, 0.44] | 2/1 | immediate |
| `/snapshots/00000000-0000-4000-8000-000000000000` (404) | 0.03 [0.01, 0.03] | 0.07 [0.06, 0.14] | 2/1 | immediate |
| `/diagnostics` | 5.08 [4.86, 6.34] | 29.36 [27.95, 31.38] | 3/1 | immediate |
| `/profiles/p0/projects` | 36.24 [33.86, 36.65] | 0.19 [0.17, 0.32] | 1/1 | immediate |
| `/profiles/p0/tags` | 35.78 [31.41, 38.22] | 0.16 [0.08, 0.22] | 1/1 | immediate |
| `/profiles/p0/tasks` | 37.02 [33.72, 42.86] | 1.02 [0.89, 1.32] | 2/1 | immediate |
| `/profiles/p0/tasks?text=Task` | 40.33 [36.34, 45.46] | 1.16 [1.01, 1.38] | 2/3/1 | immediate |
| `/profiles/p0/views/inbox` | 60.49 [48.25, 90.15] | 1.42 [1.01, 1.87] | 1/1 | immediate |
| `/profiles/p0/views/today` | 46.98 [42.54, 49.60] | 1.53 [1.05, 1.96] | 1/1 | immediate |
| `/profiles/p0/views/overdue` | 37.80 [37.59, 45.39] | 1.29 [0.91, 1.82] | 1/1 | immediate |
| `/profiles/p0/views/scheduled` | 37.50 [37.11, 39.12] | 1.19 [0.94, 1.51] | 1/1 | immediate |
| `/profiles/p0/tasks/p0-t0000` | 35.84 [33.49, 36.65] | 1.15 [1.10, 1.45] | 2/1 | immediate |
| `/profiles/p0/tasks/p0-t0000/history` | 31.59 [31.27, 35.32] | 24.69 [23.63, 27.51] | 1/1 | immediate |
| `/profiles/p0/tasks/p0-t0000/graph` | 28.57 [27.84, 33.01] | 1.48 [1.21, 1.73] | 2/1 | immediate |
| `/profiles/p0/tasks/p0-t0000/attachments/missing/image` (404) | 30.69 [29.35, 32.70] | 0.99 [0.75, 1.15] | 4/1 | immediate |
| `/profiles/p0/quick-add/parse` | 0.04 [0.02, 0.05] | 0.05 [0.05, 0.11] | 1/1 | immediate |
| `/profiles/p0/events` | 0.04 [0.02, 0.06] | 0.11 [0.07, 0.15] | 1/1 | immediate |
| `/snapshots/:real` | 0.03 [0.03, 0.05] | 0.06 [0.05, 0.09] | 2/1 | immediate |

### Corrected-source eight-read gain

Five alternating pairs per request order, three passes per fresh process, give 20 processes and 480 validated responses. The warm second pass is shown in handler milliseconds, median [minimum, maximum]. Every head observation has zero operation decodes. All responses are 200 and the literal count/body checks pass. Both sides use the owner-shaped fixture with 178 selected/1,427 total Tasks, eight Profiles and 3,480 operations.

| First request | Base eight-read sum ms | Corrected head sum ms | Base Profiles ms | Corrected Profiles ms |
| --- | ---: | ---: | ---: | ---: |
| profiles | 560.57 [442.85, 656.56] | 7.76 [6.18, 9.50] | 296.01 [230.09, 334.29] | 1.38 [1.11, 1.52] |
| profile | 510.21 [436.82, 724.35] | 9.35 [6.78, 10.59] | 273.75 [236.59, 400.07] | 1.50 [1.15, 2.28] |

The gain remains. Host one-minute load is 4.61–4.85 on ten logical CPUs, with the coordinator reporting eight units. This worker's other checks settled before timing. The base still decodes 27,840 operations for Profiles and 3,480 for each other read; the corrected path decodes none. That removed JSON/schema work explains the gap. Timers exclude profiler tracing, and paired ranges remain far apart. This does not certify installed UI latency or input-to-render p99.

### Mapping references moved a second time, with unchanged hashes

The first reviewed renewal named 27ea0c5e. The final control then found the native-COMMIT gap, so that reference was not the final source. Under the coordinator's explicit ruling, both references now name `5a996ce55a15cd6145f88c83a220ae2d4b54a956`. This is a SECOND reference move and is called out for SERVER-READS-S1. Only confirmedCommit/productCommit changed in this follow-up; not one covered-file hash moved. The exact 19 whole-file before/after hashes below prove that statement. The seventy covered-body/cache/matcher/runner/admission/epoch/preparation hashes below also remain byte-identical. No model, invariant, mapping table, matcher or cache control changed.

AtomicCAS was rerun on the corrected source and again after the reference move, with full model/production and real-source sensitivity stages. Cache behavioral and full gates were likewise rerun on the corrected immutable source. Final AtomicCAS receipts are docs/evidence/fv01/fv01-check-ZsFgZT/ and sensitivity-CqF2U9/, both controllers 0, both real defects 1, restored 0. The post-reference full cache receipt is docs/evidence/perf-cache/verify-m9Nmww/, exit 0 for every stage. These are proposed renewals, not accepted until the same correctness seat rechecks them. The store constructor still has exactly the approved one-argument Diagnostics closure diff; the other nine mapped members remain byte-identical, and construction still executes ten identical statements with zero credential queries.

<details>
<summary>Nineteen covered files, identical hashes at both immutable captures</summary>

| Covered file | SHA-256 at 27ea0c5e | SHA-256 at corrected capture |
| --- | --- | --- |
| `packages/domain/src/store/store.ts` | 78331436469154a79babaf1f47036c43c64b697164fada36cca266b82cc4e186 | 78331436469154a79babaf1f47036c43c64b697164fada36cca266b82cc4e186 |
| `packages/domain/src/store/projection.ts` | dd0d3823bd6b9ecd8868ee0eaacdb8e3438aca1bf944f897cd2092eb137364b9 | dd0d3823bd6b9ecd8868ee0eaacdb8e3438aca1bf944f897cd2092eb137364b9 |
| `packages/domain/src/events.ts` | 4d2fe50114ab16e379759bf3bbb4f6416120f323c62b9a5280c04284a597ec44 | 4d2fe50114ab16e379759bf3bbb4f6416120f323c62b9a5280c04284a597ec44 |
| `packages/domain/src/entities.ts` | ee505f78a6434528dbfe5f072463ec77cd6823bab1781f3f656d01c77f2d52f9 | ee505f78a6434528dbfe5f072463ec77cd6823bab1781f3f656d01c77f2d52f9 |
| `packages/domain/src/ids.ts` | c1081994f401f4898f950348587ff4633fd36eb822628ca00d3d215e73defd0f | c1081994f401f4898f950348587ff4633fd36eb822628ca00d3d215e73defd0f |
| `packages/domain/src/attachments.ts` | 7094e663ad7a34dc38de76529a471c6f1b1d9c52c2f29883666b408603e1962e | 7094e663ad7a34dc38de76529a471c6f1b1d9c52c2f29883666b408603e1962e |
| `packages/domain/src/store/dependency-validation.ts` | e73b9367e7aa93689a28e5e9e83fd53cac6dcbf949a6c50f0122ac28213ba0d5 | e73b9367e7aa93689a28e5e9e83fd53cac6dcbf949a6c50f0122ac28213ba0d5 |
| `packages/domain/src/store/dependencies.ts` | b4e88ed38871bd93483a024b5ca45ba66c441b93f2aeec70ab60c8f97461f411 | b4e88ed38871bd93483a024b5ca45ba66c441b93f2aeec70ab60c8f97461f411 |
| `packages/domain/src/dependency-rules.ts` | 38fbc8c86349775e6eced7404e924ba5a5ab8e5e08616169e378086fe4e5fb11 | 38fbc8c86349775e6eced7404e924ba5a5ab8e5e08616169e378086fe4e5fb11 |
| `packages/domain/src/dependencies.ts` | 18b75d53f24ed5a86e6c645d4d2b99766ae8a0786ec32c1c5a33254804a06caa | 18b75d53f24ed5a86e6c645d4d2b99766ae8a0786ec32c1c5a33254804a06caa |
| `packages/domain/src/task-search-cache.ts` | a7a24d8211ebf7aaf1cf559547f7339150d680db9ac3a81c4ccea283e2b76baf | a7a24d8211ebf7aaf1cf559547f7339150d680db9ac3a81c4ccea283e2b76baf |
| `packages/domain/src/task-search.ts` | 1a82bab698508fe98c1d7de11fddbaf910454d69c3f6534e45e8b0ce9203c23c | 1a82bab698508fe98c1d7de11fddbaf910454d69c3f6534e45e8b0ce9203c23c |
| `packages/domain/src/task-filters.ts` | aff1e83b4486135946a007018ec2551b145aaefb5d7a51f5bcf213db991e6f55 | aff1e83b4486135946a007018ec2551b145aaefb5d7a51f5bcf213db991e6f55 |
| `packages/domain/src/commands.ts` | 574f8654daff45e54db0b4c5f1fb642a60d2c7814826d3a0c2cfbcec247197b3 | 574f8654daff45e54db0b4c5f1fb642a60d2c7814826d3a0c2cfbcec247197b3 |
| `packages/domain/src/store/snapshots.ts` | 4ed23e32cffd61998f5cabd15616840d466ccbbe0e1d3d0e3121d730e2d827f9 | 4ed23e32cffd61998f5cabd15616840d466ccbbe0e1d3d0e3121d730e2d827f9 |
| `packages/domain/src/store/search-cache-events.ts` | 4f0276e1953a56db0a31844c51faec02835eea134b04a06ed2ba6e9231d6d600 | 4f0276e1953a56db0a31844c51faec02835eea134b04a06ed2ba6e9231d6d600 |
| `apps/server/src/task-search-cache-hygiene.ts` | be77122a27f471e8d9804f6215bdd5c8622bfcdf952130cdb7e58ebd8b61883b | be77122a27f471e8d9804f6215bdd5c8622bfcdf952130cdb7e58ebd8b61883b |
| `apps/server/src/server.ts` | 4abead0eafaf18835759651f2d7d7ed0d568506e02192e5aec3713500500844e | 4abead0eafaf18835759651f2d7d7ed0d568506e02192e5aec3713500500844e |
| `apps/cli/src/main.ts` | d02c596f930c970e15ea67aad6c43c0ca041bb2dc598fff9e9873c99a9814378 | d02c596f930c970e15ea67aad6c43c0ca041bb2dc598fff9e9873c99a9814378 |

</details>

The named Discovery verification-skill correction is also explicitly submitted to the seat. The former callback-count trigger was not a named time boundary. Six named cases now compare base 6b167266 and this head, preserving the already-expired HTTP/CLI authenticate/expired row including actor, one row per refusal and literal HTTP bytes. Later Attachment expiry gives mutate on BOTH sources; batch-edit stays authenticate; the aggregate missing-id Import case stays authenticate. The attribution mutant fails. Full details and the unchanged raw failure body are below. No product behavior was changed to force that control.

### Current caller audit and limits

The current 192-site audit is below. Ordinary paths materialize synchronously and return data/plain selectors, search and encoding remain outside, imports reopen checked scopes after writes, and Discovery nests within its outer deferred snapshot. No legitimate authority use after callback end was found; all 57 fixtures, absent captures, Diagnostics and stream controls were rerun to prove the conversions. requireOwner remains only for the accepted CLI/HTTP Snapshot write helpers. No plan-A retention lint was built.

The earlier Unit B lock audit and the at-most-fifteen-line owner-read follow-up proposal remain below, unchanged as proposals. Table counts did not dominate the separate untimed no-checkpoint attribution sample; last-Reminder/recent-rate op_log scans deserve a later measured unit. No deferred transaction change is part of this delivery. No native app, Swift, Keychain, signing, real HOME/database, installation, push, PR, child agent or experiment was used. No remote exploit is claimed. Models and controls are bounded; source mapping and exit-hook enumeration include manual review. The correctness seat has not accepted this head or the two renewals yet.

<details>
<summary>Current 192-site read caller and selector audit</summary>

| Current production site | Read/boundary | Profile and id source |
| --- | --- | --- |
| `apps/server/src/sse.ts:66` | `store.auth.withRead(` | Credential and subscription fields were bound at connection entry. Every poll checks those plain selectors afresh; only its synchronous callback holds an authority. Terminal permission also binds connection, generation, cursor and deletion cap. |
| `apps/server/src/sse.ts:86` | `const selection = yield* store.auth.checkRead(read, "read");` | Credential and subscription fields were bound at connection entry. Every poll checks those plain selectors afresh; only its synchronous callback holds an authority. Terminal permission also binds connection, generation, cursor and deletion cap. |
| `apps/server/src/sse.ts:87` | `const initial = yield* store.snapshots.generation();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `apps/server/src/sse.ts:137` | `store.auth.withStreamRead(` | Credential and subscription fields were bound at connection entry. Every poll checks those plain selectors afresh; only its synchronous callback holds an authority. Terminal permission also binds connection, generation, cursor and deletion cap. |
| `apps/server/src/sse.ts:152` | `: yield* store.snapshots.generation();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `apps/server/src/sse.ts:177` | `? yield* store.changesRead(` | Credential and subscription fields were bound at connection entry. Every poll checks those plain selectors afresh; only its synchronous callback holds an authority. Terminal permission also binds connection, generation, cursor and deletion cap. |
| `apps/server/src/sse.ts:188` | `return store.terminalChangesRead(` | Credential and subscription fields were bound at connection entry. Every poll checks those plain selectors afresh; only its synchronous callback holds an authority. Terminal permission also binds connection, generation, cursor and deletion cap. |
| `apps/server/src/server.ts:474` | `diagnostics.read({ credential: yield* BearerCredential }),` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:544` | `attachments.imageRead(` | Trusted image copy/storage helper uses the decoded current/source Task and Attachment metadata. It is also used by write paths; no request query selector enters it directly. |
| `apps/server/src/server.ts:821` | `: reads.profiles(credential),` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:827` | `reads.projects({` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:836` | `reads.tags({` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:858` | `reads.history({` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:868` | `store.auth.withRead(` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:875` | `(read) => store.auth.checkRead(read, "read"),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `apps/server/src/server.ts:941` | `return yield* translate(store.auth.listTokens({ credential }));` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:1004` | `store.auth.withOwnerRead(` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:1008` | `(read) => store.snapshots.listRead(read),` | Owner authority in the synchronous owner callback. Snapshot Show uses private fields.snapshot; List has no id. |
| `apps/server/src/server.ts:1018` | `store.auth.withOwnerRead(` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:1022` | `(read) => store.snapshots.showRead(read),` | Owner authority in the synchronous owner callback. Snapshot Show uses private fields.snapshot; List has no id. |
| `packages/domain/src/task-lookup-error.ts:35` | `.resolveProfileRead(` | Profile name/id and requested Task id/transport are captured by resolveProfileRead. Error formatting consumes only its plain bound selection after the scope ends. |
| `packages/domain/src/auth/auth.ts:277` | `try: () => readAuthority(read, kind, origin),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:647` | `.profiles()` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:932` | `this.resolveProfileRead(input, EmptyRead, {}).pipe(` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:964` | `selection: readAuthority(` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1006` | `!this.ports.profiles().some((p) => p.id === token.profile)` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1169` | `(read) => this.projection.catalog(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1175` | `(read) => this.projection.metadata(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1249` | `(read) => this.projection.catalog(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1257` | `(read) => this.projection.metadata(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1268` | `readAuthority(read, "read", this.db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1325` | `this.withRead(` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1329` | `(read) => operation(read, this.projection.metadata(read)),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1350` | `this.withRead(` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1357` | `this.ports.read(readAuthority(read, "read", this.db).profile),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1373` | `selection: readAuthority(read, "read", this.db),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1374` | `data: this.projection.metadata(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1391` | `selection: readAuthority(read, "read", this.db),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1392` | `data: this.ports.read(readAuthority(read, "read", this.db).profile),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1409` | `selection: readAuthority(read, "read", this.db),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1410` | `data: this.projection.catalog(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1430` | `readAuthority(read, "read", this.db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1440` | `) => checkedRead(read, kind, this.db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1612` | `(read) => taskHistory(this.db, read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1621` | `(read) => this.projection.projects(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1629` | `(read) => this.projection.tags(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1663` | `return this.projection.profiles(` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1746` | `(read) => this.ports.read(readAuthority(read, "read", this.db).profile),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/presentation.ts:39` | `const definition = seriesForTask(task, series);` | Pure presentation over materialized Tasks and Series, with no database authorization or caller selector. |
| `packages/domain/src/store/client-projection.ts:37` | `this.metadataAt(readAuthority(read, "read", this.db).profile);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/client-projection.ts:39` | `this.tasksForMutation(readAuthority(read, "read", this.db).profile);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/client-projection.ts:41` | `const value = readAuthority(read, "read", this.db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/client-projection.ts:49` | `const profiles = readAuthority(read, "profiles", this.db).profiles;` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/client-projection.ts:74` | `const profile = readAuthority(read, "read", this.db).profile;` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/client-projection.ts:85` | `const profile = readAuthority(read, "read", this.db).profile;` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/history-reads.ts:67` | `const value = readAuthority(read, "read", db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/history-reads.ts:105` | `const value = consumeTerminalRead(read, db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/dependency-validation.ts:78` | `? readTasks(db).filter((task) => task.profile_id === profile)` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:213` | `const purged = this.snapshots.purgedIdsSync();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/store.ts:225` | `tasks: () => readTasks(this.db),` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:248` | `this.auth.withOwnerRead(input, Schema.Struct({}), {}, use),` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:273` | `tasks: readTasks(this.db).filter(` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:276` | `series: readSeries(this.db).filter(` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:419` | `const tasks = readTasks(this.db).filter(` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:477` | `const before = readTasks(this.db).find((task) => task.id === target.id);` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:555` | `readonly tasks = () => attempt(() => readTasks(this.db));` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:556` | `readonly series = () => attempt(() => readSeries(this.db));` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:573` | `checkedRead(read, "read", this.db).pipe(` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/store.ts:574` | `Effect.flatMap((value) => this.graph(value.profile)),` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:578` | `attempt(() => terminalHistory(this.db, read));` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:621` | `checkedRead(read, "read", this.db).pipe(` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/store.ts:631` | `const state = this.snapshots.generationSync();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/store.ts:749` | `for (const id of this.snapshots.purgedIdsSync())` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/store.ts:857` | `const purged = new Set(this.snapshots.purgedIdsSync());` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/store.ts:898` | `series: readSeries(this.db).find(` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:979` | `const existing = readSeries(this.db).find(` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:994` | `readSeries(this.db).find((value) => value.id === series.id) ?? null;` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:1362` | `const tasks = readTasks(this.db);` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:1374` | `const series = seriesForTask(before, readSeries(this.db));` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:1539` | `return readTasks(this.db);` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/diagnostics.ts:126` | `this.restoreGeneration = snapshots.generationSync().generation;` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/diagnostics.ts:204` | `yield* checkedRead(read, "owner", this.db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/diagnostics.ts:205` | `const generation = yield* this.snapshots.generation();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/diagnostics.ts:206` | `this.generation(generation.generation);` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/diagnostics.ts:208` | `const pending = yield* this.scheduled.pendingReminders();` | Checked owner callback and owner-port validation. Snapshot ids, generation and pending reminder ids come from storage inside this same IMMEDIATE lease. |
| `packages/domain/src/dependency-commands.ts:134` | `const graph = yield* this.store.graph(identity.profile);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/dependency-commands.ts:211` | `const updated = yield* this.store.graph(identity.profile);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/store/projection.ts:344` | `tasks: readTasks(db),` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/projection.ts:345` | `series: readSeries(db),` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `apps/server/src/task-search-cache-hygiene.ts:6` | `let cursor = yield* store.searchCacheEvents();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `apps/server/src/task-search-cache-hygiene.ts:8` | `const current = yield* store.searchCacheEvents(cursor);` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/snapshots.ts:274` | `checkedRead(read, "owner", this.db).pipe(Effect.flatMap(() => this.list()));` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/snapshots.ts:276` | `checkedRead(read, "owner", this.db).pipe(` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/snapshots.ts:302` | `readonly generation = () => attempt(() => this.generationSync());` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/snapshots.ts:402` | `const ids = this.purgedIdsSync();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/snapshots.ts:498` | `generation: this.generationSync().generation,` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/scheduled-work.ts:55` | `.tasks()` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/scheduled-work.ts:72` | `for (const task of this.ports.tasks()) {` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/scheduled-work.ts:100` | `for (const before of this.ports.tasks()) {` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/scheduled-work.ts:129` | `for (const task of this.ports.tasks()) {` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/attachment-store.ts:155` | `export function readManagedImage(` | Trusted image copy/storage helper uses the decoded current/source Task and Attachment metadata. It is also used by write paths; no request query selector enters it directly. |
| `packages/domain/src/attachment-store.ts:209` | `const image = readManagedImage(root, attachment, task.id);` | Trusted image copy/storage helper uses the decoded current/source Task and Attachment metadata. It is also used by write paths; no request query selector enters it directly. |
| `packages/domain/src/attachment-store.ts:225` | `const image = readManagedImage(root, attachment, source.id);` | Trusted image copy/storage helper uses the decoded current/source Task and Attachment metadata. It is also used by write paths; no request query selector enters it directly. |
| `packages/domain/src/graph-queries.ts:136` | `store.auth.withRead(` | Profile, Task id and generated_at are captured by withRead. The callback materializes graph and result from private selectors. |
| `packages/domain/src/graph-queries.ts:142` | `const selection = yield* store.auth.checkRead(read, "read");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/graph-queries.ts:143` | `const graph = yield* store.graphRead(read);` | Genuine authority from the enclosing checked callback. Profile and terminal bounds come from private fields; ordinary cursor is the bound stream state. |
| `packages/domain/src/client-reads.ts:79` | `this.store.auth.profileSummaries({ credential });` | Shared input boundary binds Profile and parsed fields before checking. Views use materialized catalogs; History binds Task id; counts use the checked Profile set. |
| `packages/domain/src/client-reads.ts:82` | `this.store.auth.projects(request);` | Shared input boundary binds Profile and parsed fields before checking. Views use materialized catalogs; History binds Task id; counts use the checked Profile set. |
| `packages/domain/src/client-reads.ts:84` | `readonly tags = (request: AccessRequest) => this.store.auth.tags(request);` | Shared input boundary binds Profile and parsed fields before checking. Views use materialized catalogs; History binds Task id; counts use the checked Profile set. |
| `packages/domain/src/client-reads.ts:92` | `const { selection: authority, data } = yield* this.store.auth.readCatalog(` | Shared input boundary binds Profile and parsed fields before checking. Views use materialized catalogs; History binds Task id; counts use the checked Profile set. |
| `packages/domain/src/client-reads.ts:152` | `this.store.auth.taskHistory(request);` | Shared input boundary binds Profile and parsed fields before checking. Views use materialized catalogs; History binds Task id; counts use the checked Profile set. |
| `packages/domain/src/discovery.ts:40` | `this.store.auth.readSnapshot((auth) =>` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:42` | `const profiles = yield* auth.profileSummaries({ credential });` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:46` | `auth.metadata({ credential, profile: profile.id }).pipe(` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:55` | `yield* auth.profiles({ credential });` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:61` | `this.store.auth.readSnapshot((auth) =>` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:63` | `const { read } = yield* auth.profilesRead(` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:68` | `const authority = yield* this.store.auth.checkRead(read, "profiles");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/discovery.ts:74` | `auth.catalog({ credential, profile: profile.id }).pipe(` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:94` | `yield* auth.profiles({ credential });` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/commands.ts:155` | `const search = store.searchWords.read(selected.profile);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:160` | `} = yield* store.auth.withState(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:166` | `const selection = yield* store.auth.checkRead(read, "read");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/commands.ts:167` | `const graph = yield* store.graphRead(read);` | Genuine authority from the enclosing checked callback. Profile and terminal bounds come from private fields; ordinary cursor is the bound stream state. |
| `packages/domain/src/commands.ts:243` | `? (yield* store.profiles()).some(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:378` | `const search = this.store.searchWords.read(selected.profile);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:384` | `} = yield* this.store.auth.withMetadata(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:390` | `const selection = yield* this.store.auth.checkRead(read, "read");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/commands.ts:391` | `const graph = yield* this.store.graphRead(read);` | Genuine authority from the enclosing checked callback. Profile and terminal bounds come from private fields; ordinary cursor is the bound stream state. |
| `packages/domain/src/commands.ts:447` | `this.store.auth.withMetadata(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:453` | `const authority = yield* this.store.auth.checkRead(read, "read");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/commands.ts:454` | `const graph = yield* this.store.graphRead(read);` | Genuine authority from the enclosing checked callback. Profile and terminal bounds come from private fields; ordinary cursor is the bound stream state. |
| `packages/domain/src/commands.ts:486` | `.checkRead(read, "read")` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/commands.ts:532` | `...(yield* this.store.projects()),` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:537` | `const tags = yield* this.store.tags();` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:556` | `projects: yield* this.store.projects(),` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:557` | `tags: yield* this.store.tags(),` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:706` | `const graph = yield* this.store.graph(identity.profile);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:775` | `const tasks = yield* this.store.tasks();` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:798` | `const edges = (yield* this.store.graph(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:849` | `: seriesForTask(before, yield* this.store.series());` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:859` | `seriesForTask(task, [seriesBefore]) !== null &&` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1067` | `const before = (yield* this.store.tasks()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1097` | `(yield* this.store.tasks()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1222` | `const data = yield* readTasks(store, request);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1270` | `const data = yield* readTasks(store, request);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1274` | `yield* store.auth.readState(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1468` | `const before = (yield* store.tasks()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1533` | `const { selection: authority, data } = yield* store.auth.readState(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1539` | `const { data: target, selection: targetRead } = yield* store.auth.readState(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1576` | `const definition = seriesForTask(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1578` | `yield* store.series(),` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1609` | `? (yield* store.history(entry.seq - 2)).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1631` | `const destination = (yield* store.profiles()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1693` | `!(yield* store.profiles()).some(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1704` | `const source = (yield* store.profiles()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1779` | `const definition = seriesForTask(context.before, yield* store.series());` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1806` | `const definition = seriesForTask(context.before, yield* store.series());` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1826` | `const { selection: authority, data } = yield* store.auth.readState(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1871` | `const pair = (yield* store.history()).filter(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1972` | `(yield* store.tasks()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/import-tasks.ts:46` | `const { authority, graph } = yield* store.auth.withRead(` | Initial input/Profile/items are parsed and bound. Preview materializes without writes. Each graph reread after a write opens a fresh checked scope from plain bound selectors, never a retained authority. |
| `packages/domain/src/import-tasks.ts:52` | `const authority = yield* store.auth.checkRead(read, "read");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/import-tasks.ts:53` | `const graph = yield* store.graphRead(read);` | Genuine authority from the enclosing checked callback. Profile and terminal bounds come from private fields; ordinary cursor is the bound stream state. |
| `packages/domain/src/import-tasks.ts:153` | `const tasks = (yield* store.auth.read(request)).tasks;` | Initial input/Profile/items are parsed and bound. Preview materializes without writes. Each graph reread after a write opens a fresh checked scope from plain bound selectors, never a retained authority. |
| `packages/domain/src/import-tasks.ts:227` | `const data = yield* store.auth.read(request);` | Initial input/Profile/items are parsed and bound. Preview materializes without writes. Each graph reread after a write opens a fresh checked scope from plain bound selectors, never a retained authority. |
| `packages/domain/src/import-tasks.ts:342` | `const currentBlockers = (yield* store.auth.withRead(` | Initial input/Profile/items are parsed and bound. Preview materializes without writes. Each graph reread after a write opens a fresh checked scope from plain bound selectors, never a retained authority. |
| `packages/domain/src/import-tasks.ts:346` | `(read) => store.graphRead(read),` | Genuine authority from the enclosing checked callback. Profile and terminal bounds come from private fields; ordinary cursor is the bound stream state. |
| `packages/domain/src/attachment-commands.ts:57` | `const before = (yield* this.store.tasks()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/attachment-commands.ts:472` | `(read, task) => this.imageWithin(read, task),` | Managed image callback validates the live authority and selected Task/Profile, then reads private Task/Attachment ids before file access. |
| `packages/domain/src/attachment-commands.ts:482` | `const selection = yield* this.store.auth.checkRead(read, "read");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/attachment-commands.ts:498` | `readManagedImage(` | Managed image callback validates the live authority and selected Task/Profile, then reads private Task/Attachment ids before file access. |
| `packages/domain/src/attachment-commands.ts:508` | `this.imageRead(request, id).pipe(Effect.map((result) => result.image));` | Managed image callback validates the live authority and selected Task/Profile, then reads private Task/Attachment ids before file access. |
| `packages/domain/src/store/purge.ts:15` | `...metadata(entry.event),` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `apps/cli/src/main.ts:708` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:796` | `const data = yield* readTasks(store, request, filters).pipe(` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:923` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1104` | `const data = yield* readTasks(` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1320` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1377` | `const entries = yield* new ClientReads(store).history({` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1445` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1510` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1563` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1701` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1750` | `const latest = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1774` | `const data = yield* readTasks(` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1803` | `const data = yield* readTasks(` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1839` | `const data = yield* readTasks(` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:2116` | `: new ClientReads(store).profiles(credential);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:2207` | `.listRead(read)` | Owner authority in the synchronous owner callback. Snapshot Show uses private fields.snapshot; List has no id. |
| `apps/cli/src/main.ts:2218` | `.showRead(read)` | Owner authority in the synchronous owner callback. Snapshot Show uses private fields.snapshot; List has no id. |
| `apps/cli/src/main.ts:2260` | `const result = yield* store.auth.withOwnerRead(` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |

</details>

## Historical qualification before the native-COMMIT correction

The following checkpoint receipts, numbers and pending statements identify their earlier heads. They are preserved, not relabeled. Their old immutable reference and root counts are superseded by the corrected-source section above. The exact stream frame table, body-hash table, original accepted Diagnostics costs and prior attempts remain useful supporting evidence.

## Strict read scopes, delivery candidate

The owner chose B. The read-authority lifetime is now enforced by the ports, and ordinary reads materialize inside synchronous checked callbacks. This candidate is ready for SERVER-READS-S1 to review. It is not installed. The immutable qualification capture is `27ea0c5e4ba1d1fd143b8b668790904ce07e2a2d`; production domain/CLI/server source is byte-identical to the final source at 7ec357cd77afc76ddb784f1fcd294662a14b4580. Later changes qualify and document it. No experiment work resumed. The contract remains `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`.

The exact reviewed clock fix 6b167266fc34c3304e30ed220bb652b4d17c05ab merged first as b8387edd4ddab47296ea1ef3648254138d2b6e06. There was no textual conflict. mutate still passes the caller's Effect context into runSyncExitWith; private authority handling remains intact. No other branch was merged. The three domain source files added since e692 are:

- `packages/domain/src/auth/authorized-read.ts`
- `packages/domain/src/store/client-projection.ts`
- `packages/domain/src/store/history-reads.ts`

### Runtime boundary and callers

The private authority keeps its brand, exact prototype, kind, database, immutable selectors, expiry, restore generation, checked write serial, lease and failed-scope ancestry. Every authority-taking projection, graph, changes, History, Snapshot, managed-image and Diagnostics port validates before materialization. Commit, rollback, interruption and failure close the lease. Failed nested scopes invalidate their values without ending a successful outer Discovery snapshot. Any intervening write invalidates the earlier authority conservatively. A later rechecked scope validates the original generation and credentials and creates a new live value; it never revives a dead lease.

List/search, Show/graph, views, History, Quick-add, image bytes and Snapshot reads return materialized rows and plain frozen selectors. Search matching, yielding work and response encoding run after the callback. Import preview writes nothing; post-write graph reads open fresh checked scopes from plain bound selectors. Discovery keeps its one deferred snapshot, and nested checks share it. Ordinary requests make one credential SQL lookup, including Discovery with nested logical checks. The stream retains only plain subscription fields and rechecks on every poll. No production caller stores an authority for a later transaction. The runtime guard replaces plan A's proposed retention-inventory test; that test was not built.

The caller appendix below lists all 192 matching production sites, including trusted raw storage readers used by write/replay/bootstrap/scheduler paths. Those lower functions take MutationIdentity, decoded current/event rows or internal state. They are not authority-taking request ports. Both remaining requireOwner callers are accepted Snapshot write helpers in HTTP and CLI. Diagnostics has no reachable unscoped owner callback.

The unchanged C3 seat probe refuses at its FIRST changesRead after authorizeRead has returned and committed, before its later revocation/new-Task sequence. Compilation is 0; execution is 1 with StoreError/Invalid read authority and no returned row. C1's unchanged probe exits 0. C2's unchanged probe still typechecks and compiles with 0, then exits 1 at its first copied graphRead with the generic StoreError and no row. Source cmp checks against the seat's probes exit 0. These internal-port refusals are distinct from ordinary HTTP credential refusals.

The final scope tests pass 30 tests: all normal ports and Diagnostics after ten lifetime transitions, the terminal port after those transitions, a successful fresh recheck, failed-child/outer-snapshot survival, live-scope write and expiry fences, import preview and later fresh scopes, and cancellation during a real yielding search after its lease has closed. Runtime copy controls cover nine forms at fourteen direct ports and twelve public query families, 234 attempts, plus nine terminal attempts, wrong kind/database and genuine values. No rejected copy returns a row. Reflected plain selectors are not authorities.

### Absent Profiles

One classifier in the credential-check transaction distinguishes present, tombstoned and never-created identifiers after authorization. A present Profile receives an authority; a tombstone keeps ADR-0010's 404; an absent value contains only a requested string, parsed fields, credential/scope and snapshot metadata, with no Profile id or authority. It is never cached or retained across stream checks. Empty results and missing-resource replies are literals. Quick-add parses the supplied Project/Tag names against nothing and touches no projection port.

The final 840 before/head replies match across ten credential classes, six identifier cases and all fourteen Profile-scoped read cases. Literal never-created expectations are in packages/domain/test/fixtures/read-presence/. Projects/Tags/Tasks/search/views are empty 200, Quick-add returns its parsed draft, Task Show/History/graph/image give the captured missing-resource replies, and the stream opens with ready. The report's earlier captured status matrix is retained. Owner reads of a never-created name keeping 200 is an owner question, unchanged here; an old deleted id stays 404 even if its display name is reused. CLI name resolution picks the new active id. Unauthorized classes in this fixture show no new presence distinction.

Fourteen statement probes each execute only credential lookup and the classifier and decode zero operations. A blanket-404 mutant fails 404 != 200; a present-Profile-query mutant fails six statements != two. First-write, deletion and name-reuse transition tests pass. The compiled absent stream reclassifies after a separate CLI process runs init and add; its ordered frames exactly match the base.

### Stream frames and the approved terminal difference

Fourteen compiled base/head scenarios pass: ordered delivery with other-Profile gaps, reconnect, restore/reload, revocation, expiry, absent-to-present creation and seven deletion credential cases. Only an already connected, still-valid owner Session receives the private one-shot terminal permission. It binds connection, Profile, generation, delivered cursor and deletion cap, dies with the connection, cannot grant any other query, and cannot be consumed twice. One transaction checks the credential once and selects the active, absent or terminal result.

The table abbreviates only unchanged operation payloads as seq plus event.kind. Each operation's full data bytes, SSE id, event line and double-newline terminator are preserved and compared in `docs/evidence/ui-speed/server-reads/final-stream-control-2/<scenario>.json`. Every row ends with the same failure and connection close; the stream emits no extra close frame.

| Connected credential | Base frames | Head frames |
| --- | --- | --- |
| delete-owner | ready; 18 TaskCreated; 19 TaskDeleted; 20 TaskDeleted; 21 ProfileDeleted; failure Profile not found; choose a Profile from GET /profiles | ready; 18 TaskCreated; 19 TaskDeleted; 20 TaskDeleted; 21 ProfileDeleted; failure Profile not found; choose a Profile from GET /profiles |
| delete-scoped | ready; 18 TaskCreated; 19 TaskDeleted; 20 TaskDeleted; 21 ProfileDeleted; failure revoked | ready; failure revoked |
| delete-unscoped | ready; 18 TaskCreated; 19 TaskDeleted; 20 TaskDeleted; 21 ProfileDeleted; failure Profile not found; choose a Profile from GET /profiles | ready; failure Profile not found; choose a Profile from GET /profiles |
| delete-revoked-token | ready; 18 TaskCreated; 20 TaskDeleted; 21 TaskDeleted; 22 ProfileDeleted; failure revoked | ready; failure revoked |
| delete-revoked-session | ready; 18 TaskCreated; 20 TaskDeleted; 21 TaskDeleted; 22 ProfileDeleted; failure revoked | ready; failure revoked |
| delete-expired-token | ready; 18 TaskCreated; 19 TaskDeleted; 20 TaskDeleted; 21 ProfileDeleted; failure expired | ready; failure expired |
| delete-expired-session | ready; 18 TaskCreated; 19 TaskDeleted; 20 TaskDeleted; 21 ProfileDeleted; failure expired | ready; failure expired |

The exact ready frame is `event: ready\ndata: null\n\n`. Revoked and expired terminal failures retain these exact wire strings respectively:

~~~text
event: effect/http-api/stream/failure
data: [{"_tag":"Fail","error":{"_tag":"Unauthorized","message":"revoked","exit_code":3,"exit_meaning":"not found or auth missing"}}]

event: effect/http-api/stream/failure
data: [{"_tag":"Fail","error":{"_tag":"Unauthorized","message":"expired","exit_code":3,"exit_meaning":"not found or auth missing"}}]

~~~

The valid owner and still-valid unscoped Token retain the same not_found failure bytes, including the fixed fixture time:

~~~text
event: effect/http-api/stream/failure
data: [{"_tag":"Fail","error":{"exit_code":3,"exit_meaning":"not found or auth missing","generated_at":"2026-11-11T18:00:00.000Z","code":"not_found","message":"Profile not found; choose a Profile from GET /profiles"}}]

~~~

The removed terminal batch for revoked/expired credentials and for Tokens is the owner-approved difference. ADR-0010's owner Session guarantee and its text are unchanged. Ordinary revocation/expiry without deletion is frame-identical to the base.

### Diagnostics and the accepted IMMEDIATE cost

The constructor differs from 70b60e22 by exactly the approved third callback argument: (input, use) => this.auth.withOwnerRead(input, Schema.Struct({}), {}, use), plus the formatter's line break. Construction executes the same ten statements/bindings on the exact same database, calls no credential lookup, and leaves its file hash unchanged. Nine other AtomicCAS-covered store members and four cache capture/preparation statements are byte-identical. The historical hash table below retains their full hashes.

Diagnostics validates the owner at its port and synchronously materializes generation, real Snapshot manifests, pending reminders and all snapshot metrics in that lease. The final structural control requires one physical transaction and one credentialUsed call, no materialization after closure, and db.inTransaction false on return. A separate writer attempted while a read was paused waits, then commits after the read returns while the reader process is still alive. Its measured wait is 62.51 ms within the paused read's 226.91 ms, a relative causal check rather than an absolute speed limit. Cross-process admission markers establish ordering; Bun hrtime epochs are process-local.

Ten domain refusal/success pairs preserve normalized body/error bytes and action/actor/Profile-null History against 70b60e22. Every refused domain invocation records exactly one rejected-authentication row; successful reads record none. The empty-credential domain case is included. The compiled HTTP recipe separately checks missing credentials and Token denial. Forged, retained-after-unrelated-request and after-lease materialization controls refuse with literal messages. Three isolated sensitivity builds remove the owner port check, move work after closure, or allow a retained owner value; each exits 1 at its intended literal assertion. The restored source passes.

The coordinator withdrew the earlier 5/50 ms stop rule and accepted the following paired continuous writer-lock holds. No executable absolute threshold remains. Each arm has ten warmups then 200 alternating paired reads per fixture, all 800 timed reads synchronous and successful. Modes remain IMMEDIATE.

| Fixture | Before median/p99/max ms | After median/p99/max ms | Total read median before/after ms |
| --- | --- | --- | --- |
| Owner-shaped | 3.59 / 4.26 / 4.54 | 25.34 / 28.98 / 29.70 | 25.61 / 25.40 |
| Retained Snapshots | 3.67 / 8.06 / 8.48 | 31.39 / 58.51 / 66.31 | 31.49 / 31.44 |

Total read time is unchanged. Before used three IMMEDIATE transactions; after uses one. The retained fixture has sixteen genuine internal checkpoints totaling 43,841,718 bytes and eight filesystem Snapshots totaling 504,987,648 bytes. Both sides use copies of the same fixture. These are synthetic owner-sized data, never the real database. The full timing and fixed Clock/RSS body controls are under strict-diagnostics-holds/.

### Per-route lease hold

The paired server sweep uses five alternating pairs per route after a warmup pair on n178-p8-large1-h2048. Values are median [minimum, maximum] of the longest continuous physical transaction callback through COMMIT, excluding admission wait. Nested savepoints are not double-counted. A deferred cell is a read-snapshot duration, not a writer-lock hold. This is instrumented scope evidence on a busy host, separate from uninstrumented end-to-end timing. All head ordinary routes perform one credential SQL lookup. History decodes exactly its 2,049 returned rows; non-History reads decode zero operations. The stream row is its initial handshake; poll/frame behavior has separate controls.

| Route, owner-shaped fixture | Base hold ms | Head hold ms | Physical transactions, base/head | Mode |
| --- | ---: | ---: | --- | --- |
| `/profiles` | 52.92 [46.15, 69.13] | 1.93 [1.49, 2.16] | 9/1 | immediate |
| `/profiles?include_projects=true` | 365.59 [362.25, 457.14] | 2.35 [1.98, 3.10] | 1/1 | deferred |
| `/tasks/lookup?prefix=a` | 389.72 [376.41, 409.23] | 10.82 [7.72, 15.19] | 1/1 | deferred |
| `/auth/tokens` | 0.09 [0.07, 0.12] | 0.09 [0.07, 0.16] | 1/1 | immediate |
| `/snapshots` | 0.38 [0.32, 0.50] | 0.53 [0.47, 0.60] | 2/1 | immediate |
| `/snapshots/00000000-0000-4000-8000-000000000000` (404) | 0.10 [0.08, 0.13] | 0.21 [0.20, 0.36] | 2/1 | immediate |
| `/diagnostics` | 7.48 [7.26, 7.84] | 47.20 [43.25, 49.10] | 3/1 | immediate |
| `/profiles/p0/projects` | 57.28 [49.65, 64.24] | 0.34 [0.22, 0.44] | 1/1 | immediate |
| `/profiles/p0/tags` | 61.17 [60.46, 64.54] | 0.24 [0.21, 0.47] | 1/1 | immediate |
| `/profiles/p0/tasks` | 48.75 [45.19, 61.08] | 2.08 [1.49, 2.53] | 2/1 | immediate |
| `/profiles/p0/tasks?text=Task` | 51.76 [44.84, 57.54] | 1.91 [1.42, 2.47] | 2/1 | immediate |
| `/profiles/p0/views/inbox` | 50.17 [47.04, 91.26] | 1.81 [1.25, 2.00] | 1/1 | immediate |
| `/profiles/p0/views/today` | 50.53 [47.49, 56.14] | 1.92 [1.19, 1.96] | 1/1 | immediate |
| `/profiles/p0/views/overdue` | 52.53 [48.17, 58.48] | 1.68 [1.28, 2.06] | 1/1 | immediate |
| `/profiles/p0/views/scheduled` | 44.84 [43.04, 49.31] | 1.40 [1.24, 2.24] | 1/1 | immediate |
| `/profiles/p0/tasks/p0-t0000` | 49.15 [43.92, 55.84] | 1.80 [1.48, 2.67] | 2/1 | immediate |
| `/profiles/p0/tasks/p0-t0000/history` | 43.96 [41.70, 46.30] | 33.77 [33.29, 37.58] | 1/1 | immediate |
| `/profiles/p0/tasks/p0-t0000/graph` | 42.04 [41.45, 45.99] | 2.66 [1.91, 2.85] | 2/1 | immediate |
| `/profiles/p0/tasks/p0-t0000/attachments/missing/image` (404) | 42.19 [39.87, 53.41] | 1.79 [1.39, 2.78] | 4/1 | immediate |
| `/profiles/p0/quick-add/parse` | 0.16 [0.11, 0.18] | 0.20 [0.19, 0.24] | 1/1 | immediate |
| `/profiles/p0/events` | 0.14 [0.09, 0.18] | 0.26 [0.16, 0.30] | 1/1 | immediate |
| `/snapshots/:real` | 0.08 [0.06, 0.13] | 0.19 [0.13, 0.29] | 2/1 | immediate |

The ordinary scheduler remains enabled. It creates matching daily filesystem Snapshots during this sweep. Snapshot list/real Show comparisons normalize only their separate scratch ids/paths; other manifest fields are equal. Diagnostics process data is checked by its separate fixed-state control. The 57-fixture byte gate uses shared file identities and has no such Snapshot normalization. A rich-fixture structural sweep also reads the real managed PNG and records one lookup and zero operation decodes. Accepted 200-pair Diagnostics measurements above remain the cost decision; this short paired table is not a replacement p99 estimate.

### Paired eight-read refresh

The cold-path report's ambient driver runs five alternating before/after fresh-process pairs per request order, three passes per process. This gives 20 processes and 480 validated HTTP 200 responses, zero failures, and zero operation decodes for every head observation. The warm second pass is below. Figures are handler milliseconds, median [minimum, maximum]. The base is exact e692; the head has the same production source as the immutable qualification capture.

| First request | Eight-read sum, base ms | Eight-read sum, head ms | Profiles, base ms | Profiles, head ms |
| --- | ---: | ---: | ---: | ---: |
| profiles | 864.94 [694.31, 1003.21] | 16.54 [14.37, 23.36] | 453.68 [356.37, 550.83] | 2.70 [1.93, 3.40] |
| profile | 742.09 [657.93, 786.34] | 13.59 [12.17, 14.85] | 385.83 [342.72, 422.67] | 2.25 [1.86, 2.66] |

The gain remains clear despite the busier machine: ten logical CPUs, one-minute load 8.33–9.03, eight workers reported by the coordinator. Both sides use the same data, runtime and SQLite settings and alternate under the timing lock. The fixture has 178 selected Tasks, eight Profiles, 1,427 total Tasks, 3,480 operations, 10,671,315 operation bytes and 2,695,765 Task bytes. Base Profiles alone decodes 27,840 operations; the other seven reads each decode 3,480. Eliminating that parse/schema work explains the gain. The separate original cold-path profile and current decode/statement probes establish the limiter; tracing is excluded from this timing. The historical roughly 438 ms comparison used a quieter run/earlier fixture and is not relabeled here. These are server intervals, not input-to-render or UI p99 claims.

### Discovery expiry control correction

The original verification skill expired the HTTP credential on credentialUsed callback 2 or 3 and called that moment 'after missing Task check'. Its unchanged run passes on clock-fix base 6b167266, but head attach-many returns the same 401/expired with one mutate row instead of authenticate. Traces show callback 3 is still inside the checked read nested in the Attachment write. The base finishes that read and rejects later during enrichment; the head notices expiry while creating that read authority, so the outer write rolls back and attributes the refusal to mutate. A callback count names neither boundary and is not retained as the trigger.

The corrected six-case control keys expiry to command entry, after taskLookupError has completed its final check but before the next write, or inside mutate after its check and before its callback. It uses the SAME scratch Token for CLI and HTTP and asserts actors, Profile work, literal refusal bytes and exactly one AuthAttemptRejected row. The corrected control passes unchanged on base 6b167266 and head; the already-expired HTTP/CLI projection remains identical including actor and authenticate/expired. The attribution mutant changes authenticate to mutate for an already-expired caller and fails the literal assertion. Both first and strengthened same-Token runs are retained.

| Command | Named expiry moment | Base/head HTTP | Base/head History action | Rows |
| --- | --- | --- | --- | ---: |
| batch-edit | Before command | 401 / 401 | authenticate / authenticate | 1 / 1 |
| batch-edit | Inside checked write, before callback | 401 / 401 | authenticate / authenticate | 1 / 1 |
| attach-many | Before command | 401 / 401 | authenticate / authenticate | 1 / 1 |
| attach-many | Inside checked write, before callback | 401 / 401 | mutate / mutate | 1 / 1 |
| attach-many | Enrichment checked, before rejection write | 401 / 401 | mutate / mutate | 1 / 1 |
| import | Before aggregate entry | 401 / 401 | authenticate / authenticate | 1 / 1 |

All six HTTP refusal bodies are exactly `{"_tag":"Unauthorized","message":"expired","exit_code":3,"exit_meaning":"not found or auth missing"}`. CLI remains exit 3/auth_required; its generated_at is its real invocation time and is preserved in receipts. Actor equals the issued Token id on each surface. Batch-edit has no write after enrichment. This missing-id Import fixture is conflict-guarded before enrichment or a Task write, so those later moments do not exist in it.

In the Attachment interval from the outer checked write through missing-Task recovery and enrichment, the base already permits authenticate or mutate attribution depending on where expiry lands. The removed gap between checked metadata and later graph materialization has become one synchronous scope. Its changed count-based observation maps to the base's during-write mutate witness in that same interval; no new action is introduced. Inner rejection rows roll back with their enclosing failed transaction; only the outer rejection survives. The six named boundary controls prove one row, not two or zero, at each refusal. This is a source/control argument over these synchronous paths, not an unbounded timing theorem. A direct stale-authority port refusal remains the separately required generic storage error rather than an authentication History event.

The verification-only builder injects two named hooks into captured source, records before/after hashes, and never edits product files. The runner keys its compiled cache by both control and builder hashes. This skill change, its before/after trigger and its sensitivity receipt are explicitly submitted to SERVER-READS-S1 with the two proof renewals.

### Proof mappings for the seat

AtomicCAS coverage changes ONLY store.ts's SHA-256 and confirmedCommit to `27ea0c5e4ba1d1fd143b8b668790904ce07e2a2d`. Its source gate first refused the stale hash after model and production behavior passed. The exact constructor closure diff, identical ten-statement construction trace, nine unchanged covered members and unchanged cache statements justify the reviewed Init mapping. The final command passes model and production stages; both real store sensitivity mutations fail their intended behavioral assertions with exit 1, restore exact bytes, and the restored same command exits 0. Evidence: fv01-check-noeV3k and sensitivity-djgfwI under docs/evidence/fv01/.

Cache coverage changes ONLY current source hashes and productCommit. Both pre-renewal passes at the immutable source reach their stale hash gate after seven source controls, exact restoration/strict typecheck and three observer controls/restoration. Every cache, matcher, meter, runner, admission and integration body listed below is byte-identical. No model, matcher, mapping table, invariant, fixture or cache control changes. The full post-renewal gate passes all nine stages including compiled lifecycle, external erasure and CLI defect/refusal. Evidence: docs/evidence/perf-cache/verify-ms7aZ3/. The coverage file's earlier review prose remains historical; its productCommit field is the renewed reference, as the ruling permits hash/reference edits only.

Neither renewal is accepted until SERVER-READS-S1 rechecks it. Constructor wiring and this reviewed cache renewal have explicit coordinator approval. No other proof pins change.

<details>
<summary>Seventy byte-identical covered bodies and statements, full before/after hashes</summary>

| Covered body or statement | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| `packages/domain/src/task-search-cache.ts: packages/domain/src/task-search-cache.ts` | a7a24d8211ebf7aaf1cf559547f7339150d680db9ac3a81c4ccea283e2b76baf | a7a24d8211ebf7aaf1cf559547f7339150d680db9ac3a81c4ccea283e2b76baf |
| `packages/domain/src/task-search.ts: packages/domain/src/task-search.ts` | 1a82bab698508fe98c1d7de11fddbaf910454d69c3f6534e45e8b0ce9203c23c | 1a82bab698508fe98c1d7de11fddbaf910454d69c3f6534e45e8b0ce9203c23c |
| `packages/domain/src/task-search-case-fold.ts: packages/domain/src/task-search-case-fold.ts` | 4f44913d63f3de2d65ecbee037b8810388945f0514d76079e7b24cc6141fe08e | 4f44913d63f3de2d65ecbee037b8810388945f0514d76079e7b24cc6141fe08e |
| `packages/domain/src/task-filters.ts: packages/domain/src/task-filters.ts` | aff1e83b4486135946a007018ec2551b145aaefb5d7a51f5bcf213db991e6f55 | aff1e83b4486135946a007018ec2551b145aaefb5d7a51f5bcf213db991e6f55 |
| `packages/domain/src/store/snapshots.ts: packages/domain/src/store/snapshots.ts` | 4ed23e32cffd61998f5cabd15616840d466ccbbe0e1d3d0e3121d730e2d827f9 | 4ed23e32cffd61998f5cabd15616840d466ccbbe0e1d3d0e3121d730e2d827f9 |
| `packages/domain/src/store/search-cache-events.ts: packages/domain/src/store/search-cache-events.ts` | 4f0276e1953a56db0a31844c51faec02835eea134b04a06ed2ba6e9231d6d600 | 4f0276e1953a56db0a31844c51faec02835eea134b04a06ed2ba6e9231d6d600 |
| `apps/server/src/task-search-cache-hygiene.ts: apps/server/src/task-search-cache-hygiene.ts` | be77122a27f471e8d9804f6215bdd5c8622bfcdf952130cdb7e58ebd8b61883b | be77122a27f471e8d9804f6215bdd5c8622bfcdf952130cdb7e58ebd8b61883b |
| `.agents/skills/verify-task-search-cache/admission/TaskSearchCacheAdmission.tla: .agents/skills/verify-task-search-cache/admission/TaskSearchCacheAdmission.tla` | 36a3bab09cb2b8cf6daaf37ddd44348b1a21ac1db25ddb4908495f6f6f27949e | 36a3bab09cb2b8cf6daaf37ddd44348b1a21ac1db25ddb4908495f6f6f27949e |
| `.agents/skills/verify-task-search-cache/admission/MAPPING.md: .agents/skills/verify-task-search-cache/admission/MAPPING.md` | 8709eb84b0ca66d5755a122bf22129b4d1faf64aedc974fc2187e20f966763d0 | 8709eb84b0ca66d5755a122bf22129b4d1faf64aedc974fc2187e20f966763d0 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.entries` | e5ce8ef09f7adf0c789a9924202a71ff67e8ab544e85da50b4d7a67ffdba542d | e5ce8ef09f7adf0c789a9924202a71ff67e8ab544e85da50b4d7a67ffdba542d |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.pending` | 1662d3f620b204e0c95ff8a27d9dfac39425b73f9f909b6eec70c27e8c4820e4 | 1662d3f620b204e0c95ff8a27d9dfac39425b73f9f909b6eec70c27e8c4820e4 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.purgeGen` | b576e170f08d1aba631bed87db630e8b746305371050a5cfb94447f6f835be3a | b576e170f08d1aba631bed87db630e8b746305371050a5cfb94447f6f835be3a |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.retainedBytes` | 703e5e4b14ce023570510dc66fc5a626d9b9410e6986c789dec064b47080c513 | 703e5e4b14ce023570510dc66fc5a626d9b9410e6986c789dec064b47080c513 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.pendingBytes` | 553759052ce900d89df3afb622400704978ec536ed59a213e0d5151284c72d80 | 553759052ce900d89df3afb622400704978ec536ed59a213e0d5151284c72d80 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.closed` | 2a93ce214afee0ab1b05541ad6cdf99b04bde4f79234b208ec54bc73140f4f65 | 2a93ce214afee0ab1b05541ad6cdf99b04bde4f79234b208ec54bc73140f4f65 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.epoch` | 2bc5a723b62bb27f8fcddcd6b93e8f7aa4421d0733734edac5f8599576460a4b | 2bc5a723b62bb27f8fcddcd6b93e8f7aa4421d0733734edac5f8599576460a4b |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.read` | e11e490afbf0c96ab7caf37102c9235b4721b6d409040f7bb28e7c72347877c4 | e11e490afbf0c96ab7caf37102c9235b4721b6d409040f7bb28e7c72347877c4 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.canAdmit` | 495d0bf9ba27e3173dd904f3ac395ce609f4a277a7148776b2967bf0cd16b8a8 | 495d0bf9ba27e3173dd904f3ac395ce609f4a277a7148776b2967bf0cd16b8a8 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.key` | b4ff7484be5cd3bd18040a8d574055da178c04bf3278e4bdb3e75c7dbe19cda1 | b4ff7484be5cd3bd18040a8d574055da178c04bf3278e4bdb3e75c7dbe19cda1 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.keyBytes` | 52bc5550e05611b755655852650395545f6aab20953aab8d3a0bbfe5ded6ad45 | 52bc5550e05611b755655852650395545f6aab20953aab8d3a0bbfe5ded6ad45 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.usage` | 87c261ad78a27fb538b64e3bdcf0a97ab69d491215907633ea24b06a807a671e | 87c261ad78a27fb538b64e3bdcf0a97ab69d491215907633ea24b06a807a671e |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.words` | de91b0c596e3e8d7eb34dc6b842333170aa6559eb6770341c576fa925074f324 | de91b0c596e3e8d7eb34dc6b842333170aa6559eb6770341c576fa925074f324 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.prepare` | 2081d7590cc817f23614f46b6b56c474749ec0d743b80d5972eec74a90e8be17 | 2081d7590cc817f23614f46b6b56c474749ec0d743b80d5972eec74a90e8be17 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.register` | 160e6184d1dfc707b4fdb338d70d354b055a8e86c01ab1bedc7f0f89f17ca430 | 160e6184d1dfc707b4fdb338d70d354b055a8e86c01ab1bedc7f0f89f17ca430 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.retain` | 3b961e9551110b5a3428f5a3e8630014236cb72c72175d92cb00aefd8594d084 | 3b961e9551110b5a3428f5a3e8630014236cb72c72175d92cb00aefd8594d084 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.reserve` | 61c6bf20bf74b27cecb782ef3b26bbb5163696a91d78ea3e1a3a86e5ad6de9fe | 61c6bf20bf74b27cecb782ef3b26bbb5163696a91d78ea3e1a3a86e5ad6de9fe |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.dropEntry` | e00d52079d4816a1ba76861febebb28fdb1e493f52d2211cd5edfde8b387dff6 | e00d52079d4816a1ba76861febebb28fdb1e493f52d2211cd5edfde8b387dff6 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.dropPending` | 352e5f6bd78bdf33341f47304558c8ec72b4ea3532d64df8a7b3c4b782c077d2 | 352e5f6bd78bdf33341f47304558c8ec72b4ea3532d64df8a7b3c4b782c077d2 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.revoke` | a8cf7f8bd0b992bed80dee8d8791fd0bdbd378c0e0cf7a99b7e63591e8b4a027 | a8cf7f8bd0b992bed80dee8d8791fd0bdbd378c0e0cf7a99b7e63591e8b4a027 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.evict` | 33f31d3b531c659e118b354ffa38ce581401c2a60be5734dc7b263ddf3f198d9 | 33f31d3b531c659e118b354ffa38ce581401c2a60be5734dc7b263ddf3f198d9 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.evictProfile` | 81746bfcde0c80c719f1976b8350a13c7a59e660de66ddd15a4913502b26e8a0 | 81746bfcde0c80c719f1976b8350a13c7a59e660de66ddd15a4913502b26e8a0 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.clearAll` | b22eb4e7a2dc0e264088c970125963d51fb9eb36c913af77e00f1815f050bae6 | b22eb4e7a2dc0e264088c970125963d51fb9eb36c913af77e00f1815f050bae6 |
| `packages/domain/src/task-search-cache.ts: TaskSearchCache.close` | 5cb72487a6ae7393bdfd0bf6df51e3fc3d0bbfce18ef3b9d8b34660b0bd1e075 | 5cb72487a6ae7393bdfd0bf6df51e3fc3d0bbfce18ef3b9d8b34660b0bd1e075 |
| `packages/domain/src/task-search.ts: SearchMatch` | c77ab5c9c2d86a0e83ffcd1bfe10c9377623531e9263c866e7e50449fdb1bb05 | c77ab5c9c2d86a0e83ffcd1bfe10c9377623531e9263c866e7e50449fdb1bb05 |
| `packages/domain/src/task-search.ts: SearchMatches` | 53e2ea9f70ba8c1da1a8abe26ae0b75c38d62c5d114f194e0620e40e9703a1f9 | 53e2ea9f70ba8c1da1a8abe26ae0b75c38d62c5d114f194e0620e40e9703a1f9 |
| `packages/domain/src/task-search.ts: taskSearchWorkLimits` | a7786441a8a2d9c0557e1bb29cd1b5991fd153c1c4e57b0e481241dfa14a4f92 | a7786441a8a2d9c0557e1bb29cd1b5991fd153c1c4e57b0e481241dfa14a4f92 |
| `packages/domain/src/task-search.ts: searchTooBroadMessage` | ed98ed16cc722dc036d628ab8400bc270af158ed25c55fd056773063433f73b4 | ed98ed16cc722dc036d628ab8400bc270af158ed25c55fd056773063433f73b4 |
| `packages/domain/src/task-search.ts: SearchTooBroad` | 26c003517add04a70c546553dc392f746053c3f398ee37705a58e2b00e333199 | 26c003517add04a70c546553dc392f746053c3f398ee37705a58e2b00e333199 |
| `packages/domain/src/task-search.ts: TaskSearchWork` | 8ec9135b98add11e98ccc2d1b750b9114fcc7178c22d01042ce6ed8580760fdd | 8ec9135b98add11e98ccc2d1b750b9114fcc7178c22d01042ce6ed8580760fdd |
| `packages/domain/src/task-search.ts: taskSearchExecution` | e1cee6a28a8883e8f77226982833fe9c713d1da993d911885b8fa3b45e2477ba | e1cee6a28a8883e8f77226982833fe9c713d1da993d911885b8fa3b45e2477ba |
| `packages/domain/src/task-search.ts: words` | 5b07f78640d1b537bd5394e9aed6c1a04c77233b7d578778a30db22a55613a13 | 5b07f78640d1b537bd5394e9aed6c1a04c77233b7d578778a30db22a55613a13 |
| `packages/domain/src/task-search.ts: graphemes` | 6931d0080ac1b8aabebd4cd9662d2035c9344975d781a1cdf093c5b9d27c59f5 | 6931d0080ac1b8aabebd4cd9662d2035c9344975d781a1cdf093c5b9d27c59f5 |
| `packages/domain/src/task-search.ts: normalizeTaskSearch` | af97b58153af9038505d16adc70d78a714caa0482ffd30adab970b995ecc1493 | af97b58153af9038505d16adc70d78a714caa0482ffd30adab970b995ecc1493 |
| `packages/domain/src/task-search.ts: queryWords` | 0d91b83eb68d814e220db9e1261af1a6f70ff8517f751593a00318e43298e95c | 0d91b83eb68d814e220db9e1261af1a6f70ff8517f751593a00318e43298e95c |
| `packages/domain/src/task-search.ts: parseTaskSearch` | a4aae184d9e63cd9f2e24d075af86fbaab653cea49e00e6b08ffd8aa731e1882 | a4aae184d9e63cd9f2e24d075af86fbaab653cea49e00e6b08ffd8aa731e1882 |
| `packages/domain/src/task-search.ts: fieldWords` | 7b0a4a527e81351405ef4fef526d6926c564ae39bdf3bcb3226cbb9b82f73dc6 | 7b0a4a527e81351405ef4fef526d6926c564ae39bdf3bcb3226cbb9b82f73dc6 |
| `packages/domain/src/task-search.ts: prefixMatcher` | 5c7ff1aa20942c17c12b02e21ffdcbac7f1e6ab8506855671ca1f1fb4ddbaa48 | 5c7ff1aa20942c17c12b02e21ffdcbac7f1e6ab8506855671ca1f1fb4ddbaa48 |
| `packages/domain/src/task-search.ts: searchChunkWords` | 291f7930d7b71d30d99ecc342893c3ba7df4a7903a3af31498b12eb14a8689c3 | 291f7930d7b71d30d99ecc342893c3ba7df4a7903a3af31498b12eb14a8689c3 |
| `packages/domain/src/task-search.ts: clauseMatches` | ec8876dd0c0a7056e91a5b76fce6dc166a3783b4bdc1bb2207a9ddbf51580d4e | ec8876dd0c0a7056e91a5b76fce6dc166a3783b4bdc1bb2207a9ddbf51580d4e |
| `packages/domain/src/task-search.ts: evaluateTaskSearchSteps` | 149d2c03e12a5a257713f4d1f8d69e3cdaa21ab989b2ebcf9a5472960f3f5f18 | 149d2c03e12a5a257713f4d1f8d69e3cdaa21ab989b2ebcf9a5472960f3f5f18 |
| `packages/domain/src/task-search.ts: matchTaskSearchSteps` | 3275bfb2e3061528c15ec47519e136c628e9f4835e095d809340447c5328598f | 3275bfb2e3061528c15ec47519e136c628e9f4835e095d809340447c5328598f |
| `packages/domain/src/task-search.ts: matchTaskSearch` | c4067fd44597fb30038310ab7be15b5d62954b5da13ae7c3f3bac5aac267d372 | c4067fd44597fb30038310ab7be15b5d62954b5da13ae7c3f3bac5aac267d372 |
| `packages/domain/src/task-filters.ts: function* filterTaskRecordSteps(` | bdadb9e64d4f0a0fb5164c2627e70ffb1ab2c5165fccbfdf0508c44f1f5df6b9 | bdadb9e64d4f0a0fb5164c2627e70ffb1ab2c5165fccbfdf0508c44f1f5df6b9 |
| `packages/domain/src/task-filters.ts: export function filterTaskRecords(` | e95ec121baf7f4de5c13564f6d335640fe54239c9750d2cbf0f61c442a4317f0 | e95ec121baf7f4de5c13564f6d335640fe54239c9750d2cbf0f61c442a4317f0 |
| `packages/domain/src/task-filters.ts: export function runTaskRecordSteps` | 450132b411202385ed6dfed3476aef2f862fd5e02f75eaf12994d647c499f4bb | 450132b411202385ed6dfed3476aef2f862fd5e02f75eaf12994d647c499f4bb |
| `packages/domain/src/task-filters.ts: filterTaskRecordsEffect` | 96f65f0f5cea1bc4a485ab77911bb75475ab0431acc586c85c78971d368073c9 | 96f65f0f5cea1bc4a485ab77911bb75475ab0431acc586c85c78971d368073c9 |
| `packages/domain/src/store/store.ts: OperationStore.close` | 513ffb0e4b4905d2bd3ac5f9df02dcd3f656cc68fcc7ddb5cb60b6d25bef9d43 | 513ffb0e4b4905d2bd3ac5f9df02dcd3f656cc68fcc7ddb5cb60b6d25bef9d43 |
| `packages/domain/src/store/store.ts: OperationStore.deleteProfileSync` | 9d1bbf11f8774f80865c941c39706715c98d3f43f11495c8eddf90ab86befd21 | 9d1bbf11f8774f80865c941c39706715c98d3f43f11495c8eddf90ab86befd21 |
| `packages/domain/src/store/store.ts: OperationStore.searchCacheEvents` | 8d6c171c76bab2d6c05b0d66ae3be8652b729a90b27dacad5964ee3e6ad49a12 | 8d6c171c76bab2d6c05b0d66ae3be8652b729a90b27dacad5964ee3e6ad49a12 |
| `packages/domain/src/store/store.ts: OperationStore.appendSync` | 0d03e81034c9e6b53dd00ac0a1e2a93a784080a5566d5bc8b9cef2a13552e305 | 0d03e81034c9e6b53dd00ac0a1e2a93a784080a5566d5bc8b9cef2a13552e305 |
| `packages/domain/src/store/snapshots.ts: Snapshots.generationSync` | ab0889b07a2f05061214d638b3c77463a853365c88d947f95323761faac61c7c | ab0889b07a2f05061214d638b3c77463a853365c88d947f95323761faac61c7c |
| `packages/domain/src/store/snapshots.ts: Snapshots.restore` | ed3e40ba134fcc021781b505a5ab56414042d620f5a75e1462c49922a91be451 | ed3e40ba134fcc021781b505a5ab56414042d620f5a75e1462c49922a91be451 |
| `packages/domain/src/commands.ts: const search = store.searchWords.read(selected.profile);` | 8bcd38d482d0dd09a0dfa602c0ebdabc93f504bee4573e9301b065d6cb46801c | 8bcd38d482d0dd09a0dfa602c0ebdabc93f504bee4573e9301b065d6cb46801c |
| `packages/domain/src/commands.ts: const search = this.store.searchWords.read(selected.profile);` | 95f71f3ffb7baf48954bf14811b38085f5b571c9c4ed5617c405f34074579c79 | 95f71f3ffb7baf48954bf14811b38085f5b571c9c4ed5617c405f34074579c79 |
| `packages/domain/src/commands.ts: prepare: (text) => store.searchWords.words(search, text),` | c249d4474b02901f815c404a5aaad117cf0477507b63660434564008bca1f6b8 | c249d4474b02901f815c404a5aaad117cf0477507b63660434564008bca1f6b8 |
| `packages/domain/src/commands.ts: prepare: (text) => this.store.searchWords.words(search, text),` | 6ba1861742d72aea0c46abb6303ac1a5dc88d9d279956c0c24c754c2b9b596b9 | 6ba1861742d72aea0c46abb6303ac1a5dc88d9d279956c0c24c754c2b9b596b9 |
| `packages/domain/src/commands.ts: readTasks matching and preparation` | 2786b86729f2a9b84a10f7d08f068bf0b78a19641bede656b8bc218cbb3f6379 | 2786b86729f2a9b84a10f7d08f068bf0b78a19641bede656b8bc218cbb3f6379 |
| `packages/domain/src/commands.ts: TaskCommands.list matching and preparation` | 2c24c6178e40eaf51263ab774e3c9600a09c6a935909b3b4f87f4fbd7f89e0c5 | 2c24c6178e40eaf51263ab774e3c9600a09c6a935909b3b4f87f4fbd7f89e0c5 |
| `apps/server/src/server.ts: external erasure observer startup` | a17f91a7d09e675d969aecf2d7704aa90f43466b9e7bc2713d99376843c899db | a17f91a7d09e675d969aecf2d7704aa90f43466b9e7bc2713d99376843c899db |
| `apps/cli/src/main.ts: Task search CLI defect classification` | f30798336dc036833a04610e795ffab30903f3ca132ead3cb1fe90a399d4ba99 | f30798336dc036833a04610e795ffab30903f3ca132ead3cb1fe90a399d4ba99 |

</details>

### Commands and real exits

Evidence paths in this table are relative to `docs/evidence/ui-speed/server-reads/` unless stated otherwise. Exact argv and child exits for recipes remain in their summary/commands JSON. Product-normal CLI/server/seed provenance is .scratch/server-reads/strict-final-build.json, source hash ae5e1281b64994e26b885dd6a6aeb45de9c003fb0d9a10e46e80eaab71077ab0, immutable head 27ea0c5e4ba1d1fd143b8b668790904ce07e2a2d. Fixed-clock observers/probes are separate artifacts with their builder provenance; their body source is the same product. Successful existing gates are not relabeled from an older code path.

| Command/control | Real exit(s) | Receipt |
| --- | --- | --- |
| Scope tests, authority/Diagnostics/lifetime | 0 (20 tests), then 0 (30 with all terminal transitions) | final-scope-tests.log; final-scope-tests-2.log |
| Unchanged seat probes C1; C2 typecheck/compile/run; C3 compile/run | 0; 0/0/1 refusal; 0/1 refusal | final-c1*, final-c2*, final-c3*, final-seat-refusals.json |
| 56-checkpoint differential plus rich lifecycle | 0 / 0; 23,880 + 1,267 = 25,147 pairs | final-parity-56*, final-parity-rich* |
| Credential-hook and port-hook mutation modes | 0 / 0; 1,267 pairs per mode | final-mutation-credential*, final-mutation-port* |
| Two-Profile interleaving and copied-authority port refusal | 0 / 0; 60 good replies and 20 generic refusals | final-interleaving*, final-boundary-copy-refusal* |
| Absent 840 replies and fourteen statement/decode probes | 0 | final-absent* |
| Absent blanket-404 / present-query mutants | 1 / 1, intended status/statement assertions | final-absent-404.log; final-absent-query.log |
| Compiled SSE before/head, first then corrected CLI creation fixture | 1 (missing init), 0 (14 scenarios) | final-stream-control.log; final-stream-control-2* |
| Diagnostics structural/refusal/History/writer control attempts | 1 (shadowed process), 1 (wrong fixture Profile), 1 (cross-process hrtime assumption), 0 | final-diagnostics-structure*.log; final-diagnostics-structure-4/result.json |
| Three Diagnostics sensitivity builds/runs | builds 0, runs 1 each; controller 0 | final-diagnostics-sensitivity.log |
| Original Diagnostics absolute threshold | 1; withdrawn by coordinator, historical only | strict-diagnostics-threshold.log |
| All-route structural hold/lookup/decode helper attempts | 1 (read-only WAL opening), 1 (header name), 1 (expected stream abort), 0, 0; rich 0 | final-read-holds*.log; final-rich-read-holds.log |
| Paired physical transaction sweep attempts | 1 (independent Snapshot identities), 1 (Show envelope), 0 | final-lock-paired*.log; final-lock-paired-3/result.json |
| Paired five-pair/two-order cold-path ambient driver | 0; 480/480 HTTP 200 | final-owner-timing.log; derived.json |
| Cache body audit attempts | 1 (prefix-matching helper), then 0; final immutable audit 0, 70 bodies | final-cache-body-review*.log; .json |
| Caller inventory attempts | 1 (unclassified enrichment helper), then 0, 192 sites | final-caller-audit*.log; .json |
| AtomicCAS before renewal, after renewal, sensitivity | 1 stale hash, 0, 0 controller with mutant 1/1 and restored 0 | final-atomicity-pre-renewal.log; final-atomicity.log; final-atomicity-sensitivity.log |
| Cache properties and hygiene before renewal, twice including final immutable capture | 1 / 1 stale hashes after behavior; then 1 / 1 same expected gate | final-cache-pre-renewal*.log; final-cache-hygiene-pre-renewal*.log |
| Cache immutable uncached baseline build and full post-renewal gate | 0 / 0 | final-cache-baseline.log; final-cache-full.log |
| Normal cached binary builder | 0 per captured source hash | final-cache-binaries*.log |
| Compiled recipes op-log, recurrence, server-api/reads, Profiles, filters, Snapshots, SSE, CLI, Attachments/groups, DAG/public | all 0 | strict-final-skills/summary.json; strict-final-skills-2/summary.json |
| Compiled auth first/fixed fixture | 1 (numeric Instant fixture), 0 | strict-final-skills/auth/commands.log; final-auth-recipe-2.log |
| Compiled import and migration/identity drives | 0 | final-import-recipe.log; strict-final-skills-3/import/commands.log |
| Compiled Diagnostics, all permitted checks with only Swift PNG renderer omitted | 0 | final-diagnostics-recipe.log; strict-final-diagnostics/ |
| Discovery original recipe then corrected full recipe | 1 (count-based enrichment), 0 | final-recipes-2.log; final-discovery-corrected.log |
| Unchanged enrichment control on clock-fix base, first/corrected invocation | 1 (relative binary argument), 0 | final-enrichment-clock-base*.log |
| Named expiry base/head/mutant, first and same-Token strengthening | 0/0/1; 0/0/1 intended attribution failure | final-enrichment-named-*; final-enrichment-moment-parity.json |
| Standalone strict TypeScript for corrected Discovery controls | 1 (inference/index access), 0 | final-enrichment-types*.log |
| Biome targeting ignored .agents control files | 1, no files processed; not a product lint failure | final-discovery-format.log |
| Exact order-27 root check after disk guard, first/final | 1 (old write-after-hook expectation), 0 | final-root-check.log; final-root-check-2.log |
| Generated OpenAPI/contract check and generated-source diff | 0 / 0 | final-contract.log; final-generated-diff.log |
| Closed owned Bun runtime temporary cleanup | 0; 62 files, 5,496,973,568 bytes removed, no open skips or process stops | final-runtime-cleanup.json |

The first root failure was a stale test expectation that a Profile catalog should survive a write in its authorization hook. The strict serial fence correctly refuses and rolls back that write. The corrected literal test requires StoreError/Invalid read authority, no late Profile, and a successful fresh read after an independent insertion; it exits 0. The final root command passes 423 domain, 69 CLI, 32 server and 168 Electron tests, with one pre-existing Electron skip. Root invocation is exactly /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check, after sh scripts/disk-guard.sh, using frozen TODO_CLI_BINARY, TODO_SERVER_BINARY, TODO_SEED_BINARY and TODO_BINARY_PROVENANCE overrides. No Swift/native recipe is hidden in that check.

### Follow-up proposal, later unit only

Propose a dedicated deferred lease for owner-only reads; it is not built here.
It must guard Snapshot list/Show and pending reminders without using the attachment-cleanup exit of OperationStore.transaction.
Review Snapshot preparation, recovery, retention and filesystem races before choosing that boundary.
Measure no-checkpoint Diagnostics separately before optimizing counts or Snapshot totals.
One untimed instrumented sample attributed only 0.102 ms to sixteen table counts, versus 12.625 ms to last-Reminder op_log JSON scanning, 9.668 ms to the recent-rate scan and 4.655 ms to attachment json_each.
That 42.886 ms traced sample is attribution, not a paired latency claim; it does not support table counts as the main limiter on this fixture.
Investigate narrower header/grouped metadata queries and indexes in a separate measured unit.

### Limits and cleanup

The correctness seat has not yet accepted this head or either mapping renewal. Finite models and generated controls do not prove arbitrary TypeScript refinement, unbounded safety or every wall-clock scheduling instant. Frame comparison is fixture-bounded. UI render latency, native Session persistence, Keychain, signing and installed performance are not measured. The long Diagnostics hold is an accepted cost, not a deferred-read implementation. The standalone stale-capability errors intentionally fail closed with the generic storage error. No claim of a new remote exploit is made.

All data, credentials, copied images and Snapshots are scratch-only. No Python substitutes for a missing Todo CLI capability; Python only runs the existing terminal PTY capture recipe. No Swift, native app, Keychain, signing, install, push, PR, child agent or experiment work was performed. Comment review was local because the worker's explicit no-children rule overrides the no-comments skill's child instruction. All owned controller servers/writers are awaited and closed; cleanup receipts survive. The output and binary removal manifests stay local/ignored, with hashes rather than binary copies. The soft disk floor remains protected.

<details>
<summary>Final read-port caller audit, 192 production sites</summary>

| Production site | Read or boundary | Profile and id source |
| --- | --- | --- |
| `apps/server/src/server.ts:474` | `diagnostics.read({ credential: yield* BearerCredential }),` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:544` | `attachments.imageRead(` | Trusted image copy/storage helper uses the decoded current/source Task and Attachment metadata. It is also used by write paths; no request query selector enters it directly. |
| `apps/server/src/server.ts:821` | `: reads.profiles(credential),` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:827` | `reads.projects({` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:836` | `reads.tags({` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:858` | `reads.history({` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:868` | `store.auth.withRead(` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:875` | `(read) => store.auth.checkRead(read, "read"),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `apps/server/src/server.ts:941` | `return yield* translate(store.auth.listTokens({ credential }));` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:1004` | `store.auth.withOwnerRead(` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:1008` | `(read) => store.snapshots.listRead(read),` | Owner authority in the synchronous owner callback. Snapshot Show uses private fields.snapshot; List has no id. |
| `apps/server/src/server.ts:1018` | `store.auth.withOwnerRead(` | HTTP supplies decoded fields before authorization. Query continuations use checked callbacks and bound plain results. Snapshot write helpers retain requireOwner under write rules. |
| `apps/server/src/server.ts:1022` | `(read) => store.snapshots.showRead(read),` | Owner authority in the synchronous owner callback. Snapshot Show uses private fields.snapshot; List has no id. |
| `apps/server/src/sse.ts:66` | `store.auth.withRead(` | Credential and subscription fields were bound at connection entry. Every poll checks those plain selectors afresh; only its synchronous callback holds an authority. Terminal permission also binds connection, generation, cursor and deletion cap. |
| `apps/server/src/sse.ts:86` | `const selection = yield* store.auth.checkRead(read, "read");` | Credential and subscription fields were bound at connection entry. Every poll checks those plain selectors afresh; only its synchronous callback holds an authority. Terminal permission also binds connection, generation, cursor and deletion cap. |
| `apps/server/src/sse.ts:87` | `const initial = yield* store.snapshots.generation();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `apps/server/src/sse.ts:137` | `store.auth.withStreamRead(` | Credential and subscription fields were bound at connection entry. Every poll checks those plain selectors afresh; only its synchronous callback holds an authority. Terminal permission also binds connection, generation, cursor and deletion cap. |
| `apps/server/src/sse.ts:152` | `: yield* store.snapshots.generation();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `apps/server/src/sse.ts:177` | `? yield* store.changesRead(` | Credential and subscription fields were bound at connection entry. Every poll checks those plain selectors afresh; only its synchronous callback holds an authority. Terminal permission also binds connection, generation, cursor and deletion cap. |
| `apps/server/src/sse.ts:188` | `return store.terminalChangesRead(` | Credential and subscription fields were bound at connection entry. Every poll checks those plain selectors afresh; only its synchronous callback holds an authority. Terminal permission also binds connection, generation, cursor and deletion cap. |
| `packages/domain/src/store/store.ts:213` | `const purged = this.snapshots.purgedIdsSync();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/store.ts:225` | `tasks: () => readTasks(this.db),` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:248` | `this.auth.withOwnerRead(input, Schema.Struct({}), {}, use),` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:273` | `tasks: readTasks(this.db).filter(` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:276` | `series: readSeries(this.db).filter(` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:419` | `const tasks = readTasks(this.db).filter(` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:477` | `const before = readTasks(this.db).find((task) => task.id === target.id);` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:555` | `readonly tasks = () => attempt(() => readTasks(this.db));` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:556` | `readonly series = () => attempt(() => readSeries(this.db));` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:573` | `checkedRead(read, "read", this.db).pipe(` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/store.ts:574` | `Effect.flatMap((value) => this.graph(value.profile)),` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:578` | `attempt(() => terminalHistory(this.db, read));` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:621` | `checkedRead(read, "read", this.db).pipe(` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/store.ts:631` | `const state = this.snapshots.generationSync();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/store.ts:749` | `for (const id of this.snapshots.purgedIdsSync())` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/store.ts:857` | `const purged = new Set(this.snapshots.purgedIdsSync());` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/store.ts:898` | `series: readSeries(this.db).find(` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:979` | `const existing = readSeries(this.db).find(` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:994` | `readSeries(this.db).find((value) => value.id === series.id) ?? null;` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:1362` | `const tasks = readTasks(this.db);` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:1374` | `const series = seriesForTask(before, readSeries(this.db));` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/store.ts:1539` | `return readTasks(this.db);` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/snapshots.ts:274` | `checkedRead(read, "owner", this.db).pipe(Effect.flatMap(() => this.list()));` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/snapshots.ts:276` | `checkedRead(read, "owner", this.db).pipe(` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/snapshots.ts:302` | `readonly generation = () => attempt(() => this.generationSync());` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/snapshots.ts:402` | `const ids = this.purgedIdsSync();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/snapshots.ts:498` | `generation: this.generationSync().generation,` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `apps/server/src/task-search-cache-hygiene.ts:6` | `let cursor = yield* store.searchCacheEvents();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `apps/server/src/task-search-cache-hygiene.ts:8` | `const current = yield* store.searchCacheEvents(cursor);` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `apps/cli/src/main.ts:708` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:796` | `const data = yield* readTasks(store, request, filters).pipe(` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:923` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1104` | `const data = yield* readTasks(` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1320` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1377` | `const entries = yield* new ClientReads(store).history({` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1445` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1510` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1563` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1701` | `const data = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1750` | `const latest = yield* readTasks(store, request);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1774` | `const data = yield* readTasks(` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1803` | `const data = yield* readTasks(` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:1839` | `const data = yield* readTasks(` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:2116` | `: new ClientReads(store).profiles(credential);` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `apps/cli/src/main.ts:2207` | `.listRead(read)` | Owner authority in the synchronous owner callback. Snapshot Show uses private fields.snapshot; List has no id. |
| `apps/cli/src/main.ts:2218` | `.showRead(read)` | Owner authority in the synchronous owner callback. Snapshot Show uses private fields.snapshot; List has no id. |
| `apps/cli/src/main.ts:2260` | `const result = yield* store.auth.withOwnerRead(` | CLI supplies typed fields at the boundary. Name resolution returns a plain selected id; each shared read checks afresh. Snapshot list/Show materialize within withOwnerRead; Snapshot write helpers retain requireOwner. |
| `packages/domain/src/task-lookup-error.ts:35` | `.resolveProfileRead(` | Profile name/id and requested Task id/transport are captured by resolveProfileRead. Error formatting consumes only its plain bound selection after the scope ends. |
| `packages/domain/src/dependency-commands.ts:134` | `const graph = yield* this.store.graph(identity.profile);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/dependency-commands.ts:211` | `const updated = yield* this.store.graph(identity.profile);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/store/diagnostics.ts:126` | `this.restoreGeneration = snapshots.generationSync().generation;` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/diagnostics.ts:204` | `yield* checkedRead(read, "owner", this.db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/diagnostics.ts:205` | `const generation = yield* this.snapshots.generation();` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/diagnostics.ts:206` | `this.generation(generation.generation);` | Internal restore/erasure cursor or storage generation. No caller Profile or Task id; read paths execute it inside their checked scope. |
| `packages/domain/src/store/diagnostics.ts:208` | `const pending = yield* this.scheduled.pendingReminders();` | Checked owner callback and owner-port validation. Snapshot ids, generation and pending reminder ids come from storage inside this same IMMEDIATE lease. |
| `packages/domain/src/auth/auth.ts:267` | `try: () => readAuthority(read, kind, origin),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:637` | `.profiles()` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:922` | `this.resolveProfileRead(input, EmptyRead, {}).pipe(` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:954` | `selection: readAuthority(` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:996` | `!this.ports.profiles().some((p) => p.id === token.profile)` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1159` | `(read) => this.projection.catalog(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1165` | `(read) => this.projection.metadata(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1239` | `(read) => this.projection.catalog(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1247` | `(read) => this.projection.metadata(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1258` | `readAuthority(read, "read", this.db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1315` | `this.withRead(` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1319` | `(read) => operation(read, this.projection.metadata(read)),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1340` | `this.withRead(` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1347` | `this.ports.read(readAuthority(read, "read", this.db).profile),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1363` | `selection: readAuthority(read, "read", this.db),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1364` | `data: this.projection.metadata(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1381` | `selection: readAuthority(read, "read", this.db),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1382` | `data: this.ports.read(readAuthority(read, "read", this.db).profile),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1399` | `selection: readAuthority(read, "read", this.db),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1400` | `data: this.projection.catalog(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1420` | `readAuthority(read, "read", this.db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1430` | `) => checkedRead(read, kind, this.db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/auth/auth.ts:1602` | `(read) => taskHistory(this.db, read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1611` | `(read) => this.projection.projects(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1619` | `(read) => this.projection.tags(read),` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1653` | `return this.projection.profiles(` | Authentication owns credential/scope/classification checks. Projection calls receive a genuine live authority; visible Profiles derive once from the checked set. Callback results are plain data/selectors. |
| `packages/domain/src/auth/auth.ts:1736` | `(read) => this.ports.read(readAuthority(read, "read", this.db).profile),` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/purge.ts:15` | `...metadata(entry.event),` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/attachment-commands.ts:57` | `const before = (yield* this.store.tasks()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/attachment-commands.ts:472` | `(read, task) => this.imageWithin(read, task),` | Managed image callback validates the live authority and selected Task/Profile, then reads private Task/Attachment ids before file access. |
| `packages/domain/src/attachment-commands.ts:482` | `const selection = yield* this.store.auth.checkRead(read, "read");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/attachment-commands.ts:498` | `readManagedImage(` | Managed image callback validates the live authority and selected Task/Profile, then reads private Task/Attachment ids before file access. |
| `packages/domain/src/attachment-commands.ts:508` | `this.imageRead(request, id).pipe(Effect.map((result) => result.image));` | Managed image callback validates the live authority and selected Task/Profile, then reads private Task/Attachment ids before file access. |
| `packages/domain/src/store/history-reads.ts:67` | `const value = readAuthority(read, "read", db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/history-reads.ts:105` | `const value = consumeTerminalRead(read, db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/dependency-validation.ts:78` | `? readTasks(db).filter((task) => task.profile_id === profile)` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/discovery.ts:40` | `this.store.auth.readSnapshot((auth) =>` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:42` | `const profiles = yield* auth.profileSummaries({ credential });` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:46` | `auth.metadata({ credential, profile: profile.id }).pipe(` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:55` | `yield* auth.profiles({ credential });` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:61` | `this.store.auth.readSnapshot((auth) =>` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:63` | `const { read } = yield* auth.profilesRead(` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:68` | `const authority = yield* this.store.auth.checkRead(read, "profiles");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/discovery.ts:74` | `auth.catalog({ credential, profile: profile.id }).pipe(` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/discovery.ts:94` | `yield* auth.profiles({ credential });` | One deferred outer snapshot. Profile ids come from checked summaries/set; prefix from parsed private fields. Nested callbacks materialize under the outer lease, then return plain data. |
| `packages/domain/src/store/projection.ts:344` | `tasks: readTasks(db),` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/projection.ts:345` | `series: readSeries(db),` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/scheduled-work.ts:55` | `.tasks()` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/scheduled-work.ts:72` | `for (const task of this.ports.tasks()) {` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/scheduled-work.ts:100` | `for (const before of this.ports.tasks()) {` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/scheduled-work.ts:129` | `for (const task of this.ports.tasks()) {` | Trusted bootstrap, replay, scheduler or mutation storage. Profile and ids come from MutationIdentity, decoded event/current Task or internal state. Request query wrappers validate before reaching these raw helpers. |
| `packages/domain/src/store/client-projection.ts:37` | `this.metadataAt(readAuthority(read, "read", this.db).profile);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/client-projection.ts:39` | `this.tasksForMutation(readAuthority(read, "read", this.db).profile);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/client-projection.ts:41` | `const value = readAuthority(read, "read", this.db);` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/client-projection.ts:49` | `const profiles = readAuthority(read, "profiles", this.db).profiles;` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/client-projection.ts:74` | `const profile = readAuthority(read, "read", this.db).profile;` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/store/client-projection.ts:85` | `const profile = readAuthority(read, "read", this.db).profile;` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/import-tasks.ts:46` | `const { authority, graph } = yield* store.auth.withRead(` | Initial input/Profile/items are parsed and bound. Preview materializes without writes. Each graph reread after a write opens a fresh checked scope from plain bound selectors, never a retained authority. |
| `packages/domain/src/import-tasks.ts:52` | `const authority = yield* store.auth.checkRead(read, "read");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/import-tasks.ts:53` | `const graph = yield* store.graphRead(read);` | Genuine authority from the enclosing checked callback. Profile and terminal bounds come from private fields; ordinary cursor is the bound stream state. |
| `packages/domain/src/import-tasks.ts:153` | `const tasks = (yield* store.auth.read(request)).tasks;` | Initial input/Profile/items are parsed and bound. Preview materializes without writes. Each graph reread after a write opens a fresh checked scope from plain bound selectors, never a retained authority. |
| `packages/domain/src/import-tasks.ts:227` | `const data = yield* store.auth.read(request);` | Initial input/Profile/items are parsed and bound. Preview materializes without writes. Each graph reread after a write opens a fresh checked scope from plain bound selectors, never a retained authority. |
| `packages/domain/src/import-tasks.ts:342` | `const currentBlockers = (yield* store.auth.withRead(` | Initial input/Profile/items are parsed and bound. Preview materializes without writes. Each graph reread after a write opens a fresh checked scope from plain bound selectors, never a retained authority. |
| `packages/domain/src/import-tasks.ts:346` | `(read) => store.graphRead(read),` | Genuine authority from the enclosing checked callback. Profile and terminal bounds come from private fields; ordinary cursor is the bound stream state. |
| `packages/domain/src/graph-queries.ts:136` | `store.auth.withRead(` | Profile, Task id and generated_at are captured by withRead. The callback materializes graph and result from private selectors. |
| `packages/domain/src/graph-queries.ts:142` | `const selection = yield* store.auth.checkRead(read, "read");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/graph-queries.ts:143` | `const graph = yield* store.graphRead(read);` | Genuine authority from the enclosing checked callback. Profile and terminal bounds come from private fields; ordinary cursor is the bound stream state. |
| `packages/domain/src/client-reads.ts:79` | `this.store.auth.profileSummaries({ credential });` | Shared input boundary binds Profile and parsed fields before checking. Views use materialized catalogs; History binds Task id; counts use the checked Profile set. |
| `packages/domain/src/client-reads.ts:82` | `this.store.auth.projects(request);` | Shared input boundary binds Profile and parsed fields before checking. Views use materialized catalogs; History binds Task id; counts use the checked Profile set. |
| `packages/domain/src/client-reads.ts:84` | `readonly tags = (request: AccessRequest) => this.store.auth.tags(request);` | Shared input boundary binds Profile and parsed fields before checking. Views use materialized catalogs; History binds Task id; counts use the checked Profile set. |
| `packages/domain/src/client-reads.ts:92` | `const { selection: authority, data } = yield* this.store.auth.readCatalog(` | Shared input boundary binds Profile and parsed fields before checking. Views use materialized catalogs; History binds Task id; counts use the checked Profile set. |
| `packages/domain/src/client-reads.ts:152` | `this.store.auth.taskHistory(request);` | Shared input boundary binds Profile and parsed fields before checking. Views use materialized catalogs; History binds Task id; counts use the checked Profile set. |
| `packages/domain/src/commands.ts:155` | `const search = store.searchWords.read(selected.profile);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:160` | `} = yield* store.auth.withState(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:166` | `const selection = yield* store.auth.checkRead(read, "read");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/commands.ts:167` | `const graph = yield* store.graphRead(read);` | Genuine authority from the enclosing checked callback. Profile and terminal bounds come from private fields; ordinary cursor is the bound stream state. |
| `packages/domain/src/commands.ts:243` | `? (yield* store.profiles()).some(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:378` | `const search = this.store.searchWords.read(selected.profile);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:384` | `} = yield* this.store.auth.withMetadata(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:390` | `const selection = yield* this.store.auth.checkRead(read, "read");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/commands.ts:391` | `const graph = yield* this.store.graphRead(read);` | Genuine authority from the enclosing checked callback. Profile and terminal bounds come from private fields; ordinary cursor is the bound stream state. |
| `packages/domain/src/commands.ts:447` | `this.store.auth.withMetadata(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:453` | `const authority = yield* this.store.auth.checkRead(read, "read");` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/commands.ts:454` | `const graph = yield* this.store.graphRead(read);` | Genuine authority from the enclosing checked callback. Profile and terminal bounds come from private fields; ordinary cursor is the bound stream state. |
| `packages/domain/src/commands.ts:486` | `.checkRead(read, "read")` | Private brand, exact prototype, kind, database and live-lease validation before consuming Profile, scope, checked Profile set or parsed ids. No raw request selector is consumed here. |
| `packages/domain/src/commands.ts:532` | `...(yield* this.store.projects()),` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:537` | `const tags = yield* this.store.tags();` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:556` | `projects: yield* this.store.projects(),` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:557` | `tags: yield* this.store.tags(),` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:706` | `const graph = yield* this.store.graph(identity.profile);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:775` | `const tasks = yield* this.store.tasks();` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:798` | `const edges = (yield* this.store.graph(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:849` | `: seriesForTask(before, yield* this.store.series());` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:859` | `seriesForTask(task, [seriesBefore]) !== null &&` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1067` | `const before = (yield* this.store.tasks()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1097` | `(yield* this.store.tasks()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1222` | `const data = yield* readTasks(store, request);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1270` | `const data = yield* readTasks(store, request);` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1274` | `yield* store.auth.readState(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1468` | `const before = (yield* store.tasks()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1533` | `const { selection: authority, data } = yield* store.auth.readState(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1539` | `const { data: target, selection: targetRead } = yield* store.auth.readState(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1576` | `const definition = seriesForTask(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1578` | `yield* store.series(),` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1609` | `? (yield* store.history(entry.seq - 2)).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1631` | `const destination = (yield* store.profiles()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1693` | `!(yield* store.profiles()).some(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1704` | `const source = (yield* store.profiles()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1779` | `const definition = seriesForTask(context.before, yield* store.series());` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1806` | `const definition = seriesForTask(context.before, yield* store.series());` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1826` | `const { selection: authority, data } = yield* store.auth.readState(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1871` | `const pair = (yield* store.history()).filter(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/commands.ts:1972` | `(yield* store.tasks()).find(` | Shared query callbacks use private checked selectors and materialized rows. Existing writer graph/Task/Series/History reads use the checked MutationIdentity and decoded current/event rows. |
| `packages/domain/src/attachment-store.ts:155` | `export function readManagedImage(` | Trusted image copy/storage helper uses the decoded current/source Task and Attachment metadata. It is also used by write paths; no request query selector enters it directly. |
| `packages/domain/src/attachment-store.ts:209` | `const image = readManagedImage(root, attachment, task.id);` | Trusted image copy/storage helper uses the decoded current/source Task and Attachment metadata. It is also used by write paths; no request query selector enters it directly. |
| `packages/domain/src/attachment-store.ts:225` | `const image = readManagedImage(root, attachment, source.id);` | Trusted image copy/storage helper uses the decoded current/source Task and Attachment metadata. It is also used by write paths; no request query selector enters it directly. |
| `packages/domain/src/presentation.ts:39` | `const definition = seriesForTask(task, series);` | Pure presentation over materialized Tasks and Series, with no database authorization or caller selector. |

</details>

## Historical checkpoints and superseded stops

The sections below record the earlier reviews, failures and measurements at their original heads. Their pending/held status and nominal-authority descriptions are historical, superseded by this delivery section. In particular, the Diagnostics 5/50 ms stop rule was explicitly withdrawn; it is not an active gate.

## Diagnostics IMMEDIATE lock-hold limit exceeded

The coordinator approved the one-argument Diagnostics constructor wiring change at 70b60e221f3b59fa5fb0a7aa8813b5dd624a64ae. It is implemented exactly, with only the formatter's line break. Diagnostics now validates a genuine owner authority at its port before its first statement and materializes generation, real Snapshot manifests, pending reminders and its metrics inside the same lease. The transaction mode remains IMMEDIATE. `requireOwner` remains because the HTTP and CLI Snapshot write helpers still use it; Diagnostics has no unscoped owner callback.

**Required stop.** The paired lock-hold measurements exceed the coordinator's 5 ms median / 50 ms maximum limits. No deferred transaction or cheaper count has been introduced. This is not an installable delivery and final qualification remains pending.

### Paired measurement

Before is the immutable 70b60e22 source; after is that source plus the approved Diagnostics conversion. Each fixture has ten warmups per arm followed by 200 paired reads per arm. The first arm alternates on every pair. All 800 timed reads succeed synchronously through Effect.runSync. There is no deliberate wait in these measurements. The timer starts inside the physical transaction callback after SQLite admission and ends after IMMEDIATE returns from COMMIT. Nested savepoints are not double-counted. The following numbers are the longest continuous writer-lock hold per request, in milliseconds.

| Fixture | Source | Median | 99th percentile | Maximum |
| --- | --- | ---: | ---: | ---: |
| Owner-shaped | 70b60e22 | 3.59 | 4.26 | 4.54 |
| Owner-shaped | Checked owner scope | 25.34 | 28.98 | 29.70 |
| Retained Snapshots | 70b60e22 | 3.67 | 8.06 | 8.48 |
| Retained Snapshots | Checked owner scope | 31.39 | 58.51 | 66.31 |

The baseline uses three physical IMMEDIATE transactions for credential checking, Snapshot listing and pending reminders. Its cumulative median hold per read is 3.68 ms on the owner fixture and 4.16 ms on the Snapshot fixture. The new path has one physical transaction, so its cumulative hold equals the continuous hold above. Total read latency is essentially unchanged: owner medians 25.61/25.40 ms before/after; retained-Snapshot medians 31.49/31.44 ms. This is a change in how long materialization holds the writer lock, not a latency improvement.

The owner fixture is n178-p8-large1-h2048: 1,427 Tasks, 2,695,765 bytes of Task payload and 3,480 operations, with no internal checkpoints. The second fixture copies it, then makes sixteen accepted Task edits and real takeSnapshot calls, retaining sixteen checkpoint states totaling 43,841,718 bytes. It also makes eight real filesystem Snapshots totaling 504,987,648 bytes; its current database is 63,131,648 bytes. These are synthetic retained owner-sized states, not a claim about the owner's real database. Warmups and the fixed-state body controls are excluded from timing summaries.

Both fixtures have 200 equal normalized body-hash pairs. Timing comparisons normalize only runtime Clock/RSS observations for hashing; actual timed RSS collection remains native. A separate full-body control fixes Clock and RSS inputs and requires exact body equality. Host one-minute load was 3.20–3.39 on ten logical CPUs while other workers were running. Both arms used identical runtime, data, SQLite settings and driver instrumentation. No native app, Swift or real HOME/database was used.

### Proposal requiring review

Use a dedicated deferred owner read scope for Diagnostics, with one credential check, one SQL snapshot and the same failed-authentication write outside the read transaction as Discovery. This must have guarded Snapshot-list and pending-reminder read paths that bypass OperationStore.transaction and its attachment-cleanup exit path. Snapshot preparation/recovery and concurrent filesystem changes also need explicit review: simply replacing IMMEDIATE with deferred around the existing callbacks is unsafe. The ordinary Snapshot and mutation transaction modes would stay unchanged. This is a proposal, not an implemented mode change.

Optimizing only the Snapshot byte total cannot meet the limit: the owner-shaped fixture already holds the lock for 25.34 ms with zero internal checkpoints. Grouped metadata queries may reduce materialization cost, but would need a separate measured comparison and cannot be assumed to solve the lock issue. The dedicated read boundary is the recommended next step, subject to the coordinator's ruling on cleanup and filesystem consistency.

### Constructor and source mapping evidence

Each binary constructed the store sequentially on the exact same scratch database for each fixture. Both traces contain the same ten executed statements/bindings and zero credential lookups; the database SHA-256 remains unchanged. The trace hash is 92d57c245d990bf32b7a484ab531c183b88722f12602198938ea3d86af53b772 on both fixtures and both sides. It records statement execution through the Bun database API, including exec statement batches. The exact constructor source comparison independently permits only the approved callback argument change. Construction stores that closure and does not call it.

The following hashes cover the mapped member slices including signatures and boundary whitespace. Nine covered members are byte-identical. The constructor differs only by the approved closure argument. Four cache capture/preparation statements also remain byte-identical. No coverage pin has been renewed, because the unit is not final.

| Covered function | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| OperationStore.constructor | 2a69e09f15ab2df5d6fabe899467829a93bc940e19917447be36729bded20c18 | 0a2b509138fe541e9dca4a224c19858b91e80dbc63e650a1cf034802647f4c0c |
| OperationStore.transaction | 2d180d81b4cd58d917cfd5516a74809070c856e3f899d2022cc6a37f2c2a9ac4 | identical |
| OperationStore.record | 17e0f7d9e8f2cd448f28bcc6652a10ccb149dd18b3333e1b989346cf21825ab7 | identical |
| OperationStore.recordRejection | f4451159996a47567fcd2cb3f353901b18bfcae06a7d3d221b862a124365e49f | identical |
| OperationStore.validate | 44bd31ec46d7609c7cfefe0b6542a7da9c7ebc52a03c2030085920b32cb57ffe | identical |
| OperationStore.appendSync | 0d03e81034c9e6b53dd00ac0a1e2a93a784080a5566d5bc8b9cef2a13552e305 | identical |
| OperationStore.append | 81581c42bd5c3a67d4fead74aa52de20551d78a7083f9adbaee3a381d6d9e3d3 | identical |
| OperationStore.historySync | 09fb760f98f2842fd771ad043c1360e36fc9c03a703fead830f9bd6ff4fb0f94 | identical |
| OperationStore.takeSnapshot | 20245f26c5c805cdf2d04383de3238d854776e81169cbe7a3d6b97d2cdc97678 | identical |
| OperationStore.rebuild | 663a9e17d796aecb01321cb1c151fad5045c78c91d3ca5eb893add89bc65ba61 | identical |

| Cache statement | SHA-256, identical before/after |
| --- | --- |
| `const search = store.searchWords.read(selected.profile);` | 8bcd38d482d0dd09a0dfa602c0ebdabc93f504bee4573e9301b065d6cb46801c |
| `const search = this.store.searchWords.read(selected.profile);` | 95f71f3ffb7baf48954bf14811b38085f5b571c9c4ed5617c405f34074579c79 |
| `prepare: (text) => store.searchWords.words(search, text),` | c249d4474b02901f815c404a5aaad117cf0477507b63660434564008bca1f6b8 |
| `prepare: (text) => this.store.searchWords.words(search, text),` | 6ba1861742d72aea0c46abb6303ac1a5dc88d9d279956c0c24c754c2b9b596b9 |

### Commands and real exits

| Command/control | Exit | Evidence under docs/evidence/ui-speed/server-reads/ |
| --- | ---: | --- |
| `pnpm --filter @todo/domain test diagnostics-scope.test.ts` before implementation | 1, intended literal lease assertion | strict-diagnostics-red.log |
| `pnpm --filter @todo/domain test diagnostics-scope.test.ts diagnostics.test.ts` after implementation | 0, six tests including a real Snapshot list | strict-diagnostics-green.log |
| Fixture builder, sixteen internal/eight filesystem Snapshots | 0 | strict-diagnostics-fixture.log; strict-diagnostics-fixture-sizes.json |
| Compiled before and after domain driver builds | 0 / 0 | strict-diagnostics-build-before.log; strict-diagnostics-build-after.log |
| Paired 200-read-per-arm measurements, both fixtures | 0, functional/body assertions pass | strict-diagnostics-holds.log; strict-diagnostics-holds/result.json |
| Literal 5 ms median / 50 ms maximum threshold assertion | 1, required stop | strict-diagnostics-threshold.log |
| Constructor traces on the exact same database, file hash unchanged | 0 | strict-diagnostics-constructor-same-db.log; .json |
| Initial function-hash helper using the unavailable TypeScript compiler API | 1 | strict-diagnostics-wiring-review.log |
| Corrected exact member-boundary hash/argument comparison | 0 | strict-diagnostics-wiring-review-2.log; strict-diagnostics-wiring-review.json |
| `pnpm --filter @todo/domain typecheck` | 0 | strict-diagnostics-types.log |

Reusable fixture, driver, builder, paired controller and mapping inputs are retained under .agents/skills/verify-diagnostics/controls/. The first-run source hashes and generated reusable versions are recorded in strict-diagnostics-control-sources.json. Bulk samples, complete traces, database hashes and private fixture manifests remain ignored locally.

The writer-attempt control, all Diagnostics refusal/History and port-sensitivity controls, and the preceding checkpoint's remaining final gates are not yet proven. Work stopped at the explicit timing threshold. The exact frame table, final per-route holds, eight-read comparison, compiled recipes, proof renewal/checks, generated contract and exact order-27 root check are still pending. No pin, ADR, transaction mode, installation or remote branch changed.

## Earlier strict-scope checkpoint

## Strict scope checkpoint: mapped constructor review required

The owner chose B and lifted the product hold for this restructuring. This is an implementation checkpoint, not a completed or installable delivery. The experiment was parked on exp/sync-patches at ab1b4bd57b594f477075eef5e287c226355adcd6 and belongs to SYNC-EXP now. Its nine-line handoff is in the orchestrator reports directory. This worker stays on perf/server-reads.

The exact clock fix 6b167266fc34c3304e30ed220bb652b4d17c05ab merged first as b8387edd4ddab47296ea1ef3648254138d2b6e06. Git resolved it without conflicts. Authentication.mutate retains both the caller context passed to runSyncExitWith and the private read-authority implementation. No other branch was merged here.

### Required stop before changing a mapped body

The continuing route audit found Diagnostics.read in packages/domain/src/store/diagnostics.ts. It awaits the owner check, then reads generation, Snapshot manifests, pending reminders and metrics after that check's transaction. The constructor supplies that check at packages/domain/src/store/store.ts as `(input) => this.auth.requireOwner(input)`. This is an additional ordinary read family beyond the earlier twelve-path authority audit. It does not take ReadAuthority today, so the new authority guard cannot fix this path by itself.

The appropriate conversion is a checked owner callback: Diagnostics.read materializes its data inside withOwnerRead and validates the owner authority before its SQL or filesystem access. Its constructor port must become a generic callback rather than a function returning CredentialInfo. The concrete constructor callback change would be:

```diff
- (input) => this.auth.requireOwner(input),
+ (input, use) => this.auth.withOwnerRead(input, Schema.Struct({}), {}, use),
```

OperationStore.constructor is explicitly mapped by AtomicCAS. The coordinator instructed: "If the behaviour of any body mapped by AtomicCAS or the Task search cache proof has to change, stop and tell me before changing it." This checkpoint stops before that callback edit. Diagnostics source and that constructor body remain unchanged. No proof mapping has been renewed. The source comparison in docs/evidence/ui-speed/server-reads/strict-source-review.json proves seven reviewed regions and four cache capture/preparation statements still match ade8f941. Matcher, runner, cache accounting, invalidation and model files remain unchanged. Review of this proposed callback change is required before continuing it.

### Implemented, subject to qualification

A private lease surrounds the existing transaction runner and ends after commit or rollback, including interruption and failure. Nested checks share the physical lease and retain failed-scope ancestry, so a failed child cannot leave a usable authority while a successful outer Discovery snapshot continues. Private brand, exact prototype, origin and kind guards remain. Every existing authority-taking query and managed-image selection validates the live lease, expiry and write serial captured by the credential check. Any intervening write invalidates that value. A rechecked scope verifies credentials afresh inside its transaction and rejects a changed restore generation. Ordinary callbacks materialize rows synchronously and return data and bound plain selectors. Search matching and response encoding stay outside.

Converted families include Task list/search and shared CLI materialization, Show and recovery selectors, graph, planning views, History, Snapshot list/Show, managed image bytes, Quick-add selectors, import preview and later graph refresh, transfer metadata, Revert and invalid-Version recovery, Discovery's deferred snapshot, and SSE polls. Transaction modes are unchanged. Profile summaries derive their visible set once; nested checks share one credential-row lookup. The counted domain control covers eleven ordinary reader variants including Discovery. CLI Profile-name resolution remains its own checked operation before the materializing helper; no authority crosses that boundary.

The owner-approved absent-Profile treatment has one classifier in the credential-check snapshot, after the original credential and scope checks. Active Profiles get an authority; tombstones keep ADR-0010 refusal; never-created identifiers produce a distinct plain value with a requested string and no Profile id or authority. These values are neither cached nor retained by a stream. Empty results are built from literals. Quick-add only parses supplied text, including Tag and Project names; it performs no metadata lookup. An absent stream stores plain subscription input and classifies again each poll. A new CLI-created Profile can therefore acquire a real authority on a later poll.

Before changing classification, the immutable e692 server captured all fourteen Profile-scoped read cases under ten credential classes and six identifier cases, 840 replies. They include none, expired/revoked Session, owner Session, unscoped Token, another-Profile Token, revoked Token, invalid credential, scoped reader and expired Token; identifiers include present, never-created, tombstoned, reused new id, reused display name and old id. All 840 matched the interim implementation byte for byte. Literal never-created replies and the status matrix are retained in packages/domain/test/fixtures/read-presence/. Active name reuse resolves to the new id through CLI resolution; the old HTTP id remains 404, including when its spelling is the reused display name. Unauthorized classes in this fixture show no new present/absent distinction. This observation does not decide whether never-created identifiers should keep these replies in a future unit.

SSE now checks and queries in a fresh scope before every poll. Its private stream permission is bound to connection, Profile, generation and cursor; the terminal query is capped at ProfileDeleted and consumes its private terminal authority once. The approved policy removes the terminal operation batch for deleted-Profile Tokens and revoked/expired credentials, retaining it for a connected valid owner Session. The new frame-by-frame control, deterministic compiled CLI adapter and controllable test clock/poll gate are written and typechecked, but have not been run. Exact before/after frame tables are therefore not claimed yet.

### Actual verification attempts so far

All paths below are relative to docs/evidence/ui-speed/server-reads/. Logs retain real failures; none is a final-head gate receipt.

| Command or control | Real exit | Evidence |
| --- | --- | --- |
| Initial retained-authority regression, before lease code | 1, expected returned-row failure | strict-lifetime-red.log |
| First lifetime/authorization run | 1, test inspected Error text rather than tag | strict-initial-green.log |
| First domain suite | 1, two late-expiry mappings corrected before authority construction | strict-domain-1.log |
| Focused Discovery, lifetime and runtime guard tests | 0, nine tests | strict-focused-2.log |
| First broad lifetime matrix | 1, synchronous Effect.try wrapper and invalid prefix fixture corrected | strict-matrix-1.log |
| Broad lifetime matrix after those fixture fixes | 0, twelve tests | strict-matrix-2.log |
| Domain after credential-cache refactor | 1, initial cache miss compared two undefined values; corrected | strict-domain-2.log |
| Domain after cache-miss correction | 0, 406 tests | strict-domain-3.log |
| Runtime and lifetime controls with image ports | 0, fifteen tests | strict-matrix-3.log |
| In-scope expiry control using asynchronous TestClock.setTime | 1; replaced by a mutable synchronous Effect Clock | strict-matrix-4.log |
| In-scope expiry and yielding search cancellation | 0, seventeen tests | strict-matrix-5.log |
| Import freshness control without depends_on refresh | 1, fixture did not enter the later graph path | strict-matrix-6.log |
| Import freshness control with literal depends_on empty list | 0, eighteen tests | strict-matrix-7.log |
| Existing SSE unit suite | 0, four tests | strict-sse-unit-1.log |
| Initial absent base capture | 1, read-only WAL copy opened before WAL initialization | strict-absent-base/capture.log |
| Base captures after scratch WAL initialization | 0, 756 then 840 replies; none added explicitly as null | strict-absent-base/capture-2.log; capture-3.log |
| Interim absent 840-pair comparison | 0 | strict-absent-base/head-a.log |
| Initial 56-checkpoint comparison | 1, Snapshot missing error double-wrapped; StoreError now preserved | strict-control-56-a.log |
| Corrected 56-checkpoint comparison | 0, 23,880 reply pairs, equal auth History/last-use | strict-control-56-b.log |
| Audited rich lifecycle comparison | 0, 1,267 reply pairs, equal auth History/last-use | strict-control-rich-b.log |
| Unchanged seat C1 compiled probe | 0 | strict-c1.log |
| Unchanged retained-authority source comparison and compile | 0, 0 | cmp against seat source; strict-retained-build.log |
| Unchanged retained-authority probe | 1, intended StoreError at first changesRead after authorizeRead commits | strict-retained.log |
| Retained-probe refusal assertion | first 1 from premature asynchronous check; then 0 after process completion, no result rows file | strict-retained.log |
| AtomicCAS/cache source-body review | 0, seven regions and four statements match | strict-source-review.log; .json |
| Checkpoint formatting | 0 | strict-checkpoint-format.log |
| Checkpoint workspace typecheck | 0 |  strict-checkpoint-types.log |

Intermediate domain typecheck attempts 1, 6, 7 and 8 exited 1 for incomplete migration, an unused new helper, selector narrowing or a scripted parenthesis error; attempts 2, 3, 4, 5, 9, 10 and 11 exited 0. The classifier edit script initially failed to parse, exit 1, before changing source. Server typechecks 1 through 3, 6 and 7 exited 1 while reader/SSE migration and typed fixture inputs were incomplete; 4, 5, 8 and 9 exited 0. CLI typecheck exited 0. These are development attempts, not successful qualification of missing gates. Special control builds and probe builds exited 0; the C2 probe binary was built but its new-head run is pending.

### Not proven at this checkpoint

Diagnostics conversion awaits the mapped-body ruling. The full caller inventory needs its final pass. The new frame control, absent statement probe and its blanket-404/present-query mutation controls, legal-boundary HTTP interleaving and both mutation modes, final zero-decode sweep, final C1/C2/C3 probes, the compiled auth extension and affected recipes, AtomicCAS and Task search cache commands, root order-27 check, per-route lock holds and paired owner-shaped eight-read timings remain pending. The 57-fixture comparison must be repeated on the completed immutable product. The exact contract id is unchanged in source, but the final generated-contract gate has not run. No final timing or exact frame-parity claim is made. No ADR was changed, no native/Swift/Keychain/signing operation ran, no real database was used and no install, push or PR was made.

Owned old evidence was compressed losslessly with SHA-256 receipts: 164 JSON files saved 2,630,712,597 bytes. The experiment handoff is nine lines. Current disk remains above the 30.5 GiB build threshold; large final builds have not begun.

## Historical record
## Historical owner-decision proposals

The coordinator withdrew the transaction-lifetime ruling recorded in d542c64380c1cdb3ce1da69e61170ff869eba78b. The owner has not chosen A or B. Product source stays at a7e0ed0e64de3403d51511aa50fc4135a58d6c85. This update designs the two choices without implementing either, accepting S1-C3, changing architecture.md, or changing an ADR. The d542c643 audit is preserved below as the record of the withdrawn ruling.

### A. Design of the production retention inventory test

**Policy and limit.** An operation starts when an HTTP handler or CLI command Effect executes and ends when its awaited work completes. Domain helpers inherit that operation. Import is one operation despite its multiple transactions. Awaited search yields do not create another operation. The connected SSE stream is the sole permitted holder after the originating handler completes. This convention does not make an authority expire, stop a raw retained-capability probe, or guarantee that revocation interrupts an operation already in progress. An external domain consumer can still retain a genuine value. Owner acceptance must state this limit in architecture.md and this report, and the seat must review the resulting head.

**Inventory and coverage.** Propose a TypeScript-compiler test and a reviewed JSON inventory under the auth verification skill, with a thin root test entry so pnpm check runs it. Use the existing compiler dependency, not text matching. Seed the inventory from the 186-site audit, then enumerate actual authority producers, consumers, forwarding calls and storage uses afresh. The 186 includes validation and internal storage sites; it is not a promise that there are 186 retention sinks. Inventory identities use resolved module/export, enclosing function, port and normalized AST shape. Source locations aid diagnostics but do not authorize a use. New, removed or changed sites fail until reviewed. Generating a candidate inventory must never accept it automatically.

Scan all tracked production TypeScript and JavaScript reached from package exports and compiled application entrypoints, including server, CLI, domain and Electron sources. Follow local imports even outside src. Check that the entrypoint inventory agrees with package/build configuration, so moving code into an unscanned file cannot pass. Verification drivers, tests and ignored scratch evidence are excluded from production analysis. An unrecognized local module, extension or dynamic import carrying an authority fails closed in the test.

**Value tracking.** Identify ReadAuthority and AuthorizedRead, AuthorizedProfiles and AuthorizedOwnerRead by resolved compiler symbols. Follow aliases, generic instantiations, nullable unions, intersections, tuples and authority-containing object/container types. Seed values from checked constructors, auth results, parameters of authority-taking ports, and helper results such as readOne's {read, task}. Track value flow through assignments, destructuring, rest/spread, arrays, object literals, optional/computed member access, function arguments and returns. Track individual fields, so readOne's read is restricted without marking its materialized task as an authority. Track free variables of closures, including an Effect with a plain-data success type whose closure retains an authority. A method accepting an authority parameter is not itself a retained authority. Imports renamed through barrels and aliases must resolve to the same symbol. Assertions, satisfies, non-null expressions, or conversion through unknown/any do not erase tracked provenance. Distinguish authority objects and containers holding them from copied primitive selectors and materialized Task data.

The test classifies these forms explicitly:

| Form | Proposed rule |
| --- | --- |
| Module/global variables, exported values, static or instance fields, constructor parameter properties | Reject an authority or closure containing one. This includes this, globalThis, service context and worker state. |
| Property/index assignment; Object.assign; defineProperty/defineProperties; reflective writes | Follow receiver lifetime and descriptor getter/setter captures. Reject shared or escaping receivers and unresolved computed targets. |
| Array push/splice, Map/WeakMap set, Set/WeakSet add, memo/cache/queue insertion | Reject retention outside the operation, even when the key is request-specific. Prove a container stays local before allowing it. |
| Returned objects, tuples, Promises, Effects, functions and generator yields | Follow authority-containing results through every caller. Allow listed same-operation helper forwarding. Reject an HTTP/CLI result, exported instance, async iterable or deferred callable that carries an authority past operation completion. |
| Timers, microtasks, event listeners, subscription callbacks and scheduler registration | Reject captured authority unless an exact flow summary proves the callback is awaited and completed inside this operation. |
| Effect composition and forks | Recognize resolved, reviewed Effect combinators. Permit gen/map/flatMap/catch/ensuring and awaited helper continuations within the same operation. Reject detached fibers and captures in longer-lived scopes. Treat an unrecognized combinator as an unknown sink. |
| Unknown calls, reflection, dynamic evaluation or serialization | Reject a tracked authority argument/capture without a reviewed flow summary. Do not treat JSON serialization, a cast or a generic identity helper as proof that the original reference disappeared. |

Ordinary helper returns of an authority, including Show/graph/image error provenance, are allowed only through exact producer-to-consumer summaries ending inside the same handler or command. Import's original authority can remain local across writes under A. No whole domain or adapter file receives an exemption. A future wrapper cannot bypass the test by renaming its argument or wrapping it in a container.

**Only retention exception.** Allow apps/server/src/sse.ts, specifically changesLayer's stream handler to the returned connection body, Stream.unfold poll and connection finalizer. Record the captured read, authority and authorize references, their Profile/generation/cursor ownership, and the approved AST shape. The inventory schema permits one exact exception, with no file-wide flag or wildcard. Shared caches, module variables, listeners outside that connection, and additional captures still fail, including in this file. Authentication's private constructors are approved producers, not exempt storage sites. Pin the actual stream recheck ordering, the intentional ProfileDeleted branch and the restore/reload branch for review. Protocol tests establish poll behavior and frame order.

**Failure and sensitivity.** Exit 1 with stored-authority, unclassified-authority-flow, inventory-drift or stream-exception-drift diagnostics. Report the producer, alias/call chain, sink, source span and operation id, without credentials. Do not claim complete inference for arbitrary JavaScript. Resolve uncertainty by failing the check and reviewing a narrow summary, never by silently dropping flow. On isolated captured source, mutation controls must introduce module/field/container storage, nested wrappers, closure/listener/timer captures, detached work, opaque calls, a cast-to-unknown escape, an authority in a public result, and a non-SSE long-lived holder. Each must produce its literal expected diagnostic. Positive controls keep local aliases, existing helper forwarding, yielding search and import-local use valid. Move a sink to another local file and rename symbols to test scan coverage. Remove or broaden the SSE exception and recheck path to require inventory/protocol failures. Restore exact source bytes after each control. This test guards reviewed production usage; it is not a runtime lifetime proof. No test or inventory has been implemented under the current hold.

### B. One-page restructuring plan

**Scope.** Preserve the private brand, origin, kind and immutable selectors. Bind query authority to an active physical transaction lease and restore generation. End the lease on commit, rollback, interruption or failure. Every authority-taking port validates it before SQL or image access. Nested SAVEPOINTs and Discovery's pass-through checks share the outer lease. A later recheck validates and queries inside one new scope; its lease dies before returning. Ordinary paths retain one credential lookup. Keep search CPU work and response encoding outside the transaction on materialized rows and plain bound fields.

1. **Establish scopes and a first caller.** Add checked synchronous callbacks, owner callbacks and port enforcement together with list/readTasks conversion. Cover graph, changes, projection, History, Snapshot and image ports. Prove dead-at-exit, wrong origin/kind, rollback, nesting, restore, Purge, expiry and revocation on scratch databases. Rechecked scopes must work. Renew no formal mapping before source review.
2. **Convert ordinary readers.** Convert list/search and shared CLI reads, then Show/graph and missing-Task recovery, views and Quick-add. Then convert Snapshot list/Show and managed image selection/bytes. Return data and bound selectors instead of authorities. Prove literal replies, cancellation during yielding search, image/manifest error parity and one credential lookup per ordinary request. Preserve immediate/deferred transaction modes.
3. **Convert longer commands and Discovery.** Convert import preview and each post-write graph reread, transfer metadata, Revert and invalid-Version recovery. Use explicit fresh scopes after writes. Keep Discovery's single deferred snapshot. Prove import no-write preview, OCC, rollback, late revocation, snapshot consistency and existing cache epoch fences.
4. **Convert SSE under an explicit ADR-0010 ruling.** Give each poll a new checked scope for its cursor query. On restore, emit reload and acquire authority for the new generation. Propose a separate private terminal permission for an already connected, still-valid owner Session: bind it to that subscription, Profile, generation and last delivered cursor, and cap it at the committed ProfileDeleted seq. It authorizes only the ordered final catch-up batch through that event and the existing failure/close sequence. It never grants graph, catalog, image or later reads. The same transaction checks credentials once and chooses an active-read or terminal result. Revoked or expired credentials receive no terminal permission; scoped Tokens fail after deletion revokes them. Differences from the base terminal exception for invalid credentials need approved frame expectations, not a parity claim. This is a proposed Profile-presence exception, with no credential-validity exception. The owner/coordinator must approve it before code or ADR edits.
5. **Qualify the product and estimate.** Check every port after each lifetime transition, successful rechecked scopes, stale authority across unrelated operations, and two interleaved Profiles. Compare normal stream frames byte-for-byte with the base for ordering, gaps, revocation, deletion, restore and reconnect; document only the approved terminal-policy differences. Run all 57 fixtures, both mutation modes, interleaving, zero-decode sweep, AtomicCAS, Task search cache, affected compiled recipes, exact order-27 root check and paired owner-shaped eight-read cost. Keep contract 78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289. Estimate 16–20 production TypeScript files, roughly 600–1,000 changed product lines plus 500–900 verification lines, and 4–6 focused worker-days including gates after the terminal ruling. Independent seat review is additional. Filesystem scope duration and terminal frame differences are the main uncertainties. No Swift, native app, signing, real database or install is part of this plan.

Both designs are proposals awaiting the owner's decision. This update changes only this report; no retention test, architecture statement, lease mechanism or terminal permission is delivered.

## Historical audit under the withdrawn ruling

## S1-C3 lifetime audit, implementation held

Audited product: `a7e0ed0e64de3403d51511aa50fc4135a58d6c85`. S1-C3 remains open. No production source, authority semantics, transaction mode, API contract, proof mapping or test assertion was changed. This delivery records the required finding before implementing a lifetime guard. S1-C1 and S1-C2 remain the previous closed work; the sections below are their historical delivery record.

The coordinator required: "If any ordinary request path would now fail closed, that is a finding to report to me before you change its behaviour." The compiled control proves that condition. Twelve successful ordinary call variants create their authority inside a SQLite transaction, then inspect it with no transaction active. Adding only the required lifetime check would make these requests fail with the existing generic storage error. This affects valid list/search, Show, graph, views, shared CLI reads, managed images, import preview, owner Snapshot list/Show and Quick-add. Implementing that behavioral change before reporting would violate the requested hold point.

### Failing-first reproduction

The seat's retained-authority.ts was copied byte-for-byte unchanged, cmp exit 0, into this worktree's private scratch directory. Its relative imports resolve this product. Its fixture manifest already refers to this worktree's scratch-only mini fixture. Compile exits 0; run exits 1 at the literal forbidden-Task assertion. After the real Token revocation, the owner creates aa-after-revocation. Retained graphRead returns it, changesRead and Task History return its TaskCreated at seq 12, and a fresh public list correctly fails as revoked. All selectors are Work/read-only. This independently reproduces the retained-authority leak and is not a claim of a remote HTTP exploit.

The unchanged probe also calls changesRead immediately after authorizeRead to obtain its initial cursor. That is already outside the creating transaction. Under the new ruling it should refuse there, before reaching revocation, so later lifetime controls must arrange any legitimate initial query in a live checked scope. The future unchanged probe's expected refusal is not a successful run today.

### Compiled observation of ordinary requests

The observer compiles the real domain code with two observational hooks. The authority constructor and inspector record only case name, kind, phase and SQLite Database.inTransaction. The existing search scheduler checkpoint records when its real setImmediate callback runs. No guard, credential lookup, SQL, returned row, transaction or search algorithm is replaced. Tests use literal Work Task ids ab-0, ab-2 and ab-4, literal Show id, absent image, Snapshot id and directory/lookup Profile/Task ids. The long-description search commits one scratch Task and returns only audit-yield, with 56 actual scheduler checkpoints. Final observer build/run both exit 0. All 18 calls succeed on the current product.

| Successful ordinary call | Authority created inside transaction | Inspections outside transaction | Inspections inside transaction | Search checkpoints |
| --- | --- | ---: | ---: | ---: |
| list | yes | 2 | 1 | 0 |
| search | yes | 2 | 1 | 3 |
| show | yes | 2 | 1 | 0 |
| graph | yes | 2 | 1 | 0 |
| view | yes | 1 | 1 | 0 |
| cli-readTasks | yes | 2 | 1 | 0 |
| image | yes | 3 | 1 | 0 |
| import-preview | yes | 2 | 1 | 0 |
| snapshot-list | yes | 1 | 0 | 0 |
| snapshot-show | yes | 1 | 0 | 0 |
| quick-add | yes | 1 | 1 | 0 |
| history | yes | 0 | 1 | 0 |
| projects | yes | 0 | 1 | 0 |
| tags | yes | 0 | 1 | 0 |
| profiles | yes | 0 | 1 | 0 |
| directory | yes | 0 | 2 | 0 |
| lookup | yes | 0 | 2 | 0 |
| search-yield | yes | 2 | 1 | 56 |

An outside inspection is sufficient to show the new lifetime rule would refuse: the authority's creating transaction has ended and there is no current transaction in which it could have been rechecked. It is not an assertion that a new guard has already been implemented or tested. Nested Discovery checks remain inside the physical deferred snapshot. Search processing yields after row materialization with no live authorization transaction; it does not currently perform a later port recheck.

### Caller lifetime audit

Locations in the table are relative to packages/domain/src unless prefixed apps/. The complete 186-site read-port caller inventory in the S1-C2 section remains applicable because product sources are identical. This table adds the creating/consuming transaction and recheck audit for every authority-bearing caller family, including longer command continuations.

| Caller family | Production locations | Current lifetime | Recheck today | Finding under the ruling |
| --- | --- | --- | --- | --- |
| Task list and text search | commands.ts:358-386 | readMetadata commits, then checkRead and graphRead run outside it. Text matching runs after graph materialization and can yield. | None. The observer records three checkpoints for the small query and 56 for the long-description query. | Would refuse before graph query; pure filtering could stay outside after rows/filters are materialized inside the checked transaction. |
| Shared CLI Task reads | commands.ts:155-210; apps/cli/src/main.ts:708 and subsequent readTasks callers | readState commits, then checkRead/graphRead run. Export, review, list and shared mutation preparation use this helper. | No retained-authority recheck. Each new helper call authorizes afresh, but its returned authority already escapes that transaction. | Would refuse ordinary CLI reads and write preparation that uses them. |
| Show and Missing-Task recovery | commands.ts:393-430; task-lookup-error.ts:50-63; server.ts:673-689 | readOne leaves readMetadata, then inspects authority and queries graph. Recovery inspects the same authority later. | None. | Would refuse successful Show as well as affected error recovery. |
| Dependency graph | graph-queries.ts:137-150; server.ts:620-635 | authorizeRead returns after its transaction, then checkRead and graphRead run. | None. | Would refuse ordinary graph reads. |
| Planning views | client-reads.ts:92-107 | readCatalog obtains all rows inside auth transaction, but returns an authority inspected afterward to select fields. | None; later view computation uses already materialized rows. | checkRead would refuse before view construction, even though the catalog SQL itself ran in the checked transaction. |
| Managed Attachment image bytes | attachment-commands.ts:466-491; server.ts:519-540 | readOne already crosses the boundary; imageRead inspects again and reads managed bytes afterward. Server recovery also inspects after the call. | None. | Would refuse. Keep image selection and the required file read inside an authorized read scope, rather than silently allowing a retained capability. |
| Snapshot list and Show | store/snapshots.ts:273-283; server.ts:1014-1034; apps/cli/src/main.ts:2259-2264 | ownerRead commits before listRead/showRead. Each raw Snapshot method opens another transaction after its authority check. Snapshot Show reads its manifest/files. | None. | Would refuse ordinary HTTP and CLI Snapshot reads. This is a real crossing, not just a yielding-search issue. |
| Quick-add parse | server.ts:886-906 | subscribe returns after its check transaction; checkRead then extracts the bound parser fields outside it. | None. | Would refuse a valid ordinary Quick-add parse before its pure parser runs. |
| Import preview and apply | import-tasks.ts:45-56, 148, 222, 337 | Initial readState commits before checkRead/graphRead. Apply can reuse the original read for graphRead after intervening accepted writes. | No recheck of the retained graph authority. Later auth.read(request) calls authorize afresh, but do not renew that retained value. | Would refuse preview and early apply. The post-write graph reread additionally needs an explicit later-transaction recheck. Dry-run import still requires a write-scoped credential on the base. |
| Transfer metadata, Revert and invalid-Version recovery | commands.ts:1208-1217, 1467-1487, 1761-1774 | Each captures readState and consumes its authority after that transaction; transfer also passes targetRead to the existing metadata helper after a second readState. | None. | Would refuse these ordinary command preparations/recovery paths. Copy bound plain selectors while in scope, then run a later authorized query only in a valid new scope. |
| Discovery directory and prefix lookup | discovery.ts:40-94; auth.ts:885-935 | readSnapshot holds one physical deferred SQLite transaction through Effect.runSyncExitWith. Nested auth boundaries use transaction: run => run(). Authorities are created and consumed inside it. | Directory/lookup finish with auth.profiles; per-Profile catalog/metadata checks run inside the same outer snapshot. | No observed expired use. Do not advance a lifetime serial for nested pass-through checks or SAVEPOINTs as though they committed the physical outer transaction. |
| Projects, Tags, Profile summaries and ordinary Task History | auth.ts:1082-1129; client-reads.ts:79-84, 151-152 | Projection or taskHistory callback runs before the creating auth transaction returns. Results leave as data, not authority for another query. | No extra check needed for that same transaction. | These ports already run in their creating transaction. Raw taskHistory supplied an escaped authority remains unsafe, as the seat probe demonstrates. |
| SSE subscription and polling | apps/server/src/sse.ts:26-106, 122-147 | Subscription authority escapes immediately. The 250 ms poll queries generation and changes before running recheckRead. recheckRead calls authenticate in a separate transaction which also ends before returning. | Per-poll recheck exists, but follows changesRead and is skipped for a batch containing ProfileDeleted. It does not provide a live transaction scope to the query. | A strict guard would reject initial checkRead or the first poll. Stamp-only recheck is insufficient if its own transaction ends before the query. Poll recheck and query need one live scope. |
| SSE restore transition | apps/server/src/sse.ts:63-79; apps/server/test/sse.test.ts:288-334 | On generation change, the base emits reload and retains the same authority for later polls. | No renewal in the generation-change branch. The next ordinary poll rechecks credentials after reading. | A generation-bound authority cannot simply be restamped across restore. A fresh authorized scope/value is needed after reload if credentials and Profile remain valid. |

### Binding terminal-frame constraint

[ADR-0010](../../adr/0010-profile-deletion.md) states: "An already connected owner Session receives the ProfileDeleted SSE operation before the stream closes." Profile deletion writes TaskDeleted and ProfileDeleted, the tombstone, and scoped Token revocations atomically. The current poll reads that committed batch, intentionally skips its credential recheck if ProfileDeleted is present, emits the batch, and rejects the next ordinary poll. This terminal frame is already required by the ADR and the requested base frame parity. The earlier compiled Profile recipe's profile-deleted.sse receipt demonstrates that existing owner-Session frame; it is historical evidence, not a new lifetime-fix run.

A new query which requires the Profile still to be active and authorized cannot read that committed ProfileDeleted row after the same commit tombstones the Profile. Moving the current recheck before changesRead would remove the required owner-Session terminal operation. Keeping the current post-read exception would leave the query-port lifetime rule unenforced. I have not invented a terminal-query exception, borrowed owner authority, weakened the Profile check or changed the required frame. This requires a coordinator ruling for the terminal notification mechanism before implementation. No ADR was changed or superseded.

[ADR-0012](../../adr/0012-owner-snapshots.md) also requires restore reload followed by delivery from its restore boundary. The current stream retains one authority across restore. A fixed stream must acquire a new authority for the new generation after reload when the credential and Profile remain valid, rather than renewing an old-generation value. The unchanged baseline SSE suite passes all four tests, including ordered delivery, revocation failure/closure and both-Profile restore reload/delivery. This is baseline evidence only, not post-fix frame parity.

### Smallest proposed implementation, not applied

Keep the private brand, origin, kind, immutable selectors and frozen class/payload. Add a private active transaction lease and restore-generation binding. Reject a query authority after its lease ends, even before an unrelated transaction begins. Incrementing a serial only when another transaction starts would leave a gap after commit. A later recheck must validate and query inside the same still-active physical transaction; returning from an independent authenticate transaction is not enough.

Use a synchronous checked-read callback to obtain metadata, graph rows and owned filter/selection values within the existing credential-check transaction. Ordinary requests should perform one credential lookup. Run yielding search, pure view/Quick-add processing, encoding and rendering on those materialized values afterward. Owner Snapshot and managed image reads need the same live checked scope around their storage access. Import's later post-write graph queries need explicit rechecked scopes. Discovery must retain its one deferred snapshot with nested pass-through checks. Preserve immediate/deferred modes and the writer/replay model; changing a transaction's extent is an implementation change to review and verify, not something this audit silently made.

For SSE, a scoped poll must combine recheck and query and preserve its cursor. Restore requires fresh authority. The terminal ProfileDeleted rule above needs resolution first. Until then, neither a public-path regression nor an exception to the query-port lifetime rule is authorized by this report.

### Commands, real exits and remaining work

Evidence is private and ignored under `docs/evidence/ui-speed/server-reads/authority-lifetime`. All databases, credentials, Snapshot files and the extra search Task are scratch-only. The first observer run failed with write_scope because it used the read-only Token for import preview; the base requires write scope even for dry-run. The second run used the owner Session for that call and passed. The third adds real search checkpoint observations and the yielding search and passes. This fixture correction changes no product authorization behavior.

| Exact invocation | Real exit |
| --- | ---: |
| `bun build --compile .scratch/review-correction2/retained-authority.ts --outfile .scratch/bin/retained-authority-before` | 0 |
| `.scratch/bin/retained-authority-before` | 1, forbidden post-revocation Task returned |
| `cmp .scratch/review-correction2/retained-authority.ts <seat-unchanged-source>` | 0 |
| `bun .scratch/review-correction2/build-transaction-audit.ts`, first / second / third builds | 0 / 0 / 0 |
| `.scratch/bin/read-transaction-audit` | 1, import preview refused write_scope |
| `.scratch/bin/read-transaction-audit-2` | 0 |
| `.scratch/bin/read-transaction-audit-3` | 0 |
| `pnpm --filter @todo/server test sse.test.ts` | 0, four baseline tests |

| Receipt | Real exit |
| --- | ---: |
| `delivery-disk` | 0 |
| `probe-before` | 1 |
| `probe-build-before` | 0 |
| `probe-source-compare` | 0 |
| `sse-baseline` | 0 |
| `transaction-audit-2` | 0 |
| `transaction-audit-3` | 0 |
| `transaction-audit-build-2` | 0 |
| `transaction-audit-build-3` | 0 |
| `transaction-audit-build` | 0 |
| `transaction-audit` | 1 |

The lifetime implementation, all-port revocation/expiry/deletion/restore/Purge/unrelated-request matrix, positive scoped-recheck control, post-fix SSE frame parity, root order-27 check, AtomicCAS, Task search cache, 57-fixture parity, both mutation modes, interleaving, zero-decode sweep and paired cost comparison remain pending. The earlier C2 passes below do not qualify S1-C3. No full gate was rerun to imply closure while the required implementation is held. The contract remains 78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289.

Observer scratch directories were removed after each run. Cleanup removed 4 closed owned Bun runtime copies, 354643456 bytes, after lsof checks. Two superseded observer binaries were retired by hash only after lsof showed no open file; the failing retained-authority binary and final observer remain for review. Free space was 34.3 GB. No child agents, real Todo database, native app, Swift, Keychain, signing, push, merge or PR was used. The implementation is stopped at the requested ordinary-path finding and binding terminal-frame constraint.

## Previous delivery record

## Runtime authority repair, S1-C2

Product: `ade8f941f3d15c61cffdb58d45114b4ababbcc5e`. Previous delivery: `1c5413cb94210b1ae00b6b70b90b6091ddfabf98`. Contract remains `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`. This section supersedes the earlier nominal-authority description; earlier measurements and attempts remain historical below.

The unchanged seat probe reproduced the defect before the fix: compilation 0, execution 1, and direct graph/list returned personal Tasks ab-1, ab-3 and ab-5 under the work read-only Token. The first authority matrix failed before implementation. S1-C2 was introduced by the nominal authority implementation in the S1-C1 repair: its new query wrappers trusted copyable public fields. It is distinct from the inherited raw-request mutation hole. The unchanged S1-C1 probe was recompiled on this product and exits 0.

This is an internal query-port authority defect; no ordinary remote HTTP exploit is claimed. The runtime class now lives inside [the credential-check module](../../../packages/domain/src/auth/auth.ts). A module-private Symbol and exact new.target check are required for construction; no mint function or class is exported. Profile, scope, credential, parsed fields, visible Profile rows and originating database are held through ECMAScript private fields. The payload and nested fields, instance, class and prototype are frozen. Each query port inspects the private brand, exact prototype, expected kind and database before accessing values. A WeakSet was unnecessary: private fields provide the brand and private storage together. Benign getters remain for introspection but query selectors never trust their public values. Copying a nominal TypeScript type grants no runtime authority.

Graph, committed stream changes, metadata, catalog, Tasks, Projects, Tags, Profile counts, Task History, Snapshot list/Show, image selection, Discovery lookup and all read continuations use this guard. Subscription checks and every stream recheck validate the same authority. Discovery's visible Profile set is still derived once from the checked set and held privately. No public creation path was retained. Trusted lower storage functions used by writers/replay retain their existing MutationIdentity/event selectors; they are not authority-taking query ports. The audit below names those callers. Authentication perform and the mapped transaction/append/rebuild regions remain byte-identical to the previous delivery. Transaction modes, projection guards, public contract and error mapping are unchanged.

### Fail-closed controls and the unchanged probe

The matrix has 216 attempts: nine attacks across twelve direct ports and twelve upper queries. Attacks are structured clone, spread, Object.assign, prototype copy, JSON round-trip, subclass construction, subclass prototype copy, Proxy and genuine field mutation. All attempts refuse before returning rows; port/query failures assert StoreError, while constructor or frozen-field mutation is refused before a port can run. Genuine graph/changes/Snapshot reads have literal expected values; wrong-kind and cross-database authorities also fail. The class/prototype cannot be replaced. The HTTP hook substitutes a cloned authority at graphRead: twenty requests return exactly InternalError / Storage operation failed / exit_code 1 / runtime failure, status 500, with no Task data.

The seat's C2 probe is kept byte-for-byte unchanged (cmp 0). It awaits forged graphRead without catching failure, then expects a successful Task list. Consequently the required generic StoreError ends its run with **exit 1**, before either result is returned or result.json is written. It cannot both exit 0 unchanged and require refused authorities to fail with StoreError. The companion refusal control exits 0 and asserts that exact rejection and absence of output data. This is an explicit limitation of the requested unchanged probe's success criterion; no product behavior was weakened to accommodate it.

Both raw-request mutation modes pass all 1,267 lifecycle reply/status comparisons and equal auth evidence. Receipts prove actual Profile and Task/Attachment/Snapshot id, prefix and quick-add field mutation. The interleaving control passes ten pairs in each of three modes (60 responses) with ten proven overlaps per mode and only the respective literal Work/Personal Tasks. The full original differential passes all 57 fixtures: 23,880 original plus 1,267 lifecycle pairs, 25,147 replies per side, byte-identical and equal auth History/last-use.

### Read timings on this product

The full sweep uses the original e692 baseline and current product, 18 corners, two request orders, five paired alternating fresh-process repetitions per order, three passes: 360 processes and 8,640 validated HTTP 200 responses. Every current observation has zero operation decodes. Real clocks, ordinary scheduler and the timing lock were used after this worker's other checks stopped. One-minute load ranged 4.04 to 5.94 on 10 logical CPUs. No pressure workers were launched; other host work is uncontrolled. Values below are handler milliseconds, median [min, max]; warm is pass two. These are synthetic fixtures and handler intervals, not installed UI latency or p99.

| Fixture | Warm /profiles e692 | Current | Warm eight-handler sum e692 | Current |
| --- | --- | --- | --- | --- |
| n15-p1-large0-h32 | 0.755 [0.664, 0.938] | 0.133 [0.128, 0.148] | 6.084 [4.326, 6.239] | 1.407 [1.277, 1.562] |
| n15-p1-large0-h2048 | 11.933 [10.420, 12.270] | 0.133 [0.118, 0.184] | 93.116 [92.914, 95.599] | 1.195 [1.047, 1.358] |
| n15-p1-large1-h32 | 0.986 [0.885, 1.053] | 0.136 [0.128, 0.190] | 8.199 [7.843, 10.025] | 3.448 [3.274, 3.586] |
| n15-p1-large1-h2048 | 11.771 [11.170, 12.017] | 0.134 [0.125, 0.176] | 96.254 [95.816, 97.109] | 1.575 [1.532, 1.827] |
| n15-p8-large0-h32 | 8.493 [7.909, 8.780] | 0.245 [0.235, 0.261] | 17.222 [16.452, 18.371] | 1.267 [1.240, 1.329] |
| n15-p8-large0-h2048 | 94.024 [91.506, 99.887] | 0.253 [0.233, 0.258] | 181.327 [177.094, 190.728] | 1.419 [1.175, 1.483] |
| n15-p8-large1-h32 | 13.744 [12.257, 15.335] | 0.265 [0.245, 0.343] | 27.341 [26.795, 30.484] | 3.733 [2.967, 4.448] |
| n15-p8-large1-h2048 | 98.947 [96.585, 99.897] | 0.247 [0.238, 0.270] | 186.324 [183.856, 193.064] | 1.670 [1.642, 1.914] |
| n178-p1-large0-h32 | 1.704 [1.671, 2.673] | 0.243 [0.226, 0.284] | 17.397 [16.634, 18.352] | 4.148 [4.135, 4.849] |
| n178-p1-large0-h2048 | 16.420 [15.275, 18.679] | 0.237 [0.199, 0.446] | 127.003 [126.504, 129.628] | 4.155 [3.941, 5.806] |
| n178-p1-large1-h32 | 1.975 [1.906, 2.011] | 0.211 [0.198, 0.248] | 19.489 [19.167, 21.554] | 6.289 [5.995, 6.380] |
| n178-p1-large1-h2048 | 16.622 [15.894, 18.166] | 0.229 [0.209, 0.246] | 132.243 [127.571, 134.578] | 4.768 [4.590, 10.060] |
| n178-p8-large0-h32 | 87.753 [86.461, 93.339] | 0.895 [0.863, 0.934] | 169.957 [168.469, 175.644] | 4.625 [4.388, 4.845] |
| n178-p8-large0-h2048 | 195.882 [191.258, 197.791] | 0.814 [0.759, 0.845] | 369.864 [366.752, 373.794] | 4.390 [4.354, 4.450] |
| n178-p8-large1-h32 | 89.146 [88.477, 94.165] | 0.999 [0.870, 1.349] | 174.627 [173.244, 180.740] | 8.138 [7.470, 11.898] |
| n178-p8-large1-h2048 | 202.740 [195.248, 209.513] | 0.868 [0.849, 0.889] | 387.889 [377.475, 413.632] | 5.018 [4.821, 5.731] |
| n178-p8-empty-large0-h2048 | 120.423 [120.339, 122.093] | 0.288 [0.281, 0.340] | 231.010 [225.219, 234.210] | 4.339 [4.203, 4.506] |
| n178-p8-empty-large1-h2048 | 126.241 [125.515, 129.788] | 0.301 [0.284, 0.331] | 241.185 [234.502, 246.125] | 4.652 [4.568, 5.637] |

The incremental guard comparison uses the preserved pre-C2 219749f2 binary versus ade8f941 on the 178-Task/eight-Profile/2234-operation owner-shaped fixture. Ten alternating pairs per request order give 20 pairs, 40 fresh processes and 960 validated responses. Both variants decode zero operations. Boundary one-minute loads range 2.53 to 2.66. All valid observations are retained.

| Request order | Pre-C2 eight-handler sum | Current | Paired delta median |
| --- | --- | --- | --- |
| Profiles first | 4.812 [4.358, 5.254] | 4.841 [4.467, 5.150] | 0.073 |
| Profiles last | 4.819 [4.570, 5.332] | 4.737 [4.553, 5.347] | -0.124 |

Pooled paired warm eight-read delta is 0.034 ms, range [-0.721, 0.777]. A deterministic 10,000-resample paired-median bootstrap gives a 95% percentile interval [-0.115, 0.172] ms (seed 0x78a2be44). No incremental cost is distinguishable from this run's noise; this is not a proof of exactly zero CPU overhead. The comparison covers the observed eight-read sum, not tail or UI timing.

| Fixture / route | First pass e692 | Current | Warm e692 | Current | Profiles-last warm e692 | Current |
| --- | --- | --- | --- | --- | --- | --- |
| n15-p1-large0-h32 / profiles | 2.514 [2.384, 2.807] | 1.481 [1.476, 1.509] | 0.755 [0.664, 0.938] | 0.133 [0.128, 0.148] | 0.484 [0.472, 2.275] | 0.129 [0.117, 0.134] |
| n15-p1-large0-h32 / tags | 1.010 [0.945, 1.194] | 0.330 [0.322, 0.353] | 0.519 [0.487, 0.574] | 0.096 [0.089, 0.101] | 0.602 [0.546, 0.709] | 0.093 [0.091, 0.110] |
| n15-p1-large0-h32 / tasks | 1.337 [1.281, 1.518] | 0.908 [0.877, 0.935] | 0.658 [0.629, 0.708] | 0.283 [0.254, 0.287] | 0.659 [0.633, 0.694] | 0.305 [0.282, 0.338] |
| n15-p1-large0-h32 / overdue | 1.027 [0.953, 1.111] | 0.595 [0.568, 0.613] | 0.515 [0.507, 0.606] | 0.187 [0.180, 0.266] | 0.517 [0.484, 0.557] | 0.198 [0.188, 0.242] |
| n15-p1-large0-h32 / projects | 0.703 [0.668, 0.777] | 0.191 [0.184, 0.196] | 0.488 [0.470, 0.625] | 0.071 [0.068, 0.094] | 0.516 [0.455, 0.602] | 0.080 [0.073, 0.085] |
| n15-p1-large0-h32 / inbox | 0.601 [0.590, 0.630] | 0.281 [0.261, 0.294] | 0.546 [0.500, 0.623] | 0.234 [0.214, 0.299] | 0.568 [0.506, 0.580] | 0.239 [0.216, 0.312] |
| n15-p1-large0-h32 / today | 0.685 [0.613, 0.692] | 0.223 [0.211, 0.284] | 0.478 [0.468, 0.513] | 0.206 [0.156, 0.238] | 0.465 [0.439, 0.493] | 0.196 [0.160, 0.235] |
| n15-p1-large0-h32 / scheduled | 0.676 [0.615, 0.729] | 0.216 [0.207, 0.238] | 2.008 [0.470, 2.101] | 0.177 [0.154, 0.193] | 0.474 [0.437, 0.512] | 0.170 [0.156, 0.189] |
| n15-p1-large0-h2048 / profiles | 15.725 [15.459, 16.769] | 1.536 [1.498, 1.637] | 11.933 [10.420, 12.270] | 0.133 [0.118, 0.184] | 12.401 [12.101, 14.105] | 0.111 [0.103, 0.147] |
| n15-p1-large0-h2048 / tags | 14.348 [14.026, 14.984] | 0.348 [0.335, 0.379] | 11.283 [10.913, 12.353] | 0.090 [0.082, 0.132] | 11.071 [10.678, 11.830] | 0.083 [0.077, 0.116] |
| n15-p1-large0-h2048 / tasks | 13.076 [12.774, 13.439] | 0.885 [0.806, 0.992] | 12.112 [11.729, 12.446] | 0.213 [0.201, 0.268] | 12.437 [11.099, 13.087] | 0.225 [0.224, 0.253] |
| n15-p1-large0-h2048 / overdue | 11.385 [11.079, 12.138] | 0.569 [0.538, 0.605] | 10.865 [10.526, 11.879] | 0.153 [0.142, 0.174] | 12.164 [12.013, 12.745] | 0.149 [0.139, 0.166] |
| n15-p1-large0-h2048 / projects | 12.770 [11.775, 14.348] | 0.195 [0.181, 0.210] | 11.966 [11.324, 12.505] | 0.073 [0.066, 0.084] | 10.975 [10.623, 11.184] | 0.081 [0.073, 0.126] |
| n15-p1-large0-h2048 / inbox | 13.154 [11.586, 13.330] | 0.227 [0.220, 0.229] | 12.101 [10.567, 13.102] | 0.190 [0.166, 0.246] | 12.141 [12.102, 12.641] | 0.181 [0.167, 0.214] |
| n15-p1-large0-h2048 / today | 10.871 [10.442, 11.128] | 0.173 [0.169, 0.187] | 11.212 [10.721, 12.000] | 0.157 [0.137, 0.174] | 10.892 [10.566, 12.758] | 0.138 [0.129, 0.157] |
| n15-p1-large0-h2048 / scheduled | 12.193 [11.986, 12.448] | 0.179 [0.176, 0.192] | 12.763 [11.845, 13.116] | 0.148 [0.128, 0.237] | 12.357 [10.491, 12.796] | 0.141 [0.126, 0.218] |
| n15-p1-large1-h32 / profiles | 2.915 [2.793, 3.068] | 1.514 [1.460, 1.569] | 0.986 [0.885, 1.053] | 0.136 [0.128, 0.190] | 0.836 [0.787, 0.852] | 0.173 [0.164, 0.200] |
| n15-p1-large1-h32 / tags | 1.348 [1.273, 1.434] | 0.350 [0.321, 0.382] | 0.822 [0.764, 0.848] | 0.095 [0.091, 0.111] | 0.935 [0.903, 1.022] | 0.093 [0.092, 0.101] |
| n15-p1-large1-h32 / tasks | 3.414 [3.336, 3.506] | 1.077 [1.001, 1.118] | 1.011 [0.957, 1.090] | 0.421 [0.389, 0.492] | 1.154 [1.086, 1.347] | 0.436 [0.379, 0.445] |
| n15-p1-large1-h32 / overdue | 1.437 [1.384, 1.480] | 0.710 [0.688, 0.767] | 2.004 [1.837, 3.460] | 0.293 [0.280, 0.315] | 0.853 [0.794, 0.932] | 0.298 [0.285, 0.332] |
| n15-p1-large1-h32 / projects | 1.056 [1.000, 1.133] | 0.206 [0.195, 0.229] | 0.967 [0.928, 1.116] | 0.077 [0.071, 0.094] | 1.926 [0.769, 2.006] | 0.080 [0.077, 0.084] |
| n15-p1-large1-h32 / inbox | 1.032 [0.942, 1.049] | 0.389 [0.379, 0.439] | 0.893 [0.780, 0.959] | 0.301 [0.266, 0.314] | 1.009 [0.956, 1.881] | 0.318 [0.281, 0.342] |
| n15-p1-large1-h32 / today | 2.310 [1.243, 2.583] | 0.322 [0.315, 0.353] | 0.840 [0.733, 0.867] | 1.751 [1.680, 1.854] | 0.991 [0.747, 1.096] | 1.761 [1.669, 1.957] |
| n15-p1-large1-h32 / scheduled | 1.455 [1.182, 2.472] | 0.309 [0.297, 0.328] | 0.747 [0.740, 0.794] | 0.324 [0.281, 0.342] | 0.815 [0.684, 0.897] | 0.387 [0.346, 0.453] |
| n15-p1-large1-h2048 / profiles | 16.281 [15.816, 17.444] | 1.525 [1.465, 1.569] | 11.771 [11.170, 12.017] | 0.134 [0.125, 0.176] | 11.461 [10.827, 12.330] | 0.114 [0.111, 0.119] |
| n15-p1-large1-h2048 / tags | 12.995 [12.190, 13.867] | 0.339 [0.333, 0.344] | 13.373 [12.398, 13.923] | 0.087 [0.081, 0.113] | 11.706 [11.282, 13.612] | 0.087 [0.085, 0.094] |
| n15-p1-large1-h2048 / tasks | 13.489 [12.762, 14.612] | 0.923 [0.916, 0.984] | 12.573 [11.717, 12.673] | 0.326 [0.297, 0.365] | 14.052 [11.470, 14.198] | 0.347 [0.327, 0.354] |
| n15-p1-large1-h2048 / overdue | 13.538 [13.074, 13.925] | 0.675 [0.631, 0.687] | 12.233 [11.422, 12.378] | 0.248 [0.239, 0.273] | 12.017 [11.280, 12.249] | 0.252 [0.235, 0.345] |
| n15-p1-large1-h2048 / projects | 13.607 [12.705, 14.590] | 0.185 [0.175, 0.213] | 11.298 [10.839, 12.565] | 0.066 [0.064, 0.081] | 11.141 [10.862, 12.235] | 0.088 [0.079, 0.113] |
| n15-p1-large1-h2048 / inbox | 12.698 [11.592, 12.996] | 0.320 [0.313, 0.328] | 12.017 [11.373, 12.350] | 0.285 [0.255, 0.327] | 11.915 [11.804, 12.064] | 0.268 [0.257, 0.332] |
| n15-p1-large1-h2048 / today | 12.964 [12.715, 13.662] | 0.271 [0.268, 0.276] | 12.123 [12.029, 12.601] | 0.225 [0.221, 0.255] | 11.210 [10.672, 12.337] | 0.243 [0.227, 0.258] |
| n15-p1-large1-h2048 / scheduled | 12.755 [10.999, 13.199] | 0.289 [0.263, 0.312] | 11.289 [11.104, 11.777] | 0.220 [0.214, 0.237] | 12.099 [11.361, 13.432] | 0.236 [0.226, 0.245] |
| n15-p8-large0-h32 / profiles | 13.136 [12.880, 14.648] | 1.682 [1.641, 1.754] | 8.493 [7.909, 8.780] | 0.245 [0.235, 0.261] | 8.772 [8.572, 9.291] | 0.227 [0.205, 0.322] |
| n15-p8-large0-h32 / tags | 1.467 [1.356, 1.565] | 0.329 [0.318, 0.370] | 1.949 [1.005, 2.249] | 0.089 [0.084, 0.097] | 1.252 [1.129, 2.294] | 0.092 [0.084, 0.101] |
| n15-p8-large0-h32 / tasks | 2.046 [1.959, 2.101] | 0.825 [0.819, 0.987] | 1.608 [1.519, 2.520] | 0.229 [0.222, 0.242] | 1.380 [1.312, 1.397] | 0.244 [0.230, 0.268] |
| n15-p8-large0-h32 / overdue | 1.499 [1.403, 1.687] | 0.578 [0.559, 0.643] | 1.087 [1.041, 1.161] | 0.152 [0.143, 0.177] | 1.002 [0.960, 1.111] | 0.155 [0.147, 0.158] |
| n15-p8-large0-h32 / projects | 1.224 [1.123, 1.432] | 0.186 [0.177, 0.218] | 0.959 [0.945, 1.131] | 0.069 [0.064, 0.073] | 0.975 [0.935, 1.011] | 0.074 [0.068, 0.129] |
| n15-p8-large0-h32 / inbox | 1.091 [1.060, 1.532] | 0.242 [0.231, 0.262] | 1.014 [1.003, 1.277] | 0.182 [0.176, 0.209] | 1.191 [1.149, 1.210] | 0.182 [0.175, 0.228] |
| n15-p8-large0-h32 / today | 1.082 [1.042, 1.517] | 0.186 [0.176, 0.189] | 0.967 [0.946, 1.246] | 0.143 [0.138, 0.166] | 1.040 [0.998, 1.061] | 0.165 [0.139, 0.189] |
| n15-p8-large0-h32 / scheduled | 2.403 [1.108, 3.266] | 0.186 [0.178, 0.190] | 0.955 [0.944, 1.312] | 0.145 [0.136, 0.159] | 1.022 [1.002, 1.039] | 0.139 [0.131, 0.160] |
| n15-p8-large0-h2048 / profiles | 102.263 [99.784, 110.891] | 1.776 [1.645, 2.749] | 94.024 [91.506, 99.887] | 0.253 [0.233, 0.258] | 97.616 [96.282, 111.773] | 0.204 [0.190, 0.226] |
| n15-p8-large0-h2048 / tags | 12.898 [12.304, 13.542] | 0.367 [0.338, 0.890] | 12.761 [10.959, 13.658] | 0.102 [0.089, 0.143] | 12.185 [11.411, 12.981] | 0.094 [0.086, 0.112] |
| n15-p8-large0-h2048 / tasks | 12.661 [11.908, 13.847] | 0.925 [0.793, 1.904] | 12.501 [11.629, 14.034] | 0.229 [0.214, 0.316] | 13.234 [11.480, 14.196] | 0.250 [0.225, 0.270] |
| n15-p8-large0-h2048 / overdue | 13.275 [12.334, 14.699] | 0.603 [0.547, 1.589] | 12.049 [11.250, 12.627] | 0.177 [0.142, 0.204] | 12.579 [11.413, 12.933] | 0.151 [0.143, 0.159] |
| n15-p8-large0-h2048 / projects | 12.612 [12.465, 13.080] | 0.199 [0.178, 0.338] | 12.425 [11.482, 13.936] | 0.082 [0.067, 0.089] | 11.801 [10.898, 13.340] | 0.073 [0.068, 0.086] |
| n15-p8-large0-h2048 / inbox | 12.160 [11.015, 13.714] | 0.236 [0.224, 0.275] | 12.622 [12.127, 13.135] | 0.195 [0.171, 0.268] | 12.565 [11.774, 12.957] | 0.180 [0.166, 0.219] |
| n15-p8-large0-h2048 / today | 12.510 [12.421, 13.709] | 0.176 [0.168, 0.196] | 11.797 [11.597, 13.359] | 0.142 [0.128, 0.192] | 11.659 [11.344, 13.216] | 0.140 [0.134, 0.158] |
| n15-p8-large0-h2048 / scheduled | 11.681 [11.176, 14.730] | 0.173 [0.170, 0.189] | 12.892 [11.801, 13.601] | 0.141 [0.127, 0.174] | 13.319 [11.404, 28.023] | 0.138 [0.129, 0.205] |
| n15-p8-large1-h32 / profiles | 17.432 [16.286, 18.756] | 1.760 [1.642, 2.306] | 13.744 [12.257, 15.335] | 0.265 [0.245, 0.343] | 11.510 [10.923, 13.500] | 0.267 [0.241, 0.300] |
| n15-p8-large1-h32 / tags | 2.679 [2.567, 3.315] | 0.453 [0.318, 0.498] | 2.588 [1.368, 3.367] | 0.093 [0.088, 0.120] | 2.425 [1.509, 2.523] | 0.092 [0.088, 0.190] |
| n15-p8-large1-h32 / tasks | 2.795 [2.522, 3.135] | 1.056 [0.875, 1.111] | 1.793 [1.734, 3.269] | 0.350 [0.332, 0.451] | 2.273 [1.841, 3.203] | 0.362 [0.340, 0.466] |
| n15-p8-large1-h32 / overdue | 2.025 [1.688, 2.268] | 0.697 [0.622, 1.180] | 1.326 [1.255, 1.499] | 1.921 [0.312, 2.373] | 1.401 [1.331, 1.953] | 1.709 [0.260, 1.807] |
| n15-p8-large1-h32 / projects | 1.553 [1.440, 1.769] | 0.207 [0.175, 0.440] | 1.264 [1.209, 1.591] | 0.175 [0.149, 0.343] | 1.424 [1.232, 1.715] | 0.139 [0.073, 0.149] |
| n15-p8-large1-h32 / inbox | 2.835 [2.649, 3.095] | 0.399 [0.366, 0.489] | 4.434 [2.776, 4.865] | 0.433 [0.386, 0.755] | 4.262 [1.598, 5.119] | 0.361 [0.313, 1.858] |
| n15-p8-large1-h32 / today | 1.565 [1.423, 1.817] | 0.319 [0.291, 0.519] | 1.665 [1.632, 1.692] | 0.314 [0.290, 0.345] | 1.802 [1.465, 4.671] | 0.256 [0.215, 0.370] |
| n15-p8-large1-h32 / scheduled | 1.567 [1.458, 1.757] | 0.293 [0.276, 0.482] | 1.497 [1.293, 1.681] | 0.260 [0.221, 0.321] | 1.568 [1.298, 1.829] | 0.229 [0.209, 0.281] |
| n15-p8-large1-h2048 / profiles | 110.268 [105.909, 119.552] | 1.623 [1.587, 1.841] | 98.947 [96.585, 99.897] | 0.247 [0.238, 0.270] | 99.541 [96.530, 102.873] | 0.209 [0.205, 0.242] |
| n15-p8-large1-h2048 / tags | 14.485 [11.815, 14.532] | 0.351 [0.320, 0.399] | 12.136 [11.726, 14.087] | 0.095 [0.091, 0.160] | 13.151 [11.547, 13.483] | 0.109 [0.092, 0.129] |
| n15-p8-large1-h2048 / tasks | 13.265 [12.908, 15.015] | 0.939 [0.875, 0.988] | 12.931 [12.280, 13.466] | 0.331 [0.317, 0.372] | 13.248 [12.245, 14.467] | 0.397 [0.328, 0.446] |
| n15-p8-large1-h2048 / overdue | 13.348 [13.256, 15.424] | 0.649 [0.623, 2.025] | 12.091 [11.747, 13.748] | 0.243 [0.224, 0.280] | 12.477 [11.395, 14.137] | 0.267 [0.256, 0.410] |
| n15-p8-large1-h2048 / projects | 12.141 [11.459, 13.731] | 0.174 [0.164, 0.325] | 13.680 [12.434, 14.140] | 0.071 [0.062, 0.101] | 12.535 [11.733, 14.684] | 0.082 [0.076, 0.153] |
| n15-p8-large1-h2048 / inbox | 13.045 [12.735, 13.643] | 0.327 [0.299, 0.349] | 12.678 [11.482, 13.259] | 0.266 [0.249, 0.304] | 12.772 [12.640, 13.363] | 0.284 [0.257, 0.413] |
| n15-p8-large1-h2048 / today | 11.830 [11.319, 13.163] | 0.261 [0.248, 0.321] | 12.886 [11.834, 13.933] | 0.225 [0.205, 0.270] | 11.628 [11.382, 13.906] | 0.251 [0.206, 0.286] |
| n15-p8-large1-h2048 / scheduled | 12.203 [11.868, 12.371] | 0.258 [0.250, 0.274] | 12.830 [12.442, 13.087] | 0.231 [0.187, 0.235] | 13.037 [12.318, 13.990] | 0.222 [0.195, 0.298] |
| n178-p1-large0-h32 / profiles | 4.193 [3.995, 5.254] | 1.694 [1.610, 1.765] | 1.704 [1.671, 2.673] | 0.243 [0.226, 0.284] | 1.702 [1.639, 1.832] | 0.202 [0.177, 0.231] |
| n178-p1-large0-h32 / tags | 4.104 [4.049, 4.596] | 0.349 [0.341, 0.360] | 2.637 [1.681, 2.757] | 0.104 [0.100, 0.115] | 1.555 [1.509, 2.828] | 0.097 [0.091, 0.102] |
| n178-p1-large0-h32 / tasks | 3.746 [3.627, 3.945] | 2.105 [2.096, 2.155] | 2.727 [2.543, 3.189] | 1.135 [1.095, 1.156] | 3.801 [2.836, 4.061] | 1.135 [1.087, 1.329] |
| n178-p1-large0-h32 / overdue | 2.258 [2.234, 2.284] | 1.330 [1.207, 1.717] | 1.805 [1.765, 1.935] | 0.682 [0.658, 0.704] | 1.842 [1.737, 1.976] | 0.664 [0.640, 0.938] |
| n178-p1-large0-h32 / projects | 3.352 [1.831, 3.862] | 0.257 [0.239, 0.289] | 2.728 [1.670, 3.369] | 0.085 [0.082, 0.177] | 1.612 [1.539, 1.679] | 0.100 [0.098, 0.133] |
| n178-p1-large0-h32 / inbox | 2.533 [2.070, 3.610] | 0.810 [0.797, 2.674] | 1.968 [1.860, 3.197] | 0.724 [0.680, 1.089] | 1.962 [1.696, 2.926] | 0.734 [0.683, 0.805] |
| n178-p1-large0-h32 / today | 1.784 [1.682, 1.901] | 1.015 [0.874, 2.753] | 1.775 [1.682, 1.987] | 0.597 [0.580, 0.809] | 2.804 [1.696, 3.042] | 0.614 [0.586, 0.696] |
| n178-p1-large0-h32 / scheduled | 1.705 [1.632, 1.742] | 0.768 [0.680, 0.927] | 1.672 [1.571, 1.791] | 0.589 [0.571, 0.657] | 1.784 [1.692, 1.882] | 0.597 [0.565, 0.620] |
| n178-p1-large0-h2048 / profiles | 20.574 [19.888, 21.630] | 1.621 [1.551, 1.643] | 16.420 [15.275, 18.679] | 0.237 [0.199, 0.446] | 16.006 [14.764, 17.496] | 0.217 [0.175, 0.234] |
| n178-p1-large0-h2048 / tags | 17.258 [16.993, 20.794] | 0.356 [0.340, 0.369] | 15.463 [14.895, 16.747] | 0.102 [0.094, 0.122] | 16.709 [15.751, 19.206] | 0.097 [0.093, 0.121] |
| n178-p1-large0-h2048 / tasks | 20.907 [19.240, 22.464] | 1.891 [1.805, 1.957] | 17.085 [16.233, 18.451] | 1.124 [1.068, 1.229] | 16.695 [15.215, 18.820] | 1.135 [1.080, 1.960] |
| n178-p1-large0-h2048 / overdue | 16.996 [15.546, 17.535] | 1.311 [1.151, 1.456] | 15.641 [15.502, 16.597] | 0.637 [0.586, 0.722] | 15.246 [14.053, 18.698] | 0.715 [0.631, 2.034] |
| n178-p1-large0-h2048 / projects | 17.413 [16.052, 17.661] | 0.268 [0.221, 0.277] | 15.936 [14.584, 16.639] | 0.096 [0.084, 0.130] | 17.267 [15.064, 18.915] | 0.103 [0.091, 0.139] |
| n178-p1-large0-h2048 / inbox | 16.194 [14.831, 17.179] | 0.810 [0.796, 1.045] | 14.744 [14.594, 15.759] | 0.756 [0.650, 2.208] | 15.717 [14.255, 17.931] | 0.788 [0.660, 0.820] |
| n178-p1-large0-h2048 / today | 15.358 [14.886, 16.053] | 0.700 [0.655, 0.744] | 15.465 [14.939, 15.669] | 0.623 [0.573, 0.687] | 15.240 [14.687, 16.133] | 0.602 [0.597, 0.632] |
| n178-p1-large0-h2048 / scheduled | 16.244 [15.631, 16.446] | 0.661 [0.626, 0.714] | 16.473 [14.143, 17.188] | 0.591 [0.552, 0.633] | 15.458 [14.694, 17.849] | 0.615 [0.590, 0.776] |
| n178-p1-large1-h32 / profiles | 5.865 [5.727, 6.992] | 1.647 [1.568, 1.680] | 1.975 [1.906, 2.011] | 0.211 [0.198, 0.248] | 2.144 [1.793, 2.880] | 0.212 [0.193, 0.227] |
| n178-p1-large1-h32 / tags | 2.777 [2.643, 2.893] | 0.358 [0.341, 0.401] | 2.202 [2.025, 3.053] | 0.100 [0.095, 0.109] | 2.077 [1.910, 2.428] | 0.098 [0.093, 0.103] |
| n178-p1-large1-h32 / tasks | 5.469 [5.206, 6.881] | 3.794 [3.663, 3.922] | 4.144 [3.043, 4.553] | 1.262 [1.191, 1.349] | 2.899 [2.827, 3.014] | 1.247 [1.211, 1.373] |
| n178-p1-large1-h32 / overdue | 2.705 [2.651, 3.109] | 1.397 [1.363, 1.431] | 2.265 [1.995, 3.187] | 1.989 [0.812, 2.043] | 1.929 [1.913, 2.879] | 0.891 [0.750, 1.911] |
| n178-p1-large1-h32 / projects | 5.088 [2.735, 5.528] | 0.246 [0.234, 0.254] | 1.926 [1.881, 2.380] | 0.149 [0.088, 0.190] | 1.977 [1.761, 3.014] | 0.113 [0.091, 0.174] |
| n178-p1-large1-h32 / inbox | 2.582 [2.374, 3.243] | 0.928 [0.907, 0.947] | 2.122 [2.096, 3.149] | 1.044 [0.951, 1.970] | 2.108 [2.013, 3.255] | 2.067 [0.874, 2.140] |
| n178-p1-large1-h32 / today | 2.141 [2.010, 3.173] | 0.737 [0.701, 0.818] | 2.178 [1.975, 3.170] | 0.780 [0.698, 0.886] | 1.966 [1.870, 2.035] | 0.829 [0.740, 0.928] |
| n178-p1-large1-h32 / scheduled | 1.971 [1.808, 2.222] | 0.760 [0.719, 0.852] | 2.260 [1.908, 3.315] | 0.750 [0.699, 0.788] | 1.990 [1.868, 2.998] | 0.737 [0.716, 0.748] |
| n178-p1-large1-h2048 / profiles | 20.136 [20.035, 20.880] | 1.781 [1.595, 1.886] | 16.622 [15.894, 18.166] | 0.229 [0.209, 0.246] | 15.647 [14.417, 17.180] | 0.185 [0.182, 0.226] |
| n178-p1-large1-h2048 / tags | 19.019 [18.092, 19.384] | 0.416 [0.328, 0.489] | 17.319 [16.311, 17.731] | 0.105 [0.100, 0.132] | 15.922 [14.792, 18.041] | 0.099 [0.098, 0.119] |
| n178-p1-large1-h2048 / tasks | 21.147 [20.924, 22.664] | 2.252 [1.938, 2.494] | 17.324 [16.709, 18.447] | 1.268 [1.170, 1.591] | 18.264 [16.056, 18.813] | 1.234 [1.161, 1.282] |
| n178-p1-large1-h2048 / overdue | 17.333 [16.793, 18.384] | 1.524 [1.333, 2.591] | 15.086 [14.510, 16.518] | 0.755 [0.730, 2.845] | 15.016 [14.545, 15.769] | 0.738 [0.708, 0.904] |
| n178-p1-large1-h2048 / projects | 15.760 [15.237, 16.772] | 0.278 [0.251, 0.313] | 16.083 [15.722, 17.087] | 0.100 [0.080, 0.382] | 15.174 [14.697, 16.319] | 0.110 [0.091, 0.127] |
| n178-p1-large1-h2048 / inbox | 16.922 [15.920, 17.228] | 0.900 [0.892, 1.054] | 16.501 [14.651, 18.180] | 0.873 [0.765, 2.410] | 15.962 [14.725, 16.579] | 0.860 [0.766, 0.912] |
| n178-p1-large1-h2048 / today | 16.655 [16.397, 17.148] | 0.784 [0.695, 0.963] | 15.273 [15.139, 15.612] | 0.710 [0.681, 0.976] | 16.262 [14.919, 16.844] | 0.697 [0.681, 0.727] |
| n178-p1-large1-h2048 / scheduled | 16.306 [15.826, 17.489] | 0.739 [0.695, 0.860] | 16.216 [15.233, 17.659] | 0.730 [0.704, 1.507] | 15.133 [14.837, 17.428] | 0.707 [0.676, 0.768] |
| n178-p8-large0-h32 / profiles | 102.639 [100.966, 106.563] | 2.550 [2.522, 2.596] | 87.753 [86.461, 93.339] | 0.895 [0.863, 0.934] | 88.066 [87.425, 91.858] | 0.757 [0.711, 0.856] |
| n178-p8-large0-h32 / tags | 11.414 [11.199, 12.326] | 0.348 [0.336, 0.356] | 10.728 [10.491, 12.811] | 0.106 [0.104, 0.135] | 11.745 [11.047, 12.317] | 0.101 [0.096, 0.114] |
| n178-p8-large0-h32 / tasks | 18.122 [16.717, 18.923] | 1.894 [1.726, 1.992] | 16.034 [15.705, 17.230] | 1.158 [1.025, 1.206] | 16.912 [16.825, 17.129] | 1.030 [1.007, 1.095] |
| n178-p8-large0-h32 / overdue | 11.877 [11.003, 12.519] | 2.109 [1.530, 2.228] | 10.816 [10.112, 11.491] | 0.612 [0.568, 0.707] | 10.577 [10.023, 13.095] | 0.595 [0.555, 0.636] |
| n178-p8-large0-h32 / projects | 11.955 [11.808, 13.819] | 0.313 [0.274, 0.383] | 10.580 [9.809, 11.693] | 0.083 [0.077, 0.092] | 10.904 [10.121, 11.445] | 0.087 [0.079, 0.103] |
| n178-p8-large0-h32 / inbox | 10.642 [10.233, 12.091] | 0.806 [0.734, 0.903] | 11.337 [11.028, 11.765] | 0.654 [0.621, 0.726] | 12.129 [10.833, 13.329] | 0.637 [0.609, 0.793] |
| n178-p8-large0-h32 / today | 11.633 [10.376, 12.907] | 0.687 [0.627, 0.696] | 11.149 [10.348, 11.499] | 0.548 [0.523, 0.602] | 11.153 [10.039, 11.606] | 0.535 [0.515, 0.598] |
| n178-p8-large0-h32 / scheduled | 11.735 [10.392, 12.138] | 0.644 [0.613, 0.734] | 10.529 [10.001, 11.965] | 0.547 [0.532, 0.591] | 11.900 [10.483, 12.111] | 0.550 [0.534, 0.600] |
| n178-p8-large0-h2048 / profiles | 201.621 [196.624, 202.221] | 2.346 [2.324, 2.449] | 195.882 [191.258, 197.791] | 0.814 [0.759, 0.845] | 195.873 [194.678, 198.848] | 0.773 [0.728, 0.807] |
| n178-p8-large0-h2048 / tags | 25.059 [24.810, 25.339] | 0.351 [0.346, 0.385] | 23.471 [22.977, 24.593] | 0.096 [0.092, 0.101] | 25.458 [23.137, 26.751] | 0.105 [0.094, 0.116] |
| n178-p8-large0-h2048 / tasks | 31.427 [31.019, 32.762] | 1.817 [1.762, 1.933] | 30.390 [28.443, 33.428] | 1.010 [1.004, 1.021] | 29.195 [28.762, 29.854] | 1.010 [1.006, 1.091] |
| n178-p8-large0-h2048 / overdue | 24.506 [22.629, 26.303] | 1.061 [1.037, 1.130] | 24.381 [23.340, 25.191] | 0.570 [0.570, 0.593] | 24.203 [22.238, 25.313] | 0.602 [0.588, 0.649] |
| n178-p8-large0-h2048 / projects | 23.725 [23.094, 24.799] | 0.197 [0.184, 0.200] | 23.958 [22.985, 24.522] | 0.077 [0.073, 0.081] | 23.335 [22.660, 24.398] | 0.084 [0.081, 0.093] |
| n178-p8-large0-h2048 / inbox | 23.210 [22.645, 25.435] | 0.717 [0.694, 0.737] | 24.505 [23.948, 24.741] | 0.668 [0.649, 0.715] | 23.728 [23.034, 24.124] | 0.663 [0.635, 0.689] |
| n178-p8-large0-h2048 / today | 23.636 [22.632, 24.288] | 0.593 [0.568, 0.657] | 23.976 [23.120, 25.299] | 0.573 [0.545, 0.606] | 24.327 [23.146, 24.817] | 0.559 [0.535, 0.670] |
| n178-p8-large0-h2048 / scheduled | 23.148 [22.946, 24.338] | 0.603 [0.588, 0.604] | 23.953 [23.518, 24.723] | 0.586 [0.542, 0.632] | 24.090 [23.386, 26.568] | 0.575 [0.536, 0.589] |
| n178-p8-large1-h32 / profiles | 102.091 [100.910, 107.344] | 2.544 [2.518, 2.689] | 89.146 [88.477, 94.165] | 0.999 [0.870, 1.349] | 90.711 [87.545, 92.734] | 0.895 [0.885, 1.044] |
| n178-p8-large1-h32 / tags | 11.682 [10.714, 13.827] | 0.364 [0.334, 0.411] | 10.747 [10.186, 12.932] | 0.117 [0.096, 0.493] | 11.151 [10.471, 11.918] | 0.098 [0.091, 0.170] |
| n178-p8-large1-h32 / tasks | 18.450 [17.087, 21.564] | 1.909 [1.833, 2.044] | 16.327 [15.751, 17.596] | 3.965 [3.562, 6.583] | 16.288 [15.989, 18.090] | 3.940 [3.712, 4.379] |
| n178-p8-large1-h32 / overdue | 12.356 [11.922, 12.869] | 1.243 [1.182, 1.348] | 11.305 [10.954, 11.946] | 0.899 [0.815, 1.141] | 10.960 [10.066, 12.825] | 0.856 [0.799, 0.975] |
| n178-p8-large1-h32 / projects | 11.257 [10.755, 11.831] | 0.214 [0.210, 0.241] | 11.581 [10.500, 13.298] | 0.124 [0.095, 0.144] | 11.792 [10.727, 12.152] | 0.106 [0.095, 0.155] |
| n178-p8-large1-h32 / inbox | 11.789 [10.891, 12.840] | 0.898 [0.835, 0.908] | 11.621 [11.224, 13.161] | 0.814 [0.736, 0.872] | 11.059 [10.489, 12.858] | 0.778 [0.755, 0.825] |
| n178-p8-large1-h32 / today | 11.665 [11.007, 11.869] | 0.756 [0.693, 0.796] | 11.469 [11.015, 12.509] | 0.655 [0.642, 0.711] | 11.849 [10.633, 12.297] | 0.654 [0.628, 0.701] |
| n178-p8-large1-h32 / scheduled | 12.146 [10.766, 13.050] | 0.701 [0.666, 0.804] | 11.587 [10.527, 12.992] | 0.664 [0.643, 0.721] | 11.218 [10.703, 11.763] | 0.666 [0.645, 0.702] |
| n178-p8-large1-h2048 / profiles | 205.445 [202.304, 213.735] | 2.381 [2.336, 2.768] | 202.740 [195.248, 209.513] | 0.868 [0.849, 0.889] | 201.510 [195.621, 204.101] | 0.814 [0.736, 0.925] |
| n178-p8-large1-h2048 / tags | 25.438 [24.385, 26.944] | 0.379 [0.362, 0.401] | 25.693 [24.408, 26.770] | 0.101 [0.099, 0.119] | 24.176 [23.340, 24.938] | 0.113 [0.094, 0.119] |
| n178-p8-large1-h2048 / tasks | 32.386 [29.793, 33.499] | 1.947 [1.889, 2.195] | 32.571 [29.664, 33.138] | 1.163 [1.102, 1.209] | 29.902 [29.135, 30.945] | 1.171 [1.116, 1.200] |
| n178-p8-large1-h2048 / overdue | 25.377 [24.209, 27.431] | 1.218 [1.182, 1.302] | 25.809 [23.963, 27.887] | 0.702 [0.645, 0.800] | 23.889 [23.109, 26.441] | 0.673 [0.665, 0.753] |
| n178-p8-large1-h2048 / projects | 25.341 [23.447, 27.180] | 0.233 [0.194, 0.301] | 26.030 [23.565, 27.114] | 0.080 [0.076, 0.094] | 24.882 [23.179, 27.797] | 0.090 [0.076, 0.120] |
| n178-p8-large1-h2048 / inbox | 25.878 [23.921, 27.182] | 0.888 [0.830, 0.990] | 26.071 [24.494, 29.631] | 0.768 [0.725, 0.851] | 24.446 [23.120, 26.361] | 0.767 [0.758, 0.935] |
| n178-p8-large1-h2048 / today | 24.453 [23.490, 26.343] | 0.745 [0.694, 0.781] | 24.457 [24.272, 34.256] | 0.651 [0.637, 0.707] | 24.816 [23.487, 25.609] | 0.649 [0.627, 0.838] |
| n178-p8-large1-h2048 / scheduled | 24.884 [23.771, 28.202] | 0.721 [0.708, 0.737] | 25.373 [24.122, 27.501] | 0.722 [0.642, 1.177] | 24.641 [23.390, 25.475] | 0.682 [0.645, 1.122] |
| n178-p8-empty-large0-h2048 / profiles | 130.892 [130.298, 139.590] | 1.756 [1.706, 1.782] | 120.423 [120.339, 122.093] | 0.288 [0.281, 0.340] | 125.035 [119.852, 126.882] | 0.257 [0.232, 0.295] |
| n178-p8-empty-large0-h2048 / tags | 16.378 [13.904, 16.970] | 0.357 [0.347, 0.430] | 15.099 [14.753, 15.477] | 0.104 [0.096, 0.106] | 14.397 [14.175, 15.576] | 0.099 [0.097, 0.101] |
| n178-p8-empty-large0-h2048 / tasks | 17.383 [16.612, 18.259] | 1.913 [1.829, 2.078] | 17.025 [16.557, 18.629] | 1.082 [1.066, 1.103] | 16.701 [15.438, 19.078] | 1.072 [1.038, 1.144] |
| n178-p8-empty-large0-h2048 / overdue | 15.662 [15.468, 16.638] | 1.385 [1.193, 1.568] | 15.059 [14.133, 17.093] | 0.727 [0.603, 0.758] | 15.852 [13.797, 16.870] | 0.698 [0.615, 0.767] |
| n178-p8-empty-large0-h2048 / projects | 17.330 [15.824, 17.692] | 0.255 [0.213, 0.266] | 15.456 [13.909, 15.966] | 0.093 [0.083, 0.235] | 15.220 [14.625, 16.007] | 0.102 [0.100, 0.108] |
| n178-p8-empty-large0-h2048 / inbox | 14.539 [14.209, 17.534] | 0.826 [0.785, 0.847] | 16.051 [14.615, 16.845] | 0.754 [0.739, 0.915] | 14.584 [14.144, 15.713] | 0.734 [0.690, 0.793] |
| n178-p8-empty-large0-h2048 / today | 15.659 [14.665, 15.812] | 0.641 [0.632, 0.686] | 14.992 [14.080, 15.642] | 0.629 [0.607, 0.711] | 15.574 [15.329, 15.999] | 0.597 [0.563, 0.634] |
| n178-p8-empty-large0-h2048 / scheduled | 15.942 [14.156, 16.368] | 0.639 [0.608, 0.651] | 15.296 [14.247, 16.723] | 0.615 [0.595, 0.670] | 16.286 [15.617, 18.027] | 0.571 [0.569, 0.639] |
| n178-p8-empty-large1-h2048 / profiles | 136.085 [134.553, 153.158] | 1.720 [1.676, 1.941] | 126.241 [125.515, 129.788] | 0.301 [0.284, 0.331] | 132.407 [125.081, 134.543] | 0.278 [0.254, 0.327] |
| n178-p8-empty-large1-h2048 / tags | 15.915 [14.610, 16.732] | 0.342 [0.338, 0.563] | 15.260 [14.828, 16.175] | 0.104 [0.096, 0.270] | 16.088 [15.326, 16.711] | 0.102 [0.093, 0.149] |
| n178-p8-empty-large1-h2048 / tasks | 19.294 [17.917, 20.403] | 1.954 [1.882, 2.265] | 16.885 [16.860, 20.959] | 1.195 [1.126, 1.722] | 17.655 [16.363, 19.349] | 1.185 [1.166, 1.319] |
| n178-p8-empty-large1-h2048 / overdue | 16.903 [15.367, 18.079] | 1.475 [1.441, 1.705] | 16.731 [15.298, 17.157] | 0.767 [0.725, 1.030] | 16.047 [15.896, 17.198] | 0.834 [0.686, 0.904] |
| n178-p8-empty-large1-h2048 / projects | 15.460 [14.886, 15.769] | 0.300 [0.253, 0.384] | 15.467 [14.193, 16.842] | 0.092 [0.085, 0.134] | 16.358 [15.203, 17.464] | 0.101 [0.089, 0.160] |
| n178-p8-empty-large1-h2048 / inbox | 16.622 [16.174, 17.520] | 0.955 [0.842, 0.978] | 15.388 [15.024, 18.038] | 0.832 [0.818, 0.849] | 16.491 [15.773, 17.408] | 0.919 [0.740, 0.940] |
| n178-p8-empty-large1-h2048 / today | 16.765 [15.186, 18.152] | 0.730 [0.671, 0.894] | 15.895 [15.610, 17.842] | 0.696 [0.675, 0.700] | 15.969 [14.773, 18.727] | 0.717 [0.636, 0.760] |
| n178-p8-empty-large1-h2048 / scheduled | 15.432 [14.653, 18.892] | 0.702 [0.673, 0.802] | 16.088 [14.942, 17.404] | 0.699 [0.656, 0.726] | 16.262 [15.054, 17.507] | 0.717 [0.703, 0.858] |

Cleanup removed 28 owned closed Bun runtime copies (2482504192 bytes), after lsof checks; the final pre-timing pass found no additional copies. Each driver awaited its owned children and removed scratch HOME/database files. No files outside this worktree's scratch/temporary proof directories were modified.


### Current read-port caller audit

The inventory contains 186 production call/validation/declaration sites across domain, CLI and server. Authority-taking queries validate before using Profile or id fields. Raw storage reads used by bootstrap, replay, mutation, recovery, scheduler and internal generation observation are listed with their trusted selectors. The earlier inventory below describes the previous implementation.

| Production site | Read / validation | Source of Profile and ids |
| --- | --- | --- |
| `apps/server/src/server.ts:519` | `attachments.imageRead(` | Adapter supplies decoded fields before authorization; continuation/recovery consumes only validated private values. |
| `apps/server/src/server.ts:529` | `store.auth.checkRead(read, "read"),` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `apps/server/src/server.ts:620` | `readGraphQuery(` | Adapter supplies decoded fields before authorization; continuation/recovery consumes only validated private values. |
| `apps/server/src/server.ts:627` | `store.auth.checkRead(read, "read"),` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `apps/server/src/server.ts:673` | `commands.readOne(` | Adapter supplies decoded fields before authorization; continuation/recovery consumes only validated private values. |
| `apps/server/src/server.ts:680` | `store.auth.checkRead(read, "read"),` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `apps/server/src/server.ts:887` | `store.auth.subscribe(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `apps/server/src/server.ts:897` | `store.auth.checkRead(read, "read"),` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `apps/server/src/server.ts:960` | `return yield* translate(store.auth.listTokens({ credential }));` | Adapter supplies decoded fields before authorization; continuation/recovery consumes only validated private values. |
| `apps/server/src/server.ts:1015` | `store.auth.ownerRead(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `apps/server/src/server.ts:1021` | `return yield* snapshotResult(store.snapshots.listRead(read));` | Genuine owner authority validated at the port. Snapshot Show id is private fields.snapshot; List has no id. |
| `apps/server/src/server.ts:1028` | `store.auth.ownerRead(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `apps/server/src/server.ts:1034` | `return yield* snapshotResult(store.snapshots.showRead(read));` | Genuine owner authority validated at the port. Snapshot Show id is private fields.snapshot; List has no id. |
| `apps/server/src/task-search-cache-hygiene.ts:6` | `let cursor = yield* store.searchCacheEvents();` | Internal generation/cursor/erasure state; no request Profile or id. |
| `apps/server/src/task-search-cache-hygiene.ts:8` | `const current = yield* store.searchCacheEvents(cursor);` | Internal generation/cursor/erasure state; no request Profile or id. |
| `apps/server/src/sse.ts:27` | `store.auth.subscribe(` | Private checked Profile and subscription fields. Changes cursor is the stream unfolding state; recheck validates the same authority. |
| `apps/server/src/sse.ts:48` | `store.auth.checkRead(read, "read"),` | Private checked Profile and subscription fields. Changes cursor is the stream unfolding state; recheck validates the same authority. |
| `apps/server/src/sse.ts:50` | `const authorize = translate(store.auth.recheckRead(read));` | Private checked Profile and subscription fields. Changes cursor is the stream unfolding state; recheck validates the same authority. |
| `apps/server/src/sse.ts:51` | `const initial = yield* translate(store.snapshots.generation());` | Internal generation/cursor/erasure state; no request Profile or id. |
| `apps/server/src/sse.ts:64` | `const current = yield* translate(store.snapshots.generation());` | Internal generation/cursor/erasure state; no request Profile or id. |
| `apps/server/src/sse.ts:83` | `store.changesRead(read, state.cursor),` | Private checked Profile and subscription fields. Changes cursor is the stream unfolding state; recheck validates the same authority. |
| `packages/domain/src/store/store.ts:209` | `const purged = this.snapshots.purgedIdsSync();` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/store.ts:221` | `tasks: () => readTasks(this.db),` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/store/store.ts:268` | `tasks: readTasks(this.db).filter(` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/store/store.ts:414` | `const tasks = readTasks(this.db).filter(` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/store/store.ts:472` | `const before = readTasks(this.db).find((task) => task.id === target.id);` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/store/store.ts:550` | `readonly tasks = () => attempt(() => readTasks(this.db));` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/store/store.ts:556` | `tasks: new ClientProjection(this.db).tasksForMutation(profile),` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/store/store.ts:568` | `checkedRead(read, "read", this.db).pipe(` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/store/store.ts:569` | `Effect.flatMap((value) => this.graph(value.profile)),` | graphRead delegates with the Profile obtained from validated private authority. |
| `packages/domain/src/store/store.ts:610` | `attempt(() => committedHistory(this.db, profile, after));` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/store/store.ts:613` | `checkedRead(read, "read", this.db).pipe(` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/store/store.ts:614` | `Effect.flatMap((value) => this.committedHistory(value.profile, after)),` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/store/store.ts:623` | `const state = this.snapshots.generationSync();` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/store.ts:628` | `? searchCacheEvents(this.db, cursor.seq)` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/store.ts:741` | `for (const id of this.snapshots.purgedIdsSync())` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/store.ts:849` | `const purged = new Set(this.snapshots.purgedIdsSync());` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/store.ts:1354` | `const tasks = readTasks(this.db);` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/store/store.ts:1366` | `const series = seriesForTask(before, readSeries(this.db));` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/store/store.ts:1531` | `return readTasks(this.db);` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/store/client-projection.ts:37` | `this.metadataAt(readAuthority(read, "read", this.db).profile);` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/store/client-projection.ts:39` | `this.tasksForMutation(readAuthority(read, "read", this.db).profile);` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/store/client-projection.ts:41` | `const value = readAuthority(read, "read", this.db);` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/store/client-projection.ts:43` | `...this.metadataAt(value.profile),` | Query entry validates private authority; nested trusted SQL helpers use the resulting private Profile or checked Profile set. |
| `packages/domain/src/store/client-projection.ts:44` | `tasks: this.tasksForMutation(value.profile),` | Query entry validates private authority; nested trusted SQL helpers use the resulting private Profile or checked Profile set. |
| `packages/domain/src/store/client-projection.ts:49` | `const profiles = readAuthority(read, "profiles", this.db).profiles;` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/store/client-projection.ts:74` | `const profile = readAuthority(read, "read", this.db).profile;` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/store/client-projection.ts:85` | `const profile = readAuthority(read, "read", this.db).profile;` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/task-lookup-error.ts:56` | `: yield* store.auth.checkRead(resolved.read, "read");` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/store/dependency-validation.ts:78` | `? readTasks(db).filter((task) => task.profile_id === profile)` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/store/snapshots.ts:274` | `checkedRead(read, "owner", this.db).pipe(Effect.flatMap(() => this.list()));` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/store/snapshots.ts:276` | `checkedRead(read, "owner", this.db).pipe(` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/store/snapshots.ts:287` | `generationSync() {` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/snapshots.ts:302` | `readonly generation = () => attempt(() => this.generationSync());` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/snapshots.ts:303` | `purgedIdsSync() {` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/snapshots.ts:402` | `const ids = this.purgedIdsSync();` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/snapshots.ts:498` | `generation: this.generationSync().generation,` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/projection.ts:344` | `tasks: readTasks(db),` | Trusted bootstrap/write/replay storage: validated mutation/event/current-row ids. Query wrapper validates authority before using this lower port. |
| `packages/domain/src/auth/auth.ts:123` | `try: () => readAuthority(read, kind, origin),` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/auth/auth.ts:908` | `profiles: (input) => this.profilesWithin(input, boundary),` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:910` | `this.profilesReadWithin(input, schema, fields, boundary),` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:912` | `this.projectionWithin(` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:914` | `(read) => this.projection.catalog(read),` | Query callback passes the genuine authority to the validating projection port. |
| `packages/domain/src/auth/auth.ts:918` | `this.projectionWithin(` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:920` | `(read) => this.projection.metadata(read),` | Query callback passes the genuine authority to the validating projection port. |
| `packages/domain/src/auth/auth.ts:924` | `this.profileSummariesWithin(input, boundary, false),` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:938` | `this.profilesWithin(input);` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:944` | `) => this.profilesReadWithin(input, schema, fields);` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:989` | `readonly read = (input: AccessRequest) => this.readWithin(input);` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:992` | `this.projectionWithin(input, (read) => this.projection.catalog(read));` | Query callback passes the genuine authority to the validating projection port. |
| `packages/domain/src/auth/auth.ts:995` | `this.projectionWithin(input, (read) => this.projection.metadata(read));` | Query callback passes the genuine authority to the validating projection port. |
| `packages/domain/src/auth/auth.ts:1002` | `this.queryWithin(input, schema, fields, (read) => {` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:1003` | `readAuthority(read, "read", this.db);` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/auth/auth.ts:1012` | `this.queryWithin(input, schema, fields, (read) => ({` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:1014` | `data: this.projection.metadata(read),` | Query callback passes the genuine authority to the validating projection port. |
| `packages/domain/src/auth/auth.ts:1022` | `this.queryWithin(input, schema, fields, (read) => ({` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:1024` | `data: this.ports.read(readAuthority(read, "read", this.db).profile),` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/auth/auth.ts:1032` | `this.queryWithin(input, schema, fields, (read) => ({` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:1034` | `data: this.projection.catalog(read),` | Query callback passes the genuine authority to the validating projection port. |
| `packages/domain/src/auth/auth.ts:1042` | `this.queryWithin(` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:1047` | `readAuthority(read, "read", this.db);` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/auth/auth.ts:1057` | `) => checkedRead(read, kind, this.db);` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/auth/auth.ts:1059` | `this.checkRead(read, "read").pipe(` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/auth/auth.ts:1086` | `this.queryWithin(` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:1090` | `(read) => taskHistory(this.db, read),` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:1094` | `this.projectionWithin(input, (read) => this.projection.projects(read));` | Query callback passes the genuine authority to the validating projection port. |
| `packages/domain/src/auth/auth.ts:1097` | `this.projectionWithin(input, (read) => this.projection.tags(read));` | Query callback passes the genuine authority to the validating projection port. |
| `packages/domain/src/auth/auth.ts:1100` | `this.profileSummariesWithin(input);` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:1128` | `return this.projection.profiles(` | Authority made from the single checked visible Profile set. Names, ids and count rows use that set. |
| `packages/domain/src/auth/auth.ts:1140` | `) => this.queryWithin(input, EmptyRead, {}, read, boundary);` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:1197` | `return this.ports.read(` | Authentication-owned boundary/internal read, using captured checked fields and private authority. |
| `packages/domain/src/auth/auth.ts:1198` | `readAuthority(` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `apps/cli/src/main.ts:708` | `const data = yield* readTasks(store, request);` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:796` | `const data = yield* readTasks(store, request, filters).pipe(` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:923` | `const data = yield* readTasks(store, request);` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:1104` | `const data = yield* readTasks(` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:1320` | `const data = yield* readTasks(store, request);` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:1445` | `const data = yield* readTasks(store, request);` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:1510` | `const data = yield* readTasks(store, request);` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:1563` | `const data = yield* readTasks(store, request);` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:1616` | `const graph = yield* readGraph(` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:1701` | `const data = yield* readTasks(store, request);` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:1750` | `const latest = yield* readTasks(store, request);` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:1774` | `const data = yield* readTasks(` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:1803` | `const data = yield* readTasks(` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:1839` | `const data = yield* readTasks(` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:2116` | `: new ClientReads(store).profiles(credential);` | Adapter supplies typed fields before authorization. Shared reader binds them; Snapshot ports receive the genuine owner authority. |
| `apps/cli/src/main.ts:2207` | `.listRead(read)` | Genuine owner authority validated at the port. Snapshot Show id is private fields.snapshot; List has no id. |
| `apps/cli/src/main.ts:2218` | `.showRead(read)` | Genuine owner authority validated at the port. Snapshot Show id is private fields.snapshot; List has no id. |
| `apps/cli/src/main.ts:2259` | `const read = yield* store.auth.ownerRead(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `packages/domain/src/store/diagnostics.ts:119` | `this.restoreGeneration = snapshots.generationSync().generation;` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/diagnostics.ts:166` | `private generation(value: string) {` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/diagnostics.ts:195` | `const generation = yield* this.snapshots.generation();` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/diagnostics.ts:196` | `this.generation(generation.generation);` | Internal generation/cursor/erasure state; no request Profile or id. |
| `packages/domain/src/store/diagnostics.ts:198` | `const pending = yield* this.scheduled.pendingReminders();` | Scheduler-owned rows/state, after owner Diagnostics authorization where exposed. |
| `packages/domain/src/store/history-reads.ts:62` | `const value = readAuthority(read, "read", db);` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/attachment-store.ts:155` | `export function readManagedImage(` | Trusted storage helper: decoded current/source Task id and Attachment metadata; no caller request. |
| `packages/domain/src/attachment-store.ts:209` | `const image = readManagedImage(root, attachment, task.id);` | Trusted storage helper: decoded current/source Task id and Attachment metadata; no caller request. |
| `packages/domain/src/attachment-store.ts:225` | `const image = readManagedImage(root, attachment, source.id);` | Trusted storage helper: decoded current/source Task id and Attachment metadata; no caller request. |
| `packages/domain/src/graph-queries.ts:137` | `const read = yield* store.auth.authorizeRead(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `packages/domain/src/graph-queries.ts:142` | `const authority = yield* store.auth.checkRead(read, "read");` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/graph-queries.ts:146` | `yield* store.graphRead(read),` | Genuine authority; port validates private brand, exact prototype, kind and database. Profile comes only from its private payload. |
| `packages/domain/src/graph-queries.ts:154` | `readGraphQuery(...args).pipe(Effect.map((result) => result.graph));` | Captured request at authorization boundary; graph selection uses private checked Profile and task_id. |
| `packages/domain/src/attachment-commands.ts:56` | `const before = (yield* this.store.tasks()).find(` | Writer uses validated mutation/current Task ids; query selection uses private checked Task and Attachment fields. |
| `packages/domain/src/attachment-commands.ts:468` | `const { read, task } = yield* new TaskCommands(this.store).readOne(` | Writer uses validated mutation/current Task ids; query selection uses private checked Task and Attachment fields. |
| `packages/domain/src/attachment-commands.ts:473` | `const authority = yield* this.store.auth.checkRead(read, "read");` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/attachment-commands.ts:481` | `readManagedImage(` | Private checked fields.task_id and the selected authorized Task Attachment. |
| `packages/domain/src/attachment-commands.ts:491` | `this.imageRead(request, id).pipe(Effect.map((result) => result.image));` | Writer uses validated mutation/current Task ids; query selection uses private checked Task and Attachment fields. |
| `packages/domain/src/client-reads.ts:79` | `this.store.auth.profileSummaries({ credential });` | Boundary binds the supplied request. Planning uses private fields; History binds Task id before check; summaries use checked Profile set. |
| `packages/domain/src/client-reads.ts:82` | `this.store.auth.projects(request);` | Boundary binds the supplied request. Planning uses private fields; History binds Task id before check; summaries use checked Profile set. |
| `packages/domain/src/client-reads.ts:84` | `readonly tags = (request: AccessRequest) => this.store.auth.tags(request);` | Boundary binds the supplied request. Planning uses private fields; History binds Task id before check; summaries use checked Profile set. |
| `packages/domain/src/client-reads.ts:92` | `const { read, data } = yield* this.store.auth.readCatalog(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `packages/domain/src/client-reads.ts:100` | `const selected = (yield* this.store.auth.checkRead(read, "read")).fields;` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/client-reads.ts:152` | `this.store.auth.taskHistory(request);` | Boundary binds the supplied request. Planning uses private fields; History binds Task id before check; summaries use checked Profile set. |
| `packages/domain/src/discovery.ts:40` | `this.store.auth.readSnapshot((auth) =>` | Credential is a primitive string. Directory Profiles come from checked summaries; lookup prefix and Profile set come from the private profiles authority. Per-Profile catalog/metadata reauthorize captured ids. |
| `packages/domain/src/discovery.ts:42` | `const profiles = yield* auth.profileSummaries({ credential });` | Credential is a primitive string. Directory Profiles come from checked summaries; lookup prefix and Profile set come from the private profiles authority. Per-Profile catalog/metadata reauthorize captured ids. |
| `packages/domain/src/discovery.ts:46` | `auth.metadata({ credential, profile: profile.id }).pipe(` | Credential is a primitive string. Directory Profiles come from checked summaries; lookup prefix and Profile set come from the private profiles authority. Per-Profile catalog/metadata reauthorize captured ids. |
| `packages/domain/src/discovery.ts:55` | `yield* auth.profiles({ credential });` | Credential is a primitive string. Directory Profiles come from checked summaries; lookup prefix and Profile set come from the private profiles authority. Per-Profile catalog/metadata reauthorize captured ids. |
| `packages/domain/src/discovery.ts:61` | `this.store.auth.readSnapshot((auth) =>` | Credential is a primitive string. Directory Profiles come from checked summaries; lookup prefix and Profile set come from the private profiles authority. Per-Profile catalog/metadata reauthorize captured ids. |
| `packages/domain/src/discovery.ts:63` | `const { read } = yield* auth.profilesRead(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `packages/domain/src/discovery.ts:68` | `const authority = yield* this.store.auth.checkRead(read, "profiles");` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/discovery.ts:74` | `auth.catalog({ credential, profile: profile.id }).pipe(` | Credential is a primitive string. Directory Profiles come from checked summaries; lookup prefix and Profile set come from the private profiles authority. Per-Profile catalog/metadata reauthorize captured ids. |
| `packages/domain/src/discovery.ts:94` | `yield* auth.profiles({ credential });` | Credential is a primitive string. Directory Profiles come from checked summaries; lookup prefix and Profile set come from the private profiles authority. Per-Profile catalog/metadata reauthorize captured ids. |
| `packages/domain/src/import-tasks.ts:45` | `const { read } = yield* store.auth.readState(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `packages/domain/src/import-tasks.ts:50` | `const authority = yield* store.auth.checkRead(read, "read");` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/import-tasks.ts:56` | `const graph = yield* store.graphRead(read);` | Genuine authority; port validates private brand, exact prototype, kind and database. Profile comes only from its private payload. |
| `packages/domain/src/import-tasks.ts:148` | `const tasks = (yield* store.auth.read(request)).tasks;` | Owned request reconstructed from private checked Profile/credential; Task ids and ImportItems are parsed owned fields. |
| `packages/domain/src/import-tasks.ts:222` | `const data = yield* store.auth.read(request);` | Owned request reconstructed from private checked Profile/credential; Task ids and ImportItems are parsed owned fields. |
| `packages/domain/src/import-tasks.ts:337` | `const currentBlockers = (yield* store.graphRead(read)).edges` | Genuine authority; port validates private brand, exact prototype, kind and database. Profile comes only from its private payload. |
| `packages/domain/src/presentation.ts:39` | `const definition = seriesForTask(task, series);` | Pure presentation: decoded Task and Series; no database authorization input. |
| `packages/domain/src/dependency-commands.ts:134` | `const graph = yield* this.store.graph(identity.profile);` | Trusted writer graph: MutationIdentity.profile/current Task Profile. Request queries use graphRead; raw graph stays internal to existing writer paths. |
| `packages/domain/src/dependency-commands.ts:211` | `const updated = yield* this.store.graph(identity.profile);` | Trusted writer graph: MutationIdentity.profile/current Task Profile. Request queries use graphRead; raw graph stays internal to existing writer paths. |
| `packages/domain/src/commands.ts:155` | `const { read, data } = yield* store.auth.readState(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `packages/domain/src/commands.ts:160` | `const authority = yield* store.auth.checkRead(read, "read");` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/commands.ts:162` | `const graph = yield* store.graphRead(read);` | Genuine authority; port validates private brand, exact prototype, kind and database. Profile comes only from its private payload. |
| `packages/domain/src/commands.ts:358` | `const { read, data: view } = yield* this.store.auth.readMetadata(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `packages/domain/src/commands.ts:363` | `const authority = yield* this.store.auth.checkRead(read, "read");` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/commands.ts:365` | `const graph = yield* this.store.graphRead(read);` | Genuine authority; port validates private brand, exact prototype, kind and database. Profile comes only from its private payload. |
| `packages/domain/src/commands.ts:401` | `const { read, data } = yield* this.store.auth.readMetadata(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `packages/domain/src/commands.ts:406` | `const authority = yield* this.store.auth.checkRead(read, "read");` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/commands.ts:407` | `const graph = yield* this.store.graphRead(read);` | Genuine authority; port validates private brand, exact prototype, kind and database. Profile comes only from its private payload. |
| `packages/domain/src/commands.ts:427` | `this.readOne(request, Schema.Struct({ task_id: TaskId }), {` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:641` | `const graph = yield* this.store.graph(identity.profile);` | Trusted writer graph: MutationIdentity.profile/current Task Profile. Request queries use graphRead; raw graph stays internal to existing writer paths. |
| `packages/domain/src/commands.ts:710` | `const tasks = yield* this.store.tasks();` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:733` | `const edges = (yield* this.store.graph(` | Trusted writer graph: MutationIdentity.profile/current Task Profile. Request queries use graphRead; raw graph stays internal to existing writer paths. |
| `packages/domain/src/commands.ts:784` | `: seriesForTask(before, yield* this.store.series());` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:794` | `seriesForTask(task, [seriesBefore]) !== null &&` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:1002` | `const before = (yield* this.store.tasks()).find(` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:1032` | `(yield* this.store.tasks()).find(` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:1157` | `const data = yield* readTasks(store, request);` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:1205` | `const data = yield* readTasks(store, request);` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:1208` | `const { read, data: checked } = yield* store.auth.readState(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `packages/domain/src/commands.ts:1213` | `const authority = yield* store.auth.checkRead(read, "read");` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/commands.ts:1402` | `const before = (yield* store.tasks()).find(` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:1467` | `const { read, data } = yield* store.auth.readState(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `packages/domain/src/commands.ts:1472` | `const authority = yield* store.auth.checkRead(read, "read");` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/commands.ts:1474` | `const { data: target, read: targetRead } = yield* store.auth.readState(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `packages/domain/src/commands.ts:1511` | `const definition = seriesForTask(` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:1513` | `yield* store.series(),` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:1544` | `? (yield* store.history(entry.seq - 2)).find(` | Writer/Revert recovery: captured sequence, bound Task id or decoded committed event/current Task. |
| `packages/domain/src/commands.ts:1714` | `const definition = seriesForTask(context.before, yield* store.series());` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:1741` | `const definition = seriesForTask(context.before, yield* store.series());` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |
| `packages/domain/src/commands.ts:1761` | `const { read, data } = yield* store.auth.readState(` | Input boundary: captures and parses Profile, credential and fields before the credential-use hook; returns privately bound authority. |
| `packages/domain/src/commands.ts:1766` | `const authority = yield* store.auth.checkRead(read, "read");` | Runtime inspection before consuming private Profile, scope, ids or parsed fields; rejects copies/wrong kind/database. |
| `packages/domain/src/commands.ts:1807` | `const pair = (yield* store.history()).filter(` | Writer/Revert recovery: captured sequence, bound Task id or decoded committed event/current Task. |
| `packages/domain/src/commands.ts:1908` | `(yield* store.tasks()).find(` | Shared read boundary or trusted mutation: selectors come from private bound fields, MutationIdentity, decoded event or current Task, as applicable. |

### Commands and every recorded attempt

All receipts below are local and ignored under `docs/evidence/ui-speed/server-reads/authority-runtime`. Normal binaries use source hash cc2c712bdc4dc30fe7116c31fd31745c3588ae23b21a952000f72d0c07bb54a6 and the product commit above. Their paths, binary hashes and fixed source manifest are retained locally. Sixteen compiled recipes below exit 0. The full Diagnostics recipe exits 1 after its owned Swift-lock wait was cancelled before Swift ran, to honor the explicit no-Swift limit. The same driver with only PNG rendering omitted exits 0; diagnostics-no-swift-3/scope.json records that scope and omission. Exact recipe argv, real exits and signals are in skills/summary.json. The complete cache command passed at docs/evidence/perf-cache/verify-ui6khv/result.json. AtomicCAS passed after review of byte-identical mapped bodies; no model was changed. Cache properties and hygiene controls proved intended failures/restoration/strict checks before stopping at stale mappings, then the full renewed gate passed.

`pnpm --filter @todo/domain test authority-runtime.test.ts read-authorization.test.ts` exits 0. `pnpm typecheck` final exits 0. `bun build --compile .scratch/review-correction/authority-copy-probe.ts --outfile .scratch/bin/authority-copy-final` exits 0; `.scratch/bin/authority-copy-final` exits 1 with the required storage refusal; the no-data companion exits 0. The unchanged C2 probe typechecks with `pnpm exec tsc -p .scratch/review-correction/tsconfig.copy.json`, exit 0, demonstrating that runtime validation rather than nominal typing closes the defect. The S1-C1 probe compile and run both exit 0.

`bun apps/server/scripts/build-read-control.ts after .scratch/bin/read-timing-after` and `bun apps/server/scripts/build-read-boundary.ts .scratch/bin/read-authority-boundary` exit 0. Both `read-control.ts` invocations use .scratch/bin/read-timing-before / .scratch/bin/read-timing-after with checkpoints/fixtures.json or rich-audited/fixtures.json respectively, and exit 0. Mutation invocations use READ_BOUNDARY_MODE=credential or port, READ_BOUNDARY_BINARY=$PWD/.scratch/bin/read-authority-boundary, .scratch/bin/read-timing-after as control and .scratch/bin/read-authority-boundary as candidate; both exit 0. All fixtures are under .scratch/server-reads. `bun apps/server/scripts/read-boundary-concurrency.ts .scratch/bin/read-authority-boundary .scratch/server-reads/rich-audited/fixtures.json <fresh-evidence>` exits 0; READ_BOUNDARY_REFUSAL_ONLY=1 on the same command also exits 0.

`bun .agents/skills/verify-occ-atomicity/check.ts` exits 0. `bun .agents/skills/verify-task-search-cache/build-baseline.mjs ade8f941f3d15c61cffdb58d45114b4ababbcc5e --uncached` and `bun .agents/skills/verify-task-search-cache/verify.mjs ade8f941f3d15c61cffdb58d45114b4ababbcc5e` both exit 0. The oracle archives this exact immutable product and bypasses only its two preparation callbacks. No matcher/model was changed. The root check uses the normal frozen CLI/server overrides, a successful `sh scripts/disk-guard.sh`, then exactly `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`; its receipt is root-10, exit 0 (392 domain, 69 CLI, 32 server, 168 Electron, one existing skip).

Timing commands (both exit 0; COLD_ONLY for the full sweep is the 18 ids in .scratch/server-reads/corners.txt):

```sh
READ_CONTROL_REAL_TIME=1 COLD_PAIRS=5 COLD_FIRST= COLD_ONLY="$(cat .scratch/server-reads/corners.txt)" /usr/bin/lockf -k /tmp/todo-server-read-timing.lock bun .scratch/server-reads/harness/cold-path.ts ambient .scratch/server-reads/checkpoints docs/evidence/ui-speed/server-reads/authority-runtime/benchmark
READ_CONTROL_REAL_TIME=1 COLD_PAIRS=10 COLD_FIRST= COLD_ONLY=n178-p8-empty-large1-h2048 /usr/bin/lockf -k /tmp/todo-server-read-timing.lock bun .scratch/server-reads/runtime-harness/cold-path.ts ambient .scratch/server-reads/checkpoints docs/evidence/ui-speed/server-reads/authority-runtime/overhead-final-3
```

| Compiled recipe command (fresh local evidence argument) | Real exit |
| --- | ---: |
| `sh .agents/skills/verify-op-log/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/op-log` | 0 |
| `sh .agents/skills/verify-auth/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/auth` | 0 |
| `sh .agents/skills/verify-recurrence/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/recurrence` | 0 |
| `sh .agents/skills/verify-server-api/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/server-api` | 0 |
| `sh .agents/skills/verify-server-api/scripts/verify-reads.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/server-reads` | 0 |
| `sh .agents/skills/verify-profiles/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/profiles` | 0 |
| `sh .agents/skills/verify-filters/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/filters` | 0 |
| `sh .agents/skills/verify-snapshots/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/snapshots` | 0 |
| `sh .agents/skills/verify-sse/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/sse .scratch/bin/cc2c712bdc4d-ade8f941f3d1/todo` | 0 |
| `sh .agents/skills/verify-cli/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/cli` | 0 |
| `bun --define TODO_BUILD_ID="ade8f941" .agents/skills/verify-attachments/scripts/drive.ts docs/evidence/ui-speed/server-reads/authority-runtime/skills/attachments` | 0 |
| `bun --define TODO_BUILD_ID="ade8f941" .agents/skills/verify-attachments/scripts/cli01.ts docs/evidence/ui-speed/server-reads/authority-runtime/skills/attachment-groups` | 0 |
| `sh .agents/skills/verify-dag/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/dag` | 0 |
| `sh .agents/skills/verify-dag/scripts/verify-public.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/dag-public` | 0 |
| `sh .agents/skills/verify-discovery/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/discovery` | 0 |
| `sh .agents/skills/verify-import/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/import` | 0 |
| `sh .agents/skills/verify-diagnostics/scripts/verify.sh docs/evidence/ui-speed/server-reads/authority-runtime/skills/diagnostics` | 1 |

| Invocation / receipt | Real exit |
| --- | ---: |
| `atomicity-before-renewal` | 1 |
| `atomicity-final` | 0 |
| `benchmark` | 0 |
| `boundary-build` | 0 |
| `cache-baseline` | 0 |
| `cache-check-before-renewal` | 1 |
| `cache-final` | 0 |
| `cache-hygiene-before-renewal` | 1 |
| `cleanup-before-timing` | 0 |
| `cleanup-final` | 0 |
| `control-56` | 0 |
| `control-rich` | 0 |
| `delivery-disk` | 0 |
| `diagnostics-no-swift-2` | 1 |
| `diagnostics-no-swift-3` | 0 |
| `diagnostics-no-swift` | 1 |
| `doc-links-1` | 0 |
| `doc-links-final` | 0 |
| `domain-after-1` | 0 |
| `domain-after-2` | 1 |
| `domain-after-3` | 0 |
| `domain-after-4` | 0 |
| `domain-after-5` | 0 |
| `domain-after-6` | 0 |
| `domain-after-7` | 0 |
| `domain-before` | 1 |
| `domain-suite-1` | 0 |
| `format-1` | 0 |
| `format-2` | 1 |
| `format-7` | 0 |
| `format-9` | 0 |
| `http-refusal-2` | 0 |
| `http-refusal` | 1 |
| `interleaving` | 0 |
| `mutation-credential` | 0 |
| `mutation-port` | 0 |
| `overhead-final-2` | 70 |
| `overhead-final-3` | 0 |
| `overhead-final` | 1 |
| `overhead-pilot` | 0 |
| `product-build` | 0 |
| `report-gen-1` | 1 |
| `report-gen-2` | 0 |
| `root-10-disk` | 0 |
| `root-10` | 0 |
| `s1-c1-build` | 0 |
| `s1-c1-probe` | 0 |
| `seat-after` | 1 |
| `seat-before` | 1 |
| `seat-build-after` | 0 |
| `seat-build-before` | 0 |
| `seat-build-final` | 0 |
| `seat-final` | 1 |
| `seat-refusal-final` | 0 |
| `seat-source-compare` | 0 |
| `seat-typecheck-final` | 0 |
| `skills` | 1 |
| `timing-analysis` | 0 |
| `timing-build-final` | 0 |
| `timing-build-pilot` | 0 |
| `typecheck-1` | 1 |
| `typecheck-2` | 0 |
| `typecheck-3` | 1 |
| `typecheck-4` | 0 |
| `typecheck-5` | 1 |
| `typecheck-6` | 0 |
| `typecheck-7` | 0 |
| `typecheck-8` | 0 |

The no-Swift Diagnostics helper first used a scratch prefix refused by the seeder (exit 1); the next attempt omitted the seed binary needed by Purge (exit 1). The third attempt uses the required todo-s01-verify-* prefix and copies the frozen seed, without weakening any guard. The full Diagnostics rendering step is deliberately unproved. The timing rerun uses `.scratch/server-reads/runtime-harness/cold-path.ts`, copied from the prepared original harness with only the binary selectors and both-variant zero-decode assertion changed. Before selects .scratch/bin/authority-overhead-before (preserved 219749f2); after selects .scratch/bin/read-timing-after (ade8f941). The unused copied candidate was retired only after lsof showed no open file; its 90,695,522-byte hash receipt is retired-unused-copy.json.

The HTTP refusal control first failed because its literal omitted the existing exit_code/exit_meaning fields; the corrected exact body passes. A positive changes assertion initially expected one Work operation, but issuing its Token also commits AuthChanged; the correct literal is two Work entries. Typecheck iterations caught a heterogeneous Effect union, unused locals and an unknown Effect context. Formatting caught a restricted local name, then passed after renaming. An exploratory source-body comparison named a nonexistent runner file (exit 1); the corrected comparison uses the protected manifest paths and passes. An rm-style command was rejected before execution; the final proof needs no removal and completed safely. Formatter iterations 3, 4 and 6 log an error, but their individual statuses were not captured because their wrappers continued into passing tests; their enclosing commands exit 0. Iterations 5 and 8 likewise lack individual status receipts, with no errors in their logs. The final formatter/root gates have captured exit 0. The paired five-pair pilot was exploratory. Incremental timing attempt 1 exits 1 after the copied candidate produced no startup output for 60 seconds (one unpaired baseline observation). A helper edit then failed its exact-string assertion; its shell continued into attempt 2, which was stopped before measurement and exits 70. The helper was corrected to use the identical already-proven compiled path; attempt 3 exits 0 with all 20 complete pairs. All failed/incomplete attempts are retained and excluded as incomplete experiments, not discarded valid pairs. Final timings above are the delivery comparison. One report-generator attempt failed on quoting a code fence (exit 1); the corrected generator exits 0. No failed attempt is counted as a pass.

No children, native app, Swift, Keychain, signing, real Todo database, push, merge or PR was used. All Tasks, credentials, SQLite files, outputs and servers belong to scratch. No custom Python workaround supplied missing CLI behavior. No ADR was changed or contradicted. Direct no-comments review was used under the explicit no-children limit. Cleanup and process receipts are local; final disk and removed-runtime-copy counts are recorded in the timing/cleanup section above.

## Prior delivery record

## Authorization revision after review

Product: `219749f2ab4ed40fdf7f257c991385a2057bf215`. Base delivery reviewed: `98511eff3673239ae4edd6432a1c40c2f90f6080`. Contract remains `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`.

The unchanged seat probe failed with exit 1 on both exact e69230f9 product sources and 98511eff. List, Show and graph returned work-more data under a work-scoped Token. The hole was inherited. The same unchanged compiled probe passes with exit 0 on this product; its graph and Show return ab-prefix in work. The copied probe bytes are unchanged; only its private fixture paths were relocated. All databases and credentials remain scratch-only.

[ReadAuthority](../../../packages/domain/src/auth/authorized-read.ts) is a nominal value with a frozen Profile, checked credential scope and owned, parsed, recursively frozen fields. Credential secrets use private fields. Raw AccessRequest objects cannot satisfy the graph, stream or owner Snapshot read-port types. The auth transaction constructs the value after the credential check, then executes its projection callback with it. Graph/search continuations, Show and image selection, History, planning filters, lookup prefix, Quick-add payload, Snapshot id and stream subscription use those bound values through later hooks and yields. Missing-Task recovery also uses the bound Profile and id. The full-state readers used by import, transfer metadata and Revert retain their authorization/check ordering while owning their read inputs.

Profile summaries now count exactly the checked Profile rows and ids. The grouped SELECT starts from those ids through json_each; it does not ask the credential to rediscover a visible set. A literal control inserts a new Profile during the second credential-use callback: the current reply contains only work, while the next storage read proves late was inserted. Profile names/timestamps come from the checked rows too.

### Mutation and overlap controls

The new domain regression preceded the implementation. It failed at the literal scoped-Task assertion, then passed for list/search, Show, graph, views and History with the real credential-use callback or graph hook mutating the caller's Profile, Task id and filters. A separate same-Profile Task id mutation proves History retains the requested id. Runtime Reflect.set checks prove the authority and nested arrays/filters are frozen without freezing the caller. Compile-time assertions reject a raw AccessRequest at graph, stream and owner Snapshot ports.

The compiled verification server wraps actual decoded handler arguments. It mutates them from the real diagnostics callback, or immediately after construction of the checked value and at graph/Snapshot/stream ports. It runs no replacement auth or query algorithm. Each mode compares all 1,267 lifecycle reply/status pairs and auth evidence with an uninstrumented candidate. Receipts require actual mutations of Profile, Task, Attachment and Snapshot ids, lookup prefix and quick-add text; they also list view, time and stream generation/cursor mutations by handler shape. Successful Snapshot Show and managed PNG bytes are included. Diagnostics' volatile process fields retain the original exclusion.

The same compiled server runs two scoped Tokens for different Profiles concurrently. Ten request pairs per mode return the literal aa-work/work and aa-personal/personal results. A graph-port delay forces overlap. Every mode records ten overlaps; both mutation modes record actual changed fields. The final run has 60 successful responses across normal, credential-callback and port-hook modes. No process-wide current-authorization variable exists.

The complete e69230f9-to-candidate differential was repeated on all 57 fixtures: 23,880 original-checkpoint pairs plus 1,267 lifecycle pairs, 25,147 per side, with byte-identical replies and equal auth evidence. Root attempt 9 ran the exact standing lock after the disk guard and exited 0: 391 domain, 69 CLI, 32 server and 168 Electron tests, one existing skip.

### Paired timings on the repaired product

The same 18 corners, two request orders, five alternating fresh-process pairs and three passes produced 8,640 validated HTTP 200 responses. Every candidate observation decoded zero operation entries. These instrumented handler intervals are medians with min/max ranges in milliseconds. Both binaries use real clocks and the normal scheduler. The sweep ran after this worker's builds and functional/formal checks ended, under one-minute boundary loads 1.89 to 2.94 on 10 logical CPUs. No pressure workers or settings changed. Host activity from other work was uncontrolled. The limiter removed remains unrelated operation materialization, with the earlier independent CPU profile and current decode counters as evidence; the separate post-fix CPU shares are not measured. First pass is each route's first call in that process and may benefit from earlier routes. Warm is pass two. No input-to-render or p99 claim follows.

On the synthetic 178-total-Task/eight-Profile/2,234-operation owner shape, warm /profiles was 120.12 [119.49, 124.83] ms before and 0.28 [0.27, 0.29] ms after. The eight-handler sum was 228.28 [227.87, 235.30] ms before and 4.42 [4.18, 4.56] ms after.

| Fixture | Warm /profiles before | After | Warm eight-handler sum before | After |
| --- | --- | --- | --- | --- |
| n15-p1-large0-h32 | 0.77 [0.72, 0.92] | 0.13 [0.13, 0.17] | 4.55 [4.25, 6.03] | 1.44 [1.34, 1.48] |
| n15-p1-large0-h2048 | 11.49 [10.82, 20.66] | 0.12 [0.12, 0.14] | 96.02 [92.14, 107.92] | 1.08 [1.06, 1.31] |
| n15-p1-large1-h32 | 0.96 [0.91, 0.98] | 0.13 [0.12, 0.14] | 7.64 [7.48, 8.02] | 3.23 [3.20, 3.52] |
| n15-p1-large1-h2048 | 11.56 [10.49, 16.96] | 0.13 [0.11, 0.17] | 93.50 [92.89, 96.20] | 1.59 [1.48, 1.99] |
| n15-p8-large0-h32 | 8.15 [7.83, 8.61] | 0.23 [0.23, 0.24] | 16.22 [15.47, 17.77] | 1.24 [1.22, 1.31] |
| n15-p8-large0-h2048 | 93.23 [90.27, 96.20] | 0.23 [0.22, 0.25] | 178.53 [173.16, 192.80] | 1.16 [1.12, 1.45] |
| n15-p8-large1-h32 | 13.21 [12.15, 15.37] | 0.23 [0.23, 0.25] | 23.88 [23.18, 26.59] | 3.45 [3.30, 3.52] |
| n15-p8-large1-h2048 | 95.69 [93.89, 98.59] | 0.25 [0.23, 0.28] | 181.67 [178.17, 183.33] | 1.67 [1.54, 1.76] |
| n178-p1-large0-h32 | 1.60 [1.55, 1.70] | 0.23 [0.20, 0.24] | 16.44 [15.89, 17.15] | 4.05 [3.93, 4.11] |
| n178-p1-large0-h2048 | 16.52 [15.44, 18.70] | 0.20 [0.19, 0.21] | 123.10 [118.40, 124.50] | 3.91 [3.73, 4.00] |
| n178-p1-large1-h32 | 1.97 [1.93, 1.99] | 0.22 [0.20, 0.30] | 19.49 [19.34, 19.77] | 5.82 [5.67, 6.59] |
| n178-p1-large1-h2048 | 15.56 [15.02, 17.36] | 0.21 [0.20, 0.23] | 127.77 [124.47, 129.56] | 4.41 [4.08, 4.50] |
| n178-p8-large0-h32 | 84.92 [82.84, 88.14] | 0.87 [0.84, 0.90] | 166.66 [166.20, 170.49] | 4.53 [4.45, 4.62] |
| n178-p8-large0-h2048 | 196.49 [192.75, 200.35] | 0.80 [0.79, 0.82] | 372.43 [371.13, 378.77] | 4.34 [4.19, 4.40] |
| n178-p8-large1-h32 | 87.55 [86.49, 88.96] | 0.90 [0.85, 1.33] | 172.33 [165.85, 175.13] | 7.84 [6.93, 7.88] |
| n178-p8-large1-h2048 | 194.09 [193.03, 200.18] | 0.86 [0.82, 0.92] | 367.31 [362.57, 378.76] | 4.89 [4.70, 5.38] |
| n178-p8-empty-large0-h2048 | 120.31 [118.02, 122.37] | 0.30 [0.26, 0.30] | 228.53 [226.11, 233.57] | 4.14 [4.08, 5.34] |
| n178-p8-empty-large1-h2048 | 120.12 [119.49, 124.83] | 0.28 [0.27, 0.29] | 228.28 [227.87, 235.30] | 4.42 [4.18, 4.56] |

| Fixture / route | First pass before | After | Warm before | After | Profiles-last warm before | After |
| --- | --- | --- | --- | --- | --- | --- |
| n15-p1-large0-h32 / profiles | 2.38 [2.27, 2.68] | 1.40 [1.35, 1.57] | 0.77 [0.72, 0.92] | 0.13 [0.13, 0.17] | 0.47 [0.46, 2.13] | 0.13 [0.12, 0.22] |
| n15-p1-large0-h32 / tags | 0.94 [0.86, 0.96] | 0.33 [0.32, 0.36] | 0.52 [0.49, 0.53] | 0.10 [0.09, 0.11] | 0.63 [0.54, 0.69] | 0.10 [0.08, 0.37] |
| n15-p1-large0-h32 / tasks | 1.36 [1.33, 1.50] | 0.87 [0.84, 0.91] | 0.64 [0.61, 0.77] | 0.27 [0.26, 0.31] | 0.67 [0.64, 0.75] | 0.31 [0.28, 0.59] |
| n15-p1-large0-h32 / overdue | 1.00 [0.97, 1.03] | 0.58 [0.54, 0.78] | 0.51 [0.49, 0.56] | 0.23 [0.18, 0.25] | 0.55 [0.49, 0.60] | 0.20 [0.18, 0.74] |
| n15-p1-large0-h32 / projects | 0.68 [0.65, 0.76] | 0.20 [0.17, 0.24] | 0.48 [0.47, 0.51] | 0.09 [0.08, 0.12] | 0.48 [0.45, 0.51] | 0.11 [0.07, 0.39] |
| n15-p1-large0-h32 / inbox | 0.61 [0.58, 0.62] | 0.28 [0.28, 0.29] | 0.52 [0.47, 0.56] | 0.22 [0.21, 0.25] | 0.52 [0.51, 0.60] | 0.28 [0.22, 0.71] |
| n15-p1-large0-h32 / today | 0.67 [0.57, 0.78] | 0.21 [0.20, 0.25] | 0.46 [0.43, 0.48] | 0.17 [0.16, 0.23] | 0.44 [0.43, 0.51] | 0.23 [0.18, 0.63] |
| n15-p1-large0-h32 / scheduled | 0.63 [0.59, 0.85] | 0.21 [0.21, 0.29] | 0.46 [0.44, 2.11] | 0.16 [0.15, 0.19] | 0.45 [0.43, 0.47] | 0.17 [0.16, 0.32] |
| n15-p1-large0-h2048 / profiles | 15.69 [13.41, 18.55] | 1.47 [1.45, 1.54] | 11.49 [10.82, 20.66] | 0.12 [0.12, 0.14] | 12.03 [11.71, 13.12] | 0.12 [0.10, 0.17] |
| n15-p1-large0-h2048 / tags | 14.89 [14.04, 20.49] | 0.35 [0.33, 0.36] | 12.09 [11.31, 13.20] | 0.09 [0.09, 0.13] | 10.73 [10.56, 10.93] | 0.09 [0.09, 0.13] |
| n15-p1-large0-h2048 / tasks | 13.93 [13.62, 19.86] | 0.79 [0.79, 0.81] | 12.30 [12.03, 12.94] | 0.21 [0.20, 0.24] | 12.31 [12.18, 12.56] | 0.23 [0.22, 0.35] |
| n15-p1-large0-h2048 / overdue | 12.19 [11.93, 13.13] | 0.53 [0.53, 0.57] | 11.08 [10.65, 11.66] | 0.15 [0.14, 0.17] | 11.99 [11.74, 12.07] | 0.15 [0.14, 0.23] |
| n15-p1-large0-h2048 / projects | 13.97 [12.22, 16.03] | 0.18 [0.17, 0.25] | 12.68 [11.92, 13.01] | 0.07 [0.06, 0.08] | 10.76 [10.64, 10.98] | 0.08 [0.07, 0.10] |
| n15-p1-large0-h2048 / inbox | 13.41 [11.98, 15.34] | 0.22 [0.21, 0.25] | 12.35 [10.56, 12.73] | 0.17 [0.16, 0.20] | 11.92 [11.62, 12.25] | 0.19 [0.17, 0.25] |
| n15-p1-large0-h2048 / today | 11.28 [10.75, 12.13] | 0.17 [0.16, 0.17] | 11.97 [11.09, 12.44] | 0.14 [0.14, 0.22] | 10.48 [10.20, 12.03] | 0.17 [0.13, 0.17] |
| n15-p1-large0-h2048 / scheduled | 12.61 [12.28, 21.88] | 0.17 [0.17, 0.26] | 12.83 [11.88, 13.62] | 0.14 [0.13, 0.23] | 12.19 [11.28, 12.24] | 0.15 [0.14, 0.17] |
| n15-p1-large1-h32 / profiles | 2.89 [2.83, 3.20] | 1.47 [1.43, 1.48] | 0.96 [0.91, 0.98] | 0.13 [0.12, 0.14] | 0.78 [0.74, 0.80] | 0.15 [0.13, 0.16] |
| n15-p1-large1-h32 / tags | 1.34 [1.28, 1.41] | 0.34 [0.34, 0.43] | 0.80 [0.78, 0.93] | 0.09 [0.09, 0.09] | 0.84 [0.79, 0.92] | 0.09 [0.08, 0.10] |
| n15-p1-large1-h32 / tasks | 3.48 [3.25, 3.50] | 1.00 [0.95, 1.02] | 1.02 [0.96, 1.07] | 0.35 [0.34, 0.37] | 1.01 [0.94, 1.09] | 0.38 [0.36, 0.40] |
| n15-p1-large1-h32 / overdue | 1.41 [1.38, 1.58] | 0.67 [0.64, 0.72] | 1.78 [1.41, 1.93] | 0.28 [0.27, 0.31] | 0.79 [0.76, 0.82] | 0.28 [0.27, 0.34] |
| n15-p1-large1-h32 / projects | 0.98 [0.96, 1.03] | 0.19 [0.18, 0.20] | 0.86 [0.84, 1.06] | 0.07 [0.07, 0.08] | 1.88 [1.79, 1.97] | 0.08 [0.07, 0.10] |
| n15-p1-large1-h32 / inbox | 1.01 [0.94, 1.09] | 0.37 [0.36, 0.40] | 0.81 [0.75, 0.93] | 0.26 [0.25, 0.27] | 0.98 [0.94, 1.05] | 0.31 [0.27, 0.32] |
| n15-p1-large1-h32 / today | 1.18 [1.12, 2.40] | 0.30 [0.29, 0.37] | 0.70 [0.69, 0.81] | 1.73 [1.67, 1.88] | 0.74 [0.72, 0.77] | 1.67 [1.63, 1.79] |
| n15-p1-large1-h32 / scheduled | 2.04 [1.18, 2.41] | 0.31 [0.29, 0.33] | 0.72 [0.69, 0.77] | 0.35 [0.32, 0.40] | 0.73 [0.72, 0.76] | 0.33 [0.30, 0.37] |
| n15-p1-large1-h2048 / profiles | 16.27 [15.56, 16.66] | 1.46 [1.43, 1.47] | 11.56 [10.49, 16.96] | 0.13 [0.11, 0.17] | 11.76 [11.46, 12.17] | 0.11 [0.10, 0.16] |
| n15-p1-large1-h2048 / tags | 12.62 [12.39, 14.96] | 0.34 [0.34, 0.35] | 11.73 [11.26, 13.24] | 0.09 [0.08, 0.10] | 11.20 [11.11, 12.76] | 0.08 [0.08, 0.10] |
| n15-p1-large1-h2048 / tasks | 13.13 [12.74, 13.49] | 0.89 [0.87, 0.95] | 12.43 [11.96, 12.48] | 0.32 [0.30, 0.34] | 13.49 [11.96, 13.58] | 0.32 [0.31, 0.33] |
| n15-p1-large1-h2048 / overdue | 13.38 [13.17, 13.91] | 0.63 [0.61, 0.65] | 11.12 [10.68, 11.21] | 0.23 [0.23, 0.46] | 11.89 [10.63, 12.02] | 0.23 [0.22, 0.27] |
| n15-p1-large1-h2048 / projects | 13.53 [13.26, 14.21] | 0.17 [0.17, 0.26] | 11.78 [11.68, 12.17] | 0.07 [0.06, 0.13] | 10.77 [10.50, 11.58] | 0.07 [0.07, 0.10] |
| n15-p1-large1-h2048 / inbox | 12.27 [11.93, 14.36] | 0.32 [0.30, 0.42] | 10.84 [10.76, 10.99] | 0.27 [0.24, 0.32] | 11.73 [11.53, 12.22] | 0.26 [0.26, 0.29] |
| n15-p1-large1-h2048 / today | 12.27 [11.09, 13.00] | 0.26 [0.25, 1.65] | 11.93 [11.76, 12.33] | 0.23 [0.22, 0.27] | 10.62 [10.32, 13.65] | 0.22 [0.21, 0.23] |
| n15-p1-large1-h2048 / scheduled | 12.44 [11.99, 13.35] | 0.28 [0.26, 0.44] | 10.77 [10.60, 12.26] | 0.22 [0.20, 0.25] | 11.71 [10.70, 12.23] | 0.22 [0.19, 1.48] |
| n15-p8-large0-h32 / profiles | 12.97 [12.82, 13.05] | 1.62 [1.54, 1.63] | 8.15 [7.83, 8.61] | 0.23 [0.23, 0.24] | 8.54 [8.27, 9.49] | 0.21 [0.20, 0.21] |
| n15-p8-large0-h32 / tags | 1.33 [1.30, 1.54] | 0.33 [0.33, 0.35] | 1.04 [0.96, 2.46] | 0.09 [0.09, 0.09] | 1.18 [1.11, 1.29] | 0.09 [0.09, 0.11] |
| n15-p8-large0-h32 / tasks | 1.96 [1.88, 2.00] | 0.81 [0.78, 0.82] | 2.45 [1.32, 2.48] | 0.22 [0.22, 0.23] | 1.36 [1.33, 1.49] | 0.25 [0.24, 0.26] |
| n15-p8-large0-h32 / overdue | 1.43 [1.40, 1.62] | 0.55 [0.55, 0.57] | 1.05 [0.97, 1.12] | 0.15 [0.14, 0.17] | 1.01 [1.00, 1.17] | 0.15 [0.15, 0.16] |
| n15-p8-large0-h32 / projects | 1.11 [1.08, 1.28] | 0.18 [0.17, 0.30] | 0.94 [0.93, 1.05] | 0.07 [0.06, 0.07] | 1.02 [0.96, 1.09] | 0.07 [0.07, 0.12] |
| n15-p8-large0-h32 / inbox | 1.06 [1.02, 1.20] | 0.24 [0.23, 0.27] | 1.00 [1.00, 1.10] | 0.20 [0.18, 0.21] | 1.20 [1.14, 1.32] | 0.18 [0.18, 0.22] |
| n15-p8-large0-h32 / today | 1.03 [0.98, 2.33] | 0.18 [0.17, 0.20] | 0.95 [0.94, 1.07] | 0.14 [0.14, 0.14] | 1.02 [0.98, 1.09] | 0.16 [0.16, 0.17] |
| n15-p8-large0-h32 / scheduled | 2.35 [1.42, 2.41] | 0.18 [0.17, 0.18] | 0.93 [0.92, 1.05] | 0.14 [0.13, 0.20] | 1.00 [0.98, 1.14] | 0.14 [0.13, 0.17] |
| n15-p8-large0-h2048 / profiles | 103.31 [96.63, 104.29] | 1.59 [1.57, 1.65] | 93.23 [90.27, 96.20] | 0.23 [0.22, 0.25] | 96.17 [93.38, 97.65] | 0.20 [0.19, 0.21] |
| n15-p8-large0-h2048 / tags | 12.07 [11.43, 12.33] | 0.35 [0.34, 0.36] | 12.36 [11.89, 12.75] | 0.09 [0.08, 0.12] | 11.76 [11.55, 14.19] | 0.09 [0.09, 0.10] |
| n15-p8-large0-h2048 / tasks | 13.51 [13.25, 13.89] | 0.75 [0.74, 0.79] | 12.83 [11.04, 13.39] | 0.21 [0.20, 0.24] | 12.96 [11.80, 14.05] | 0.22 [0.22, 0.22] |
| n15-p8-large0-h2048 / overdue | 12.00 [11.32, 13.37] | 0.53 [0.51, 0.54] | 11.74 [11.31, 12.63] | 0.14 [0.13, 0.16] | 12.18 [11.40, 12.81] | 0.15 [0.14, 0.15] |
| n15-p8-large0-h2048 / projects | 13.35 [11.44, 13.44] | 0.18 [0.17, 0.20] | 13.09 [10.55, 13.49] | 0.07 [0.06, 0.08] | 11.91 [10.91, 12.81] | 0.07 [0.07, 0.08] |
| n15-p8-large0-h2048 / inbox | 13.00 [10.60, 13.62] | 0.22 [0.21, 0.29] | 11.41 [10.67, 11.99] | 0.17 [0.16, 0.27] | 12.07 [11.32, 12.94] | 0.17 [0.16, 0.17] |
| n15-p8-large0-h2048 / today | 12.00 [11.90, 12.10] | 0.17 [0.16, 0.21] | 12.16 [11.84, 15.95] | 0.13 [0.13, 0.17] | 12.37 [11.96, 12.69] | 0.13 [0.12, 0.14] |
| n15-p8-large0-h2048 / scheduled | 11.22 [11.18, 12.95] | 0.17 [0.16, 0.19] | 12.01 [11.09, 16.95] | 0.13 [0.12, 0.15] | 11.90 [11.34, 12.75] | 0.13 [0.12, 0.13] |
| n15-p8-large1-h32 / profiles | 16.21 [15.56, 16.71] | 1.59 [1.58, 1.61] | 13.21 [12.15, 15.37] | 0.23 [0.23, 0.25] | 12.45 [11.12, 12.62] | 0.24 [0.23, 0.26] |
| n15-p8-large1-h32 / tags | 2.66 [1.60, 2.85] | 0.33 [0.32, 0.34] | 1.29 [1.23, 2.21] | 0.08 [0.08, 0.10] | 1.49 [1.34, 1.52] | 0.09 [0.08, 0.11] |
| n15-p8-large1-h32 / tasks | 2.54 [2.39, 3.58] | 0.87 [0.85, 1.01] | 1.71 [1.59, 2.70] | 0.33 [0.30, 0.35] | 2.86 [2.70, 3.17] | 0.34 [0.33, 0.43] |
| n15-p8-large1-h32 / overdue | 1.71 [1.66, 1.89] | 0.63 [0.62, 0.68] | 1.27 [1.19, 1.32] | 1.73 [1.68, 1.84] | 1.31 [1.26, 1.55] | 1.77 [1.68, 2.03] |
| n15-p8-large1-h32 / projects | 1.56 [1.37, 2.42] | 0.20 [0.19, 0.25] | 1.22 [1.20, 2.41] | 0.15 [0.12, 0.15] | 1.22 [1.19, 1.36] | 0.15 [0.12, 0.16] |
| n15-p8-large1-h32 / inbox | 2.52 [1.45, 2.82] | 0.35 [0.33, 0.37] | 1.66 [1.27, 2.33] | 0.37 [0.32, 0.39] | 2.42 [1.39, 2.63] | 0.32 [0.31, 0.37] |
| n15-p8-large1-h32 / today | 1.37 [1.32, 1.43] | 0.28 [0.26, 0.30] | 1.38 [1.22, 1.55] | 0.28 [0.27, 0.32] | 1.44 [1.30, 4.01] | 0.26 [0.22, 0.27] |
| n15-p8-large1-h32 / scheduled | 1.37 [1.33, 1.52] | 0.28 [0.26, 0.29] | 1.24 [1.22, 1.41] | 0.22 [0.21, 0.23] | 1.32 [1.26, 1.51] | 0.21 [0.20, 0.22] |
| n15-p8-large1-h2048 / profiles | 105.02 [103.52, 109.19] | 1.59 [1.57, 1.62] | 95.69 [93.89, 98.59] | 0.25 [0.23, 0.28] | 93.82 [93.62, 95.23] | 0.20 [0.18, 0.21] |
| n15-p8-large1-h2048 / tags | 14.05 [11.92, 14.45] | 0.35 [0.34, 0.36] | 11.59 [11.33, 14.10] | 0.10 [0.09, 0.11] | 12.55 [12.18, 12.92] | 0.09 [0.09, 0.09] |
| n15-p8-large1-h2048 / tasks | 12.71 [12.24, 14.97] | 0.88 [0.85, 1.13] | 13.02 [12.54, 13.85] | 0.30 [0.29, 0.33] | 11.86 [11.48, 13.05] | 0.31 [0.31, 0.38] |
| n15-p8-large1-h2048 / overdue | 13.01 [12.94, 14.31] | 0.65 [0.62, 1.95] | 11.56 [11.36, 12.54] | 0.23 [0.20, 0.24] | 12.33 [11.29, 12.50] | 0.24 [0.23, 0.29] |
| n15-p8-large1-h2048 / projects | 11.38 [11.29, 13.28] | 0.17 [0.17, 0.27] | 11.88 [11.29, 13.67] | 0.07 [0.06, 0.08] | 11.31 [10.99, 13.15] | 0.07 [0.07, 0.10] |
| n15-p8-large1-h2048 / inbox | 12.44 [11.54, 12.70] | 0.35 [0.30, 0.36] | 12.06 [11.21, 12.45] | 0.26 [0.23, 0.27] | 12.48 [11.74, 12.59] | 0.25 [0.23, 0.28] |
| n15-p8-large1-h2048 / today | 12.69 [11.10, 12.90] | 0.26 [0.24, 0.30] | 11.88 [11.25, 12.65] | 0.23 [0.20, 0.25] | 11.79 [11.26, 13.40] | 0.23 [0.21, 0.26] |
| n15-p8-large1-h2048 / scheduled | 12.79 [11.44, 12.88] | 0.26 [0.24, 0.34] | 12.18 [11.16, 12.90] | 0.23 [0.19, 0.25] | 11.95 [10.99, 12.84] | 0.22 [0.19, 0.23] |
| n178-p1-large0-h32 / profiles | 3.89 [3.80, 3.92] | 1.52 [1.51, 1.58] | 1.60 [1.55, 1.70] | 0.23 [0.20, 0.24] | 1.66 [1.61, 1.68] | 0.19 [0.18, 0.22] |
| n178-p1-large0-h32 / tags | 3.92 [3.82, 4.10] | 0.36 [0.35, 0.40] | 2.72 [2.63, 2.93] | 0.10 [0.08, 0.11] | 1.55 [1.54, 1.67] | 0.10 [0.09, 0.11] |
| n178-p1-large0-h32 / tasks | 3.67 [3.51, 3.92] | 2.00 [1.96, 2.41] | 2.60 [2.56, 2.72] | 1.08 [1.08, 1.12] | 3.63 [3.55, 4.19] | 1.14 [1.11, 1.17] |
| n178-p1-large0-h32 / overdue | 2.18 [2.13, 2.25] | 1.15 [1.14, 1.19] | 1.63 [1.57, 1.77] | 0.65 [0.64, 0.66] | 1.71 [1.70, 1.82] | 0.66 [0.64, 0.72] |
| n178-p1-large0-h32 / projects | 1.88 [1.81, 3.17] | 0.21 [0.21, 0.22] | 1.53 [1.49, 2.74] | 0.08 [0.08, 0.09] | 1.54 [1.53, 1.71] | 0.10 [0.09, 0.16] |
| n178-p1-large0-h32 / inbox | 3.09 [2.03, 3.18] | 0.80 [0.79, 2.46] | 2.82 [1.82, 3.02] | 0.69 [0.68, 0.71] | 1.80 [1.70, 2.73] | 0.69 [0.67, 0.84] |
| n178-p1-large0-h32 / today | 1.72 [1.67, 1.73] | 2.20 [0.87, 2.32] | 1.72 [1.65, 1.81] | 0.58 [0.58, 0.64] | 2.75 [1.65, 2.88] | 0.58 [0.57, 0.63] |
| n178-p1-large0-h32 / scheduled | 1.67 [1.62, 1.71] | 0.69 [0.68, 0.75] | 1.61 [1.54, 1.70] | 0.58 [0.56, 0.63] | 1.77 [1.64, 1.79] | 0.66 [0.56, 0.73] |
| n178-p1-large0-h2048 / profiles | 19.99 [19.43, 20.51] | 1.53 [1.52, 1.74] | 16.52 [15.44, 18.70] | 0.20 [0.19, 0.21] | 16.29 [14.46, 17.01] | 0.17 [0.17, 0.22] |
| n178-p1-large0-h2048 / tags | 18.08 [16.90, 19.71] | 0.36 [0.35, 0.40] | 14.22 [13.71, 15.13] | 0.09 [0.09, 0.10] | 16.65 [14.31, 16.85] | 0.09 [0.09, 0.12] |
| n178-p1-large0-h2048 / tasks | 20.60 [18.71, 22.08] | 1.81 [1.74, 1.92] | 15.42 [14.84, 15.63] | 1.05 [1.02, 1.07] | 16.07 [15.48, 18.11] | 1.08 [1.04, 1.17] |
| n178-p1-large0-h2048 / overdue | 15.60 [14.63, 16.49] | 1.35 [1.30, 1.43] | 15.41 [14.90, 16.73] | 0.61 [0.60, 0.63] | 15.02 [14.66, 16.13] | 0.62 [0.61, 0.87] |
| n178-p1-large0-h2048 / projects | 16.74 [15.27, 16.95] | 0.27 [0.23, 0.27] | 15.22 [13.96, 15.57] | 0.08 [0.08, 0.09] | 15.43 [15.23, 16.93] | 0.09 [0.08, 0.14] |
| n178-p1-large0-h2048 / inbox | 15.68 [15.41, 17.34] | 0.78 [0.75, 0.83] | 14.40 [14.20, 15.41] | 0.67 [0.64, 0.77] | 15.59 [14.30, 16.04] | 0.70 [0.66, 2.17] |
| n178-p1-large0-h2048 / today | 15.02 [14.65, 15.67] | 0.62 [0.59, 0.63] | 14.63 [14.31, 16.00] | 0.56 [0.54, 0.61] | 15.23 [14.98, 15.55] | 0.60 [0.59, 0.75] |
| n178-p1-large0-h2048 / scheduled | 15.56 [14.80, 17.04] | 0.60 [0.59, 0.63] | 16.54 [14.21, 16.71] | 0.58 [0.56, 0.60] | 15.65 [14.87, 16.67] | 0.59 [0.55, 0.63] |
| n178-p1-large1-h32 / profiles | 5.82 [5.65, 6.04] | 1.54 [1.52, 1.55] | 1.97 [1.93, 1.99] | 0.22 [0.20, 0.30] | 1.92 [1.88, 2.78] | 0.20 [0.19, 0.24] |
| n178-p1-large1-h32 / tags | 2.58 [2.56, 2.69] | 0.36 [0.34, 0.39] | 2.00 [1.95, 2.96] | 0.10 [0.09, 0.10] | 2.13 [2.09, 2.23] | 0.09 [0.09, 0.13] |
| n178-p1-large1-h32 / tasks | 5.28 [5.12, 5.33] | 3.74 [3.65, 4.07] | 4.13 [3.34, 4.36] | 1.21 [1.16, 1.33] | 2.97 [2.92, 3.05] | 1.20 [1.18, 1.38] |
| n178-p1-large1-h32 / overdue | 2.69 [2.63, 2.81] | 1.36 [1.33, 1.41] | 2.25 [2.22, 2.32] | 1.73 [0.73, 2.00] | 2.00 [1.96, 2.09] | 0.85 [0.74, 1.88] |
| n178-p1-large1-h32 / projects | 4.73 [2.78, 4.87] | 0.24 [0.23, 0.26] | 1.89 [1.86, 2.01] | 0.14 [0.08, 0.18] | 2.85 [1.81, 3.02] | 0.12 [0.09, 0.14] |
| n178-p1-large1-h32 / inbox | 2.53 [2.39, 2.59] | 0.93 [0.89, 0.93] | 2.08 [2.06, 2.17] | 0.93 [0.89, 2.20] | 2.38 [2.20, 3.20] | 1.90 [0.86, 1.96] |
| n178-p1-large1-h32 / today | 2.02 [1.98, 2.08] | 0.74 [0.70, 0.77] | 2.96 [1.97, 3.17] | 0.73 [0.70, 0.89] | 2.04 [1.86, 2.15] | 0.76 [0.71, 0.78] |
| n178-p1-large1-h32 / scheduled | 1.89 [1.83, 1.95] | 0.77 [0.72, 0.82] | 2.16 [2.10, 3.01] | 0.71 [0.68, 0.73] | 2.02 [1.91, 2.22] | 0.71 [0.68, 0.74] |
| n178-p1-large1-h2048 / profiles | 19.65 [19.54, 20.63] | 1.56 [1.52, 1.58] | 15.56 [15.02, 17.36] | 0.21 [0.20, 0.23] | 14.98 [14.58, 17.15] | 0.18 [0.18, 0.19] |
| n178-p1-large1-h2048 / tags | 18.66 [17.81, 19.77] | 0.36 [0.35, 0.37] | 16.76 [16.08, 17.46] | 0.10 [0.09, 0.10] | 15.02 [14.33, 15.26] | 0.10 [0.09, 0.70] |
| n178-p1-large1-h2048 / tasks | 20.58 [20.26, 23.71] | 1.87 [1.83, 1.94] | 16.85 [16.20, 17.36] | 1.15 [1.12, 1.17] | 17.86 [16.93, 18.86] | 1.16 [1.14, 1.88] |
| n178-p1-large1-h2048 / overdue | 16.80 [16.47, 17.26] | 1.37 [1.18, 2.53] | 14.78 [14.52, 15.91] | 0.71 [0.68, 0.83] | 15.53 [14.52, 16.91] | 0.74 [0.70, 0.95] |
| n178-p1-large1-h2048 / projects | 14.97 [14.88, 16.20] | 0.24 [0.20, 0.30] | 15.78 [15.38, 16.05] | 0.08 [0.08, 0.09] | 14.83 [14.48, 14.99] | 0.10 [0.09, 0.12] |
| n178-p1-large1-h2048 / inbox | 15.86 [15.81, 16.31] | 0.88 [0.86, 0.93] | 16.18 [16.11, 17.50] | 0.76 [0.69, 0.78] | 15.57 [15.43, 15.99] | 0.80 [0.74, 0.83] |
| n178-p1-large1-h2048 / today | 16.30 [15.74, 16.71] | 0.73 [0.70, 2.09] | 14.81 [14.44, 15.39] | 0.68 [0.61, 0.73] | 15.72 [14.37, 16.97] | 0.65 [0.64, 0.71] |
| n178-p1-large1-h2048 / scheduled | 15.74 [15.39, 17.33] | 0.69 [0.67, 0.88] | 15.35 [14.93, 16.95] | 0.66 [0.59, 0.74] | 15.78 [14.71, 16.20] | 0.67 [0.67, 0.72] |
| n178-p8-large0-h32 / profiles | 100.99 [98.20, 129.78] | 2.50 [2.44, 2.51] | 84.92 [82.84, 88.14] | 0.87 [0.84, 0.90] | 85.52 [82.55, 86.56] | 0.78 [0.73, 0.87] |
| n178-p8-large0-h32 / tags | 11.63 [10.78, 13.59] | 0.36 [0.36, 0.41] | 11.06 [10.17, 11.18] | 0.10 [0.09, 0.10] | 11.72 [11.54, 12.83] | 0.10 [0.10, 0.11] |
| n178-p8-large0-h32 / tasks | 17.17 [16.09, 17.66] | 1.76 [1.72, 1.98] | 15.67 [15.36, 17.45] | 1.06 [0.99, 1.14] | 16.43 [16.18, 17.05] | 1.02 [1.00, 1.18] |
| n178-p8-large0-h32 / overdue | 11.51 [11.12, 11.96] | 2.12 [1.49, 3.88] | 10.92 [10.28, 12.29] | 0.64 [0.61, 0.67] | 10.31 [9.89, 11.32] | 0.57 [0.56, 0.66] |
| n178-p8-large0-h32 / projects | 11.57 [11.10, 12.12] | 0.30 [0.26, 0.32] | 10.06 [9.88, 11.31] | 0.08 [0.07, 0.09] | 10.71 [9.74, 12.27] | 0.09 [0.08, 0.10] |
| n178-p8-large0-h32 / inbox | 10.61 [10.13, 11.25] | 0.79 [0.77, 0.82] | 11.38 [10.37, 11.44] | 0.67 [0.62, 0.70] | 11.62 [10.26, 12.76] | 0.66 [0.62, 0.69] |
| n178-p8-large0-h32 / today | 11.46 [10.27, 12.71] | 0.65 [0.61, 0.67] | 11.17 [10.42, 11.66] | 0.55 [0.54, 0.58] | 10.46 [9.80, 10.73] | 0.56 [0.53, 0.64] |
| n178-p8-large0-h32 / scheduled | 11.23 [10.37, 11.33] | 0.62 [0.59, 0.63] | 11.41 [10.16, 12.45] | 0.55 [0.54, 0.57] | 11.36 [10.05, 12.57] | 0.59 [0.54, 0.61] |
| n178-p8-large0-h2048 / profiles | 200.38 [197.00, 205.59] | 2.30 [2.22, 2.47] | 196.49 [192.75, 200.35] | 0.80 [0.79, 0.82] | 192.50 [190.61, 197.94] | 0.74 [0.70, 0.77] |
| n178-p8-large0-h2048 / tags | 24.66 [24.54, 25.62] | 0.36 [0.36, 0.40] | 24.67 [24.08, 27.91] | 0.09 [0.09, 0.10] | 23.02 [22.63, 24.45] | 0.09 [0.09, 0.11] |
| n178-p8-large0-h2048 / tasks | 31.08 [30.71, 32.71] | 1.73 [1.71, 1.79] | 29.40 [29.27, 31.00] | 0.99 [0.97, 1.01] | 29.31 [27.42, 30.53] | 1.02 [0.99, 1.04] |
| n178-p8-large0-h2048 / overdue | 24.36 [23.96, 25.84] | 1.07 [1.04, 1.08] | 24.58 [22.08, 24.86] | 0.58 [0.55, 0.61] | 23.50 [21.89, 25.40] | 0.60 [0.55, 0.64] |
| n178-p8-large0-h2048 / projects | 24.21 [22.47, 24.64] | 0.20 [0.19, 0.21] | 24.22 [23.19, 25.53] | 0.07 [0.07, 0.08] | 23.74 [22.47, 25.15] | 0.08 [0.07, 0.08] |
| n178-p8-large0-h2048 / inbox | 24.02 [23.82, 25.51] | 0.73 [0.69, 0.74] | 24.51 [23.12, 24.86] | 0.65 [0.61, 0.70] | 24.31 [22.55, 27.07] | 0.65 [0.63, 0.67] |
| n178-p8-large0-h2048 / today | 23.93 [23.04, 25.48] | 0.57 [0.56, 0.59] | 24.34 [23.39, 25.08] | 0.55 [0.54, 0.56] | 24.16 [23.07, 24.28] | 0.57 [0.53, 0.68] |
| n178-p8-large0-h2048 / scheduled | 22.95 [22.29, 25.68] | 0.59 [0.57, 0.61] | 24.02 [23.40, 26.05] | 0.57 [0.55, 0.59] | 25.49 [23.16, 25.95] | 0.58 [0.57, 0.61] |
| n178-p8-large1-h32 / profiles | 100.63 [98.74, 102.07] | 2.54 [2.51, 2.56] | 87.55 [86.49, 88.96] | 0.90 [0.85, 1.33] | 88.08 [86.49, 91.07] | 0.91 [0.87, 1.12] |
| n178-p8-large1-h32 / tags | 11.72 [11.20, 13.37] | 0.38 [0.36, 0.43] | 12.37 [10.20, 12.85] | 0.12 [0.09, 2.18] | 11.01 [10.11, 13.17] | 0.10 [0.09, 0.54] |
| n178-p8-large1-h32 / tasks | 16.33 [16.18, 18.59] | 1.85 [1.82, 1.86] | 15.56 [14.46, 15.82] | 3.72 [1.50, 3.98] | 16.36 [14.76, 17.66] | 3.67 [3.56, 4.04] |
| n178-p8-large1-h32 / overdue | 11.55 [10.98, 12.36] | 1.15 [1.12, 1.18] | 11.09 [10.78, 11.40] | 0.77 [0.72, 0.90] | 11.01 [10.38, 11.16] | 0.87 [0.80, 0.95] |
| n178-p8-large1-h32 / projects | 11.82 [11.52, 12.70] | 0.20 [0.20, 0.21] | 11.47 [10.40, 13.08] | 0.10 [0.09, 0.11] | 11.62 [10.97, 13.00] | 0.11 [0.10, 0.11] |
| n178-p8-large1-h32 / inbox | 10.65 [10.45, 11.64] | 0.86 [0.82, 0.87] | 10.60 [10.48, 11.58] | 0.73 [0.72, 0.74] | 10.38 [10.12, 11.38] | 0.76 [0.73, 0.79] |
| n178-p8-large1-h32 / today | 11.58 [10.45, 11.80] | 0.70 [0.68, 0.72] | 13.11 [10.51, 13.36] | 0.64 [0.61, 0.66] | 11.83 [11.70, 11.99] | 0.63 [0.62, 0.65] |
| n178-p8-large1-h32 / scheduled | 10.72 [10.42, 11.91] | 0.68 [0.65, 0.69] | 11.05 [10.37, 11.25] | 0.64 [0.62, 0.66] | 11.35 [10.09, 11.38] | 0.65 [0.63, 0.69] |
| n178-p8-large1-h2048 / profiles | 201.09 [199.20, 207.28] | 2.38 [2.20, 2.59] | 194.09 [193.03, 200.18] | 0.86 [0.82, 0.92] | 199.57 [196.15, 200.62] | 0.81 [0.76, 1.96] |
| n178-p8-large1-h2048 / tags | 25.19 [23.88, 26.53] | 0.38 [0.35, 0.42] | 24.23 [22.39, 24.30] | 0.10 [0.09, 0.11] | 24.31 [23.21, 24.96] | 0.10 [0.09, 0.35] |
| n178-p8-large1-h2048 / tasks | 30.94 [29.21, 31.77] | 1.88 [1.80, 1.93] | 30.08 [28.69, 30.53] | 1.13 [1.06, 1.19] | 28.96 [27.77, 31.97] | 1.10 [1.09, 3.01] |
| n178-p8-large1-h2048 / overdue | 24.13 [22.72, 26.13] | 1.18 [1.16, 1.33] | 23.37 [22.87, 25.77] | 0.68 [0.64, 0.73] | 23.01 [22.55, 24.07] | 0.66 [0.65, 1.04] |
| n178-p8-large1-h2048 / projects | 24.33 [22.71, 25.10] | 0.21 [0.20, 0.34] | 24.24 [23.66, 24.71] | 0.08 [0.07, 0.12] | 23.78 [23.29, 24.18] | 0.08 [0.08, 0.14] |
| n178-p8-large1-h2048 / inbox | 23.19 [22.73, 26.22] | 0.82 [0.80, 1.01] | 23.74 [23.71, 25.21] | 0.73 [0.70, 0.81] | 24.19 [23.63, 26.85] | 0.75 [0.71, 0.94] |
| n178-p8-large1-h2048 / today | 23.06 [22.50, 24.25] | 0.68 [0.63, 0.80] | 24.01 [23.65, 26.40] | 0.64 [0.61, 0.78] | 24.51 [23.03, 25.71] | 0.64 [0.62, 0.76] |
| n178-p8-large1-h2048 / scheduled | 23.34 [22.70, 24.41] | 0.69 [0.65, 0.72] | 23.78 [22.95, 24.29] | 0.68 [0.64, 0.71] | 23.78 [23.41, 25.67] | 0.67 [0.65, 1.05] |
| n178-p8-empty-large0-h2048 / profiles | 129.52 [128.24, 131.06] | 1.63 [1.59, 1.66] | 120.31 [118.02, 122.37] | 0.30 [0.26, 0.30] | 117.76 [116.84, 122.15] | 0.24 [0.23, 0.26] |
| n178-p8-empty-large0-h2048 / tags | 15.44 [15.00, 16.64] | 0.35 [0.35, 0.36] | 15.89 [14.64, 16.90] | 0.10 [0.10, 0.10] | 15.12 [14.24, 16.32] | 0.11 [0.10, 0.14] |
| n178-p8-empty-large0-h2048 / tasks | 16.66 [15.73, 17.52] | 1.79 [1.71, 1.83] | 16.57 [16.16, 17.77] | 1.06 [1.00, 1.11] | 16.68 [15.01, 18.06] | 1.09 [1.04, 1.18] |
| n178-p8-empty-large0-h2048 / overdue | 15.45 [15.12, 17.30] | 1.33 [1.04, 1.41] | 14.10 [13.97, 16.53] | 0.62 [0.56, 0.72] | 15.46 [15.26, 16.69] | 0.65 [0.61, 0.69] |
| n178-p8-empty-large0-h2048 / projects | 15.70 [14.15, 17.60] | 0.26 [0.18, 0.27] | 15.50 [14.99, 16.92] | 0.09 [0.08, 0.11] | 15.55 [14.16, 21.01] | 0.09 [0.08, 0.11] |
| n178-p8-empty-large0-h2048 / inbox | 14.40 [14.30, 14.87] | 0.81 [0.68, 0.87] | 16.07 [14.47, 16.47] | 0.74 [0.72, 2.10] | 14.97 [14.57, 25.18] | 0.73 [0.66, 0.78] |
| n178-p8-empty-large0-h2048 / today | 15.82 [14.36, 16.91] | 0.63 [0.59, 0.67] | 15.60 [13.91, 17.08] | 0.60 [0.59, 0.68] | 15.83 [15.72, 17.52] | 0.60 [0.54, 0.71] |
| n178-p8-empty-large0-h2048 / scheduled | 15.36 [14.27, 16.04] | 0.63 [0.58, 0.66] | 14.70 [13.75, 15.66] | 0.58 [0.57, 0.59] | 15.79 [13.92, 16.78] | 0.59 [0.56, 0.66] |
| n178-p8-empty-large1-h2048 / profiles | 134.05 [131.06, 134.96] | 1.64 [1.61, 1.71] | 120.12 [119.49, 124.83] | 0.28 [0.27, 0.29] | 120.48 [117.35, 126.83] | 0.23 [0.23, 0.35] |
| n178-p8-empty-large1-h2048 / tags | 16.11 [15.33, 18.06] | 0.38 [0.35, 0.51] | 15.06 [14.55, 16.15] | 0.10 [0.09, 0.11] | 14.89 [14.52, 15.41] | 0.11 [0.09, 0.11] |
| n178-p8-empty-large1-h2048 / tasks | 19.35 [18.91, 19.87] | 1.89 [1.85, 1.99] | 16.25 [15.49, 16.76] | 1.12 [1.09, 1.15] | 18.00 [16.92, 18.56] | 1.13 [1.10, 1.21] |
| n178-p8-empty-large1-h2048 / overdue | 16.25 [15.09, 17.01] | 1.48 [1.16, 2.41] | 14.96 [14.74, 16.13] | 0.68 [0.66, 0.77] | 14.95 [13.93, 15.64] | 0.71 [0.66, 0.75] |
| n178-p8-empty-large1-h2048 / projects | 15.76 [14.89, 16.18] | 0.24 [0.19, 0.27] | 15.89 [14.39, 16.89] | 0.08 [0.08, 0.10] | 15.13 [14.81, 17.72] | 0.08 [0.08, 0.10] |
| n178-p8-empty-large1-h2048 / inbox | 15.84 [14.51, 16.40] | 0.85 [0.79, 0.88] | 15.00 [14.30, 16.76] | 0.76 [0.73, 0.81] | 15.74 [14.85, 17.13] | 0.74 [0.70, 0.85] |
| n178-p8-empty-large1-h2048 / today | 15.97 [14.71, 16.32] | 0.69 [0.64, 0.72] | 14.73 [14.27, 17.06] | 0.67 [0.62, 0.73] | 14.83 [14.50, 16.78] | 0.64 [0.61, 0.72] |
| n178-p8-empty-large1-h2048 / scheduled | 16.04 [14.58, 17.65] | 0.68 [0.65, 0.72] | 15.62 [14.20, 15.94] | 0.67 [0.63, 0.74] | 15.91 [14.80, 17.46] | 0.65 [0.61, 0.77] |

### Read-port caller audit

The table is the complete production domain/CLI/server call-site inventory for the listed read ports. Authentication methods are the input boundary. Query continuations consume the returned nominal value. Low-level storage ports also serve bootstrap, replay, scheduler and mutation operations; those remain under their existing internal identities/transactions rather than changing the writer/replay model in this repair. The table identifies those separately and names the source of their selectors. Verification scripts/tests are separate callers and use scratch-only inputs.

| Production caller | Read call | Profile, ids and fields |
| --- | --- | --- |
| `packages/domain/src/store/store.ts:209` | `const purged = this.snapshots.purgedIdsSync();` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/store.ts:221` | `tasks: () => readTasks(this.db),` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:268` | `tasks: readTasks(this.db).filter(` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:414` | `const tasks = readTasks(this.db).filter(` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:472` | `const before = readTasks(this.db).find((task) => task.id === target.id);` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:550` | `readonly tasks = () => attempt(() => readTasks(this.db));` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:556` | `tasks: new ClientProjection(this.db).tasks(profile),` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:567` | `readonly graphRead = (read: AuthorizedRead) => this.graph(read.profile);` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:607` | `attempt(() => committedHistory(this.db, profile, after));` | Nominal read.profile; cursor is the subscription's internal unfolding state. |
| `packages/domain/src/store/store.ts:610` | `this.committedHistory(read.profile, after);` | Nominal read.profile; cursor is the subscription's internal unfolding state. |
| `packages/domain/src/store/store.ts:618` | `const state = this.snapshots.generationSync();` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/store.ts:736` | `for (const id of this.snapshots.purgedIdsSync())` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/store.ts:844` | `const purged = new Set(this.snapshots.purgedIdsSync());` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/store.ts:1349` | `const tasks = readTasks(this.db);` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/store.ts:1526` | `return readTasks(this.db);` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/snapshots.ts:296` | `readonly generation = () => attempt(() => this.generationSync());` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/snapshots.ts:396` | `const ids = this.purgedIdsSync();` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/snapshots.ts:492` | `generation: this.generationSync().generation,` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `apps/server/src/server.ts:453` | `diagnostics.read({ credential: yield* BearerCredential }),` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:519` | `attachments.imageRead(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:614` | `readGraphQuery(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:661` | `commands.readOne(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:822` | `: reads.profiles(credential),` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:828` | `reads.projects({` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:837` | `reads.tags({` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:859` | `reads.history({` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:869` | `store.auth.subscribe(` | Authorization boundary: Profile plus QuickAddInput or stream header/cursor fields are copied, parsed and frozen before the check. |
| `apps/server/src/server.ts:939` | `return yield* translate(store.auth.listTokens({ credential }));` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/server/src/server.ts:994` | `store.auth.ownerRead(` | Authorization boundary: Schema-owned Snapshot fields are copied before the check. |
| `apps/server/src/server.ts:1000` | `return yield* snapshotResult(store.snapshots.listRead(read));` | Nominal owner-read value; Show uses read.fields.snapshot. List has no id. |
| `apps/server/src/server.ts:1007` | `store.auth.ownerRead(` | Authorization boundary: Schema-owned Snapshot fields are copied before the check. |
| `apps/server/src/server.ts:1013` | `return yield* snapshotResult(store.snapshots.showRead(read));` | Nominal owner-read value; Show uses read.fields.snapshot. List has no id. |
| `packages/domain/src/store/diagnostics.ts:119` | `this.restoreGeneration = snapshots.generationSync().generation;` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/store/diagnostics.ts:195` | `const generation = yield* this.snapshots.generation();` | Owner check precedes parameter-free diagnostic collection; all ids/cursors are internal rows/state. |
| `packages/domain/src/store/diagnostics.ts:196` | `this.generation(generation.generation);` | Owner check precedes parameter-free diagnostic collection; all ids/cursors are internal rows/state. |
| `packages/domain/src/store/diagnostics.ts:198` | `const pending = yield* this.scheduled.pendingReminders();` | Owner check precedes parameter-free diagnostic collection; all ids/cursors are internal rows/state. |
| `packages/domain/src/store/purge.ts:15` | `...metadata(entry.event),` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `apps/server/src/sse.ts:27` | `store.auth.subscribe(` | Authorization boundary: Profile plus QuickAddInput or stream header/cursor fields are copied, parsed and frozen before the check. |
| `apps/server/src/sse.ts:48` | `const initial = yield* translate(store.snapshots.generation());` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `apps/server/src/sse.ts:61` | `const current = yield* translate(store.snapshots.generation());` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `apps/server/src/sse.ts:80` | `store.changesRead(read, state.cursor),` | Nominal read.profile; cursor is the subscription's internal unfolding state. |
| `packages/domain/src/store/dependency-validation.ts:78` | `? readTasks(db).filter((task) => task.profile_id === profile)` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/store/projection.ts:344` | `tasks: readTasks(db),` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/store/scheduled-work.ts:55` | `.tasks()` | Scheduler-owned Task rows; Profile and ids come from those rows, with no caller request. |
| `packages/domain/src/store/scheduled-work.ts:72` | `for (const task of this.ports.tasks()) {` | Scheduler-owned Task rows; Profile and ids come from those rows, with no caller request. |
| `packages/domain/src/store/scheduled-work.ts:100` | `for (const before of this.ports.tasks()) {` | Scheduler-owned Task rows; Profile and ids come from those rows, with no caller request. |
| `packages/domain/src/store/scheduled-work.ts:129` | `for (const task of this.ports.tasks()) {` | Scheduler-owned Task rows; Profile and ids come from those rows, with no caller request. |
| `packages/domain/src/store/client-projection.ts:32` | `...this.metadata(profile),` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/store/client-projection.ts:33` | `tasks: this.tasks(profile),` | Trusted storage implementation. Request-facing calls enter through the nominal read wrapper; mutation calls use their checked identity Profile. |
| `packages/domain/src/dependency-commands.ts:134` | `const graph = yield* this.store.graph(identity.profile);` | Mutation-only graph: checked MutationIdentity.profile; selectors are the write's typed ids/current Task. This is not a request query port. |
| `packages/domain/src/dependency-commands.ts:211` | `const updated = yield* this.store.graph(identity.profile);` | Mutation-only graph: checked MutationIdentity.profile; selectors are the write's typed ids/current Task. This is not a request query port. |
| `apps/server/src/task-search-cache-hygiene.ts:6` | `let cursor = yield* store.searchCacheEvents();` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `apps/server/src/task-search-cache-hygiene.ts:8` | `const current = yield* store.searchCacheEvents(cursor);` | Internal cursor, generation or erasure state. No caller Profile/id field is consumed. |
| `packages/domain/src/discovery.ts:42` | `const profiles = yield* auth.profileSummaries({ credential });` | Credential is an immutable string. Profile rows come from authorized discovery; prefix is read.fields.prefix. The existing snapshot/recheck order remains. |
| `packages/domain/src/discovery.ts:46` | `auth.metadata({ credential, profile: profile.id }).pipe(` | Credential is an immutable string. Profile rows come from authorized discovery; prefix is read.fields.prefix. The existing snapshot/recheck order remains. |
| `packages/domain/src/discovery.ts:55` | `yield* auth.profiles({ credential });` | Credential is an immutable string. Profile rows come from authorized discovery; prefix is read.fields.prefix. The existing snapshot/recheck order remains. |
| `packages/domain/src/discovery.ts:63` | `const { read, profiles } = yield* auth.profilesRead(` | Credential is an immutable string. Profile rows come from authorized discovery; prefix is read.fields.prefix. The existing snapshot/recheck order remains. |
| `packages/domain/src/discovery.ts:72` | `auth.catalog({ credential, profile: profile.id }).pipe(` | Credential is an immutable string. Profile rows come from authorized discovery; prefix is read.fields.prefix. The existing snapshot/recheck order remains. |
| `packages/domain/src/discovery.ts:92` | `yield* auth.profiles({ credential });` | Credential is an immutable string. Profile rows come from authorized discovery; prefix is read.fields.prefix. The existing snapshot/recheck order remains. |
| `packages/domain/src/attachment-store.ts:155` | `export function readManagedImage(` | Image metadata from the bound Task; filesystem Task id is read.fields.task_id. |
| `packages/domain/src/attachment-store.ts:209` | `const image = readManagedImage(root, attachment, task.id);` | Image metadata from the bound Task; filesystem Task id is read.fields.task_id. |
| `packages/domain/src/attachment-store.ts:225` | `const image = readManagedImage(root, attachment, source.id);` | Image metadata from the bound Task; filesystem Task id is read.fields.task_id. |
| `packages/domain/src/client-reads.ts:79` | `this.store.auth.profileSummaries({ credential });` | Raw input is consumed at the authorization boundary only. The query continuation uses the bound Profile and fields; History binds Task id. |
| `packages/domain/src/client-reads.ts:82` | `this.store.auth.projects(request);` | Raw input is consumed at the authorization boundary only. The query continuation uses the bound Profile and fields; History binds Task id. |
| `packages/domain/src/client-reads.ts:84` | `readonly tags = (request: AccessRequest) => this.store.auth.tags(request);` | Raw input is consumed at the authorization boundary only. The query continuation uses the bound Profile and fields; History binds Task id. |
| `packages/domain/src/client-reads.ts:92` | `const { read, data } = yield* this.store.auth.readCatalog(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/client-reads.ts:152` | `this.store.auth.taskHistory(request);` | Raw input is consumed at the authorization boundary only. The query continuation uses the bound Profile and fields; History binds Task id. |
| `packages/domain/src/auth/auth.ts:341` | `.profiles()` | Authentication-owned lookup of Profile definitions or owner-only credential metadata. Selection uses checked credential scope/resolution; no caller id is reused after the check. |
| `packages/domain/src/auth/auth.ts:615` | `!this.ports.profiles().some((p) => p.id === token.profile)` | Authentication-owned lookup of Profile definitions or owner-only credential metadata. Selection uses checked credential scope/resolution; no caller id is reused after the check. |
| `packages/domain/src/auth/auth.ts:778` | `(read) => this.projection.catalog(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:784` | `(read) => this.projection.metadata(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:850` | `this.projection.catalog(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:855` | `this.projection.metadata(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:871` | `data: this.projection.metadata(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:881` | `data: this.ports.read(read.profile),` | Authentication-owned lookup of Profile definitions or owner-only credential metadata. Selection uses checked credential scope/resolution; no caller id is reused after the check. |
| `packages/domain/src/auth/auth.ts:891` | `data: this.projection.catalog(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:936` | `(read) => taskHistory(this.db, read.profile, read.fields.task_id),` | Authentication-owned lookup of Profile definitions or owner-only credential metadata. Selection uses checked credential scope/resolution; no caller id is reused after the check. |
| `packages/domain/src/auth/auth.ts:941` | `this.projection.projects(read.profile),` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:945` | `this.projectionWithin(input, (read) => this.projection.tags(read.profile));` | The private query callback's read.profile; Task History also takes read.fields.task_id. |
| `packages/domain/src/auth/auth.ts:976` | `return this.projection.profiles(profiles);` | The frozen, checked Profile rows and ids, reused once. No second visible-set discovery. |
| `packages/domain/src/auth/auth.ts:1037` | `return this.ports.read(` | Authentication-owned lookup of Profile definitions or owner-only credential metadata. Selection uses checked credential scope/resolution; no caller id is reused after the check. |
| `packages/domain/src/graph-queries.ts:137` | `const read = yield* store.auth.authorizeRead(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/graph-queries.ts:145` | `yield* store.graphRead(read),` | Nominal read.profile; Task id/filter selection uses that read.fields in the continuation. |
| `packages/domain/src/graph-queries.ts:153` | `readGraphQuery(...args).pipe(Effect.map((result) => result.graph));` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:154` | `const search = store.searchWords.read(selected.profile);` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:155` | `const { read, data } = yield* store.auth.readState(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:161` | `const graph = yield* store.graphRead(read);` | Nominal read.profile; Task id/filter selection uses that read.fields in the continuation. |
| `packages/domain/src/commands.ts:220` | `? (yield* store.profiles()).some(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:355` | `const search = this.store.searchWords.read(selected.profile);` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:357` | `const { read, data: view } = yield* this.store.auth.readMetadata(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:363` | `const graph = yield* this.store.graphRead(read);` | Nominal read.profile; Task id/filter selection uses that read.fields in the continuation. |
| `packages/domain/src/commands.ts:399` | `const { read, data } = yield* this.store.auth.readMetadata(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:404` | `const graph = yield* this.store.graphRead(read);` | Nominal read.profile; Task id/filter selection uses that read.fields in the continuation. |
| `packages/domain/src/commands.ts:424` | `this.readOne(request, Schema.Struct({ task_id: TaskId }), {` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:464` | `...(yield* this.store.projects()),` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:469` | `const tags = yield* this.store.tags();` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:488` | `projects: yield* this.store.projects(),` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:489` | `tags: yield* this.store.tags(),` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:638` | `const graph = yield* this.store.graph(identity.profile);` | Mutation-only graph: checked MutationIdentity.profile; selectors are the write's typed ids/current Task. This is not a request query port. |
| `packages/domain/src/commands.ts:707` | `const tasks = yield* this.store.tasks();` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:730` | `const edges = (yield* this.store.graph(` | Mutation-only graph: checked MutationIdentity.profile; selectors are the write's typed ids/current Task. This is not a request query port. |
| `packages/domain/src/commands.ts:781` | `: seriesForTask(before, yield* this.store.series());` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:999` | `const before = (yield* this.store.tasks()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1029` | `(yield* this.store.tasks()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1154` | `const data = yield* readTasks(store, request);` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1202` | `const data = yield* readTasks(store, request);` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1205` | `const { read, data: checked } = yield* store.auth.readState(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:1397` | `const before = (yield* store.tasks()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1462` | `const { read, data } = yield* store.auth.readState(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:1468` | `const { data: target, read: targetRead } = yield* store.auth.readState(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:1507` | `yield* store.series(),` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1538` | `? (yield* store.history(entry.seq - 2)).find(` | Revert/Move writer: sequence and Task ids come from the bound Revert read or a Schema-decoded committed event/current Task. |
| `packages/domain/src/commands.ts:1560` | `const destination = (yield* store.profiles()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1622` | `!(yield* store.profiles()).some(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1633` | `const source = (yield* store.profiles()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1708` | `const definition = seriesForTask(context.before, yield* store.series());` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1735` | `const definition = seriesForTask(context.before, yield* store.series());` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/commands.ts:1755` | `const { read, data } = yield* store.auth.readState(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/commands.ts:1800` | `const pair = (yield* store.history()).filter(` | Revert/Move writer: sequence and Task ids come from the bound Revert read or a Schema-decoded committed event/current Task. |
| `packages/domain/src/commands.ts:1901` | `(yield* store.tasks()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/import-tasks.ts:45` | `const { read } = yield* store.auth.readState(` | Authorization boundary: Profile and fields are parsed/copied before the callback. The returned read owns ids, filters and scope. |
| `packages/domain/src/import-tasks.ts:55` | `const graph = yield* store.graphRead(read);` | Nominal read.profile; Task id/filter selection uses that read.fields in the continuation. |
| `packages/domain/src/import-tasks.ts:147` | `const tasks = (yield* store.auth.read(request)).tasks;` | Import continuation's owned request, reconstructed from its initial read credential/Profile; items and ids come from read.fields.input and decoded ImportItem. |
| `packages/domain/src/import-tasks.ts:221` | `const data = yield* store.auth.read(request);` | Import continuation's owned request, reconstructed from its initial read credential/Profile; items and ids come from read.fields.input and decoded ImportItem. |
| `packages/domain/src/import-tasks.ts:336` | `const currentBlockers = (yield* store.graphRead(read)).edges` | Nominal read.profile; Task id/filter selection uses that read.fields in the continuation. |
| `packages/domain/src/attachment-commands.ts:56` | `const before = (yield* this.store.tasks()).find(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/attachment-commands.ts:468` | `const { read, task } = yield* new TaskCommands(this.store).readOne(` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `packages/domain/src/attachment-commands.ts:480` | `readManagedImage(` | Image metadata from the bound Task; filesystem Task id is read.fields.task_id. |
| `packages/domain/src/attachment-commands.ts:490` | `this.imageRead(request, id).pipe(Effect.map((result) => result.image));` | Trusted write/bootstrap/replay projection lookup. Profile comes from MutationIdentity/current Task or explicit bootstrap identity; ids are typed write/event values. No request-query continuation consumes this raw port. |
| `apps/cli/src/main.ts:708` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:796` | `const data = yield* readTasks(store, request, filters).pipe(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:923` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1104` | `const data = yield* readTasks(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1320` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1377` | `const entries = yield* new ClientReads(store).history({` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1445` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1510` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1563` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1616` | `const graph = yield* readGraph(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1701` | `const data = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1750` | `const latest = yield* readTasks(store, request);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1774` | `const data = yield* readTasks(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1803` | `const data = yield* readTasks(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:1839` | `const data = yield* readTasks(` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:2116` | `: new ClientReads(store).profiles(credential);` | Adapter supplies decoded values before authorization. The called boundary binds them; post-check Show/graph/image recovery uses its returned read value. |
| `apps/cli/src/main.ts:2207` | `.listRead(read)` | Nominal owner-read value; Show uses read.fields.snapshot. List has no id. |
| `apps/cli/src/main.ts:2218` | `.showRead(read)` | Nominal owner-read value; Show uses read.fields.snapshot. List has no id. |
| `apps/cli/src/main.ts:2259` | `const read = yield* store.auth.ownerRead(` | Authorization boundary: Schema-owned Snapshot fields are copied before the check. |

### Commands, mapping and actual exits

Receipts below are relative to `docs/evidence/ui-speed/server-reads/boundary-revision`. They preserve failures rather than relabeling them. Exact argv for compiled recipes is in skills/summary.json and skills-rest/summary.json. Normal binaries are frozen by boundary-product-build.json at source hash 27faae19b383da3d0e342c2b56fd520f3add5402614190b3bbca19596241c9fe. The root used explicit same-source TODO_CLI_BINARY and TODO_SERVER_BINARY overrides. The complete cache command passed at docs/evidence/perf-cache/verify-Xh1k3D/result.json, including the admission model/code, erasure and CLI defect/refusal controls. All compiled recipe repeats passed; the sole held recipe was rerun. The source-map-only follow-up commit is 031504b5255d20f9ea8998746cbc2af009b7a7d8. The caller inventory contains 148 production call sites and trusted storage implementations. Read fields are now validated for in-process callers too; equality claims cover the published HTTP/CLI decoders and their fixtures rather than previously unchecked invalid in-process objects.

```sh
pnpm --filter @todo/domain test read-authorization.test.ts
pnpm typecheck
bun build --compile .scratch/review-s1/boundary-probe.ts --outfile .scratch/bin/boundary-seat-after
.scratch/bin/boundary-seat-after after
bun apps/server/scripts/build-read-control.ts after .scratch/bin/read-timing-after
bun apps/server/scripts/read-control.ts .scratch/bin/read-timing-before .scratch/bin/read-timing-after .scratch/server-reads/checkpoints/fixtures.json docs/evidence/ui-speed/server-reads/boundary-revision/control-56
bun apps/server/scripts/read-control.ts .scratch/bin/read-timing-before .scratch/bin/read-timing-after .scratch/server-reads/rich-audited/fixtures.json docs/evidence/ui-speed/server-reads/boundary-revision/control-rich
bun apps/server/scripts/build-read-boundary.ts .scratch/bin/read-boundary-server-final
READ_BOUNDARY_MODE=credential READ_BOUNDARY_BINARY="$PWD/.scratch/bin/read-boundary-server-final" bun apps/server/scripts/read-control.ts .scratch/bin/read-timing-after .scratch/bin/read-boundary-server-final .scratch/server-reads/rich-audited/fixtures.json docs/evidence/ui-speed/server-reads/boundary-revision/http-credential-final
READ_BOUNDARY_MODE=port READ_BOUNDARY_BINARY="$PWD/.scratch/bin/read-boundary-server-final" bun apps/server/scripts/read-control.ts .scratch/bin/read-timing-after .scratch/bin/read-boundary-server-final .scratch/server-reads/rich-audited/fixtures.json docs/evidence/ui-speed/server-reads/boundary-revision/http-port-final
bun apps/server/scripts/read-boundary-concurrency.ts .scratch/bin/read-boundary-server-final .scratch/server-reads/rich-audited/fixtures.json docs/evidence/ui-speed/server-reads/boundary-revision/concurrency-final
export TODO_CLI_BINARY="$PWD/.scratch/bin/27faae19b383-219749f2ab4e/todo"
export TODO_SERVER_BINARY="$PWD/.scratch/bin/27faae19b383-219749f2ab4e/todo-server"
sh scripts/disk-guard.sh
/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check
bun .agents/skills/verify-occ-atomicity/check.ts
bun .agents/skills/verify-task-search-cache/build-baseline.mjs 219749f2ab4ed40fdf7f257c991385a2057bf215 --uncached
bun .agents/skills/verify-task-search-cache/verify.mjs 219749f2ab4ed40fdf7f257c991385a2057bf215
```

| Invocation / receipt | Real exit |
| --- | ---: |
| `atomicity` | 0 |
| `benchmark` | 0 |
| `boundary-build-1` | 0 |
| `boundary-build-2` | 0 |
| `boundary-build-final` | 0 |
| `cache-baseline` | 0 |
| `cache-final-2` | 0 |
| `cache-final` | 1 |
| `cache-hygiene-1` | 1 |
| `cache-properties-1` | 1 |
| `cache-properties-2` | 1 |
| `cleanup` | 0 |
| `compression` | 0 |
| `concurrency-2` | 0 |
| `concurrency-final` | 0 |
| `concurrency` | 1 |
| `control-56` | 0 |
| `control-build-1` | 0 |
| `control-build-final` | 0 |
| `control-rich` | 0 |
| `domain-after-1` | 1 |
| `domain-after-2` | 0 |
| `domain-after-3` | 1 |
| `domain-after-4` | 0 |
| `domain-after-5` | 0 |
| `domain-after-6` | 0 |
| `domain-before` | 1 |
| `domain-suite-1` | 0 |
| `format-1` | 0 |
| `format-6` | 1 |
| `http-credential-confirmed` | 0 |
| `http-credential-final` | 0 |
| `http-credential` | 0 |
| `http-port-final` | 0 |
| `http-port` | 0 |
| `product-build` | 0 |
| `root-9` | 0 |
| `seat-after` | 0 |
| `seat-base-build` | 0 |
| `seat-base` | 1 |
| `seat-before` | 1 |
| `seat-build-after` | 0 |
| `seat-build-before` | 0 |
| `server-1` | 0 |
| `skills-rest` | 0 |
| `skills` | 1 |
| `typecheck-1` | 1 |
| `typecheck-10` | 0 |
| `typecheck-11` | 1 |
| `typecheck-12` | 0 |
| `typecheck-2` | 1 |
| `typecheck-3` | 1 |
| `typecheck-4` | 1 |
| `typecheck-5` | 0 |
| `typecheck-6` | 1 |
| `typecheck-7` | 0 |
| `typecheck-8` | 1 |
| `typecheck-9` | 0 |

| Compiled recipe command | Real exit |
| --- | ---: |
| `sh .agents/skills/verify-op-log/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/op-log"` | 0 |
| `sh .agents/skills/verify-auth/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/auth"` | 0 |
| `sh .agents/skills/verify-recurrence/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/recurrence"` | 0 |
| `sh .agents/skills/verify-server-api/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/server-api"` | 0 |
| `sh .agents/skills/verify-server-api/scripts/verify-reads.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/server-reads"` | 0 |
| `sh .agents/skills/verify-profiles/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/profiles"` | 0 |
| `sh .agents/skills/verify-filters/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/filters"` | 0 |
| `sh .agents/skills/verify-snapshots/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/snapshots"` | 0 |
| `sh .agents/skills/verify-sse/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/sse" "$PWD/.scratch/bin/27faae19b383-219749f2ab4e/todo"` | 0 |
| `sh .agents/skills/verify-cli/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/cli"` | 0 |
| `bun --define 'TODO_BUILD_ID="219749f2"' .agents/skills/verify-attachments/scripts/drive.ts "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/attachments"` | 0 |
| `bun --define 'TODO_BUILD_ID="219749f2"' .agents/skills/verify-attachments/scripts/cli01.ts "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/attachment-groups"` | 0 |
| `sh .agents/skills/verify-dag/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/dag"` | 0 |
| `sh .agents/skills/verify-dag/scripts/verify-public.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/dag-public"` | 0 |
| `sh .agents/skills/verify-discovery/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills/discovery"` | 3 |
| `sh .agents/skills/verify-discovery/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills-rest/discovery"` | 0 |
| `sh .agents/skills/verify-import/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills-rest/import"` | 0 |
| `sh .agents/skills/verify-diagnostics/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/boundary-revision/skills-rest/diagnostics"` | 0 |

Type/formatter iterations caught unfinished schema imports, private credential spread use, and TypeScript 7's async-loop inference issue. The first concurrency seeder reused an invalid Task Version; the corrected fixture asserts both creations before running requests. The first observer instrumentation lacked explicit execution receipts; the final runs require them. Cache property and hygiene controls passed behavior/restoration/strict checks before stopping at stale source mappings. Cache setup first lacked its evidence directory, then its separate pinned-jar path. The existing AtomicCAS jar has the identical pinned SHA-256 and was copied to that ignored cache path. No model, configuration or invariant was changed. AtomicCAS mapped bodies remain byte-identical; its renewed hash covers moved lines and unmapped read wrappers only. The cache mapping records the preserved epoch-before-auth and both preparation hooks, keys, admission, accounting, erasure and observer bodies.

Discovery's first recipe held with exit 3 at its stricter disk guard. The user's 30 GB floor was not crossed at that observation; a later sample was 35.2 GB. Owned closed Bun temporaries were removed, then the recipe was rerun. Sixteen files totaling 1,418,573,824 bytes were removed after lsof checks. Earlier superseded byte-control samples were gzip-compressed, verified by exact decompression before removal of their raw copies: 290 files saved 4,397,967,107 bytes. Aggregate receipts and accepted delivery matrices remain available. A retirement helper hit a post-removal stat error on its first file entry after retiring older owned binaries; no open binary was removed. This helper failure is not a product or proof pass.

The paired table above measures the repaired product. The prior performance tables and Unit B audit below describe the earlier measured product. They do not certify input-to-render latency or a new UI/native result. The immediate transaction and writer model remain unchanged. Final cleanup removed 11 further closed compile temporaries, 975,269,504 bytes. Free space was 42.2 GB; no owned cached-binary process remained. Delivery source/binary hashes are recorded in boundary-revision/delivery-audit.json. The independent correctness seat's re-check is separate; this worker started no children and did not launch native apps, access Keychain, sign, push, merge or open a PR.

## Earlier implementation, measurements and lock audit

Pure server reads no longer decode the global operation log. The paired sweep returned 8,640 successful, validated responses; every after-read decoded zero operation entries. On the synthetic 178-total-Task/eight-Profile fixture with long deleted text and 2,234 operations, warm GET /profiles changed from 218.48 [211.41, 254.24] ms to 0.63 [0.41, 0.74] ms. Its eight-handler refresh sum changed from 437.62 [403.43, 457.25] ms to 10.40 [6.38, 13.33] ms. These are handler observations, not an input-to-render or p99 result.

Branch: `perf/server-reads`. Starting commit: `e69230f93ce0ea29e955c34c4610122c6f47cb5c`. Main implementation: `7a90388d246e6c03f975d82c164c3e589cf15c7d`. Cursor proof: `43c7511753c76940842f7c87c5b503c211bc4bc2`. Final product with the authorization-boundary correction: `35d6790836e8139ae00e7e70086fd5211ab4c683`. Later changes are this report. The HTTP contract remains `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`. No dependency, migration, API schema, Swift or client UI changed. Commits are local; nothing was pushed, merged elsewhere or opened as a PR.

## What changed

- [ClientProjection](../../../packages/domain/src/store/client-projection.ts) owns Profile-filtered Task/catalog/metadata reads and grouped Profile, Project and Tag counts. Task lists and graphs filter Tasks and edges by Profile in SQL. Planning views load their Profile catalog without Series or History. Search and graph algorithms retain their existing in-memory semantics.
- GET /profiles computes counts with one grouped projection SELECT inside one immediate transaction. Its original credential-check sequence remains discovery followed by one read check per authorized Profile. Inbox is open with no due or scheduled date; open excludes snoozed and terminal Tasks; all counts exclude deleted Tasks. Active empty Profiles remain visible; tombstones and Token scope retain their previous meaning. The directory reuses its existing deferred read snapshot and its original discovery/read/discovery check order.
- [History queries](../../../packages/domain/src/store/history-reads.ts) select relevant Task events, or committed Profile SSE events, before OpLogEntry decoding. The Task predicate exhaustively covers the event-kind union, both lifecycle versions, dependency endpoints, rejected witnesses and redacted replay facts. The embedded-NUL witness regression preserves the old NonEmptyString semantics. SSE reads its global high-water cursor and selected entries in one deferred read snapshot. Skipped rejected and foreign rows still advance the cursor without decoding them. The cursor never moves backwards before a generation reset.

The two new domain implementation files are the links above. The new domain test is [client-projection.test.ts](../../../packages/domain/test/client-projection.test.ts). The existing full command-state loader remains for command/Revert paths; this unit's no-History claim covers server read routes. It does not claim to optimize every CLI or mutation pre-read.

## ADR-0007 and projection integrity

[ADR-0007](../../adr/0007-operation-log-is-the-source-of-truth.md) permits guarded, derived projections. No read-time comparison of replay with projection existed in the old broad loader: it decoded both datasets but never compared them. Removing that unused decode removes no consistency check. Generated Task columns, projection write guards, before-value and Version validation, and atomic event/projection commits remain. Rebuild, checkpoint replay, Purge and restore retain their original implementations. The compiled operation-log/DAG proofs check literal rows, guarded direct-write refusals and full/checkpoint replay.

Every mapped AtomicCAS body, including the store constructor, transaction, historySync, append, validation, rejection, checkpoint and replay, is byte-identical to the pinned base. The store's read methods outside that mapping changed; covered bodies moved lines. All other covered files, models, configs, fixtures and invariants are unchanged. Both real-code breaks failed behavioral enumeration with exit 1, exact source was restored, and the restored command and final command exited 0. The pin renewal documents only that reviewed line movement. It does not extend AtomicCAS to graph reads or SSE.

## Differential control

The test-only baseline is compiled from exact e69230f9 product blobs by `build-read-control.ts before`; no legacy read implementation remains in production routing. The initial baseline binary and raw HTTP control preceded implementation. The no-History behavior regression was added after the first candidate, then run against exact original product files, where it failed, and against the candidate, where it passed. That regression did not follow the requested test-before-edit chronology. The later cursor regression did: an array result failed the literal global-cursor expectation before the cursor fix. A final boundary regression also failed before its fix: a diagnostics callback mutated the request object after the credential check, and the candidate returned the other Profile's Task. Projection callbacks now receive the captured parsed Profile that was authorized; the literal scoped-Task assertion passes. The original full loader already read its parsed request Profile.

The accepted matrix has 56 original checkpoints, the report's 36 base, eight empty-Profile and 12 rich checkpoints, plus one audited lifecycle fixture. It compares 25,147 status/body pairs on each side, including 1,267 lifecycle requests. Bodies are compared as base64-encoded bytes, not parsed or reordered JSON. Coverage includes:

- Profile lists with and without Projects, prefix lookup, all four planning views, Projects, Tags, default/closed/all/Ready/Blocked/ordered/search/prefix Task reads, Show, graph and Task History.
- Health/OpenAPI, credential lists, Snapshot list and successful/missing Show, successful/missing image reads, quick-add parsing and bounded SSE catch-up.
- Owner, scoped read-only/read-write and unscoped Tokens, a revoked deleted-Profile Token, invalid/missing credentials, absent/deleted Profiles and Tasks, malformed/unknown queries, empty results, metadata, copied images, Series/Occurrences, Dependencies, deleted/purged Tasks and old v1 events.

The lifecycle seeder now asserts successful Purge, absence of its Task, exactly three expected rejections, and coverage of every supported event kind, counting original kinds retained by redaction. It includes restore generation metadata and requests the purged Task's History explicitly. Earlier lifecycle receipts with a rejected malformed Purge are excluded from this coverage claim. The audited fixture and all 56 checkpoint controls pass against final product 35d67908.

Date and Effect wall clocks are fixed only for parity; timers and monotonic time remain functional. Build identity is fixed in the test comparator so health can be compared; the normal delivery binary reports build 35d67908 and the unchanged contract. One private Snapshot directory persists across each pair so file ids and paths match. Managed image bytes belong to the private fixture. The SSE comparator sends the matching generation and reads a bounded complete prefix before canceling its own reader.

Auth History fields and event timestamps, plus diagnostic credential last-use values, compare equal. SQLite's physical recorded_at clock is naturally different across processes and is excluded from that durable-row comparison. Diagnostics' memory, uptime and latency measurements are inherently process-dependent; those volatile values are not claimed byte-identical. Its nonvolatile credential projection is compared. Error statuses, tags, exit pairs, scope/refusal ordering and selected-Profile History remain unchanged.

A final review found two verification issues in the inherited recipes. The Profile migration driver still expected schema 6 although this base and its skill require 7; its unchanged 7 result first failed, then passed the corrected literal. The HTTP expired-credential test raced scheduler deletion. A forced cleanup interval reproduced invalid_credential on the original compiled build. A scratch-only delete guard now retains the row so the unchanged strict expired assertion tests expiry rather than absence. The forced interval and complete CLI suite then passed. Neither change modifies production auth or scheduling.

## Measurement method

The source report and harness are exactly commit 28602ee2bdbb1926feb89e9a1b681a902c39ffde. Their current worktree bytes were checked against those blobs. The reusable preparation script copies its 56 scratch checkpoints and makes an ignored adapter of its driver. The adapter retains literal status, count, view membership and request-correlation assertions; alternates before/after for each pair; and requires zero operation decodes after the fix. Newer Diagnostics stage/detail assertions unavailable under contract 78a2be44 are omitted, not replaced with zeros.

The timing binaries add only the same middleware handler header, request echo and operation-decode counter. They do not change the API schema or product sources. The interval is the existing diagnostics middleware's handler entry to pre-response handoff. Network/body-end client intervals are retained separately. The counter adds baseline observer work; these are instrumented compiled measurements, not a promise of exact installed latency. The earlier source CPU profile in the measurement report identifies JSON/OpLogEntry materialization as the old limiter; this run directly verifies its removal. Current Task decoding, graph/filter work, SQLite and encoding remain. Their separate post-fix CPU shares are not measured.

There are 16 factorial corners, 15/178 Tasks per populated Profile, one/eight Profiles, 32/2,048 edits and null/large deleted text, plus two 178-total-Task/eight-Profile shapes with seven empty Profiles. Both request orders run five fresh-process pairs and three passes. No health/sign-in request precedes the first timed read. Within a pair, order alternates A/B then B/A. First-use means each route's first call in a fresh process. Later routes in that pass can benefit from earlier calls; it does not mean flushed OS caches or cold disk. Tables report five-run medians and min/max ranges, milliseconds. Warm means the second pass; the third remains in raw receipts.

Expected claim before the final run: removing unrelated History decoding reduces handler latency at the factorial corners; the run must still perform and validate every response. All 8,640 responses were 200 and validated, with no retries or timeouts. All 4,320 after-observations decoded zero operation entries. The largest populated fixture has 1,424 live Tasks across eight Profiles, not 178 total, and 3,480 operations. Before, its eight reads decode 52,200 operations per refresh, including 27,840 for /profiles; after, zero. The owner-shaped empty-Profile fixture has 178 total live Tasks and 2,234 operations.

The machine has 10 logical CPUs. This is ambient load, with one-minute boundary loads 5.45 to 7.03. No pressure workers, cache purge or database setting changes were used. Timings use the real clock and normal live scheduler. The accepted final sweep ran after this worker's builds, functional controls and root/subsystem checks had finished. Host activity from other work was not controlled; pairing limits that drift. No quiet-host or pressure conclusion is claimed. Earlier complete sweeps preceded the cursor or authorization-boundary follow-ups; they remain exploratory evidence and are not substituted for this table.

### Profile counts and refresh sums

Case ids encode Tasks per populated Profile, Profile count, large deleted text and extra edits. The table also states total live Tasks and total operation count. Warm Profile-first order:

| Fixture | Total live Tasks | Ops | Warm /profiles before | After | Warm eight-handler sum before | After |
| --- | ---: | ---: | --- | --- | --- | --- |
| n15-p1-large0-h32 | 15 | 55 | 1.12 [1.06, 1.17] | 0.18 [0.16, 0.24] | 6.65 [5.62, 8.30] | 1.91 [1.69, 2.60] |
| n15-p1-large0-h2048 | 15 | 2071 | 16.77 [15.91, 17.53] | 0.31 [0.17, 0.36] | 144.68 [140.18, 152.35] | 2.05 [1.74, 2.98] |
| n15-p1-large1-h32 | 15 | 55 | 1.50 [1.48, 1.57] | 0.17 [0.16, 0.21] | 13.60 [12.42, 15.07] | 5.81 [5.36, 6.36] |
| n15-p1-large1-h2048 | 15 | 2071 | 17.19 [16.65, 19.09] | 0.20 [0.16, 0.61] | 138.97 [131.94, 158.19] | 2.66 [2.22, 4.37] |
| n15-p8-large0-h32 | 120 | 160 | 17.96 [12.11, 18.53] | 0.46 [0.38, 0.95] | 33.95 [24.53, 37.30] | 3.20 [2.02, 5.39] |
| n15-p8-large0-h2048 | 120 | 2176 | 147.09 [138.54, 155.39] | 0.35 [0.29, 0.51] | 275.18 [260.98, 301.58] | 2.01 [1.57, 2.58] |
| n15-p8-large1-h32 | 120 | 160 | 20.99 [16.32, 21.90] | 0.35 [0.28, 0.42] | 39.76 [35.48, 42.50] | 5.23 [2.76, 5.84] |
| n15-p8-large1-h2048 | 120 | 2176 | 139.16 [107.70, 165.97] | 0.51 [0.22, 0.55] | 254.58 [201.93, 301.23] | 2.81 [1.72, 3.62] |
| n178-p1-large0-h32 | 178 | 218 | 2.93 [2.08, 3.33] | 0.36 [0.23, 0.48] | 27.37 [20.84, 33.63] | 6.73 [5.14, 7.53] |
| n178-p1-large0-h2048 | 178 | 2234 | 26.21 [23.75, 28.93] | 0.25 [0.23, 0.49] | 183.68 [170.16, 193.49] | 6.12 [5.37, 9.65] |
| n178-p1-large1-h32 | 178 | 218 | 3.06 [2.68, 4.85] | 0.26 [0.25, 0.56] | 30.27 [27.48, 39.90] | 10.68 [8.76, 12.21] |
| n178-p1-large1-h2048 | 178 | 2234 | 22.75 [21.13, 24.79] | 0.31 [0.26, 0.56] | 183.96 [175.73, 248.54] | 6.61 [6.22, 11.40] |
| n178-p8-large0-h32 | 1424 | 1464 | 126.61 [124.47, 142.08] | 1.07 [0.95, 1.44] | 254.14 [240.88, 294.50] | 6.65 [5.94, 7.95] |
| n178-p8-large0-h2048 | 1424 | 3480 | 283.46 [270.35, 323.67] | 1.07 [0.99, 1.35] | 585.20 [508.43, 600.51] | 7.38 [6.07, 8.63] |
| n178-p8-large1-h32 | 1424 | 1464 | 111.39 [90.13, 148.68] | 0.87 [0.80, 1.52] | 209.96 [172.81, 323.36] | 9.11 [8.18, 14.75] |
| n178-p8-large1-h2048 | 1424 | 3480 | 196.66 [194.12, 201.26] | 0.75 [0.69, 0.93] | 377.13 [366.09, 381.52] | 4.87 [4.70, 5.61] |
| n178-p8-empty-large0-h2048 | 178 | 2234 | 182.30 [153.21, 299.90] | 0.60 [0.31, 0.99] | 345.06 [290.84, 549.23] | 6.26 [5.27, 15.32] |
| n178-p8-empty-large1-h2048 | 178 | 2234 | 218.48 [211.41, 254.24] | 0.63 [0.41, 0.74] | 437.62 [403.43, 457.25] | 10.40 [6.38, 13.33] |

### Every route at every corner

Primary order is profiles, tags, tasks, overdue, projects, inbox, today, scheduled. The last two columns use the alternate order with profiles last. First-use and warm ranges overlap for some small cells; no precise small-cell multiplier is claimed.

| Fixture / route | First-use before | First-use after | Warm before | Warm after | Profiles-last warm before | Profiles-last warm after |
| --- | --- | --- | --- | --- | --- | --- |
| n15-p1-large0-h32 / profiles | 3.22 [2.81, 3.63] | 1.97 [1.65, 2.11] | 1.12 [1.06, 1.17] | 0.18 [0.16, 0.24] | 1.34 [0.83, 4.33] | 0.16 [0.14, 0.24] |
| n15-p1-large0-h32 / tags | 1.28 [1.16, 1.38] | 0.42 [0.36, 0.45] | 0.81 [0.70, 0.85] | 0.13 [0.12, 0.18] | 1.10 [0.97, 1.47] | 0.12 [0.12, 0.13] |
| n15-p1-large0-h32 / tasks | 1.96 [1.84, 2.09] | 1.20 [1.12, 1.32] | 0.97 [0.76, 1.93] | 0.38 [0.33, 0.49] | 1.25 [1.03, 1.99] | 0.39 [0.39, 0.41] |
| n15-p1-large0-h32 / overdue | 1.54 [1.37, 1.65] | 0.84 [0.74, 1.05] | 0.76 [0.66, 1.39] | 0.28 [0.23, 0.41] | 1.22 [0.87, 1.38] | 0.27 [0.26, 0.66] |
| n15-p1-large0-h32 / projects | 1.09 [0.99, 1.21] | 0.28 [0.23, 0.39] | 0.77 [0.60, 0.86] | 0.11 [0.10, 0.14] | 0.95 [0.80, 1.88] | 0.13 [0.11, 0.25] |
| n15-p1-large0-h32 / inbox | 0.90 [0.75, 0.95] | 0.42 [0.36, 0.68] | 0.75 [0.60, 0.77] | 0.32 [0.27, 0.55] | 1.24 [0.94, 1.45] | 0.45 [0.31, 0.54] |
| n15-p1-large0-h32 / today | 0.96 [0.72, 1.03] | 0.33 [0.27, 0.42] | 0.68 [0.55, 0.72] | 0.25 [0.22, 0.33] | 0.99 [0.78, 1.41] | 0.26 [0.24, 0.36] |
| n15-p1-large0-h32 / scheduled | 1.04 [0.75, 1.13] | 0.36 [0.33, 0.49] | 0.67 [0.54, 0.88] | 0.25 [0.19, 0.27] | 0.81 [0.69, 1.38] | 0.25 [0.21, 0.36] |
| n15-p1-large0-h2048 / profiles | 28.52 [25.01, 31.16] | 2.19 [2.09, 2.45] | 16.77 [15.91, 17.53] | 0.31 [0.17, 0.36] | 17.66 [15.73, 22.17] | 0.18 [0.13, 0.26] |
| n15-p1-large0-h2048 / tags | 24.30 [22.70, 28.62] | 0.52 [0.45, 0.59] | 19.00 [17.80, 19.20] | 0.16 [0.13, 0.29] | 18.55 [15.32, 22.24] | 0.16 [0.12, 0.30] |
| n15-p1-large0-h2048 / tasks | 21.61 [20.64, 22.94] | 1.38 [1.18, 1.75] | 18.81 [17.97, 19.18] | 0.36 [0.31, 0.39] | 18.83 [17.22, 23.92] | 0.36 [0.35, 0.47] |
| n15-p1-large0-h2048 / overdue | 18.61 [17.63, 19.68] | 0.86 [0.79, 1.06] | 16.99 [15.66, 18.28] | 0.32 [0.22, 0.58] | 18.66 [16.91, 22.65] | 0.25 [0.22, 0.40] |
| n15-p1-large0-h2048 / projects | 20.74 [20.06, 24.27] | 0.33 [0.27, 0.44] | 18.33 [17.57, 18.98] | 0.14 [0.09, 0.33] | 17.80 [15.70, 18.85] | 0.12 [0.10, 0.20] |
| n15-p1-large0-h2048 / inbox | 19.64 [19.21, 20.09] | 0.36 [0.32, 0.40] | 16.84 [15.93, 18.46] | 0.30 [0.26, 0.41] | 20.53 [17.94, 21.87] | 0.28 [0.24, 0.41] |
| n15-p1-large0-h2048 / today | 17.31 [16.70, 17.78] | 0.61 [0.24, 0.69] | 19.94 [16.18, 23.07] | 0.24 [0.21, 0.33] | 16.70 [16.40, 20.98] | 0.20 [0.19, 0.28] |
| n15-p1-large0-h2048 / scheduled | 18.59 [18.47, 18.87] | 0.45 [0.27, 0.61] | 19.67 [17.96, 19.79] | 0.24 [0.20, 0.41] | 18.98 [17.85, 21.58] | 0.23 [0.19, 0.25] |
| n15-p1-large1-h32 / profiles | 4.13 [4.07, 4.58] | 2.03 [1.96, 2.30] | 1.50 [1.48, 1.57] | 0.17 [0.16, 0.21] | 1.16 [1.07, 1.20] | 0.25 [0.20, 0.29] |
| n15-p1-large1-h32 / tags | 2.25 [1.85, 2.67] | 0.49 [0.42, 0.56] | 1.34 [1.24, 1.96] | 0.13 [0.12, 0.14] | 1.43 [1.25, 1.76] | 0.15 [0.12, 0.25] |
| n15-p1-large1-h32 / tasks | 5.49 [5.31, 6.24] | 1.50 [1.37, 1.67] | 1.60 [1.48, 1.93] | 0.54 [0.50, 0.55] | 1.54 [1.51, 2.10] | 0.55 [0.52, 0.80] |
| n15-p1-large1-h32 / overdue | 2.27 [1.89, 2.54] | 1.04 [0.96, 1.26] | 2.11 [1.35, 4.98] | 0.50 [0.40, 0.62] | 1.16 [1.14, 2.06] | 0.41 [0.41, 0.69] |
| n15-p1-large1-h32 / projects | 1.63 [1.49, 1.73] | 0.28 [0.26, 0.63] | 1.70 [1.30, 2.43] | 0.14 [0.10, 0.29] | 2.87 [2.32, 3.04] | 0.14 [0.11, 0.37] |
| n15-p1-large1-h32 / inbox | 1.42 [1.37, 1.54] | 0.54 [0.53, 0.87] | 1.52 [1.20, 1.74] | 0.50 [0.44, 0.86] | 1.61 [1.56, 1.80] | 0.45 [0.38, 0.69] |
| n15-p1-large1-h32 / today | 4.33 [1.53, 4.44] | 0.44 [0.43, 0.73] | 1.51 [1.16, 1.98] | 3.01 [2.83, 3.73] | 1.26 [1.14, 1.50] | 2.60 [0.34, 3.06] |
| n15-p1-large1-h32 / scheduled | 2.25 [1.70, 3.94] | 0.49 [0.44, 0.61] | 1.32 [1.06, 1.88] | 0.54 [0.51, 0.66] | 1.14 [1.03, 1.25] | 0.67 [0.52, 2.28] |
| n15-p1-large1-h2048 / profiles | 25.08 [20.71, 28.53] | 2.16 [2.00, 2.30] | 17.19 [16.65, 19.09] | 0.20 [0.16, 0.61] | 16.82 [15.02, 19.08] | 0.16 [0.14, 0.17] |
| n15-p1-large1-h2048 / tags | 20.36 [16.66, 22.25] | 0.46 [0.44, 0.47] | 19.13 [16.25, 25.15] | 0.18 [0.13, 0.23] | 17.68 [16.19, 20.35] | 0.16 [0.12, 0.20] |
| n15-p1-large1-h2048 / tasks | 21.61 [20.77, 22.58] | 1.37 [1.30, 1.50] | 17.58 [16.48, 22.62] | 0.55 [0.43, 0.77] | 21.32 [19.74, 23.90] | 0.50 [0.44, 0.56] |
| n15-p1-large1-h2048 / overdue | 20.98 [19.58, 22.15] | 0.96 [0.88, 1.05] | 15.87 [15.03, 20.40] | 0.40 [0.36, 0.46] | 19.02 [18.27, 19.53] | 0.35 [0.33, 0.39] |
| n15-p1-large1-h2048 / projects | 21.06 [20.14, 21.58] | 0.28 [0.25, 0.37] | 16.68 [15.84, 17.80] | 0.11 [0.10, 0.18] | 18.99 [18.19, 21.83] | 0.11 [0.11, 0.15] |
| n15-p1-large1-h2048 / inbox | 19.26 [17.17, 20.07] | 0.51 [0.47, 2.69] | 17.52 [15.44, 18.87] | 0.42 [0.35, 0.57] | 18.23 [16.00, 20.01] | 0.39 [0.39, 0.50] |
| n15-p1-large1-h2048 / today | 18.89 [17.91, 19.67] | 0.55 [0.38, 2.33] | 18.12 [15.35, 19.27] | 0.33 [0.31, 1.08] | 16.83 [16.19, 18.68] | 0.37 [0.31, 0.45] |
| n15-p1-large1-h2048 / scheduled | 18.95 [18.23, 20.29] | 0.60 [0.39, 0.88] | 17.49 [16.94, 17.71] | 0.32 [0.28, 0.85] | 18.24 [15.92, 21.18] | 0.34 [0.31, 0.35] |
| n15-p8-large0-h32 / profiles | 26.75 [19.42, 28.53] | 2.80 [2.65, 2.92] | 17.96 [12.11, 18.53] | 0.46 [0.38, 0.95] | 16.30 [13.96, 16.76] | 0.35 [0.30, 0.54] |
| n15-p8-large0-h32 / tags | 2.55 [2.10, 2.64] | 0.61 [0.61, 0.79] | 2.52 [1.48, 4.25] | 0.27 [0.15, 0.97] | 2.68 [2.41, 5.39] | 0.14 [0.13, 0.21] |
| n15-p8-large0-h32 / tasks | 3.81 [3.15, 4.12] | 1.53 [1.38, 2.16] | 2.61 [2.48, 4.88] | 0.62 [0.38, 1.37] | 2.90 [2.42, 3.96] | 0.41 [0.35, 0.51] |
| n15-p8-large0-h32 / overdue | 2.60 [2.34, 3.48] | 1.10 [0.89, 1.44] | 1.77 [1.62, 1.88] | 0.49 [0.24, 0.58] | 2.02 [1.78, 2.39] | 0.26 [0.23, 0.34] |
| n15-p8-large0-h32 / projects | 2.24 [1.86, 3.19] | 0.52 [0.45, 0.68] | 1.70 [1.43, 4.06] | 0.17 [0.12, 0.20] | 1.82 [1.73, 2.96] | 0.12 [0.11, 0.18] |
| n15-p8-large0-h32 / inbox | 2.07 [1.61, 2.16] | 0.49 [0.44, 1.01] | 1.95 [1.53, 2.11] | 0.42 [0.28, 0.69] | 2.14 [1.83, 3.44] | 0.40 [0.26, 0.50] |
| n15-p8-large0-h32 / today | 1.91 [1.64, 3.56] | 0.52 [0.40, 0.78] | 1.81 [1.48, 2.30] | 0.29 [0.25, 0.51] | 1.93 [1.73, 3.49] | 0.32 [0.27, 0.53] |
| n15-p8-large0-h32 / scheduled | 3.36 [1.68, 5.08] | 0.42 [0.34, 0.49] | 2.18 [1.39, 3.67] | 0.29 [0.22, 0.51] | 2.52 [1.70, 3.30] | 0.29 [0.27, 0.69] |
| n15-p8-large0-h2048 / profiles | 166.30 [157.19, 183.94] | 2.54 [2.29, 3.12] | 147.09 [138.54, 155.39] | 0.35 [0.29, 0.51] | 171.91 [143.07, 208.32] | 0.33 [0.24, 0.68] |
| n15-p8-large0-h2048 / tags | 20.86 [19.85, 22.07] | 0.52 [0.50, 0.83] | 19.41 [16.04, 20.34] | 0.17 [0.13, 0.24] | 20.57 [15.32, 22.19] | 0.15 [0.13, 0.34] |
| n15-p8-large0-h2048 / tasks | 23.49 [19.00, 30.96] | 1.43 [1.13, 1.89] | 18.67 [18.12, 21.59] | 0.38 [0.31, 0.48] | 20.72 [17.12, 24.68] | 0.45 [0.33, 0.51] |
| n15-p8-large0-h2048 / overdue | 22.19 [21.18, 23.69] | 0.95 [0.71, 1.27] | 18.97 [17.12, 19.88] | 0.24 [0.19, 0.36] | 18.76 [16.97, 25.00] | 0.29 [0.22, 0.60] |
| n15-p8-large0-h2048 / projects | 20.44 [19.35, 21.26] | 0.39 [0.25, 0.48] | 17.83 [15.82, 22.36] | 0.11 [0.09, 0.17] | 20.39 [15.93, 23.46] | 0.14 [0.10, 0.35] |
| n15-p8-large0-h2048 / inbox | 18.95 [16.31, 20.22] | 0.40 [0.29, 0.46] | 18.55 [15.79, 21.94] | 0.33 [0.21, 0.37] | 22.32 [17.10, 22.87] | 0.29 [0.24, 0.64] |
| n15-p8-large0-h2048 / today | 17.93 [17.43, 19.96] | 0.30 [0.24, 0.53] | 19.04 [16.77, 22.56] | 0.23 [0.18, 0.26] | 20.17 [15.83, 26.93] | 0.22 [0.20, 0.41] |
| n15-p8-large0-h2048 / scheduled | 18.81 [17.53, 20.38] | 0.34 [0.23, 0.49] | 17.71 [16.39, 23.27] | 0.21 [0.16, 0.26] | 20.17 [19.06, 23.72] | 0.21 [0.18, 0.29] |
| n15-p8-large1-h32 / profiles | 26.67 [22.61, 29.45] | 2.31 [1.99, 2.45] | 20.99 [16.32, 21.90] | 0.35 [0.28, 0.42] | 20.63 [19.58, 23.67] | 0.35 [0.33, 0.60] |
| n15-p8-large1-h32 / tags | 2.60 [2.20, 4.83] | 0.48 [0.43, 0.64] | 2.01 [1.78, 2.31] | 0.14 [0.11, 0.16] | 2.54 [2.20, 2.59] | 0.22 [0.16, 0.37] |
| n15-p8-large1-h32 / tasks | 4.63 [4.30, 5.58] | 1.36 [1.23, 1.60] | 4.26 [2.45, 6.78] | 0.52 [0.40, 0.62] | 4.87 [4.30, 5.79] | 0.58 [0.53, 0.87] |
| n15-p8-large1-h32 / overdue | 3.08 [2.66, 3.23] | 1.10 [0.88, 1.25] | 2.21 [1.92, 2.68] | 2.61 [0.36, 3.23] | 2.48 [2.04, 3.27] | 2.90 [0.37, 3.59] |
| n15-p8-large1-h32 / projects | 2.70 [2.25, 2.91] | 0.34 [0.27, 0.38] | 2.41 [2.21, 3.32] | 0.22 [0.22, 0.29] | 2.52 [1.97, 2.86] | 0.24 [0.11, 0.41] |
| n15-p8-large1-h32 / inbox | 3.67 [3.23, 4.64] | 0.49 [0.46, 0.69] | 2.31 [2.09, 4.09] | 0.57 [0.50, 0.63] | 3.76 [2.56, 4.33] | 0.65 [0.51, 2.39] |
| n15-p8-large1-h32 / today | 2.22 [1.89, 2.69] | 0.43 [0.36, 0.70] | 2.43 [2.04, 4.50] | 0.40 [0.37, 0.48] | 2.92 [2.42, 6.75] | 0.49 [0.37, 0.57] |
| n15-p8-large1-h32 / scheduled | 2.90 [1.92, 3.08] | 0.44 [0.38, 0.60] | 2.08 [2.02, 2.30] | 0.34 [0.31, 0.48] | 2.35 [2.20, 3.58] | 0.36 [0.32, 0.39] |
| n15-p8-large1-h2048 / profiles | 144.83 [116.06, 202.11] | 2.25 [1.70, 4.16] | 139.16 [107.70, 165.97] | 0.51 [0.22, 0.55] | 113.18 [103.07, 141.21] | 0.20 [0.18, 0.24] |
| n15-p8-large1-h2048 / tags | 18.22 [15.63, 24.09] | 0.48 [0.37, 1.03] | 15.67 [13.04, 18.56] | 0.18 [0.10, 0.27] | 14.44 [13.35, 17.49] | 0.12 [0.09, 0.15] |
| n15-p8-large1-h2048 / tasks | 20.18 [14.57, 25.18] | 1.30 [0.98, 1.79] | 17.18 [16.10, 20.95] | 0.50 [0.34, 0.61] | 14.46 [13.15, 18.90] | 0.40 [0.34, 0.51] |
| n15-p8-large1-h2048 / overdue | 19.85 [15.23, 24.43] | 1.20 [0.66, 4.12] | 16.64 [12.28, 22.42] | 0.37 [0.26, 0.70] | 14.68 [13.60, 19.02] | 0.29 [0.24, 0.34] |
| n15-p8-large1-h2048 / projects | 17.55 [13.34, 21.39] | 0.34 [0.19, 0.65] | 18.18 [13.20, 30.53] | 0.11 [0.07, 0.21] | 13.86 [12.17, 17.60] | 0.09 [0.08, 0.14] |
| n15-p8-large1-h2048 / inbox | 18.46 [15.24, 24.99] | 0.66 [0.34, 0.79] | 18.64 [12.26, 23.45] | 0.38 [0.27, 0.52] | 15.28 [13.32, 18.67] | 0.32 [0.27, 0.32] |
| n15-p8-large1-h2048 / today | 19.91 [13.24, 20.32] | 0.51 [0.26, 0.87] | 16.58 [13.35, 20.79] | 0.30 [0.23, 0.40] | 15.19 [13.91, 16.35] | 0.26 [0.24, 0.37] |
| n15-p8-large1-h2048 / scheduled | 18.54 [14.53, 22.22] | 0.58 [0.34, 0.72] | 15.11 [14.01, 19.03] | 0.29 [0.23, 0.53] | 15.38 [12.25, 17.81] | 0.26 [0.22, 0.31] |
| n178-p1-large0-h32 / profiles | 5.52 [4.96, 12.95] | 2.17 [1.78, 2.76] | 2.93 [2.08, 3.33] | 0.36 [0.23, 0.48] | 2.75 [2.50, 4.85] | 0.25 [0.22, 0.48] |
| n178-p1-large0-h32 / tags | 6.31 [4.66, 7.70] | 0.57 [0.37, 0.97] | 4.33 [3.33, 8.05] | 0.15 [0.11, 0.20] | 2.85 [2.63, 5.07] | 0.16 [0.16, 0.50] |
| n178-p1-large0-h32 / tasks | 6.09 [4.55, 6.48] | 3.00 [2.38, 3.99] | 4.32 [3.29, 5.38] | 1.69 [1.40, 1.87] | 6.19 [5.72, 7.00] | 1.83 [1.74, 2.36] |
| n178-p1-large0-h32 / overdue | 3.75 [2.83, 4.36] | 1.76 [1.38, 2.33] | 2.62 [2.07, 3.78] | 1.10 [0.84, 1.50] | 3.05 [2.73, 4.55] | 1.26 [1.01, 2.34] |
| n178-p1-large0-h32 / projects | 3.40 [2.55, 5.50] | 0.37 [0.25, 0.57] | 2.97 [2.30, 4.19] | 0.18 [0.10, 0.19] | 2.88 [2.45, 5.06] | 0.18 [0.14, 0.39] |
| n178-p1-large0-h32 / inbox | 4.42 [3.18, 5.57] | 1.28 [1.03, 2.38] | 3.95 [2.46, 4.90] | 1.09 [0.86, 1.20] | 4.31 [3.05, 4.90] | 1.19 [1.09, 1.59] |
| n178-p1-large0-h32 / today | 2.67 [2.18, 3.19] | 2.86 [1.41, 4.11] | 2.89 [2.06, 4.83] | 0.92 [0.80, 1.11] | 2.92 [2.58, 4.61] | 0.99 [0.88, 1.98] |
| n178-p1-large0-h32 / scheduled | 2.66 [2.17, 2.99] | 1.21 [0.99, 1.43] | 3.02 [2.18, 3.15] | 0.91 [0.76, 1.19] | 3.06 [2.61, 5.40] | 0.95 [0.88, 1.55] |
| n178-p1-large0-h2048 / profiles | 31.53 [29.02, 35.40] | 2.31 [1.95, 2.78] | 26.21 [23.75, 28.93] | 0.25 [0.23, 0.49] | 23.26 [19.31, 30.64] | 0.24 [0.21, 0.64] |
| n178-p1-large0-h2048 / tags | 28.13 [25.36, 30.79] | 0.50 [0.41, 0.76] | 21.39 [19.45, 22.67] | 0.13 [0.12, 0.22] | 24.34 [22.91, 27.45] | 0.18 [0.12, 0.53] |
| n178-p1-large0-h2048 / tasks | 31.78 [27.59, 35.12] | 2.53 [2.34, 2.95] | 23.49 [21.77, 24.93] | 1.49 [1.44, 2.33] | 22.68 [22.10, 28.31] | 1.61 [1.40, 2.12] |
| n178-p1-large0-h2048 / overdue | 22.76 [21.31, 29.55] | 2.05 [1.69, 3.65] | 22.30 [20.72, 23.47] | 1.06 [0.82, 1.28] | 23.58 [20.44, 28.75] | 1.01 [0.83, 1.45] |
| n178-p1-large0-h2048 / projects | 23.18 [22.08, 26.50] | 0.39 [0.31, 0.49] | 20.32 [19.50, 23.16] | 0.15 [0.12, 0.25] | 23.35 [21.58, 25.92] | 0.15 [0.11, 0.32] |
| n178-p1-large0-h2048 / inbox | 26.26 [22.24, 28.86] | 1.16 [1.08, 1.39] | 22.48 [20.32, 23.92] | 1.11 [0.97, 3.59] | 22.08 [19.93, 25.80] | 1.26 [0.91, 3.25] |
| n178-p1-large0-h2048 / today | 24.13 [20.87, 27.50] | 0.91 [0.84, 1.20] | 21.30 [20.54, 27.41] | 0.92 [0.75, 1.84] | 23.59 [20.47, 25.93] | 1.00 [0.86, 1.35] |
| n178-p1-large0-h2048 / scheduled | 23.38 [20.98, 29.08] | 0.91 [0.84, 1.08] | 22.39 [19.20, 25.40] | 1.03 [0.73, 1.20] | 25.80 [21.14, 28.47] | 0.87 [0.81, 1.17] |
| n178-p1-large1-h32 / profiles | 9.12 [7.81, 10.06] | 2.21 [2.01, 3.56] | 3.06 [2.68, 4.85] | 0.26 [0.25, 0.56] | 2.78 [2.62, 3.87] | 0.26 [0.25, 0.31] |
| n178-p1-large1-h32 / tags | 4.20 [3.43, 5.09] | 0.48 [0.44, 0.95] | 3.54 [2.72, 4.33] | 0.14 [0.13, 0.20] | 3.40 [2.90, 3.61] | 0.17 [0.13, 0.53] |
| n178-p1-large1-h32 / tasks | 10.46 [7.07, 12.07] | 5.85 [4.86, 7.08] | 5.26 [4.62, 6.71] | 1.88 [1.66, 2.08] | 4.22 [3.97, 5.28] | 2.02 [1.82, 2.55] |
| n178-p1-large1-h32 / overdue | 5.10 [3.83, 5.33] | 2.37 [2.08, 3.32] | 3.41 [3.01, 4.03] | 2.57 [1.19, 4.40] | 2.86 [2.76, 3.28] | 2.49 [1.32, 2.94] |
| n178-p1-large1-h32 / projects | 6.65 [3.64, 9.24] | 0.58 [0.39, 0.97] | 3.07 [2.65, 5.30] | 0.22 [0.20, 0.39] | 3.06 [2.80, 4.09] | 0.24 [0.14, 0.26] |
| n178-p1-large1-h32 / inbox | 6.52 [3.34, 7.74] | 1.53 [1.38, 1.85] | 3.98 [3.07, 4.94] | 1.79 [1.31, 2.95] | 3.42 [2.98, 4.91] | 1.39 [1.37, 3.56] |
| n178-p1-large1-h32 / today | 3.48 [2.88, 4.93] | 1.17 [1.06, 1.64] | 5.15 [2.88, 7.11] | 1.33 [1.01, 3.31] | 2.83 [2.62, 4.30] | 1.08 [1.05, 1.48] |
| n178-p1-large1-h32 / scheduled | 3.55 [2.66, 11.04] | 1.18 [1.02, 1.88] | 3.56 [3.03, 6.13] | 1.54 [1.28, 1.67] | 2.89 [2.64, 4.07] | 1.12 [1.07, 1.25] |
| n178-p1-large1-h2048 / profiles | 27.14 [25.67, 31.54] | 2.67 [2.10, 2.97] | 22.75 [21.13, 24.79] | 0.31 [0.26, 0.56] | 25.41 [21.58, 25.82] | 0.21 [0.20, 0.49] |
| n178-p1-large1-h2048 / tags | 27.55 [23.96, 29.17] | 0.52 [0.44, 0.88] | 24.09 [20.95, 26.78] | 0.14 [0.13, 0.23] | 23.45 [22.82, 24.79] | 0.15 [0.14, 0.38] |
| n178-p1-large1-h2048 / tasks | 32.94 [27.38, 36.84] | 2.98 [2.66, 3.70] | 26.68 [23.18, 29.86] | 1.72 [1.65, 2.29] | 26.03 [21.82, 30.19] | 1.71 [1.60, 2.67] |
| n178-p1-large1-h2048 / overdue | 27.36 [23.09, 34.29] | 2.84 [2.29, 3.41] | 22.73 [20.42, 26.16] | 1.05 [1.02, 2.90] | 23.32 [22.14, 25.94] | 0.98 [0.95, 1.58] |
| n178-p1-large1-h2048 / projects | 24.18 [23.75, 56.84] | 0.52 [0.36, 1.11] | 21.83 [21.78, 25.19] | 0.14 [0.11, 0.60] | 21.79 [20.45, 24.41] | 0.14 [0.12, 0.23] |
| n178-p1-large1-h2048 / inbox | 23.99 [22.19, 31.64] | 1.47 [1.26, 3.65] | 22.60 [20.29, 25.24] | 1.18 [1.05, 1.73] | 24.67 [23.17, 29.24] | 1.03 [0.97, 1.51] |
| n178-p1-large1-h2048 / today | 24.40 [22.68, 27.15] | 1.43 [0.99, 3.33] | 22.07 [20.68, 57.15] | 1.05 [0.93, 1.60] | 26.03 [19.90, 29.77] | 1.05 [0.96, 1.26] |
| n178-p1-large1-h2048 / scheduled | 23.58 [23.25, 25.39] | 1.28 [1.01, 1.61] | 22.96 [22.00, 35.87] | 1.15 [1.00, 1.60] | 23.22 [21.86, 24.99] | 0.99 [0.94, 1.23] |
| n178-p8-large0-h32 / profiles | 158.61 [137.70, 169.27] | 2.80 [2.68, 3.49] | 126.61 [124.47, 142.08] | 1.07 [0.95, 1.44] | 138.95 [125.66, 156.23] | 1.15 [0.92, 1.25] |
| n178-p8-large0-h32 / tags | 18.89 [17.79, 19.91] | 0.56 [0.44, 0.73] | 17.26 [14.44, 20.42] | 0.16 [0.13, 0.28] | 19.87 [17.56, 20.95] | 0.25 [0.14, 0.35] |
| n178-p8-large0-h32 / tasks | 28.95 [23.78, 30.35] | 2.71 [2.39, 3.10] | 24.98 [21.82, 70.42] | 1.67 [1.47, 2.05] | 28.00 [25.42, 29.54] | 1.78 [1.65, 1.99] |
| n178-p8-large0-h32 / overdue | 17.77 [16.11, 19.20] | 2.67 [1.59, 3.44] | 16.30 [15.03, 19.67] | 0.97 [0.81, 1.23] | 17.38 [16.27, 21.55] | 0.99 [0.87, 1.31] |
| n178-p8-large0-h32 / projects | 18.81 [15.82, 21.91] | 0.50 [0.44, 0.81] | 15.06 [13.99, 17.71] | 0.14 [0.10, 0.24] | 18.21 [15.01, 18.68] | 0.13 [0.13, 0.18] |
| n178-p8-large0-h32 / inbox | 15.91 [14.70, 17.53] | 1.32 [1.14, 2.08] | 16.31 [13.97, 18.18] | 0.90 [0.84, 1.11] | 17.61 [16.54, 23.51] | 1.04 [0.95, 1.28] |
| n178-p8-large0-h32 / today | 16.51 [15.51, 17.63] | 1.30 [0.99, 2.20] | 16.18 [15.24, 18.95] | 0.82 [0.72, 0.86] | 16.26 [13.82, 19.07] | 0.98 [0.83, 1.12] |
| n178-p8-large0-h32 / scheduled | 15.69 [15.42, 19.47] | 1.12 [0.90, 1.34] | 15.44 [14.77, 18.90] | 0.83 [0.75, 1.05] | 17.72 [15.68, 20.20] | 1.04 [0.90, 1.47] |
| n178-p8-large0-h2048 / profiles | 307.75 [291.91, 330.23] | 3.25 [2.78, 4.43] | 283.46 [270.35, 323.67] | 1.07 [0.99, 1.35] | 245.97 [236.13, 284.57] | 1.09 [0.69, 1.20] |
| n178-p8-large0-h2048 / tags | 35.33 [32.87, 40.71] | 0.51 [0.43, 0.90] | 35.71 [33.53, 41.37] | 0.19 [0.14, 0.23] | 29.88 [29.35, 41.12] | 0.20 [0.12, 0.53] |
| n178-p8-large0-h2048 / tasks | 45.28 [41.84, 50.79] | 2.42 [2.28, 3.06] | 48.59 [40.44, 53.28] | 1.70 [1.42, 2.17] | 37.39 [34.68, 49.34] | 1.63 [1.28, 2.77] |
| n178-p8-large0-h2048 / overdue | 35.77 [30.85, 44.37] | 1.66 [1.51, 1.96] | 37.03 [30.24, 48.90] | 1.19 [0.82, 1.69] | 30.02 [27.33, 36.13] | 1.07 [0.78, 1.25] |
| n178-p8-large0-h2048 / projects | 34.29 [30.68, 40.94] | 0.36 [0.27, 0.58] | 36.58 [34.70, 42.40] | 0.15 [0.11, 0.46] | 30.49 [26.98, 34.30] | 0.19 [0.11, 0.21] |
| n178-p8-large0-h2048 / inbox | 37.96 [29.05, 46.07] | 1.15 [0.97, 1.51] | 40.06 [33.85, 42.55] | 1.00 [0.92, 1.33] | 31.10 [29.17, 37.95] | 0.97 [0.78, 1.55] |
| n178-p8-large0-h2048 / today | 33.36 [28.24, 47.98] | 1.02 [0.79, 1.29] | 36.27 [30.21, 58.19] | 0.87 [0.76, 1.03] | 31.21 [28.83, 34.04] | 0.80 [0.64, 1.35] |
| n178-p8-large0-h2048 / scheduled | 35.95 [28.55, 45.02] | 0.93 [0.79, 1.57] | 35.61 [30.93, 38.54] | 0.89 [0.78, 1.09] | 29.57 [27.97, 33.23] | 0.81 [0.65, 1.37] |
| n178-p8-large1-h32 / profiles | 141.05 [103.10, 162.59] | 2.33 [2.19, 3.37] | 111.39 [90.13, 148.68] | 0.87 [0.80, 1.52] | 98.01 [88.17, 105.23] | 0.75 [0.72, 1.51] |
| n178-p8-large1-h32 / tags | 15.75 [11.08, 16.35] | 0.40 [0.33, 1.22] | 14.13 [11.67, 17.26] | 0.11 [0.09, 0.23] | 11.95 [10.67, 12.94] | 0.10 [0.09, 0.12] |
| n178-p8-large1-h32 / tasks | 23.28 [17.37, 26.69] | 1.94 [1.82, 3.23] | 18.82 [16.49, 27.21] | 4.70 [4.13, 7.44] | 17.97 [16.15, 18.58] | 4.06 [3.73, 4.32] |
| n178-p8-large1-h32 / overdue | 14.41 [11.28, 17.73] | 1.20 [1.18, 1.98] | 12.60 [10.04, 24.06] | 0.99 [0.90, 1.52] | 12.14 [10.54, 12.70] | 0.88 [0.85, 1.09] |
| n178-p8-large1-h32 / projects | 15.76 [10.61, 15.99] | 0.22 [0.21, 0.78] | 13.79 [10.97, 18.56] | 0.13 [0.10, 0.19] | 13.57 [11.23, 15.41] | 0.11 [0.10, 0.16] |
| n178-p8-large1-h32 / inbox | 14.03 [10.93, 16.35] | 0.90 [0.87, 1.67] | 12.56 [10.40, 17.05] | 0.82 [0.75, 1.49] | 11.62 [10.63, 16.20] | 0.78 [0.73, 0.87] |
| n178-p8-large1-h32 / today | 14.90 [10.83, 18.88] | 0.80 [0.75, 1.58] | 14.10 [11.25, 26.67] | 0.74 [0.64, 1.21] | 12.00 [11.38, 13.21] | 0.67 [0.65, 0.68] |
| n178-p8-large1-h32 / scheduled | 14.82 [10.91, 16.68] | 0.73 [0.70, 1.45] | 13.38 [10.99, 43.86] | 0.72 [0.67, 1.14] | 11.28 [10.20, 13.22] | 0.68 [0.65, 0.73] |
| n178-p8-large1-h2048 / profiles | 203.94 [199.94, 217.50] | 2.13 [2.08, 2.31] | 196.66 [194.12, 201.26] | 0.75 [0.69, 0.93] | 273.89 [247.06, 304.08] | 0.85 [0.78, 0.97] |
| n178-p8-large1-h2048 / tags | 25.10 [23.64, 29.02] | 0.33 [0.30, 0.35] | 24.51 [23.28, 24.74] | 0.10 [0.10, 0.17] | 31.72 [29.81, 39.15] | 0.12 [0.10, 0.13] |
| n178-p8-large1-h2048 / tasks | 30.42 [29.52, 33.41] | 1.85 [1.79, 1.99] | 30.39 [28.79, 31.99] | 1.21 [1.09, 1.26] | 38.02 [35.15, 42.62] | 1.44 [1.36, 1.51] |
| n178-p8-large1-h2048 / overdue | 24.50 [23.68, 30.88] | 1.16 [1.11, 1.27] | 24.85 [22.73, 26.03] | 0.70 [0.67, 0.79] | 30.78 [27.87, 33.97] | 0.86 [0.85, 0.94] |
| n178-p8-large1-h2048 / projects | 25.10 [23.60, 37.24] | 0.20 [0.19, 0.21] | 24.80 [23.83, 25.48] | 0.08 [0.07, 0.11] | 30.23 [28.37, 34.31] | 0.10 [0.09, 0.13] |
| n178-p8-large1-h2048 / inbox | 24.95 [23.63, 33.30] | 0.83 [0.81, 1.03] | 24.79 [23.67, 26.74] | 0.73 [0.72, 0.83] | 30.60 [28.43, 33.69] | 0.94 [0.92, 1.07] |
| n178-p8-large1-h2048 / today | 24.77 [23.52, 25.60] | 0.70 [0.67, 1.20] | 24.76 [23.48, 25.26] | 0.64 [0.63, 0.73] | 30.82 [28.61, 36.03] | 0.83 [0.78, 0.96] |
| n178-p8-large1-h2048 / scheduled | 24.88 [24.05, 25.91] | 0.72 [0.67, 1.00] | 25.00 [23.30, 26.71] | 0.69 [0.64, 0.82] | 30.47 [28.19, 35.59] | 0.84 [0.79, 0.89] |
| n178-p8-empty-large0-h2048 / profiles | 182.26 [175.52, 292.47] | 2.58 [1.91, 2.97] | 182.30 [153.21, 299.90] | 0.60 [0.31, 0.99] | 225.76 [209.85, 255.55] | 0.66 [0.43, 0.86] |
| n178-p8-empty-large0-h2048 / tags | 22.34 [20.22, 30.18] | 0.58 [0.41, 0.76] | 24.31 [18.23, 38.66] | 0.17 [0.13, 0.49] | 31.14 [25.40, 34.65] | 0.35 [0.24, 0.51] |
| n178-p8-empty-large0-h2048 / tasks | 26.29 [23.64, 34.24] | 2.80 [2.18, 3.35] | 22.08 [19.70, 41.46] | 1.56 [1.34, 4.32] | 32.69 [28.73, 34.64] | 2.58 [2.04, 3.62] |
| n178-p8-empty-large0-h2048 / overdue | 25.64 [20.72, 31.41] | 3.09 [1.82, 4.90] | 23.27 [19.21, 38.93] | 0.98 [0.78, 1.85] | 34.12 [26.20, 38.75] | 1.34 [1.27, 1.79] |
| n178-p8-empty-large0-h2048 / projects | 24.30 [22.18, 27.79] | 0.39 [0.33, 0.65] | 22.13 [18.64, 33.85] | 0.14 [0.12, 0.28] | 29.17 [24.57, 39.89] | 0.24 [0.22, 0.31] |
| n178-p8-empty-large0-h2048 / inbox | 22.83 [18.09, 33.78] | 1.30 [1.06, 1.73] | 22.57 [20.38, 35.07] | 0.95 [0.87, 3.85] | 30.13 [24.70, 37.90] | 1.85 [1.34, 2.03] |
| n178-p8-empty-large0-h2048 / today | 24.79 [19.63, 37.68] | 1.02 [0.81, 2.19] | 22.82 [18.43, 33.11] | 0.85 [0.77, 1.65] | 28.56 [27.00, 32.06] | 1.35 [1.02, 1.90] |
| n178-p8-empty-large0-h2048 / scheduled | 23.26 [19.82, 36.19] | 1.02 [0.79, 3.01] | 25.10 [18.32, 31.92] | 1.01 [0.80, 4.44] | 29.35 [25.10, 35.53] | 1.33 [1.05, 1.94] |
| n178-p8-empty-large1-h2048 / profiles | 234.73 [234.67, 326.60] | 2.73 [2.21, 4.37] | 218.48 [211.41, 254.24] | 0.63 [0.41, 0.74] | 199.37 [174.33, 210.16] | 0.48 [0.35, 0.61] |
| n178-p8-empty-large1-h2048 / tags | 28.04 [25.97, 38.76] | 0.59 [0.42, 1.19] | 27.25 [25.59, 29.50] | 0.40 [0.15, 0.44] | 25.51 [22.44, 34.94] | 0.18 [0.11, 0.32] |
| n178-p8-empty-large1-h2048 / tasks | 31.96 [30.35, 42.02] | 3.36 [2.50, 5.76] | 29.38 [27.19, 42.84] | 2.61 [1.72, 3.32] | 26.55 [23.89, 30.31] | 1.91 [1.57, 2.06] |
| n178-p8-empty-large1-h2048 / overdue | 28.59 [27.29, 34.70] | 2.79 [1.88, 5.81] | 29.64 [24.49, 37.44] | 1.47 [1.02, 3.04] | 26.00 [23.62, 29.01] | 1.14 [1.01, 1.39] |
| n178-p8-empty-large1-h2048 / projects | 25.63 [24.93, 29.52] | 0.48 [0.34, 0.81] | 25.39 [25.17, 41.72] | 0.24 [0.11, 0.37] | 25.67 [23.60, 26.05] | 0.14 [0.12, 0.33] |
| n178-p8-empty-large1-h2048 / inbox | 27.30 [25.13, 62.50] | 1.88 [1.17, 2.54] | 26.88 [25.90, 29.57] | 1.51 [1.00, 2.53] | 23.08 [21.20, 28.23] | 1.11 [1.04, 2.02] |
| n178-p8-empty-large1-h2048 / today | 27.43 [26.60, 33.78] | 1.40 [0.97, 2.27] | 27.48 [24.94, 32.59] | 1.39 [0.90, 2.07] | 24.37 [23.27, 28.02] | 1.01 [0.89, 1.93] |
| n178-p8-empty-large1-h2048 / scheduled | 27.80 [25.55, 37.84] | 1.65 [0.92, 2.35] | 25.95 [25.06, 29.16] | 1.40 [1.05, 2.52] | 25.31 [21.53, 29.00] | 1.24 [0.96, 1.48] |

## Immediate-transaction audit

No existing immediate authorization/writer transaction was converted. [OperationStore.transaction](../../../packages/domain/src/store/store.ts) still calls immediate, has a synchronous callback, and keeps the same projection-write guard lifetime. Discovery's existing readSnapshot stays deferred. Graph reads remain deferred. The new SSE selection uses an explicit deferred read snapshot solely to pair the global cursor with selected rows; this replaces the old single implicit read snapshot and changes no auth/write admission mode.

The current read waits synchronously for BEGIN IMMEDIATE before credential lookup. This blocks that server process's JS dispatch while SQLite waits. perform obtains its Clock value before admission; a long wait therefore retains the old pre-wait expiry time. The new Profile count loop preserves fresh per-Profile expiry checks. These temporal details were audited, not changed. A failure to acquire the writer lock maps to the existing generic 500/exit-1 storage error, not rejected-auth History.

A separate owned process held BEGIN IMMEDIATE on the same scratch database. These are individual mechanism controls, not medians. A 4,900 ms hold produced a near-five-second 200 on both paths. A 5,300 ms hold exhausted the unchanged 5,000 ms busy timeout and returned 500:

| Build | Writer hold ms | Status | Handler ms | HTTP body-end ms |
| --- | ---: | ---: | ---: | ---: |
| before | 0 | 200 | 4.87 | 16.05 |
| before | 4900 | 200 | 4905.80 | 4906.88 |
| before | 5300 | 500 | 5006.53 | 5010.98 |
| after | 0 | 200 | 4.95 | 19.08 |
| after | 4900 | 200 | 4900.67 | 4903.71 |
| after | 5300 | 500 | 5003.39 | 5006.53 |

This reproduces a successful near-five-second wait. It does not establish who held the lock during the owner's 5,105 ms incident. The actual duration of each product holder below was not measured on owner data. They are source-supported candidates, not findings about that incident.

| Holder or candidate | Live writer admission and work |
| --- | --- |
| Owner Snapshot create/daily | Snapshots.create wraps createSync in the live immediate transaction. Serialization, copy compaction, counts/checksum, file fsync/rename and manifest durability run before release. A large database or slow filesystem can prolong it. |
| Restore, including dry run | The restore transaction covers verification/staging, migrations/redaction, pre-restore Snapshot, durable Purge union, table/trigger replacement and FK checks. It can hold the live writer while also working on copies. |
| Purge | appendSync validates under the writer, creates pre-purge Snapshot, redacts every stored Snapshot, appends/applies and redacts live History before release. No change was made to this guarantee. |
| Migration/open/rebuild/checkpoint | Constructor migration and pre-migration Snapshot share immediate admission. Rebuild decodes/replays under the writer; internal checkpoints serialize current state under it. The paths are unbounded with data size. |
| Import and other CLI writers | Import's pre-change Snapshot and per-Task mutate transactions can hold the same live lock. Each Task normally releases it separately. Large metadata/graph/History work in a command can extend a single hold. A separate process can contend with the server. |
| Scheduler | runDue scans Tasks and applies wake/reminder work under immediate; nextAt/pendingReminders also scan under it; credential cleanup and daily Snapshot/prune have immediate work. Same-process synchronous work delays dispatch or execution between stages; it cannot overlap a synchronous transaction callback. Another server/scheduler process can hold the shared writer lock. |
| Checkpoint, VACUUM and backup distinctions | Explicit compact uses checkpoint/journal-mode/VACUUM on Snapshot/staging copies; the surrounding live Snapshot/restore/Purge transaction may remain held. Commit fsync/automatic checkpoint work can add delay. The installer's SQLite .backup is a source reader and destination writer, not itself a live BEGIN IMMEDIATE holder. It was inspected, never run. |

These distinctions follow [SQLite transaction semantics](https://sqlite.org/lang_transaction.html), [WAL concurrency/checkpoint behavior](https://sqlite.org/wal.html) and [the backup API's source/destination locks](https://sqlite.org/backup.html). The code-specific live-lock lifetimes come from store.ts, snapshots.ts, scheduled-work.ts, auth.ts and import-tasks.ts.

### Smallest safe deferred-read proposal, not implemented

For pure current-state reads, a dedicated deferred read boundary can preserve coherent credential/projection state if it performs credential checks and every required query in one fresh synchronous snapshot. A concurrent revocation committed before that snapshot is rejected; an overlapping later revocation is observed next request. Existing discovery already accepts that snapshot boundary. Successful credential last-use remains in memory. On AuthError, close/roll back the read snapshot first, then record rejection through the existing short immediate transaction. Never try to upgrade the stale snapshot into a rejection write.

Read-your-writes holds when the fresh snapshot starts after the write commit; never retain a read transaction across request/search yields. Keep mutations, sign-in, Snapshot/restore/Purge and their authorization rules on the writer path. Do not globally change perform, requireOwner or authenticate: callers also authorize writes and streams. For Task lists, include metadata and graph capture in the same new boundary, then run yielding search outside it.

SSE needs a separate coherent generation/cursor/event decision and must retain the ProfileDeleted-before-revocation-close behavior. A blanket deferred replacement would not prove that guarantee. Keep current SSE auth admission until that boundary has explicit concurrent revocation/restore/deletion controls. Re-run rejected-auth attribution, last-use, fresh-after-write, WAL revocation, restore-generation/cursor and cancellation controls before shipping the proposal. No existing transaction mode is changed here.

## Commands and real exits

Every full root attempt used the standing lock and a successful disk guard first. No compiler or verification failure is treated as a pass:

| Attempt | Exact command after `sh scripts/disk-guard.sh` | Exit | Result |
| --- | --- | ---: | --- |
| root-1 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 1 | Fixture type error |
| root-2 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 1 | Formatting during iteration |
| root-3 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0 | 386 domain, 69 CLI, 32 server, 168 Electron; one skip |
| root-4 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0 | Same complete suite |
| root-5 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0 | Same complete suite after fixture hardening |
| root-6 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0 | Same complete suite on product 43c75117 |
| root-7 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 1 | Two unchanged Electron compiler-wrapper tests hit 5 s deadlines while other controls ran |
| root-8 | `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0 | 387 domain, 69 CLI, 32 server, 168 Electron; one skip, product 35d67908 |

The initial compiled recipes below ran on product 7a90388d. Their repeated final recipes ran on 35d67908. Each receives a fresh evidence directory. Final recipes use TODO_CLI_BINARY, TODO_SERVER_BINARY and TODO_SEED_BINARY from the frozen scope-build.json, with TODO_BINARY_PROVENANCE pointing to that same manifest. The wrapper only reuses that compiled seed when a shell recipe asks to compile the identical seed source. Exact argv, exits and cleanup are retained in the listed receipts under `docs/evidence/ui-speed/server-reads`:

| Recipe or command | Exit | Local receipt |
| --- | ---: | --- |
| `sh .agents/skills/verify-op-log/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-2/op-log"` | 0 | `skills-2/op-log` |
| `sh .agents/skills/verify-auth/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-2/auth"` | 0 | `skills-2/auth` |
| `sh .agents/skills/verify-recurrence/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-2/recurrence"` | 0 | `skills-2/recurrence` |
| `sh .agents/skills/verify-server-api/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-2/server-api"` | 0 | `skills-2/server-api` |
| `sh .agents/skills/verify-server-api/scripts/verify-reads.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-2/server-reads"` | 0 | `skills-2/server-reads` |
| `sh .agents/skills/verify-profiles/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-3/profiles"` | 0 | `skills-3/profiles` |
| `sh .agents/skills/verify-filters/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-3/filters"` | 0 | `skills-3/filters` |
| `sh .agents/skills/verify-snapshots/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-3/snapshots"` | 0 | `skills-3/snapshots` |
| `sh .agents/skills/verify-sse/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-3/sse" "$TODO_CLI_BINARY"` | 0 | `skills-3/sse` |
| `sh .agents/skills/verify-cli/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-4/cli"` | 0 | `skills-4/cli` |
| `bun --define 'TODO_BUILD_ID="7a90388d"' .agents/skills/verify-attachments/scripts/drive.ts "$PWD/docs/evidence/ui-speed/server-reads/skills-6/attachments"` | 0 | `skills-6/attachments` |
| `bun --define 'TODO_BUILD_ID="7a90388d"' .agents/skills/verify-attachments/scripts/cli01.ts "$PWD/docs/evidence/ui-speed/server-reads/skills-6/attachment-groups"` | 0 | `skills-6/attachment-groups` |
| `sh .agents/skills/verify-dag/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-6/dag"` | 0 | `skills-6/dag` |
| `sh .agents/skills/verify-dag/scripts/verify-public.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-6/dag-public"` | 0 | `skills-6/dag-public` |
| `sh .agents/skills/verify-discovery/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-6/discovery"` | 0 | `skills-6/discovery` |
| AtomicCAS sensitivity, two behavioral failures and exact restoration | 0 | `atomicity-sensitivity.log` |
| Final `bun .agents/skills/verify-occ-atomicity/check.ts` | 0 | `atomicity-final.log` |
| Compiled SSE cursor proof on 43c75117 | 0 | `sse-delivery.log` |
| Compiled restore/SSE proof on 43c75117 | 0 | `snapshots-delivery.log` |
| Full 56-checkpoint differential on 35d67908 | 0 | `control-scope-final.log` |
| Audited lifecycle differential, all event kinds | 0 | `control-scope-rich.log` |
| Paired factorial, both orders, five pairs | 0 | `benchmark-scope-final.log` |
| Near-five-second external writer control | 0 | `lock-scope-final.log` |
| Final fixture typecheck | 0 | `fixture-audit-typecheck-2.log` |
| `sh .agents/skills/verify-auth/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/auth"` | 0 | `skills-scope-final/auth` |
| `sh .agents/skills/verify-server-api/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/server-api"` | 0 | `skills-scope-final/server-api` |
| `sh .agents/skills/verify-server-api/scripts/verify-reads.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/server-reads"` | 0 | `skills-scope-final/server-reads` |
| `sh .agents/skills/verify-profiles/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/profiles"` | 0 | `skills-scope-final/profiles` |
| `sh .agents/skills/verify-snapshots/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/snapshots"` | 0 | `skills-scope-final/snapshots` |
| `sh .agents/skills/verify-sse/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/sse" "$TODO_CLI_BINARY"` | 0 | `skills-scope-final/sse` |
| `sh .agents/skills/verify-discovery/scripts/verify.sh "$PWD/docs/evidence/ui-speed/server-reads/skills-scope-final/discovery"` | 0 | `skills-scope-final/discovery` |
| `pnpm --filter @todo/domain test client-projection.test.ts` after fix | 0 | `scope-boundary-after.log` |
| `bun .agents/skills/verify-cli/scripts/cache-binaries.ts` | 0 | `scope-build.log` |

Reproduction commands, run from this checkout with a read-only source checkout supplied as COLD_PATH_CHECKOUT:

```sh
bun apps/server/scripts/prepare-read-benchmark.ts "$COLD_PATH_CHECKOUT"
sh scripts/disk-guard.sh
bun apps/server/scripts/build-read-control.ts before .scratch/bin/read-timing-before
sh scripts/disk-guard.sh
bun apps/server/scripts/build-read-control.ts after .scratch/bin/read-timing-after
bun apps/server/scripts/read-fixture.ts .scratch/server-reads/rich-audited
bun apps/server/scripts/read-control.ts .scratch/bin/read-timing-before .scratch/bin/read-timing-after .scratch/server-reads/checkpoints/fixtures.json docs/evidence/ui-speed/server-reads/control-scope-final
bun apps/server/scripts/read-control.ts .scratch/bin/read-timing-before .scratch/bin/read-timing-after .scratch/server-reads/rich-audited/fixtures.json docs/evidence/ui-speed/server-reads/control-scope-rich
COLD_ONLY="n15-p1-large0-h32,n15-p1-large0-h2048,n15-p1-large1-h32,n15-p1-large1-h2048,n15-p8-large0-h32,n15-p8-large0-h2048,n15-p8-large1-h32,n15-p8-large1-h2048,n178-p1-large0-h32,n178-p1-large0-h2048,n178-p1-large1-h32,n178-p1-large1-h2048,n178-p8-large0-h32,n178-p8-large0-h2048,n178-p8-large1-h32,n178-p8-large1-h2048,n178-p8-empty-large0-h2048,n178-p8-empty-large1-h2048"
READ_CONTROL_REAL_TIME=1 COLD_PAIRS=5 COLD_FIRST= COLD_ONLY="$COLD_ONLY" /usr/bin/lockf -k /tmp/todo-server-read-timing.lock bun .scratch/server-reads/harness/cold-path.ts ambient .scratch/server-reads/checkpoints docs/evidence/ui-speed/server-reads/benchmark-scope-final
```

COLD_ONLY is the 16 corner ids plus n178-p8-empty-large0-h2048 and n178-p8-empty-large1-h2048, generated from the copied manifest. Use fresh evidence destinations. The final sweep and both accepted controls exit 0. Normal compiled source provenance and SHA-256 binary hashes are in final-binaries.json; the source hash is ee0325ce5941a71ae774d6d37b9812608e146d845fa29934464cde426c95bc27. The reproducible lock control is retained locally at `.scratch/server-reads/lock-scope-final.ts` with exact holds/status assertions. No absolute machine path is tracked. Root attempt 8 sets the two binary overrides above, runs sh scripts/disk-guard.sh, then exactly /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check.

Earlier failures remain local. The first control build could not resolve a server-only dependency from the skill folder, exit 1; moving the helper into apps/server fixed resolution. A version-flag probe of the test-only helper lacked TODO_DB and exited 1 before opening a database. An early lifecycle creation used the wrong Attachment input shape and failed, exit 1. Later fixture audit found a malformed Purge had been rejected; its earlier coverage claim is excluded and the audited seeder now asserts success and every event kind. The first timer fixture copied an inherited clock method incorrectly; SSE exposed clock.sleep missing. The corrected helper explicitly supplies clock methods, and the final byte control and timing sweep use it. Iterative helper type/format failures remain in their individual logs.

The first recipe batch's local compiler wrapper forwarded the wrong argv, exit 1; its repaired batch passed. Profile schema 6 versus 7 and the expired-row cleanup race failed as described above before fixture corrections. Two Attachment setup attempts had mismatched dev/stamped build identities, exit 1; explicit fixed binary provenance and matching build define preserved the strict health assertion and passed. Root attempt 7 hit the unchanged five-second deadlines in Electron's fake compiler/delegate wrapper tests while this worker's other controls ran. No timeout was relaxed; the complete root suite was repeated after those controls stopped. The initial AtomicCAS run completed behavior then failed only the source pin, exit 1. The reviewed movement mapping, sensitivity and final command passed. The no-decode, cursor and authorization-boundary red controls each exited 1 at their intended literal assertion; corrected candidates exited 0.

## Limits and cleanup

SQL narrows Task/catalog/graph reads by Profile; shared domain code still applies Task and planning filters. Show reuses its Profile list/graph computation. This unit does not add per-Task SQL pushdown. This is not a formal equivalence proof over every possible database, Unicode id or event ordering. It covers the 56 checkpoints, the audited all-kind lifecycle fixture, literal regression controls and compiled subsystem workflows. Physical SQLite recording time, process Diagnostics values, production build id and installed UI rendering are not byte-invariance claims. Full immutable DAG-F qualification was not renewed for this read-only change; graph algorithms/models and writer logic are unchanged, while compiled public graph and replay proofs passed. Independent review seats and a fresh native session are not claimed; the worker's explicit no-children/no-native limits took precedence.

The 20 ms input-to-render median and 300 ms p99 objective is not certified by handler medians. No real database, credential, installed server, app, Swift, Keychain or signing operation was used. Python appeared only inside existing verification recipes, not as a replacement for a missing Todo CLI capability. All database, file and process work belongs to private scratch directories. All owned servers/readers/writer lockers exited; recipe cleanup receipts survive. No CPU-pressure workers were launched.

The initial cleanup scan removed 35 closed owned Bun compile temporaries, 3,103,130,240 bytes, after lsof checks; open files were skipped. The final scan removed 13 further closed files, 1,152,591,232 bytes. Final free space was 36.5 GB. The process audit found no owned cached-binary process and no compile temporary remaining. The receipts are retained locally. All evidence, binary hashes, fixtures, private credentials and bulk replies remain ignored. The final no-comments review was performed directly because the explicit single-worker/no-children instruction forbids the skill's delegated reviewer; no new product comments or suppressions were added.
