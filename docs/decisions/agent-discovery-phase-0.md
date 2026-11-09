# Agent discovery design gate

Status: approved with coordinator corrections A1 through A7 on 2026-11-09. Units A, B and E may start after this correction commit. C and D start after B merges.
Base: feat/agent-discovery at c11f7ec9c3eaead934c0ca314628860ed1a85ed3.
Run: 2026-11-09-sec-perf-agent. The five Tasks are 6e1e556e, dc04f3e9, 0a9fef38, 1f425687, and 1a74b0db.

## Contract

The following contracts include the coordinator's approved corrections. Existing fields, command behavior, error codes, exit statuses, exact-id rules, and authorization remain compatible. All successful CLI responses contain generated_at and are one JSON object. HTTP retains its existing array responses and tagged errors.

### Exit-code meanings

Every CLI error adds required exit_code and exit_meaning fields. One shared domain mapping takes the actual exit code, never the error code string. DAG errors therefore inherit the mapping without a new registry.

| exit_code | exit_meaning |
| --- | --- |
| 0 | success |
| 1 | runtime failure |
| 2 | validation or usage |
| 3 | not found or auth missing |
| 4 | Conflict |

The mapping documents 0, although errors never report success. Success envelopes do not gain these fields.

Example JSON error:

```json
{
  "generated_at": "2026-11-09T15:00:00.000Z",
  "code": "not_found",
  "message": "Task not found in Profile work (work). Mutations need the full Task id and an explicit Profile. Run todo list --profile work --prefix 45a312ac for this Profile, or todo lookup --prefix 45a312ac across Profiles this credential can access.",
  "exit_code": 3,
  "exit_meaning": "not found or auth missing",
  "details": {
    "profile": { "id": "work", "name": "work" },
    "task_id": "45a312ac",
    "recovery": "Run todo list --profile work --prefix 45a312ac for this Profile, or todo lookup --prefix 45a312ac across Profiles this credential can access. Mutations need the full Task id and an explicit Profile."
  }
}
```

Markdown prints one line, `error 3 - not found or auth missing`, in the current error block. Table errors carry the same values. Follow-mode terminal errors remain on stderr as JSON. Existing details such as current_version/latest, external_id/profile_id, and visible_task_count retain their shape and meaning.

HTTP adds the same pair to the existing error variants without renaming fields or removing _tag. The pair expresses the equivalent CLI outcome, not an HTTP status. HTTP 400/422 maps to 2, 401 and not-found 404 to 3, 409 to 4, 500 to 1. Authorization denial 403 retains the existing CLI authFailure equivalent, 3. Sign-in lockout 429 retains its CLI equivalent, 3. HTTP success arrays are unchanged. Request decoding errors handled by the framework need an explicit boundary mapping and a regression, so they also carry the pair.

Both apps preserve the server's human-readable message and show `error 3 - not found or auth missing` as secondary error detail. They use the server pair, not separate code-to-meaning tables. This detail must not replace the recovery action. Existing Conflict comparisons retain the latest Task and Version.

`todo schema error` adds required exit_code with enum 0,1,2,3,4 and exit_meaning with the five literal strings. The schema must constrain matching pairs, rather than accepting exit_code 3 with meaning Conflict. The man pages document all five meanings, JSON and Markdown examples, and stderr behavior.

### Task lookup context

Only a successfully authorized selected Profile can appear in Task lookup errors. A missing Task, including a Task in another Profile, produces the same error for that selected Profile. Never probe other Profiles to improve an exact-id error.

The new lookup details are the profile object, requested task_id, and recovery string shown above. The shared domain helper obtains the selected Profile's stable id and display name. CLI and HTTP use that helper for not-found Task reads, History, mutations, Series, Attachments, move/copy source lookups, batch rows, and export-by-id where applicable. Existing errors and statuses remain unchanged. Batch reports retain their per-row shape and add this context to the existing error object.

The message and details.recovery name both `todo list --profile <selected-id> --prefix <value>` for this Profile and `todo lookup --prefix <value>` across Profiles this credential can access when the supplied value satisfies ADR-0014. Both hints are generic and query nothing. For an arbitrary invalid id, omit the invalid value from the suggested command and use `<hex-prefix>` in both suggested commands. Shell-quote user-provided values in displayed CLI commands. HTTP also names both `GET /profiles/<selected-id>/tasks?prefix=<hex-prefix>` and `GET /tasks/lookup?prefix=<hex-prefix>` in its message and details.recovery. The text explicitly says that mutations need the full Task id and an explicit Profile. Normal default Profile selection remains unchanged.

