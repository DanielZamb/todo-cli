# The Catalog read (C10-S5), phase 2a report

2026-11-13, Claude Opus 5.5 (CATALOG-CONTRACT), on `feat/catalog-contract`.
Design and rulings: [catalog-contract-design.md](catalog-contract-design.md)
and the coordinator's answer of 2026-11-13. Phase 2a is domain, server, CLI and
contract only; neither app changes (2b is Electron, C10-S3 the Mac app).

**Contract id: 4c932cfc8b3dea7c53565e421b9f0c583c3b43e064d69b6034b76cfdde5cc0bc**
(after the seat's second delta: F8; 2a delivered 76f09fa6…, the corrections
7de9226a…, the first seat round a49a9627…, the second cae74594…, the first
delta dfade560…).
Product for every renewal: ec16d45d44146e061aa802bf3f9876cb3a5b03fa (2a
delivered f3039274, the corrections b110f4a8, the first seat round beae37bc,
the second de766e3c, the first delta 5da90607).

`operation_seq` became `operation_position` (`{generation, seq}`) in F8; the
earlier sections keep the name they had then.

## The line

| Commit | What |
| --- | --- |
| 84811b3b | `compareTasks` extracted (catalog-order.ts), with the undated placement in one setting |
| 1a1781bd | The Tag-name rule in tag-name.ts; every copy routed through it |
| 8c79738c | "Catalog" defined in CONTEXT.md |
| f6dbfcce | The Catalog read: position, counts, groups, `known`, `time_zone` |
| 5ca978b3 | `operation_seq` on writes (follow-up 42) |
| 3cd8f170 | `todo catalog` |
| 5407a0bb | One name order on `/profiles`, `/projects`, `/tags`, `todo profile list` |
| 397e2800 | verify-server-api drives the Catalog and `operation_seq` |
| f3039274 | architecture.md (the product) |
| 2732fbc3, 8f47dc56, 45b86ff9, ba392967 | Mapping candidates for f3039274: occ-atomicity, task-search-formal, task-search-cache, dag-formal |
| eb9e12bf | Correction 1: the `operation_seq` note is total and settles on the row's own bytes |
| 55035069 | Correction 2: `matching` reads the Dependency graph from columns and decodes after the lease |
| b110f4a8 | architecture.md and this report (the corrected product) |
| 7bed3ac5, 6c8a5c4f, aa559f2a, fdcb706e | Mapping candidates for b110f4a8: occ-atomicity, task-search-cache, dag-formal inputs and result |
| f74d1b3f, d1a121e3, 7b8d993e, beae37bc | Seat F2 (`operation_seq` never too low) and F1 (`known`'s stamp), reported |
| f9f07a1d, 35a2026c, 306864c3 | Mapping candidates for beae37bc |
| a7eec435, 21ca901a, e1f766a2 | Seat F6 (an honest Swift identity) and F5 (`todo catalog` flags refused before the store), reported |
| d3e6ab9d | Seat F3: the routed command's reply carries `operation_seq` |
| c19d62aa | Seat F4: a blank Project or Tag name filter is `invalid_args` |
| a9ab1930 | The seat's own schedules for F1 and F2 as tests |
| 86f4314c | Owner's Q8: undated Tasks last inside a priority |
| de766e3c | Owner's Q9: today from the sent zone, else the reader's own zone (the product) |
| 187d610e, 9f397332, b57ba61b | Mapping candidates for de766e3c: task-search formal and cache; dag-formal inputs and result |
| af12d6bc, 44ff839e, 7f08409e | Report, pin ledger and pin audit for de766e3c |
| 180f929d | Seat F2b: no `operation_seq` when a restore moved the generation during the request |
| c2958b75 | Seat F7: a blank Project name is matched exactly again; only a blank Tag name is refused |
| 5da90607 | A golden freezing undated-last (the product) |
| b79a9dc9 | The coordinator's source review of `OperationStore.record`, recorded |
| cee500f0, f4080def, ead12256 | Mapping candidates for 5da90607: task-search formal and cache; dag-formal inputs and result |
| d25b1d67, 106f22fa | Report and pin audit for 5da90607 |
| 8a646594 | Seat F8: `operation_position {generation, seq}` replaces `operation_seq`; the generation comes from the request's own classification |
| ec16d45d | The order goldens pinned in golden-baseline.json (the product) |
| the next commits | The atomic-commit record (statement review, correction), mapping candidates for ec16d45d, this report |

## What changed for a person to see

Nothing changes in either app yet: both still use the older reads.

- `todo catalog` is new: counts per view, Projects and Tags with counts, one view's Tasks.
- `todo profile list`, `GET /profiles`, `/projects` and `/tags` list names in one order: `9` before `10`, `a` before `á`, capitals beside lower case. Today `/projects` and `/tags` come in id order and `/profiles` in id order.
- A writing command's JSON and a write reply carry `operation_position` (`{generation, seq}`).
- `--tag work` now also finds a migrated Tag stored as `" Work"` (D3's one change).
- A blank Tag name filter (`?tag=`, `?tag=%20`, `todo list --tag " "`, `todo catalog --tag ""`) is refused as `invalid_args`. A Project name, blank or not, is compared exactly (F7).
- Undated Tasks come last inside a priority (Q8), in `todo list`, export and every read that orders Tasks.
- Today and Overdue follow a zone (Q9): the zone a read sends, else the server's own zone, and for the CLI the machine's zone. The installed apps send no zone, so on the owner's Mac they become right as soon as this server is installed.
- Once the apps use the Catalog (2b, C10-S3), the owner will see, as changes: Today counts a Task once; Electron's All badge counts open Tasks only; Projects and Tags in the name order above; Tasks inside each group in the one Task order (priority, then due date with undated last, then age).

## How each ruling was built

**D1, one Task order.** `taskOrder(placement)` and `compareTasks` in
catalog-order.ts; `readTasks` imports it. Proof by corpus: the old comparator is
kept verbatim as a fixture and agrees in sign on all 802,816 pairs of 896 Tasks
built from the real value shapes (priorities, dates, instants with and without
fractions, created_at forms, lowercase UUIDs and short test ids). One difference
remains outside real data: on a full tie, ids that differ in case or outside
ASCII now break by code units instead of locale. Export goldens and `todo list`
are byte-identical (CLI suite).

A third order exists and is untouched: `compareGraphTasks` (Dependency order
ties, graph-order.ts, under the Dependency mapping) already puts undated Tasks
last. If the owner answers Q8 "last", the two agree apart from its localeCompare.

**D2, one name order.** `compareNames`: root collation (`und`, accent-sensitive,
numeric), then name and id by code units. The literal 22-name test passes in the
domain under bun, and against the compiled CLI (`todo catalog` Projects) and the
compiled server (`GET /profiles/work/catalog`) on one scratch database. A
`numeric: false` mutant makes the compiled test fail.

**D3, one Tag-name rule.** tag-name.ts: `tagKey`, `tagNameParts`, `tagNames`,
`tagNameMatches`. The six old copies are kept verbatim as fixtures. Over 8,214
strings and 20,000 arrays built from every ECMAScript whitespace, U+0085,
U+180E, U+200B, commas, case mappings that change length and combining marks:
- metadata (create, edit, Move, Copy): same array, same order;
- the submitted-name check and the limit check: same parts and lengths;
- import: same parts, same order (it never sorted, and still does not);
- the legacy `filterTasks` query side: same key.
The only difference is the name filter on a stored name with edges, as named.
No copy that did not sort now sorts, so no recorded event changes.
Quick-add still lowercases `#word`; its draft reaches the writers' rule.

**D4 and D5.** As designed: distinct open Tasks per view; filters, search,
Project and Tag never change a count; every key combines by AND; each Task once
per view, first group wins.

**D6 and `known`.** `tasks=all|matching`. With `known_generation`, `known_seq`
and `known_day` (all three, or `invalid_args`), the reply is
`{ unchanged: true, position, day }` when the generation and the day match and
no operation committed after `known_seq`. It costs one indexed statement,
`EXISTS(SELECT 1 FROM op_log WHERE seq>? AND outcome='committed')`, inside the
lease. Both directions are proven:
- never unchanged after a change: 60 random steps (commits here and in another
  Profile, Conflicts, refused sign-ins), and whenever the reply is unchanged a
  full read equals the earlier one;
- unchanged when nothing changed, including after a rejected attempt;
- a commit in another Profile is "changed" (its count is in `profiles`);
- another day, another generation or a later seq is never unchanged;
- a mutant that skips the commit check fails both tests.
The same request parameters are the client's duty; the day is checked because
the views change at midnight without any operation. No delta is designed here;
this read leaves the Patch protocol (ADR-0022) open.

**Group names.** A closed set in the schema, in the form of the planning groups:
`P1`, `P2`, `P3`, `P4`, `Dependency order`, `Lightest first`, `Overdue`,
`Due today`, `Scheduled today`, `Scheduled`, `Inbox`.

**Search inside a view (for the seat).** Built as read: the matcher runs over
the view's candidates (view, Project id, Tag id), which is a further AND, so the
rows equal searching the Profile and then filtering. ADR-0014 says search runs
over a Profile's Tasks.

**D7, position.** `position {generation, seq}` comes from the Profile
classification `queryWithin` already runs (`auth.ts`: the `current` and
`restored` CTEs), carried into the bound read and read with `read.position`. No
other read gains a statement.

**`operation_seq`, every write.** A per-request cell in the fiber's context
(committed-operations.ts). The three places that insert a committed op_log row
(`OperationStore.record`, `Authentication.record`, the restore in snapshots.ts)
note its seq and the event text exactly as bound to the INSERT. Each computes
that text once and binds it unchanged. A preview (forked) store's connection is
marked in its constructor and never noted.

When the request ends, a note counts only if a committed row at that seq has
byte-identical event text. A false match needs the same bytes at the same seq,
which is the same operation. A failed lookup counts as unconfirmed.

**What the field means.**
- Present: everything this request committed is at or below this seq. A
  Catalog whose `position.seq` is at least that, in the same generation,
  reflects all of it.
- Absent: read to find out. It never means "nothing changed": a dry run, a
  refusal, and History written outside the request all leave it out.

The schema description and the CLI schema text say this.

**Source review corrections** (the coordinator's review of `OperationStore.record`):
- **The note is total.** `noteCommitted` does a `WeakSet.has`,
  `Fiber.getCurrent()` (returns the running fiber or undefined), a context read
  with an `undefined` default, and an array push. None of these throws on any
  input the three call sites pass. It is still wrapped in `try`/`catch`, so
  bookkeeping can only lose the note, never the commit.
  - Test: a collector whose `push` throws (a frozen array); the write still
    commits and its row is in History.
  - Mutant: removing the guard turns that test red.
- **Identity by the row's own bytes.**
  - Test with a fixed clock: request A appends, its transaction rolls back, and
    A itself succeeds. Meanwhile request B (its own fiber, the same actor, the
    same `occurred_at`) commits another Task and takes the same seq. A reports
    nothing.
  - A mutant settle rule on seq and `outcome` alone turns it red. The earlier
    actor-and-time rule would match B's row in exactly the same way.
- **Whose fiber.** `Fiber.getCurrent()` inside a synchronous store call is the
  request's own fiber on every server route and CLI command:
  - Each HTTP request runs in its own fiber, and its write handler is wrapped
    by `withOperationSeq`, which provides the cell to that fiber.
  - Store and auth calls run synchronously inside `Effect.try`/`Effect.sync` in
    that fiber, or inside `Effect.runSyncExitWith(context)` with the request's
    captured context (`withRead`, `mutate`). That context holds the same cell.
  - A synchronous call cannot yield, so no other fiber runs in between.
  - The CLI provides the cell around the whole command in `withStore`.
  - Where it is not the request's fiber, the note is dropped and the field is
    absent. This covers the sign-in passphrase queue (a promise callback), the
    scheduler's own fibers, the recordings worker (a separate file, not
    History) and the stream and hygiene fibers (reads).
  - Measured in a probe: in a timer, a microtask, and while another fiber runs,
    `Fiber.getCurrent()` is undefined, so a note is dropped rather than given to
    another request.
  - Test: a note from inside a promise callback is dropped.

| Write | Reply | Field |
| --- | --- | --- |
| create, edit, transition, delete, move, copy, revert | TaskWrite | highest committed (transition with a next Occurrence, delete with Dependencies, Move and Copy across two Profiles commit several) |
| createSeries, editSeries, skipOccurrence | TaskWrite | highest (Series, first Occurrence, initial Dependencies) |
| attach, detach, labelAttachment, uploadAttachment | TaskWrite | one operation |
| attachMany | AttachManyReport | highest across its Tasks |
| depend, undepend | EdgeReport | one operation |
| batchDepend | BatchEdgeReport | highest |
| batchEdit | BatchEditReport | highest |
| importTasks | ImportReport | highest (each Task atomic; the pre-change Snapshot is not History) |
| deleteProfile | ProfileDeletionReport | highest (Task Deletes and ProfileDeleted) |
| snapshots restore | SnapshotRestoreReport | DatabaseRestored's seq, in the new `generation` the report carries |
| issueToken | IssuedCredential | AuthChanged |
| local runCommand (`POST /local/commands`, the routed `add`) | BackendReply, success and failure | highest (the Task and any Project, Tag, Attachment or Dependency it creates); added for the seat's F3 |
| signIn | IssuedCredential | never carried: the session and its AuthChanged are issued in the passphrase queue, a promise callback outside the request's fiber |
| signOut, revokeToken | 204, no body | never carried: no body to carry it; their AuthChanged changes no Catalog |
| snapshots create, prune; local nudge, database proof; profiler ingest; quick-add parse | — | commit no History |

CLI: the JSON object of the 23 committing commands (add, edit, done, cancel,
reopen, rm, move, copy, revert, depend, undepend, batch-depend, attach, detach,
label-attachment, attach-many, batch-edit, import, profile delete, snapshot
restore, init, logout, reset-passphrase) gains `operation_seq` when it committed
History, and their published schemas say so (23 schema hashes in the flag
golden). Tested end to end: create, edit, Conflict, dry runs, a two-item import
(exactly two operations), issueToken, two requests interleaving, and compiled
`init`, `add`, `done`, `rm --dry-run`. Not exercised by a test: restore,
deleteProfile, batch edit, attachMany and the Series writes; they take the same
path.

**D8, not built.** Every Profile read lease is `BEGIN IMMEDIATE`. Measured below
(after correction 2), a full refresh today holds the write lock for 29.94 ms in
eight holds at 1,424 Tasks (4.37 ms at 178); one Catalog read holds it for
10.68 ms in one hold (1.81 ms), and a search refresh for 10.05 ms (1.68 ms). A
deferred lease would hold it for 0 ms: about 10 ms per refresh and per search
keystroke is what that unit can save, and what a writer waits behind today.

**`time_zone` and ADR-0006.** Today's UTC rule contradicts ADR-0006 twice:
- ADR-0006 keeps an instant with "the IANA time zone the user meant", but the
  views take an instant's day as its UTC date;
- a date has no time and no zone (it is the person's calendar date), but the
  views compare it with the UTC date of now.
The `due`/`scheduled` filters already use each Task's own zone.

Built for either answer to Q9, with no second contract change:
- the Catalog and the planning views take optional `time_zone`, an IANA name
  validated with the domain's `TimeZoneId` (unknown: `invalid_args`, exit 2);
- with it, today is the date of now in that zone, and an instant's day is its
  date in its own stored zone;
- without it, the rule is today's.
Literal tests:
- Bogotá at 18:59 and 19:01 (UTC-5): without a zone, `today, overdue` go from
  `2, 1` to `3, 2` as the UTC day turns; with America/Bogota both stay `3, 1`
  on 2026-11-13;
- New York across 1 November (EDT to EST at 06:00 UTC): 01:59 EDT, 01:01 EST
  and 23:30 EST all answer 2026-11-01 with `3, 0`; without a zone the last is
  2026-11-02 with `3, 2`.

**Q3.** `/profiles` and `todo profile list` use D2. The Discovery directory
keeps its code-unit order (its ADR and mapping): a follow-up.

**The term.** CONTEXT.md had none for "the views and their counts". I proposed
**Catalog** (the word the code and architecture.md already used) in its own
commit, 8c79738c; the route, type and command follow it.

## Seat findings at 9634a6e0 (CATALOG-S1), fixed on top

The seat's numbering: F1 and F2 here, F6 and F5 in the next section, F3 and
F4 in the one after.

**F1. `known` answered "unchanged" after a Profile appeared without History**
(d1a121e3). Everything a reply holds that a committed operation does not write:
- the Profiles this credential sees: `todo init --profile` and
  `todo login --profile` create one through `ensureProfile` with no History row,
  and the set depends on the credential's scope;
- the schema version: a migration at start-up.

A restore already moves the generation, and `store.rebuild` has no production
caller. The reply now carries `stamp`, a SHA-256 of the visible Profiles (id,
name, created_at, updated_at) and `PRAGMA user_version`, read in the same
lease. "Unchanged" needs all four known values (`known_stamp` added) and the
stamp to match.

Tests:
- the seat's schedule in the domain: `ensureProfile` adds no History row, yet
  the same known position now answers changed and lists the new Profile; red
  without the stamp comparison;
- the same schedule through the compiled CLI (`todo login --profile Errands`);
- a Profile-scoped token gets a different stamp.

Contract a49a9627…; the flag golden gains `--known-stamp` (1,041 pairs).

**Follow-up 16 is not closed by this.** The Catalog now reports the new Profile
on the next read, but nothing prompts that read: a Profile created from the CLI
writes no History, so no stream operation reaches an open app. Closing it needs
a History row or a stream notice for Profile creation.

**F2. `operation_seq` could be too low** (f74d1b3f, the commit before). Each note
also carries the columns Purge never rewrites (actor, profile, `from_version`,
`to_version`, `occurred_at`; Purge rewrites only `event` and `entity_version`).
When the request ends, each note stands as one of:
- **committed**: a committed row at that seq with byte-identical event text;
- **rolled back**: no row at that seq, or a row whose kept columns differ (the
  seq was taken by another operation after the rollback);
- **unaccounted**: the same kept columns with other event bytes (a redaction,
  or a same-shaped reuse that cannot be told apart), or a failed lookup.

A seq is reported only when no note is unaccounted; otherwise nothing.

Tests:
- Purging the request's highest operation before it ends reports nothing,
  never the lower seq; red on 9634a6e0's rule.
- A rollback after a commit still reports the commit's seq; red if a rollback
  counted as unaccounted.
- The fixed-clock reuse case still reports nothing.

## Seat findings F6 and F5 (CATALOG-S1), fixed on top

**F6. The Swift contract identity lied** (a7eec435).
- `openapi.ts` used to write `ContractIdentity.swift` to the server's new id
  while the Mac's `openapi.json` and generated sources stayed older. A Mac app
  built from this line would pass the health check (`Transport.swift:24`,
  `TodoModel.swift:1367`). It would then fail to decode the reply of every
  write the server had already committed: `operation_seq` is a key its strict
  decoders do not know, on 25 write replies.
- The base's own bump of the constant (to dae320b0 on `integ/contract`) was
  harmless, as the seat found: the base added only the three `/local` routes,
  which the Mac never calls, and no reply field. My earlier report said the
  base carried the same trap; it did not.
- **The id the Mac sources implement, found rather than guessed.** The Mac
  `openapi.json` has exactly the content of `packages/api/openapi.json` at
  d304589f after `normalize-openapi.py`, and that document's contract id is
  55c6d138cc924128593b25ef0313d898a6725bd0c0d91e026d09ad24536f28c8. The base's
  and this line's documents differ from it. The constant is back at 55c6d138.
- **`packages/api/scripts/swift-contract.ts`** decides the state:
  - regenerated: the Mac document is the normalized server document and the
    constant names the server's contract;
  - not regenerated: the documents differ and the constant is honest. It says
    plainly "the Swift client is not regenerated for this contract" and
    requires `apps/macos/API/swift-client-pending.json` to name the pair and
    what stays red;
  - dishonest: the documents differ and the constant claims the server's
    contract. Refused.
- **Where it runs:**
  - the root check;
  - `make sign-desktop`, before `xcodebuild` (the install path), so no Mac app
    is built in the dishonest state;
  - with `--write` at the end of `generate-api.sh`, the only writer of the
    constant.

  `openapi.ts` no longer touches it.
- **This line is in the "not regenerated" state.** The Swift sources implement
  55c6d138; the server serves this line's contract.
- **Expected red until step 2**, named with reasons in
  `swift-client-pending.json`:
  - the Dependency mapping's identity property, which now accepts a differing
    identity only for that named pair;
  - verify-macos and the Mac gate cycle against this server: a Mac built here
    refuses it as outdated;
  - the Discovery Swift step, already owed.

  verify-install's drive now drives the new check (honest passes, dishonest
  refused) instead of `openapi.ts`'s Swift branch. Nothing is skipped silently.

**F5. `todo catalog --view tomorrow` threw** (21ca901a).
- The parser threw synchronously inside the handler, which made it a defect.
  Flags defaulting to `""` also could not tell an empty value from an absent
  one.
- Now every value flag is optional, and parsing is an Effect that fails with
  `invalid_args` (exit 2). It refuses an empty value (except `--text`, a
  documented blank search), anything the schema refuses, a bad `--known-seq`,
  an unknown zone and an incomplete known position. The last two use
  `catalogQueryError`, shared with the HTTP read.
- All of this happens before a store is opened, a credential read or a Profile
  created.
- The read's defects become `runtime_error`, as in `list`, and rendering runs
  inside `io`.
- The compiled-CLI test is red on the previous code:
  - every flag with a wrong, empty and dash value answers the envelope with
    exit 2, no stack trace and no Profile created;
  - dash values and repeated flags answer a reply or the envelope, never a
    defect.

## Seat findings F3 and F4, the seat's schedules, and the owner's Q8 and Q9

**F3. The routed command's reply had no `operation_seq`** (d3e6ab9d).
`runCommand` (`POST /local/commands`) runs `executeBackendCommand` inside
`withOperationSeq`; `BackendReply`'s success and failure branches carry the
optional field. It is in the write table above. Test (server, routing.test.ts):
a proved routed `add` replies with `operation_seq` equal to the database's
highest seq; a refused one (unknown Profile) has none and commits nothing. Red
without the wrap. Production routes nothing until ROUTING_PROTOCOL 2; the CLI
decodes the field and has no use for it yet.

**F4. A blank name filter matched a whitespace Tag** (c19d62aa). Decided: a
Project or Tag name made only of whitespace is not a filter value.
- One rule for both names: the value must contain a non-whitespace character
  (`/\S/u`, which is exactly "ECMAScript trim leaves something", the Tag rule's
  non-empty key). A test checks the two agree on `""`, spaces, tab and newline,
  U+3000, U+00A0 and U+FEFF.
- HTTP: `rejectUnknownQuery` answers 400 `invalid_args` for a blank `project`
  or `tag` on `/tasks` and `/catalog`, before the Profile is resolved (a blank
  filter on a missing Profile is still `invalid_args`, not `not_found`). The
  schema carries the same check, so `TaskFilters` refuses it anywhere it is
  decoded.
- CLI: `todo catalog` refuses empty and blank values (its flags are optional);
  `todo list --tag " "` is refused. `todo list --tag ""` stays what every empty
  `todo list` value flag has always been, the flag's default meaning absent; it
  cannot be told apart from an omitted flag. A test pins both.
- No shipped client sends a blank name: stored names are `NonEmptyString`, and
  Electron sends a Tag name only when it equals its own trim. A migrated
  Project whose whole name is whitespace can no longer be filtered by name (by
  `project_id` on the Catalog it still can).

**The seat's schedules, as tests** (a9ab1930):
- F1: "never answers unchanged after a change, over random histories" now also
  draws `ensureProfile` (a Profile created without History) and expects a
  changed reply after it. The draw uses the generator's high bits; the low bits
  of a power-of-two LCG never produced the new step kind. Red without the stamp
  comparison.
- F2: request R edits X then Y (two seqs); another request deletes and purges Y
  before R settles; R reports nothing, never X's seq. Red if an unaccounted
  note is skipped (it reports 5).

**Q8: undated Tasks last** (86f4314c). `undatedDuePlacement` is `"last"`.
- The tests for each setting stay: `taskOrder("first")` still equals the old
  `readTasks` comparator on all 802,816 pairs of real value shapes, and a
  literal list orders both ways; `compareTasks` is pinned to the "last" order.
- The Catalog's literal order changed, worked by hand: P1 `T1, T5` (T5
  undated), P2 `T6, T2, T7` (T7 undated).
- **Goldens: none changed.** There is no `todo list` golden. The three export
  goldens (`export_default_md`, `export_jira_md`, `export_default_json`) and
  the two review goldens are frozen Go bytes over three Tasks of three
  different priorities, so the undated placement cannot move them; all five
  pass byte for byte, unchanged. ADR-0009's dated line says so, instead of
  "renewed", because nothing needed renewing.

**Q9: today follows the reader's zone** (de766e3c).
- One rule in planning-day.ts: today is the date of `now` in the zone the read
  sends, else in the reader's own zone; an instant falls on its date in the
  zone stored with it; a date is a date. The earlier no-zone branch (both on
  their UTC date) is gone.
- **The server's own zone** is `processTimeZone()`:
  `Intl.DateTimeFormat().resolvedOptions().timeZone`, which is the `TZ`
  environment variable when set and the system zone otherwise; a value the
  runtime cannot name falls back to UTC. `apps/server/src/main.ts` reads it
  once at start (a change of the machine's zone applies at the next server
  start) and passes it to `serverLayer({ timeZone })`.
- **Pinned in tests.** `ClientReads` and `CatalogReads` take the zone as a
  constructor argument and `serverLayer`'s `timeZone` is required, so no test
  or driver can fall through to the machine's zone: every server test and
  driver names one (`"UTC"` where it relied on the old default). The CLI's
  vitest config sets `TZ=UTC` for every compiled CLI it spawns unless a test
  names another; the verify-server-api drive starts its server with `TZ=UTC`.
- **Both reads alike**: the Catalog and the planning views (`/views/today` and
  the others) use the same `planningDay`.
- **The CLI** reads the database directly and uses the machine's zone.
  Outputs that change: `todo catalog` (unless `--time-zone`), `todo list
  --today` and `--overdue`, `todo review daily` (Overdue and Scheduled),
  `todo review weekly`'s Overdue for date-only due dates (instants still
  compare with now), `todo export --scope today`, and `move`/`copy` when they
  select by `--today` or `--overdue`. `todo catalog --help` says "default:
  this machine's zone" (the flag golden's one help hash).
