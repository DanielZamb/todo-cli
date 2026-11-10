# Compact import rows

The Compact import preview and results restore four whole 56-point rows in the
224-point viewport in both clients. A rejected row shows its title, one caption
reason line and the muted exit pair. Its external id follows the full reason and
exit pair in the tooltip and accessibility label. Hovering over the title retains
that same complete tooltip. Ordinary rejections use the destructive colour;
structured Task lookup rejections stay neutral.

Full-window rows retain their content and inline recovery action. The reason
uses the caption style. At the coordinator's review request, Electron's exit pair
also uses the muted caption style from Compact. Accepted rows retain title, external id and changes.
Neither of the existing whole-row/no-partial-row geometry assertions changed.
No domain, API, CLI, server, dependency, pin or generated source changed.

`git log -S'minHeight: compact ? 56' -- apps/macos/Sources/Import.swift` identifies
`fd13c175` from PR #10. Its parent used `.frame(height: compact ? 56 : nil)`.
This restores that frame rather than introducing a new constraint. The untouched
long-preview fixture also failed with accepted rows alone. Compact frame checks
now measure every title, both detail lines and outcome label inside each row,
including all twelve long-preview rows and the final row. Typography and spacing
retain their existing sizes.

The only row recovery action found in import, batch edit and attach-many is
Find Task by id for a structured Task lookup rejection. Batch edit and attach-many
also retain their dialog-level Reload controls. In Compact import, the action
uses the existing native or shadcn row menu, with an announced action and
accessibility support. The Mac row is focusable and has a named accessibility
action. The Electron button announces Find Task by id, with menu semantics,
Shift+F10, Escape focus return and right-click verified. Find opens the prefix
without submitting. Full-window recovery stays inline. Other report rows had no
additional failing existing geometry check in the baseline; they were left alone.

The focused Electron runner calls the existing exported `verifyImport` steps
against a fresh compiled scratch server and CLI. The iterative import helper
requires `scripts/scratch.sh`, which is absent from this checkout. The focused
runner bypasses the unrelated stale write expectations without changing them.
`write-host.ts` reports `VERIFY_HOST_BOOT_FAILED` and exits 1 on startup failure.
An invalid URL launch exercised that path without an OS error dialog.

The verification recipes were extended with the rejected-first, rejected-last,
and two-rejected fixtures. Literal checks cover equal row frames, a single reason
line, exit-pair presence, complete tooltip and accessible-label text, and the
existing geometry rule. The Mac help and accessibility text also have literal
PresentationTests expectations. The offscreen manifest now has 358 PNGs.

## Verification receipts

The checkout is on `fix/compact-import-rows`, based on
`cabf4866835a49f23dc0fe44694740f122855e33`. Commands run from its root. Evidence is
under this absolute directory, which is ignored by Git:

`/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows`

Every outer command captured `rc=$?` immediately and wrote its `.exit` receipt.
The Swift helpers also preserve individual command exits and pin checks.

Use these definitions for the exact commands below:

```sh
E="$PWD/docs/evidence/import-rows"
B="$PWD/.scratch/bin/cabf4866"
SWIFT=/Users/zambamon/Work/todo-cli/scripts/swift-slot.sh
```

The same full design command ran before and after the fix, changing only the fresh
evidence path. Every focused selector was unset:

```sh
env -u TODO_SNAPSHOT_PRIORITY_ONLY -u TODO_SNAPSHOT_SEARCH_ONLY -u TODO_SNAPSHOT_DISCOVERY_ONLY -u TODO_SNAPSHOT_QUICK_ONLY -u TODO_SNAPSHOT_BATCH_EDIT_ONLY "$SWIFT" apps/macos/scripts/verify-design.py "$E/mac-before"
env -u TODO_SNAPSHOT_PRIORITY_ONLY -u TODO_SNAPSHOT_SEARCH_ONLY -u TODO_SNAPSHOT_DISCOVERY_ONLY -u TODO_SNAPSHOT_QUICK_ONLY -u TODO_SNAPSHOT_BATCH_EDIT_ONLY "$SWIFT" apps/macos/scripts/verify-design.py "$E/mac-final"
```

