# Task search shares one matcher and response spans

Accepted, 2026-11-09.

Task search runs in memory in `packages/domain` over a Profile's Tasks. CLI
`list --text` and HTTP `text` search title and description only. `--prefix`
and HTTP `prefix` narrow by the literal case-insensitive start of the id.
All existing filters combine by AND and keep the view's order. Exact-id reads
and commands retain their current behavior. No relevance ranking is added.

Normalize text with NFKD, remove Unicode marks, apply Unicode default full
non-Turkic case folding, then repeat decomposition and mark removal. The fold
table is pinned to Unicode 17.0.0 with its source URL and SHA-256. Segment words
with `Intl.Segmenter` using `und`. Each positive word matches a word prefix.
Query words below five code points allow no edits, five through eight allow
one, and nine or more allow two. Use unrestricted Damerau-Levenshtein distance,
including adjacent transpositions, against nonempty word prefixes.

ASCII double quotes form a phrase of adjacent whole words in one field, with
no typos. An unclosed phrase permits its final word to prefix-match without
typos. ASCII minus excludes only at the start of a whitespace-delimited term.
Excluded words prefix-match without typos. Excluded phrases use the same phrase
rules. Ignore a lone minus or clauses without words. A hyphen inside a term
separates positive words, so `follow-up` requires both follow and up.

Text accepts up to 200 UTF-16 code units. Supplied blank text applies no
restriction. Prefix accepts 1 through 36 ASCII hex digits or hyphens without
trimming. CLI invalid values exit 2 and name their flag. An empty search result
succeeds with `tasks: []` inside the existing CLI object, or an empty HTTP array.

One matcher evaluation returns acceptance and all positive matched word spans.
Read-only schemas add optional `search_matches` entries with field title or
description and half-open original UTF-16 start/end offsets. Spans cover whole
original graphemes and matched words, including Unicode expansions. They are
sorted, deduplicated and overlap-merged. Exclusions and id prefixes have no
spans. Supplied text returns an array, including `[]` when there are no positive
spans. Absent text omits it. Stored Tasks, events and export defaults do not gain
search metadata. HTTP keeps its array and CLI keeps its object envelope.

Both clients use spans from the same response snapshot as their strings.
Requested identity includes Profile, view, dialog filters and typed text.
Applied identity belongs to the last published response snapshot. Results are
stale exactly when these identities differ. Only the latest issued request
with the current generation and identity may publish. Obsolete successes and
errors publish nothing. Pending search keeps the applied rows and highlights
visible with reduced emphasis and field progress. Search errors retain typed
text, applied results and a Retry action. Dialog errors retain their existing
rollback. [ADR-0015](0015-search-text-retention-and-recovery.md) specifies text
retention across Profile/view resets and recovery through live updates.

Both clients expose toolbar search, Cmd+F focus, Esc clear, a roughly 250 ms
debounce, an Id starts with dialog field, and the full id with Copy in detail.
Description-only matches show a one-line excerpt while text is active. Empty
search results offer Clear search as the single primary action. Compact is the
first verification target. ADR-0009 requires the whole delivery across clients.

We rejected SQLite FTS, stored search metadata, ranking, optimal string alignment,
locale lowercase approximations, and client matchers. They would change the
agreed behavior or split its implementation. Revisit indexing above roughly
10,000 Tasks in a Profile.

## Amendment (2026-11-09): known limits

A security review (KIMI-2) found that a compatibility character which expands to several words joins its last word to the next letter. Two U+FDFA characters with nothing between them, `ﷺﷺ`, normalize to `صلى الله عليه وسلمصلى الله عليه وسلم`. The query `صلى` then matches only the first character, with span `[0, 1)`, and the query `وسلمصلى` matches both, with span `[0, 2)`. With a space between them, `ﷺ ﷺ`, the query `صلى` returns spans `[0, 1)` and `[2, 3)`.

