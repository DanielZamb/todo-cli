# Task search design gate

Status: proposed, awaiting coordinator APPROVE. No product code has been written.
Base: `dcdfac029fafa465fcde57c38f91c8cd0cd89119`, branch `feat/task-search`.
Run started 2026-11-09 01:17 UTC. Ten-hour deadline 2026-11-09 11:17 UTC.

## Shared matcher

`packages/domain/src/task-search.ts` owns query parsing, matching, and original-text spans. A small `packages/domain/src/task-search-case-fold.ts` may hold a generated, pinned Unicode default full case-fold table with its source/version/hash recorded. No runtime dependency, FTS, persistence change, or client matcher is needed. The implementation worker must inspect existing normalization before adding either file.

Normalize with Unicode NFKD, remove all Unicode Mark code points, apply default non-Turkic full case folding, then NFKD and mark removal again so normalization is idempotent. Do not substitute locale-specific lowercase or an upper/lower approximation. Segment normalized text with `Intl.Segmenter("und", { granularity: "word" })`, retaining `isWordLike` segments. Track original grapheme ranges through normalization to return UTF-16 spans even for combining marks, ligatures, expansions, and astral characters. Title and description remain separate fields.

The query parser recognizes ASCII double quotes and a leading ASCII minus on a clause. Outside quotes, word-like segments are separate AND terms. Every positive term must match some word in either field. Reusing one Task word for multiple terms is allowed. An excluded word uses the same matching rule and rejects the Task if it matches in either field. Excluded terms never highlight. A leading minus before a quoted clause excludes that phrase. A dangling minus or clause without word-like content is ignored. An unmatched opening quote extends to end of input, so typing a phrase does not create a validation error.

For a normalized query word of length n Unicode code points, k is 0 below 5, 1 from 5 through 8, and 2 from 9. A Task word matches if its nonempty prefix has unrestricted Damerau-Levenshtein distance at most k from the query word. Insertions, deletions, substitutions, and adjacent transpositions each cost one. It is sufficient to consider prefix lengths between max(1, n-k) and n+k. No substring match, ranking, or client-side approximation. Unit tests must distinguish unrestricted Damerau from optimal string alignment.

A quoted clause matches only an adjacent sequence of whole normalized words in one field, in order, exactly, with no typo allowance or word-prefix shortening. Punctuation and whitespace delimit words. A phrase does not cross title/description. This makes `"pay rent"` stricter than unquoted `pay rent` and allows ordinary punctuation between consecutive words. Search with no effective clauses is no filter.

Prefix accepts 1 through 36 ASCII hex digits or hyphens, case-insensitive, without trimming. It is the literal case-insensitive startsWith predicate on the full id. Text is capped at 200 UTF-16 code units, consistent with string input limits. Both schemas enforce limits at the boundary; CLI validation errors name `--text` or `--prefix` and exit 2. No match exits 0. All existing filters combine by AND and keep the view's order. Mutations and exact-id reads remain unchanged.

## Response contract

Add response-only per-Task metadata:

```json
{
  "search_matches": [
    { "field": "title", "start": 0, "end": 7 },
    { "field": "description", "start": 12, "end": 21 }
  ]
}
```

`field` is `title` or `description`. `start` is inclusive and `end` exclusive, both UTF-16 offsets into the original, unmodified field. Highlight whole matching words for prefix/typo matches, and the constituent words of every matching positive phrase. Include every successful occurrence, sort title before description then start/end, deduplicate, and merge overlapping spans within a field. Never return invalid, zero-width, negative-term, or id-prefix spans. A supplied `text`, including blank text or exclusions only, returns `search_matches: []` when no positive spans exist. Omit the field when `text` is absent.

Use an additive read-result schema built from Task fields rather than adding response metadata to stored Tasks or events. `TaskViewSchema` and `todo schema list` expose the same optional metadata for CLI JSON. Keep HTTP's existing array response and CLI's generated_at/filters/tasks envelope. The generated operation `tasks_period_list` is the existing `tasks.list` route, not another route. Planning membership and order stay authoritative; clients use the filtered Task results and their spans for the view they already display. No new command or planning route is proposed.

The matcher returns acceptance and spans in one evaluation. `filterTaskRecords` composes that result with other filters, and read adapters carry metadata to output without rematching. Clients apply spans only to strings from the same response snapshot. A description-only match must be visible in a concise description excerpt and in the detail, including in Compact mode, so a matching Task does not appear unexplained.

## Client states

Extend the existing `refreshGeneration` guards, `activeQuery` in Electron, and `generation`/Profile/view/filter equality checks in TodoModel. Search text is a requested filter, separate from the last successfully applied filter state.

Input changes invalidate in-flight responses immediately, before the 250 ms debounce. Pending rows for a different text are hidden while applied data stays in memory. A response may publish only if its generation and full Profile/view/filter/text identity are current. This also applies to errors, SSE refreshes, clear, Profile switches and view switches. A failed application restores the last applied filters and search field together before showing their retained rows and the existing previous-filters error. This preserves the strict invariant that a visible list never belongs to an older query than the field. Empty results offer Clear search. Existing grouping and counts retain their meanings.

