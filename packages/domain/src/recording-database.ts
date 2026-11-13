import { Database } from "bun:sqlite";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tryRecordingExclusion } from "./recording-exclusion.ts";
import {
  recognizeRecordingFormat,
  recordingApplicationId,
  recordingDDL,
  recordingMinimumBytes,
  recordingSchemaVersion,
} from "./recording-format.ts";
export type RecordingOpenPoint =
  | "before_exclusion"
  | "excluded"
  | "initialized";
function ownedHeader(fd: number, cap: number) {
  const stat = fstatSync(fd);
  if (stat.size > cap) throw new Error("Foreign database refused");
  const header = Buffer.alloc(100);
  const size = readSync(fd, header, 0, 100, 0);
  return (
    size === 100 &&
    header.subarray(0, 16).equals(Buffer.from("SQLite format 3\0")) &&
    header.readUInt32BE(68) === recordingApplicationId &&
    header.readUInt32BE(60) === recordingSchemaVersion
  );
}
function preflight(path: string) {
  const uri = pathToFileURL(path);
  uri.searchParams.set("immutable", "1");
  const existing = new Database(uri.href, { readonly: true, strict: true });
  try {
    recognizeRecordingFormat(existing);
  } finally {
    existing.close();
  }
}
export function openRecordingDatabase(
  directory: string,
  totalBytes: number,
  boundary?: (point: RecordingOpenPoint) => void,
) {
  if (totalBytes < recordingMinimumBytes) throw new Error("Recording capacity");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const dir = lstatSync(directory);
  if (!dir.isDirectory() || dir.isSymbolicLink())
    throw new Error("Private directory required");
  const path = join(directory, "recordings.db"),
    sides = ["-wal", "-shm", "-journal"];
  if (!existsSync(path) && sides.some((s) => existsSync(path + s)))
    throw new Error("Foreign database refused");
  let fd: number;
  try {
    fd = openSync(
      path,
      constants.O_RDWR |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
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
    fd = openSync(path, constants.O_RDWR | constants.O_NOFOLLOW);
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1)
      throw new Error("Private database required");
    if (stat.size === 0) {
      boundary?.("before_exclusion");
      let excluded = false;
      const until = performance.now() + 100;
      do {
        excluded = tryRecordingExclusion(fd);
        if (excluded) break;
        if (
          ownedHeader(fd, totalBytes) &&
          !existsSync(path + "-journal") &&
          tryRecordingExclusion(fd, true)
        )
          break;
        if (fstatSync(fd).size > 0 && !ownedHeader(fd, totalBytes))
          throw new Error("Foreign database refused");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
      } while (performance.now() < until);
      if (excluded) {
        boundary?.("excluded");
        const current = fstatSync(fd),
          named = lstatSync(path);
        if (current.ino !== named.ino || current.dev !== named.dev)
          throw new Error("Foreign database refused");
        if (current.size === 0) {
          if (sides.some((s) => existsSync(path + s)))
            throw new Error("Foreign database refused");
          const uri = pathToFileURL(path);
          uri.searchParams.set("vfs", "unix-none");
          const initial = new Database(uri.href, { strict: true });
          try {
            initial.exec(
              "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;",
            );
            initial.transaction(() => {
              initial.exec(recordingDDL);
              initial.exec(
                `PRAGMA application_id=${recordingApplicationId};PRAGMA user_version=${recordingSchemaVersion};`,
              );
            })();
            boundary?.("initialized");
          } finally {
            initial.close();
          }
        } else if (!ownedHeader(fd, totalBytes))
          throw new Error("Foreign database refused");
      } else if (!ownedHeader(fd, totalBytes))
        throw new Error("Recording initialization busy");
    }
    if (!ownedHeader(fd, totalBytes))
      throw new Error("Foreign database refused");
    if (
      sides.some(
        (s) => existsSync(path + s) && lstatSync(path + s).size > totalBytes,
      )
    )
      throw new Error("Foreign database refused");
    preflight(path);
  } catch (error) {
    if (error instanceof Error && /busy|locked/iu.test(error.message))
      throw error;
    throw new Error("Foreign database refused");
  } finally {
    closeSync(fd);
  }
  for (let attempt = 0; ; attempt++) {
    const db = new Database(path, { strict: true });
    try {
      db.exec("PRAGMA busy_timeout=1");
      recognizeRecordingFormat(db);
      chmodSync(directory, 0o700);
      chmodSync(path, 0o600);
      db.exec(
        `PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1; PRAGMA wal_autocheckpoint=64; PRAGMA cache_size=-8192; PRAGMA cache_spill=OFF; PRAGMA journal_size_limit=1048576;`,
      );
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
      if (
        attempt < 49 &&
        error instanceof Error &&
        /busy|locked/iu.test(error.message)
      ) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
        continue;
      }
      throw error;
    }
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
