# Dependency feature map

- [Storage and invariants](storage.md): migration, guards, endpoint isolation, cycles, degree and status rules.
- [Lifecycle and recovery](replay.md): initial edges, Delete, Move, Profile Delete, Revert, Purge and both replay modes.
- [Competing writers](concurrency.md): opposite-edge processes under the production writer lock.

- [Queries and ranking](queries.md): deterministic Kahn ordering, pruned distinct energy, Ready/Blocked, connected shape and safe Mermaid.
- [Public commands and import/export](public.md): compiled CLI/HTTP, PTYs, fingerprints, forward references and managed Obsidian output.
## Migration backup transport

The migration rehearsal script adds a WAL-backup transport case to the ten
earlier-schema, large-Profile and Purge cases. It uses the installed SQLite
`.backup` command with the production WAL pragmas. The input has no sidecars;
immutable pre-open capture must leave its hash unchanged and refuse writes.
Live captures must observe the migrated WAL state. The compiled private-reader
entry is exercised on scratch data only, with full and checkpoint replay checks.