The before command exited 1 with exactly twelve issues, all at the unchanged
whole-row and partial-row assertions. Its `mac-before/render.log` and
`mac-before/import-layout.json` retain the failures. The initial changed suite,
`mac-after-1`, exited 0 with all 358 PNGs. The final suite additionally checks
text containment. It exited 0 with all 358 PNGs and every text-containment assertion passing. The coordinator approved both clients.

```sh
TODO_SERVER_BINARY="$B/server" TODO_CLI_BINARY="$B/todo" TODO_SEED_BINARY="$B/seed" "$SWIFT" apps/macos/scripts/verify-write-state.py "$E/mac-state-final"
"$SWIFT" .agents/skills/verify-macos-lifecycle/scripts/unsigned-build.sh "$E/mac-unsigned"
TODO_ELECTRON_VERIFY_HOST=1 /usr/bin/lockf -k /tmp/todo-search-electron.lock pnpm --filter @todo/electron build
TODO_ELECTRON_VERIFY_HOST=1 pnpm --filter @todo/electron exec bun scripts/verify-import-focused.ts "$B" "$E/electron-before"
TODO_ELECTRON_VERIFY_HOST=1 pnpm --filter @todo/electron exec bun scripts/verify-import-focused.ts "$B" "$E/electron-reviewed"
TODO_VERIFY_REPORT_ERRORS=1 TODO_HEADLESS_CHROMIUM='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' /usr/bin/lockf -k /tmp/todo-search-electron.lock pnpm --filter @todo/electron exec bun scripts/verify-discovery-offscreen.ts "$E/electron-recovery-final-4"
sh /Users/zambamon/Work/todo-cli/scripts/disk-guard.sh
/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check
```

The unsigned build, final Electron build, final import matrix and final recovery
drive all exited 0. Electron's baseline exited 1 with three whole rows and one
partial row. Its `electron-before/failure.png`, `failure.txt` and
`layout-latest.json` remain local. The scratch Mac state suite's first attempt
exited 1 with two old inline-card expectations for Compact import. Those were
updated for the approved menu design while preserving ordering, full-window
cards and final-row visibility assertions. The rerun exited 0 with all 114 state tests. The final plain locked root check
exited 0, retained in `root-reviewed-check.log` and `root-reviewed-check.exit`.
`check-design-identifiers.py` also exited 0 inside the full design helper.

The invalid-launch control was:

```sh
env -u ELECTRON_RUN_AS_NODE TODO_ELECTRON_VERIFY_HOST=1 TODO_ELECTRON_DATA="$PWD/.scratch/todo-s01-verify-invalid" TODO_SERVER_URL=invalid apps/electron/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron apps/electron/dist/verification/write-host.mjs
```

It exited 1 and emitted `VERIFY_HOST_BOOT_FAILED: TypeError: Invalid URL`.
Dependency installation used `pnpm install --frozen-lockfile` and
`pnpm --filter @todo/electron exec install-electron`, both exit 0, each behind
the disk guard. The initial binary batch used `bun build <source> --compile --outfile
<path>` for `apps/server/src/main.ts`, `apps/cli/src/main.ts` and
`apps/server/scripts/seed-verification.ts`, each exit 0, with outputs
`$B/server`, `$B/todo` and `$B/seed`. Binary SHA-256 values are in
`compiled-inputs.sha256`. The domain-source diff exits 0.

Other retained red receipts are a new runner's inferred environment type,
a too-specific new 12-pixel measurement expectation, and a new fixture's same-file
selection timeout. These were fixed in the runner or tests. The original geometry
assertions stayed unchanged. All intermediate logs and exits remain under the
evidence directory. No failing receipt was overwritten.

