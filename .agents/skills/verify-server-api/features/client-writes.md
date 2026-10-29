# Client writes

## Sub-features

Move a Task between Profiles, Revert an accepted change, create or edit an RFC
5545 Series, and skip an Occurrence. Every existing Task write requires its
Version. A mismatch returns 409 and the exact latest authorized Task.

## How to get to it (user POV)

- POST `/profiles/work/tasks/{task}/move` with `from_version` and `destination_profile`.
- POST `/profiles/work/tasks/{task}/revert` with `from_version` and the History `seq`.
- POST `/profiles/work/series` with `task` creation details and `recurrence`.
- PATCH `/profiles/work/tasks/{task}/series` with `from_version`, Task `changes`, and `recurrence`.
- POST `/profiles/work/tasks/{task}/skip` with `from_version`.

Series edits target an existing Occurrence. Responses return the affected Task,
including its Series ID in `occurrence.series_id`. Recurrence has `dtstart`, one
RFC 5545 `rrule`, and `exdate`, using the domain's date or instant representation.

## Driving it with curl

Run `scripts/verify-writes.sh <absolute-new-evidence-directory>` from the skill.
It compiles the production server and provisioning driver, starts on port 0,
and uses authenticated HTTP against a fresh scratch database.

The drive moves `Inbox with Project` to personal at Version 2 and Reverts that
move at Version 3, restoring its work Project and Tag. A title edit and Revert
reach Version 5. Delete and Revert restore visibility at Version 7. Requests
without credentials, with read-only Tokens, or outside a Token's Profile fail.
Rejected or foreign History sequences cannot be Reverted through another Task.

A daily Series starts on October 27. Editing it to a weekly rule with November
3 excluded, then skipping its current Occurrence, creates exactly one open
successor on November 10 with the edited title and inherited Project and Tag.
Create and edit reject whitespace-only titles and unsupported sources at the
canonical request schema with HTTP 400. Stale move, Revert, Series edit and skip
requests compare the complete 409 body
with the latest Task. Invalid rules and foreign metadata create no Series.

The drive also reads both Profile SSE streams and requires their separate
move departure and arrival events. SQLite observations check Versions, Series
rules and move event ordering. The provisioning binary then proves replay
from an earlier snapshot, full replay, and a new snapshot reproduce the exact
Tasks and Series. Evidence includes actions.json, durable-state.json, both
Profile .sse files, replay.json, database.sql, and result.json after cleanup.

## Gotchas

A move requires write access to both Profiles and preserves the Task ID.
Project, Tags and Series membership belong to the source Profile, so the moved
Task clears them and keeps its other details. The source Series remains there.
Reverting the move restores the original metadata when the moved Task is still
at the arrival state. A later edit causes a conflict.

Each move records TaskMovedOut in the source Profile and TaskMovedIn in the
destination Profile, atomically. Each event contains only that Profile's Task
state, with a shared opaque move_id. Consumers remove the Task on TaskMovedOut
and insert it on TaskMovedIn. Revert records another pair with original_seq.
Profile-scoped History and SSE never include the other Profile's Task state.

Skip means cancel the current Occurrence and resolve its successor in the same
transaction. Standalone Tasks cannot be skipped or edited through Series routes.
Revert uses the domain's existing inverse and OCC rules for all other events.

The helper also runs nine compiled HTTP regression cases against separate
scratch copies of the frozen v2 recurrence fixture. They finish moved migrated
Tasks, move them back without restoring recurrence, Revert a move to restore
membership, edit and skip migrated Series, and reject a recurrence edit through
a terminal or reopened Occurrence before advancing its existing successor. Each case checks
full and snapshot replay, process cleanup and scratch deletion. Evidence lives
under `regressions/` within the selected evidence directory.

Migrated implicit membership is resolved inside the Task's Profile. Moving it
records `legacy_series_detached: true` on the Task, so normal moves back cannot
reactivate the old definition. Revert restores the original Task state, including
membership. The source Series remains unchanged. Series edits require an open
or snoozed Occurrence; editing a terminal Occurrence returns 422.
Changing the recurrence kind also returns 422 when another nondeleted
Occurrence retains an incompatible cursor. Reopening an earlier Occurrence
does not bypass that check.

Authenticated request-schema failures append a rejected operation through
the shared command before returning 400. The record contains its Task, Version
and schema category. Raw request bodies are excluded from these records, so a
rejected move does not retain the destination Profile in the source History.

Task and Series writes accept `project_name` and `tag_names` through the shared
CLI resolver. A supplied `project_id` takes precedence over `project_name`.
`tags` and `tag_names` combine; names alone replace the Tags. Empty Project
names clear the Project, and Tag names lowercase and deduplicate. Profile
validation still checks every supplied ID. No definition is committed on a
rejected write. The curl drive retains `metadata.json` and `metadata.sse`, checks
GET discovery and reuses the same definitions on another Task before replay.

C10 extends `verify-writes.sh` with the Copy endpoint, completed status, preserved
created_at, provenance History, stale Versions, scoped-token rejection, and
unchanged unrelated source Tasks. Move now resolves Project and Tags by name
instead of clearing them. `copy.json` retains these HTTP receipts.

`verify-writes.sh` accepts `TODO_SERVER_BINARY` and `TODO_SEED_BINARY` to reuse
matching compiled inputs. It still provisions a fresh database for every drive.
