# The server shapes the catalog (C10-S5), design note

2026-11-13, Claude Opus 5.5 (CATALOG-CONTRACT), on `feat/catalog-contract` from
`integ/contract` 9a372e86. Phase 1: no product or contract change until the
coordinator answers.

Sources read: this branch for the server, domain, CLI and Electron;
`mac-c10-wip` 718b0168 for the Mac app (read with `git show`). The plan quoted
Mac line numbers from candidate 10 at 5702b2bb; the numbers below are at
718b0168.

## Summary

- One new read, `GET /profiles/:profile/catalog`, replaces the 8 or 9 requests
  of a Mac refresh and the 9 of an Electron refresh.
- It returns the view's counts, the Project, Tag and Profile lists in one name
  order, the view's groups as ordered Task ids (each Task once), the Tasks, and
  the History position it reflects.
- Project and Tag filters travel as ids. No client applies a Tag-name rule,
  sorts, counts, groups, or re-filters rows.
- Counts and order come from SQL on the projection's stored columns. No new
  index and no migration.
- Server work at 1,424 Tasks: 33.5 ms for today's eight reads, against 14.5 ms
  for a prototype of the one read with every Task and 6.4 ms with Today's rows
  only.

## 1. Inventory: what clients compute that the domain should own

"Agree?" compares the two apps with each other. Where they differ, the input
that shows it is given.

