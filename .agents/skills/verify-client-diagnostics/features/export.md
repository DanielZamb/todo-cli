# Local panel and export

The existing Diagnostics window shows local client timings and exports metadata.

## Sub-features

- CD07 shows This client in Compact and full Diagnostics.
- CD08 exports bounded metadata for an owner and denies export after sign-out.

## How to get to it (user POV)

Open Diagnostics, inspect This client and choose Export metadata. Save the JSON
with the native file dialog. The coordinator drives that dialog in a real-app
pass; the worker does not open it.

## Driving it with the verification helper

Preconditions: an owner-scoped recorder with synthetic events. Run verify.py.
Require the local section and export identifier in offscreen Compact/full
captures, parse the production export document and verify its phase/count fields.
Revoke the owner scope and require the export to disappear or be refused.
Capture the production Diagnostics window content in full and Compact, light
and dark, with an over-budget row, an incomplete row and every local disclosure
expanded. Check plain labels, column units, age formatting and whole-row
accessibility labels. Compact uses the window's common collapsed section
structure by default. This client is labelled Always live when server polling
is Paused. The three disclosures use independent small rings and have explicit
empty states.

Require the literal summary `1 over budget · 1 incomplete` for one slow
completion and one pending action. Pending interactions with unknown latency
sort before slow completions. Request timings use plain operation labels and
Recent activity uses seconds beyond one second. Incomplete totals and wait
durations explicitly cover the current recording session.

The observation control changes the local summary and requires zero parent
Diagnostics body invalidations, then changes server loading state and requires
one. For accessibility, collect the unordered tree and an export-button
positive control. A tree with zero control labels cannot decide whether a row
label repeats. Leave that question for the real-app accessibility check.

## Gotchas

Local summary reads must not poll the server or refresh Tasks. The signed app's
system save dialog and actual click-to-inspector latency remain supervised proof.
The JSON export covers bounded in-memory events and summaries. The private
rotating journal files contain the longer retained history.
