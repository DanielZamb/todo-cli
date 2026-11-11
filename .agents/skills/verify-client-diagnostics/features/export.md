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

## Gotchas

Local summary reads must not poll the server or refresh Tasks. The signed app's
system save dialog and actual click-to-inspector latency remain supervised proof.