| # | What | Mac (`mac-c10-wip`) | Electron | CLI and domain today | What the server returns today | Agree? |
| --- | --- | --- | --- | --- | --- | --- |
| I1 | Open-Task count per view | `TodoModel.swift:941-942`: counts open Tasks over each view's group lists; All = open Tasks of the list | `task-client.ts:276-277, 290-296`: counts group memberships; Tasks = `tasks.length` (every status) | none | No per-view count. `ProfileSummary` carries `open_task_count` and `inbox_task_count` (`client-reads.ts:13-26`, SQL in `client-projection.ts:61-67`) | **No.** One open and one done Task: Mac All = 1, Electron Tasks = 2. Both count a Task twice in Today when it sits in two groups (3 such Tasks among 1,424 in the scratch fixture: 228 memberships, 225 Tasks) |
| I2 | Project and Tag name order | `TodoModel.swift:939-940`, again at `1388-1389` (`refreshConflictDefinitions`): `localizedCaseInsensitiveCompare` | `task-client.ts:283-288`: `localeCompare(…, { sensitivity: "base" })` | Discovery: code-unit order by name then id (`discovery.ts:30-34`); `/projects` and `/tags` are ordered by id (`client-projection.ts:90, 102`) | id order | **No.** Projects `{id p1, "é"}`, `{id p2, "e"}`: Mac shows e, é (accent-sensitive); Electron shows é, e (base sensitivity ties, so the server's id order stands). "Project 9" and "Project 10": both put 10 first |
| I3 | Tag names on a row | `TaskSnapshot.swift:36-39`: `localizedCaseInsensitiveCompare` | `model.ts:32-39`: `localeCompare` base | CLI `TaskView.tags`: code-unit sort (`presentation.ts:93-97`) | Tag ids in stored order | **No**, as I2 |
| I4 | Tag-name rule | `TodoModel.swift:52` (`tagNameEdges`: Swift whitespaces and newlines plus U+FEFF) and `986-989`: a Tag with an edge is never sent by name; the client filters by id instead | `task-search-results.ts:26-30`: sends the name only if `name === name.trim()` | Write: split on commas, `trim`, `toLowerCase`, drop empty, dedupe (`commands.ts:296-302`, again at `commands.ts:1119`, `import-tasks.ts:228-231`, `limits.ts:49-60`; quick-add lowercases `#word` at `quick-add.ts:79`). Filter: `tag.name.toLowerCase() === query.trim().toLowerCase()` (`task-filters.ts:119-126`, older copy `commands.ts:1390`) | Name filter only (`TaskFilters.tag`) | **Different requests, same rows.** Tag name `"\u0085x"`: the Mac sees an edge (U+0085 is a Swift newline) and filters by id; Electron sends the name (ECMAScript `trim` keeps U+0085) and the server matches it. Both then filter by id (I5), so the rows agree. Migrated Go Tags keep their stored form (`migration.ts:143-149`), so names with edges or capitals exist |
| I5 | Filtering rows the server already returned | `TodoModel.swift:923-925` (Project id, Tag id), `928-931` (view groups cut to the matching rows), `932-933`; `AppViews.swift:303-310` (`visibleTasks`) and `320-324` | `renderer.tsx:1702-1717` (Project id, Tag id); `task-search-results.ts:57-65` (view groups cut to the matching rows) | none | The list filters by Project **name** (exact) and Tag **name** (I4) | **Yes.** Both re-filter by id because a name filter is lossy: migrated Tags "Work" and "work" both match `tag=work` |
| I6 | Project name lookup for the filter | `TodoModel.swift:985` | `task-search-results.ts:22-24` | none | No id filter | Yes |
| I7 | Grouping of All | `AppViews.swift:313-318`: P1 to P4, or one group "Dependency order" / "Lightest first" | `model.ts:5-10` and `task-search-results.ts:50-56`: same | none | Rows in id order | Yes |
| I8 | Task order | the server's order inside each priority group | same | `readTasks` sorts by priority, due (no due date first), created_at, id (`commands.ts:185-204`): `todo list` and `export` | `GET /tasks` and planning groups are in id order (`client-projection.ts:35`) | **The apps agree; the CLI does not.** Two P1 Tasks, id `1…` due 2026-11-20 and id `2…` with no due date: the apps show `1…` first, `todo list` shows `2…` first |
| I9 | "Blocked · N" (open blockers) | `Dependencies.swift:144-150`: scans the whole Task list per blocker | `dependency-presentation.ts:232-253`: same | none | `ready` and `blocked` per row (`task-filters.ts`, `dependencyState`), no count | Yes. Both need the full Task list for it, which matters in §3 |
| I10 | Same Task in two Today groups | the rows duplicate (`TodoModel.swift:932` flattens the groups) | the rows duplicate | none | `ClientReads.view` puts a Task due before today and scheduled today in Overdue and in Scheduled today (`client-reads.ts:110-147`) | Yes, both show it twice. SwiftUI `ForEach` and React keys assume unique ids |

Not in scope:
- The Mac History diff sorts Tag names with Swift's default order
  (`ClientReads.swift:133-134`). It is History presentation, not the catalog.
- `todo list --today` means due or scheduled today, without Overdue
  (`commands.ts:1380-1400`). The Today view includes Overdue. That is a CLI
  flag's own meaning and stays as it is.

## 2. The requests of one refresh today

**Mac, full refresh** (`performRefresh`, `TodoModel.swift:889`; `readSearchCatalog`, `1005-1017`). All are started together.

| # | Request | For |
| --- | --- | --- |
| 1 | `GET /profiles/:p/tasks` | every non-deleted Task (rows of All, the title and Blocked lookups) |
| 2 | `GET /profiles` | Profile picker and the delete-prompt count |
| 3 | `GET /profiles/:p/projects` | sidebar Projects |
| 4 | `GET /profiles/:p/tags` | sidebar Tags |
| 5-8 | `GET /profiles/:p/views/{today,overdue,scheduled,inbox}` | the four counts and the current view's groups |
| 9 | `GET /profiles/:p/tasks?<filters>&text&project=<name>&tag=<name>` | only when a filter, search, Project or Tag is set (`912`) |

**Mac, query refresh** (search or filter change): the filtered list, plus the
current view when it is a planning view (`918-919`). That is 2 requests, or 1 in All.

**Electron, full refresh** (`task-client.ts:240-299`): the same eight, plus
the ninth on every refresh. `taskSearchQuery` always returns an object with
`text`, so `request.filters` is never absent (`task-client.ts:270`). With
`text: ""` the ninth runs the search path and returns empty `search_matches`.

**Electron, query refresh** (`task-client.ts:224-239`): the filtered list,
plus the view unless the view is All. That is 2 or 1.

Per change notice, Electron also re-reads the open Dependency graph and picker
(`renderer.tsx:1011-1013`). The Mac does the same through
`refreshDependencyReads`. These run only while those surfaces are open, and
they stay.

## 3. The proposal

### Request

`GET /profiles/:profile/catalog`, in group `reads`, `Authorization` middleware.

Query `CatalogQuery`, every key optional:

| Key | Values | Meaning |
| --- | --- | --- |
| `view` | `all` (default), `today`, `overdue`, `scheduled`, `inbox` | the view whose groups are returned |
| `tasks` | `all` (default), `matching` | `all`: every non-deleted Task of the Profile, as both apps hold today (the full refresh). `matching`: only the Tasks in the groups (the query refresh) |
| `project_id` | `ProjectId` | at most one Project |
| `tag_id` | `TagId` | at most one Tag |
| every `TaskFilters` key | as `GET /tasks` | `ready`, `blocked`, `order`, `text`, `prefix`, `status`, `priority`, `due`, `scheduled`, `attachment`, `energy`, `estimate`, and the name filters `project` and `tag` for the CLI |
| `now` | `Instant` | as `PlanningViewQuery`; for tests and the day change |

Errors: the `GET /tasks` set, including `search_too_broad` (422) and
`invalid_args` (400). An unknown key is refused as on `GET /tasks`.

### Response `Catalog`

```
{
  position: { generation: string, seq: int >= 0 },
  now:      Instant,
  profiles: ProfileSummary[],   // name order (below)
  projects: ProjectSummary[],   // name order, open_task_count
  tags:     TagSummary[],       // name order, open_task_count
  counts:   { all: int, today: int, overdue: int, scheduled: int, inbox: int },
  view: {
    name:   "all" | "today" | "overdue" | "scheduled" | "inbox",
    groups: [{ name: GroupName, task_ids: TaskId[] }]   // ordered; a Task appears once
  },
  tasks:    TaskRead[]          // Task order; tasks=matching: exactly the ids in groups
}
```

- `GroupName` is the planning names already in `PlanningView` plus `P1`, `P2`,
  `P3` and `P4` for All, and `Dependency order` or `Lightest first` when
  `order` is set. All always has its four priority groups, empty or not.
  Hiding an empty group stays the client's choice, as today.
- `TaskRead` gains one optional field, `open_blocker_count`: the number of
  direct Dependencies that are open or snoozed. It is present whenever
  `depends_on` is. It replaces I9.
- In the response, each `TaskRead.tags` lists ids in the name order of their
  Tags. That replaces I3.
- Rows that match `text` carry `search_matches`, as on `GET /tasks`.
- The existing reads stay and are unchanged (ADR-0009: changes are additive),
  except that `/projects` and `/tags` also return name order, so the Mac's
  `refreshConflictDefinitions` sort goes too.

**Optional in the same bump (follow-up 42).** `TaskWrite` gains
`operation_seq`, the seq of the accepted operation. `append` already returns
it (`store.ts:694`). See decision D7.

### Decisions

**D1. One Task order** (`compareTasks`, in a new `packages/domain/src/catalog-order.ts`):

1. `priority` by code units, so P1 sorts before P4;
2. due key by code units: no due date gives `""` and sorts first, a date gives
   `YYYY-MM-DD`, an instant gives its UTC string;
3. `created_at` by code units;
4. `id` by code units.

This is `readTasks`' comparator (`commands.ts:185-204`) moved, with
`localeCompare` replaced by code units. The two give the same order on these
ASCII forms. `readTasks` then imports it, so `todo list` and `export` keep their
order and the export goldens stay byte-identical. The apps move from id order
(random UUIDs) to this order. Planning groups use it too. With `order=topo` or
`lightest`, the rows keep the dependency order, as today. The SQL form is
`ORDER BY priority, coalesce(json_extract(due_at,'$.date'),json_extract(due_at,'$.utc'),''), created_at, id`:
SQLite's BINARY collation equals code units for ASCII.

Whether a Task with no due date should sort first within its priority is the
owner's question (Q1). Keeping the CLI's order is what makes the goldens stay.

**D2. One name order** for Profiles, Projects and Tags (`compareNames`, same file):

1. `new Intl.Collator("und", { usage: "sort", sensitivity: "accent", numeric: true }).compare(a.name, b.name)`:
   the root locale, so the server's locale never matters; case-insensitive;
   accent-sensitive; digit runs compared as numbers; spaces and punctuation
   before digits, and digits before letters;
2. then `name` by code units, so `A` sorts before `a` deterministically;
3. then `id` by code units.

Empty names cannot occur (`NonEmptyString`). A whitespace-only migrated name
sorts first.

Measured on bun 1.4.4 and node 22.23.4, which give the same order. The input
`b B a á Á e é z Ñandú nandu "Project 10" "Project 9" "project 9" 10 9 " lead" _x ß ss Ärger Zebra 😀`
sorts to:

`" lead", "_x", "😀", "9", "10", "a", "Á", "á", "Ärger", "B", "b", "e", "é", "nandu", "Ñandú", "Project 9", "project 9", "Project 10", "ss", "ß", "z", "Zebra"`.

Electron's rule on the same input puts 10 before 9 and lets ids decide among
`a`/`á`/`Á` and `e`/`é`. Discovery's code-unit rule puts every capital first
and every accented letter after `z`.

**D3. One Tag-name rule**, in a new `packages/domain/src/tag-name.ts`:

- `tagNames(inputs)`: split each input on `,`, apply ECMAScript `trim`, then
  `toLowerCase`, drop empty parts, dedupe, and sort by code units.
- `tagKey(name)`: `name.trim().toLowerCase()`.

Every writer uses `tagNames`: the create and edit metadata, the length check,
import, and the limit check. The name filter compares `tagKey(stored)` with
`tagKey(query)`.

That is one change for migrated data: a stored `" Work"` now matches
`--tag work`; today it matches nothing. The apps never apply the rule: they
filter by id. `tagNameEdges` and the `trim` check in `taskSearchQuery` go.

**D4. What a view is, for counting.**

- A view's count is the number of distinct Tasks with status `open` (not
  snoozed, done, cancelled or deleted) that the view holds for the Profile.
