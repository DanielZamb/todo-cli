# Lifecycle and conflicts

## Sub-features

Complete, cancel, reopen, Delete and stale-Version rejection.

## How to get to it (user POV)

POST `/profiles/work/tasks/{task}/transition` with `action` and `from_version`. DELETE `/profiles/work/tasks/{task}?from_version=N` records Delete.

## Driving it with curl

The helper requires Versions 1 through 6, status changes open/done/open/cancelled, and a deletion timestamp. Stale patch, transition and Delete return 409 with the latest Task. Show then returns 404 and list is empty. Contract tests also complete an Occurrence and observe its successor.

## Gotchas

Delete retains the Task and History. It is recoverable by domain Revert. History and S05 Revert and Series writes are mapped in the client feature files. Purge has no HTTP route. Complete/cancel resolve successors inside the domain transaction.
