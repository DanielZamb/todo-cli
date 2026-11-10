# Electron readiness and graph camera checkpoint

This intermediate checkpoint follows `777d24a5c57738bdb1f0f7512c48eedc75e7db6b`.
It does not freeze E, complete the capture matrix or replace either full client
suite. The canonical eleven-path snapshot remains e7902582, byte-for-byte checked
in `docs/evidence/task-dag/unit-e/graph-resize-after/canonical-unchanged.json`.
No domain, API, CLI, Swift, package or protocol change is included.

## Ready, Blocked and ordering

`verify-dependency-readiness.ts` drives the production renderer and shared HttpApi
client against a compiled scratch server. It asserts literal Ready/Blocked flags
and row counts for open and snoozed Tasks, resolved and unresolved direct blockers,
linked terminal Tasks without badges, and a no-blocker Task included by Ready
without a badge. Ready and Blocked each combine with text, id prefix, Project and
Tag. The empty result is the list's Empty component, with Clear filters in the
viewport. Dependency order and Lightest first retain the public server order.

There is no public Snooze setter in the current contract. Setup uses the same
authenticated TaskCreated v1 fixture boundary as the existing client-reads seed,
on a guarded fresh scratch database. Relations and assertions then use public
HTTP and the production renderer. No public capability or graph rule is invented.

The first focused drive failed on a fixture's uppercase Tag name. The server's
existing canonical lowercase name was visible in its retained DOM receipt. The
corrected `readiness-03` exits 0 with 40 PNG/receipt pairs. Its actual CLI version,
binary SHA-256 values and compiled server health are in `binary-identity.json`.
The cache is source 868db38c, contract 858612b6, explicitly intermediate.

## Camera defect and correction

Reading the new shape captures exposed an off-centre diagram after Compact to
full. The literal assertion in `graph-matrix-03` exits 1: its current frame was
572 by 467, but the stored fit retained centre errors x=-143.5 and y=-90.5.
This is an Electron host defect; the canonical renderer was unchanged.

The controller now distinguishes FitPending, Fitted and Manual cameras. A settled
frame resize requests an omitted viewport only for an automatic camera. A person's
pan or zoom survives size changes. Reset returns to automatic fitting. The host
distinguishes the viewport reply inside ready/rendered from user viewport replies
outside that render. An obsolete automatic fit cannot replace a manual camera.

The first coalescing assertion also retained a failure: four automatic replies
for one resize. Observation-only incoming-render logs in `graph-matrix-06` showed
successive iframe widths 570, 571 and 572 across animation frames. The observer
now waits for matching layout measurements across frames, coalesces pending sends
and fits the settled size. It uses no sleep or guessed timer. A queued fit is
suppressed after a manual camera takes ownership.

The controller regression first exits 1, with 149 other package tests passing.
After the fix, 150 tests pass with the existing one skip. The typecheck and scoped
Biome check exit 0. Raw receipts are in `graph-resize-before` and
`graph-resize-after`; intermediate failures remain unchanged.

## Graph proof

`verify-dependency-graphs.ts` uses typed server reports for converging, diverging
and mixed trees, a DAG, chain ancestors and descendants, remaining Energy with a
shared ancestor counted once and a cancelled pruning boundary, unknown Energy
last in Lightest next, terminal-empty Lightest next and a 52-Task group. It also
asserts one-level keyboard expansion, reversible overview, server search and real
SSE replacement preserving camera, expansion and surviving focus.

`graph-matrix-07` exits 0 with 68 PNG/receipt pairs. Its strengthened camera
assertions require new-frame centring within 2 px, preserved toolbar and wheel
zoom across Compact/full/window resize, centred Reset and exactly one resolved
viewport reply after a settled resize. The normal full target is 1100 by 720;
the explicit window-resize exercise also captures 1000 by 650. These additional
sizes are camera behavior evidence, not native macOS window proof.

The helper's initial failure selected both Task buttons and row-menu buttons;
the corrected selector uses the stable section-scoped Task identifier. There was
also one retained preparation failure from an absent temporary focused driver;
it started no browser or server. Neither failure is attributed to product code.

The production renderer is current working source; the compiled scratch cache is
still the explicitly named 868 backend. Final committed-source binaries, the
complete matrix, all-PNG visual audit and both full end suites remain pending.
Only selected changed images have been read at this checkpoint. Native Session,
safeStorage, clipboard, VoiceOver, OS key dispatch and signing remain unproven.
Owned server cleanup receipts show no surviving recorded PIDs or scratch paths;
no manual signals were sent. No compile binaries were created by this wave.

The repo-relative path checker exits 0 for task-search. Discovery's invocation
exits 1 because its ignored `docs/evidence/discovery-formal/current-inputs.json`
is absent in this checkout; that unrelated formal receipt was not recreated.
An earlier invocation without the required workflow argument also remains a
retained nonzero invocation error. DAG capture manifests validate their existing
PNG and receipt paths independently. Doc links and scoped code checks exit 0.
