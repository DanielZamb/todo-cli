package docs

var Manual = map[string]string{
	"index": `# todo man

Available manual pages:
- init
- login
- logout
- whoami
- add
- list
- show
- edit
- done
- cancel
- reopen
- rm
- review
- export
- sync

Use: todo man <command>

Global exit codes:
- 0 success
- 1 runtime failure
- 2 validation/usage
- 3 not found/auth missing
- 4 OCC conflict`,

	"init": `# todo man init

## Synopsis

todo init [--username] [--password]

## Detailed behavior

Creates schema and optional bootstrap user.

## Flags

- --username
- --password

## Output contracts

Prints initialization confirmation.

## Concurrency

Not applicable.

## Auth

Not required.

## Practical examples

- todo init
- todo init --username alice --password secret`,

	"login": `# todo man login

## Synopsis

todo login --username <name>

## Detailed behavior

Prompts for password and stores local profile session token.

## Flags

- --username

## Output contracts

Prints username and session expiry timestamp.

## Concurrency

Not applicable.

## Auth

Not required.

## Practical examples

- todo login --username alice`,

	"logout": `# todo man logout

## Synopsis

todo logout

## Detailed behavior

Revokes and removes local profile session token.

## Flags

None.

## Output contracts

Prints logout confirmation.

## Concurrency

Not applicable.

## Auth

Requires existing session to revoke; safe if missing.

## Practical examples

- todo logout`,

	"whoami": `# todo man whoami

## Synopsis

todo whoami

## Detailed behavior

Shows authenticated user and session expiry.

## Flags

None.

## Output contracts

Supports md/json/table via --format.

## Concurrency

Not applicable.

## Auth

Requires authenticated session.

## Practical examples

- todo whoami
- todo --format json whoami`,

	"add": `# todo man add

## Synopsis

todo add <title> [flags]

## Detailed behavior

Creates an open task for the authenticated user.

## Flags

- --desc
- --project
- --tag (repeatable)
- --priority P1|P2|P3|P4
- --scheduled RFC3339
- --due RFC3339
- --recurrence
- --energy 1..5
- --estimate minutes
- --source manual|agent|import

## Output contracts

Supports md/json/table via --format.

## Concurrency

Not applicable on create.

## Auth

Requires authenticated session.

## Practical examples

- todo add "Pay rent" --priority P1 --due 2026-02-20T10:00:00Z
- todo add "Refactor" --project work --tag backend --estimate 45`,

	"list": `# todo man list

## Synopsis

todo list [--status] [--project] [--tag] [--priority] [--today] [--overdue] [--inbox]

## Detailed behavior

Lists user-scoped tasks with deterministic ordering.

## Flags

- --status
- --project
- --tag
- --priority
- --today
- --overdue
- --inbox

## Output contracts

Supports md/json/table via --format.

## Concurrency

Not applicable on read.

## Auth

Requires authenticated session.

## Practical examples

- todo list --today
- todo --format json list --project work --priority P1`,

	"show": `# todo man show

## Synopsis

todo show <task-id>

## Detailed behavior

Shows complete task detail including version fields.

## Flags

None.

## Output contracts

Supports md/json/table via --format.

## Concurrency

Not applicable on read.

## Auth

Requires authenticated session.

## Practical examples

- todo show 01abc...`,

	"edit": `# todo man edit

## Synopsis

todo edit <task-id> [flags] --expected-version N

## Detailed behavior

Applies patch-like updates to only provided fields.

## Flags

- --title
- --desc
- --project
- --tag (repeatable)
- --priority
- --scheduled
- --due
- --recurrence
- --energy
- --estimate
- --source
- --expected-version

## Output contracts

Supports md/json/table via --format.

## Concurrency

- Uses optimistic concurrency control.
- Write succeeds only when row_version matches --expected-version.
- Conflict returns exit code 4 and latest record.

## Auth

Requires authenticated session.

## Practical examples

- todo edit <id> --title "New title" --expected-version 3
- todo edit <id> --due "" --project "" --expected-version 5`,

	"done": `# todo man done

## Synopsis

todo done <task-id> --expected-version N

## Detailed behavior

Marks task done and sets completed_at.

## Flags

- --expected-version

## Output contracts

Supports md/json/table via --format.

## Concurrency

Uses OCC and increments row_version on success.

## Auth

Requires authenticated session.

## Practical examples

- todo done <id> --expected-version 2`,

	"cancel": `# todo man cancel

## Synopsis

todo cancel <task-id> --expected-version N

## Detailed behavior

Marks task cancelled.

## Flags

- --expected-version

## Output contracts

Supports md/json/table via --format.

## Concurrency

Uses OCC and increments row_version on success.

## Auth

Requires authenticated session.

## Practical examples

- todo cancel <id> --expected-version 4`,

	"reopen": `# todo man reopen

## Synopsis

todo reopen <task-id> --expected-version N

## Detailed behavior

Moves task back to open status.

## Flags

- --expected-version

## Output contracts

Supports md/json/table via --format.

## Concurrency

Uses OCC and increments row_version on success.

## Auth

Requires authenticated session.

## Practical examples

- todo reopen <id> --expected-version 5`,

	"rm": `# todo man rm

## Synopsis

todo rm <task-id> --expected-version N --force

## Detailed behavior

Hard deletes task only when --force is present.

## Flags

- --expected-version
- --force

## Output contracts

Success prints deletion confirmation.

## Concurrency

Uses OCC and returns conflict on stale row_version.

## Auth

Requires authenticated session.

## Practical examples

- todo rm <id> --expected-version 7 --force`,

	"review": `# todo man review

## Synopsis

- todo review daily
- todo review weekly

## Detailed behavior

Daily shows overdue/scheduled/inbox.
Weekly shows overdue/scheduled/stale inbox/missing metadata.
Stale inbox rule: open tasks with no project and created more than 7 days ago.

## Flags

Use global --format.

## Output contracts

Supports md/json/table via --format.

## Concurrency

Not applicable on read.

## Auth

Requires authenticated session.

## Practical examples

- todo review daily
- todo review weekly`,

	"export": `# todo man export

## Synopsis

todo export [--scope today|weekly|project:<name>|id:<task-id>|all] [--template default|jira-context] [--output file]

## Detailed behavior

Exports user-scoped tasks for downstream processing.

## Flags

- --scope
- --template
- --output

## Output contracts

Supports md/json/table via --format.

## Concurrency

Not applicable on read.

## Auth

Requires authenticated session.

## Practical examples

- todo export --scope today
- todo export --scope project:work --template jira-context
- todo export --scope id:<task-id> --output task.md`,

	"sync": `# todo man sync

## Synopsis

todo sync obsidian --vault <path> [--file relative.md]

## Detailed behavior

Writes deterministic one-way Obsidian projection.

## Flags

- --vault
- --file

## Output contracts

Prints absolute output path on success.

## Concurrency

Not applicable on write projection.

## Auth

Requires authenticated session.

## Practical examples

- todo sync obsidian --vault /path/to/vault
- todo sync obsidian --vault /path/to/vault --file Todo/CLI Tasks.md`,
}