- Tests with literal counts (server, planning-zone.test.ts):
  - a server in America/Bogota, no zone sent: at 18:59 and 19:01 local the day
    stays 2026-11-13 (today 2, overdue 1; the Today view Overdue 1, Due today
    1); at 00:01 local it is 2026-11-14 (3, 2);
  - a client sending Asia/Tokyo to that server: 2026-11-14 (3, 2), while no
    zone gives 2026-11-13 (2, 1);
  - America/New_York across the end of daylight time: 23:59 EDT Oct 31, 00:01
    EDT Nov 1, 23:59 EST Nov 1, 00:01 EST Nov 2 give Oct 31 (1, 0), Nov 1 (2,
    1), Nov 1 (2, 1), Nov 2 (3, 2);
  - the date line, one instant: Pago Pago (the server) 2026-11-13 (2, 1), UTC
    2026-11-14 (3, 2), Kiritimati 2026-11-15 (4, 3);
  - an unknown zone (`Mars/Olympus`, `+05:00`) is `invalid_args` on the Catalog
    and the view;
  - `known`'s day check uses the read's day: 19:01 Bogota after an 18:59 read
    answers unchanged on 2026-11-13; Bogota's midnight and a Tokyo client
    answer changed on 2026-11-14;
  - `processTimeZone()` in a child process returns the `TZ` it was given.
  Four of the server tests are red with the absent case put back to UTC.
  Compiled CLI (machine-zone.test.ts), with Kiritimati and Pago Pago, whose
  dates always differ: `list --today`, `--overdue`, `export --scope today` and
  `review daily` follow `TZ`; `todo catalog --now 2026-11-14T00:01:00Z` gives
  2026-11-13 under America/Bogota, 2026-11-14 under UTC and with
  `--time-zone Asia/Tokyo`.
