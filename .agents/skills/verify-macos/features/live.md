# Live updates and reminders

## Sub-features

SSE updates, per-Profile Last-Event-ID recovery and committed ReminderFired native notifications.

## How to get to it (user POV)

Sign in and leave All tasks open. Settings holds notification permission and delivered-notification checks.

## Driving it with native CUA

Create through compiled CLI and require the title without refresh. PATCH due_at to an instant through HTTP and correlate History seq with the native delivered notification receipt. Schedule a due instant, stop the owned server before it, write while offline and restart after it. Require resumed delivery and inspect Resume cursor and Live sequence in Settings. A native reminder receipt proves delivery through the stream rather than only an HTTP list refresh.

## Gotchas

Date-only due values never fire. Only committed ReminderFired operations trigger UNUserNotificationCenter. Unknown Task-changing operations refresh the HTTP list. Move to Profile, Revert and Series remain disabled pending the parallel S05 completion.

W07 shows Allowed without an Enable button, and Not allowed with Open System
Settings. The Notifications tab reports Not tested yet, then a relative Last test
time and delivered or not delivered. The raw reminder sequence receipt remains
in Advanced > Diagnostics for the supervised sequence correlation. Permission
refresh reads the current OS status when the tab opens or the app becomes active.
The notification actions remain held until explicit native consent.
