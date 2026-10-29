# Remaining work

## Status 2026-10-29 (UI and CLI fixes run)

Nine own-work Tasks are done, merged on `effect-port` and installed from `fb513a4`: Projects and Tags on create, the metadata dialogs, clipped rows, move and copy between Profiles, bulk import with dry run, attachments, Delete Profile, the Nerd Panel and Snapshots. A Compact pass applied Laws of UX to both clients, and ADR-0009 makes every capability ship an agent primitive and a human primitive.

- **Checks:** all 17 verification checks passed on `48f08a0` (pnpm check, every headless verify skill, the compiled Electron host and an unsigned Xcode build).
- **Database:** the real database upgraded from schema 3 to 6 with identical Task counts and History, after a backup and a pre-migration Snapshot.
- **Diagnostics cost:** accepted at +0.07 ms median p50 with no panel open. verify-diagnostics fails above baseline + 0.15 ms.

Open items:
1. **Push:** forge delivery is still deferred until the user asks.
2. **Worktrees:** the F11, F12, F13 and U02 worktrees remain on disk, and their branches are kept.
3. **Follow-ups:** a same-Profile Duplicate Task; attributing the diagnostics overhead.

## Status 2026-10-28 (final)

Everything planned for the Effect port is done and verified on `effect-port` and `main`. Nothing is pushed.

- **Clients:** P02 lets both clients create Projects and Tags. W07 and W08 make the macOS client native.
- **macOS native proof:** verify-macos steps 1–10 passed on the signed app, including a delivered notification and SSE resume. The W07 and W08 checks passed natively.
- **Electron native proof:** verify-electron passed on the signed app, covering Session restore, a native notification, conflict, SSE, restart and offline.
- **Cleanup:** all worker worktrees are removed and their branches are kept.

Open items:
1. **Keychain:** four `local.todo.verify.*` Keychain items remain. macOS refuses deletion by any process other than their owner, so the user deletes them in Keychain Access.
2. **Electron History copy:** the subtitle fix ("for this Task", `8fe3311`) arrives with the next `scripts/sign-and-install.sh` run.
3. **Push:** forge delivery (push and PRs) is still deferred until the user asks.

# Effect port status, 2026-10-27

The coordinator resumed on `effect-port`, integrated S05 and the Electron
finish branch, and stopped the native verification loop after the user reported
repeated Keychain password prompts. No further interactive native attempt is
authorized in this run. The real database remains untouched.

## Integrated and exercised

- R01 retires the Go code and Go build targets. The root `scripts/install.sh`
  builds and installs both Effect binaries, with Makefile entry points. The
  five acceptance goldens live at `apps/cli/test/golden/` and match their original
  Git blobs byte for byte. Standing order 8 now uses that path. Installed CLI and
  HTTP proofs run in scratch HOMEs. See `../evidence/r01/` for receipts.
- C01-C04: scaffold, operation log, recurrence and auth retain their prior reviews.
- C05 and X01: shared commands and CLI parity include the two final History and
  canonical-validation fixes. The compiled CLI passes and all five Go goldens
  still match exactly.
- S01-S05: HTTP, SSE, scheduler, client reads and client writes are integrated.
  The coordinator repeated the compiled HTTP writes recipe on scratch SQLite.
- D01 and D02: approved design references remain under `design/`.
- E01: the compiled-host acceptance flows pass, and the coordinator approved the
  second visual iteration. See `reviews/E01-visual-r2.md`.

S05 completed two max-effort correctness rounds. The final two findings were
fixed with failing-before and passing-after tests plus compiled proofs. Those
post-review fixes have no further independent verdict. Details and limits are
in `../evidence/s05/finish.md`.

The integrated TypeScript check exposed conflicting Node type resolution after
installing all workspaces. An exact root development dependency now gives Bun
and indirect Node references one primary type-resolution path. Typecheck, lint
and all 157 workspace tests pass after W02 integration. The dependency fix
passed its single max-effort review.

## Remaining work and gates

1. W01's checkpoint is integrated. Its state fixes, default-deny native entry
   guards and verification notes are preserved. The coordinator regenerated the
   Swift client from the merged contract and statically checked both the API
   module and app sources. N01 closes the cleanup findings with 12 passing
   synthetic tests. Its final
   post-review fixes have no further independent verdict. W01 is not approved
   for native delivery.
2. Native verification is on HOLD. Both desktop harnesses must reject unattended
   entry before builds, scratch creation or app launch. Setting an opt-in flag
   alone is insufficient authorization; a future interactive attempt requires
   current user consent. Do not retry a blocked or cancelled Keychain operation.
3. Electron's exact signed-app Session restoration remains unverified. Earlier
   native notification delivery and compiled-host restoration receipts do not
   close this gate. macOS native notification delivery also remains unverified.
4. W02 implements the required lifecycle Settings and bundling integration.
   The shared Swift implementation passed the integrated headless lifecycle
   recipe. An unsigned Xcode build and bundled server also passed. Native
   Settings interaction and signed delivery remain unproven. The project
   generator needs the unavailable xcodeproj Ruby gem.
   See `../evidence/resume-20261027/w02/README.md`.
5. Move to Profile, Revert and Series endpoints are available after S05. The v1
   desktop controls remain disabled; connecting them is a separate client change.
6. Purge retains History today. Its long-term History policy is still open.

Nothing is pushed, and no PR is opened. Keep worker branches and evidence.

W03 consolidated the late W01 fixes into the existing lifecycle controller.
The coordinator repeated its full headless recipe, all 56 configuration/TCP
regressions, all 157 workspace tests and the unsigned app build. Its single
Sol max review passed. See `../evidence/resume-20261027/w03/README.md`.

All workers are idle. Periodic disk monitoring is disabled again. The floor
guard still runs before builds, installs and launches; re-enable the timer
before restarting active orchestration. Native UI and Keychain remain held.
