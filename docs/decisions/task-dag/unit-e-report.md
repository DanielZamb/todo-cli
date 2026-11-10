# DAG-E Electron delivery report

Electron product and end proof are frozen at
`94dcbdc8e7e6262ff85d81277b21e8c317986c08`. The coordinator's seat 2 UI review
at that SHA is **PASS**, including E-F1/F2/F3 and the stated capture limits.
This delivery is ready for L1's fresh correctness seat. Correctness acceptance,
integration and proof with both new clients remain L1-owned.

Branch: `feat/task-dag-e-electron`. Qualified base:
`2c78a3263c196d870459b17bf647cfc23f421fdd`. Product/proof SHA:
`94dcbdc8e7e6262ff85d81277b21e8c317986c08`. The report delivery changes only
Markdown; its full SHA is recorded after commit in ignored
`final-94dcbdc8/delivery.json` and the terminal handoff. Tested source stays 94dc.
Contract: `858612b6feba4e359ee28749b70119a36b3909ad20459ef15f82286f1b80b829`.
No domain, CLI, server, Swift product or generated contract file was changed by E.
Added domain files: **none**. No children, merge, rebase, push or PR.

## End proof and actual exits

Evidence root: `docs/evidence/task-dag/unit-e/final-94dcbdc8/` (ignored).
`source-suite-start.json` records clean 94dc before both complete suites.
Invocation JSON, build commands, logs and exit files retain argv, environment,
times and real exits. Every compiler uses the immediate disk guard. Root check
uses the plain order-27 lock without the Electron wrapper.

