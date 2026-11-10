# DAG-S SwiftUI unit

Status: implementation and final proof in progress. No delivery or self-approval
claim. Branch `feat/task-dag-s-swiftui`, qualified base
`2c78a3263c196d870459b17bf647cfc23f421fdd`. Product, proof and delivery SHAs
will be recorded after the committed-source proof. No domain files were added.
No HttpApi or generated-file change was made. Contract remains
`858612b6feba4e359ee28749b70119a36b3909ad20459ef15f82286f1b80b829`.

Native state and views reuse TodoModel, TaskRow, the filter sheet, quick add,
editor, Conflict, History and report cards. They cover immediate relation writes,
per-dependent Versions, initial and first-Occurrence Dependencies, follow-up,
reviewed Delete, batch preview/apply, Move/Copy reports and typed History deltas.
The domain owns validation, ordering, Energy and graph sets. The native graph
owns scoped publication, viewport, selection, expansion and focus. The browser
only renders canonical Pele output from local bundle resources.

Canonical downstream source was materialized from L1's exact immutable packets:

| E source | Local checkpoint | Lock |
| --- | --- | --- |
| `965079cfd6652089c491eea2bd6d6682179b0795` | `58b49611dafddca647bc4acdcc25da73ab9087b0` | `603b5b168f3135b93e5e10c91f01c28d0923fe9fd91e536dca81e4e154354b65` |
| `5c0beaeb3f97aea8cebf4fc0d3c3351bc5cfb2b6` | `81ea00de55ef7eaa92ff1c4aa221482dd3274047` | `799463f87110838ca404392a64cde5aaf084e9b1c4a117053c16b93aa2d84c1b` |
| `e7902582c3579d503ed9161278629e4899a92201` | `c4c3bece1196a0c06887fe83e8418877a40d45c8` | `a5cbe706b2cd37ace4752427d4aa9e06e5dfa7736f1ec6a717559135807cdaca` |

The current source has graph.js 237434 bytes, SHA256
`154d482499c619c206ddacf4791e26e9d0470088b789f6235784aad813e1d053`.
The 1934-byte MIT/ISC notice remains
`311bccc30de6f7b9cbfb64232bb0c911ccb2191abe316550813ae25b2c7925b9`.
All eleven source blobs matched each handoff. No emitted output is tracked,
no E UI was imported and no second renderer was created. The Mac build runs
E's builder, checks its lock, copies all four files and checks the copy. The
copy/build operation uses the shared Electron output lock under the Swift slot.

The coordinator approved checkpoint 1 with S1-S8 corrections, then approved
checkpoint2-r4 in structure under V1-V11. Those binding rules and protocol v1
amendments 1-3 are applied. The final matrix remains the coordinator's seat-2
review. Prior checkpoint packets stay unchanged. The checkpoint1-r1 manifest's
premature behavior filename was identified by L1; that packet's behavior proof
remains pending. Later writers emit explicit pending metadata. A non-pending
reference must resolve to a real successful command receipt and existing log.
The validator uses scripts/verification-inputs.ts and rejects missing, failed,
absolute and escaping-symlink inputs, with restored-clean controls.

Working-source receipts are ignored under `docs/evidence/task-dag/unit-s/`:

| Evidence | Actual exit | Result |
| --- | ---: | --- |
| `write-state-r2` | 0 | 122 production state tests plus scratch HTTP and cleanup |
| `write-state-r11` | 0 | 134 state tests, diagnostics/contract and durable checks |
| `write-state-r13` | 0 | 136 tests/23 suites, literal Delete preview/confirm HTTP and three untrusted-reply controls |
| `write-state-r14` | 0 | 137 tests/23 suites, real dependency SSE with retained viewport/draft/focus |
| `checkpoint2-r5` | 0 | 32 corrected captures plus amended WK protocol proof |
| `dag-matrix-r1` | 0 | Focused 374-PNG inventory; new tool/footer/viewport and repeated-Task selector assertions pass |
| `write-state-r16` | 0 | 139 tests/23 suites; stale-Version picker Conflict retains its actual exit pair and requires Reload |
| `nested-error-before.log` | 1 | Five intended failures: malformed nested error leaked outer agent copy |
| `nested-error-after.log` | 0 | Valid and malformed nested Dependency projection controls pass |
| `native-verification-typecheck.log` | 0 | Strict TypeScript check of the owned capture validator |
| `identifier-r3.json` | 0 | All 112 qualified-base identifier expressions retained, with DAG prefixes and section wiring |

