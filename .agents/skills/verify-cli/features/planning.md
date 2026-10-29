# Review and golden output

## Sub-features

`todo list --inbox --project 'Client Launch' --tag revenue` intersects all
three filters. Project names match exactly; Tag names ignore case and surrounding
spaces. Without `--inbox`, matching completed Tasks remain visible. Due or
scheduled Tasks stay outside Inbox. JSON reports every active filter as a string
in `filters`, including `inbox: "true"`; empty results omit `tasks`.
The compiled CLI acceptance case checks Markdown, table, JSON, unknown names,
Deleted Tasks, metadata-free Tasks and isolation between Profiles.
Additional `list` flags are `--status closed`, `--priority`, `--due`,
`--scheduled`, `--attachment`, `--energy` and `--estimate`. All combine with
Project, Tag and Inbox. The dedicated [filter proof](../../verify-filters/SKILL.md)
checks exact matches, missing metadata, Attachment names/labels/paths/URLs and
time-zone date boundaries through both the compiled CLI and HTTP.

All five outputs equal the frozen files byte for byte after the original Go timestamp normalization. goldens.json records equal hashes and byte counts.

## How to get to it (user POV)

Run todo review daily, todo review weekly, or todo export with --format md, json or table.

## Driving it with the compiled CLI harness

Run the parent skill helper. The golden case seeds the frozen Go three-task fixture through the domain API, then invokes all five golden command combinations.

## Gotchas

The legacy JSON wire key user_id contains the Profile ID. No User entity exists. Golden fixture timestamps use the current instant so its Inbox task is not stale.
