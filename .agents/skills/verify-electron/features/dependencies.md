# Task Dependencies

The Electron transport extends the existing validated Request/Reply and shared
HttpApi client with graph reads, Profile-wide candidate search, depend, undepend,
batch-depend and the complete Delete query. Task read metadata and write reports
survive IPC decoding. The credential getter remains in taskHttpClient.

Run from the repository root:

```sh
bun apps/electron/scripts/prepare-dag-proof.ts
pnpm --filter @todo/electron test dependency-state.test.ts
sh scripts/disk-guard.sh
/usr/bin/lockf -k /tmp/todo-search-electron.lock bun apps/electron/scripts/verify-dependencies-offscreen.ts "$PWD/docs/evidence/task-dag/electron-new"
```

The prepare helper guards each compiled binary and caches CLI/server by shared
source hash in ignored `.scratch/bin`. The drive uses a fresh scratch HOME and
SQLite database. The optional `TODO_HEADLESS_CHROMIUM` selects an existing browser;
the helper never downloads one. Native Electron, safeStorage and native Session
restoration remain unproven during HOLD.

The current checkpoint covers Compact light/dark rows, terminal rows, the existing
filter dialog, server Dependency order, both picker directions, immediate pending
writes, a real cycle refusal and Delete previews. Every Delete entry uses one
controller/dialog, including Tasks with no Dependencies. Confirm sends the reviewed
server fingerprint and Version. Changed previews require another explicit confirm.
Long incident/candidate lists scroll with visible action bounds.

The capture manifest validates that every PNG and receipt exists within the repo,
including symlink checks, before writing. Each receipt records actual DOM state,
geometry and request count. Images do not prove behavior beyond those receipts.
The complete matrix, native key dispatch, graph, follow-up, initial creation,
Dependency batch/History/transfer and both complete final offscreen suites remain
pending until the unit report records their actual commands and exits.

Identifiers follow the client brief. Existing editor/filter/search identifiers stay.
`dependency-add` is the selected editor/menu entry and the same controller handles
Command/Control-Shift-K. The shortcut inventory found no Shift-K collision; Shift-L
appearance, Shift-D Diagnostics, Shift-N quick add, Shift-M Compact and Command-F
search remain in use.

Checkpoint2 adds the canonical local browser resource, Compact list-first and
explicit Diagram, full diagram/details and accessible-list fallback on a real
Pele parse failure. The drive uses a controlled malformed export and then a fresh
successful graph read for Retry. Graph state tests cover scoped obsolete reads,
direct-neighbour/overview state and surviving viewport/selection/focus across
replacement. E1-E6 use plain metadata text, the existing order header, shadcn
Checkbox, a fixed footer hint, a dismissible Alert with a whole-line witness,
hidden picker Versions and single-line relation titles with status/Project.
The driver asserts two whole candidate rows remain visible under a refusal.

The graph host's exact canonical source and output lock are named in the unit
report. Any resource or lock change needs a fresh committed handoff to L1, S and
the coordinator. Never silently consume an old emitted directory. Run the
browser-only proof with `bun apps/electron/scripts/verify-graph-browser.ts <fresh-evidence>`.
Its hiding-Reset fixture proves the adapter observer; production/native focus and
VoiceOver remain separate limits. The final aggregate/full matrix are pending.
