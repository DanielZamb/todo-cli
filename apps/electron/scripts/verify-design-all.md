# Full Electron offscreen suite

Run from the repository root with frozen pnpm dependencies and an existing
Chromium executable configured in `TODO_HEADLESS_CHROMIUM`:

```sh
sh apps/electron/scripts/guarded-run.sh bun apps/electron/scripts/prepare-dag-proof.ts
sh apps/electron/scripts/guarded-run.sh bun apps/electron/scripts/verify-design-all.ts docs/evidence/electron-full-new
```

The output argument is a fresh repo-relative directory. Inputs resolve through
`scripts/verification-inputs.ts`; binary paths in the generated scratch cache
must resolve inside this checkout. The prepare command compiles CLI, server and
seed once for the shared source/build identity, with the actual committed SHA
embedded in the binaries. Build at the final source commit for final proof.

`verify-design-inventory.ts` lists every standalone offscreen recipe and every
mode selected by the unsigned host helper. The aggregate checks the on-disk
`verify-*-offscreen.ts` inventory and the helper's modes. Adding a recipe or mode
without adding its inventory entry fails. Constituent log files and the single
`summary.json` preserve argv, real exit, evidence directory and named skip/missing
reasons. All constituents run even if an earlier one fails. The aggregate exits
nonzero for any failure, missing script, incomplete inventory or failed preflight.

The unsigned host helper takes its own Electron build lock and is never wrapped
in that lock. Other recipes use the shared lock. The child compiler wrapper runs
the disk guard for nested command compilers. Before the complete build batch the
aggregate also records `df` and enforces the 30 GB soft floor. The Diagnostics
adapter uses the same cached binaries in a fresh owned scratch directory; it does
not invoke the retained-server convenience helper.

Nested wrappers retain the original absolute Bun/pnpm/Node/xcrun delegates.
The Bun runtime preload guards each in-process `Bun.build` immediately, and
preserves hard guard exit 3 through synchronous/asynchronous guard exceptions.
It uses an owned temporary preload symlink so checkout paths with spaces do not
become Bun option fragments. The outer wrapper removes it after all nested work.
The wrapper does not add Node/Electron preload options. A constituent exit 3
keeps aggregate exit 3 and records every later recipe as skipped for DISK STOP;
none is launched. Ordinary nonzero exits remain failures and the other recipes
continue. Fake-delegate/runtime controls cover these distinctions without a
real compiler or native app.

Guard diagnostics go to stderr. Delegate stdout remains byte-for-byte intact,
including JSON consumed by license generation; the delegate's stderr and exit
remain intact as well. The fake JSON control covers nested shell wrappers and
the in-process fake build guard. The earlier stdout-contamination failure is a
retained harness incident, separate from product-copy assertion failures.

Run the cheap generic controls independently of the full suite:

```sh
TODO_VERIFICATION_CONTROLS_DIR=docs/evidence/electron-controls-new sh apps/electron/scripts/guarded-run.sh pnpm --filter @todo/electron test guarded-run.test.ts guarded-runtime.test.ts design-runner.test.ts design-inventory.test.ts
```

The inventory includes Attachment batch, batch edit, discovery, discovery report
errors, Dependencies, the canonical browser host, default host writes, Task
search, priority groups, version guardrails, Snapshots, metadata/Tag layout,
credential-generation Unauthorized recovery and Diagnostics. The default host
write driver includes Compact, presentation, metadata, Task filters, Profile
Compact, transfer, Import and recurrence helpers. Signed/native verification is
listed as a named HOLD, not run. Auth-sequence and graph-contract checks are
additional non-visual behavior proofs.

A retained counterpart base may lack the new Electron Dependencies driver or the
canonical-browser proof driver. Those entries are MISSING and make the aggregate
nonzero while existing recipes still run. A Dependencies result explicitly marked
`DAG_INTERMEDIATE_PARTIAL` also leaves final new-client coverage MISSING despite
its command's actual zero exit. Never replace these entries with a passing older
focused recipe. Native safeStorage, Session restoration, Keychain, notifications
and VoiceOver remain outside the unsigned/offscreen proof.
# Host launch preflight

