import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { RecordingDatabase } from "../src/recordings-sqlite.ts";

for (const fixture of [
  "events",
  "columns",
  "identifier",
  "version",
  "index",
  "trigger",
] as const) {
  it(`SQL8 refuses ${fixture} without changing bytes or modes`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "todo-recording-format-"));
    const path = join(dir, "recordings.db");
    try {
      if (fixture !== "events") new RecordingDatabase(dir).close();
      const db = new Database(path);
      switch (fixture) {
        case "events":
          db.exec(
            "CREATE TABLE events(x TEXT); INSERT INTO events VALUES('Foreign row')",
          );
          break;
        case "columns":
          db.exec("ALTER TABLE events RENAME COLUMN content TO wrong_content");
          break;
        case "identifier":
          db.exec("PRAGMA application_id=7");
          break;
        case "version":
          db.exec("PRAGMA user_version=7");
          break;
        case "index":
          db.exec("DROP INDEX event_age");
          break;
        case "trigger":
          db.exec("DROP TRIGGER sequence_conflict");
          break;
      }
      db.close();
      await chmod(path, 0o640);
      await chmod(dir, 0o750);
      const hash = async () =>
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex");
      const before = await hash();
      expect(() => new RecordingDatabase(dir)).toThrow(
        "Foreign database refused",
      );
      expect(await hash()).toBe(before);
      expect((await stat(path)).mode & 0o777).toBe(0o640);
      expect((await stat(dir)).mode & 0o777).toBe(0o750);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
it("reopens its real format and initializes an existing empty file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "todo-recording-owned-"));
  try {
    await writeFile(join(dir, "recordings.db"), "");
    const a = new RecordingDatabase(dir);
    expect(a.db.query("PRAGMA application_id").get()).toEqual({
      application_id: 0x544f4452,
    });
    expect(a.db.query("PRAGMA user_version").get()).toEqual({
      user_version: 1,
    });
    a.close();
    const b = new RecordingDatabase(dir);
    expect(b.status().segments).toBe(0);
    b.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
