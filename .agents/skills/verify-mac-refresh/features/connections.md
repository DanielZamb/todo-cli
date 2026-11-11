# Connection ownership

## Sub-features

One model credential scope owns its ordinary Client and URLSession. Replacing
credentials cancels its in-flight ordinary requests. Event streams retain their
separate per-connection cancellation owner.

## How to get to it (user POV)

Keep the app connected through repeated refreshes, then replace its Session.

## Driving it with the scratch command

Run the isolated production-transport helper in each mode:

```sh
.agents/skills/verify-client-diagnostics/scripts/verify.py docs/evidence/mac-perf/c4/new-connections --connections-only
.agents/skills/verify-client-diagnostics/scripts/verify.py docs/evidence/mac-perf/c4/new-sockets --sockets-only
```

The first mode uses the actual model and generated client for two refreshes.
Require 16 requests, at least eight reused connections, and fresh connections
after credential replacement. A delayed ordinary health request must cancel
when its credential scope ends. The second mode makes 300 direct-server
refreshes and 2,400 requests, requires 178 Tasks with no load error,
and samples descriptors, TCP sockets and the runtime soft limit. Require at
most 16 sockets after the final refresh. Read all literal receipts and cleanup.

## Gotchas

These probes use direct scratch HTTP, without the counting proxy. Set the
256 soft limit before the first URLSession transport request, then report
whatever CFNetwork raises it to. Lowering it after startup can manufacture a
different condition and is not a valid owner-launch control. Never impose a
256 hard limit or revive the disproved fixed-256 exhaustion explanation.
Socket counts do not establish native input latency. Run the subscriber and
idle proofs when changing session ownership.
