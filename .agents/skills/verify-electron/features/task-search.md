# Task search and id prefix

Run the production renderer, task-client, IPC decoder and sandboxed preload in
an unsigned host against fresh compiled scratch CLI/server data:

```sh
bun .agents/skills/verify-cli/scripts/cache-binaries.ts
bun -e 'const p = await Bun.file(".scratch/bin/build.json").json(); const child = Bun.spawn(["sh", ".agents/skills/verify-electron/scripts/verify.sh", `${process.cwd()}/docs/evidence/task-search/electron-new`], {env: {...process.env, TODO_ELECTRON_VERIFY_HOST:"1", TODO_VERIFY_TASK_SEARCH:"1", TODO_CLI_BINARY:p.cli, TODO_SERVER_BINARY:p.server, TODO_SEED_BINARY:p.seed}, stdout:"inherit", stderr:"inherit"}); process.exit(await child.exited);'
```

Choose a fresh absolute evidence directory. The shell helper owns the disk guard
and shared `/tmp/todo-search-electron.lock`; never wrap it in another lock.
The binary cache records its source hash and commit in `.scratch/bin/build.json`.
Each drive provisions its own HOME, SQLite and Attachment root. Read the real
process exit and `result.json`. The server readiness allowance is 60 seconds.

The always-visible installed shadcn Input has label `Search tasks` and id
`compact-search`. Cmd+F focuses it, including from Compact detail. Esc clears it.
Typing invalidates outstanding requests immediately, then debounces for 250 ms.
Profile and view changes retain text and reset rows/selection. Project/Tag
selections and dialog filters combine with the typed text. The dialog's
`filter-prefix` input is labelled `Id starts with` and validates the shared
schema inline. Clear all changes only dialog draft fields; Cancel discards them.

`matching_tasks` carries full `TaskRead` values through IPC. Planning supplies
membership/order only; `searchGroups` joins ids to these same-response strings
and spans. `appliedSearch` holds the catalog and applied identity together.
`data-requested-identity`, `data-applied-identity`, `data-search-phase` and
`data-search-stale` on `.task-pane` expose production state to the drive.
Freshness is exactly identity inequality. `.search-results[data-stale=true]`
reduces row emphasis. It retains the applied highlights and description excerpt.
Description-only matches have one line in `.search-excerpt`, centered by the
first supplied span. There is no client query matcher or normalization.

A failed search retains text and applied results, announces the applied text
and offers Retry. No search retry timer exists. Current-Profile operation and
connection-ready notices issue the latest query. Connection notices carry a
Profile, and obsolete watch notices cannot affect the active query. The host
reconnects its real SSE stream after the proxy closes it; its reconnect timing
is a fixture setting, not a search retry timer. Production cursor persistence,
secure storage and native notifications remain outside this proof.

Clear filters with blank toolbar text restores the separately cached unfiltered
HTTP response with its own empty-filter identity, then refreshes it. This keeps
the existing offline clear behavior without joining filtered spans to cached
strings. With active text, clear retains the applied search snapshot until the
combined read succeeds. Failed dialog Apply restores previous dialog criteria.

`Task id` labels the selectable full monospace value in detail. `Copy task id`
uses the native clipboard IPC handler. Copied returns to Copy after two seconds.
Failure announces `Couldn't copy task id. Try again.` until retry, dismissal or
another Task detail. Copy never changes Task Version.

## Coverage and evidence

`apps/electron/scripts/verify-task-search.ts` drives Compact 393 × 426 FIRST,
then full, in light/dark. It captures ready, typing, Requesting, description,
empty, error, Filters prefix, detail Copied and detail failure. `task-search.json`
records literal titles, identities and DOM bounds. `actions.json` records real
HTTP payloads/statuses and compiled CLI exits. `binary-provenance.json` identifies
the compiled inputs. The trace and server log survive cleanup.

The drive checks accents, word prefixes, transposition, unordered AND, closed
and unclosed phrases, exclusions, original UTF-16 highlights, description-only
matches, mixed prefix/Priority/Energy/Estimate, Project/Tag, empty/Clear, Retry,
no automatic timed search retry, retained stale rows/spans, obsolete success and
error during debounce and after newer success, ABA, clear, Profile/view reset,
obsolete-Profile notices, same-query SSE races, delayed-error dialog preservation,
and automatic Error recovery on SSE reconnection AND a current-Profile op without
Retry. It reads the native clipboard after successful Copy and injects failure
only at that OS boundary. DOM checks constrain new controls to the viewport and
require the description highlight inside its one-line excerpt.

`test/task-search.test.tsx` checks IPC metadata, planning joins and original
UTF-16 rendering against literal values. The existing Filters drive remains the
regression proof for other criteria, Calendar bounds and offline clear/rollback.
The normal unsigned write drive also covers the Compact navigation and editing
recipes. The shell trap and driver finalizer stop only their owned host/server
and remove only their own scratch directory. Evidence stays ignored by Git.

Native HOLD remains in force. No installed Todo app, signing, safeStorage,
Keychain, owner data or real credentials enter these commands. This proof does
not establish VoiceOver behavior or signed production app startup.

Empty search hides the header Quick add in both layouts, leaving Clear search
as the single primary action. Cmd+F preserves the open full-window detail; in
Compact it returns to the Task view to focus the search field.
