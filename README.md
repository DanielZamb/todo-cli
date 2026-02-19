# todo-cli

Local-first Go CLI for task management with:
- SQLite storage
- user auth + sessions
- optimistic concurrency control (`row_version`)
- markdown-first output (`--format md|json|table`)

## Requirements

- Go 1.24+
- SQLite available on system

## Build

```bash
cd /Users/zambamon/Work/todo-cli
make build
```

Binary path:

```bash
/Users/zambamon/Work/todo-cli/bin/todo
```

Direct build command (without Makefile):

```bash
go build -o bin/todo ./cmd/todo
```

## Install (No Build Tools Needed)

From a prebuilt binary file:

```bash
chmod +x ./todo
./todo --help-human-flag
```

From this repo after local build:

```bash
make install-local
```

Install script (local binary mode):

```bash
./scripts/install.sh --from-local ./bin/todo
```

Install script (GitHub release mode):

```bash
# latest release from default repo
./scripts/install.sh

# specific tag/repo
VERSION=v0.1.0 REPO=zambamon/todo-cli ./scripts/install.sh
```

## Quick Start

```bash
# Optional (recommended): set DB once, then omit --db in daily use
./bin/todo config set db.path /tmp/todo.db

# 1) initialize DB + bootstrap first user
./bin/todo --db /tmp/todo.db init --username alice --password secret

# 2) login
printf 'secret\n' | ./bin/todo --db /tmp/todo.db login --username alice --password-stdin

# 3) create task
./bin/todo --db /tmp/todo.db add "Pay rent" --priority P1 --due 2026-02-20T10:00:00Z

# 4) list tasks
./bin/todo --db /tmp/todo.db list

# 5) show task (copy id from list output)
./bin/todo --db /tmp/todo.db show <task-id>

# 6) edit with OCC expected version
./bin/todo --db /tmp/todo.db edit <task-id> --title "Pay rent + utilities" --expected-version 1

# 7) complete task
./bin/todo --db /tmp/todo.db done <task-id> --expected-version 2
```

## Testing

Run full suite:

```bash
make test
```

Toggle Go cache mode:

```bash
# sandbox-safe mode (default)
make test USE_TMP_GOCACHE=1

# normal local mode (use system default Go cache)
make test USE_TMP_GOCACHE=0
```

Run integration only:

```bash
make test-integration
```

Run coverage summary:

```bash
make cover
```

Release smoke check:

```bash
make release-check
```

## Helpful Commands

```bash
./bin/todo --help
./bin/todo --help-human-flag
./bin/todo man
./bin/todo man edit
./bin/todo config show
./bin/todo config set db.path /tmp/todo.db
./bin/todo review daily
./bin/todo export --template jira-context
./bin/todo sync obsidian --vault /path/to/vault
```

## Notes

- OCC conflicts return exit code `4` and include latest record payload.
- Auth/not-found errors use exit code `3`.
- Validation errors use exit code `2`.
