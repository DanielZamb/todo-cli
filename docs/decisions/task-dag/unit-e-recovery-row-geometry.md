# Electron recovery and title-only row checkpoint

This is an intermediate implementation checkpoint developed from
`a68f86ca0b04d9aa659debb3e4fbb6ffae91f7ae`. It does not deliver the final
capture matrix, either full offscreen suite, a final-source binary or approval.
The canonical graph resource remains `e7902582c3579d503ed9161278629e4899a92201`;
the shared generic verification handoffs are unchanged.

## Recovery and captured root context

`verify-dependency-recovery.ts` drives the production renderer against the
compiled scratch server. It covers graph loading, offline read-only controls,
a valid controlled public HTTP 500 through the existing HttpApi client, explicit
Retry back to the compiled server, old success/error delivery after Close or a
new root, Profile reset, real Session sign-out and re-sign-in through the retained
client's dynamic credential getter. Old responses are awaited through actual SDK
delivery before the stale-publication assertions. No safeStorage or native
Session-restoration claim follows from this proof.

Graph state now retains the authorized captured root Task while loading or
showing a first-read failure. A current GraphReport replaces that captured value.
Wrong-root and wrong-Profile values cannot supply a title. There is no additional
lookup, Mermaid-label parsing or cross-Profile title search. The literal unit
regression fails before the change in `graph-root-context-before/tests-02.log`;
the corrected package run passes. `recovery-states-02` exits 0 with 36 captures.

## Cause-specific Delete review

The refreshed preview retains the full typed refusal that caused it. N2 projects
the message from that cause and the reviewed incident set:

- Conflict: `This Task changed. Confirm again to delete it.`
- has_dependencies, non-empty: `Dependencies changed. Review the current list and confirm again.`
- has_dependencies, empty: `This Task has no Dependencies now. Confirm again to delete it.`

Every status ends with its actual muted exit pair. The preview request Version,
fingerprint and explicit second confirmation behavior are unchanged. No extra
Reload or automatic retry is added. Three literal unit cases cover these messages.
The compiled renderer's `delete-n2-before-renderer` exits 1 on the old incorrect
Conflict message; `delete-n2-after-renderer` exits 0 with 56 captures and decoded
public replies. The has_dependencies cases carry exit 2; Conflict carries exit 4.

## Title-only drag placement

Rows with existing metadata replace that metadata during hover. Plain rows keep
their density. `DependencyTitleStatus` supplies an absolute caption only for the
target row, with the unchanged full target/source accessibility value. Compact
keeps the under-title placement in the row's own bottom padding.

For a full window, the caption begins 12 px after a short title's text and shares
its baseline. It ellipsizes before trailing controls. With less than 160 px free
between the title text and those controls, it uses the available line box below
the title, retaining the 12 px caption font and staying inside the border. The
coordinator deliberately approved this Electron/Mac placement difference.

The earlier diagnostic is preserved at `title-only-padding-diagnostic-01`: exit 1
after the eight Compact captures. The first full-window case proved that an
18 px under-title line overlapped the title by 6 px. It changed no product CSS.
The coordinator's subsequent placement rule is implemented here. The first two
implementation runs exit 0 with 32 light/dark captures each. The
second also passes the 159/160 px placement-boundary controls. The third run,
`title-only-placement-03`, exits 0 with all 32 captures, both boundary controls
and an actual row-padding drop. A public reload proves Version 2 and exactly
the intended blocker. Every PNG from this third run was read by E; that is
implementation inspection, not coordinator UI approval. Exact source snapshots
accompany each run; later source changes do not relabel those receipts.

`verify-dependency-title-drag.ts` is included in the main DAG driver. Its fixtures
use genuine title-only open Tasks and done Tasks with resolved links, without
adding metadata to hide clipping. Short/long, adjacent/last, allowed/already-linked
cases assert identical frames for every row, visible status inside its row and
the viewport, and no intersection with any row's title/metadata text or trailing
controls. Drop handling covers the row bounds through the same controller; the
existing Task list now uses semantic list elements with unchanged CSS dimensions.

## Proof boundaries and receipts

Evidence paths above resolve below `docs/evidence/task-dag/unit-e/`. Production
renderer builds use the guarded Vite path and the Electron build lock. The cache
still embeds `868db38c0c56985d9b0a3cb7a1e6d9423c27a18e`; each renderer receipt
records the actual CLI version, server health and binary hashes. Final proof must
rebuild at the final committed product source and rerun affected behavior and both
complete offscreen suites. Capture manifests validate existing file references.
Only literal driver assertions are behavior proof; images alone establish none.

The package unit suite exits 0 with 155 passing tests and the existing one skip.
The first typecheck failed solely on an owned exploratory codec script; that
script was preserved in ignored evidence and removed from compiler inputs. The
subsequent typechecks exit 0. Local lint exposed redundant hook dependencies and
static row drag handlers; these were corrected without suppressions. Existing
CSS specificity warnings remain warnings. Full root checks and final end proof
are pending. No domain, API, Swift or canonical adapter file changes are included.
