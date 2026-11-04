# Edit several Tasks

## Sub-features

`batch-edit` updates one shared field on explicitly selected Tasks. Each selection
contains its own `task_id` and expected `from_version`. Preview preserves Task
Versions, History and metadata definitions. Apply commits matching Tasks and
returns a separate Conflict for every stale Version. A missing Task returns a
`not_found` row without stopping later selections.

## How to get to it (user POV)

Read `todo schema batch-edit-input`, then save a request such as:

```json
{
  "items": [
    { "task_id": "first", "from_version": 2 },
    { "task_id": "second", "from_version": 7 }
  ],
  "changes": { "priority": "P1" }
}
```

Run `todo batch-edit changes.json --dry-run --format json`, then run the same
command without `--dry-run`. `-` reads the request from stdin. `changes` requires
exactly one of title, description, priority, project_name, tag_names, due_at,
scheduled_at, energy or estimate_min. Dates use the existing Task time schema.
Read `todo schema batch-edit` for the report. Reports carry `generated_at`,
`dry_run`, `items` and `totals`. Rejected rows carry the shared error fields and
`details.current_version`. Preview reports the current Version without advancing
it. Apply reports the accepted new Version.

## Driving it with the compiled CLI harness

Run from the checkout root with a fresh absolute evidence directory:

```sh
.agents/skills/verify-cli/scripts/verify-batch-edit.sh "$PWD/docs/evidence/cli02/cli-new"
```

The helper caches compiled CLI, server and seed binaries in `.scratch/bin/` by
source hash and build commit, then runs the existing full compiled CLI skill.
`batch-edit.test.ts` checks preview, partial apply, stale preview, missing ids,
invalid fields, duplicate selection, unchanged unrelated Tasks, Conflict reload
and retry. `contract.test.ts` validates the response against the published schema
and checks JSON usage errors. The existing goldens remain byte-identical.
`batch-edit-actions.json` records process exit codes and stdout. `build.json`
records the source hash, build commit and reused binaries. Each test uses a fresh
scratch HOME and database, which it removes after retaining evidence.

`pnpm --filter @todo/domain test` also drives all nine shared fields, metadata
preview isolation and read-only Token refusal through the shared Task commands.

## Gotchas

A partial Conflict exits 4 after writing one complete JSON report. Missing Tasks
exit 3; other rejected rows exit 2. Usage errors use the shared JSON error.
Reload a stale Task before choosing its new Version. Preview does not authorize
an overwrite if another client changes the Task before Apply. An accepted edit
advances the Version even when the shared value already equals the saved value,
matching the existing single-Task edit command.
