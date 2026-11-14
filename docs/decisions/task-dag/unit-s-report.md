# DAG-S SwiftUI unit

Current native source is 2f60d70fffd25dee13eb6fa75b39fbb08fde9928 after
the authorized S-C1 correction. Read [the S-C1 report](unit-s-sc1-report.md)
for current proof, the coordinator's UI PASS at 2f60 and the pending short fresh
correctness seat. The 698d delivery received CHANGES REQUIRED for S-C1.
The material below preserves the historical 99e native and d856 retained
Electron qualification; it is not relabelled as proof at the newer source.

The earlier implementation was frozen at `99e2972fb5534fe898ab9f15a10038ef2d18e62f` on
`feat/task-dag-s-swiftui`. That qualification was handed to L1 for review.
Seat 1 then required S-C1, documented above. UI seat 2 passed the 99e source.
There is no correctness PASS, self-approval,
merge or complete new BOTH-client proof claim. The qualified base is
`2c78a3263c196d870459b17bf647cfc23f421fdd`.

The prior native product and proof used 99e. Retained Electron proof uses
`d856220f886abc3262e7d3d5eab7bbe9053712d3`; L1 explicitly retained that completed
scope after the native-only corrections. Earlier native product checkpoints
`78fe2c555c3071ba7078081c48ccebad8898af1d` and
`a7b916ffedf971c8c32cbc789b41bdf801d94ce1` remain historical evidence. The earlier
report-only delivery 698d55940f0b85fb2828d2297dffa83962b0629f is recorded in
`docs/evidence/task-dag/unit-s/delivery.json` and the terminal handoff message.

No domain files, HttpApi changes, generated-file edits or second renderer were
added. Package changes are limited to the canonical handoff's pinned Pele 1.13.0
dev dependency, frozen lock entries and TS include. Contract remains
`858612b6feba4e359ee28749b70119a36b3909ad20459ef15f82286f1b80b829`.

## Product scope

The native implementation reuses TodoModel, TaskRow, TaskFilterView, quick add,
the editor, Conflict, History and existing report cards. It adds immediate
relation writes, per-dependent Versions, Profile-wide candidate search, initial
and first-Occurrence Dependencies, follow-up, reviewed Delete, batch preview and
apply, Move/Copy reports and typed lifecycle/History deltas. The domain still
owns cycles, limits, statuses, ordering, Energy and graph sets. R1/catalog debt,
draft protection, Show provenance, dynamic credentials, epoch safety, typed
search recovery, UTF-16 highlights and existing identifiers are retained.

The real Delete regression records preview request Version 1, simulated after-Task
Version 2, then confirmation Version 1 and deletion Version 2. The accepted
request Version and server fingerprint are stored separately. Foreign or preview
confirmation replies require Reload. No after-Task is decremented or rewritten.
The future `confirm_from_version` contract amendment belongs to L1 after both
units merge and is absent from this unit.

The batch Version regression first failed through production TodoModel and real
compiled HTTP. Both old previews sent `[2,3]`: the open blocker was refused and
the cancelled blocker conflicted. Reload repeated that plan and the done root
stayed at Version 2. The corrected client retains only server preview result or
non-Conflict refusal facts, scoped by relation and loaded base Version, for the
next explicit Reload/Preview. No item is skipped and nothing resends
automatically. Final proof records `[2,3]`, then `[2,2]` preview and `[2,2]` apply;
the cancelled blocker commits from 2 to 3 and the root remains done with that
single edge. Stale-base facts are ignored. No status or graph rule is copied.

The current public batch HTTP error is `conflict`. Alternate `occ_conflict`
fixtures prove preparation and projector/gate tolerance, not current public HTTP
decoding. The coordinator's later enum-only `occ_conflict` amendment supersedes
the earlier permanent dual-code instruction. It is not implemented here.

## UI review and captures