The real Delete recorder proves preview request Version 1 returns the simulated
after-Task at Version 2 with dry_run true. Confirmation sends the accepted
request Version 1 and fingerprint, returning a deleted Task at Version 2 with
dry_run false. The native state retains acceptedFromVersion separately and does
not decrement or rewrite the after-Task. A preview, foreign Profile or foreign
Task confirmation reply is incompatible: keep the draft, clear the reviewed
Version/fingerprint and require Reload. The failing-before control is retained
in delete-reply-before.log/result.json. r12's nil-versus-false fixture assertion
failure is retained separately; its real HTTP facts showed a successful delete.
The later r13 command, every pin diff and cleanup exited 0.

WK proof covers fitted/centred bounds, one initial viewport reply, unchanged
stored viewport, root border independent of selection, title/state accessible
names, state colors from Mac tokens, local-only load/CSP and stale identity/id
refusal. Pointer activation and hiding-Reset focus checks use synthetic DOM
input in offscreen WKWebView. Chromium proof belongs to E. No native VoiceOver
or key-dispatch claim follows from these images or DOM checks.

Repeated graph Tasks use stable section tokens: shown, depends-on, blocks,
lightest-next, starts-at, ends-at, ancestors, descendants. Canonical shown IDs
remain dependency-graph-task-<id> and dependency-graph-expand-<id>. Other rows
use dependency-graph-related-<section>-<id> and
 dependency-graph-expand-related-<section>-<id>. Menu triggers use
 dependency-graph-actions-<section>-<id>. The host still receives full Task IDs.
The expanded-details fixture emits literal selector receipts and checks unique
simultaneous row/menu identities. Native keyboard routing remains held.

The shortcut census found Command-Shift-L in Diagnostics, Command-F in search,
Command-Shift-M in Compact and Command-Shift-D in Diagnostics navigation.
Command-Shift-K had no collision before wiring. Plain Command-K remains free.
The census is shortcut-census.txt. Compact uses the existing row actions menu,
editor button and shortcut; the full toolbar action requires a selection.

The full capture inventory is 346 original default fixtures, 116 discovery and
374 DAG, expected total 836. The original count and import geometry assertions
remain active. Full Mac command/exit and exact baseline comparison are pending.
The authoritative text baseline hashes were verified and git diff4c904d96..cabf4866
is empty for Import.swift, Snapshots.swift and ClientErrors.swift. The six failing
fixture identities are compact-import-preview, compact-import-long-preview and
compact-import-result, each light/dark. Each has wholeRows3 >=4 and
intersecting4 ==wholeRows3. Additional transitive-input audit and final literal
comparison remain pending. No claim of identical to main is made yet.

The corrected generic-only twelve-file source c21d6c671cb2f90c831e4742f2e81cec0e25b6ec
was materialized unchanged at local c86f87be49483bb9f865d41501aac7c60fdfb710.
All twelve hashes matched, immediate check/apply exited 0 and the nine generic
controls passed. The superseded 9012606b checkpoint was never materialized.
The Mac outer-helper control preserves shared guard exit 3 with no compiler
or copy afterward. E's current inventory has fourteen recipes. The full
Electron aggregate command/exit remains pending committed-source proof. This retained
counterpart base does not include E's new DAG UI/drivers; any missing recipe
must remain a real MISSING/nonzero result. No focused command substitutes for
either client's final complete suite.

Retained unsuccessful receipts include first missing pnpm links, prior build
errors, r1's 23 old read-versus-write content comparisons, the exclusive-access
crash in the picker refusal path, a recursive Testing macro expansion, and
new test-fixture mistakes. The stored-content assertions still compare every
previous field; the five derived Dependency read fields are asserted separately.
The refusal crash is fixed by projecting into a local value before mutation and
its literal 14th-link refusal regression passes. No failure was suppressed.

The cached early CLI/server/seed identities are in binaries-02.json. Final
committed-source binary hashes, embedded --version/health, locked repository
check, Foundation History check and unsigned xcodebuild remain pending. Original
three retired Bun temporary paths/bytes are in compile-temp-cleanup.json. Final
owned-process cleanup, retired binary/runtime bytes and disk observations will
be recorded separately. No unowned process was signalled.

Native Todo, hosted XCTest, Keychain, notifications, signing, Session restoration,
installation and installed-binary replacement remain held. No owner database or
copy, owner Task, main checkout change, push, PR, worker merge/rebase or child
agent was used. Final-source proof and both review seats are not complete.
