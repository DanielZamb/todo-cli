# Combined Task filters

## Sub-features

Project and Tag, Priority, open or closed Status, Due and Scheduled calendar
dates, Attachment names/labels/paths/URLs, Energy and estimated minutes combine
with AND. Closed means done or cancelled. `none` selects missing metadata.
Instants use their stored time zone for calendar-date matching.

## How to get to it (user POV)

Run `todo list --project 'Client Launch' --tag revenue --status open --energy 3`.
Use `todo man list` for every flag. Both desktop Task Lists have Project and Tag
selectors and a Filters panel. HTTP uses the same flag names as query parameters
on `/profiles/{profile}/tasks`.

## Driving it with the compiled CLI and HTTP

Run the parent skill helper. Require every expected title array to match through
both interfaces, all active CLI filters to be reported, and invalid values to
fail with CLI exit 2 and HTTP 400. The scratch fixture includes unplanned,
scheduled, dated, closed, unassigned and unrelated Tasks.

## Gotchas

Inbox continues to mean open Tasks without Due or Scheduled dates. Filtering
never widens a planning view or changes a Task. Attachment search reads metadata
only; it never opens referenced files or follows URLs. Empty CLI results retain
the existing contract that omits `tasks`.

## Version guardrails

The compiled CLI and HTTP cases assert Status open alone returns the literal open Task titles, excluding both done and cancelled Tasks. Status closed alone returns exactly Agree launch discount and Retire old rate card. A misspelled HTTP filter name returns HTTP 400 with its name in the message. Both desktop planning filters disable Status and show "Planning views show open Tasks only." All tasks retains the active control.