Checkpoint 1 and checkpoint 2 structure were approved by the coordinator under
S1-S8 and V1-V11. The a7 final review required F1-F5, which are implemented in
99e. Chosen chips use up to two whole visible rows before scrolling, including
follow-up and validation. The Add button is compared in viewport coordinates
against main, x 299.5, y 295.5, width 77.5, height 36, with equal footer frames
for zero, two and many selections. The former content-local y 217 assertion was
replaced by the coordinator's viewport rule. The main source/value is retained
in `quick-add-main-baseline.json`. No native Preview component was added.

Long loop notices show three whole caption lines with an inner scroll region,
retaining full ordered accessibility text. Two whole candidate rows remain
visible. Hover text occupies the target's existing metadata line, truncates in
the middle and exposes its full value. Every row frame must equal its no-hover
frame. The scope action disappears when nearby already shows everything. The
full diagram list is under a collapsed `Tasks in diagram` disclosure; the
repeated-Task fixture expands it deliberately. Failure fallback keeps its list.

Empty P1/P2/P3/P4 groups in unfiltered All Tasks are main's existing behavior.
`TaskListView.taskGroups` in main cabf returns empty groups unless search is
active. `main-empty-priority-groups.json` retains the exact source region/hash.
The filtered empty route still uses `No matching tasks.` and Clear filters.

Final UI seat 2 is PASS for exact source 99e. The coordinator read the F1-F5
changed captures and accepted the stated proof limits. The changed-only packet,
`99e-changed-captures/manifest.json`, contains 132 changed PNGs and 254
byte-identical a7 images. All 33 contact sheets were read, with two additional
full-size originals. Existing successful same-source behavior links and all PNG
hashes were checked. L1 independently inspected the packet, not reran the UI.
N1 is non-blocking integration copy for BOTH clients: visible drag text becomes
`Will depend on <source title>` or `Already depends on <source title>`, keeping
the full target/source sentence accessible. L1 applies N1 at integration; this
unit does not re-freeze for it. Dark Series glass was accepted as an offscreen
limit; native rendering and dispatch are not inferred from a PNG.

The final inventory is 346 original captures, 116 discovery and 386 DAG, total
848. The original inventory and twelve Import assertions remain active. The
two DAG manifests name every PNG, layout, appearance, identifier and behavior
receipt. A passed behavior reference must resolve to an existing successful
command/log and matching source. Missing, failed, escaping and future references
cannot become passed metadata. Synthetic negative controls remain retained.

The final selector receipt preserves all 112 qualified-base identifier
expressions and `compact-search`. Repeated graph Tasks use stable section tokens
shown, depends-on, blocks, lightest-next, starts-at, ends-at, ancestors and
descendants. Shown preserves `dependency-graph-task-<id>` and
`dependency-graph-expand-<id>`; related rows add their section token. Every menu
uses `dependency-graph-actions-<section>-<id>`. Full Task ids in host messages are
unchanged. Cmd-Shift-K was free in the pre-wiring census; Cmd-Shift-L, Cmd-F,
Cmd-Shift-M and Cmd-Shift-D were already assigned. Plain Cmd-K remains free.

## Canonical browser and packaging

Only L1's immutable scoped packets were materialized. No live E-worktree import,
unrelated E UI, merge, rebase or emitted resource was committed.

| Canonical E source | Local checkpoint | Resource lock SHA256 |
| --- | --- | --- |
| `965079cfd6652089c491eea2bd6d6682179b0795` | `58b49611dafddca647bc4acdcc25da73ab9087b0` | `603b5b168f3135b93e5e10c91f01c28d0923fe9fd91e536dca81e4e154354b65` |
| `5c0beaeb3f97aea8cebf4fc0d3c3351bc5cfb2b6` | `81ea00de55ef7eaa92ff1c4aa221482dd3274047` | `799463f87110838ca404392a64cde5aaf084e9b1c4a117053c16b93aa2d84c1b` |
| `e7902582c3579d503ed9161278629e4899a92201` | `c4c3bece1196a0c06887fe83e8418877a40d45c8` | `a5cbe706b2cd37ace4752427d4aa9e06e5dfa7736f1ec6a717559135807cdaca` |

