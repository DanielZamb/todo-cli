# Live changes and native reminders

## Sub-features

CLI-to-SSE updates, saved per-Profile cursors, recovery after drops, read-only
offline behavior and native ReminderFired notifications.

## How to get to it (user POV)

Keep Todo open while the CLI writes. Set an instant due time for a reminder.
A disconnected server shows Offline (read only) and preserves Tasks and drafts.

## Driving it with Playwright Electron

Create with the compiled CLI and require its title without Refresh. Stop the
owned server, create another CLI Task, restart the same scratch server port and
require Last-Event-ID recovery. Inspect `stream-requests.json` for the cursor
sent on the real reconnect.
PATCH due_at to an instant through public HTTP,
read the committed ReminderFired seq from SQLite and match it to the actual
Electron Notification show event. Restart and require no duplicate for that seq.

## Gotchas

Date-only due values never fire. Native delivery needs a signed app and macOS
permission. A renderer toast, mock or .show invocation count is not proof.
Retain receipts after scratch cleanup.
