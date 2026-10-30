# Todo CLI v0.1 specification (historical)

This document describes the retired Go v0.1 CLI. It is a historical behavior
reference for the Effect port. The accepted decisions in
[docs/adr](docs/adr/README.md) take precedence wherever they disagree with this
specification. Current domain
terms are defined in [CONTEXT.md](CONTEXT.md). The CLI acceptance files live in
[apps/cli/test/golden](apps/cli/test/golden/).

## 1. Product Goals

1. Build a local-first CLI in Go for tracking tasks with minimal friction.
2. Prioritize agent interoperability and deterministic behavior.
3. Keep scope tight: CLI first, UI/API later.
4. Use a local SQLite database as the source of truth.
5. Default output to Markdown; provide JSON as an optional machine format.

## 2. Non-Goals (v1.1)

1. No direct Jira API integration.
2. No inbound Obsidian import/sync.
3. No Telegram OTP or external auth providers.
4. No multi-device sync service.

## 3. Core Principles

1. Stable immutable IDs for tasks and users.
2. Optimistic concurrency control (OCC) on writes.
3. Explicit user scoping for all task operations.
4. machine-readable by default (md), human-readable on demand.
5. Validation loop is mandatory: each feature ships with tests, and tests are run immediately.

## 4. Terminology

1. `entity_version`: logical schema/version of the task entity format.
2. `row_version`: per-record integer used for OCC conflict detection.
3. `expected_row_version`: client-provided version that must match for write success.
4. `session`: authenticated context bound to one user with TTL.

## 5. CLI Surface

Binary name: `todo`

### 5.1 Global Flags

1. `--format md|json|table` (default `md`)
2. `--db <path>` (default `~/.todo-cli/todo.db`)
3. `--no-color`
4. `--profile <name>` (optional named local profile)

### 5.2 Top-Level Commands

1. `todo help`
2. `todo man`
3. `todo man <command>`
4. `todo init`
5. `todo login`
6. `todo logout`
7. `todo whoami`
8. `todo add <title> [flags]`
9. `todo list [filters]`
10. `todo show <task-id>`
11. `todo edit <task-id> [flags]`
12. `todo done <task-id> [--expected-version N]`
13. `todo cancel <task-id> [--expected-version N]`
14. `todo reopen <task-id> [--expected-version N]`
15. `todo rm <task-id> [--expected-version N] [--force]`
16. `todo review daily`
17. `todo review weekly`
18. `todo export [options]`
19. `todo sync obsidian --vault <path> [--file <relative-path>]`

## 6. Help and Manual Requirements

### 6.1 `help`

1. `todo --help` and `todo <command> --help` must include:
   1. Purpose
   2. Usage
   3. Flags with defaults
   4. Exit codes
   5. Examples

### 6.2 `man`

1. `todo man` shows a full manual index.
2. `todo man <command>` shows deep reference for one command.
3. Each manual page must include:
   1. Synopsis
   2. Detailed behavior
   3. Flags
   4. Output format contracts (`md`, `json`, `table`)
   5. Concurrency semantics (`expected_row_version`, conflict behavior)
   6. Auth requirements
   7. Practical examples

## 7. Authentication and User Model

### 7.1 Auth Approach (v1.1)

1. Local username/password only.
2. Passwords stored as secure hash (Argon2id preferred; bcrypt acceptable).
3. Session token with TTL for authenticated command execution.

### 7.2 Auth Commands

1. `todo init`
   1. Creates DB and base schema.
   2. Optionally bootstraps first user.
2. `todo login --username <u>`
   1. Prompts for password.
   2. Creates/refreshes local session.
3. `todo logout`
   1. Revokes current session.
4. `todo whoami`
   1. Prints current authenticated user and session expiry.

## 8. Data Model

### 8.1 User

1. `id` (text UUIDv7/ULID, immutable)
2. `username` (unique)
3. `password_hash`
4. `status` (`active|disabled`)
5. `created_at`
6. `updated_at`

### 8.2 Session

1. `id` (text UUIDv7/ULID)
2. `user_id` (FK users.id)
3. `token_hash`
4. `expires_at`
5. `created_at`
6. `revoked_at` (nullable)

### 8.3 Task

1. `id` (text UUIDv7/ULID, immutable)
2. `user_id` (FK users.id, required)
3. `entity_version` (int, default 1)
4. `row_version` (int, default 1, increments on successful writes)
5. `title` (required)
6. `description` (markdown text, nullable)
7. `status` (`open|done|cancelled|snoozed`)
8. `project` (nullable)
9. `priority` (`P1|P2|P3|P4`, default `P3`)
10. `scheduled_at` (nullable)
11. `due_at` (nullable)
12. `recurrence` (nullable)
13. `energy` (nullable int 1..5)
14. `estimate_min` (nullable int >0)
15. `source` (`manual|agent|import`, default `manual`)
16. `created_at`
17. `updated_at`
18. `completed_at` (nullable)

### 8.4 Task Tag

1. `task_id` (FK tasks.id)
2. `tag`
3. unique `(task_id, tag)`

## 9. SQLite Schema Requirements

1. Tables: `users`, `sessions`, `tasks`, `task_tags`.
2. FK enforcement ON.
3. Indexes:
   1. `tasks(user_id, status)`
   2. `tasks(user_id, due_at)`
   3. `tasks(user_id, scheduled_at)`
   4. `tasks(user_id, project)`
   5. `task_tags(tag)`
   6. `sessions(user_id, expires_at)`

## 10. Optimistic Concurrency Control (OCC)

### 10.1 OCC Contract

1. Every mutable task operation accepts `--expected-version <row_version>`.
2. If omitted:
   1. Interactive mode may prompt.
   2. Non-interactive mode should fail with validation error.