Current graph.js is 237434 bytes, SHA256
`154d482499c619c206ddacf4791e26e9d0470088b789f6235784aad813e1d053`.
The 1934-byte Pele MIT/Lucide ISC notice SHA256 is
`311bccc30de6f7b9cbfb64232bb0c911ccb2191abe316550813ae25b2c7925b9`.
Pele remains pinned to 1.13.0. The Mac helper builds/checks the canonical output,
copies all four files and checks actual copied bytes under its shared output
lock and Swift slot. Append and same-length mutation controls retained actual
0/1/0/1/0 exits; no lock update hid a mismatch.

The typed WK host follows protocol v1 amendments 1-3: opaque echoed identity,
required root id, optional node title/state and optional viewport. It sends
render after document load. Fresh render fits and centres and receives one
resolved viewport reply; a supplied viewport stays unchanged. WK proof covers
root/state/accessible names, stale identities/ids, local-only resources/CSP,
Mac-token computed edge stroke, pointer-after-zoom and hiding-Reset focus.
Pointer/focus checks use synthetic DOM events. Native VoiceOver/key dispatch
remain held. Chromium proof belongs to E and is not relabelled as a native rerun.

## Final-source proof

All evidence below is local and ignored under `docs/evidence/task-dag/unit-s/`.
Swift commands use the Swift slot, disabled automatic resolution and pin checks.

| Source and receipt | Actual exit | Scope |
| --- | ---: | --- |
| 99e, `99e-prepare/command.json` | 0 | Source-stamped CLI/server/seed cache, actual version and hashes |
| 99e, `99e-state-command.json` | 0 | Production TodoModel, 144 tests/25 suites, scratch HTTP/reload/SSE, 8 command exits 0, pin diffs 0 and cleanup |
| 99e, `99e-unsigned-command.json` | 0 | Unsigned xcodebuild and actual bundled graph lock; cache-input incident below |
| 99e, `99e-unsigned-cached-command.json` | 0 | Existing unsigned helper with explicit cached server, all four actual graph files match a5; wrapper audit 1 and corrected read-only audit 0 remain separate |
| 99e, `99e-full-mac-command.json` | 1 | All 848 fixtures, all selectors unset, exact twelve main Import failures, all 386 DAG fixture assertions pass |
| 99e, `99e-root-plain.json` | 0 | Exact plain order27 after guard 0: domain 385, CLI 69, server 32 and Electron 85 passed plus its existing one skip |
| d856, `final-electron-command/command.json` | 1 | Complete retained fourteen-recipe aggregate, detailed below |
| d856, `generic-maintenance-controls/command.json` | 0 | 15 fake guard/runtime/runner/inventory/hidden-host/Series tests in 6 files |
| a7, `a7-history-command.json` | 0 | Seven Foundation History checks; its inputs are unchanged by 99e |

The actual full Mac command was `scripts/swift-slot.sh python3
apps/macos/scripts/verify-design.py
"$PWD/docs/evidence/task-dag/unit-s/99e-full-mac"`, with every TODO_SNAPSHOT
selector unset and the actual successful `99e-state-command.json` linked.
It exits 1. The complete manifest registers 848 captures; 849 PNG files include
one attachment input fixture. `99e-full-mac/dag-capture-manifest.json` maps 284
relation states and `dag-graph-capture-manifest.json` maps 102 graph states.
`dag-fixture-outcomes.json` records PASS for every new DAG fixture assertion;
`capture-inputs.json` verifies 386 passed behavior links and zero pending.
`99e-final-selector-manifest-receipt.json` retains the exact selector checks.
The whole suite is not green.

