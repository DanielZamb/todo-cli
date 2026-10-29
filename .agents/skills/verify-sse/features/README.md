# SSE feature map

Run the complete helper in [verify-sse](../SKILL.md) for every feature below.

- [Ordered operations](ordered.md): committed History only, global IDs, Profile filtering.
- [Idle delivery](idle.md): retain a subscription through twelve seconds without writes.
- [Reconnect](reconnect.md): kill the live connection and resume after Last-Event-ID.
- [External writers](external-writers.md): actual compiled CLI and concurrent HTTP writes.
- [Authorization](authorization.md): credentials, Profile scope, cursor validation and revocation.

Database restore has a separate [Snapshot drive](../../verify-snapshots/SKILL.md)
that proves generation reloads and cursor reset before reused sequence delivery.
The server test `reloads both Profile streams across restore without broadcasting
global AuthChanged` subscribes to two Profiles before restore and commits writes
before the next stream poll. Both streams reload at the DatabaseRestored boundary
and receive their later operations. Global AuthChanged stays excluded.
