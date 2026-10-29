# Screen and state matrix

Status: D01 handoff v2, coordinator round 2. Branch: `clients/d01-electron-design`.

All fixtures use October 26, 2026 in America/Bogota, Profile Work, base Version 7 and latest Version 8. Work has 16 distinct open tasks. Today contains 12 tasks, with four each in Overdue, Due today and Scheduled today. Website contains 13 tasks and Personal site contains 3. Task membership is fixture data, not a second domain query.

| Screen | Ready | Empty | Loading | Error | Conflict | Offline |
|---|---|---|---|---|---|---|
| Quick add | One input, current Profile once, removable scheduled, P1, tag and Project chips. Enter adds; Cmd+Enter adds and edits. | Blank input, no chips, Add task disabled. | Preserve input and chips, disable Add task, show spinner. | Keep input and chips; Retry. | Create has no stale task Version. Refresh changed Project choices and keep draft. | Keep input and chips. Add task stays disabled until reconnect. |
| Today | 12 tasks in Overdue, Due today and Scheduled today, four per section. Rows are 42px. Due and scheduled matches appear once. | Nothing planned for today; Quick add. | Skeleton rows and Reconnecting. | Keep context; Could not load Today; Retry. | Keep all sections; affected task shows Review conflict. | Keep loaded sections. Offline (read only); Reconnect. Every write overlay remains disabled. |
| Overdue | Four open tasks due before October 26. | No overdue tasks; Open Today. | Skeleton rows and Reconnecting. | Could not load Overdue; Retry. | Keep rows; affected task shows Review conflict. | Loaded rows are read only; Reconnect. |
| Scheduled | Six tasks grouped by scheduled date, five on October 26 and one on October 27. Due metadata remains separate. | Nothing scheduled; Open Inbox. | Skeleton groups and Reconnecting. | Could not load Scheduled; Retry. | Keep groups; affected task shows Review conflict. | Loaded groups are read only; Reconnect. |
| Inbox | Three open tasks with neither due nor scheduled date. One demonstrates an optional description snippet. | Your Inbox is clear; Quick add. | Skeleton rows and Reconnecting. | Could not load Inbox; Retry. | Keep rows; affected task shows Review conflict. | Loaded tasks are read only; Reconnect. |
| Task editor | Title, Description with Markdown, Due, Scheduled, Priority, Project, Tags, Recurrence, Energy, Estimate. Transitions and Move to Profile are menu actions. | No task selected; choose a task. | Keep draft, disable fields and Save changes, show spinner. | Keep draft and inline error; Retry. | Keep draft; Review conflict opens overlapping fields. | Keep visible draft. Save changes, calendar triggers and transition menu disabled. |
| Conflict resolution | Equal full-width cards show Your change and Latest accepted, with differing words highlighted. Every overlap requires a choice. | No overlapping changes; merge Description and Project. | Keep choices; disable radios and Save resolution. | Keep choices; Retry. | A second stale write shows Version 9 and refreshed latest text. | Keep both values and choices; Save resolution stays disabled after a choice. |

## Interaction contract

- The menu-bar quick-add Popover focuses its task input. Space or blur recognizes fixture tokens. Tomorrow creates Due October 27; fri 10am creates Scheduled October 30, 10:00 AM. Priority, tag and Project tokens create separate removable chips. Unknown text remains in the title.
- Enter submits a nonempty title. Cmd+Enter submits and opens the editor with that title. The input and chips clear only after fixture acceptance. Escape closes the overlay and returns focus. Cross-restart persistence remains E01 work.
- The default task is P1. Priority is present in rows, quick add and the editor. P1 and P2 pair text with status color. P3 and P4 stay quiet.
- Today follows daily Review grouping from SPEC 12.4. A task with both a due date today and a scheduled time today appears in Due today once. The shared domain computes real membership in E01.
- The Profile switcher changes the shell title, counts, Project names and task content. The Personal reference is empty and never displays Work tasks.
- Live SSE needs no connection footer. Reconnecting and Offline (read only) are the only connection statuses. A failed write never displays acceptance. There is no offline queue.
- Due and Scheduled each open a Calendar Popover. Dates use English month names. Add time reveals a 12-hour field and IANA time zone. The typical editor fits within a 927px-high window.
- Cancel task and Reopen task are menu actions. Move to Profile is a menu action. Status and Profile are not editor fields.
- Your change is Prepare launch notes. Latest accepted is Prepare release notes. A second conflict uses Prepare final release notes. Radio choices begin unselected. Save requires a choice and uses the latest Version. The accepted result displays the chosen title.
- Keyboard focus follows the Dialog or Sheet and returns to its trigger on Escape. Acceptance and errors use live announcements.
- This artifact has no server, credentials or database. E01 owns real client integration and its verification skill.
