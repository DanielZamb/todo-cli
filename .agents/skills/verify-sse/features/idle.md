# Idle delivery

## Sub-features

A quiet subscription stays open and receives the next committed operation.
Session and Access Token revocation still close active streams.

## How to get to it (user POV)

Subscribe to `/profiles/work/events`, finish receiving History and leave the
connection open while making no writes.

## Driving it with curl

Run the helper in [verify-sse](../SKILL.md). After resumed History arrives,
it waits twelve seconds without writes, requires the original curl process
to remain alive, then creates `After twelve idle seconds` over HTTP. That
Task must arrive on the same connection. Result records the elapsed wait,
liveness and delivery. Revocation must then close the same stream normally.
Cleanup records the exit status of every owned curl process and server.
The server test also waits twelve real seconds, checks the literal Task title
and sequence, signs out the Session, and requires a failure event followed by EOF.

## Gotchas

Bun's connection idle timeout defaults to ten seconds. The server disables it
with `idleTimeout: 0`. No heartbeat changes the protocol or cursor; credentials
are still checked every 250ms and client disconnects still cancel the stream.

## Driving the Mac transport and model headlessly

From the checkout root run:

```sh
.agents/skills/verify-client-diagnostics/scripts/verify.py docs/evidence/mac-idle-new --stream-only --long-idle
```

This reuses source-hashed compiled scratch binaries and creates its own HOME,
owner, Profiles, database and delayed-health proxy. It builds unhosted release
Swift tests through swift-slot. It never opens Todo.app, a hosted XCTest target,
Keychain, a sheet or a signed artifact. The native control shortens the ordinary
request timeout to 100 ms, leaves the stream idle for 1,500 ms, then requires a
real committed operation on that same connection. A delayed ordinary request
must still time out. The old policy fails this control with a timeout.

The production-model drive additionally observes five real idle minutes after
startup settles. Require zero reconnects, full refreshes and requests during
that interval, live writable state and no loading. Read result.json,
stream-native.json, stream-five-minutes.json and commands.json. Runtime resources
and request phases are metadata only. Pure model controls cover quiet EOF,
failed reconnect, recovery of directory and lookup, stale search recovery,
cursor/generation drift and bounded repeated-end backoff. Native selection and
on-screen dialog presentation remain the coordinator's real-app gate.
