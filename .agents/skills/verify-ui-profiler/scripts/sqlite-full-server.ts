import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { statfsSync, statSync } from "node:fs";
import { DiagnosticRecordings } from "../../../../packages/domain/src/recordings.ts";
const original = DiagnosticRecordings.start;
assert.ok(process.env.TODO_DB);
const root = dirname(process.env.TODO_DB);
assert.equal(root, resolve(".scratch/recordings-sqlite-disk-full"));
const volume = join(root, "volume");
assert.notEqual(statSync(volume).dev, statSync(root).dev);
const fs = statfsSync(volume);
assert.ok(
  fs.blocks * fs.bsize < 20 * 1024 * 1024,
  "Only the owned 10MiB volume may be filled",
);
Reflect.set(
  DiagnosticRecordings,
  "start",
  (
    _directory: string,
    options: Parameters<typeof DiagnosticRecordings.start>[1],
  ) =>
    original.call(
      DiagnosticRecordings,
      join(volume, "diagnostic-recordings"),
      options,
    ),
);
await import("../../../../apps/server/src/main.ts");
