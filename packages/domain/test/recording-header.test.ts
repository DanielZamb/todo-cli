import { createHash } from "node:crypto";
import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { RecordingDatabase } from "../src/recordings-sqlite.ts";

const snapshot = async (dir: string) => ({
  mode: (await stat(dir)).mode & 511,
  files: await Promise.all(
    (await readdir(dir)).sort().map(async (name) => ({
      name,
      mode: (await stat(join(dir, name))).mode & 511,
      sha256: createHash("sha256")
        .update(await readFile(join(dir, name)))
        .digest("hex"),
    })),
  ),
});
for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  it(`SQL8 refuses an oversized ${suffix || "main"} file without touching its files or modes`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "todo-oversized-recording-"));
    const path = join(dir, "recordings.db"),
      cap = 2097152;
    try {
      new RecordingDatabase(dir, { totalBytes: cap }).close();
      if (suffix) await writeFile(path + suffix, "");
      await truncate(path + suffix, cap + 1);
      await chmod(dir, 0o750);
      await chmod(path, 0o640);
      const before = await snapshot(dir);
      expect(() => new RecordingDatabase(dir, { totalBytes: cap })).toThrow(
        "Foreign database refused",
      );
      expect(await snapshot(dir)).toEqual(before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
it("refuses an impossible metadata cap before creating a database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "todo-tiny-recording-cap-"));
  try {
    await chmod(dir, 0o750);
    const before = await snapshot(dir);
    expect(() => new RecordingDatabase(dir, { totalBytes: 8192 })).toThrow(
      "Recording capacity",
    );
    expect(await snapshot(dir)).toEqual(before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
