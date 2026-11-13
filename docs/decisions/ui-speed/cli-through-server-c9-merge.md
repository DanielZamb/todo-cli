# CLI routing: merge of integ/c9-server

2026-11-13, by Claude Opus 5.5 on `feat/cli-through-server`.

`integ/c9-server` 675aab82 (integ/server 2a840b55 plus the stream wake and the
durable repeated-refusal fix) is merged as de9292be, parents 8d7a453c and
675aab82, no squash, no rebase. The product for every renewal and gate below is
0733af4afcaa (the merge plus the commits listed under "Commits"); later commits
change only skills, mappings and this report.

## Conflicts and their resolution

| File | Resolution |
| --- | --- |
| apps/server/src/sse.ts | The incoming file, unchanged. This branch's only change was the per-stream `makeWait` hook; it goes. |
| apps/server/src/server.ts | One wake object. `outsideCommit?: OutsideCommit` becomes `wake?: StreamWake`. `verifyStore` stays immediately after the raw store's acquisition; the wake and the decorator are built after it. `localRoutes(store, endpoint, wake)` gets the decorated store; `changesLayer(rawStore, wake)` and `taskSearchCacheHygiene(rawStore)` stay. |
| docs/architecture.md | Both paragraphs; the nudge signals the server's one StreamWake. |
| Task search cache coverage.json | Both histories kept; the server.ts row renewed below. |

`apps/server/src/outside-commit.ts` is deleted. `local-routes.ts`: the nudge calls
`wake.signal()`. `stream-wake.ts`: `StreamWake` takes its fallback as a
constructor parameter, default `Effect.sleep("250 millis")`; the race and the
version check are unchanged.

## The six points

