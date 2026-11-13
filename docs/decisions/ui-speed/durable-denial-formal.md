# Durable refusal candidate mapping renewal

Product capture: 1a018e9633bfa3fa841b7721a48f7ac6a9abe3c8.
Previous DAG product: 5f46e7b3c36afaffe8f2328df6453b8546be27a5.
This renewal is a candidate pending independent correctness-seat acceptance.
No model, invariant, bound, expected result or control changes.

Only auth/auth.ts changes among the DAG library/public covered files. The full
source diff removes Authentication.record's process-memory fields and delegates
its repeated-refusal lookup to auth/rejection-history.ts. No other method changes.
Authentication.append, startSeries, requireCredential and mutate are byte-identical
to the previously pinned product. The first pair is the library map; the second
pair is the public map. Every other mapped file is byte-identical. OperationStore's
whole file is identical, so no listed OCC function changes, including record,
recordRejection and transaction. The lookup uses the database inside the existing
rejection writer callback and never reads a retained authority.

Authentication recording, Snapshot restore and filesystem behavior are outside
the finite graph model. The new helper changes rejected auth History selection,
not Dependency validation, graph state, Version, append/replay or publication.
The compiled auth/domain/process controls qualify that concrete boundary; they
do not extend the TLA+ model's claims. Immutable capture includes the new helper.
The existing source-sensitivity controls and exact restorations must run against
this candidate. A fresh default DAG command follows the committed mapping inputs.
Its actual result belongs in the final run report, not in historical receipts.

Other coverage maps do not list auth.ts and their protected source bytes are
unchanged. They retain their accepted references. The local full pin audit records
all current file/hash entries; no accepted pin is silently advanced. The DAG
library and public references advance together to the one candidate capture.

Detailed before/after method hashes and the exact product diff remain local in
this unit's ignored evidence. Native apps, Swift, Keychain, signing and launchd
remain outside this verification run.
