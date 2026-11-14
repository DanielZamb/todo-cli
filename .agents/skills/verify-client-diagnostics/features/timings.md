# Interaction timings

Diagnostics distinguishes slow input handling, requests, publication and layout.

## Sub-features

- CD04 reports p50, p90, p99, maximum and sample count by interaction category.
- CD05 preserves incomplete actions with elapsed age and phase.
- CD06 records refresh causes/counts, request phases/reuse, stalls and runtime resources.

## How to get to it (user POV)

Use the Mac Task list, inspector and commands, then open Diagnostics. The report
inventory names every requested interaction and its actual measurement coverage.

## Driving it with the verification helper

Preconditions: the parent skill's scratch instance. Run verify.py. Require a
matching opaque action through input, handler, publication and layout. Verify
that a swallowed action remains incomplete, that a stale result cannot complete
its replacement, and that request metrics correlate using the three opaque UUID headers. Compare enabled/disabled collection with equal validated work and five
alternating runs before reporting overhead.

## Gotchas

A settled query and a superseded keystroke have different outcomes. Label both.
Handler wall time includes awaits. URLSession phases omit the server's internal
handler unless independently correlated. Missing phases must remain unknown.
# Supersession and selection intent

Six Find inputs must produce five superseded outcomes and one completed Search,
with zero incomplete actions after the final result. Superseded actions keep
their own count and never contribute an incomplete age or a red budget marker.
The synthetic native-handler control requires the event's window and table
row to match, then checks Up at the first row, Down at the last, Return and a
pointer on the selected row. None starts a selection action. Moving Down and
clicking a different row are positive controls. These direct handler calls do
not establish actual SwiftUI input delivery or visible selection.

## Stall CPU evidence

Require the optional `mainThreadCpuMS`, `processCpuMS` and `hostLoad1m` fields
to survive the production journal and export. Check literal CPU deltas across
the heartbeat gap, shared trace ids for progress and delivery, unknown counters,
and inactive suppression. A real Mach-thread/process sampler control compares
sleep with JSON encoding and measures sample cost. A low CPU delta does not by
itself prove starvation. Historical records without these fields remain unknown.

## Pointer and native highlight phases

The press is kept as the input timestamp of `ui.input.observed`. A release
records `ui.input.released` with that same opaque action id, the release time
and `releaseSource`. When the release comes before the handler, the platform
performed the action on release: its duration, input queue and pending or
failed age run from the release, and press to release is `holdMS`. A command
handler invoked on press keeps the press. Keep the association if layout
finishes while the button is held. A second release, a foreign window and an
old recording scope must not append a record.

SwiftUI's Task list is an `NSOutlineView` that selects on release inside its own
tracking loop, which takes the mouse-up, so the local monitor never sees a row
click's release. For a pointer selection in an outline view with no observed
mouse-up, the click's first native selection notification (changing or
committed) is the release, with `releaseSource: nativeSelection`; a later
mouse-up adds nothing. An observed mouse-up stays `releaseSource: mouseUp`.
A plain `NSTableView` selects on press, so its notifications never stand in.

Each selection's `ui.layout.committed` carries `selectionContext`: the release
source, the list's row count (group headers included), whether a catalog
refresh ran between input and layout, process uptime, and the current journal
file size and this process's journal bytes. Journals written before these
fields read as before, with the fields absent.

Observe the public `NSTableView` and `NSOutlineView` selection notifications
from the Task table associated with the current input. They produce
`ui.selection.nativeChanging` and `ui.selection.nativeCommitted`. The direct
notification test proves correlation and exclusion, not that SwiftUI emits
these notifications or that a physical click selects a Task. On release and
inspector layout, `nativeSelectionNotifications` reports each notification as
`observed` or `unavailable` at that boundary. Unavailable is unknown highlight
time, never zero. The Recent activity disclosure uses the same plain labels.

A native marker has the lifetime of its view, while actions and input receipts
have the recording scope's lifetime. A recorder restart must preserve the
window mode from a still-attached marker without carrying its old action.

The production RootView control hosts 178 synthetic Tasks in an unordered
window. Its row marker reaches `SwiftUIOutlineListView`, an `NSOutlineView`.
Programmatic native selection must produce exactly one native commit record.
The old table-only subscription produced zero. The helper saves the row-marker
ancestor classes and notification names without Task content. The standalone
table/manual-post controls still prove correlation and exclusion, but cannot
establish this production hierarchy or physical pointer delivery.

## Whose layout completes an action

A layout completes an action only on a surface marker that was present when the
action's result was published, or that registered within `resultWindowMS`
(2 s) after it, such as a sheet the result opens. A later, unrelated layout of
the same kind of surface is not the action's result: the action stays
unfinished and is reported with its age. Save is measured on the main window,
where its result shows once the inspector closes. Choosing the Profile already
shown starts no Profile switch; a switch is ready only when the new Profile's
catalog has arrived and the stream is live.
