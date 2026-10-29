# Purge redacts History content

Purge must erase a task for good, but the operation log is the source of truth (ADR-0007) and must stay replayable. Purging a task therefore keeps every one of its log entries (seq, operation type, versions, outcome and timestamps) and blanks their content: title, description, tags, Project and Series details, and any rejected attempt's payload. Snapshots that contain the task are redacted the same way. Replay still ends with the task absent, and a purged task can no longer be reverted. We rejected keeping the content, which would make Purge a lie, and deleting the entries, which would break replay and leave gaps in seq.


## Client presentation

Clients retain the original operation label and local time for redacted entries,
and say "Content erased by Purge." They never reconstruct old or new values from
redacted replay facts. Redacted entries never offer Revert. Rejected attempts
remain distinct and explain the rejection without displaying their erased payload.