Authentication, Profile-scope denials, and unknown or deleted Profile errors must not gain another Profile's name, id, Task count, or existence. The CLI must authorize before enriching an error, including paths that currently call store.profiles directly. Apps show the returned context inline and retain their editor draft. They never switch Profiles as a reaction to a lookup failure.

### Profile-to-Project directory

Reuse `todo profile list` with the explicit Boolean flag `--projects`. Existing `todo profile list` output remains unchanged. `todo profile list --projects --format json` keeps its existing profiles envelope and counts, and adds projects to each returned Profile:

```json
{
  "generated_at": "2026-11-09T15:00:00.000Z",
  "profiles": [
    {
      "id": "work",
      "name": "work",
      "open_task_count": 1,
      "inbox_task_count": 1,
      "visible_task_count": 1,
      "projects": [{ "id": "63bbdd22-1111-4222-8333-444444444444", "name": "ARG" }]
    },
    {
      "id": "personal",
      "name": "personal",
      "open_task_count": 0,
      "inbox_task_count": 0,
      "visible_task_count": 0,
      "projects": []
    }
  ]
}
```

Each existing ProfileSummary field remains present as today. projects is optional in the general ProfileSummary schema, and always present when requested, including an empty array. Project rows contain exactly id and name. Include defined Projects even when they have no visible Tasks. Do not invent a Project row for Tasks with no Project. Markdown shows a heading with each Profile name and full id, then its Project names and full ids, or `No Projects`. Table mode follows the same membership.

HTTP reuses `GET /profiles?include_projects=true` and returns the profiles array above without the CLI envelope. Omit the query to preserve the existing response. The optional query accepts true or false, and false behaves like omission. Reject unknown query names through the existing strict contract. `todo schema 'profile list'` adds optional projects to each Profile entry and explains the flag. `todo man profile` documents empty Profiles and credential scope.

The directory returns only active authorized Profiles. Sort by Profile name then id using code-unit comparison, and sort each Project array by name then id. Identical names remain distinct by id. The CLI's global --profile chooses a stored credential as today. It never narrows or expands that credential's authorization for directory discovery.

### Explicit read-only lookup

Add `todo lookup --prefix <value>`, with --format md/json/table. Prefix is required. This command is the opt-in to search every authorized Profile. It accepts no title search, other filters, mutation action, or implicit Profile fallback. A globally supplied --profile selects the stored credential, as with profile list. The result set still follows that credential's authorization.

```json
{
  "generated_at": "2026-11-09T15:00:00.000Z",
  "prefix": "45A3",
  "matches": [
    {
      "profile": { "id": "work", "name": "work" },
      "task_id": "45a312ac-1111-4222-8333-444444444444",
      "title": "Review ARG report",
      "project": "ARG"
    }
  ]
}
```

Every row contains all four keys shown within the row. project is a Project name or null. No match returns matches: [] and exit 0. Echo the original validated prefix without changing its case. Markdown and table output include Profile name, full Profile id, full Task id, title, and Project, with `No Project` for null. Each row also prints the exact next command, `todo show <full-id> --profile <profile-id>`, with correct shell quoting. JSON retains exactly the four row keys.

HTTP adds `GET /tasks/lookup?prefix=<value>`. It returns the matches array directly, including [] when empty. Prefix is required and uses the existing TaskFilters prefix schema, 1 through 36 ASCII hexadecimal digits or hyphens without trimming. Matching is literal case-insensitive startsWith. Invalid CLI input exits 2 and names --prefix. Invalid HTTP input returns 400 and the equivalent pair. The route has no selected Profile parameter and accepts no arbitrary Profile list from the caller.

Include visible Tasks in every status, exclude Deleted and Purged Tasks and deleted Profiles. Return every match. Sort by Profile name, Profile id, then full Task id, using code-unit comparison. This is discovery order, not Task search relevance or a planning view. There is no truncation, hidden-result count, or suggestion that a foreign match exists. `todo schema lookup` describes generated_at, prefix and required matches with the literal row shape. `todo man lookup`, the manual index and help document the opt-in and full-id mutation boundary.

