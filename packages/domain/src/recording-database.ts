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
export function openRecordingDatabase(directory: string, totalBytes: number) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const d = lstatSync(directory);
  if (!d.isDirectory() || d.isSymbolicLink())
    throw new Error("Private directory required");
  chmodSync(directory, 0o700);
  const path = join(directory, "recordings.db");
  const fd = openSync(
    path,
    constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW,
    0o600,
  );
  closeSync(fd);
  if (lstatSync(path).isSymbolicLink() || lstatSync(path).nlink !== 1)
    throw new Error("Private database required");
  chmodSync(path, 0o600);
  const db = new Database(path, { strict: true });
  try {
    if (
      db
        .query(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT IN('runs','batches','events','counters','sqlite_sequence') LIMIT 1",
        )
        .get()
    )
      throw new Error("Foreign database refused");
    db.exec(
      `PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1; PRAGMA auto_vacuum=INCREMENTAL; PRAGMA wal_autocheckpoint=64; PRAGMA cache_size=-8192; PRAGMA cache_spill=OFF; PRAGMA journal_size_limit=1048576;`,
    );
    db.exec(`CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,app TEXT NOT NULL,definition TEXT NOT NULL CHECK(json_extract(definition,'$.run_id')=id AND json_extract(definition,'$.app')=app),admission TEXT NOT NULL,updated INTEGER NOT NULL,CHECK(length(CAST(definition AS BLOB))+length(CAST(admission AS BLOB))<=4096));
   CREATE TABLE IF NOT EXISTS batches(run TEXT NOT NULL,batch TEXT NOT NULL,fingerprint TEXT NOT NULL,received INTEGER NOT NULL,PRIMARY KEY(run,batch),FOREIGN KEY(run) REFERENCES runs(id) ON DELETE CASCADE);
   CREATE TABLE IF NOT EXISTS events(ordinal INTEGER PRIMARY KEY AUTOINCREMENT,run TEXT NOT NULL,producer TEXT NOT NULL,sequence INTEGER NOT NULL,cursor TEXT NOT NULL UNIQUE,origin TEXT NOT NULL,content TEXT NOT NULL,fingerprint TEXT NOT NULL,received INTEGER NOT NULL,charge INTEGER NOT NULL CHECK(charge>=2*length(CAST(content AS BLOB))+4096),UNIQUE(run,producer,sequence),FOREIGN KEY(run,origin) REFERENCES batches(run,batch) ON DELETE CASCADE,CHECK(json_extract(content,'$.run_id')=run AND json_extract(content,'$.process_role')=producer AND json_extract(content,'$.sequence')=sequence));
   CREATE UNIQUE INDEX IF NOT EXISTS event_phase ON events(run,producer,json_extract(content,'$.action_id'),json_extract(content,'$.name')) WHERE json_extract(content,'$.name') IN('ui.input.observed','ui.action.started','ui.action.ended','ui.result.committed');
   CREATE INDEX IF NOT EXISTS event_age ON events(received,ordinal);CREATE INDEX IF NOT EXISTS event_run ON events(run,ordinal);CREATE INDEX IF NOT EXISTS event_run_age ON events(run,received);CREATE INDEX IF NOT EXISTS event_origin ON events(run,origin);
   CREATE TABLE IF NOT EXISTS counters(name TEXT PRIMARY KEY,value INTEGER NOT NULL);
   CREATE TRIGGER IF NOT EXISTS run_conflict BEFORE INSERT ON runs WHEN EXISTS(SELECT 1 FROM runs WHERE id=new.id AND definition<>new.definition) BEGIN SELECT RAISE(ABORT,'run_conflict');END;
   CREATE TRIGGER IF NOT EXISTS run_capacity BEFORE INSERT ON runs WHEN NOT EXISTS(SELECT 1 FROM runs WHERE id=new.id) AND (SELECT count(*) FROM runs)>=5120 BEGIN SELECT RAISE(ABORT,'run_capacity');END;
   CREATE TRIGGER IF NOT EXISTS batch_conflict BEFORE INSERT ON batches WHEN EXISTS(SELECT 1 FROM batches WHERE run=new.run AND batch=new.batch AND fingerprint<>new.fingerprint) BEGIN SELECT RAISE(ABORT,'batch_conflict');END;
   CREATE TRIGGER IF NOT EXISTS sequence_conflict BEFORE INSERT ON events WHEN EXISTS(SELECT 1 FROM events WHERE run=new.run AND producer=new.producer AND sequence=new.sequence AND fingerprint<>new.fingerprint) BEGIN SELECT RAISE(ABORT,'sequence_conflict');END;`);
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
