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

## Version guardrails

The main process checks health on restore, before and after sign-in, before Task requests and at every SSE reconnect. A missing or different contract blocks Task traffic and shows "Todo server is out of date", server/app builds and recovery instructions. The focused compiled host uses the same checkServer implementation with old health and fake-contract loopback responses. It asserts zero stale Task requests, exact Open and Closed title sets with done and cancelled fixtures, and disabled Status in Inbox. It captures outdated and planning-status in Compact first, then full, in light and dark. Run TODO_ELECTRON_VERIFY_HOST=1 TODO_VERIFY_VERSION_GUARDRAILS=1 .agents/skills/verify-electron/scripts/verify.sh "$PWD/docs/evidence/version-guardrails/electron-new". Never wrap the shell helper in the Electron build lock. result.json retains THIN_PASS_NATIVE_BLOCKED. Production credential storage and native delivery remain held.

## Credential timing without native storage

Compile scripts/verify-auth-sequence.ts and run it with compiled CLI/server
paths and a fresh evidence path. It uses one production taskHttpClient instance
created with an undefined credential getter. Sign-in must be followed by
Profiles 200 with Authorization present; sign-out clears the getter and the
same instance must send no Authorization on its subsequent Profiles 401.
Only header presence is recorded, never credentials.

Run TODO_ELECTRON_VERIFY_HOST=1 .agents/skills/verify-electron/scripts/verify.sh
with final-source TODO_CLI_BINARY and TODO_SERVER_BINARY. The unsigned host
uses the production factory before initial sign-in. verify-host-auth.ts drives
Sign out and Sign in through the renderer and checks actual request statuses
and header presence. Both steps must return to Tasks with the same host client.
This catches a credential value captured before sign-in. SafeStorage, signed
app restoration and Keychain remain held; this host never imports safeStorage.
