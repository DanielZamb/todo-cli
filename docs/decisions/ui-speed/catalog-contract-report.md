# The Catalog read (C10-S5), phase 2a report

2026-11-13, Claude Opus 5.5 (CATALOG-CONTRACT), on `feat/catalog-contract`.
Design and rulings: [catalog-contract-design.md](catalog-contract-design.md)
and the coordinator's answer of 2026-11-13. Phase 2a is domain, server, CLI and
contract only; neither app changes (2b is Electron, C10-S3 the Mac app).

**New contract id: 76f09fa65d88bb4f8f37805f85311ed0c29c0e0256a7e3a49ba3949bf74ee9af.**
Product for every renewal: f30392745e53c524dffa9915814ec1ec208baea7.

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
| 2732fbc3, 8f47dc56, 45b86ff9, ba392967 | Mapping candidates: occ-atomicity, task-search-formal, task-search-cache, dag-formal |

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
note it: `OperationStore.record`, `Authentication.record` and the restore in
snapshots.ts. At the end, only rows still committed with the same actor and
`occurred_at` count. That drops a dry run's rolled-back insert and a seq taken
again afterwards; Purge keeps both fields. A preview (forked) store's
connection is marked and never noted. The value is the highest seq the request
committed, so everything it committed is at or below it, and a Catalog whose
`position.seq` is at least that, in the same generation, reflects all of it.
Absent when nothing committed.

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
| signIn | IssuedCredential | absent: the session is issued in the passphrase queue, outside the request |
| signOut, revokeToken | 204, no body | none; AuthChanged changes no Catalog |
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

**D8, not built.** Every Profile read lease is `BEGIN IMMEDIATE`. Measured below,
a full refresh today holds the write lock for 28.95 ms in eight holds at 1,424
Tasks (3.55 ms at 178); one Catalog read holds it for 14.16 ms in one hold
(1.92 ms). A deferred lease would hold it for 0 ms: those 14 ms per refresh and
15 ms per search keystroke are what that unit can save, and what a writer waits
behind today.

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
- **Formal mappings**, every renewal a candidate until a seat accepts it:
  - **verify-occ-atomicity**:
    - the pre-renewal check stopped only at the mapping;
    - the constructor statement trace and seed are equal to 9a372e86;
    - the renewed check passed (fv01-check-ZpFAlV);
    - sensitivity: both real-code breaks fail and the restored source passes
      (sensitivity-DJfLoV);
    - `OperationStore.record` and `OperationStore.constructor` changed: **your
      source review is required**.
  - **verify-task-search-formal**:
    - the pre-renewal check stopped at the mapping;
    - after renewal it passed: every broken variant reached its counterexample,
      and the restored model ran 378,091 states (check-1JvnDb).
  - **verify-task-search-cache**:
    - check.mjs passed its controls and stopped at task-filters.ts;
    - check-hygiene.mjs passed its controls and stopped at server.ts;
    - after renewal both pass, build-baseline `--uncached` passes, and the full
      `verify.mjs` passes (verify-gnRcYs).
  - **verify-dag-formal**:
    - inputs renewed in ba392967 after the review above; all 80 mutant anchors
      match once on the product;
    - pinned at 45b86ff9, whose product files are byte-identical to f3039274
      and which carries the three sibling renewals the candidate capture runs
      (pinned at f3039274, production conformance stopped at the occ mapping
      inside the capture);
    - full default exits 0, "CONFORMANCE CHECKPOINT PASS" (check-A4oZvO);
    - 36 production controls each broken 1 and restored 0 (conformance-QfjXiq);
    - 53 public mutants exit 1 and restore 0 (public-mZ3Vme);
    - clean recheck: 19,784 distinct states.
  - **verify-discovery-formal**: TypeScript steps only, as in step 1.
    `prepare-inputs.ts` (fresh domain, compiled CLI and HTTP discovery checks)
    and `check-electron.ts` both exit 0 on 6bf78a7f. No covered function
    changed here. Its Swift step and renewal stay owed to step 2.
- **Pin audit** (`pin-audit.mjs HEAD` with the ledger, at 6bf78a7f):
  `filesScanned 488, occurrences 482, unknown 0`. One problem, the same as on
  the base (owed to step 2): `drift .agents/skills/verify-discovery-formal/coverage.json:69 apps/electron/src/task-client.ts file pin`.

## Measurements

Fresh owner-shaped fixture built by
`.agents/skills/verify-server-api/scripts/catalog-measure.ts`:
- 1,897 to 1,900 bytes of payload per Task;
- 8 Projects, 17 Tags, a Dependency on every tenth Task, a quarter of the Tasks
  done.

Handler work in process. Median [min, max] of 15 alternating rounds after 3
warmups. One-minute load 3.31 at 178 Tasks and 3.65 to 3.92 at 1,424.

| ms | 178 Tasks | 1,424 Tasks |
| --- | --- | --- |
| Today's full refresh, 8 reads | 3.97 [3.51, 5.22] | 36.41 [34.13, 41.33] |
| Catalog `tasks=all` | 2.25 [2.09, 3.21] | 26.78 [25.37, 65.14] |
| Today's search refresh (list with text, and view) | 3.80 [3.29, 5.71] | 35.95 [32.78, 53.19] |
| Catalog `matching` with text | 2.43 [2.20, 3.91] | 23.91 [21.34, 27.91] |
| Write lock held: today's full / Catalog all | 3.55 / 1.92 | 28.95 / 14.16 |
| Write lock held: today's search / Catalog matching | 1.34 / 1.93 | 11.30 / 15.19 |

What the table shows:
- On a search refresh the Catalog holds the lock longer than today's two reads
  (15.19 against 11.30 ms at 1,424). With Dependencies in the Profile it
  decodes the whole graph inside the lease, as `GET /tasks` does; today's list
  search runs its matcher outside the lease.
- Without Dependencies, `matching` decodes only the returned Tasks (tested
  literally: 2 of 3 decoded).
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

1. The two OCC-covered lines (`OperationStore.record`, `OperationStore.constructor`)
   and the settle rule in committed-operations.ts: a note that is only an upper
   bound when it is not confirmed, and the preview mark.
2. `tasks=matching` decoding the whole graph when the Profile has Dependencies,
   and the longer lock hold that follows (15.19 against 11.30 ms at 1,424).
3. The `known` rule: generation, day, and no commit after the seq, all
   Profiles counted.
