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
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  releaseRecordingExclusion,
  tryRecordingExclusion,
} from "./recording-exclusion.ts";
import {
  inspectRecordingCatalog,
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
export const recordingOpenRefusals = {
  foreign_header:
    "recordings.db is not a Todo recordings database (its header is not ours).",
  foreign_catalog:
    "recordings.db carries the recordings identifier, but its committed tables differ from this version's.",
  foreign_sidecar:
    "recordings.db is missing or empty, and a -wal, -shm or -journal file beside it either holds data the store cannot prove is its own or is not a private regular file.",
  interrupted_initialization:
    "recordings.db is empty beside a non-empty -journal: initialization stopped before its first commit, and the store cannot prove the journal is its own.",
  hot_journal:
    "A non-empty recordings.db-journal is beside the store; the store never writes one after initialization.",
  oversized: "A recordings file is larger than the recordings disk ceiling.",
  not_private:
    "The recordings directory or recordings.db is not a private regular file (a link, a directory or a shared file).",
  replaced: "recordings.db was replaced while the store was opening it.",
  integrity: "recordings.db failed SQLite's integrity check.",
  initialization_busy:
    "Another process held recordings.db while it was being created; the server retries in one minute.",
  open_failed:
    "The recordings directory could not be opened; the server retries in one minute.",
} as const;
export type RecordingOpenRefusalReason = keyof typeof recordingOpenRefusals;
export const recordingStoreFiles = [
  "recordings.db",
  "recordings.db-wal",
  "recordings.db-shm",
  "recordings.db-journal",
] as const;
export function recordingRefusalGuidance(
  directory: string,
  reason: RecordingOpenRefusalReason,
  present: readonly string[],
) {
  const retrying = reason === "initialization_busy" || reason === "open_failed";
  const files = (
    reason === "not_private" && present.length === 0
      ? [directory]
      : present.map((name) => join(directory, name))
  ).slice(0, recordingStoreFiles.length);
  return {
    state: retrying ? ("retrying" as const) : ("refused" as const),
    reason,
    explanation: recordingOpenRefusals[reason],
    files,
    recovery: retrying
      ? "Recording retries automatically every minute; Task service is unaffected."
      : `Recordings are diagnostic data and may be discarded; Task service is unaffected. Stop the server, remove ${files.join(", ")}, then start it again to create an empty store.`,
  };
}
export function presentRecordingFiles(directory: string) {
  return recordingStoreFiles.filter((name) => {
    try {
      lstatSync(join(directory, name));
      return true;
    } catch {
      return false;
    }
  });
}
export class RecordingOpenRefusal extends Error {
  constructor(
    readonly reason: RecordingOpenRefusalReason,
    message = reason === "initialization_busy"
      ? "Recording initialization busy"
      : reason === "integrity"
        ? "Recording integrity"
        : reason === "open_failed"
          ? "Recording directory unavailable"
          : "Foreign database refused",
  ) {
    super(message);
  }
}
const refuse = (reason: RecordingOpenRefusalReason): never => {
  throw new RecordingOpenRefusal(reason);
};
function ownedHeader(fd: number, cap: number) {
  const stat = fstatSync(fd);
  if (stat.size > cap) refuse("oversized");
  const header = Buffer.alloc(100);
  const size = readSync(fd, header, 0, 100, 0);
  return (
    size === 100 &&
    header.subarray(0, 16).equals(Buffer.from("SQLite format 3\0")) &&
    header.readUInt32BE(68) === recordingApplicationId &&
    header.readUInt32BE(60) === recordingSchemaVersion
  );
}
const sizeOf = (path: string) => {
  try {
    return lstatSync(path).size;
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return undefined;
    throw error;
  }
};
const sameFile = (fd: number, path: string) => {
  const current = fstatSync(fd);
  try {
    const named = lstatSync(path);
    return current.ino === named.ino && current.dev === named.dev;
  } catch {
    return false;
  }
};
function clearEmptySidecars(path: string, sides: readonly string[]) {
  for (const side of sides) {
    const file = path + side;
    let fd: number;
    try {
      fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        continue;
      return refuse("foreign_sidecar");
    }
    try {
      const stat = fstatSync(fd);
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        (side !== "-shm" && stat.size !== 0)
      )
        refuse("foreign_sidecar");
      if (!sameFile(fd, file)) refuse("replaced");
      unlinkSync(file);
    } finally {
      closeSync(fd);
    }
  }
}
function inspect(fd: number, path: string) {
  let wal: number | undefined;
  try {
    wal = openSync(path + "-wal", constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (
      !(
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
    )
      refuse("not_private");
  }
  try {
    if (wal !== undefined) {
      const stat = fstatSync(wal);
      if (!stat.isFile() || stat.nlink !== 1) refuse("not_private");
    }
    const verdict = inspectRecordingCatalog(
      {
        size: fstatSync(fd).size,
        read: (target, position) =>
          readSync(fd, target, 0, target.length, position),
      },
      wal === undefined
        ? undefined
        : {
            size: fstatSync(wal).size,
            read: (target, position) =>
              readSync(wal, target, 0, target.length, position),
          },
      true,
    );
    if (verdict.kind !== "owned") return refuse(verdict.kind);
    return verdict;
  } finally {
    if (wal !== undefined) closeSync(wal);
  }
}
function preflight(path: string, image: Buffer | undefined) {
  const uri = pathToFileURL(path);
  uri.searchParams.set("immutable", "1");
  const existing = image
    ? Database.deserialize(image, true)
    : new Database(uri.href, { readonly: true, strict: true });
  try {
    try {
      recognizeRecordingFormat(existing);
    } catch {
      refuse("foreign_catalog");
    }
    checkIntegrity(existing);
  } finally {
    existing.close();
  }
}
function checkIntegrity(db: Database) {
  let ok = false;
  try {
    ok =
      db.query<{ quick_check: string }, []>("PRAGMA quick_check").get()
        ?.quick_check === "ok" && !db.query("PRAGMA foreign_key_check").get();
  } catch (error) {
    if (busy(error)) throw error;
  }
  if (!ok) refuse("integrity");
}
const busy = (error: unknown) =>
  error instanceof Error && /busy|locked/iu.test(error.message);
const wait = () =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
export function openRecordingDatabase(
  directory: string,
  totalBytes: number,
  boundary?: (point: RecordingOpenPoint) => void,
) {
  if (totalBytes < recordingMinimumBytes) throw new Error("Recording capacity");
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  } catch {
    refuse("open_failed");
  }
  const dir = lstatSync(directory);
  if (!dir.isDirectory() || dir.isSymbolicLink())
    throw new RecordingOpenRefusal("not_private", "Private directory required");
  const path = join(directory, "recordings.db"),
    sides = ["-wal", "-shm", "-journal"];
  const mainSize = sizeOf(path);
  if (mainSize === undefined || mainSize === 0) {
    const journal = sizeOf(path + "-journal");
    if (mainSize === 0 && journal !== undefined && journal > 0)
      refuse("interrupted_initialization");
    for (const side of sides) {
      let stat: ReturnType<typeof lstatSync>;
      try {
        stat = lstatSync(path + side);
      } catch {
        continue;
      }
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        (side !== "-shm" && stat.size > 0)
      )
        refuse("foreign_sidecar");
    }
  }
  let created = false;
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
      return refuse("not_private");
    try {
      fd = openSync(path, constants.O_RDWR | constants.O_NOFOLLOW);
    } catch {
      return refuse("not_private");
    }
  }
  let db: Database | undefined;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) refuse("not_private");
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
          refuse("foreign_header");
        wait();
      } while (performance.now() < until);
      if (excluded) {
        boundary?.("excluded");
        if (!sameFile(fd, path)) refuse("replaced");
        if (fstatSync(fd).size === 0) {
          const journal = sizeOf(path + "-journal");
          if (journal !== undefined && journal > 0)
            refuse("interrupted_initialization");
          clearEmptySidecars(path, sides);
          if (sides.some((s) => existsSync(path + s)))
            refuse("foreign_sidecar");
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
        } else if (!ownedHeader(fd, totalBytes)) refuse("foreign_header");
      } else if (!ownedHeader(fd, totalBytes))
        throw new RecordingOpenRefusal("initialization_busy");
      releaseRecordingExclusion(fd);
    }
    if (!ownedHeader(fd, totalBytes)) refuse("foreign_header");
    for (const s of sides) {
      const size = sizeOf(path + s);
      if (size !== undefined && size > totalBytes) refuse("oversized");
    }
    const journal = sizeOf(path + "-journal");
    if (journal !== undefined && journal > 0) refuse("hot_journal");
    const inspected = inspect(fd, path);
    preflight(path, inspected.image);
    for (let attempt = 0; ; attempt++) {
      if (!sameFile(fd, path)) refuse("replaced");
      if (!tryRecordingExclusion(fd, true)) {
        if (attempt < 49) {
          wait();
          continue;
        }
        throw new RecordingOpenRefusal(
          "initialization_busy",
          "database is locked",
        );
      }
      try {
        db = new Database(path, {
          strict: true,
          readwrite: true,
          create: false,
        });
      } catch {
        return refuse("replaced");
      }
      try {
        if (!sameFile(fd, path)) refuse("replaced");
        db.exec("PRAGMA busy_timeout=1");
        try {
          recognizeRecordingFormat(db);
        } catch (error) {
          if (busy(error)) throw error;
          refuse("foreign_catalog");
        }
      } catch (error) {
        db.close();
        db = undefined;
        releaseRecordingExclusion(fd);
        if (attempt < 49 && busy(error)) {
          wait();
          continue;
        }
        throw error;
      }
      releaseRecordingExclusion(fd);
      break;
    }
  } catch (error) {
    if (db) db.close();
    if (created && fstatSync(fd).size === 0 && sameFile(fd, path))
      unlinkSync(path);
    closeSync(fd);
    if (error instanceof RecordingOpenRefusal) throw error;
    if (busy(error))
      throw new RecordingOpenRefusal(
        "initialization_busy",
        "database is locked",
      );
    throw new RecordingOpenRefusal("foreign_catalog");
  }
  if (!db) {
    closeSync(fd);
    throw new RecordingOpenRefusal("foreign_catalog");
  }
  const opened = db;
  let held = true;
  const handle = {
    db: opened,
    close: () => {
      if (!held) return;
      held = false;
      closeSync(fd);
    },
  };
  for (let attempt = 0; ; attempt++) {
    try {
      chmodSync(directory, 0o700);
      chmodSync(path, 0o600);
      opened.exec(
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
        opened.query("INSERT OR IGNORE INTO counters VALUES(?,0)").run(name);
      const cap = totalBytes;
      opened.exec(
        `PRAGMA max_page_count=${Math.floor(Math.max(2097152, cap - 16777216) / 4096)}`,
      );
      for (const suffix of ["", "-wal", "-shm"])
        try {
          chmodSync(path + suffix, 0o600);
        } catch {}
      return handle;
    } catch (error) {
      if (attempt < 49 && busy(error)) {
        wait();
        continue;
      }
      opened.close();
      handle.close();
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
