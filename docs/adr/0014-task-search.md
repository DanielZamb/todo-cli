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

The owner chose a visible refusal above a deterministic budget of **5,000,000
work units**. The budget and shared evaluation weight **1/10** live together in
`taskSearchWorkLimits` in `packages/domain/src/task-search.ts`.

`work = preparedUnits + (damerauCells + clauseVisits) / 10`.
The check compares integer tenths exactly:
`preparedUnits * 10 + damerauCells + clauseVisits > budget * 10`.

`PreparedField.preparedUnits` is the UTF-16 length of the complete folded field,
including whitespace and punctuation. The matcher charges each searched field
once after it is ready, whether supplied by preparation or a stored PreparedField.
Preparation never charges a meter. Cells count actual banded inner-loop computations,
once per unique folded-word evaluation. Visits count every field-word occurrence
walked by each word clause, including memo hits, and every phrase start position
tested. Both fields, positive clauses, exclusions and open phrases use that evaluator.
Repeated normalized clauses execute once. Cold, warm and uncached preparation
therefore have identical totals and refusal outcomes.

The meter accumulates over Tasks surviving non-text TaskFilters. Checks run after
each prepared field, at every cooperative checkpoint and before publication.
One field's preparation or the current evaluation chunk can finish before its
charge is checked. Refusal returns the shared `search_too_broad` error, CLI exit 2
or HTTP 422, with no partial publication and no spans in the error response.
All existing raw input limits remain in force. Accepted results retain the same
matching, typo tolerance, UTF-16 spans and order.

Recovery text tells the person to narrow with a Project, Tag or Status filter,
use fewer or shorter words, or quote a phrase. Both clients keep typed text and
the applied snapshot, show that text in the existing neutral search error, and
hide Retry for this deterministic refusal. Current-Profile SSE changes or
reconnection still rerun the query, allowing recovery after a description shrinks.
Transient errors retain Retry. The owner rejected partial results and exact-only
fallback because they change membership or typo tolerance. A wall-clock budget
would refuse differently under different host loads.

The literal verification corpus reaches at most **19,517 units** (256× headroom).
All five frozen PERF queries on short and mixed reach at most **47,742.8 units**
(104.7×). Churn's realistic queries use 2,103,580 for `rent cafe` (2.377×),
2,063,180 for `pay rent invoice` (2.423×), and 2,077,805.2 for
`marker17 rent` (2.406×). The frozen fixture and seed are preserved unchanged
from `5f5d6526` in the Task-search verification skill.

With title `Expansion probe`, **49** maximum-size plain Tasks pass at
4,972,020.2 units and **50 first refuse** at 5,072,035.2. The 28-Task case passes
at 2,841,154.4. For `probe`, two maximum-size U+FDFA Tasks pass at 3,660,035.6
and **three first refuse** at 5,460,050.6. The zero-typo four-letter query uses
3,660,030.6 and 5,460,045.6 respectively. These counts include titles and work already accumulated
before the refusing field is charged.

The DP sweep fixes ten Tasks, each with 10,000 distinct nine-character words
`abcdef000` through 10,000 base-36 suffixes, separated by spaces. Query words
come from the beginning of that sequence. Ten terms pass at 4,999,900 units.
**Eleven terms** (109 raw UTF-16 units) first refuse within this defined sweep,
after **39,017,241 cells** and **1,000,714 visits**, at **5,001,945.5 units**.
This is a fixture-specific first refusal, not a global minimum across all corpora.

For many distinct clauses, descriptions cycle the 40 one-character tokens
`[a-z, 0-9, α, β, γ, δ]` with spaces to 100,000 units. On 45 Tasks,
`a b` passes at 4,950,693 units; **three clauses first refuse** at 5,045,685.8.
Individually quoted clauses have the same first refusal. On five Tasks, no refusal
is possible within this one-character sweep's raw limit: 100 distinct unquoted
clauses (199 units) pass at 3,000,175, and 50 separately quoted clauses (199 units)
pass at 1,750,125. The extended cycle uses distinct folded one-character tokens.

### Calibration

Five runs per input measure process user plus system CPU, never wall-time limits.
Plain preparation costs 354–459 ns per folded unit. DP costs 26–47 ns per cell;
negative word visits cost 9–17 ns and negative phrase visits 24–30 ns. A shared
1/10 evaluation weight is conservative for those visit measurements and near the
cell-to-preparation cost ratio. Stored preparation isolates visits from folding;
its prepared units are still charged identically. Positive span collection, sorting
and response encoding also cost CPU and are not separate meter units.

