# Import a repository inventory

## Sub-features

JSON arrays, NDJSON, stable external ids, Project and Tag names, completion, idempotency and published schemas.

## How to get to it (user POV)

Run `todo import repository-sync.json --format json` in the selected Profile.
Read the input contract with `todo schema import-item`.

## Driving it with the compiled CLI

Run the parent skill's helper. Its fixture models `sync_todo.py`'s repository keys,
summary with file path, Project names, Tags and open or done status. The proof
creates two Tasks, then reports two unchanged Tasks for repeated JSON and NDJSON.
Show and list retain each external id. The driver observes real process exits.

## Gotchas

A file belongs to one selected Profile. External ids are unique within that Profile,
including deleted Tasks. New Tasks require a title. Omitted fields keep their values;
null clears nullable fields. Import rejects duplicate external ids within a file.
