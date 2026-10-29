# Sessions and drafts

## Sub-features

Owner sign-in, safeStorage, Session restoration, sign-out and Profile-scoped drafts.

## How to get to it (user POV)

Open Todo and Sign in. Quick add is in the sidebar, application menu and menu bar.
Closing the window keeps the app running. Quit ends it.

## Driving it with Playwright Electron

Fill Owner passphrase and click Sign in. Require absence of plaintext ses_ in
session.enc. Enter a quick-add draft, quit, relaunch and require the Session and
draft to return. Sign out and require the sign-in form and no session.enc.
Hold the initial task response during restart, create a Task through the compiled
CLI, and let its SSE refresh finish first. The saved quick-add draft must still return.

## Gotchas

macOS keychain approval is human-controlled. Keep Electron HOME unchanged and
isolate userData. Never fall back to plaintext storage.
