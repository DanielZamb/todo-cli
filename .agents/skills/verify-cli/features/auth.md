# Owner Sessions and Profiles

## Sub-features

The second Profile lists no tasks and cannot show or edit the first task. whoami shows fixed expiry. logout makes list fail with exit 3. Wrong passphrases fail with exit 3.

## How to get to it (user POV)

Pipe the passphrase to `todo init --password-stdin`, then to `todo login --password-stdin`. `--password` remains supported. Use --profile personal to select a Profile.

## Driving it with the compiled CLI harness

Run the parent skill helper. The Profiles integration case signs in separately for default and personal. It attempts to show and edit the first Profile task from personal, then signs out default.

## Gotchas

The owner replaces legacy usernames. --username is accepted for command compatibility. Credentials live in private session files under scratch HOME.

The malformed-Session regression replaces only its scratch credential file with
invalid JSON, missing fields, a non-string token, and empty or whitespace tokens.
Every case returns exit 3 and the literal table error
`ERROR\tauth_required\trun todo login\n`. It leaves the Session file unchanged.

The stdin-init case signs in with the first line of a CRLF input, checks an empty
Task view, rejects empty input and conflicting password flags with exit 2, and
proves a rejected password did not replace the owner passphrase.

F10 adds `profile list` and `profile delete <name> [--with-tasks] [--dry-run]`.
The compiled behavior case checks JSON schemas, refusal with a visible Task
count, preview without writes, retained Task History, last Profile protection,
and same-name recreation with a new ID. JSON responses use encodeResponse and
the shared error envelope.