- Two older domain tests encoded the no-zone UTC instant rule; their new values
  were worked by hand and say why in a comment.
- ADR-0006 has the dated amendment, and architecture.md and verify-server-api's
  client-reads feature state the rule.

## Seat delta at 7f08409e (CATALOG-S1): F7, F2b, the order golden, the `due:` label

**F7. A blank Project name is a real name again** (c2958b75). The F4 fix
refused `?project=%20%20` and `todo list --project '  '`, but a Project named
`"  "` can be created and both apps send the selected Project's name verbatim.
The coordinator's ruling: the blank refusal stays for the Tag name filter
only; the Project name filter matches the stored name exactly, on `/tasks`, the
Catalog and the CLI. `TaskFilters.project` is a plain string again (its
description says "compared exactly, whitespace included"); `rejectUnknownQuery`
refuses only a blank `tag`. Tests: a Project named two spaces (beside one named
one space and one named Errands) is found by name on `/tasks`, the Catalog,
`todo list` and `todo catalog`, and nothing else is; red with 7f08409e's
server.ts and task-filters.ts. `todo catalog --project ""` stays refused (an
empty value, the catalog flag rule; no Project can be named ""). Whether a
blank Project name should be refused at create is not part of this unit.

**F2b. A restore during the request** (180f929d). The seat's schedule: R edits
X (seq 12); another request takes a Snapshot; R edits Z (13); another request
restores; DatabaseRestored takes 13 with other kept columns, so Z's note read as
rolled back and R reported 12. Now the request notes each database's generation
at its first note there (the newest committed DatabaseRestored's generation, the
same rule as the Profile classification); at the settle a moved or unreadable
generation means nothing is reported. Only committed-operations.ts changes; no
store, auth or snapshot body. Tests: the seat's schedule reports nothing (it
reported X's seq with the check removed); a request after a restore, inside one
generation, still reports its seq.