- Filters, search, Project and Tag never change a count. They change the
  groups. That is what both sidebars show today.
- With day meaning a date value or the UTC date of an instant, and today the
  UTC date of `now` (unchanged; see Q2):
  - `all`: every open Task;
  - `today`: due day before today, due day equal to today, or scheduled day
    equal to today;
  - `overdue`: due day before today;
  - `scheduled`: scheduled is set;
  - `inbox`: neither due nor scheduled is set.
- These are `ClientReads.view`'s sets. The counts are the sizes of those sets,
  which is `ProfileSummary`'s existing `open_task_count` and `inbox_task_count`
  rule.
- In a view's groups, each Task appears once. The first group in the view's
  order wins: Overdue, then Due today, then Scheduled today.

Visible changes:
- Today stops counting a Task twice.
- Electron's "Tasks" badge counts open Tasks only, as the Mac's does.
- Rows of the All view still include every status. The status filter applies
  to them as now.

**D5. Project and Tag filters combine by AND**: with each other, with the
view, with every `TaskFilters` key and with `text`. That is ADR-0014's rule.
Electron allows a Project and a Tag together in any view; the Mac allows one at
a time in All. Both are subsets of this. A name filter (`project`, `tag`) and an
id filter given together must both hold.

**D6. A refresh is one request**, full or query. The Dependency picker and
graph reads stay separate. They exist only while those surfaces are open and are
not part of the catalog.