Normal `todo list --prefix`, show, History, and mutations remain Profile-scoped. A result supplies information to copy. No command consumes a lookup result to resolve a mutation automatically. Discovery never changes the selected Profile by itself. The explicit Show action described below is a user navigation request.

### Consistent list arrays

`todo list --format json` always emits tasks, including `tasks: []` with no filters or any combination of filters. generated_at, optional filters and TaskView rows keep their current meaning. HTTP list remains an array, including []. No new wrapper is added.

TasksResponse is shared with review and export. Preserve export and review goldens unless the intended list change reaches the same shared behavior. Use a list-specific required-tasks schema and list rendering path to keep export and review goldens byte-identical. Update `todo schema list`, `todo man list`, and intentional list goldens. Do not rewrite export fixtures as a convenience.

## Domain ownership and security

Authentication.profiles in packages/domain/src/auth/auth.ts is the single credential-to-Profile authorization rule. The queries must call it, then use authenticated reads of only those Profiles. No adapter uses store.profiles, a global Task scan, or a client-provided Profile set to implement discovery.

Proposed new domain files are packages/domain/src/discovery.ts for response schemas and read queries, packages/domain/src/exit-status.ts for the exit-code mapping and schema, and packages/domain/src/task-lookup-error.ts for authorized lookup context. Workers must search existing modules first and report final added files. Keep writes in TaskCommands and authentication in Authentication. Do not create a second scope policy.

Directory and lookup read all authorized Profiles and their data inside one SQLite read transaction. Each response reflects one database state. Credential checks belong inside that transaction. Any credential failure fails the entire read without partial results. No query cache, migration, event, or cross-Profile credential store is added. Successful discovery does not mutate Tasks, Projects, Profiles, Versions, or History. Existing authentication bookkeeping and rejected-auth History policy remain in force. If a credential expires, is revoked, or loses its Profile during a multi-Profile read, fail the whole read. Never return partial data plus a foreign identifier in an error. Existing per-Profile SSE authorization stays unchanged. No new all-Profile event stream is added.

Generated properties run against the real Authentication and discovery queries over scratch credentials, Profile sets, Projects and Task sets. A scoped credential's output must equal its authorized projection and remain byte-identical when foreign names, counts or Tasks change. Owner Sessions and valid unscoped Access Tokens see all active Profiles under ADR-0005. Scoped read-only and read-write Tokens both see only their Profile. Invalid, expired, revoked and deleted-Profile credentials return no discovery rows. Check direct foreign HTTP, CLI and SSE access and error text for no names, counts or existence leaks. Demonstrate failure on an isolated authorization-removal mutant and restore before a clean run.

Client ordering needs verification because a late owner response must not appear after sign-out or a credential change. The implementation therefore also needs bounded TLA+ checks for discovery response publication, independent of the generated domain properties. See the proof plan below.

## Client placement and interaction

Both clients get a `Profiles and Projects` read-only dialog or native sheet, reached from their existing Profile navigation. Electron adds the command in the Profile dropdown and Compact Navigate tasks menu. SwiftUI adds it beside the Profile picker in the sidebar and in compact-navigation. Keep full ids selectable. This groups each Profile with its Projects, as suggested by Chunking and Law of Proximity. An empty Profile stays visible with `No Projects` so absence has one meaning.

Both also get `Find Task by id` beside that command. The dialog explains `Search Profiles available to this credential`, has one `Id starts with` field, and a `Find` submit button. Submit explicitly, with Return as the keyboard alternative. Do not debounce or run cross-Profile requests while typing. Cmd+F retains its normal Task search meaning. These choices follow Jakob's Law and reduce the choice burden described by Hick's Law. Ordinary search remains visibly scoped to the current Profile.

Results show title, Profile name and id, Project or No Project, full Task id, Copy task id, and a `Show in <Profile name>` button. They remain read-only. Show is an explicit user navigation request. It closes the dialog, selects that Profile and opens that Task through the existing navigation and draft-protection path. If the current view would hide the Task, switch to All tasks and apply the Id starts with filter using the full id. Open the Task after the current authorized exact-id read succeeds. Report a missing or no-longer-authorized result through the normal contextual error, never silently. Show publishes only from a current authorized applied snapshot. Copy feedback remains accessible and uses the existing clipboard implementation. Opening or reading discovery alone never changes the main view, filters, toolbar text, selected Profile, or saved draft.

