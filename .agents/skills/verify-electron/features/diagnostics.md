# Diagnostics

## Sub-features

Window menu and Command-Shift-D, a dedicated window, Profile filtering, live
metadata, light/dark appearance and retained snapshots after connection failure.

## How to get to it (user POV)

Choose Window > Diagnostics or press Command-Shift-D. Live pauses or resumes
polling; Command-Shift-L does the same. Refresh is available while paused.
The window uses the signed-in owner's Session. Access Tokens are denied.

## Driving it with Playwright Electron

Run `.agents/skills/verify-diagnostics/scripts/verify-electron.sh` with a fresh
absolute evidence path. It builds the unsigned compiled host under the shared
Electron lock, starts a compiled scratch server, creates eight Tasks with the
compiled CLI, invokes the real Window menu callback and checks its accelerator
binding and literal counts. Native keyboard routing remains held.
The host uses the production window helper, IPC schemas, typed HTTP handler,
preload and renderer. It never imports safeStorage or writes credentials.
It captures live, paused, empty and error states in light and dark at 393×426
and full size. Bounds assertions require four visible Compact summaries,
32px targets and whole rows. It checks pause/manual refresh/resume with a real
CLI write, inherited appearance, and sign-out while a real HTTP reply is held.

## Gotchas

Polling waits one second after success and backs off to 2, 4, 8, 16 then 30
seconds after errors. Latency and totals cover all Profiles. Last-use metadata
is observed by this server process. The host's production window helper and
shortcut proof does not prove the signed app or its Keychain integration.

A forced diagnostics-only 401 goes through the real HTTP server. Both windows
must return to their signed-out states and the main Task view must disappear.
Archived is created and deleted through the compiled CLI; it must disappear
from the picker/entities and retain its (deleted) operation label.