1. `OutsideCommit` is gone; the nudge route calls `wake.signal()` on the server's `StreamWake`.
2. `changesLayer(rawStore, wake)` stays; `makeWait` is removed; sse.ts waits only on `wake.wait(state.wakeVersion)` and reads `wake.version` on the next line; `PassState` built from explicit fields, no spread (the incoming file).
3. `serverLayer({ wake?: StreamWake })`; `new StreamWake(fallback = Effect.sleep("250 millis"))`; routing.test.ts uses `new StreamWake(Effect.never)` and still passes.
4. `localRoutes` receives the decorated store; never `rawStore`. A control that passes `rawStore` fails the routed-command probe.
5. This branch adds no public member to OperationStore, Authentication, Snapshots or ScheduledWork (its domain additions are the new modules backend-command.ts and database-route.ts), so nothing needed a classification and the typecheck had nothing to fail on. The `rawStore` line list is unchanged. raw-store-guards' transaction check found the CLI routing singleton guard's `BEGIN EXCLUSIVE` (database-endpoint.ts, on its own SQLite file beside the database, never the store's connection); the guard now expects exactly that one occurrence and pins that the file's only `new Database(` opens `guardPath`.
6. Server suite (raw-store guards, composition catalog, the 31 writer cases, pass-rate, the new probes): 168/168. verify-sse: 0.

## Probes (apps/server/test/wake-routing.test.ts)

| Probe | Literal result |
| --- | --- |
| Nudge wakes only its own server, adds nothing to History | With fallback `Effect.never`: outside write not delivered in 600 ms; nudge 200; delivered, 1 frame; 0 op_log rows added; own wake +1, the other server's wake +0 |
| In-process routed command alone | 200, outcome success, delivered, 1 frame, wake +1 (one signal at the outermost exit) |
| Nudge and routed command together | both 200; 1 op_log row; 1 frame, 1 unique id; wake +1 or +2; a later nudge for the delivered entry: 200, still 1 frame, wake +1 |
| Timer with the record hidden | default fallback; no nudge; delivered under 1000 ms; 1 frame; wake +0 |
| Decorator at construction | `/dev/fd` identical before and after `streamWakeStore(...)`: it reads the store's `db` property, checks it is a bun:sqlite Database and builds Proxies; it opens nothing |
| S1 window | database-endpoint.test.ts window literal now names `rawStore`; still green; the decorator is outside the window |

Controls, each restored byte-identically: `localRoutes(rawStore, …)` fails the
routed-command probe; a nudge that does not signal fails the three nudge
probes; a never default fallback fails the timer probe.

## Refusal fix and gate

The fix is on the branch (`fix/durable-denial` 366398fe via 7b279032 and
675aab82, merged in de9292be). The protocol stays 1 and `routable()` is
unchanged; nothing is routed. Recorded in the design and the draft ADR-0023.

## Commits

- de9292be merge of 675aab82
- 647d4912 reference isolation profile and its controls
- 556ee958 wake-routing probes
- 7ace0879 raw-store guard: the routing guard's own lock
- c9b8df8d design and ADR-0023: the fix is on the branch
- 8c473862 barrier build marker and the SSE fallback case
- 0733af4a baseline resolve hook (the product)
- 355fa5d9 candidate renewal of both mappings
- this report

## Gates

| Gate | Exit | Notes |
| --- | ---: | --- |
| verify-cli-routing | 0 | all 8 checks (gates3); first run 1: the barrier build's `const store` marker (fixed), second run 1: the 8d85f5e2 baseline could not resolve outside-commit.ts (fixed) |
| verify-cli | 0 | 73/73 |
| verify-sse | 0 | 71/71, compositions and nested-rollback witnesses; first run 1: the wake branch's compiled-CLI fallback case got the CLI's nudge (sse.test.ts:439); it now hides the record |
| verify-server-api | 0 | |
| verify-auth | 0 | including verify-durable.sh, the cross-process matrix |
| verify-snapshots | 0 | |
| verify-profiles | 0 | |
| Root check (TMPDIR outside the repository) | 0 | domain 486, CLI 73, server 168, Electron 168 + 1 skipped |
| verify-occ-atomicity hashes | 10/10 | |

## Mappings

Audit of every coverage and pin file against the product: verify-occ-atomicity,
verify-discovery-formal, verify-task-search-formal and DAG production coverage
unchanged; two mappings stale.

- **Task search cache**: hygiene row server.ts. Pre-renewal: seven cache
  controls 1, three observer controls 1, restored 0, typecheck reached, stop at
  the server.ts hash. Renewed; full `verify.mjs` on 0733af4a with the same-source
  uncached oracle: 0, all nine stages.
- **DAG formal public**: eight rows, stale since CLI routing slice 1 (main.ts,
  help.ts, schema.ts, api index.ts, openapi.json, server.ts, contract.ts,
  ContractIdentity.swift). The mapped items are textually unchanged; openapi.json
  adds three /local paths and every existing path is byte-identical. 53/53 public
  anchors match once on the product. Pins, coverage and the public contract
  (259e9afb…) renewed as a candidate. **The full default run is owed**: it was
  not started because free space was 41 GiB and the run compiles many binaries.
  Its inputs are staged (hash-pinned jar, preserved e7170510 baseline CLI, a
  loopback `ps` proxy for the sandbox).

## How the audits missed eight DAG public rows

Slice 1 changed main.ts, help.ts, schema.ts, packages/api/src/index.ts,
openapi.json, server.ts and the two contract identity files, all pinned by
`.agents/skills/verify-dag-formal/public-coverage.json`. My audits in the
correction rounds (heads 9e058e64 to 8d7a453c) hashed only the files the
handover named: the ten verify-occ-atomicity pins and the Task search cache
rows. They never opened the DAG formal, discovery-formal or task-search-formal
coverage files. The audit in this merge round found the rows, but by a fixed
name pattern (`*coverage*`, `*pin*`, `*mapping*` JSON files), which would miss a
pin file named otherwise. It also could not resolve the cache's relative paths:
it reported its seven `files` rows as MISSING, so drift there would have gone
unseen.

The first version of the audit (42f34353) still compared only `{path|file, sha256}`
rows with product paths. The seat showed it passed silently over other shapes
(review 3, R5). The audit now accounts for every 64-hex string under every
`.agents/skills` directory, in any case, as compared, historical by a named rule,
or unknown. Unknown or drift exits 1 with file and line, and a ledger lists by
value what no rule reads. Counts:

| Commit | Occurrences | Compared match | Compared drift | Historical | Unknown | Exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 8d7a453c (413 files) | 282 | 126 | 10 | 146 | 0 | 1 |
| head, this commit (426 files) | 377 | 136 | 0 | 241 (72 of them the ledger's own values) | 0 | 0 |

At 8d7a453c the ten drifts are the eight DAG public rows, the cache's server.ts
row, and verify-dag-formal/public-pin.json's top-level contract (78a2be44 against
the commit's 259e9afb), which the earlier audits could not see. The renewal in
355fa5d9 covered it. pin-audit-selftest.mjs builds the seat's shapes with wrong
hashes and requires each to come out as drift or unknown.

## Isolation

Earlier rounds used the profile with `(deny network*)` followed by an allow for
localhost both ways; 1.1.1.1:80 connected under it. Its 4310/14310 denials held.
isolate.sh now writes the run store's reference profile; the five controls pass
with node (scripts/isolation-controls.mjs).
