# Recording and transfer

The owner uses todo diagnostics runs/show/export/import/compare on loopback with
an owner Session. Apps share the same HttpApi contract. Ingestion is strict
metadata only. Unknown fields and private content are refused without echo.
Import has a no-write dry run; NDJSON export follows bounded ordered pages.

The SQLite worker returns stored only after commit. Identical facts are no-ops;
conflicts leave a durable whole-batch refusal mark and null all-start fractions.
Marks survive data eviction and export/import; mixed-run reducers keep separate
denominators. The parent skill drives literal starts, quantiles, outcomes,
credential/content cases and the safe refusal reasons through real HTTP and CLI.