`tasks=all` exists because the Mac (`AttachmentModel.swift:72, 106`,
`DependencyDrag.swift:35, 57`, `DependencyHistory.swift:16`, `EditorView.swift:571`,
`DependencyViews.swift:55`) and Electron (`renderer.tsx:393, 1422, 1612, 3508`,
`dependency-dialog.tsx:268`, `dependency-batch-dialog.tsx:168`,
`dependency-edge-report.tsx:13`, `dependency-presentation.ts:58, 135`,
`dependency-drag-state.ts:24`, `attachment-batch.tsx:112`) look up any Task of
the Profile by id. Narrowing those surfaces is a client rewrite under three
formal mappings, not the smallest change. The Patch protocol removes the full
list later.

**D7. The History position the read reflects.**

- `position.seq` is `coalesce(max(seq),0)` over `op_log`.
- `position.generation` is the restore generation: the same string as the
  stream's `reload` event and the `x-todo-generation` header.
- Where it comes from: the read lease already computes both when it classifies
  the Profile (`auth.ts:672`, the `current` and `restored` CTEs), inside the
  same transaction as every read that follows. The number is free: no extra
  statement (`max(seq)` alone measured 0.002 ms). The change only carries
  `classification.snapshot` into the bound read: `queryWithin`, then
  `bindRead`, then an accessor `readPosition(read)`.
- Meaning: the catalog contains every committed operation with seq up to
  `position.seq` and none after it, in that generation.
- `seq` is global: it counts other Profiles' operations and rejected attempts,
  so it can rise with no change to this Profile. It is only ever used as
  "covered or not".
- Client rule: a stream operation with `id <= position.seq` in the same
  generation is already covered and needs no refresh. An own write whose
  `operation_seq <= position.seq` is covered. This turns the scheduler's
  "a refresh that started after S" into an exact comparison, and removes the
  extra refresh after an echo seen during a read-back (group B design).
- `operation_seq` on writes is additive and one field. I recommend it rides in
  this bump, since the regeneration happens once. It touches
  `TaskCommands.result` and `cliResult`, both under the Dependency public
  mapping.

**D8. The lease.** I propose one deferred read transaction, the boundary
`readSnapshot` already uses for Discovery: one WAL snapshot that does not take
the write lock. Today's Profile reads use `BEGIN IMMEDIATE` (`store.ts:314-333`);
follow-up 31 is that cost on the stream side. The position and the data come
from the same snapshot either way. If the coordinator prefers the existing
immediate boundary, nothing else in this note changes.

## 4. Cost

**How it is computed, inside the one lease:**

1. Credential check and Profile classification, as now. This also gives the
   position.
2. Profile summaries: the existing grouped SQL (`client-projection.ts:61-67`).
3. Project and Tag counts, rewritten to aggregate from the open Tasks.
   Measured, same rows as today's queries:

   ```
   SELECT p.*, coalesce(c.n,0) AS open_task_count FROM projects p
     LEFT JOIN (SELECT project_id, count(*) n FROM tasks
                WHERE profile_id=:p AND status='open' AND deleted_at IS NULL GROUP BY project_id) c
     ON c.project_id=p.id WHERE p.profile_id=:p
   SELECT g.*, coalesce(c.n,0) AS open_task_count FROM tags g
     LEFT JOIN (SELECT l.tag_id, count(*) n FROM tasks t JOIN task_tags l ON l.task_id=t.id
                WHERE t.profile_id=:p AND t.status='open' AND t.deleted_at IS NULL GROUP BY l.tag_id) c
     ON c.tag_id=g.id WHERE g.profile_id=:p
   ```

