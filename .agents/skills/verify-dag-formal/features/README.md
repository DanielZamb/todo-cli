# Formal and production coverage index

| Feature | Current proof | Entry |
| --- | --- | --- |
| Dependency writes and concurrent writers | Finite model and committed candidate drives | [transactions](transactions.md) |
| Delete, Revert and resolved History | Finite lifecycle model, independent raw replay and candidate integration | [lifecycle](lifecycle.md) |
| Planning graph queries | Generated real-import properties and isolated real-source sensitivity | [queries](queries.md) |

Run `bun .agents/skills/verify-dag-formal/check.mjs` from the root. Exit 0 covers
the stated checkpoint, pinned to f140c7b09bcb1db48ce4ccaee797ecfe60019ce4.
Final public commands, clients and fresh discovery remain pending.
