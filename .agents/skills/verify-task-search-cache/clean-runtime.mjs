import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const output = process.argv[2];
assert.ok(output, "Pass a fresh cleanup receipt path");
const removed = [];
const skipped = [];
for (const name of readdirSync(root, { recursive: true })) {
  if (
    !name
      .split("/")
      .at(-1)
      ?.match(/^\..*\.bun-build$/)
  )
    continue;
  const path = join(root, name);
  const stat = statSync(path);
  if (!stat.isFile()) continue;
  const open = spawnSync("lsof", ["-t", "--", path], { encoding: "utf8" });
  if (open.status !== 1) {
    skipped.push({ path, status: open.status, pids: open.stdout.trim() });
    continue;
  }
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  unlinkSync(path);
  removed.push({ path, bytes: stat.size, sha256 });
}
const result = {
  timestamp: new Date().toISOString(),
  removed,
  skipped,
  count: removed.length,
  bytes: removed.reduce((sum, file) => sum + file.bytes, 0),
  processStops: 0,
};
writeFileSync(output, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    count: result.count,
    bytes: result.bytes,
    skipped: skipped.length,
    output,
  }),
);