4. View counts: one statement over the open Tasks with
   `day(x) = coalesce(json_extract(x,'$.date'), substr(json_extract(x,'$.utc'),1,10))`
   on the stored `due_at` and `scheduled_at` columns. Its plan is
   `SEARCH tasks USING INDEX tasks_profile_status (profile_id=? AND status=?)`.
5. Group membership and order: the same predicates, ordered as in D1. Only ids,
   priority and keys are read; nothing is decoded.
6. Rows:
   - with `tasks=matching` and no `text`, decode only the Tasks in the groups;
   - with `text`, decode only the view's candidates and run the existing
     matcher (`filterTaskRecordsEffect` with `store.searchWords`);
   - with `tasks=all`, decode each non-deleted Task once.
7. Dependency fields for the returned rows: the Profile's edges (the existing
   statement) and the blockers' statuses by SQL, with no decode. That gives
   `ready`, `blocked`, `depends_on`, `blocks` and `open_blocker_count`. With
   `order=topo` or `lightest`, the whole graph is decoded, as today.

**Indexes: none new, no migration.** I tested `task_tags(tag_id, task_id)` and
`tasks(profile_id, project_id, status)` on a copy. They brought the old Tag
query from 3.02 to 1.47 ms at 1,424 Tasks; the rewrite above brings it to
0.56 ms with no index.

**Does it decode every Task?**
- Counts, order, groups, Project and Tag counts, and the position: never.
- `tasks=matching` (every search keystroke and filter change): only the rows it
  returns, or the view's candidates when searching.
- `tasks=all` (the full refresh): every non-deleted Task, once. Today's Mac
  refresh decodes them five times on the server (the list, plus each of the four
  views through `projection.catalog`, `client-projection.ts:51-57`), and 1.9
  times on the client.
- That is a deviation from the brief's "does not decode every Task", for the
  reason in D6. History is never decoded.

**Measured.**

| | 178 Tasks | 1,424 Tasks |
| --- | --- | --- |
| Today's Mac full refresh: the 8 reads, summed | 3.81 [3.58, 4.85] | 33.49 [32.45, 34.50] |
| of which `GET /tasks` alone | 0.80 [0.75, 1.66] | 9.17 [8.44, 10.24] |
| Prototype, one lease, `tasks=all` | 1.40 [1.35, 2.08] | 14.47 [13.43, 16.54] |
| Prototype, one lease, Today's rows only | 0.80 [0.76, 1.50] | 6.42 [6.17, 6.76] |

How it was measured:
- Handler work in milliseconds, in process, with no HTTP encoding and no
  client decode. Median [min, max] of 15 alternating triples after 3 warmups.
- Bun 1.4.4, under the reference sandbox profile after its five controls (run
  with node, all passed). One-minute load 2.15 to 2.41.
- The prototype is scratch code, not the design. It used today's slower Project
  and Tag queries and ran the graph through `filterTaskRecords`. With the
  rewritten counts, Today's rows only should come to about 4 ms at 1,424.

SQL parts at 1,424 Tasks, median of 21 runs:

| Part | ms |
| --- | --- |
| `max(seq)` | 0.002 |
| view counts | 0.295 |
| Today's ids | 0.224 |
| ordered keys of all Tasks | 0.631 |
| Projects, today's query / rewritten | 0.946 / 0.244 |
| Tags, today's query / rewritten | 3.019 / 0.559 |
| decode 1,424 Tasks | 2.74 (1.92 µs each) |

The fixture:
- one Profile, Tasks created through `TaskCommands`;
- 8 Projects, 17 Tags, a Dependency on every tenth Task, a quarter of the
  Tasks closed;
- short titles, no descriptions or Attachments.

It is not owner-shaped: the server-reads fixture had 1.9 KB per Task, and
decode cost grows with bytes. Treat the table as the server's share only. The
Mac's share (8 round trips and about 2,660 Task decodes, against 1 and 1,424)
is measured in phase 2.

**Search cache.**
- The catalog uses the same cache instance (`store.searchWords`), the same
  token taken before the lease (as `TaskCommands.list` does), and the same
  admission rules.
- There is no new key, state or invalidation.
- The hygiene loop (`task-search-cache-hygiene.ts`) is unchanged: the catalog
  writes nothing, and Purge, ProfileDeleted and restore still clear the cache.