**Which generation the seq belongs to.** No write reply names a generation:
there is no generation header on any reply, and only a Snapshot restore's
report carries one (the new generation, in its body). The field's description
now says the seq belongs to the generation current from the request's first
commit to its reply, that a client holds the generation from its last Catalog
position or stream, and that a restore reaches the stream as `reload`. The 23
committing CLI schemas embed that description (flag golden).

**A golden for the owner's order** (5da90607). `apps/cli/test/golden-order/`
holds `list_json.golden` (`todo list --format json`) and
`export_default_md.golden` (`todo export`) over two P2 Tasks: "Dated Task"
(due 2030-01-15) and "Undated Task", which has the lower id. The dated one comes
first in both. Red with `undatedDuePlacement` set to `"first"`.

**The `due:` label, unchanged; what would change.** `taskLine` prints
`due:${due_at.slice(0, 10)}`: a date as is, an instant as its UTC date. Showing
an instant's date in the zone stored with it (the Today rule) would change only
instants whose stored zone puts them on another date than UTC, in every
Markdown output built on `taskLine`. Captured with the compiled CLI, a Task due
at 19:30 in Bogota on 2026-11-13 (stored `2026-11-14T00:30:00Z`,
`America/Bogota`):

| Output | Before (today) | After |
| --- | --- | --- |
| `todo list` | `- [ ] [P3] Evening call (id: f9983bfb…, v:1) due:2026-11-14` | `… due:2026-11-13` |
| `todo show` and every Markdown write reply (`add`, `edit`, `done`, …) | `- [ ] [P3] Evening call (id: f9983bfb…, v:1) due:2026-11-14` under `# Task` | `… due:2026-11-13` |
| `todo export` | `- [ ] [P3] Evening call (id: f9983bfb…, v:1) due:2026-11-14` | `… due:2026-11-13` |
| `todo export --template jira-context` | the same line under `## Tasks` | `… due:2026-11-13` |
| `todo review daily` | the same line under `## Overdue` or `## Scheduled` | `… due:2026-11-13` |
| `todo review weekly` | the same line in its groups | `… due:2026-11-13` |
| `todo catalog` (Markdown) | the same line under Due today at Bogota 20:00 | `… due:2026-11-13` |
| `todo sync obsidian` | the same line in the projection file | `… due:2026-11-13` |

