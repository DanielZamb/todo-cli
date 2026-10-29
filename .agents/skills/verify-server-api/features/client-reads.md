# Client reads and quick-add

## Sub-features

List authorized Profiles with open and Inbox counts. List Profile Projects and
Tags with open Task counts. Read Today groups, Overdue, Scheduled and Inbox.
Read committed and rejected History for one Task, including redacted entries after Purge. Parse quick-add drafts.

## How to get to it (user POV)

Use GET `/profiles`, `/profiles/work/projects`, `/profiles/work/tags`,
`/profiles/work/views/today`, `/profiles/work/views/overdue`,
`/profiles/work/views/scheduled`, `/profiles/work/views/inbox`, and
`/profiles/work/tasks/inbox/history` with a Session or Access Token.
POST `/profiles/work/quick-add/parse` with text, now and time_zone.

## Driving it with curl

Run `scripts/verify-reads.sh <absolute-new-evidence-directory>` from the skill.
The compiled provisioning driver creates eleven Tasks in two Profiles. The
HTTP drive requires six open work Tasks and two Inbox Tasks, including an
Inbox Task with a Project. The work Project count is three and Tag count two.
A read-only work Token sees only work; a Session sees both Profiles.

At `now=2026-10-27T14:00:00Z`, Today contains the literal Overdue, Due today and
Scheduled today fixtures. Scheduled contains all three Tasks with a scheduled
value. Inbox contains only open, undeleted Tasks with neither due nor scheduled
value. Done, cancelled, snoozed, deleted and foreign Tasks stay out of counts.

The drive edits a Task, submits a stale edit and foreign metadata, then checks
ordered committed/rejected History. Rejected Project fields must be null and
Tag definitions empty, with no foreign names. Parser calls return a literal,
repeatable draft and leave the durable Task count unchanged at eleven.

## Gotchas

View day boundaries match the CLI's UTC date comparisons. The optional `now`
query makes view requests reproducible; omitted now uses Effect Clock. A Task
can occur in more than one Today group. Scheduled includes past and future
scheduled Tasks. Inbox uses the binding CONTEXT rule through `isInboxTask`.
History remains available after Delete or Purge. Unknown or foreign Task IDs
return an empty History. A Token cannot query a forbidden Profile.

The drive creates a private Task over HTTP, records a conflict, Deletes it, and
Purges it with the compiled domain driver. `purge-history.json` must retain four
`TaskHistoryRedacted` entries with original operation kinds and Versions while
omitting accepted and rejected private strings. HTTP Revert returns 422 with
`task_purged`, show returns 404, and foreign Profile History stays empty.
