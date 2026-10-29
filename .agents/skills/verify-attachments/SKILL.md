---
name: verify-attachments
description: Verify Todo Attachments with the compiled CLI, curl against the compiled server, SSE, scratch files, History, Revert and Purge. Use after attachment model, migration 0006, copied image storage, CLI, HTTP or client changes.
---

# Verify Attachments

Created with `create-verification-skill`.
Read [the feature map](features/README.md). Every database, HOME, file and process
belongs to a new `todo-f11-verify-*` scratch directory. Never read the real
`~/.todo-cli`, its database, attachments, backups, installed binaries or server.

## Launch

From the checkout returned by `git rev-parse --show-toplevel`:

```sh
bun .agents/skills/verify-attachments/scripts/drive.ts "$PWD/docs/evidence/f11/attachments-new"
```

Pass a new absolute evidence directory. The helper reuses the source-hash CLI
and server cache in `.scratch/bin`, compiling missing binaries with
`bun build --compile`. It initializes a scratch owner using the
CLI, starts its server on port 0, and drives the feature through CLI and curl.
It needs installed pnpm dependencies, Bun and curl. It does not launch either
native app, sign code, invoke Keychain, install a service or use the real HOME.

## Doctor

Run `bun --version`, `command -v curl`, and `pnpm typecheck`.
The helper requires `GET /health` to equal `{"service":"todo-server"}` and
waits for its own server's `Listening on http://127.0.0.1:<port>` output.
Read `provenance.json`, `compile-todo.json`, `compile-server.json` and
`server.log` on failure.

## Drive

The Launch command drives CLI file paths, links, labels, missing-file status,
Markdown, JSON, command schemas and detach dry runs. Curl uploads a real PNG,
fetches only its managed image, and Reverts a CLI detach. A live authenticated
SSE stream must receive `AttachmentAdded` and `AttachmentRemoved`. Delete keeps
the copied image. Purge erases it, redacts paths from History, and preserves
the external referenced file. Every process must actually exit before a pass.

Run the domain behavior checks too:

```sh
pnpm --filter @todo/domain test test/attachments.test.ts
```

They prove snapshot replay, Revert, refusal of an outside-root erasure symlink,
refusal of a symlinked upload Profile before creating outside directories,
image read isolation, and Purge preserving all Tasks in another Profile.

## Evidence

The supplied directory retains compiler exit records, `actions.json`, schemas,
`events.sse`, `server.log`, `cleanup.json`, and `result.json`. Actions contain
real commands and HTTP responses. Session credentials and passphrases are
omitted. `result.json` appears only after all assertions pass. A helper exit 0
and `PASS; evidence survived cleanup` prove completion. Screenshots and client
state tests supplement this proof after both editors are integrated.

## Cleanup

The helper terminates only its own curl and server by child-process identity,
waits for their exits, and removes only its own temporary directory on success
or failure. It keeps the evidence outside scratch. No process-name kills occur.
The final assertions confirm scratch is gone and the evidence still exists.

## Helpers

`scripts/drive.ts <fresh-absolute-evidence-directory>` is the complete helper.
Run it using Bun as shown above. `.claude/skills/verify-attachments` is a relative
link to this directory. Check it with `realpath`. Fresh Claude discovery is a
separate coordinator check, not proven by filesystem resolution.
