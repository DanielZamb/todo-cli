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