The coordinator approved Electron Compact from `electron-final-4` and the Mac
matrix from `mac-final`, then requested muted caption text for the full-window
Electron exit pair. That adjustment passed the complete focused import matrix
again in `electron-reviewed`. The coordinator gave overall UI approval for both
clients and requested a trivial fixture correction before finishing. The Mac
snapshot rejection reason now says the Task is deleted, matching the titled
fixture rows. This changes one fixture line, with no production change.

Only its offscreen render target was rebuilt and rerun after the fixture change:

```sh
"$SWIFT" sh -c 'swift build --package-path apps/macos --scratch-path apps/macos/DerivedData/StateProof --disable-automatic-resolution --build-tests --jobs 2; rc=$?; if [ "$rc" -ne 0 ]; then exit "$rc"; fi; TODO_SNAPSHOT_DIR="$PWD/docs/evidence/import-rows/mac-fixture-final" swift test --package-path apps/macos --scratch-path apps/macos/DerivedData/StateProof --disable-automatic-resolution --skip-build --filter Snapshots.renderScreens; rc=$?; exit "$rc"'
```

The actual invocation retained separate build and render logs and exit receipts,
with the disk guard first. The build and render both exited 0. The manifest contains all 358 required PNGs,
and all row geometry and text-containment assertions passed again. I inspected
the refreshed rejected-last light, two-rejected dark and full-window preview.

Before captures:

- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/mac-before/compact-import-preview-light.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/electron-before/failure.png`

The approved capture matrix is listed below. I inspected every image before
sending its absolute path to the coordinator. The refreshed Mac fixture captures
are in `mac-fixture-final` with the same filenames.

- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/mac-final/compact-import-preview-rejected-first-light.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/mac-final/compact-import-preview-rejected-first-dark.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/mac-final/compact-import-preview-rejected-last-light.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/mac-final/compact-import-preview-rejected-last-dark.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/mac-final/compact-import-preview-two-rejected-light.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/mac-final/compact-import-preview-two-rejected-dark.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/mac-final/compact-import-result-light.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/mac-final/compact-import-result-dark.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/mac-final/import-preview-light.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/electron-final-4/compact-import-light-preview-rejected-first.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/electron-final-4/compact-import-dark-preview-rejected-first.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/electron-final-4/compact-import-light-preview-rejected-last.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/electron-final-4/compact-import-dark-preview-rejected-last.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/electron-final-4/compact-import-light-preview-two-rejected.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/electron-final-4/compact-import-dark-preview-two-rejected.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/electron-final-4/compact-import-light-result.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/electron-final-4/compact-import-dark-result.png`
- `/Users/zambamon/.t3/worktrees/todo-cli/fix-compact-import-rows-083ffebb589fbe3f/docs/evidence/import-rows/electron-reviewed/import-light-preview.png`

## Limits and ownership

No signed app, Todo.app, hosted XCTest, Keychain, installed CLI, owner database,
owner backup or real `~/.todo-cli` was used. No process belonging to another run
was signalled. The recipes close their owned hosts and scratch servers.

Unsigned Electron proves renderer and IPC behaviour on scratch HTTP. The separate
report-recovery drive uses the production renderer and adapter with real HTTP,
plus an explicitly typed import Task lookup fixture. It does not prove that the
server returns Task lookup recovery for that fixture. Mac screenshots are
unordered offscreen NSHostingView renders. Signed applications, native glass,
VoiceOver and real keyboard operation remain unproven. Playwright keyboard events
prove the Electron menu handler, not a physical keyboard or VoiceOver session.

No files were added under `packages/domain`. Eight run-owned Bun compile
temporaries, totalling 709286912 bytes, were checked with `lsof` and removed.
Binary inputs remain in the worktree-local `.scratch/bin/cabf4866` cache. CLI,
server and package sources remain identical to the base, so these compiled inputs
also match the final report commit's domain source state. Each final behaviour
drive uses a fresh scratch database and HOME.

The comment audit was performed directly. No comments or suppressions were added.
The delegated no-comments and seat-1 review were not launched because this worker
was explicitly forbidden to launch threads or subagents. The coordinator owns
the independent review seats and integration. No push, merge, rebase or PR occurred.