| Proof | Actual command or invocation | Exit and result |
| --- | --- | --- |
| Root | Prior disk guard, then `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | **0**: 385 domain, 69 CLI, 32 server, 157 Electron tests; existing Electron skip retained |
| Cache | Guarded `bun apps/electron/scripts/prepare-dag-proof.ts` | **0**: CLI/server/seed compiled once for 94dc |
| Electron package | Guarded Electron lock, `pnpm --filter @todo/electron exec bun scripts/build.ts --output <owned scratch app>` | **0**: unsigned; identity, offline resources and notices verified |
| Xcode | Canonical Swift slot, guarded `xcodebuild -jobs 2`, pinned resolution only, signing disabled | **0**: unsigned, no CodeSign action, native launch or hosted XCTest |
| Complete Electron | Existing `TODO_HEADLESS_CHROMIUM`, `sh apps/electron/scripts/guarded-run.sh bun apps/electron/scripts/verify-design-all.ts docs/evidence/task-dag/unit-e/final-94dcbdc8/electron-all` | **1**: **13 PASS, 1 FAIL, 0 MISSING**, plus named signed-native HOLD |
| Complete Mac | Canonical Swift slot, plain `python3 apps/macos/scripts/verify-design.py docs/evidence/task-dag/unit-e/final-94dcbdc8/macos-design` | **1**: all 346 registered captures; exact 12 main Import failures |
| New DAG matrix | Aggregate's `verify-dependencies-offscreen.ts` constituent | **0**: **636 captures, 178 state families**, all literal assertions pass |
| Canonical browser | Aggregate's `verify-graph-browser.ts` constituent | **0**: offline resources, CSP, codec, borders, fit, identity and host fixes |

Electron passes Attachment batch, batch edit, discovery, discovery report errors,
Dependencies, graph browser, Task search, priority, Version guardrails, Snapshots,
metadata, unauthorized and Diagnostics. Only host-writes fails. Every constituent's
argv/exit/evidence directory is in `electron-all/summary.json`; an unlisted recipe
or MISSING input fails admission. Hard DISK STOP exits 3 and starts no later
recipe. Signed-native HOLD is explicitly skipped with its reason, not a pass.
Diagnostics retains its existing visible/front window; background recipes retain
their existing mode.

Every `TODO_SNAPSHOT_*_ONLY` selector is unset for Mac. Its helper runs plainly
through the Swift slot with owned absolute compiler delegates, not the Electron
outer wrapper. The retained Mac product is qualified2c78, **without S's new native
DAG UI**. This is not integrated parity proof. All three Package.resolved files
and pnpm-lock.yaml are byte-identical before builds, after builds and after suites
(`pins-before.json`, `pins-after-builds.json`, `pins-after-suites.json`). No package
resolution or download occurred in this end proof. No output is tracked.

## Exact baseline comparison

Electron host-writes stops at unchanged `verify-import.ts:129`:
`wholeRows >= 4`, actual **3**. The next unchanged predicate at line 130,
`partialRows === 0`, has measured value **1** but is **unexecuted** after the
first assertion stops the ordinary driver. Summary height is measured as 16;
button/target heights are 32. The entire captured layout JSON equals main,
SHA-256 `a52474b6f52bf293c2edd8235ec42d24d257f9fb6741dcb72410b15403ec61a9`.
`electron-import-baseline-comparison.json` retains both predicates/values and an
empty source diff. The failure PNG was read: the fourth rejected row and pair
are clipped. This is **identical to main**, owner Task `5cdbdbd6`. No assertion
was weakened, skipped or caught to success. Later ordinary-driver steps remain
unproven.

Mac has six fixture/appearance identities, two failures each:
`compact-import-preview`, `compact-import-long-preview`, `compact-import-result`,
each light/dark. Every case has wholeRows **3**, partialRows **1**, intersecting
rows **4**. Unchanged predicates are `wholeRows >= min(4, report.items.count)`
(3 versus 4) and `intersecting == wholeRows` (4 versus 3), originally
Snapshots.swift:889/890. All **12 raw failure lines**, exact fixture identities
and **36 Import layout dictionaries** equal the supplied main reference.
`macos-baseline-comparison.json` records empty 4c904d96..94dc diffs for Import.swift,
Snapshots.swift and ClientErrors.swift; all Mac source is unchanged from 2c78.
The six baseline PNGs exactly match previously read originals. Result:
**identical to main**, actual full-suite exit **1**, owner Task `5cdbdbd6`.
No new Mac DAG fixtures exist on this retained counterpart. Neither full suite
is called green.

The original clean-main fourteen-recipe baseline remains **1**: **9 PASS,
3 FAIL, 2 MISSING**, native HOLD. On E, maintained Attachment batch and batch-edit
pass because expectations now include approved PR #10 copy plus
`error 4 - Conflict`. Maintained Move and generic 422 include
`error 2 - validation or usage` and pass before Import. These are verification
maintenance results, not relabelled original-main passes. All four actual Git
paths, old/new literals, before/after captures and exact product hunks are in
`baseline-classification/classification-index.json` and
[unit-e-verification-maintenance.md](unit-e-verification-maintenance.md).
Product commits are `75052d51f52d04b3c44e128d88be2540cdfef0f5` and
`e5e11bcbc37354c6c82999eebeef4fcda7e3b614`. Original failures remain intact.

## Product behavior and scope

Renderer/controller/task-client/main/write-host separation remains. Validated
Request/Reply and the shared HttpApi client carry graph, candidate, edge, batch
and Delete-preview requests. No raw-fetch bypass or graph-rule implementation
was added. Dynamic credential getters, Profile/generation fencing, UTF-16
highlights, narrow-query recovery, discovery Show and draft protection remain.

The immediate Depends on/Blocks picker keeps checked links first under search,
serializes writes by dependent and uses the candidate's Version in Blocks.
Conflict requires explicit Reload. Current successful/empty searches clear only
the search-owned notice; mutation refusal, Conflict and batch reports survive.
Delayed old success/error cannot publish into a new scope. Six Dependency errors,
warnings, no-ops, nested Import and batch rows share one human projector and
actual exit pairs; malformed pairs use compatibility recovery. Controlled typed
projector fixtures are distinguished from real HTTP mutations. Current public
bulk decoding remains `conflict`-only; both-code projector preparation does not
prove another wire value. The post-BOTH-merges `occ_conflict`-only public amendment
is L1-owned.

All direct list/context/editor Task deletes share server preview and explicit
confirmation, including no-edge Tasks. Cancel initially has focus. Every Delete
sends reviewed fingerprint and the Version sent by its preview request. Refusal
reloads a fresh preview and requires a second confirmation. Conflict and changed
nonempty/empty Dependencies retain their distinct N2 copy and actual pair. No
automatic confirmation or undepend/delete loop. The separate postmerge
`confirm_from_version` amendment remains L1-owned.

Initial Dependencies reuse quick-add metadata, editor and recurrence forms.
Chips wrap inside the scroller; preview remains **16 px** above the fixed footer.
Initial Occurrence edges, no successor inheritance and follow-up with the specified
DONE Task use the shared command. Batch dry-run/Apply never blindly advances a
refused dependent Version. History, Move dropped edges, Copy without edges and
Revert recovery use existing typed reports and editors.

Ready/Blocked use plain metadata text, the no-blocker calm-row exception and
terminal suppression. Dependency order/Lightest first preserve server order.
List drag edits TARGET depends on SOURCE. Visible N1 status names the source;
its accessible value retains both titles. Metadata replacement/title-only overlay
moves no row. Compact under-title and full inline/long-title fallback follow the
coordinator's deliberate platform rule. Self/foreign/already-linked cannot write.
Menu and Command/Control-Shift-K open the same picker. Whole-client accelerator
search found no collision; occupied Shift-L/D/N/M and Command-F remain intact,
and plain Command-K stays free.

Compact graph opens List; full window opens diagram/details. V1-V11 controls,
row menus, collapsed Graph details, Close-only footer and stable section ids remain.
Full Task ids remain the host protocol ids. Automatic/manual viewport, root,
selection, focus and expansion survive authorized SSE refresh. Deleted/auth/Profile
resets discard stale display state. Settled frame changes refit only automatic
cameras; manual pan/zoom survives until Reset. E-F1 reserves the tool strip outside
the fit. No second renderer, label parsing or diagram drag-to-connect.

## Final matrix and UI review

`electron-all/dependencies/manifest.json` maps client/layout/appearance, PNG,
receipt and accessibility ids. Generation checks references exist inside the repo
and cannot escape through symlinks. `fixture-outcomes.json` indexes all **178**
state families and literal descriptions: **636** captures, driver exit **0**.
Coverage includes rows/filter/order, both relation modes, 9/13/14, warnings/no-ops,
refusals/recovery, initial/follow-up/Series, menu/keyboard/drag, changed Delete,
batch/History/transfer, graph lifecycle/camera and search/auth/Profile invalidation.
Only literal assertions establish behavior; images do not invent receipts.

Compact originals were audited first, then full originals. Each new PNG was
viewed, or reused only when SHA-256 exactly matches the same previously viewed
fixture. `image-read-audit.json` records all 636 entries/origins.
`changed-captures.json` contains **130** semantically affected byte-changed images
with before hashes and explicit limits. `seat2-geometry-index.json` contains all
**16** final-source geometry receipts: mixed-tree/DAG nodes intersect no tools in
both layouts/appearances; initial refusal is wholly visible above fixed footer;
loop lines ellipsize with full title and accessible label, three whole lines and
two whole candidates. Full initial-refusal PNGs equal their previous originals
and are not resent. Drag targets, successor and named report subjects are scrolled
into view, or explicitly partial when larger than the region. Twelve Compact
report cards retain oversized-subject limits. Compact batch Conflict shows top
recovery/Reload while its item pair is below that captured scroll; full counterparts
and literal checks are separate. Held search images retain previous candidates
without a visible loading indicator; pending read is not inferred from the image.
All manifest limits stand.

The E-F3 controlled preimage stops red at the missing full-title attribute.
Original compiled E-F1/F2 failure images remain at 6fbb. Working proof with older
backend stays intermediate. The new final-source end run does not rewrite old
receipts. The coordinator read the changed fixes and issued **UI PASS at 94dc**,
accepting exactly these evidence limits. No correctness seat was launched by E.

## Canonical browser resources

Immutable source remains `e7902582c3579d503ed9161278629e4899a92201`. L1 supplied
S the exact eleven paths: seven files under `apps/electron/graph-browser/`,
`apps/electron/scripts/build-graph-browser.ts`, Electron package.json, Electron
tsconfig.json and pnpm-lock.yaml. No later shared-source/lock change, live import,
new package or emitted Git output. Build with guarded
`bun apps/electron/scripts/build-graph-browser.ts`; `--check-only` verifies output.
Copy the complete four-file ignored `apps/electron/dist/graph-browser/` directory
after lock validation, then hash-check each consumer byte as its README describes.

Exports: `GraphHostIdentity`, `GraphViewport`, `GraphTheme`, `GraphNodeState`,
`GraphHostRender`, `GraphHostReply`, `decodeGraphRender`, `decodeGraphReply`,
`graphNodeAccessibleName`, `GraphBrowserAdapter`, `fitGraphViewport`.
Opaque identity is echoed; explicit root must be in nodes; title is AX-only;
unknown optional state is ignored; omitted viewport fits/centres once and reports
resolved values, supplied viewport is preserved. Root border is independent of
selection. Pele render output only; CSP and every asset are local/offline.

Bun **1.4.4**, Pele **1.13.0**. Lock SHA-256:
`a5cbe706b2cd37ace4752427d4aa9e06e5dfa7736f1ec6a717559135807cdaca`.
Combined MIT/ISC notice: **1,934 bytes**, SHA-256
`311bccc30de6f7b9cbfb64232bb0c911ccb2191abe316550813ae25b2c7925b9`.
Electron notices: **306,658 bytes**, SHA-256
`ae456de6c6e3477828226c1c038a743c525c733b58ae33a051016f3846e76979`.
`electron-package/packaging-proof.json` verifies all four output hashes and
build/contract identities. Chromium issue130 pointer capture and issue131 focus
return pass. WebKit proof belongs to S, not an Electron claim.

## Binary identities

Cache source hash:
`394f036ab4d79f6cf28a77cb45ace49aab169b1939c1a7ab52f342bafd6068fa`.
Actual CLI version: `todo 0.1.0 build=94dcbdc8e7e6262ff85d81277b21e8c317986c08`
with the contract above. Actual health reports todo-server with that build/contract.

| Artifact | SHA-256 |
| --- | --- |
| CLI | `c87ac68e151955d69456e7564ca778a994f52ec4625f71b4456ff69a06ff1433` |
| Server | `d45bc944db8c245ae63b72bee1f85ef9735bfcbfb3eb9efaf62e4394fa71f8bd` |
| Seed | `660f556f1996389f219d5cb1117cf51426096082ec5a40f952701350bb6dacf9` |

Unsigned Xcode contains that exact server hash and identity. Separate
`build-wrapper-result.json` retains post-build metadata wrapper exit **1**:
it expected Resources/todo-server, but the build emits Resources/Server/todo-server.
All six real build/check stages exited **0**. Corrected read-only artifact validation
exits **0** without another build; the wrapper failure is not relabelled.

## Retained findings and maintenance

Main Compact Conflict title/Close clipping was confirmed by ONE matching clean-cabf
scenario with the same no-overlapping-changes content. Main is logical 393×426 at
2x; E is 1x. Both light/dark pairs and source/input identities are under the unit
root's `conflict-main-confirmation-01/` and `conflict-main-confirmation-setup/`.
Markup/CSS are unchanged. Observation exits 0; separate finalizer error gives outer 1,
retained. Both PIDs absent; no retry, geometry patch or new assertion. Coordinator
scope: main finding, owner Task `3ebf4dbf`.

Series Skip Retry is now explained by the later failure-only timeline: the GET
preceded the Retry POST/200. Authorized maintenance awaits the exact matched
Occurrence/from_version response, then keeps the original assertion. Quiet working
proof: 10/10 matches/assertions, 1,000 cancelled samples, exit 0. Failure-only sampler
remains; historical not-reproduced classification remains historical. Thin-host
SSE uses production headers/cursors/dedup; seven focused streams show no replay
at/before their requested cursor. Compiler shims preserve argv and copy SDK
features.json, without Swift/package edits. Details and failed receipts are in
[unit-e-verification-resume.md](unit-e-verification-resume.md).

Clean-main production-watch investigation is closed: stored cursor has 0 replay,
2 initial list requests/4 GETs; first connection with 300 operations has 302 list
requests/604 GETs, all 200. The pre-existing per-operation main finding was handed
to the coordinator, with no optimization or timing claim. Credential bootstrap,
fail-closed storage fixture and passive counters are named; all 44 consumed Git
blobs match cabf. Native authentication/storage/restoration remains unproven.

Diagnostics' wrong-root path was a harness defect. Original modal, three failed
runs and pinned 44.9.3 download accounting remain. Entry/runtime preflights fail
before spawn/downloader; three corrected quiet main runs pass at unchanged 60 s.
Compact size was a skipped-action verification precondition race; awaited control
plus one click passes 30/30 with original 5 s bounds predicate; absent control fails
by name with zero IPC/resize. Silent-success guards preserve both streams; fake
nested/JSON/trace/hard3 controls pass. No product visibility/deadline change.

Final documentation links pass (36 documents, 72 local links, no broken links).
The additional Task-search input-path checker exits 0. The Discovery input-path
checker exits 1 before its controls because this worktree has no ignored
`docs/evidence/discovery-formal/current-inputs.json`; its receipt remains at
`docs/evidence/discovery-formal/paths-FMedyZ/`. An initial invocation without its
required workflow argument also exits 1. Neither is counted as a pass or a DAG
functional result. The DAG capture references independently pass their own
existing-file/repo-containment checks; no formal source/input was changed.

## Cleanup and remaining limits

`cleanup-final.json` queries all **9 recorded owned final-suite PIDs**: absent;
recorded scratch directories removed. Some hosts record no PID, so completed
exits are not a full OS process census. No manual signal in this cleanup; historical
incidents retain their own receipts. No unowned/shared process was signalled.
The current 94dc cache/unsigned package remain for review; shared Electron 44.9.3
is untouched.

Hash/lsof-checked retirement: three superseded 6fbb binaries,
**271,558,182 logical bytes**; owned superseded unsigned runtime/package copy,
**326,528,316 logical bytes**. Final hidden Bun scan: **0** files. Earlier this
final build batch: four unopened Bun temporaries retired, **354,643,456 bytes**.
Previous cleanup separately retired six older binaries, **543,116,364 bytes**;
older temporary retirements retain their original receipts. Two cheap cleanup
receipt path/shape errors occurred before deletion; their exit 1/source receipts
are retained. df observations, separately: **98,281,496 KiB available** before
cleanup, **98,286,136 KiB** after. No physical-recovery attribution.
Archives contain text/source/config/receipts and selected images, no binaries,
databases or scratch HOMEs. Owned main export remains for referenced evidence.

Local completion review: compiled public-surface behavior and caller flows are
evidenced; independent correctness/integrated parity are pending. Existing picker,
graph and preview abstractions compose over domain authority without copied rules.
Permitted local comment/structure audit finds no new comments/suppressions; the
usual skill child was not launched under the explicit no-children exception.
Native Session, safeStorage, authentication, VoiceOver, OS key dispatch, clipboard,
notifications and signed-native behavior remain unproven under HOLD. No real
user data, Keychain, signing, installation, native Todo, installed binaries or
canonical main checkout was touched.

L1 receives frozen source, UI PASS, real nonzero baseline receipts and this report
for its fresh correctness seat. E does not self-approve or integrate.