- The cache mapping is renewed anyway, because `server.ts` is hashed (§7).

**Stream wake table.**
- The new store member (`taskCatalog` on `auth`, beside `readCatalog`) is
  classified `read` in `apps/server/src/stream-wake-store.ts:88-129`. The
  typecheck fails until it is classified.
- A test asserts that a catalog read wakes no stream (the existing pass-rate
  style).
- No new transaction, so the raw-store census stays at 39.

## 5. Parity (ADR-0009)

**The CLI has today:**
- `todo list`: rows, filters and JSON, in the D1 order;
- `todo profile list`: Profile counts;
- `todo profile list --projects`: Project names, without counts.

It has no per-view counts, no Tag list and no planning views (`--today` has its
own meaning, §1).

**New: `todo catalog`.**
- In a new `apps/cli/src/catalog.ts`, registered in `main.ts` with one line, so
  the split planned in C10-S10 is not made harder.
- Flags: `--view`, `--tasks all|matching`, `--project-id`, `--tag-id`, and
  `list`'s filter flags through the same parser.
- `--format json` writes the `Catalog` object plus `generated_at`. Its schema is
  published as `todo schema catalog`.
- Markdown lists the view counts, then Projects and Tags with counts, then the
  view's groups.
- It is a read, so it has no dry-run. It is not live, so it has no terminal
  view. The CLI reads the database directly, as every read does (ADR-0023
  routes writes only).
- The flag golden (`cli-flag-contract.json`) and the root help hash change.

**UI.** Both apps already show the counts, the Project and Tag lists, and the
views. They change source only. The visible changes for the coordinator's taste
review:
- the Today count with no duplicates;
- Electron's All count;
- the name order;
- the Task order inside groups.

## 6. What each client deletes

**Mac** (`mac-c10-wip` 718b0168; carried into the Mac line in step 2, then
C10-S3 builds on the result).

`TodoModel.swift`:
- `52` (`tagNameEdges`);
- the multi-request reads `911-919`, `readSearchRows` `979-996` (query
  building, the Project name lookup at `985`, the Tag edge rule at `986-989`),
  `readSearchPlanning` `998-1003` and `readSearchCatalog` `1005-1017`. One
  catalog call replaces them;
- the re-filtering at `923-925` and `928-933`;
- the sorts and counts at `939-942`;
- the sorts at `1388-1389`.

Other files:
- `AppViews.swift`: `visibleTasks` filtering at `303-310` and the grouping in
  `taskGroups` at `311-326`. The groups come from the catalog.
- `TaskSnapshot.swift`: the sort at `37-38`. `tagNames` keeps only the map from
  id to name.
- `Dependencies.swift:144-150`: the count of open blockers becomes
  `open_blocker_count`.

What stays (presentation only):
- labels and the red Overdue tint;
- hiding empty groups while searching;
- `TaskCount` pluralization;
- the "Planning views show open Tasks only" hint;
- the title fallbacks to an id;
- the deletion prompt's fallback count.

**Electron.**

Removed:
- `task-client.ts`: the `search` and `list` branches (`224-299`) become one
  `catalog` request, so the counting at `276-277` and `290-296` and the sorts at
  `283-288` go.
- `task-search-results.ts`:
  - `taskSearchQuery` `18-36` sends ids, so the name lookup and the `trim`
    rule go;
  - `searchGroups` `44-66` goes, groups come from the catalog.
- `model.ts`:
  - `priorityGroups` `5-10` goes;
  - the sort in `taskTagNames` `32-39` goes.
- `renderer.tsx:1702-1717`: the re-filtering by Project and Tag.
- `dependency-presentation.ts:248-252`: the count of open blockers.
- `protocol.ts`: the `tasks` reply becomes the catalog.

What stays:
- the rendering;
- hiding empty groups while searching (`renderer.tsx:1716`);
- the count display (`2213`, `2293`) and `countTasks`;
- the deletion prompt's fallback count (`965`).

**CLI and domain.** No CLI code is deleted.
- `readTasks`' comparator moves to `compareTasks`.
- The five copies of the Tag-name rule (D3) go to `tag-name.ts`.

## 7. Formal mappings, renewals and skills

Every file below is under at least one mapping. A renewal follows only after
its own check passes on the product, and is a candidate until a seat accepts it.

