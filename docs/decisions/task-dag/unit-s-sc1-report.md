# DAG-S S-C1 correction

Native source is frozen at 2f60d70fffd25dee13eb6fa75b39fbb08fde9928
on feat/task-dag-s-swiftui. The coordinator's UI seat 2 PASS now applies
to the whole native unit at this source, with the prior offscreen/native limits.
The short fresh S-C1-only correctness seat is pending and belongs to L1.
No merge or correctness approval is claimed.

The previous delivery 698d55940f0b85fb2828d2297dffa83962b0629f
and native 99e2972fb5534fe898ab9f15a10038ef2d18e62f remain historical.
Seat 1 correctly found that a current successful search left its old
search_too_broad notice visible in both the picker and graph.
Only the nine Mac/verify-macos paths in the scoped product commit changed.
There are no domain, HttpApi, generated, canonical, Electron, package or N1 changes.

## Behavior and limits

The existing picker and graph now retain operationFailure and searchFailure
independently. Existing notice reads prioritize the operation notice. Current
search success and Clear remove only searchFailure. Query/request, Profile and
credential checks still reject obsolete responses. Clear invalidates pending
reads even offline. Refresh preserves only the operation notice, so it cannot
restore a recovered search notice as a mutation refusal.

Five literal tests cover both picker directions, checked links, graph success
and offline Clear, delivered older errors after newer success or Clear, and
refresh recovery. A typed cycle refusal keeps its returned path, attempted Task
and actual exit pair. A generated HTTP 409 Conflict sets Reload required and
survives broad-query 422, narrower-query 200 and Clear. The batch report remains intact.
The tests use the production TodoModel and generated client with controlled
valid public replies. They do not reproduce the backend's search threshold.
The unchanged compiled reviewer probe proves the same narrow boundary.

No UI view or pattern changed. Eight recovery fixtures use existing production
views in Compact/full, light/dark. The two requested Compact light images show
query "launch 49", Task g49 and no stale notice. The coordinator passed this
delta at 2f60 and extended the whole native UI PASS. Lightest next remains an
independent next-work answer; a possible cross-client accessibility hint belongs
to L1 at integration. Native key dispatch, VoiceOver and dark Series glass
remain held. N1 drag copy and the scheduled shared-contract amendments remain
integration work.

## Retained failures

The immutable handoff was verified against all five manifest hashes.
SearchRecoveryProbe.swift remains SHA256
fb5a4a3c92a38619177b451a8cb46a7a7c0ab4bb0ef7a817d38e03bf9e687a51.

The clean 698d red-r2 probe exits 1 with exactly two stale-notice failures while
current result a is present, plus a passing delayed-older-error control.
Its first link attempt exits 1 because quoted object paths were passed literally;
that setup incident is separate and retained. The corrected probe is unchanged.
The first new test run exits 1/eight assertions because the synthetic mutation
envelope omitted required generated_at. The generated decoder correctly rejected
it. Fixing that test envelope produces a typed cycle refusal. No product or
contract guard was weakened. Working green and committed green receipts remain
separate.

Evidence stays under docs/evidence/task-dag/unit-s/sc1/. Historical 99e,
a7 and 78fe failures and the retained d856 Electron aggregate are not relabelled.
The reviewer's ignored Vitest results.json was left untouched; no Vitest or
root-check rerun was used for this Swift-only correction.

## Committed-source proof

All current commands below use native source 2f60. Evidence paths in this section
are relative to docs/evidence/task-dag/unit-s/sc1/. All four tracked dependency
pin files remain unchanged, including the three Package.resolved files. Every
Swift invocation uses the shared slot with automatic resolution disabled.

| Command or receipt | Actual exit | Result |
| --- | --- | --- |
| scripts/swift-slot.sh python3 .scratch/sc1/run-probe.py committed-probe | 0 | Unchanged immutable compiled production-model probe, all three cases pass. command.json and source-provenance.json are under committed-probe. |
| scripts/swift-slot.sh python3 apps/macos/scripts/verify-write-state.py "$PWD/docs/evidence/task-dag/unit-s/sc1/committed-state" | 0 | 150 tests in 27 suites; all eight command entries exit 0; pin diffs 0; scratch removed and server stopped. |
| scripts/swift-slot.sh python3 apps/macos/scripts/verify-design.py "$PWD/docs/evidence/task-dag/unit-s/sc1/committed-captures" | 0 | TODO_SNAPSHOT_SC1_ONLY=1; eight recovery PNGs and eight actual same-source state links. All original PNGs read. |
| scripts/swift-slot.sh python3 apps/macos/scripts/verify-design.py "$PWD/docs/evidence/task-dag/unit-s/sc1/committed-full-mac" | 1 | Complete 856-capture inventory, 394 DAG captures; exactly the known twelve Compact Import assertions, no new DAG failures. |
| scripts/swift-slot.sh sh .agents/skills/verify-macos-lifecycle/scripts/unsigned-build.sh "$PWD/docs/evidence/task-dag/unit-s/sc1/committed-unsigned" | 0 | CODE_SIGNING_ALLOWED=NO; compile only, no app launch or hosted XCTest; actual bundle graph lock matches. |

The state and unsigned invocations explicitly reuse TODO_CLI_BINARY,
TODO_SERVER_BINARY and TODO_SEED_BINARY where applicable. The Mac helpers run
plainly through Swift slot. Only the local canonical graph-builder boundary
uses the shared guarded runner. The full Mac invocation unsets EVERY focused
TODO_SNAPSHOT selector, including SC1_ONLY, and supplies repo-relative
TODO_DAG_STATE_COMMAND=docs/evidence/task-dag/unit-s/sc1/state-command.json.
The focused command sets TODO_SNAPSHOT_SC1_ONLY=1 in its environment.
Outer argv, environment selectors, actual source, pin hashes and exits are
preserved in state-command.json, captures-command.json, full-mac-command.json
and unsigned-command.json. No failure is converted to success.

