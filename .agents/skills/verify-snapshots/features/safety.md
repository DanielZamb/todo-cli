# Purge and refusal

## Sub-features

Existing Snapshot redaction, Purge replay on restore, corruption and newer-schema refusal.

## How to get to it (user POV)

Delete then Purge a Task, then restore an earlier Snapshot.

## Driving it with the compiled CLI

Run the parent skill's verify.sh. It observes raw Snapshot bytes and literal zero Tasks after restore. The domain tests also preserve one Task in another Profile.

## Gotchas

A corrupt Snapshot blocks Purge until the owner repairs or discards it. Restore never ignores a checksum mismatch. The content-free Purge journal survives every restore.
