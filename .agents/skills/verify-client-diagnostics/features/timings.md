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
