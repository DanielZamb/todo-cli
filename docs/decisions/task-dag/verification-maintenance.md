# Verification portability and WAL-copy capture

This maintenance changes documentation and verification only. The production
packages and both client source trees remain identical to the reviewed
`3d4bcda035a7655518ee3e8b76116e3efe735396` delivery.

The original rehearsal reader reproduced `SQLITE_CANTOPEN` on a scratch database
created with production WAL pragmas and copied through SQLite `.backup`. The
standalone copy retained the WAL header but had no WAL or shared-memory sidecar.
That failure occurred in the pre-open read, before migration.

The reader now opens standalone copies with an explicit immutable read-only file
URI. It checks that the pre-open hash remains unchanged and creates no sidecars.
Captures after writes use normal read-only connections so they include committed
WAL pages. The scratch WAL case checks both modes, write refusal and the compiled
private-reader entry. Existing schema, replay, Snapshot and compatibility cases
retain their literal expectations. Operator scripts report their current step.

Historical report paths now use repository-relative locations for worktree and
canonical-checkout artifacts, and home-relative locations for other home files.
Only path representations change; result numbers and hash strings are retained.
The original evidence and immutable-product receipts are not rewritten. The
reviewed product pins and production coverage are unchanged.

Committed command results, the path/hash-reference audit and the consent-gated
operator script are retained as local evidence. The operator runs the private
copy, not this maintenance task. No real or existing private-copy database was
opened during this work.
