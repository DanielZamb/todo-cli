# Connection ownership

## Sub-features

One model credential scope owns its ordinary Client and URLSession. Replacing
credentials cancels its in-flight ordinary requests. Event streams retain their
separate per-connection cancellation owner.

The first ownership implementation is blocked. Its direct invalidation races
request creation in the pinned URLSession adapter and can abort the process.
Resource counts alone do not qualify a corrected implementation. Retirement
must close admission before invalidation and let every admitted creator exit.
The current correction and the controls below require a new green receipt and
independent review before installation.

## How to get to it (user POV)

Keep the app connected through repeated refreshes, then replace its Session.

## Driving it with the scratch command

Run the isolated production-transport helper in each mode:

```sh
.agents/skills/verify-client-diagnostics/scripts/verify.py docs/evidence/mac-perf/c4/new-connections --connections-only
.agents/skills/verify-client-diagnostics/scripts/verify.py docs/evidence/mac-perf/c4/new-sockets --sockets-only
.agents/skills/verify-client-diagnostics/scripts/verify.py docs/evidence/mac-perf/c4/new-retirement --retirement-only
.agents/skills/verify-client-diagnostics/scripts/verify.py docs/evidence/mac-perf/c4/new-stress --retirement-stress
.agents/skills/verify-client-diagnostics/scripts/verify.py docs/evidence/mac-perf/c4/new-restart --restart-only
```

The first mode uses the actual model and generated client for two refreshes.
Require 16 requests, at least eight reused connections, and fresh connections
after credential replacement. A delayed ordinary health request must cancel
when its credential scope ends. The second mode makes 300 direct-server
refreshes and 2,400 requests, requires 178 Tasks with no load error,
and samples descriptors, TCP sockets and the runtime soft limit. Require at
most 16 sockets after the final refresh. Read all literal receipts and cleanup.

The retirement mode repeats the exact production-default crash scenario 200
times. Start refreshAfterWrite, yield three times, replace the credential with
another valid scratch Session, and await the refresh. Require 178 final model
and applied rows and a writable model. This control proves row counts, not
independent row-content equality.

The stress mode replaces credentials 3,000 times with a refresh, Complete or
Reopen, and a production Diagnostics poll in flight. It records actual request
starts, rejects retained old Clients with Swift cancellation, and compares the
final catalog with an independent server read. Require zero new-scope request
starts from retired work and no late old-Client health requests on the server.
A positive current-Client health request must increment both server and client
counts. Already admitted writes can have committed before cancellation; no
write retry is added. Inspect the receipts rather than counting cancellations
as successful writes.

The latency table is a 2,048-request ring, not a cumulative request counter.
The helper's private counter reads its owned server's route-only log instead.
The stress barrier requires actual starts before replacement and records
unfinished requests so a queued test Task cannot masquerade as in-flight work.

The restart mode restarts only its compiled scratch server before the first
pooled GET, Complete and Create. Require one History entry per applied write,
one new Task, and reported success. It does not inject a lost response after
commit, and it does not establish an exactly-once HTTP retry protocol.

The state suite also delivers held write, Conflict, health and Attachment
read-back replies after credential replacement, and retires a quick-add
debounce before its request. These controls use generated clients with a
controlled transport to test publication boundaries. The crash and stress
controls use the production default transport without overrides.

## Gotchas

These probes use direct scratch HTTP, without the counting proxy. Set the
256 soft limit before the first URLSession transport request, then report
whatever CFNetwork raises it to. Lowering it after startup can manufacture a
different condition and is not a valid owner-launch control. Never impose a
256 hard limit or revive the disproved fixed-256 exhaustion explanation.
Socket counts do not establish native input latency. Run the subscriber and
idle proofs when changing session ownership.