Full Mac is identical to main on the exact six failing fixture identities:
compact-import-preview, compact-import-long-preview and compact-import-result,
each light/dark. Each fails wholeRows 3 >= 4 and intersecting 4 == wholeRows 3,
with one partial row. The complete literal sequence and layout values are in
committed-full-mac/baseline-comparison.json. The prior main input audit is
preserved, and the relevant Import fixture/assertion region plus transitive
inputs are unchanged from 99e. The original 346-count assertion remains active.
The owner is Task 5cdbdbd6. The suite remains a real nonzero failure.

The complete capture manifests are committed-full-mac/manifest.json,
dag-capture-manifest.json and dag-graph-capture-manifest.json. There are 292
relation/recovery rows and 102 graph rows, with all 394 successful behavior
references verified. dag-fixture-outcomes.json names every DAG PNG and outcome.
The eight new S-C1 outcomes are PASS:

- dag-sc1-compact-picker-recovered-light.png
- dag-sc1-compact-picker-recovered-dark.png
- dag-sc1-compact-graph-recovered-light.png
- dag-sc1-compact-graph-recovered-dark.png
- dag-sc1-full-picker-recovered-light.png
- dag-sc1-full-picker-recovered-dark.png
- dag-sc1-full-graph-recovered-light.png
- dag-sc1-full-graph-recovered-dark.png

All eight final full-suite images are byte-identical to the inspected focused
images. ui-delta-request.json records the exact two submitted paths and hashes.
ui-review.json records the coordinator's PASS. capture-inspection.json and
dag-fixture-outcomes.json retain the image/proof comparisons. Identifier checks
pass with all 112 original expressions and compact-search preserved.

## Source and artifact identities

The generated contract is unchanged:
858612b6feba4e359ee28749b70119a36b3909ad20459ef15f82286f1b80b829.
The backend runtime source hash is unchanged:
394f036ab4d79f6cf28a77cb45ace49aab169b1939c1a7ab52f342bafd6068fa.
Compiled backend artifacts still embed 99e2972fb5534fe898ab9f15a10038ef2d18e62f,
and are reused honestly for current Swift state/HTTP proof. They were not
recompiled or relabelled as 2f60.

- CLI SHA256 220f86feecd6b9c14386d184372bb239bf174e66cf1cc943bd47a490c6479b62
- server SHA256 748041b553ddcfa0bd513b862e2f84db6a780cf2beaf7be7f50fbfd2fb2202ed
- seed SHA256 3ad2c022747ebca5a22641d83bc48394503f1d79fc466a2c1b458b4341204839

The canonical adapter remains E source e7902582c3579d503ed9161278629e4899a92201,
lock a5cbe706b2cd37ace4752427d4aa9e06e5dfa7736f1ec6a717559135807cdaca.
All four actual bundled files match that lock in the fresh unsigned proof.
No emitted output is tracked. There are no added domain files. The current
compiled Swift probe hash and all compile/link argv are in its command.json.

## Retained counterpart and root proof

The completed retained Electron command stays attributed to
d856220f886abc3262e7d3d5eab7bbe9053712d3:

sh apps/electron/scripts/guarded-run.sh bun apps/electron/scripts/verify-design-all.ts docs/evidence/task-dag/unit-s/final-electron-14

Its actual exit is 1, with eleven PASS, one known Import FAIL, two MISSING new E
DAG drivers and signed-native HOLD. The normal Import run executes the unchanged
wholeRows >= 4 predicate and receives 3. Layout records one partial row; the next
partialRows == 0 assertion is not executed after that stop. Exact comparison is
in final-electron-baseline-comparison.json under the parent unit evidence.
This is the retained 2c78 Electron application plus authorized canonical and
verification handoffs. It does not prove new E DAG UI or whole-aggregate
equivalence to main. The coordinator and L1 explicitly retained this result
through native-only corrections; S-C1 does not repeat or relabel it.

The prior authoritative root command, after its disk guard, is
/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check.
Its actual 99e exit is 0, retained in 99e-root-plain.json.
It was not rerun for this Swift-only correction. The old a7 wrapped exit 1
remains classified as a wrapper-output boundary. No Vitest cache was restored,
deleted or rewritten by S-C1.

## Cleanup and delivery boundary

The state helper retired 269507012 logical bytes of owned scratch runtime
files, including one 88660864-byte hidden Bun temporary. It removed its scratch
HOME/SQLite and stopped recorded server PID 60209, independently observed absent.
Two superseded probe binaries were closed according to lsof and retired,
243319872 logical bytes. The current compiled probe and current 99e cache stay.
The final no-symlink-following scan finds zero hidden Bun build files.

Disk observations are separate from logical retirement. df available KB is
121432416 before the final retirement and 121432380 after; no physical-free-space
gain is inferred. Every compile/launch guard passed; there was no disk stop.
cleanup-and-disk.json retains exact paths, hashes, lsof, df and cleanup facts.
There were zero manual signals and zero unowned processes stopped.
The ignored reviewer Vitest cache still has its recorded SHA256
a6800ab363aa39111133683ad5fb4b72dfa39733f8bbd9fc6b102a6682acd90d.

The product commit is 2f60. This report and the master report are a separate
report-only delivery. Its full SHA and this report hash are recorded in
docs/evidence/task-dag/unit-s/sc1/delivery.json and the terminal handoff.
S-C1 implementation and owned qualification are ready for L1's short fresh
correctness seat. That PASS and the subsequent integration proof remain
unproven. No worker merge, push, PR, native launch, signing or child was used.
