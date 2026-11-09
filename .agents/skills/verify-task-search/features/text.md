# Text and highlights

## Sub-features

Accent-insensitive full Unicode folding, unordered word AND, typo-tolerant word
prefixes, exact closed phrases, open phrases, exclusions, and original UTF-16
whole-word spans. Blank text returns empty spans. Absent text omits metadata.

## How to get to it (user POV)

Run `todo list --text 'rent -draft' --format json`, or send HTTP `text` to the
Task List route. `todo man list` explains the syntax and limits.

## Driving it with the compiled CLI and HTTP

Run the parent helper. Literal cases cover reno, cancion in both directions,
pasaprote, pay rent, quoted and open phrases, draft/drafts/drift exclusions,
follow-up, lone minus, description-only and cross-field AND, phrase field
separation, Unicode expansions, combining marks, astral letters, all positive
term edit thresholds, unrestricted Damerau, 200/201 limits and empty success.
Read `compiled/task-search.json` for exact same-response spans.

## Gotchas

Closed phrases cannot cross fields. Exclusions never highlight and allow no
typos. Text limits count UTF-16 code units. Metadata must not enter stored
Tasks, History or exports without an explicit text query.
