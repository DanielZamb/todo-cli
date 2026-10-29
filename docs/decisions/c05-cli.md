# CLI compatibility decisions

The CLI uses Effect 4's `effect/cli` module and `@effect/platform-bun` 4.0.6.
The separate `@effect/cli` package targets Effect 3 and cannot share this
repository's Effect 4 services. pnpm manages dependencies. Bun compiles and runs
the adapter.

`apps/cli` owns argument parsing, local configuration and Session files, stdin,
filesystem output, and exit codes. `@todo/domain/commands` owns Task creation,
patching, Version checks, Delete, Purge, filters, and export scope selection.
`@todo/domain/presentation` owns Task rendering, review grouping, export templates,
and managed Obsidian content. The adapter writes only through the public
domain auth/store APIs. Recurrence expansion uses the existing shared functions.

The JSON compatibility field `user_id` contains the Profile ID. For example,
the frozen Go fixture requires `"user_id": "u-golden"`; the corresponding domain
Task has `profile_id: "u-golden"`. This preserves all golden bytes without adding
a User entity or a second database writer.

ADR-0005 replaces usernames with one owner and Profiles. `--username` remains
accepted for command compatibility, while the owner passphrase authenticates
the Session. `--profile` selects actual domain Profiles. The auth package keeps
its fixed seven-day Session lifetime. Session files contain private credentials
and use mode `0600`.

Delete is recoverable. `rm` records TaskDeleted and hides the Task. `rm --force`
requires a deleted Task and records TaskPurged. Both require the expected Version.
Dates remain dates under ADR-0006, including date-only CLI inputs. `--recurrence`
accepts the domain Recurrence JSON with dtstart, rrule, and exdate. Editing can
set, replace, or clear that structured rule.

StartSeries accepts optional Project and Tag definitions so a CLI add can create
new metadata and the first Occurrence atomically. The auth wrapper forwards those
validated definitions without forwarding the bearer credential. Existing callers
still resolve omitted definitions from storage. Store validation checks all
definitions and references in the same transaction. This extends the command
boundary and leaves C03's recurrence fixes intact.

The golden test enumerates the frozen directory and drives every file through
the compiled binary. It reproduces the Go fixture through public domain events.
Only the Go test's timestamp normalization applies to JSON. All other integration
cases create Tasks through CLI commands. Review, export, and Obsidian sync shipped
within C05, so the ticket's timeboxed follow-up allowance was not used.

The branch incorporated track/core `09d554c327420700d28b5ecc10014fa9a9eaabd2`
with a clean fast-forward merge before final checks. C03's seven recurrence fixes
and C04's canonical database path permission fix are included. No real database
or backup was opened, inspected, migrated, or changed.
