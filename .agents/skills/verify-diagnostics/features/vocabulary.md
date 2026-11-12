# Shared interaction vocabulary

## Sub-features

Version 1 metadata-only events, branded UUID v4 joins, category/subtype registry,
unknown records and capabilities, and frozen-run nearest-rank summaries.

## How to get to it (user POV)

Run `todo schema 'diagnostics event' --format json` or
`todo schema 'diagnostics observation' --format json`. These are published input
schemas for client adapters, without a new HTTP ingestion route.

## Driving it with the compiled CLI

Run `bun apps/server/scripts/scratch-diagnostics.ts build`, then
`bun .agents/skills/verify-diagnostics/scripts/verify-vocabulary.ts <absolute-evidence-directory>`.
The helper uses the cached compiled CLI with a scratch HOME and asserts the
published schemas, 38 inventory categories, literal quantiles and incomplete
start denominators. It also requires the exact refresh-trigger enum from the
compiled `diagnostics event` schema, including dayChange, clockChange, wake and
activation. clockChange includes a time-zone change. The shared
diagnosticRefreshTriggerLabels export supplies plain display words for all 15
causes. Evidence survives cleanup and no server is started.
Run `pnpm --filter @todo/domain test client-diagnostics.test.ts` for every event,
forbidden content, invalid joins, outcome and mode isolation.

## Gotchas

Mac UUIDs map directly to the branded recording ids. Preserve event names and
map applied to completed. Cursor and entity ids never enter these records.
Unknown stages stay unknown. Completed-only p99 never replaces deadline counts.
Do not call a sparse sample or incomplete run a target pass. No persistent
journal or ingestion is implemented here.