The authoritative Mac baseline is twelve failures across Compact Import preview,
long preview and result, each light/dark. Each has wholeRows 3 versus minimum 4
and intersecting 4 versus wholeRows 3, with one partial row. a7's full 844 run
exited 1 and matched those exact fixture/assertion values. Original main source
and transitive input audit, raw failure hashes and that receipt remain preserved.
The final 99e comparison is **identical to main**, with the exact same six
fixture identities and twelve predicates/values. Its `baseline-comparison.json`
compares the full literal failure sequence, layout values and transitive inputs.
Those identities are `compact-import-preview`, `compact-import-long-preview`
and `compact-import-result`, each light/dark. There are no new DAG failures.
The authoritative main render SHA256 is
`6c83fc99aaabd32bc85c18e4bf34d4356a764cc766550baaf0256c26a461fc3d` and
Import layout SHA256 is
`e8b0ce918aab74133aba67bc06c8fef035439aeb74ace75d4db39f996abf4209`.
99e keeps the audited a7 transitive inputs byte-identical except for the final
aggregate inventory count 844 to 848. Original Import assertions are unchanged.
S did not rerun the archived main source or expand its archive.

The authoritative root command is `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock
pnpm check`, after `sh scripts/disk-guard.sh`, without the Electron wrapper.
At a7 the wrapped command exited 1 because successful guard text contaminated
a nested compiler's asserted stderr. The coordinator classified that as a
wrapper output boundary. The authorized plain a7 command exited 0. The later
silent-success generic checkpoint fixes the wrapper; neither old exit changes.

## Retained Electron full suite

The exact completed command at d856 was `sh
apps/electron/scripts/guarded-run.sh bun
apps/electron/scripts/verify-design-all.ts
docs/evidence/task-dag/unit-s/final-electron-14`, with an explicit existing Chrome
executable. Actual exit is 1: eleven PASS, one FAIL, two MISSING and signed-native
HOLD. All fifteen records retain actual argv/exits/evidence/reasons in
`final-electron-14/summary.json`; the helper's build lock was not double-wrapped.

Attachment batch, batch edit, Discovery, Discovery error reports, Task search,
priority, version guardrails, Snapshots, metadata, credential Unauthorized and
Diagnostics all exit 0. Host-writes exits 1 at unchanged `verify-import.ts:129`,
requiring at least four whole rows and receiving three. Its layout measures one
partial row against the next unchanged zero-partial predicate. Normal execution
stops at the first assertion; the second predicate was not executed. These exact
predicate/values match the known main Compact Import regression, owner Task
`5cdbdbd6`. `verify-import.ts` is byte-identical to main. The comparison is
`final-electron-baseline-comparison.json`; it is not whole-aggregate equivalence.

`verify-dependencies-offscreen.ts` and `verify-graph-browser.ts` are absent on
this retained qualified2c78 Electron application. They remain MISSING/nonzero.
No new E application UI was imported. Full new BOTH-client proof therefore
belongs to L1 integration, not this retained counterpart run.

The original clean-main aggregate was E-executed and L1-inspected, not rerun by
S. It exited 1 with nine PASS, three FAIL and two MISSING under its named generic
overlay. Original stale Conflict/Move/422 expectations remain archived. Maintained
literals now include PR #10's actual exit pairs. The Compact sizing failure was
a verified precondition race: no visible control meant the old driver skipped
the click. Corrected wait/one-click passed 30/30; absent-control proof failed
before any request. The one long-driver Series Retry intermittent was not
reproduced in ten isolated runs, with 1000 cancelled samples. No product/wait
change followed. These classifications do not erase original failed receipts.

## Verification handoffs and retained incidents

Generic c21 was consumed at c86, generic 868 at
`7b93cbc08b2caba8e30e89daa87ecf7e3b0af358`. The rejected 901 snapshot and the
superseded ede-only patch were never applied. Ordered maintenance phase 1
`0ee8a15883de139a7ff23a8cf2810c8c2e28ede7` was consumed at
`cbf54fea535e359c4409f336219069cbcb503b9b`, exactly twelve paths. It includes the
packet's explicit retained Discovery-switch adaptation, excluding E-only
copyMermaid. Phase 2 `5a94cffbe4068a93e36278624f7d9cdbee65e9ce` was consumed at
d856, exactly six paths. All final seventeen postimage hashes/sizes matched.
No product/package/domain/generated/canonical change entered through these packets.

