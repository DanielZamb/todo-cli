# Invalid input

## Sub-features

Empty titles, repeated priority or Project, repeated dates for one destination,
invalid dates, out-of-range hours or minutes and unresolved daylight-saving times fail with `QuickAddError`.

## How to get to it (user POV)

Call the parser with conflicting or invalid quick-add text. The HTTP adapter
maps parser failures to status 422 and schema failures to status 400.

## Driving it with the compiled library

Run the helper. It rejects `tomorrow p1`, `Ship tomorrow fri`,
`Meet tomorrow 10:60am`, and New York
`2026-03-08 2:30am` and `2026-11-01 1:30am`, with explicit clocks and zones.

## Gotchas

Unknown words stay in the title. The parser only recognizes the documented
small grammar; it is not an unrestricted natural-language date interpreter.
