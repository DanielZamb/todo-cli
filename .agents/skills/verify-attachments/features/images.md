# Copied images

## Sub-features

Upload PNG, JPEG, GIF or WebP image bytes up to 20 MiB, read a managed image and
notify other clients with SSE. Reject path traversal and cross-Task reads.

## How to get to it (user POV)

Paste or drop an image in the editor. The client sends its bytes to the local
server's authenticated upload endpoint.

## Driving it with curl

The helper posts base64 PNG data to
`/profiles/work/tasks/TASK/attachments/upload`, reads
`/profiles/work/tasks/TASK/attachments/ATTACHMENT/image`, and compares the
stored bytes. `events.sse` must contain the accepted upload operation.

## Gotchas

The server reads only managed images. External paths open on the owner's
machine. Domain tests prove symlink refusal and managed-file ownership.

## Failed write cleanup

`pnpm --filter @todo/domain test test/image-write.test.ts` compiles the
production image writer into a scratch driver. A child shell limits that
process's file size, causing a real EFBIG during the image write. The driver
requires an empty Task attachment directory afterward. It never fills the
host disk or changes another process's limits.

Copy across Profiles creates new ids for every Attachment and writes managed
images under the target Task. The compiled CLI/curl drive requires both image
endpoints to return 200, then Purges the source and requires the copy's image
to remain readable. It also proves Copy dry-run counts and byte totals, and
that Move preserves the same Attachment ids and managed paths. The failed-copy
behavior test installs a rejecting trigger only in scratch SQLite and requires
no additional image files after the failed write.