| File | Change | Mappings it touches |
| --- | --- | --- |
| `packages/api/src/index.ts`, `openapi.json`, `contract.ts`, `ContractIdentity.swift` | the `reads.catalog` endpoint, the optional `operation_seq`; regenerated, new contract id | Dependency public pin (scope `packages/api` plus its top-level `contract`); the Mac's generated sources (`Types+Operations.swift`, `GeneratedContractTests.swift`) in the same scope at step 2 |
| `packages/domain/src/catalog.ts`, `catalog-order.ts`, `tag-name.ts` (new) | the read, the orders, the rule | Dependency production and public pins (scope `packages/domain`) |
| `packages/domain/src/commands.ts` | `readTasks` imports `compareTasks`; the Tag rule; `operation_seq` in `TaskCommands.result` and `cliResult` | Dependency public (`TaskCommands.result`, `TaskCommands.change`, `cliResult`); Task search formal (`readTasks`); Task search cache (file hash) |
| `packages/domain/src/task-filters.ts` | Tag filter through `tagKey`; `open_blocker_count` in `filterTaskRecordSteps` | Dependency public (`TaskFilters`, `filterTaskRecords`); Task search formal (`filterTaskRecordSteps`); cache (file hash) |
| `packages/domain/src/task-read.ts`, `graph-model.ts` | `open_blocker_count` | Dependency pins (scope) |
| `packages/domain/src/auth/auth.ts` | `queryWithin` and `bindRead` carry the position; the `taskCatalog` member | Dependency pins (scope). `requireCredential`, `mutate`, `append` and `startSeries` are untouched |
| `packages/domain/src/store/client-projection.ts` | the SQL of §4 | Dependency pins (scope) |
| `packages/domain/src/import-tasks.ts`, `limits.ts`, `quick-add.ts` | the Tag rule (behaviour kept) | Dependency pins (scope) |
| `apps/server/src/server.ts` | one handler, its unknown-key refusal | Dependency public (`rejectUnknownQuery`; scope); cache (`hygieneFiles` hash) |
| `apps/server/src/stream-wake-store.ts` | classify `taskCatalog` | Dependency pins (scope) |
| `apps/cli/src/main.ts`, `catalog.ts`, `schema.ts`, the flag golden | `todo catalog` | Dependency public (scope); cache (`main.ts` hash) |
| `apps/electron/src/task-client.ts`, `renderer.tsx`, `protocol.ts`, `model.ts`, `task-search-results.ts`, `dependency-presentation.ts` | §6 | Task search formal (the `refresh`, `activateView`, `clearFilters` and notice handlers; the `taskRequest` list and search branches); Discovery formal (`task-client.ts`, `renderer.tsx` same-key refresh); Dependency public pin (these files are in its scopes) |
| Mac sources (step 2) | §6 | Discovery formal's Swift step (already owed); the Mac source fences in the verify skills, audited by file |

No function in `.agents/skills/verify-occ-atomicity/coverage.json` changes.
`OperationStore.append` already returns the seq.

**Renewals that follow**, each after its own check passes:
- `verify-dag-formal`, production and public;
- `verify-task-search-cache`;
- `verify-task-search-formal`;
- `verify-discovery-formal` (with its Swift step).

Pin audit on this base (9a372e86), `pin-audit.mjs HEAD` with the ledger:
`filesScanned 487, occurrences 408, unknown 0`. One problem, which predates this
unit: `drift .agents/skills/verify-discovery-formal/coverage.json:69 apps/electron/src/task-client.ts file pin`.
It is the Discovery renewal owed to step 2.

**Skills that prove it:**
- `verify-server-api`: the route, its errors, the literal catalog.
- `verify-filters`: AND combination, ids and names, the Tag rule on migrated
  names.
- `verify-sse`: position against stream ids; the catalog read wakes no stream.
- `verify-cli`: `todo catalog`, schema and flag golden; `list` and `export`
  byte-identical.
- `verify-task-search`: search inside a view, matching scope.
- `verify-electron`: one request per refresh, counts, order.
- The Mac gate cycle after step 2.

`verify-cli-routing`'s pin audit runs before delivery.

## 8. Tests and measurements I will write

**Fixture.**
- A scratch store, `TestClock` at `2026-11-13T15:00:00Z`, one minute added
  before each create.
- Profile `work`; Projects `Home` and `Travel`; Tags `home` and `travel`.

| Task | Priority | Status | Due | Scheduled | Project | Tags | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 "Pay rent" | P1 | open | 2026-11-12 | 2026-11-13 | Home | home | |
| T2 "Call bank" | P2 | open | 2026-11-13 | | | | |
| T3 "Plan trip" | P3 | open | | 2026-11-20 | Travel | travel | |
| T4 "Read book" | P4 | open | | | | home | |
| T5 "Old task" | P1 | done | | | | | |
| T6 "Dropped" | P2 | cancelled | 2026-11-01 | | | | |
| T7 "Blocked thing" | P2 | open | | | | | T2 |

**Literal assertions.**
- `counts` = `{ all: 5, today: 2, overdue: 1, scheduled: 2, inbox: 2 }`. On the
  same fixture today, the Mac gives today 3 and Electron gives tasks 7 and
  today 3. Those two numbers are the regression controls.
