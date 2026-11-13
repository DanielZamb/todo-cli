# SQLite bounds and failure isolation

One recordings.db, with engine-managed WAL/shared-memory files, lives in a 0700
private directory and uses 0600 files. SQL keys, foreign keys, checks and atomic
transactions replace every file index and manifest. The app cap remains 32 MiB,
the total 256 MiB, retention seven days. Conservative SQL row charges include
payload, indexes and page allowance. Quotas use SQL sums inside the write
transaction; deletion and its loss mark commit together. SQLite page limits
provide a second total guard. The main thread queues at most 1 MiB / 1024 calls,
including reads. Requests charge their encoded envelope plus 256 bytes. Every
call and worker readiness has a five-second deadline. Deadline refusals do not
retire the worker. One dispatched call, a predicted-work admission bound and a
ten-second reply/progress inactivity watchdog separate overload from a hang; worker and factory recovery use a minute backoff. Diagnostics
reports unavailable storage without contacting the worker.

Expiry uses bounded DELETE transactions, with a fixed minute cadence and a
minimum minute automatic retry after failure. Export is an ordered snapshot
range, at most 131072 bytes per page. There is no producer/cursor key alias.
A run/producer/sequence conflict refuses the whole batch and commits its mark.
The producer retains a batch after any failed acknowledgement. The behavioral,
constraint, crash, flood and full-store controls are in the parent skill.

An external reader may hold physical expiry at the cap. Offers then count as
capacity drops and report the held-reader reason; automatic maintenance retries
each minute without counting another storage failure. It recovers after release.
Owned reads commit bounded row snapshots before materialization, and compare
holds no snapshot across steps. A changed external version refuses the read.
The main file retains its high-water allocation; no vacuuming is configured.

Initialization rechecks an empty file under native exclusion and publishes the
schema, application id 0x544f4452 and version 1 together in rollback mode. An
unknown main header is refused without opening SQLite. The exact catalog of a
claimed store is checked before mode changes or writes. Foreign overlapping
tables, wrong columns, identifiers, versions, indexes and triggers refuse with
every file, mode and directory listing unchanged. The initialization/all-files
controls in the parent skill prove both peer schedules and one publication by
two legitimate initializers. No migration or validation copy is needed.

Admission history keeps eight individually timestamped samples per method,
at most 56 overall. Each expires after 60000 ms; new replies never restamp old
observations. The production rate tests and archived 61-second witnesses check
expiry, method isolation and admission after a stale outlier is gone.

A refusal leaves every file unchanged in every class, including a catalog or
identifier change committed only in the WAL and a database swapped onto the
path after the preflight: the committed catalog is read from descriptors, and
the writable connection closes under a shared exclusion that stops any
checkpoint. Empty main files beside empty sidecars carry no data and are
initialized; a non-empty sidecar or an interrupted initialization's non-empty
journal stays refused. Owner Diagnostics names each refusal's state, reason
code and the files to remove with the server stopped. Recordings are
diagnostic data and may be discarded.
