# Draft metadata

## Sub-features

`p1` through `p4` set priority, default P3. `#tag` creates sorted, deduplicated,
lowercase Tag names. `@project` selects one Project name. Remaining words form
the title. Quoted tokens remain literal title text.

## How to get to it (user POV)

Enter quick-add text in the library or authenticated HTTP parser request.
Parsing returns a draft; it does not create a Task or metadata definitions.

## Driving it with the compiled library

Run the skill helper. `Ship tomorrow scheduled:fri 10am p1 #Launch #launch @Client`
must return title `Ship`, priority P1, Tags `["launch"]` and Project `Client`.
`Say "tomorrow" "#literal"` keeps both quoted words in the title.

## Gotchas

Use `@"Client Project"` or `@'Client Project'` for a multi-word Project and
`#"deep focus"` for a multi-word Tag. Whole quoted tokens such as `"#821"`
stay literal title text. Unknown tokens remain title text.
