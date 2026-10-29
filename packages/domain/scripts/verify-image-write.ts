import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachmentDirectory, writeImage } from "../src/attachment-store.ts";

process.on("SIGXFSZ", () => {});
const root = mkdtempSync(join(tmpdir(), "todo-f11-write-failure-"));
try {
  const bytes = Buffer.alloc(1024 * 1024);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.throws(
    () => writeImage(root, "work", "task-1", "image-1", bytes, "image/png"),
    { code: "EFBIG" },
  );
  assert.deepEqual(
    readdirSync(attachmentDirectory(root, "work", "task-1")),
    [],
  );
  process.stdout.write(
    '{"status":"PASS","realWriteFailure":"EFBIG","partialFiles":0}\n',
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
