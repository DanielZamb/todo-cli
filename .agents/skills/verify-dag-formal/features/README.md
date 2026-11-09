Current status: full conformance is held for L1 exact merged integration SHA.
The following earlier checkpoint remains candidate-specific. Corrected G4 next
order is own energy, unknown last, then whole-Profile topo; the old all-three-topo
wording is withdrawn. New response/getter fixtures are prepared, not proven.

# Formal and production coverage index

| Feature | Current proof | Entry |
| --- | --- | --- |
| Dependency writes and concurrent writers | Finite model and committed candidate drives | [transactions](transactions.md) |
| Delete, Revert and resolved History | Finite lifecycle model, independent raw replay and candidate integration | [lifecycle](lifecycle.md) |
| Planning graph queries | Generated real-import properties and isolated real-source sensitivity | [queries](queries.md) |

Run `bun .agents/skills/verify-dag-formal/check.mjs` from the root. Exit 0 covers
the stated checkpoint, pinned to f140c7b09bcb1db48ce4ccaee797ecfe60019ce4.
Final public commands, clients and fresh discovery remain pending.

The [public continuation](public.md) is separately pinned to e7170510. Its
unaffected diagnostic subset excludes the known failing malformed CLI boundary.
G11 root-only response and clients await an explicit corrected B SHA. The f140
proof above remains historical and is not final public acceptance.
