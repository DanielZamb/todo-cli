# Attachments

The editor mounts the production `AttachmentsSection` and Task rows show
`JiraAttachmentMarker`. Add file uses NSOpenPanel and stores a path reference.
Drop and paste image use the generated upload endpoint. Links accept HTTP or
HTTPS. Image thumbnails, draft paths and missing-file text remain visible.
Open and Reveal use NSWorkspace only after `AttachmentOpening.allowedURL`
refuses executables, scripts, bundles and symlinks to those targets.

Headless proof during native HOLD extends the existing write-state recipe:

```sh
./scripts/swift-slot.sh apps/macos/scripts/verify-write-state.py "$PWD/docs/evidence/f11/swift-state-new"
```

Build reusable server and seed binaries with `bun .agents/skills/verify-attachments/scripts/build.ts`, then pass their paths through `TODO_SERVER_BINARY` and `TODO_PROVISIONER_BINARY` to the helper. Each behavior run still gets a fresh HOME and database.

`AttachmentStateTests` drives the production TodoModel against its compiled
scratch server, attaches a path with the jira label, a link and PNG bytes,
detaches, Reverts, deletes only its own scratch file, and reloads durable data.
`attachments-http.json` records Version 6, three Attachments and the missing
Jira draft. The opening-decision test never opens a file or calls NSWorkspace.
Generated request payloads round-trip through the regenerated Swift contract.
`GeneratedContractTests` has matching cases for future hosted verification.

The offscreen design recipe includes the production Attachments section with
thumbnail, missing file and row marker in light and dark appearances at full
and Compact widths. An unsigned Xcode build and the existing identifier check
must also pass. Never launch Todo, hosted XCTest, signing or Keychain flows.

The section's Add menu contains Add File…, Add Link… and Paste Image only
when the clipboard contains an image. Each row keeps its filename as the
title and presents its label as a badge. Attachment actions can mark Jira,
edit a label or clear it. Label edits preserve identity, support Revert and
survive reload in the production-model state test. The label sheet has its
own offscreen capture. Missing paths have no Reveal control.
Compact geometry receipts require the header and three complete rows inside
393×426, with Add and Remove targets at least 28 pt. Row spacing is 16 pt;
name, path and the missing-state line stay grouped with 4 pt spacing.