| Input | Prepared units | Cells | Visits | CPU seconds, five runs |
| --- | ---: | ---: | ---: | --- |
| plain-preparation | 1000000 | 0 | 0 | 0.353581, 0.373458, 0.381797, 0.424255, 0.459216 |
| fdfa-preparation | 1800000 | 0 | 0 | 0.328605, 0.402539, 0.460606, 0.396463, 0.368871 |
| dp9 | 0 | 3900000 | 0 | 0.166454, 0.183040, 0.137075, 0.136307, 0.142194 |
| dp200 | 0 | 9940000 | 0 | 0.328850, 0.310215, 0.286460, 0.266293, 0.262001 |
| word-visits | 10000000 | 0 | 5000000 | 0.085531, 0.052611, 0.051836, 0.046106, 0.054840 |
| phrase-visits | 10000000 | 0 | 5000000 | 0.150719, 0.119711, 0.122894, 0.119607, 0.120050 |

Inputs: plain preparation folds ten fields of `"rent café ".repeat(10000)`;
FDFA preparation folds one field of `"\ufdfa".repeat(100000)`. DP9 evaluates
`abcdeabcd` against `abcdeabzd` 100,000 times with budget 2; DP200 evaluates
`"abcde".repeat(40)` against the same string with its penultimate character
replaced by `z`, 10,000 times. Visit runs evaluate `-absent` or `-"absent"`
100 times against a stored 50,000-word field `"a ".repeat(50000)`.
Calibration source SHA-256 is
`1a82bab698508fe98c1d7de11fddbaf910454d69c3f6534e45e8b0ce9203c23c`.

### Compiled fixture measurements

Each row has five attack requests interleaved with five ordinary requests on
fresh scratch data. CPU is server process user+system time from cumulative
`ps time` (0.01-second resolution). Wall time covers the complete response and
health sampling. CPU and wall show median [range]; load is the range of one-minute
host load. These are measurements under changing host load, not absolute speedup
claims. The production meter build is `b9eac576`; subsequent compatibility and
client changes preserve these matcher bytes. Pass means HTTP 200 / CLI 0;
refusal means `search_too_broad`, HTTP 422 / CLI 2. All compiled literal output
checks and process exits pass. The corpus row is a work-only behavior measurement.

