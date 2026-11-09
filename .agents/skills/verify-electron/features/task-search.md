# Task search and id prefix

Run the production renderer, task-client, IPC decoder and sandboxed preload in
an unsigned host against fresh compiled scratch CLI/server data:

```sh
bun .agents/skills/verify-cli/scripts/cache-binaries.ts
bun -e 'const p = await Bun.file(".scratch/bin/build.json").json(); const child = Bun.spawn(["sh", ".agents/skills/verify-electron/scripts/verify.sh", `${process.cwd()}/docs/evidence/task-search/electron-new`], {env: {...process.env, TODO_ELECTRON_VERIFY_HOST:"1", TODO_ELECTRON_VERIFY_BACKGROUND:"1", TODO_VERIFY_TASK_SEARCH:"1", TODO_CLI_BINARY:p.cli, TODO_SERVER_BINARY:p.server, TODO_SEED_BINARY:p.seed}, stdout:"inherit", stderr:"inherit"}); process.exit(await child.exited);'
```

Choose a fresh absolute evidence directory. The shell helper owns the disk guard
and shared `/tmp/todo-search-electron.lock`; never wrap it in another lock.
The binary cache records its source hash and commit in `.scratch/bin/build.json`.
Each drive provisions its own HOME, SQLite and Attachment root. Read the real
process exit and `result.json`. The server readiness allowance is 60 seconds.

Background verification leaves the host BrowserWindow unshown, isolating its
renderer from desktop keystrokes. The drive still checks document focus, actual
BrowserWindow content size, production IPC and rendered captures. It records
visible/focused flags for every owned window. This proves no native activation
or signed-app focus behavior. Use this option when other work uses the desktop.

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
Description-only matches have one line in `.search-excerpt`, with context around
the first supplied span. Cropping starts at a word boundary and prefixes a
leading ellipsis; CSS adds the trailing ellipsis. Original spans are shifted
only for this presentation slice. There is no client query matcher or normalization.

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

The id sits below the title in secondary monospace, with an icon-only Copy
button and visible feedback. Active text omits empty groups. Highlights use the
shared search-highlight light/dark token, checked against literal sRGB colors.
An empty applied query reports "Couldn't search. Showing tasks without search."
While disconnected, search keeps its message and offers only footer Reconnect.
The offline recovery-action capture uses a current-Profile connection notice
fixture; real stream-close and operation recovery remain separate checks.

## Coverage and evidence

`apps/electron/scripts/verify-task-search.ts` drives Compact 393 × 426 FIRST,
then full, in light/dark. It captures ready, typing, Requesting, description,
empty, error, Filters prefix, detail Copied, detail failure and Quick add search. `task-search.json`
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
Compact it focuses the shared field above detail without closing the editor.
Quick add keeps the same active field in the shell header above the scrim,
separate from the New task card, with one `compact-search` control mounted at a
time. The standard dialog is nonmodal so the header remains focusable; outside
press and close behavior remain, and header search focus does not dismiss it.
New task initially focuses Task title.
Cmd+F and Esc preserve both editor and Quick add drafts. The drive requires the
search control visible before each capture and checks focus and literal drafts
in detail and Quick add in both layouts and appearances. Zero-size search
controls cannot pass by being filtered out of the bounds receipt.
The drive requires search outside the New task card, above its bounds, and
reachable by hit testing through the scrim. Search failure uses neutral inline
status styling, with retained rows and the existing recovery actions.

## Query refresh request counts

`measure-refresh.ts` drives the same production unsigned background host against
compiled scratch HTTP. Pass `electron`, an absolute compiled dist directory,
and a fresh absolute evidence directory. The transparent recorder stores all
route lifetimes, statuses, cancellations, startup traffic, per-interval load,
artifact hashes and the binary provenance in `measurement.json`.

Each run warms every planning view in Compact, then checks typed text, filter
Apply, Clear filters, Clear text, an explicit failed query and Retry. Literal
rows, whole-word spans and complete applied/requested identities must agree.
Set `TODO_REFRESH_EXPECT_MINIMAL=1` for the candidate's one data read in All tasks
or two in planning. Health reads remain separate. Set `TODO_REFRESH_DELAY_MS=200`
only for the labelled delayed-proxy concurrency proof. It is not a real-server
timing run. Compile before acquiring `/tmp/todo-perf-measure.lock`, alternate
five frozen baseline/candidate inputs under that same slot, and record the real
process exits. No build lock may be acquired inside the measurement slot.

The full search drive drains initial SSE replay, then holds full-refresh
successes and errors after a scratch write and issues a newer query. That query
must promote to full while `catalogOwedRef` is set and publish literal new names
and counts before the old response is released. Releasing the old response
cannot overwrite them. A failed current full refresh followed by a query must
also fetch the catalog. The flag clears only after guarded full publication.
Steady-state query counts remain1/2; write, SSE and reconnect full reads are
recorded separately. Existing races, offline Clear, filter rollback, drafts and
SSE recovery remain required.
