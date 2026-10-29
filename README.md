# Todo

Todo tracks Tasks locally with an Effect TypeScript domain package shared by a
CLI and a local HTTP server. The CLI opens SQLite directly and works without the
server. Electron and macOS clients use the server's authenticated HttpApi and SSE.

## Build and install the CLI and server

Install [Bun](https://bun.sh/) 1.4.4 or newer, Node.js 22.12 or newer, and
pnpm 10.30.1. Bun runs TypeScript and compiles binaries. Use pnpm to manage packages.
From the checkout, run:

```sh
pnpm install --frozen-lockfile
./scripts/install.sh
```

The script builds `apps/cli/dist/todo` and `apps/server/dist/todo-server` and
installs both in `~/.local/bin`. It does not initialize a database, run migrations,
start a server, or install a LaunchAgent. Add the directory to your shell's PATH:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

To select another directory, run:

```sh
./scripts/install.sh --install-dir /absolute/path/to/bin
```

`make build` builds both binaries without installing. `make install` builds and
installs both. Override its destination with `make install INSTALL_DIR=/path/to/bin`.
The Go implementation and Go build targets are retired under ADR-0001 and ADR-0007.

## Use the CLI

The default database is `~/.todo-cli/todo.db`. `--db /absolute/path/to/todo.db`
selects another database. For a new database, configure the owner and sign in:

```sh
printf 'Owner passphrase: '
IFS= read -r -s todo_passphrase
printf '\n'
printf '%s\n' "$todo_passphrase" | todo init --password-stdin
unset todo_passphrase
todo login
todo add 'Pay rent' --priority P1 --due 2026-11-01
todo list
```

Copy a Task ID from the output. Writes require the latest Version, exposed as
`row_version`:

```sh
todo show TASK_ID
todo edit TASK_ID --title 'Pay rent and utilities' --expected-version 1
todo done TASK_ID --expected-version 2
```

A Profile separates one area of life, such as work or personal. Select it with
`--profile work`. `todo init --profile work` creates a Profile after owner setup.
Sign in for that Profile with `todo --profile work login`. The owner's Session
has a fixed seven-day lifetime. Agents can use scoped, revocable Access Tokens
issued through the server API.

```sh
todo --profile work list
todo review daily
todo review weekly
todo export --template jira-context
todo sync obsidian --vault /absolute/path/to/vault
todo --format json list
todo man edit
```

Output defaults to Markdown. `--format json` and `--format table` select other
formats. Validation exits with code 2, authentication and not-found errors with
code 3, and stale Version conflicts with code 4 plus the latest Task.
`rm` Deletes a Task. `rm --force` Purges a previously deleted Task. History records
accepted and rejected changes, and Revert records an opposite change.

## Run the local server

Provision the selected database with the CLI first. To run the server in the
foreground, set an explicit database path:

```sh
TODO_DB="$HOME/.todo-cli/todo.db" TODO_PORT=4310 todo-server
```

The server binds to `127.0.0.1`. `TODO_PORT` defaults to 4310.
`GET /health` returns `{"service":"todo-server"}`. The API contract is available at
`/openapi.json`. Task routes require a Session or Access Token as a Bearer credential.
See [packages/api/openapi.json](packages/api/openapi.json) for the contract.

On macOS, manage the launchd user agent with the compiled server:

```sh
TODO_DB="$HOME/.todo-cli/todo.db" TODO_PORT=4310 todo-server install
todo-server status
todo-server uninstall
```

Install requires an absolute `TODO_DB` and records the executable's path, so keep
the installed binary in place. Uninstall removes the agent and its plist while
retaining the database and logs. These lifecycle commands require macOS.

## Desktop clients

The [Electron client](apps/electron/README.md) offers planning views, quick add,
Task editing, History, conflict resolution, and reminders. Build it with
`pnpm --filter @todo/electron build`. `TODO_SERVER_URL` selects its local server
and defaults to `http://127.0.0.1:4310`.

Agents build Electron unsigned. For signed desktop apps, run `make sign-desktop`
in your own Terminal. First copy `signing.example.mk` to `signing.local.mk` and
set your Apple Development certificate identity and team. The local file is
ignored by Git. You can also export `TODO_SIGNING_TEAM` and
`TODO_SIGNING_IDENTITY`. The target rejects missing settings before building.
It audits package age and disk space first, then builds
`dist/signed.noindex/macos/Todo.app` and `dist/signed.noindex/electron/Todo.app`. It prints strict
signature checks, the team and designated requirement, and writes
`dist/signed.noindex/signing-receipt.json`. Use `make -n sign-desktop` to inspect commands.
Signing disables timestamps. Native verification reuses these artifacts and
still requires current consent.

The `.noindex` output folder keeps build copies out of Spotlight. The signing
target also unregisters those copies from LaunchServices. Run
`scripts/sign-and-install.sh` to build and install both apps in `/Applications`.

The [macOS 26 SwiftUI client](apps/macos/README.md) lives in
`apps/macos/Todo.xcodeproj`. It uses a generated Swift HttpApi client and stores
Sessions in Keychain. Settings installs and supervises its bundled server.

Native UI and Keychain verification remain on HOLD after repeated password
prompts. Signed Session restoration, native notification delivery, and macOS
Settings interaction still need current user consent and fresh proof. See
[the delivery status](docs/orchestration/REMAINING.md) for the remaining gates.

## Verify changes

```sh
pnpm check
.agents/skills/verify-install/scripts/verify.sh "$PWD/docs/evidence/r01/install-new"
```

`pnpm check` runs typechecking, lint, and workspace tests. The install recipe
builds and installs both binaries into a scratch HOME and a custom directory,
then runs [verify-cli](.agents/skills/verify-cli/SKILL.md) and
[verify-server-api](.agents/skills/verify-server-api/SKILL.md) on the installed
executables. Every database in these proofs is scratch data.

The five byte-preserved Go integration goldens now live in
[apps/cli/test/golden](apps/cli/test/golden/) and remain the CLI acceptance spec.
[SPEC.md](SPEC.md) describes historical Go v0.1 behavior. Accepted
[ADRs](docs/adr/) take precedence, and [CONTEXT.md](CONTEXT.md) defines domain terms.

## Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and verification commands,
[SECURITY.md](SECURITY.md) for vulnerability reporting, and [LICENSE](LICENSE)
for the MIT license. Workspace packages are private to prevent accidental npm
publication.