| Fixture / query | Work units | CPU seconds | Wall seconds | 1-minute load | Outcome | Health max ms |
| --- | ---: | --- | --- | --- | --- | ---: |
| literal corpus maximum | 19517 | — | — | — | pass | — |
| short | 44480 | 0.07 [0.05–0.10] | 0.050 [0.047–0.054] | 6.21–6.21 | pass | 6.3 |
| mixed | 44480 | 0.09 [0.07–0.16] | 0.109 [0.060–0.143] | 6.51–6.79 | pass | 16.7 |
| churn-rent | 2063180 | 0.87 [0.78–0.97] | 0.729 [0.716–0.955] | 6.74–6.92 | pass | 76.9 |
| churn-phrase | 2063180 | 0.93 [0.78–0.98] | 0.774 [0.702–0.821] | 6.29–6.40 | pass | 120.3 |
| churn-words | 2103580 | 1.08 [0.98–1.31] | 1.092 [0.900–1.483] | 6.10–6.49 | pass | 199.1 |
| churn-three | 2063180 | 0.75 [0.64–0.86] | 0.740 [0.570–0.779] | 6.15–7.10 | pass | 38.0 |
| churn-marker | 2077805.2 | 0.83 [0.73–0.84] | 0.758 [0.687–0.803] | 7.38–7.50 | pass | 26.8 |
| long | 102009.2 | 0.07 [0.06–0.11] | 0.054 [0.053–0.073] | 7.11–7.11 | pass | 5.7 |
| dense | 105008.9 | 0.11 [0.08–0.17] | 0.072 [0.067–0.088] | 7.11–7.11 | pass | 22.2 |
| ds1 | 101469.8 | 0.06 [0.05–0.07] | 0.050 [0.047–0.051] | 6.94–6.94 | pass | 1.7 |
| ds2-28 | 2841154.4 | 1.35 [1.22–1.46] | 1.033 [0.954–1.091] | 6.86–6.94 | pass | 10.5 |
| ds2-49 | 4972020.2 | 2.26 [1.98–2.59] | 1.692 [1.461–2.193] | 6.96–7.96 | pass | 13.5 |
| ds2-50 | 5072035.2 | 2.52 [2.37–2.84] | 2.093 [1.805–2.350] | 8.13–8.44 | refuse | 22.9 |
| plain-1000 | 5072035.2 | 2.69 [2.51–2.84] | 2.344 [2.090–2.596] | 7.64–7.85 | refuse | 501.5 |
| ds3 | 1830015.3 | 0.65 [0.51–0.73] | 0.408 [0.394–0.511] | 7.69–7.83 | pass | 70.7 |
| ds4 | 105015.2 | 0.11 [0.10–0.19] | 0.080 [0.068–0.137] | 7.23–7.23 | pass | 22.8 |
| v1 | 265474.7 | 0.13 [0.09–0.14] | 0.096 [0.071–0.121] | 7.23–7.23 | pass | 4.9 |
| v2 | 410967.6 | 0.23 [0.18–0.38] | 0.151 [0.137–0.174] | 7.23–7.45 | pass | 14.2 |
| v3-four | 1830015.3 | 0.52 [0.48–0.59] | 0.337 [0.294–0.383] | 7.42–7.45 | pass | 44.9 |
| v3-probe | 1830017.8 | 0.45 [0.39–0.53] | 0.343 [0.309–0.471] | 7.30–7.42 | pass | 18.9 |
| v3-three | 5460050.6 | 1.21 [1.18–1.30] | 0.791 [0.778–0.815] | 7.30–7.60 | refuse | 8.1 |
| dp10 | 4999900 | 2.43 [2.28–2.64] | 2.283 [2.050–2.396] | 7.53–7.67 | pass | 42.3 |
| dp11 | 5001945.5 | 2.36 [2.14–2.39] | 2.125 [1.999–2.278] | 7.04–7.22 | refuse | 28.0 |
| k1 | 2044506.3 | 0.57 [0.50–0.66] | 0.378 [0.367–0.447] | 6.94–7.02 | pass | 8.4 |
| k2 | 2058670.6 | 0.59 [0.48–0.64] | 0.396 [0.359–0.457] | 6.94–8.79 | pass | 10.0 |
| k3 | 2164506.3 | 0.64 [0.59–0.79] | 0.456 [0.437–0.554] | 10.25–10.25 | pass | 31.8 |
| glm1-word | 5098599.8 | 2.27 [1.88–2.59] | 1.823 [1.510–1.987] | 9.46–9.91 | refuse | 15.2 |
| glm1-repeat | 5098599.8 | 2.08 [2.00–2.46] | 1.740 [1.649–2.031] | 9.34–9.74 | refuse | 32.0 |
| many45-two | 4950693 | 3.03 [2.77–3.81] | 2.475 [2.162–3.064] | 9.22–9.72 | pass | 83.7 |
| many45-three | 5045685.8 | 2.60 [2.51–2.95] | 2.009 [1.870–2.596] | 8.49–9.25 | refuse | 26.5 |
| many45-forty | 5000046.2 | 1.96 [1.65–2.30] | 1.527 [1.381–1.883] | 9.25–9.28 | refuse | 19.4 |
| many45-phrase | 5000046.2 | 3.66 [3.30–4.43] | 3.338 [3.097–4.370] | 8.48–8.91 | refuse | 40.1 |
| many5-max | 3000175 | 0.75 [0.70–0.86] | 0.595 [0.579–0.614] | 4.89–5.23 | pass | 72.2 |
| many5-phrases | 1750125 | 0.61 [0.61–0.74] | 0.494 [0.489–0.509] | 4.58–4.89 | pass | 71.2 |
| original | 19517 | 0.01 [0.00–0.01] | 0.024 [0.024–0.026] | 4.58–4.58 | pass | 1.3 |

V1 uses 33 distinct five-letter words (197 raw units) with a matching one-typo
variant for every clause and short non-prefix filler. V2 uses distinct compatibility
characters including FDFA, FDFB and squared words at the raw limit. V3/DS-3 uses
100,000 FDFA characters: 1,800,000 folded description units and 300,001 words.
V3-four uses the four-letter `عليه`; V3-probe matches the title. DS-4 uses
50,000 `"a "` occurrences and retains all 50,000 literal spans. K1–K3 preserve
the separate Kimi fixture's 140 Tasks and queries (one 200-unit word, twenty
typo-budget terms, and 200 FDFA). GLM-1 preserves 100 Tasks with
`"xyza ".repeat(20000)`; both queries (`xyza` and 33 repeated terms) refuse
with a read-only token and carry no spans. Original FDFA query200/description1000
still returns exactly `[{field:"description",start:0,end:1000}]`.

Separate compiled diagnostic meter runs split preparation from evaluation. These
CPU samples exclude HTTP read/encoding and run separately from the five pairs.
Expanded word counts describe the first three Tasks (identical-task fixtures have
one repeated count). No wall-time threshold is part of an ordinary behavior test.

