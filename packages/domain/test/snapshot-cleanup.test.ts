import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "@effect/vitest";
import {
  proveSnapshotCleanup,
  proveSnapshotRedactionStability,
} from "../scripts/snapshot-cleanup-proof.ts";

for (const scenario of [
  "warm-pre-pending",
  "warm-post-pending",
  "fresh-pre-pending",
  "fresh-post-pending",
  "warm-pre-drained",
  "warm-post-drained",
  "fresh-pre-drained",
  "fresh-post-drained",
]) {
  it(`retains only Purge erasure jobs through ${scenario} restore and preserves a restored Deleted Task's image`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "todo-snapshot-cleanup-"));
    try {
      await proveSnapshotCleanup(directory, scenario);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60000);
}

it("reapplying a Purge union leaves saved Snapshot bytes and checksums stable", async () => {
  const directory = mkdtempSync(join(tmpdir(), "todo-snapshot-stability-"));
  try {
    await proveSnapshotRedactionStability(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
