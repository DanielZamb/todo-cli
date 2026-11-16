# Recorder failure isolation

The single synchronous guard is in packages/domain/src/diagnostic-guard.ts. It
has no imports. Browser adapters import observeDiagnostic and
diagnosticFailureCounts from `@todo/domain/diagnostic-guard`; both are also
re-exported through `@todo/domain`. The dedicated entry avoids the root barrel's
Node-based services. Any object can own counts. The reader returns a detached
snapshot with total, lost_starts and lost_events, which the server maps to its
existing recording_failures, lost_starts and dropped_events fields.

Run the generic-owner, shared-counter and browser-import regression tests:

```sh
pnpm --filter @todo/domain test diagnostic-guard.test.ts diagnostic-guard-browser.test.ts diagnostic-context.test.ts diagnostic-event-types.test.ts diagnostic-labels.test.ts
```

The browser test builds the public entry for the browser and evaluates its ES
module in an isolated JavaScript realm. Any external import fails, and process,
Buffer, require, Bun and global must all be undefined in that realm. It requires
a literal successful value and explicit counts after a throwing observation.
Node's VM runs only the verification realm, never the production module.

Use a new evidence directory and a same-source cached CLI. From the checkout
root, after the main recipe builds the CLI/server/seed cache, run:

```sh
sh scripts/disk-guard.sh
bun build --compile apps/server/scripts/diagnostic-fault-cli.ts --outfile .scratch/bin/diagnostic-fault-cli
bun build --compile apps/server/scripts/verify-diagnostic-faults.ts --outfile .scratch/bin/verify-diagnostic-faults
.scratch/bin/verify-diagnostic-faults "$PWD/docs/evidence/ui-speed/recorder-faults-new"
```

The fault CLI imports the real command root. Only this verification executable
accepts DIAG_PROBE_POINT and DIAG_PROBE_EVIDENCE; production has no fault flag.
Both compiled drivers use scratch HOMEs/databases and remove their own data.
The recorder override throws private errors without replacing any business work.

HTTP cases throw at configure, root, entry/handler/handoff start and end, owner
authorization, timing headers and snapshot construction. Each successful create
returns the entire durable Task body and commits exactly one TaskCreated entry.
Control and throwing runs have equal bodies/statuses for 400, 401, 404 and 409.
A real HTTP route with an application defect retains its literal empty 500
response and makes no Task. A failed profiler snapshot omits the optional object
while retaining the original owner-only Diagnostics read.

Stream cases require one ready frame and the exact three durable operation IDs
in order, with no duplicates, while receipt, delivery, transport and teardown
observations throw. Scheduler cases run real due work and require each job step
once, one wake-up to Version 2 and one ReminderFired entry. CLI cases compare
complete stdout except generated_at, exact stderr and literal exits 0 and 4,
then read the successful add through the normal compiled CLI.

Every injected fault must execute and increment recording_failures. A failed
start increments lost_starts and started; other failed observations increment
dropped_events. An end failure can also leave an active incomplete span. These
are conservative loss counts and retain no error text. The bound checks in the
normal recipe remain required.

actions.json survives partial failures. A zero exit and result.json with PASS
and 47 cases prove completion. Run verify-server-api, verify-auth, verify-sse,
verify-scheduler and verify-cli alongside the no-Swift Diagnostics recipe.
