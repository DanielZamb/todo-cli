# SQLite bounds and failure isolation

One recordings.db, with engine-managed WAL/shared-memory files, lives in a 0700
private directory and uses 0600 files. SQL keys, foreign keys, checks and atomic
transactions replace every file index and manifest. The app cap remains 32 MiB,
the total 256 MiB, retention seven days. Conservative SQL row charges include
payload, indexes and page allowance. Quotas use SQL sums inside the write
transaction; deletion and its loss mark commit together. SQLite page limits
provide a second total guard. The main thread queues at most 1 MiB / 1024 batches.

Expiry uses bounded DELETE transactions, with a fixed minute cadence and a
minimum minute automatic retry after failure. Export is an ordered snapshot
range, at most 131072 bytes per page. There is no producer/cursor key alias.
A run/producer/sequence conflict refuses the whole batch and commits its mark.
The producer retains a batch after any failed acknowledgement. The behavioral,
constraint, crash, flood and full-store controls are in the parent skill.
