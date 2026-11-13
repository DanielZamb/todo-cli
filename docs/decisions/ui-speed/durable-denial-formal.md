# Durable refusal candidate mapping renewal

Product capture: 13ff84d64f4bb0fb8e206dcc700f11b2956e38ed.
Previous DAG product: 5f46e7b3c36afaffe8f2328df6453b8546be27a5.
First proposed capture: 1a018e9633bfa3fa841b7721a48f7ac6a9abe3c8. It advanced to
635a93d1c2a0d99c13857244c36b4a1656d73e92 to include the
later-stamp match fix in auth/rejection-history.ts, the driver and its test.
Between the two, no mapped file changes; git diff of every coverage path is
empty.
It advanced again to fb55ff7c83b968703634feb75f85c0e027142fa3 for the read-first refusal
decision (ruling 2026-11-13). Its only source change is inside
Authentication.perform's rejection branch; the auth.ts whole-file hash moves
to 0b743e8e5b245cf792118b20ff721e6f7fe38d59b12d34d2dc4676e4070c5982. The four
mapped Authentication bodies (startSeries, append, requireCredential, mutate)
and every other mapped file are byte-identical to 635a93d1c2a0d99c13857244c36b4a1656d73e92.
It advanced again to 8061ae0098a1d4627e3b41f3f0cfaf4270616bf9 for the review seat's F1
and F2: only auth/rejection-history.ts changes (the size-bounded walk and the
total recording-clock mapping). That file is not mapped; every mapped file,
auth.ts included, is byte-identical to fb55ff7c83b968703634feb75f85c0e027142fa3.
It advanced again to 13ff84d64f4bb0fb8e206dcc700f11b2956e38ed for the review seat's F6: the
walk reads every 257th large row it meets as evidence. Only
auth/rejection-history.ts changes; every mapped file is byte-identical to
8061ae0098a1d4627e3b41f3f0cfaf4270616bf9.
This renewal is a candidate pending independent correctness-seat acceptance.
No model, invariant, bound, expected result or control changes.

Only auth/auth.ts changes among the DAG library/public covered files. The full
source diff removes Authentication.record's process-memory fields and delegates
its repeated-refusal lookup to auth/rejection-history.ts. No other method changes.
Authentication.append, startSeries, requireCredential and mutate are byte-identical
to the previously pinned product. The first pair is the library map; the second
pair is the public map. Every other mapped file is byte-identical. OperationStore's
whole file is identical, so no listed OCC function changes, including record,
recordRejection and transaction. Since 79d2ce0f the lookup reads the database
first outside any transaction, in one statement, and on absence again inside
the existing rejection writer callback; it never reads a retained authority.

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