| Fixture | Unique execution clauses | Description words (first Tasks) | Prep CPU s | Eval CPU s |
| --- | ---: | --- | ---: | ---: |
| short | 1 | 4, 4, 4 | 0.0402 | 0.0149 |
| mixed | 1 | 4, 4, 4 | 0.0493 | 0.0193 |
| churn-rent | 1 | 401, 401, 401 | 0.6833 | 0.0637 |
| churn-phrase | 1 | 401, 401, 401 | 0.6897 | 0.0668 |
| churn-words | 2 | 401, 401, 401 | 0.9189 | 0.1183 |
| churn-three | 3 | 401, 401, 401 | 0.6571 | 0.0540 |
| churn-marker | 2 | 401, 401, 401 | 0.8155 | 0.0677 |
| long | 1 | 19999 | 0.0786 | 0.0199 |
| dense | 1 | 49996 | 0.0865 | 0.0334 |
| ds1 | 1 | 14546 | 0.0764 | 0.0073 |
| ds2-28 | 1 | 14546, 14546, 14546 | 1.6105 | 0.0977 |
| ds2-49 | 1 | 14546, 14546, 14546 | 2.3820 | 0.0977 |
| ds2-50 | 1 | 14546, 14546, 14546 | 2.3912 | 0.1154 |
| plain-1000 | 1 | 14546, 14546, 14546 | 1.5359 | 0.1173 |
| ds3 | 1 | 300001 | 0.4567 | 0.0784 |
| ds4 | 1 | 50000 | 0.0702 | 0.0286 |
| v1 | 33 | 49934 | 0.0796 | 0.0872 |
| v2 | 143 | 21736 | 0.1372 | 0.1394 |
| v3-four | 1 | 300001 | 0.3766 | 0.0507 |
| v3-probe | 1 | 300001 | 0.5524 | 0.0344 |
| v3-three | 1 | 300001, 300001, 300001 | 0.9771 | 0.0563 |
| dp10 | 10 | 10000, 10000, 10000 | 0.3913 | 1.6887 |
| dp11 | 11 | 10000, 10000, 10000 | 0.4292 | 1.8397 |
| k1 | 1 | 300001, 11001, 1 | 0.4867 | 0.0826 |
| k2 | 20 | 300001, 11001, 1 | 0.6368 | 0.0941 |
| k3 | 5 | 300001, 11001, 1 | 0.5351 | 0.2446 |
| glm1-word | 1 | 20000, 20000, 20000 | 1.6607 | 0.1931 |
| glm1-repeat | 1 | 20000, 20000, 20000 | 1.8649 | 0.1640 |
| many45-two | 2 | 50000, 50000, 50000 | 2.9776 | 0.3994 |
| many45-three | 3 | 50000, 50000, 50000 | 2.2903 | 0.2600 |
| many45-forty | 40 | 50000, 50000, 50000 | 0.7945 | 0.9559 |
| many45-phrase | 40 | 50000, 50000, 50000 | 0.8165 | 1.7217 |
| many5-max | 100 | 50000, 50000, 50000 | 0.2798 | 0.4234 |
| many5-phrases | 50 | 50000, 50000, 50000 | 0.1930 | 0.3320 |
| original | 5 | 3001 | 0.0048 | 0.0102 |

### Residual read and output costs

Residual R-READ: eager whole-Profile read/serialization blocks /health on very
large Profiles (pre-existing, also without text); tracked as own-work Task
`a2f2fa5c` (P1). The plain-1000 matrix observed a **501.5 ms** text outlier once
under load; five interleaved controls did not reproduce it, and its cause is not
determined. No 250 ms gate is claimed for that fixture.

| Same 1,000 × 100k fixture, five runs | Health range ms | CPU range s |
| --- | ---: | ---: |
| (a) b9 no text | 84.8–221.4 | 0.18–0.39 |
| (b) c11 baseline no text | 93.4–301.6 | 0.16–0.42 |
| (c) b9 refused text | 127.6–208.8 | 1.74–2.02 |

No-text bodies are byte-identical across builds and runs: 100,417,001 bytes.
Separate tagged diagnostic runs measure auth.read at 54–81 ms, cooperative text
prep/eval at 751–916 ms, and refusal serialization at 0.003–0.007 ms. The source
loads/decodes the complete view synchronously before matcher yields. This PR adds
no Profile-read bound, streaming or serialization change. Instrumentation is
separate from the unmodified control timings. All owned servers exit and all
scratch databases are removed.

The span-cap owner question (O5) remains open. The meter does not truncate spans
or cap response bytes. Accepted dense results can still incur synchronous output
cost. Earlier Phase 1 V3 measurements include a raw-Node314 ms outlier and a curl
max467 ms on the loaded host; those records remain evidence and are not recast as
passing the 250 ms gate. The final V3 rows above are separate five-pair runs.
