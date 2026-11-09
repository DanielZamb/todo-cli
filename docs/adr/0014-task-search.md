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
