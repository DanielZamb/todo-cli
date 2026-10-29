# S01 HTTP API decisions

The transport contract is `@todo/api`'s Effect HttpApi. Runtime routes, the
Electron typed client and the emitted OpenAPI document share it. Effect 4.0.6
ships HttpApi in `effect/http-api`; `@effect/platform-bun` 4.0.6 supplies the server.

C02 and C04 expose resolved-event operations plus authenticated recurrence
commands. S01 needs task commands for ordinary create, edit, reopen and Delete.
`TaskCommands` therefore lives in `@todo/domain/store`, with browser-safe command
schemas in `@todo/domain`. The HTTP handler maps requests and statuses only.
The additive store export changes no migration, auth storage or event format.
Upstream rejection accepts an optional `from_version` so rejected command History
retains the attempted Version alongside the command input.
Every write checks authorization and mutates inside `store.auth.mutate`'s single
immediate transaction. Complete/cancel call the existing recurrence resolver
inside that transaction. The command returns the accepted Task or rejected
latest Task before the transaction closes.

Routes use explicit Profile IDs. Access Tokens do not infer a Profile from the
Task. Version is an explicit `from_version` on patch/transition and a required
query parameter on DELETE, where it works across HTTP clients without a DELETE
body. A conflict returns HTTP 409 and the latest Task. Deleted Tasks return 404
from show and disappear from list, while Delete itself returns the tombstone.

Owner and Profile provisioning stay with trusted local domain consumers.
S01 exposes sign-in and Session-owned Token management, but no unauthenticated
setup endpoint. Its verification seed compiles separately and accepts only a
fresh temporary scratch directory. The production server requires `TODO_DB`
and binds `127.0.0.1` unconditionally. Port 0 makes independent test instances
possible without sharing state or ports.

The local compiled HTTP drive is evidence for the worker's artifact. The track
owner owns integration and the L3 claim. Correctness review remains with the
coordinator. Only the mandated no-comments child was launched by this worker.