- JSON, table output and the Catalog's JSON are unaffected: they carry
  `due_at` whole.
- Instants entered with CLI flags are stored in UTC, so their label cannot
  change; only instants from the apps, quick-add drafts or import with another
  zone can.
- **The frozen goldens:** four hold an instant, a-overdue
  `2000-01-01T09:00:00Z` stored in `UTC` (export_default_md, export_jira_md,
  review_daily, review_weekly). Its UTC date is its zone's date, so none of
  them would change. The new order golden holds only a date.
- The label would need the instant's stored zone, which TaskView drops (it
  keeps the UTC text): a small change to TaskView or to `taskLine`'s caller.
  `dateText` has the same rule and no caller.

**The coordinator's source review** of `OperationStore.record` (7f08409e,
byte-identical to the beae37bc candidate) is recorded in the atomic-commit
mapping's seatFindings record as coordinatorSourceReview, and in its SKILL.md
(b79a9dc9). The check still passes with no other change.

**Proof for the delta** (product 5da90607), all under the reference sandbox:
- Root check exit 0 at ead12256: domain 630, server 202, CLI 97, Electron 168
  (1 skipped).
- Controls made red, then restored: F2b's schedule without the generation
  check (reports X's seq); F7's two tests with 7f08409e's server.ts and
  task-filters.ts; the order golden with `undatedDuePlacement` at `"first"`.
- Verify skills, each exit 0: verify-server-api and its reads, verify-filters,
  verify-sse, verify-cli, verify-profiles, verify-task-search,
  verify-cli-routing (after its isolation controls), and verify-install
  (install-6, first try; the store path given on the command line as before,
  and run once the shared Swift lock was free).
- Mappings, each appended as a candidate:
  - verify-occ-atomicity: no mapped file changed; the check passes; the
    coordinator's source review is recorded.
  - verify-task-search-formal: the pre-renewal check passed every model run and
    stopped only at task-filters.ts; renewed, the one command passes.
  - verify-task-search-cache: before renewal check.mjs stopped only at
    task-filters.ts and check-hygiene.mjs only at server.ts; after renewal
    both pass, build-baseline `--uncached` passes and the full verify.mjs
    passes (verify-Qd7WS0).
  - verify-dag-formal: pinned at cee500f0 (the product plus the two sibling
    renewals); 80 of 80 anchors; full default exit 0, "CONFORMANCE CHECKPOINT
    PASS" (check-KzDYEU); 36 production controls (conformance-kzKfpm) and 53
    public mutants with 53 restores (public-4ifApl); clean recheck 19,784
    states.
  - verify-discovery-formal: TypeScript steps exit 0 (electron-HqZpbQ); the
    Swift step and renewal stay owed to step 2.
- **Pin audit** (`pin-audit.mjs HEAD` with the ledger, at d25b1d67):
  `filesScanned 488, occurrences 616, unknown 0`. One problem, the base's known
  drift (owed to step 2): `drift .agents/skills/verify-discovery-formal/coverage.json:69 apps/electron/src/task-client.ts file pin`.

## Seat delta at 106f22fa (CATALOG-S1): F8, the golden manifest, the generation statement

**F8. A write reply names its generation** (8a646594). The seat's schedule: a
client holds a Catalog at `{initial, 9}`; a restore happens; before the client
sees the reload it writes and gets `operation_seq` 5, because the request ran
wholly in the new generation; by the stated rule (the generation from its last
Catalog) the client took 5 ≤ 9 as covered and kept the old title.

- Every write reply that carried `operation_seq` now carries
  `operation_position: {generation, seq}`, the Catalog position's shape, and
  `operation_seq` is gone (nothing installed used it). The CLI's JSON likewise:
  the 23 committing commands, their published schemas (flag golden: 23 schema
  hashes) and the CLI module, now `operation-position.ts`.
- Present: everything this request committed is at or below `seq` in
  `generation`. Absent: read to find out. F2b's rule stays: nothing when the
  generation moved during the request or cannot be told.
- **The client rule**, once in the contract (the field's description) and once
  here: compare a write's position with a Catalog position or a stream id only
  when the generations are equal; when they differ, or the field is absent,
  read.
- Tests:
  - the seat's schedule over HTTP: the write's position names the restore's
    generation; its seq alone is at or below the old Catalog's (5 ≤ 9, the
    trap) but the rule says not covered; the later Catalog is in the write's
    generation, covers it and shows "client write". On 106f22fa the reply has
    no generation, so the test cannot pass there;
  - a write and a Catalog in one generation: covered;
  - the restore's own reply: its position names the generation its body
    reports (HTTP, domain and the compiled CLI);
  - after a restore, a request inside one generation reports the new
    generation;
  - the compiled CLI: `init`, `add`, `done`, `snapshot restore` and a later
    `add` carry the right position; `login`, `list` and a dry run carry none;
    exactly the 23 committing commands publish the field.

**Where the generation comes from, and what each read costs** (the
coordinator's question).

| Statement | Where it runs | Plan | 5,000 `profile IS NULL` rows | 50,000, no restore | 50,000, a restore far back |
| --- | --- | --- | --- | --- | --- |
| The generation read (`generationOf`, committed-operations.ts:129; the same text as auth.ts:97) | inside the write transaction, only on owner-only writes | `SEARCH op_log USING INDEX op_log_profile_seq (profile=?)`, newest first, to the first match | 0.55 ms | 9.7 ms | 9.6 ms |
| The settle's restore check (committed-operations.ts:187) | after the request, outside any transaction | `SEARCH op_log USING INDEX op_log_profile_seq (profile=? AND seq>?)` | 0.001 ms | 0.001 ms | 0.001 ms |
| The Profile classification (auth.ts:699, existing) | inside every Profile lease, under the write lock | the same restore lookup as a CTE | 0.57 ms | 9.6 ms | 9.7 ms |

Median of 41 runs after 5 warmups, synthetic History (authentication events and
refused attempts, a third refused), load 2.4 to 4.6;
`.scratch/gen-cost/measure.ts` builds it. With no restore the lookup visits
every `profile IS NULL` row; a restore far back does not help, since the walk
goes newest first.

- **What 8a646594 does instead of reading.** Every writing request with a
  Profile already classifies it inside its own write transaction
  (`credentialCheck` → `classifyProfile`, auth.ts:699), and that row carries
  the generation. `noteGeneration` (auth.ts:791) stores it in the request's
  cell, no SQL, and the latest classification before the first note counts.
  So the note at the first commit reads nothing. The restore notes the
  generation it starts (store/snapshots.ts:588).
- **Paths with no such value:** owner-only writes with no Profile
  classification. These are `setupOwner` (`todo init`), `resetPassphrase`,
  `issueToken`, `revokeToken` and `signOut` (`todo logout`), each committing
  AuthChanged. Their first note reads the generation once, inside their
  transaction (committed-operations.ts:102 → :129), at the cost in the table.
  Sign-in and expired-credential cleanup run outside any request's cell and
  note nothing.
- **The settle** no longer reads the generation. It asks whether a
  DatabaseRestored other than the request's own committed at or after the
  request's first noted seq. That is an index range scan over the rows written
  since the request began, after the request, outside any transaction. A
  restore whose DatabaseRestored lands below the first note took the seqs of
  every note (its Snapshot predates them all), so no note stands as committed
  and nothing is reported. A failed lookup counts as moved. Red without it:
  the F2b schedule reports 5.
- **A cost that predates this unit, for the coordinator.** The same restore
  lookup runs in every Profile classification and every read authority
  (auth.ts:97, :179, :220). That is about 9.6 ms each at 50,000
  `profile IS NULL` rows, under the write lock. Bounding it needs an indexed
  path to the newest restore (a partial index was not chosen by the planner
  without statistics) or a stored generation. That is a migration, not built
  here.

**The order goldens in the manifest** (ec16d45d). `golden-baseline.json` gains
a `repository` list. It pins each golden this repository introduced
(`apps/cli/test/golden-order/list_json.golden`, `export_default_md.golden`)
by sha256 and size, beside the five Go goldens pinned to their base blobs. The
order test checks it before comparing output, and verify-install's drive
checks it too. Shown red: with the placement flipped to "first" and the JSON
golden rewritten to match, the bytes agree and the test fails at the manifest.

**The coordinator's source review and the correction** are appended to the
atomic-commit mapping (seatDelta2: coordinatorStatementReview, noSqlCorrection,
statementNow with the exact lines).

**The lines to read before the seat does:**
- committed-operations.ts:102: the only call of the generation read inside a
  write transaction;
- committed-operations.ts:129: the read;
- committed-operations.ts:187: the settle's scan;
- auth.ts:791: `noteGeneration` after `classifyProfile`;
- store/snapshots.ts:588: the restore's note with its generation.

**Proof for this round** (product ec16d45d), all under the reference sandbox:
- Root check exit 0 at 002edb8a: domain 631, server 203, CLI 98, Electron 168
  (1 skipped).
- Controls made red, then restored:
  - the settle without the restore check (F2b's schedule reports 5);
  - the order golden with the placement flipped and the golden rewritten to
    match (red at the manifest).
- Verify skills, each exit 0: verify-server-api (its drive now checks the
  position's generation and the covered rule) and its reads, verify-filters,
  verify-sse, verify-cli, verify-profiles, verify-task-search,
  verify-cli-routing (after its isolation controls), and verify-install.
  - verify-install passed as install-12, which also checks the manifest's
    repository goldens.
  - install-10 and -11 timed out at the swift-slot step while another unit's
    Swift work held the shared lock. Nothing of theirs was touched.
- Mappings, each appended as a candidate:
  - verify-occ-atomicity: the pre-renewal check stopped only at
    attachments.ts (AttachManyReport); renewed, the check passes
    (fv01-check-q79Wfp) and sensitivity passes (sensitivity-KLHclt). The
    statement review and the correction are recorded.
  - verify-task-search-formal: stopped only at task-read.ts (TaskWrite);
    renewed, the one command passes.
  - verify-task-search-cache: stopped only at store/snapshots.ts and
    server.ts; renewed, check and hygiene pass, baseline `--uncached` passes
    and the full verify.mjs passes (verify-IZ25yY).
  - verify-dag-formal: pinned at 7131f133; 80 of 80 anchors; full default exit
    0, "CONFORMANCE CHECKPOINT PASS" (check-gVKQsx); 36 production controls
    (conformance-myvggM) and 53 public mutants with 53 restores
    (public-0DGg5w); clean recheck 19,784 states.
  - verify-discovery-formal: TypeScript steps exit 0 (electron-fTEZpE); the
    Swift step and renewal belong to the next unit.
- **Pin audit** (`pin-audit.mjs HEAD` with the ledger, at 10b78f9d):
  `filesScanned 488, occurrences 657, unknown 0`. The audit scans
  `.agents/skills` only, so golden-baseline.json is outside it; the order test
  and verify-install's drive check its rows. One problem, the base's known drift (the next
  unit's): `drift .agents/skills/verify-discovery-formal/coverage.json:69 apps/electron/src/task-client.ts file pin`.

## What the clients inherit

- **The zone.** Electron sends its zone with each planning and Catalog read
  when it adopts the read in 2b; the Mac app does in the catalog worker
  (C10-S3). Until then both get the server's own zone, which on the owner's Mac
  is the owner's zone.
- **Undated last** inside a priority, through the Catalog's group order.
- **Blank name filters.** A blank Tag name filter is refused; neither app sends
  one. A Project name, blank or not, is compared exactly (F7).
- **`operation_position {generation, seq}`** on every write reply, including
  the routed command's, and on the 23 committing CLI commands' JSON. **A client
  compares generations first**: a write is covered by a Catalog position (or a
  stream id) only when the generations are equal and its seq is at or below the
  position's; when they differ, or the field is absent, the client reads. The
  Swift regeneration (next unit) gets the field as an optional struct on every
  write reply and must apply that rule where it decides whether to refetch;
  Electron (2b) the same, through its HttpApi client and IPC `ClientTask`.
- **The `due:` label** in CLI Markdown stays the UTC date for instants until
  the owner decides.
- **The Swift client** must be regenerated with `generate-api.sh` (then
  `swift-contract.ts --write` runs) before a Mac app can talk to this server;
  until then `swift-client-pending.json` names the pair and what stays red.

## Proof

Each item below is "logic passes"; nothing here is "used for real".

**On the final product** (de766e3c; the head adds only mapping records and
this report), all under the reference sandbox after its five controls:
- Root check exit 0 at b57ba61b: domain 628, server 201, CLI 95, Electron 168
  (1 skipped); the Swift step prints the honest "not regenerated" state for
  55c6d138 against cae74594.
- Controls made red, then restored: the routed reply without the wrap; the
  random histories without the stamp comparison; the batch schedule with an
  unaccounted note skipped (reports 5); the absent zone put back to UTC (four
  server zone tests red).
- Verify skills, each exit 0: verify-server-api and its reads, verify-filters,
  verify-sse, verify-cli, verify-profiles, verify-task-search,
  verify-cli-routing (after its own isolation controls passed), and
  verify-install, whose drive passes the Swift identity's honest state and
  sees the dishonest one refused (install-5; see Deviations for its two
  earlier stops).
- **Formal mappings**, every renewal a candidate until a seat accepts it:
  - verify-occ-atomicity: none of its files changed; the check passes with no
    renewal.
  - verify-task-search-formal: the pre-renewal check passed every model run and
    stopped only at the mapping (task-filters.ts, commands.ts,
    presentation.ts); after renewal the one command passes (check-dX6xNd).
  - verify-task-search-cache: before renewal check.mjs stopped only at
    task-filters.ts and check-hygiene.mjs only at server.ts; after renewal both
    pass, build-baseline `--uncached` passes and the full verify.mjs passes
    (verify-7CjB25).
  - verify-dag-formal: pinned at 187d610e (the product plus the two sibling
    renewals); all 80 anchors match once; full default exit 0, "CONFORMANCE
    CHECKPOINT PASS" (check-DUcvUj); 36 production controls (conformance-kBGpMi)
    and 53 public mutants with 53 restores (public-7vSYRf); clean recheck 19,784
    states. The pending Swift pair joined the public capture scopes, so the
    identity property sees the named pair.
  - verify-discovery-formal: TypeScript steps only, `prepare-inputs.ts` and
    `check-electron.ts` exit 0 at b57ba61b (electron-WG2G96). The Swift step
    and its renewal stay owed to step 2.
- **Pin audit** (`pin-audit.mjs HEAD` with the ledger, at 44ff839e):
  `filesScanned 488, occurrences 595, unknown 0`. One problem, the same as on
  the base (owed to step 2): `drift .agents/skills/verify-discovery-formal/coverage.json:69 apps/electron/src/task-client.ts file pin`.
  The first run had 4 unknowns: the previous contract id (a49a9627…) quoted in
  the first seat round's DAG record text, compared while it was live. They are
  ledgered as historical (44ff839e); the audit's self-test passes.

The earlier rounds' proof follows.

- **Tests**, all under the reference sandbox after its five controls:
  - domain 618, server 193, CLI 89, Electron 168 (1 skipped);
  - the root check (`disk-guard`, then `lockf … pnpm check`, TMPDIR outside the
    repository) exits 0 on 5407a0bb;
  - mutants made red, then restored: `known` without the commit check,
    double-counted Today, a collation without `numeric`, no preview mark (the
    dry-run assertion).
- **Verify skills on the product line**, sandboxed, each exit 0:
  - verify-server-api: the drive now also covers the Catalog and `operation_seq`;
  - verify-server-api reads;
  - verify-filters;
  - verify-sse: 3,840 compositions delivered exactly durable History;
  - verify-cli;
  - verify-profiles;
  - verify-task-search.
  The first verify-server-api run failed on its own assertion that a create
  reply equals Show, now false by design; the drive was corrected (397e2800).
  The first verify-sse run failed because I passed a CLI outside the checkout;
  rerun with `apps/cli/dist/todo` as its recipe says.
- **On the corrected product** (b110f4a8), sandboxed:
  - root check exit 0 (domain 622, server 193, CLI 89, Electron 168 plus 1
    skipped);
  - verify-server-api and verify-cli exit 0 again;
  - new mutants made red, then restored: no guard on the note (the
    failing-collector test), a settle rule on seq alone (the reused-seq test),
    and `energy` dropped from the column graph (the equivalence test).
- **Formal mappings on the corrected product**, every renewal a candidate until
  a seat accepts it:
  - **verify-occ-atomicity**:
    - the coordinator reviewed the source: the constructor is accepted, and
      `record` is accepted on three conditions, now met;
    - the pre-renewal check stopped only at the mapping (fv01-check-dvHBJT);
    - the renewed check passed (fv01-check-qGPaQj);
    - sensitivity: both real-code breaks fail and the restored source passes
      (sensitivity-VCmWB1).
  - **verify-task-search-formal**: none of its files changed since its
    f3039274 renewal; the check passes on the product with no further renewal.
  - **verify-task-search-cache**:
    - check.mjs and check-hygiene.mjs ran their controls and stopped only at
      the mapping;
    - after renewal both pass, build-baseline `--uncached` passes, and the full
      `verify.mjs` passes (verify-838Kse).
  - **verify-dag-formal**:
    - pinned at 6c8a5c4f: product identical to b110f4a8, plus the two sibling
      renewals its capture runs;
    - all 80 mutant anchors match once;
    - a first full default stopped in public conformance: I had deleted the
      preserved baseline CLI from `.scratch/bin` while cleaning up. With it
      restored (digest dd1918fc…), the full default exits 0, "CONFORMANCE
      CHECKPOINT PASS" (check-lzAjVT);
    - 36 production controls broken 1 and restored 0 (conformance-L0LBad);
    - 53 public mutants exit 1 and restore 0 (public-7kBasA);
    - clean recheck: 19,784 distinct states.
  - **verify-discovery-formal**: TypeScript steps only; `prepare-inputs.ts` and
    `check-electron.ts` exit 0 on fdcb706e. Its Swift step and renewal stay
    owed to step 2.
- **2a's own runs** on f3039274 (superseded by the above): the occ, Task search
  formal and cache renewals, the dag-formal full default at 45b86ff9
  (check-A4oZvO), and all seven verify recipes exited 0.
- **Pin audit** (`pin-audit.mjs HEAD` with the ledger, at d0f14e12):
  `filesScanned 488, occurrences 516, unknown 0`. One problem, the same as on
  the base (owed to step 2): `drift .agents/skills/verify-discovery-formal/coverage.json:69 apps/electron/src/task-client.ts file pin`.

## Measurements

Fresh owner-shaped fixture built by
`.agents/skills/verify-server-api/scripts/catalog-measure.ts`:
- 1,897 to 1,900 bytes of payload per Task;
- 8 Projects, 17 Tags, a Dependency on every tenth Task, a quarter of the Tasks
  done.

Handler work in process. Median [min, max] of 15 alternating rounds after 3
warmups. The search cell is the Today view with the text "invoice".

**After correction 2** (product 55035069; one-minute load 3.88 at 178 Tasks and
4.19 at 1,424):

| ms | 178 Tasks | 1,424 Tasks |
| --- | --- | --- |
| Today's search refresh (list with text, and view) | 4.65 [3.70, 8.21] | 37.98 [35.37, 44.19] |
| Catalog `matching` with text | **2.35** [2.16, 2.94] | **18.94** [17.15, 23.88] |
| Write lock held: today's search / Catalog matching | 1.84 / **1.68** | 11.51 / **10.05** |
| Today's full refresh, 8 reads | 4.94 [3.88, 7.10] | 38.62 [35.63, 43.48] |
| Catalog `tasks=all` | 2.77 [2.30, 4.47] | 30.08 [27.11, 34.87] |
| Write lock held: today's full / Catalog all | 4.37 / 1.81 | 29.94 / 10.68 |

**Before correction 2** (f3039274; load 3.31 and 3.65 to 3.92):

| ms | 178 Tasks | 1,424 Tasks |
| --- | --- | --- |
| Catalog `matching` with text | 2.43 | 23.91 |
| Write lock held: Catalog matching | 1.93 | 15.19 |
| Catalog `tasks=all` | 2.25 | 26.78 |
| Write lock held: Catalog all | 1.92 | 14.16 |

What the tables show:
- A search refresh is now shorter than today's two reads in handler time and in
  write-lock hold, at both sizes.
- What remains in the lease at 1,424 Tasks (about 10 ms) is mostly the Profile,
  Project and Tag summaries and the column rows with their per-row date
  decoding, not Task decoding. Moving that decode after the lease is the next
  saving; I have not built it.
- The full refresh's handler time at 1,424 Tasks rose from 26.78 to 30.08 ms
  under more load (4.19 against 3.65); its lock hold fell from 14.16 to 10.68 ms.
- The requests per refresh fall from 8 or 9 (Mac) and 9 (Electron) to 1 once
  the apps move; that count is measured in 2b and C10-S3.

## Deviations and incidents

- The CLI suite ran once outside the sandbox profile (scratch HOMEs, temporary
  databases, before I wrapped it). Every later run of a compiled binary was
  sandboxed.
- The Dependency mapping's first full default stopped in its compile guard:
  `ps` cannot run in the sandbox. Rerun with the isolation note's wrapper: a
  read-only loopback proxy answering one fixed `ps -axo pid=,command=`,
  stopped afterwards.
- The OCC and formal checks need the preserved jar and baseline binary. Copied
  from the canonical checkout's `.storage-preserved/2026-11-13/dag-formal-inputs/`
  to the places its README names; digests checked.
- verify-install stopped twice for its environment, not the product: its
  scratch HOME hides pnpm's store from `pnpm licenses` (rerun with
  `npm_config_store_dir` set to the checkout's own store on the command line),
  and its swift-slot step times out after 10 s while another checkout's Swift
  build holds the shared lock (rerun when the lock was free; I touched no
  other process). The third run passed.
- Swift is not regenerated (step 2). Since F6, `ContractIdentity.swift` stays
  at the id its sources implement (55c6d138) and only `generate-api.sh` moves
  it.

## What I would check first

For the seat's delta (e1f766a2 to the head):
- `planningDay` and `processTimeZone` in planning-day.ts, and that every
  `ClientReads`/`CatalogReads` and `serverLayer` caller names its zone (the
  type system requires it).
- The CLI's `machineClock` in main.ts and the three flat views it feeds
  (`filterTasks`, `exportScope`, `renderReview`), especially `review weekly`'s
  date-only Overdue.
- The blank-name refusal in `rejectUnknownQuery` and `TaskFilters`, and the
  decision that `todo list --tag ""` stays absent.
- `runCommand`'s wrap in local-routes.ts.

From the earlier rounds:

1. The settle rule and its two tests in committed-operations.ts, and the three
   insert sites binding the event text they note.
2. `columnGraph` in catalog.ts: the graph functions read exactly id, status,
   energy, priority, due_at, created_at and deleted_at. The equivalence test
   against `GET /tasks` rows guards it; a new field read in the graph model
   would turn it red.
3. The decode rule for `matching`: exactly the returned Tasks; Ready and Blocked
   narrowed from columns first; search decodes the view's candidates; `order`
   decodes the whole graph.