Every unsigned Electron launcher uses hiddenHostOptions before spawning. It resolves
apps/electron/dist/verification/write-host.mjs from the script location and checks
the entry and installed Electron runtime without importing the auto-download module.
Missing files fail before Electron starts. Existing environment and window visibility
behavior are preserved. Diagnostics opens its production window; main write-host
windows follow the existing TODO_ELECTRON_VERIFY_BACKGROUND setting. The signed
verifier remains on its native HOLD.

The hidden-host.test.ts controls prove that a missing entry exits in under one
second without reaching a launch delegate and inventory every unsigned launch site.
Clean-main baseline runs use plain main plus the named generic verification overlay.
Their manifests record each overlay file and hash separately from the main source.

## Isolation between recipes

The aggregate gives each constituent a distinct evidence directory. Each offscreen
driver creates a fresh `mkdtemp` HOME/database and a fresh Chromium context. Every
`verify.sh` invocation creates its own `todo-s01-verify-*` directory; its seed and
driver use that directory's HOME, SQLite file and Electron userData. The standalone
Diagnostics and unauthorized-host drivers also create fresh scratch directories.
The metadata observer shares its parent recipe's scratch server deliberately, but
has a separate userData subdirectory. No two constituents share these settings.

All scratch servers and proxies bind port 0. Electron's inspector/CDP ports are
allocated dynamically. Cached CLI/server/seed binaries and unsigned build output
are shared read-only inputs to the drives; Compact preferences live in each
fresh userData directory's `window.json`, outside that build output. The build lock
coordinates compilation and stores no client state.

Clean main `cabf4866` had a Compact-size failure inside its full aggregate:
expected 393×426, received 1280×895. Three unchanged isolated host-writes runs
reached the later Move-copy assertion; a maintained-main run hit the size failure
again. All those historical exits remain unchanged.

Observation-only main-process tracing identified a verification precondition race
in `verify-compact-presentation.ts`: an immediate visibility probe skipped the
Compact request after Expand, then asserted a size it had not requested. Native
resizing completed promptly when requested. The corrected step awaits the Compact
control, clicks once and keeps the original 5,000 ms size predicate. It passed
30 of 30 with exactly 30 delivered requests and 30 content-size calls. A forced
absent control fails at `Compact control not visible` in about one second with no
request or resize. Compact-size failure: verification precondition race, fixed;
product unaffected. Recipe-local state isolation remains unchanged.

## Retained main baseline and maintained expectations

The original fourteen-recipe baseline on `cabf4866`, with the named generic
verification overlay only, exits 1: nine PASS, three FAIL, two MISSING and the
named native HOLD. The two missing recipes are the new Electron DAG drivers.
The original Attachment batch and batch-edit Conflict expectations omitted the
exit pair introduced by PR #10. The Move expectation and generic Series 422
expectation had the same omission. Maintained expectations include the actual
rendered pair; they do not change product copy.

The maintained Attachment batch and batch-edit drives exit 0. Move and generic
422 assertions pass in the maintained host drive, which remains nonzero at the
known main Compact Import regression: `verify-import.ts` wholeRows >= 4 receives
3, and partialRows === 0 receives 1. Both assertions remain unchanged. Owner
Task `5cdbdbd6` owns that product issue. Compare the final Electron source against
both exact predicates and values before calling its failure identical to main.

One diagnostic-only scratch continuation was permitted past those two exact
Import predicates. It exited 1 earlier at the immediate Series Skip Retry status
assertion, so it recorded no Import continuation and proves nothing beyond it.
That intermittent occurred once in the long driver and was not reproduced in ten
isolated main observations, with 1,000 cancelled server-status samples. No product
or completion-wait change follows. If the original immediate assertion fails
again, the driver includes the Occurrence id, retained Retry HTTP status/body and
timestamped 50 ms status samples for five seconds. The successful path adds no
server reads, delay or changed assertion. The existing proxy passively retains
Skip response metadata/body for that failure report.

The local classification index under
`docs/evidence/task-dag/unit-e/baseline-classification/classification-index.json`
records existing receipts, source/binary identities, exact old/new literals,
PR #10 commits, original exits and capture limits. It is intermediate evidence,
not the final whole-client result. The main archive retains original failures.