The dialogs use the installed shadcn Dialog, Field, Input, Button, Alert, Empty, and Separator components in Electron. SwiftUI uses system sheet, TextField, Button, List, ProgressView and selectable text under design/macos/DESIGN.md. Use existing component variants and semantic colors. No dependency or new registry component is planned.

Compact at 393 by 426 is the first target. Use stacked results in a vertical scroll region, no horizontal table. Keep title, field and primary action reachable. Display full ids on wrapping selectable lines. Keep a visible Close control and return focus to the trigger. A long list scrolls within the sheet. Results and recovery controls must fit without overlaying the footer.

Directory states are Closed, Loading, Showing, Empty, Error and Offline. Lookup states add Editing, Invalid and Requesting. Each request captures credential generation, dialog generation, and submitted prefix for lookup. No response publishes after close, sign-out, credential replacement, or a later submission. Clear rows immediately on an authorization change. Disable duplicate submission while a request is pending, keep typed text on failure, and offer Retry for the exact submitted query. Input edits after a response clear that result and return to Editing. Show uses only the current authorized applied snapshot, then goes through the existing draft/navigation decision before closing the dialog and opening the Task. Cancel preserves the draft and navigation. Close cancels publication. No persistent cache or automatic polling is added. Offline retains no actionable lookup rows and offers Retry after connectivity returns. Existing SSE reconnect does not expand discovery scope or subscribe to other Profiles.

Lookup errors appear beside the failed operation with the Profile context and exit detail. Preserve drafts and existing recovery controls. Empty ordinary lists use today's Add task, Clear filters or Clear search action, according to the current filters. JSON tasks: [] does not create another UI list representation.