This is accepted behavior. The original text has no word boundary between the two characters: `Intl.Segmenter` treats `ﷺﷺ` as one word, as it treats `ﬁx`. No per-grapheme rule splits `ﷺﷺ` without also splitting `ﬁx`, which must stay one word so that `fix` matches it. Search matches the normalized text as `Intl.Segmenter` segments it. The missing second span follows from that single joined word and is not a separate span defect. Spans stay in range and on whole graphemes.

## Search work budget (owner, 2026-11-09)

The owner chose a visible refusal when search exceeds a deterministic work
budget. `taskSearchWorkLimits` in `packages/domain/src/task-search.ts` defines
both constants. The budget is **5,000,000 units**. A Damerau cell costs **1/10
unit**. Integer counters and the rational weight avoid accumulated rounding.

A request charges the folded UTF-16 length of every searched field, including
whitespace and punctuation. `PreparedField.preparedUnits` is the exact length of
the concatenated folded field. The matcher charges it once after preparation,
whether the field came from a stored PreparedField or from `fieldWords`.
Preparation does not charge the meter. Each computed inner-loop cell of the
banded Damerau evaluator adds one cell. Repeated normalized clauses execute
once, and each distinct folded word is evaluated once per field and clause.

The meter accumulates across Tasks that pass the existing non-text TaskFilters.
It checks at every preparation or evaluation checkpoint and before publication.
A field can finish preparation before its charge exceeds the budget. The current
evaluation chunk can also finish before the next check. The request then stops
with `search_too_broad`, CLI exit 2 or HTTP 422, and the shared error shape.
No partial result is published. Existing raw input limits remain in force.

The recovery message tells the person to narrow with a Project, Tag or Status
filter, use fewer or shorter words, or quote a phrase. Both clients keep the
search text and applied snapshot. This code hides Retry. A current-Profile SSE
operation or reconnection can issue the search again, so shrinking Task content
can recover without Retry. Transient errors retain their existing Retry action.

The owner rejected partial results and an exact-only fallback. Partial results
hide matching Tasks, while a fallback changes typo tolerance. A wall-clock
budget would produce different refusals under different host loads. Search
continues to use the same words, spans and order for accepted requests.

The frozen PERF fixture at `5f5d6526` supplies short, mixed, churn, long and dense
scenarios. Short and mixed use at most 47,042.8 units, over 106 times below the
budget. Churn uses at most 2,025,042.8 units and has over 2.46 times headroom.
With the measured maximum-size fields and title `Expansion probe`, 49 plain
Tasks pass and 50 refuse at 5,000,750 units. Two U+FDFA Tasks pass and three
refuse at 5,400,045 units. The 28-Task plain case passes at 2,800,420 units.

The DP sweep uses ten Tasks, each containing 10,000 distinct nine-character
words `abcdef000` through the first 10,000 base-36 suffixes. Query words come
from the start of that sequence. Ten query words pass. Eleven words, 109 raw
UTF-16 units, first refuse in this sweep after 40,016,835 evaluated cells at
5,001,833.5 work units. This is the minimum within the defined fixture and sweep.

The cell weight comes from five process-CPU runs per calibration input. CPU is
user plus system time. Calibration records the source hash, exact inputs, folded
units, cells, CPU time, wall time and host load. It is not a wall-clock limit.
Single expanding fields remain allowed. The budget does not cap spans. The
owner's separate span-limit question remains open.

| Calibration input | Prepared units | Cells | Median CPU seconds | CPU range, five runs |
| --- | ---: | ---: | ---: | ---: |
| plain-preparation | 1000000 | 0 | 0.432961 | 0.418567 to 0.510938 |
| fdfa-preparation | 1800000 | 0 | 0.40463 | 0.347284 to 0.533234 |
| dp9 | 0 | 3900000 | 0.176266 | 0.1405 to 0.198814 |
| dp200 | 0 | 9940000 | 0.364382 | 0.34307 to 0.394924 |
