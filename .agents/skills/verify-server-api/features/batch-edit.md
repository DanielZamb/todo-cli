# Edit several Tasks

## Sub-features

`POST /profiles/:profile/batch-edit` accepts the same BatchEditRequest used by
the CLI. It returns the complete BatchEditReport with HTTP 200 for independent
per-Task results, including a partial Conflict. Existing authentication and
Profile scope checks apply. Malformed selections or shared changes return 400.

## How to get to it (user POV)

Electron and SwiftUI open Edit Tasks… and send the selected Task ids with their
loaded Versions. Preview sets `dry_run: true`; Apply uses the same selection and
shared change with `dry_run: false`. Reload reads current Tasks before retrying.

## Driving it with the compiled server

Run `pnpm --filter @todo/server test` for literal HTTP contract assertions.
`batch edit HTTP preserves dry-run and returns independent stale-Version rows`
checks unchanged History after preview, a matching and stale pair, durable stale
content, malformed input and missing authentication on a scratch database.

The compiled [Electron batch drive](../../verify-electron/features/batch-edit.md)
exercises the generated TypeScript client, this endpoint and durable CLI reads.
The [SwiftUI drive](../../verify-macos/features/batch-edit.md) exercises the
regenerated Swift client and production TodoModel through the same compiled
server. Both use fresh scratch databases and stop their owned server before
returning. Run `bun packages/api/scripts/openapi.ts --check` to reject contract
drift after regenerating OpenAPI and Swift sources.

## Gotchas

HTTP 200 describes the complete batch report. Inspect each row's outcome and
error rather than treating the status alone as success. Conflicts include the
current Version. A missing or deleted Task cannot be edited, and an unrelated
Profile's Task is never exposed in the row.
