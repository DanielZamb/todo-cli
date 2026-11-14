# The Catalog read (C10-S5), phase 2a report

2026-11-13, Claude Opus 5.5 (CATALOG-CONTRACT), on `feat/catalog-contract`.
Design and rulings: [catalog-contract-design.md](catalog-contract-design.md)
and the coordinator's answer of 2026-11-13. Phase 2a is domain, server, CLI and
contract only; neither app changes (2b is Electron, C10-S3 the Mac app).

**Contract id: 7de9226a29a1f76afbf1533417fb73787e56043beb64a958a50e80d9b50a0a8d**
(after the corrections; 2a delivered 76f09fa6…, and only `operation_seq`'s
description moved it). Product for every renewal:
b110f4a8b286a737b1dc46e9093a66110b3589d5 (2a delivered f3039274).

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

## What changed for a person to see

Nothing changes in either app yet: both still use the older reads.

- `todo catalog` is new: counts per view, Projects and Tags with counts, one view's Tasks.
- `todo profile list`, `GET /profiles`, `/projects` and `/tags` list names in one order: `9` before `10`, `a` before `á`, capitals beside lower case. Today `/projects` and `/tags` come in id order and `/profiles` in id order.
- A writing command's JSON and a write reply carry `operation_seq`.
- `--tag work` now also finds a migrated Tag stored as `" Work"` (D3's one change).
- Once the apps use the Catalog (2b, C10-S3), the owner will see, as changes: Today counts a Task once; Electron's All badge counts open Tasks only; Projects and Tags in the name order above; Tasks inside each group in the CLI's order (priority, then due date with undated first, then age). Undated first or last is the owner's Q8: one line, `undatedDuePlacement` in catalog-order.ts, with a test for each setting.

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
| signIn | IssuedCredential | never carried: the session and its AuthChanged are issued in the passphrase queue, a promise callback outside the request's fiber |
| signOut, revokeToken | 204, no body | never carried: no body to carry it; their AuthChanged changes no Catalog |
| snapshots create, prune; local commands, nudge, proof; profiler ingest; quick-add parse | — | commit no History |

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

## Proof

Each item below is "logic passes"; nothing here is "used for real".

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
- Swift is not regenerated (step 2); `ContractIdentity.swift` moves with the
  contract as the generator writes it.

## What I would check first

1. The settle rule and its two tests in committed-operations.ts, and the three
   insert sites binding the event text they note.
2. `columnGraph` in catalog.ts: the graph functions read exactly id, status,
   energy, priority, due_at, created_at and deleted_at. The equivalence test
   against `GET /tasks` rows guards it; a new field read in the graph model
   would turn it red.
3. The decode rule for `matching`: exactly the returned Tasks; Ready and Blocked
   narrowed from columns first; search decodes the view's candidates; `order`
   decodes the whole graph.
