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
