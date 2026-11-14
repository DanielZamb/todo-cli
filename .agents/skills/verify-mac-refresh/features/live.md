# Live changes

## Sub-features

Committed operations update the visible catalog in sequence. Reconnect resumes
from the saved cursor. A quiet healthy reconnect performs no catalog read.

## How to get to it (user POV)

Keep a Profile open while another client or the CLI edits Tasks.

## Driving it with the scratch command

Run the parent skill's paired command. Require the CLI edit and all 20 burst
operations to be consumed and the final catalog to equal the server. Inspect
full-read/request counts and current-row time. Quiet EOF must recover without
an extra full catalog read. Use verify-sse for real HTTP resume and auth proof.

## Gotchas

A final cursor alone does not prove current rows. An early snapshot can already
contain later operations. Report both observations and do not treat programmatic
root layout as native interaction latency.
