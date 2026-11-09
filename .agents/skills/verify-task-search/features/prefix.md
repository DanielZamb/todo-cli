# Id prefix and filters

## Sub-features

Case-insensitive literal id prefix, validation, AND with legacy filters,
unchanged order, exact-id commands and response compatibility.

## How to get to it (user POV)

Run `todo list --prefix 6AA2 --text passport --format json`. HTTP uses `prefix`
and `text` on `/profiles/{profile}/tasks`. Full ids remain required elsewhere.

## Driving it with the compiled CLI and HTTP

Run the parent helper. It drives uppercase full-id prefixes, blank and invalid
prefixes, 36/37 limits and no-match success. Domain and CLI tests use a fixed
6aa2647d id for the literal 6AA2 case. The filter matrix combines text with
Project, Tag, Status, Priority, Due, Scheduled, Attachment, Energy and Estimate.
The drive compares filtered order to each interface's original order.

## Gotchas

Prefix is not trimmed and never tolerates typos. Prefix alone omits spans.
Show, edit, done, cancel, reopen, rm, history, attach, detach, move and copy keep
exact-id behavior. History of a nonexistent id is empty until rejected attempts
are recorded for that exact id. The matched full-id Task keeps its Version.