The UI hypotheses need observation. The unsigned Electron drive and Swift offscreen render checks must demonstrate discovery from Compact navigation, all metadata and full ids, empty/error/loading/offline states, Copy feedback, focus/keyboard behavior where runnable, explicit Show navigation, completed-Task visibility, draft protection, obsolete-result Show rejection, and no overflow. The coordinator alone reviews UI appearance in both appearances and layouts. The relevant principle sources are [Chunking](https://lawsofux.com/chunking/), [Law of Proximity](https://lawsofux.com/law-of-proximity/), [Jakob's Law](https://lawsofux.com/jakobs-law/), and [Hick's Law](https://lawsofux.com/hicks-law/). Explicit Show reduces the work the user must carry under [Tesler's Law](https://lawsofux.com/teslers-law/) and completes the lookup flow under the [Goal-Gradient Effect](https://lawsofux.com/goal-gradient-effect/). These are design hypotheses, not proof of usability.

Proposed accessibility identifiers are discovery-directory, discovery-directory-list, discovery-directory-retry, discovery-lookup, discovery-prefix, discovery-find, discovery-results, discovery-copy-<task-id>, discovery-show-<task-id>, discovery-error and discovery-close. Existing compact-search and identifier expressions stay intact. Update verification selectors in the same client commits.

## ADR draft and diagrams

The approved ADR number is 0019, at docs/adr/0019-authorized-read-only-discovery.md. This checkout ends at ADR-0015, but feat/task-dag already contains ADR-0016, 0017 and 0018. The coordinator reserved 0019 at the gate to avoid a collision at integration. ADR-0009 receives an additive amendment for the error pair and shared human wording.

The Excalidraw source is docs/diagrams/generate.mjs and the rendering command is docs/diagrams/render.sh. Five proposed frames name current entry points and label proposed helpers and routes explicitly: agent-errors, agent-lookup-errors, agent-directory, agent-prefix, and agent-list. Each has bound transitions, numbered markers and notes. The directory and prefix frames include both clients' request/reset states as well as the authorization boundary. Render artifacts are docs/diagrams/<frame>.png. Local receipts belong under docs/evidence/agent-discovery/phase-0.

## Units and gates

1. Unit A on feat/agent-discovery-a implements exit meanings, Task lookup context, and always-present list tasks. Read verify-cli and verify-server-api first, reproduce the current failures through cached compiled artifacts on scratch data, then write literal failing behavior tests. Update error schemas, intentional goldens, manuals and relevant verification recipes. Keep the renderer signature explicit about the actual exit code. No product code depends on an error-name table.
2. Unit B on feat/agent-discovery-b implements shared authorized directory and lookup queries, HTTP, CLI, schemas, manuals and the new discovery verification skill. It owns generated no-leak properties and compiled CLI/HTTP/SSE proofs. It also regenerates OpenAPI. It does not change the shared error renderer, list output, or client UI. Merge A and B only after both seats pass the same unit SHA, resolving overlaps in integration.
3. Unit C on feat/agent-discovery-c starts after B merges. It implements Electron, extends verify-electron, and proves the unsigned compiled host or headless production renderer. Light/dark, full/Compact captures include every new sheet and empty/error state. It must use the new endpoints and the server's error fields.
4. Unit D on feat/agent-discovery-d starts after B merges. It regenerates the Swift contract, updates GeneratedContractTests, production TodoModel headless tests through reload, offscreen state captures, unsigned xcodebuild and identifiers. All Swift builds, tests and helpers use scripts/swift-slot.sh. No Keychain, app launch or hosted XCTest is authorized.
5. Unit E on feat/agent-discovery-e proves the discovery client request lifecycle with TLA+, maps C and D's final request code, and renews any existing formal source mapping changed by the clients. Begin after the gate, using the approved contract. Use the create-formal-verification-skill workflow, pinned tla2tools and sensitivity controls. It owns proof files only. Final source mapping waits for C and D.

All workers are top-level Sol xhigh T3 threads under order 26, with their own worktrees based on the integration branch. Seat 1 is a fresh read-only Sol max top-level thread per review, including a comment audit. Seat 2 and every UI review belong to the coordinator. Both seats must pass the same SHA before a merge. No push or PR occurs in this run.

The Phase 0 additions receive a local comment audit before the gate. The run's Phase 0 no-worker gate prevents a separate no-comments child before approval. The permitted seat-1 review will include independent comment review, as the prior search run did. Record that procedural limitation instead of silently launching an extra child.

After each integration, pnpm check must exit 0. After SEC fixes reach feat/task-search, base-merge it and re-prove. Final compiled binaries must match the report SHA's source hash and use fresh scratch databases. Stop every server whose PID the run records before reporting.

## Proof plan and limits

Extend verify-cli, verify-server-api, verify-profiles, verify-electron and verify-macos. Add .agents/skills/verify-discovery through create-verification-skill with a relative .claude link. It drives compiled CLI and HTTP, owner and scoped credentials, empty results, Projects without Tasks, duplicate Profile names where possible, prefix case/length/invalid-character boundaries, Task lifecycle visibility, read-only invariants, unchanged exact-id behavior and SSE non-leakage. The scratch fixture and reusable generated inputs stay tracked. Evidence stays ignored.

The discovery TLA+ model reuses TaskSearch.tla's requestedIdentity, generation and applied snapshot vocabulary where those concepts match. It uses two credential scopes, two dialog kinds, two prefixes and up to two outstanding replies. Model Open, Submit, ResponseOK, ResponseError, EditPrefix, Close, SignOut, CredentialChanged, Retry and Show. Assert that published data belongs to the current credential generation and dialog generation, that only the latest submitted identity publishes, that Closed or signed-out states expose no discovery rows, and that Show opens only a current authorized applied result. Model rows as authorized provenance, not titles or Task matching. Show each property failing on a broken guard variant, record complete queues and exact bounds, then rerun clean. This does not prove unbounded requests or the runtime authorization implementation. Generated real-code properties and compiled regressions cover those separately.

Run the compiled CLI, HTTP and Profile recipes and relevant search checks at final integration. Run actual unauthorized SSE probes and inspect their status, bytes and errors. For Swift, regenerate rather than hand-merge OpenAPI output. Run production headless state and contract tests, offscreen renders, check-design-identifiers.py and unsigned xcodebuild, all behind the shared slot. Native app behavior and Keychain remain unproven under HOLD. Those limits do not block the explicitly allowed headless work.

The coordinator marks the five real Tasks done. No worker reads or writes the real ~/.todo-cli, its backups, installed binaries, launchd server, signed apps, or Keychain.

## Phase 0 checks

The five frames rendered with exit 0, with bound endpoints and no out-of-frame elements. JSON examples parse and match the stated row shape. Shell syntax and git diff --check pass. After frozen-lockfile dependency installation, pnpm check exits 0 on the baseline plus these documentation and diagram changes. Receipts are under docs/evidence/agent-discovery/phase-0. The initial check before installation exited 1 because node_modules was absent. Product implementation and native proofs have not started.
