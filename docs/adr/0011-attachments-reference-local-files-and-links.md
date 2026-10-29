# Attachments reference local files and links

A Task has Attachments with a stable id, kind `file`, `image` or `link`, a path for files and images or an HTTP/HTTPS URL for links, an optional label, and `added_at`. Paths are absolute on the owner's machine. Attaching a path records a reference and leaves the file where it is. A missing path remains attached and appears as missing, with `exists: false`. Link existence is unknown and does not trigger a network request. The `jira` label gives the Task a compact Jira marker and exposes the draft path in the editor.

Pasted and dropped image bytes go through the authenticated server upload endpoint. The shared domain writes them beneath `~/.todo-cli/attachments/<encoded-profile>/<encoded-task>/<attachment-id>.<extension>`. Tests may supply an isolated attachment root. Each path segment uses a reversible hex encoding of the identifier. The server chooses the filename and validates both image signatures and the declared MIME type. Supported uploads are PNG, JPEG, GIF and WebP, limited to 20 MiB of decoded bytes per image. Existing local file references have no size limit because Todo does not copy or read them. The upload request uses base64 JSON, with a bounded encoded length in the HttpApi schema and HTTP body limit.

Attach and detach append `AttachmentAdded` and `AttachmentRemoved` operations with the Task's before and after values, increment its Version, appear in History, support Revert, and reach other clients through SSE. Attachments belong to a Task, not Series defaults, and do not propagate to future Occurrences. Existing events without an attachments field remain readable. The CLI exposes `todo attach <id> <path|url> [--label jira]` and `todo detach <id> <attachment-id>`, including a dry run for detach.

Delete preserves references and copied files so recovery works. Detach also preserves copied files for Revert. Purge erases every copied file belonging to the Task, including detached images, and redacts attachment paths, URLs and labels from History and snapshots under ADR-0008. A durable cleanup queue records only encoded Profile and Task directory names in the Purge transaction. Cleanup runs after commit and at database open, retries after failures, and never follows symbolic links. External referenced files are never erased. Replay changes database state only and never copies files or deletes external paths.

The server can return image bytes only for an image in the managed attachment store, after Profile and Task authorization. It never reads an arbitrary referenced local path. File opening and Reveal in Finder happen in the desktop client on the owner's machine. Both clients refuse executable files, executable scripts and app bundles, including symbolic links to those targets. Links open only through HTTP/HTTPS. Store directories have owner-only permissions and copied files use mode 0600.

## Consequences

Paths are machine-local references and may be unavailable on another device. A thumbnail is available for managed images; external images use the client-local path when available. Moving a Task preserves its original managed-file reference and ownership directory until Purge, so a move cannot silently orphan a copied image. The cleanup queue therefore records every managed directory referenced across the Task's History. A copied file and its database operation cannot share one atomic filesystem transaction. Failed uploads remove their uncommitted file; Purge uses retryable cleanup, and reports an erasure failure until cleanup succeeds.

## Snapshot interaction

Purge uses the operation store's existing `pre-purge` Snapshot and shared
`redactTaskHistory` for both the live database and every Snapshot database.
Snapshot creation must succeed before Purge changes data or erases copied files.
The attachment eraser runs after the Purge transaction commits. It does not take
a second Snapshot or implement a second redactor. Snapshots contain only the
database, not the copied attachment files. If restoring an older reference
points at a file erased by Purge or removed outside Todo, both clients show
Missing file and disable Open. Restore never recreates image bytes or pretends
they are present.

Labels are edited per Attachment. A label change preserves its id, location and added_at and records a TaskEdited operation with History and Revert. `todo label-attachment <task> <attachment> [--label <text>]` sets the label, or clears it when omitted. Copied images may carry an optional original `name` for display; their managed storage filename remains server-owned.

Managed images record their decoded `byte_size`. Both clients show "Copied image" and the size in the secondary line, retaining the real path in the tooltip and accessible description. Path references keep showing their path. Existing events without byte_size still decode unchanged.

## Copy and Move

Copy assigns a new Attachment id to every reference. Ordinary file paths and links stay unchanged. A managed image is copied into the target Profile and new Task directory before the copy operation commits, and only its path and Attachment id change. Failure or rejection removes all new files using the same cleanup as a failed image write. Copy dry runs report the managed image count and total bytes for each Task. Purging the source cannot erase the copy's images. Move keeps the same Task and preserves Attachment ids, paths and managed bytes.
