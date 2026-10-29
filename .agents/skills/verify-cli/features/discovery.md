# Help, manual and configuration

## Sub-features

Help lists global and task flags. The manual explains optimistic concurrency. Config get returns the exact configured path. Invalid task arguments exit 2. Empty table output has its literal header.

## How to get to it (user POV)

Run todo --help, todo add --help, todo man edit, todo --help-human-flag and todo config set db.path <scratch-db>.

## Driving it with the compiled CLI harness

Run the parent skill helper. The help integration case checks documented flags and exit codes, reads the manual, configures a database and drives invalid task arguments.

The complete-help regression drives all 24 help paths from the Go acceptance
suite, including nested review, sync, and config commands. It requires purpose,
usage, flags, exit codes, and examples. It drives 17 top-level manual pages and
checks every required section. Bare `man` must list those pages. The export page
must document scope, template, output, and a project export example. Unknown
pages return exit 3.

## Gotchas

Database precedence is --db, TODO_DB, config db.path, then scratch HOME/.todo-cli/todo.db. Keep all verification paths inside scratch.
