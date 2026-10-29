# External writers

## Sub-features

The stream follows CLI writes without an HTTP write notification. Concurrent
CLI and server commits retain SQLite sequence order.

## How to get to it (user POV)

Keep a Profile stream open and use the compiled CLI against the same database.

## Driving it with curl and the compiled CLI

Run the helper in [verify-sse](../SKILL.md) with an absolute compiled CLI path.
It copies the binary, records its SHA-256 and source observations, logs into a
scratch HOME, then writes disconnected and live Tasks. Three live writes each
must arrive within one second of process start. It runs one CLI write and one
HTTP write concurrently, then compares their SSE order with durable History.

## Gotchas

Prefer the CLI built from the integrated source in this checkout. The earlier
C05 development binary remains identified by its recorded hash. Never edit
that checkout or merge its branch for this proof. The real HOME and database are never used.
Timing includes CLI startup and commit, and records complete frame receipt.