3. Update/delete SQL must include compare-and-swap predicate:
   1. `WHERE id = ? AND user_id = ? AND row_version = ?`
4. On success:
   1. Mutate requested fields.
   2. Increment `row_version = row_version + 1`.
5. On mismatch (0 rows changed):
   1. Return conflict (exit code `4`).
   2. Return latest record payload in selected format for merge/retry.

### 10.2 OCC vs Pessimistic

1. No row locks held during read/edit cycles.
2. Conflicts are detected at write time, not prevented by lock.

## 11. Output Format Contracts

### 11.1 Markdown (`md`) Default

1. Deterministic section headers and task line structure.
2. `list` and `review` should group by operational intent:
   1. `# Today`
   2. `## Overdue`
   3. `## Scheduled`
   4. `## Inbox`
3. Task line canonical form:
   1. `- [ ] [P2] Title (id: <id>, v:<row_version>) #tag @project due:YYYY-MM-DD energy:3 est:25m`
4. `show` includes full metadata plus markdown description body.

### 11.2 JSON (`json`) Optional

1. Strict deterministic keys.
2. ISO8601 timestamps.
3. Include `entity_version` and `row_version` on task records.
4. Include envelope metadata (`generated_at`, `filters`) for list/review outputs.

### 11.3 Table (`table`) Optional

1. Compact human view for terminals.
2. Must still expose `row_version` column where relevant.

## 12. Command Behavior Details

### 12.1 `add`

Required:

1. `title`

Optional flags:

1. `--desc`
2. `--project`
3. `--tag` (repeatable)
4. `--priority`
5. `--scheduled`
6. `--due`
7. `--recurrence`
8. `--energy`
9. `--estimate`
10. `--source manual|agent|import`

### 12.2 `edit`

1. Must require `--expected-version` in non-interactive mode.
2. Patch-like behavior: only provided fields are updated.
3. Validates immutable fields are unchanged (`id`, `user_id`, `created_at`).

### 12.3 `done|cancel|reopen|rm`

1. Must require `--expected-version` in non-interactive mode.
2. On success, increment `row_version`.
3. `rm` is hard delete only with `--force`; otherwise reject.

### 12.4 `review daily`

1. Focuses on actionable `open` tasks for current day.
2. Includes overdue + due today + scheduled today.

### 12.5 `review weekly`

1. Includes overdue, next 7 days, and stale inbox items.
2. Highlights missing metadata (no project, no due/schedule).

### 12.6 `export`

1. `--scope today|weekly|project:<name>|id:<task-id>|all`
2. `--template default|jira-context`
3. `--output <file>` (stdout default)
4. Goal: provide high-quality context for agent workflows.

### 12.7 `sync obsidian`

1. One-way projection from DB state to markdown file.
2. No import behavior.
3. Default target file: `Todo/CLI Tasks.md` under vault.
4. Rewrites managed content block deterministically.

## 13. Error Model and Exit Codes

1. `0` success
2. `1` runtime failure
3. `2` validation/usage error
4. `3` not found/auth missing
5. `4` OCC conflict

Error payloads in `md|json|table` should remain parseable and include a short machine code (for agents).

## 14. Security Baseline

1. Password hash only; never store plaintext.
2. Session token stored hashed at rest.
3. Short default session TTL (for example 12h).
4. DB file permissions restricted to current user.

## 15. Validation Loop (Mandatory Process Rule)

For every feature or bug fix:

1. Implement feature.
2. Add/update tests for that feature.
3. Run tests immediately.
4. Verify outputs and edge cases.
5. Only then consider feature complete.

No feature is considered done without test execution evidence.

## 16. Testing Strategy

### 16.1 Test Types

1. Unit tests for domain rules and validation.
2. Store tests against SQLite in temp DB.
3. CLI integration tests for command behavior/output.
4. Golden tests for Markdown and JSON output determinism.

### 16.2 Required Coverage by Capability

1. Auth: login/logout/session expiry/whoami.
2. User scoping: user A cannot access user B tasks.
3. OCC:
   1. success when expected version matches
   2. conflict when stale version is sent
   3. latest row returned on conflict
4. Output formats:
   1. `md` default correctness
   2. `json` schema shape
   3. `table` basic integrity
5. Help/manual:
   1. `--help` includes all flags
   2. `man` includes concurrency and exit code sections
6. Obsidian projection:
   1. deterministic file content
   2. managed block rewrite behavior

## 17. Suggested Go Project Layout

1. `cmd/todo` (CLI bootstrap)
2. `internal/app` (command handlers/use-cases)
3. `internal/domain` (entities, validation, OCC policies)
4. `internal/store/sqlite` (queries, migrations, tx)
5. `internal/auth` (password + sessions)
6. `internal/render/md`
7. `internal/render/json`
8. `internal/render/table`
9. `internal/docs` (help/man page sources)
10. `internal/obsidian` (projection writer)
11. `test/integration` (CLI end-to-end)

## 18. Phased Delivery Plan

1. Phase 1: init + auth + users + base schema.
2. Phase 2: task CRUD + list/show + OCC.
3. Phase 3: review daily/weekly + md/json/table renderers.
4. Phase 4: help/man first-class docs.
5. Phase 5: export templates + obsidian projection.
6. Phase 6: hardening and expanded integration tests.

## 19. Open Questions

1. Default session TTL exact value (should be 24h).
2. Whether `rm` should become soft-delete instead of hard-delete (should be soft delete).
3. Whether `profile` should be part of v1.1 or delayed (delayed).
4. Exact recurrence syntax for v1.1 (simple text vs structured rule) (structured rule).

---

This document is intentionally strict on deterministic output, versioned writes, and test-first completion to support reliable agent orchestration.