- `view=today` groups:
  `[["Overdue",[T1]],["Due today",[T2]],["Scheduled today",[]]]`.
- `view=all` groups:
  `[["P1",[T5,T1]],["P2",[T7,T6,T2]],["P3",[T3]],["P4",[T4]]]`.
  - `tasks=all` returns 7 Tasks in that order.
  - `tasks=matching` with `tag_id=home` returns `[T1, T4]`.
  - `project_id=Home` with `tag_id=home` returns `[T1]`.
- `projects` = `[["Home",1],["Travel",1]]`; `tags` = `[["home",2],["travel",1]]`.
- `text=rent`, `view=today`: groups `[["Overdue",[T1]],["Due today",[]],["Scheduled today",[]]]`,
  T1 carries `search_matches`, and the counts are unchanged.
- T7: `blocked: true`, `ready: false`, `open_blocker_count: 1`.
- Completing T2:
  - its reply's `operation_seq` equals the next catalog's `position.seq`, and
    `position.seq` is one more than before;
  - T7 has `ready: true` and `open_blocker_count: 0`;
  - `counts.today` is 1;
  - the stream event for that write has `id` equal to `String(operation_seq)`.
- A catalog read decodes zero operations (the existing History decode
  counter). With `tasks=matching`, `view=today`, no `text`, it decodes exactly
  2 Tasks (a `JSON.parse` spy, as `client-projection.test.ts` does).
- `compareNames` on the 22-name input of D2 gives the literal order of D2.
- `compareTasks` gives `readTasks`' order on the CLI fixtures. The `export`
  goldens are byte-identical.
- `tagNames([" Work , home,WORK", ",", "Ünïcode"])` =
  `["home","work","ünïcode"]`.
- `tagKey(" Work ")` = `"work"`. `tagKey("\u0085Work")` =
  `"\u0085work"` (ECMAScript `trim` keeps U+0085).
- A migrated Tag stored as `" Work"` matches `--tag work`. This is the one D3
  behaviour change, asserted red on today's code.
- Unknown query key: 400 `invalid_args`. `project_id` of another Profile: an
  empty result, never another Profile's Tasks.

**Measurements**, paired and alternating, load recorded:
- Server handler time, catalog (`tasks=all` and `matching`) against today's
  eight reads, at 178 and 1,424 Tasks. One fixture shaped like the
  server-reads one (1.9 KB per Task), built fresh from a script, not copied.
- Requests per refresh, counted at the server: Mac 8 or 9 to 1; Electron 9
  to 1; query refresh 2 to 1.
- Bytes per refresh.
- In the Mac gate cycle, the time from input to result for a filter change and
  a row click during a 300-write burst. Judged against the 20 ms median and
  300 ms p99.

## 9. Unsure, and the owner's questions

**Q1 (owner).** Within a priority, should Tasks with no due date come first, as
`todo list` and `export` order them today, or last?
- Keeping first leaves the CLI and the export goldens unchanged.
- Last changes them, and needs a dated amendment to ADR-0009's "export goldens
  stay byte-identical".

**Q2 (owner).** Today, Overdue and the counts use the server's UTC date
(`client-reads.ts:110-125`). In a zone west of UTC, Today turns into tomorrow in
the evening, while the `due` and `scheduled` filters use each Task's own zone.
Should the catalog take the client's time zone (`time_zone`, as quick-add
does)? This note keeps today's rule; changing it changes counts in every client.

**Q3 (coordinator).** Profile order. The catalog's `profiles` use D2. Should
`GET /profiles`, `todo profile list` and the Discovery directory (code units
today) adopt D2 in the same change? It is visible in CLI output.

The rest is uncertain on my side:
- ICU. D2 relies on the root collation of the runtime's ICU. Bun and node agree
  today. A future ICU could move rare characters; the literal test would show
  it.
- D8. Deferred against immediate: I have not checked every `checkedRead` path
  under the deferred boundary beyond the one `readSnapshot` already proves.
- The prototype's numbers are an estimate on a small-Task fixture. The decode
  share at owner scale is larger.
- The Mac's current order rules (`localizedCaseInsensitiveCompare`) are read
  from Foundation's documented behaviour. I ran no Swift in this phase.
- The search candidates per view: ADR-0014 says search runs over a Profile's
  Tasks. Running it over the view's candidates gives the same rows, because the
  view is a further AND. The seat should confirm that reading of the ADR.

## What has been shown

- **Logic passes:** the inventory, by reading the code. The order and Tag-rule
  probes ran on bun and node.
- **Looks right in a capture:** nothing in this phase.
- **Used for real:** nothing. Measurements are scratch, handler-level, under
  the sandbox; inputs under `.scratch/catalog-contract/`, ignored by Git.
