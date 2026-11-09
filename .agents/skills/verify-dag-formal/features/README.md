# Formal coverage index

| Feature | Current proof | Entry |
| --- | --- | --- |
| Dependency writes and concurrent writers | Finite DagAcyclic model with five failing controls | [transactions](transactions.md) |
| Delete, Revert and resolved History | Finite grouped lifecycle/replay model; production pending A | [lifecycle](lifecycle.md) |
| Planning graph queries | Required properties recorded; real generated-input checks pending A/B | [queries](queries.md) |

The one command is `bun .agents/skills/verify-dag-formal/check.mjs` from the root.
Exit 0 covers only the stated model checkpoint. Read the report and mapping
before treating it as evidence about changed product source.