Failed receipts remain failures: the picker exclusive-access crash and its
literal refusal regression, stored-content equality controls, malformed nested
error controls, Delete untrusted-reply controls, initial quick-main compile
failures, F1-F5 red geometry failures, witness expression compile failure,
measurement/one-point hover failures, six footer failures and the batch Version
red run. Production Series was nonblank before the earlier fixture correction;
that blank view was a fixture-only issue, with before evidence retained. Working greens are explicitly working-source, not committed qualification.

The first 99e unsigned invocation omitted the optional cached server input and
compiled that unchanged helper again with the short build id. It exited 0 but
does not satisfy cache-reuse attribution. `99e-unsigned-input-incident.json`
preserves the command/build log and the correction. The cached-input helper
then exited 0 without a server compile and with the correct cached helper byte
count. Its outer receipt writer exited 1 on an incorrect assertion that Xcode
would print the inherited cache path. The actual build success and graph lock
remain 0; the wrapper failure is retained in
`99e-unsigned-cached-wrapper-incident.json`. A read-only audit exits 0 and checks
cached inputs, no compile marker, byte count, graph lock and unchanged pins.
No third build or product/shared-helper edit was made. The earlier a7 health setup
failure rejected an unsafe scratch prefix before server launch; its one approved
retry used `todo-s01-verify-*`, returned exact a7 health and cleaned up. Neither
incident is relabelled as an original pass.

## Identities, cleanup and limits

Runtime source hash is
`394f036ab4d79f6cf28a77cb45ace49aab169b1939c1a7ab52f342bafd6068fa`.
99e CLI SHA256 is
`220f86feecd6b9c14386d184372bb239bf174e66cf1cc943bd47a490c6479b62`;
server is `748041b553ddcfa0bd513b862e2f84db6a780cf2beaf7be7f50fbfd2fb2202ed`;
seed is `3ad2c022747ebca5a22641d83bc48394503f1d79fc466a2c1b458b4341204839`.
Actual CLI version embeds the full 99e head and unchanged contract.
`99e-health/result.json` records HTTP 200 and exact
`{service:todo-server,contract:858612b6...,build:99e2972f...}` with full values in
the receipt, on a new approved `todo-s01-verify-*` scratch directory. Its owned
server stopped and scratch was removed. `99e-process-cleanup-audit.json` checks
nine recorded native/counterpart runtime PIDs; all are absent, with no signal
from that read-only audit.

Earlier a7 retirement checked lsof and removed thirteen owned closed files,
1163742412 logical bytes: seven Bun temporaries, 620626048 bytes, and six
superseded caches, 543116364 bytes. Open/unknown skips were zero. Its separate
df observations are retained; logical bytes are not claimed as physical free
space gained. Final 99e retirement separately removes another thirteen owned
closed files,
1163742412 logical bytes: seven Bun temporaries, 620626048 bytes, and six a7/d856
superseded caches, 543116364 bytes. Open/unknown skips are zero; the three current
99e binaries remain. `99e-owned-retirement.json` retains every path/hash/lsof
result. Its separate df after observation is 123838836 available KB; no exact
physical-reclamation claim follows. Final state helper retirement separately
records 269507012 logical bytes and scratch/server cleanup. Unsigned helpers
remove their own staging/DerivedData; their byte totals were not measured. No unowned process was signalled.

The no-children exception was followed. Local comments/structure/completion audits
found no added code comments, suppressions or domain files. L1 owns the separate
correctness seat; the coordinator alone owns UI seat 2. UI seat 2 passed exact
native 99e. The fresh correctness seat is authorized to L1 after this report and
has not run. No correctness PASS or merge is claimed. Native clipboard/menu/key
dispatch and VoiceOver remain unproven. Native Todo, hosted XCTest,
signed/native Electron, Keychain, signing,
notifications, Session restoration, installation and installed-binary replacement
remain held. No real database/copy, owner Task, main checkout change, push, PR,
worker merge/rebase or child agent was used.