Both always-visible fields use familiar native search behavior, Cmd+F focus, Esc clear and the same server text filter. Electron uses the installed shadcn Input. SwiftUI keeps `.searchable` and `compact-search` and removes its local title-only predicate. The dialog adds `Id starts with`/`filter-prefix`, validates inline, and composes Apply with current toolbar text. Cancel keeps the applied dialog filters; Clear all in the dialog clears dialog fields while toolbar search remains available. Task detail shows full selectable monospace id and Copy task id with success/error feedback. Copy uses validated IPC in Electron and NSPasteboard in SwiftUI and never changes Task Version.

The UX choices use familiar search controls and visible state feedback from the required Laws of UX decision guide. UI implementation/review uses only Laws of UX and shadcn, plus the macOS design specification. The coordinator owns visual approval.

## Units and reviews

1. Domain/CLI/HTTP worker, after approval. Implement matcher and span schemas, TaskFilters and input limits, flags and validation messages, list rendering, shared API response, OpenAPI, manual/help/schema, a new ADR, CONTEXT Task search/Energy/Estimate, and architecture. Extend verify-filters and add the matcher verification skill via create-verification-skill. Run L1 plus L3 verify-filters, verify-cli and verify-server-api from cached compiled binaries on fresh scratch databases. Preserve goldens. Explicit domain additions must be named in the report.
2. Formal worker in parallel with unit 1. Follow create-formal-verification-skill. Start with the approved matcher and client-state contract, then map the final code after the client units land. No product edits. Deliver reproducible checks and sensitivity receipts, skill, relative Claude symlink, coverage record and bounds.
3. Electron worker after unit 1 passes both seats and merges. Toolbar search, dialog prefix, span rendering, detail id/Copy, immediate invalidation and response guards. Extend verify-electron and relevant selectors. Prove compiled unsigned host with fresh scratch HTTP and CLI, Compact first, light/dark full/Compact and new empty/error/dialog states. Native signing, Keychain and installed app remain held.
4. SwiftUI worker in parallel with Electron after unit 1 merges. Regenerate API, update contract tests, production TodoModel state tests through reload, offscreen light/dark full/Compact captures for all new states, unsigned xcodebuild, design identifier check and verify-macos update. Use the shared Swift slot for every build/test/verify command.

Workers use delegate_task, Codex gpt-6.1-sol xhigh, isolated worktrees from the committed integration tip, with standing.md verbatim and the complete BEHAVIOR brief. Each unit gets one read-only seat-1 Codex max review, then coordinator seat 2. Only merge after both pass, then run pnpm check and record its actual exit. No push or PR. Run post-implementation-review over the whole branch, fix findings, then final L3 at the report SHA.

## Formal target and acceptance

TLA+ default target is visible-result freshness. Model input change, debounce expiry, request launch, success/failure, clear, dialog Apply, Profile/view switch and SSE refresh. Track current identity/generation, pending requests, applied identity/data, visible identity, loading/error state and failure rollback. Every displayed row set belongs to the current field and selection. Obsolete success or error cannot publish. Begin with two profiles, two views, three text identities, two filter identities and at most three requests; record exact finite bounds/state counts and complete queue exhaustion. No timing, Unicode, Swift runtime or network-liveness proof is claimed.

Generated-input checks import the real matcher: normalization idempotence; adding a positive unquoted word never increases membership; a quoted phrase matches no more Tasks than its unquoted words; prefix equals a case-insensitive startsWith reference; returned spans are ordered, in range, and on original grapheme boundaries. Record seed, corpus and exhaustive/random bounds. Show each invariant fail on a scratch break of its covered code/model, restore byte-for-byte, and re-run clean. A hash mismatch or compiler error is not sensitivity proof. The final formal mapping must name both clients' actual request code and be reviewed after their merges.

Literal acceptance cases include reno/Renovar el pasaporte, rejection of ovar, bidirectional cancion/Canción, pasaprote/pasaporte, unordered pay rent, exact quoted pay rent, rent -draft, uppercase 6AA2, zz rejection naming --prefix, blank/no-match success, AND with every old filter, 200/201 and 36/37 boundaries, description-only and cross-field AND, phrase field separation, Unicode expansion/astral/combining spans, query-word lengths 4/5/8/9, and delayed-response ordering in both clients.

## Phase 0 evidence and limitations

Workflow source is docs/diagrams/generate.mjs and docs/diagrams/render.sh. The frames search-cli, search-http, search-electron, search-swift and search-copy are proposed transitions, with real current entry point names and explicitly proposed matcher/metadata names. Render receipts and layout checks go under ignored docs/evidence/task-search/phase-0.

No product code or database access occurs before APPROVE. The no-comments skill requests a separate configured research child, but this run permits only implementation/test workers and one seat-1 reviewer per unit. Follow the run's narrower delegation limit. Inspect Phase 0 additions locally for code comments, and include the comments audit in each permitted seat-1 review rather than launching another child. This procedural limit remains visible in the report.
