# Edit several Tasks

## Sub-features

Select Tasks, choose one shared field, preview without writes, apply matching
Versions, and reload after a partial Conflict. Selection stays checked on reload.
A successful preview enables Apply. A Conflict makes Reload Tasks the filled
action and keeps Apply quiet until a reload and another successful preview.

## How to get to it (user POV)

Choose Edit Tasks… in Compact navigation or the full Task window toolbar.
Choose Tasks and a field. Preview, then Apply. After a Conflict, choose Reload
Tasks, review the current values, and preview again before applying.
Priority groups and the Attachment section's Attach to Tasks action remain.

## Driving it with the headless production renderer

First build the shared source-hash cache:

```sh
bun .agents/skills/verify-cli/scripts/cache-binaries.ts
```

Run the active orchestration disk guard, then run:

```sh
TODO_HEADLESS_CHROMIUM=/absolute/existing/headless-chromium /usr/bin/lockf -k /tmp/todo-own-work-electron.lock bun apps/electron/scripts/verify-batch-edit-offscreen.ts "$PWD/docs/evidence/cli02/electron-new"
```

Omit `TODO_HEADLESS_CHROMIUM` when the Playwright-matched browser is already
available. Never install a browser to make this recipe pass. The helper builds
the production dialog with Vite and drives it through the production task-client
adapter against a compiled scratch server. It creates and reads Tasks through
the cached compiled CLI. The fixture opens the dialog without starting Electron.

The drive checks selection, no-write preview, a real competing CLI edit, one
accepted and one stale result, durable Versions, selection-preserving reload,
retry and a second shared field. It checks dialog and footer bounds and 32 px
footer targets. Compact captures come first, followed by full windows, in both
appearances. `actions.json` and `result.json` survive browser and server teardown.
`server.json` records the owned PID. The helper removes only its scratch directory.

## Gotchas

This proof never launches a native app, signs, accesses Keychain, restores a
Session, or exercises production Electron IPC or native window behavior.
Those remain under native HOLD. Send absolute PNG paths to the coordinator and
wait for APPROVE before calling a visual change done.
