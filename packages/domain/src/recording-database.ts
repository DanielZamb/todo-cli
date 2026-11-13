import { Database } from "bun:sqlite";
import {
  chmodSync,
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  openSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import {
  recognizeRecordingFormat,
  recordingApplicationId,
  recordingDDL,
  recordingSchemaVersion,
} from "./recording-format.ts";
export function openRecordingDatabase(directory: string, totalBytes: number) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const d = lstatSync(directory);
  if (!d.isDirectory() || d.isSymbolicLink())
    throw new Error("Private directory required");

  const path = join(directory, "recordings.db");
  let created = false;
  try {
    const fd = openSync(
      path,
      constants.O_RDWR |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    closeSync(fd);
    created = true;
  } catch (error) {
    if (
      !(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "EEXIST"
      )
    )
      throw error;
  }
  const initialize = created || lstatSync(path).size === 0;
  if (lstatSync(path).isSymbolicLink() || lstatSync(path).nlink !== 1)
    throw new Error("Private database required");

  if (!initialize) {
    try {
      const existing = new Database(path, { readonly: true, strict: true });
      try {
        recognizeRecordingFormat(existing);

        if (
          existing
            .query<{ quick_check: string }, []>("PRAGMA quick_check")
            .get()?.quick_check !== "ok" ||
          existing.query("PRAGMA foreign_key_check").get()
        )
          throw new Error("Recording integrity");
      } finally {
        existing.close();
      }
    } catch (error) {
      if (error instanceof Error && /locked|busy/iu.test(error.message))
        throw error;
      throw new Error("Foreign database refused");
    }
  }
  const db = new Database(path, { strict: true });
  try {
    chmodSync(directory, 0o700);
    chmodSync(path, 0o600);
    db.exec(
      `PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1; PRAGMA wal_autocheckpoint=64; PRAGMA cache_size=-8192; PRAGMA cache_spill=OFF; PRAGMA journal_size_limit=1048576;`,
    );
    if (initialize)
      db.transaction(() => {
        db.exec(recordingDDL);
        db.exec(
          `PRAGMA application_id=${recordingApplicationId};PRAGMA user_version=${recordingSchemaVersion};`,
        );
      })();
    for (const name of [
      "dropped_batches",
      "dropped_events",
      "expired_events",
      "capacity_events",
      "storage_failures",
      "corrupt_segments",
      "duplicate_batches",
      "uncertain_restarts",
    ])
      db.query("INSERT OR IGNORE INTO counters VALUES(?,0)").run(name);
    if (
      db.query<{ quick_check: string }, []>("PRAGMA quick_check").get()
        ?.quick_check !== "ok" ||
      db.query("PRAGMA foreign_key_check").get()
    )
      throw new Error("Recording integrity");
    const cap = totalBytes;
    db.exec(
      `PRAGMA max_page_count=${Math.floor(Math.max(2097152, cap - 16777216) / 4096)}`,
    );
    for (const suffix of ["", "-wal", "-shm"])
      try {
        chmodSync(path + suffix, 0o600);
      } catch {}
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function guardRecordingCommit(db: Database, cap: number) {
  const pages =
    db.query<{ page_count: number }, []>("PRAGMA page_count").get()
      ?.page_count ?? 0;
  const pageSize =
    db.query<{ page_size: number }, []>("PRAGMA page_size").get()?.page_size ??
    4096;
  const allocation = (path: string) => {
    try {
      const s = statSync(path);
      return Math.max(s.size, s.blocks * 512);
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return 0;
      throw error;
    }
  };
  const main = Math.max(allocation(db.filename), pages * pageSize),
    wal = allocation(db.filename + "-wal");
  if (
    main +
      wal +
      pages * (pageSize + 24) +
      Math.min(1048576, Math.floor(cap / 16)) >
    cap
  )
    throw new Error("Recording physical capacity");
}
