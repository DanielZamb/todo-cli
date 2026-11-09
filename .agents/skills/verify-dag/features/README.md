# Dependency feature map

- [Storage and invariants](storage.md): migration, guards, endpoint isolation, cycles, degree and status rules.
- [Lifecycle and recovery](replay.md): initial edges, Delete, Move, Profile Delete, Revert, Purge and both replay modes.
- [Competing writers](concurrency.md): opposite-edge processes under the production writer lock.

These are library entry points in Unit A. Public commands and client workflows
remain with later units.
- [Queries and ranking](queries.md): deterministic Kahn ordering, pruned distinct energy, Ready/Blocked, connected shape and safe Mermaid.
