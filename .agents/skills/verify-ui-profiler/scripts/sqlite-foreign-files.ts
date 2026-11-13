import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  chmodSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { RecordingDatabase } from "../../../../packages/domain/src/recordings-sqlite.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-foreign-files",
);
mkdirSync(evidence, { recursive: true });
const results = [];
const snapshot = (dir: string) => ({
  mode: statSync(dir).mode & 511,
  files: readdirSync(dir)
    .sort()
    .map((name) => ({
      name,
      mode: statSync(join(dir, name)).mode & 511,
      sha256: createHash("sha256")
        .update(readFileSync(join(dir, name)))
        .digest("hex"),
    })),
});
for (const fixture of [
  "wal-present",
  "wal-absent",
  "wal-missing-shm",
  "rollback-journal",
]) {
  const root = mkdtempSync(join(tmpdir(), "todo-foreign-files-")),
    path = join(root, "recordings.db"),
    peer = new Database(path);
  try {
    peer.exec(
      "PRAGMA journal_mode=WAL;CREATE TABLE foreign_owner(x TEXT);INSERT INTO foreign_owner VALUES('Foreign fixture');PRAGMA wal_checkpoint(TRUNCATE)",
    );
    if (fixture === "wal-absent") {
      peer.close();
    } else if (fixture === "wal-missing-shm") {
      if (readdirSync(root).includes("recordings.db-shm"))
        unlinkSync(path + "-shm");
    } else if (fixture === "rollback-journal") {
      peer.close();
      writeFileSync(path + "-journal", "Foreign rollback journal");
    }
    chmodSync(root, 0o750);
    for (const f of readdirSync(root))
      chmodSync(join(root, f), f === "recordings.db" ? 0o640 : 0o600);
    const before = snapshot(root);
    assert.throws(() => new RecordingDatabase(root), {
      message: "Foreign database refused",
    });
    const after = snapshot(root);
    results.push({ fixture, before, after });
    writeFileSync(
      join(evidence, "result.json"),
      JSON.stringify({ results }, null, 2),
    );
    assert.deepEqual(after, before);
  } finally {
    try {
      peer.close();
    } catch {}
    rmSync(root, { recursive: true, force: true });
  }
}
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify({ result: "PASS", results }, null, 2),
);
