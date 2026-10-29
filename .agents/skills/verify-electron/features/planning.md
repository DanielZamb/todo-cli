# Planning and quick add

## Sub-features

Project and Tag selectors above the Task List intersect within the current
planning view, including Inbox. All Projects and All Tags clear one filter.
Clear filters clears both. An empty intersection shows No matching tasks and
offers Clear filters. Planning navigation clears filters; Profile switches clear
them and isolate definitions. Sidebar Projects remain shortcuts to Tasks.
`scripts/verify-task-filters.ts` runs inside the compiled host drive. It checks
combined selection, Inbox membership, clear, empty recovery, a second CLI write
through SSE, Profile reset, and control bounds at 393 × 426 in both appearances.
Evidence includes `task-filters.json` and `filters-{tasks,inbox,empty}-{full,compact}-{light,dark}.png`.
The Filters panel adds Priority, open/closed Status, Due and Scheduled calendar
dates, Attachment metadata text, Energy and estimated minutes. Matching comes
from the shared HTTP Task List query, intersected with the server planning view.
Dates support Any date, No date and On date. Active filters remain visible in a
summary. The panel's footer stays visible while fields scroll in Compact mode.
On date uses the shared shadcn Calendar without time controls. Clearing a date
keeps On date selected and requires a replacement before Apply can succeed.
The Calendar's year menu moves with the displayed year. The drive selects a
real 1880 Task, including through the older-year boundary, in both layouts and
appearances. No fixed 1900 cutoff applies to filters.
Calendar popups use the available height and scroll in small windows. After
Clear date and a rejected Apply, the drive reopens the Calendar, checks both
Month and Year bounds, and clicks each control before selecting a replacement.
The popup must stay inside the window. Its bounds and scroll height are saved
in `task-filters.json`.
The focused host drive stops its own server after caching an empty match and
proves Clear filters reveals cached Tasks even when the new read fails.
It also applies Open, stops the server and requests Closed. The Open summary
and its matching Tasks must stay together, with a could-not-apply notice.
New criteria commit only after a successful read. The earlier empty-match
clear receipt and current replacement/clear receipt cover both failure paths.
The drive checks exact dates, closed Tasks and a combined Attachment,
Priority, Energy and Estimated time query, retaining panel and result captures.
For a focused run, set `TODO_ELECTRON_VERIFY_HOST=1`,
`TODO_ELECTRON_VERIFY_METADATA_ONLY=1` and `TODO_ELECTRON_VERIFY_FILTERS_ONLY=1`
on the existing helper. Full host verification includes the same filter drive.

Profile, Project and Tag discovery with counts. Today, Overdue, Scheduled and Inbox.
Every planning navigation row has the count returned by its server view. Selection
uses the shared accent role, with a distinct icon for each view and a folder for Projects.
Quick-add metadata from the server parser. Cmd+Enter adds and opens the editor.

## How to get to it (user POV)

Use the Profile switcher and Planning views. Select a Project in the sidebar.
Quick add accepts tomorrow, p1, #tag and @Project tokens. The editor offers real
Project and Tag definitions from the selected Profile.

## Driving it with Playwright Electron

Select a Profile option and click each named planning view. Require the literal
server section names and seeded titles. Quick-add using existing metadata, inspect
its chips, submit and compare the editor and durable Task. Switch to personal
and require work Tasks to disappear. Compare discovery counts with CLI writes.
Hold a quick-add creation response. Its input and metadata chips must stay disabled
until that reply completes so a successful submission cannot erase newer input.
Profile choices show display names without counts. Quick add repeats only the display name.

## Gotchas

Membership and parsing come only from HttpApi. New Project and Tag names resolve
when the Task is saved. Quoted names such as `@"Client Project"` and
`#"deep focus"` use the shared parser.
