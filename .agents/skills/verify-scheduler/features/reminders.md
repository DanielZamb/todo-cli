# Restart and reminders

## Sub-features

Durable ReminderFired receipt per Task and due instant, competing schedulers,
changed due times, replay and date-only exclusions.

## How to get to it (user POV)

Set a Task's due_at to an instant through PATCH /profiles/work/tasks/{task}.
The server commits ReminderFired for SSE clients to deliver native notifications.

## Driving it with compiled server and HTTP

Run the skill helper. It stops mid-wait, starts two schedulers after the deadline,
requires exactly one receipt per eligible Task, changes one due instant through
HTTP and requires one new receipt. Authenticated SSE resumes after restart,
streams the receipts once, and its real frames decode through the shared
ChangeEvent schema. OpenAPI includes ReminderFired. Full and snapshot replay
retain all receipts.

## Gotchas

Dates carry no implicit time zone and never fire. Done and deleted Tasks never
fire. Title edits and repeated passes never duplicate the same due receipt.
Client native notification delivery belongs to other tickets.
