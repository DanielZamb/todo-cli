# Contract and listener

## Sub-features

Loopback-only binding, health and the shared emitted OpenAPI document.

## How to get to it (user POV)

Read `/health` and `/openapi.json` on the port printed by the server. `pnpm --filter @todo/api openapi` writes `packages/api/openapi.json`.

## Driving it with curl

The helper checks literal health identity and `lsof` output for its child PID. The runtime contract must equal the emitted file and declare 409 on patch. Contract tests compare the complete runtime document with `OpenApi.fromApi(TodoApi)`.

## Gotchas

TODO_PORT=0 requests an isolated ephemeral port. TODO_DB is required. There is no hostname override. Dependencies use Effect 4 HttpApi from `effect/http-api` and Bun platform 4.0.6.
