# References

## Sub-features

Attach a path or HTTP/HTTPS URL, label a Jira draft, read missing-file status,
and preview detach without writing.

## How to get to it (user POV)

Use `todo attach TASK /absolute/draft.md --label jira`, then `todo show TASK`.
Use `todo detach TASK ATTACHMENT --dry-run --format json` before detaching.
Set a per-Attachment label with `todo label-attachment TASK ATTACHMENT --label jira`,
or omit `--label` to clear it.

## Driving it with the compiled CLI

Run the parent skill's helper. Read `actions.json` for a path with `exists: true`,
a missing path with `exists: false`, a link with `exists: null`, both published
schemas and a dry-run report whose removal was not persisted. The label command
sets and clears Jira on a Task with a Project and Tags. Its History retains
their definitions, and Revert restores the label while preserving metadata.

## Gotchas

Path attachments reference the existing file. The CLI does not copy it.
