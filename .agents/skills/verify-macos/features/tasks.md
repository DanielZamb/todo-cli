# Tasks

## Sub-features

Project and Tag menus above the Task List combine within All tasks or any
planning view. Inbox membership stays server-computed. All Projects and All Tags
clear one selection; Clear filters clears both. Empty filtered views offer
Clear filters. Planning navigation and Profile switches clear filters.
`TaskFilterTests` checks literal intersections and clearing without launching an
app. The offscreen design proof captures `filters-{tasks,inbox,empty}-{full,compact}-{light,dark}.png`.
The Filters panel adds Priority, open/closed Status, Due and Scheduled calendar
dates, Attachment metadata text, Energy and estimated minutes. The generated
HTTP Task List query supplies matching Task IDs; the view intersects them with
the current planning groups and Project/Tag selections. `TaskFilterTests` proves
this through the generated client and real scratch HTTP. Panel, active-summary
and date-selection captures cover both appearances and sizes.
The HTTP state test caches Open results, then makes only its own transport
unavailable and requests Closed. The applied Open criteria and cached Tasks
must remain together. Clear removes the mask immediately. Minute validation
accepts every positive digit string supported by the shared HTTP query.

Today, Overdue, Scheduled, Inbox, Profile isolation, parsed quick add in the window and MenuBarExtra, removable metadata chips, native editor, History, complete, reopen, cancel and Delete.

## How to get to it (user POV)

Open All tasks. Use Add task or Command-N, then select a Task to edit. Task actions holds lifecycle operations.

## Driving it with native CUA

Use new-task, new-title, add-task, edit-title and save-task. Check literal resulting title and durable Version; transition controls use transition-<Task ID>.

## Gotchas

Run actions.py fixtures for date-relative planning Tasks. Require the server-computed groups, and no work Tasks after switching to personal. Clear the Due chip on Menu bar task tomorrow p1 before adding; require priority P1 and no due date in durable state. Preserve drafts while offline; writes remain disabled. Project and Tag choices come from the server.

## W07 draft safety

Headless tests drive the production navigation state. Row selection, Move and
Profile switches preserve dirty fields and Conflict choices until a Save or
Discard choice. Cancel leaves them unchanged. Save must succeed before navigating;
a rejected Save keeps the current Task. Move uses the accepted Version after Save.
Add and edit also preserves an existing dirty draft until a navigation choice.
Deleting another Task leaves the inspector intact. Deleting the open Task closes
it and shows Task deleted briefly.

In the next authorized native session, exercise Save, Discard and Cancel from the
alert, including keyboard shortcuts. A Conflict must use Resolve the Conflict
first as its title, explain the Conflict and show only Discard and Cancel.
Inspect both appearances. These native alert checks remain held.
