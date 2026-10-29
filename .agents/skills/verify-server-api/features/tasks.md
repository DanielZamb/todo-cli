# Tasks

Task List accepts optional Project, Tag, Status, Priority, Due and Scheduled
dates, Attachment metadata text, Energy and estimated-minute query parameters.
They use the shared `TaskFilters` schema and matching function. Run the compiled
[filter proof](../../verify-filters/SKILL.md) for the complete literal matrix,
including invalid query values returning HTTP 400. Task reads stay read only.

## Sub-features

List, show, create and patch one Profile's Tasks.

## How to get to it (user POV)

Use `/profiles/work/tasks` and `/profiles/work/tasks/{task}`. Create accepts a title plus optional Task details. Patch takes `from_version` and a `changes` object.

## Driving it with curl

The helper creates `Prove the HTTP API` and patches it to `Ship the HTTP API`. Show and list must return the accepted values, and omitted fields must remain unchanged. The database dump must retain the final Task.

The HTTP contract test `isolates Project and Tag definitions from rejected work History and HTTP responses` compares missing and foreign Project and Tag IDs on create and edit. Every attempt must return HTTP 422 with `validation`, and a work reader's rejected History must contain null Project definitions and empty Tag definitions. Personal names stay private, and both Profiles' Tasks and definitions remain unchanged. Run it with `pnpm --filter @todo/server test --testNamePattern "isolates Project"`.

## Gotchas

Task IDs, timestamps, initial status and defaults come from the domain. Project and Tag IDs must already exist in the Profile. Deleted Tasks are hidden. There are no profile/project/tag management routes in S01.
