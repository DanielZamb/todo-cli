import { Database } from "bun:sqlite";
export const recordingApplicationId = 0x544f4452;
export const recordingSchemaVersion = 1;
export const recordingDDL =
  "CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,app TEXT NOT NULL,definition TEXT NOT NULL CHECK(json_extract(definition,'$.run_id')=id AND json_extract(definition,'$.app')=app),admission TEXT NOT NULL,updated INTEGER NOT NULL,CHECK(length(CAST(definition AS BLOB))+length(CAST(admission AS BLOB))<=4096));\n   CREATE TABLE IF NOT EXISTS batches(run TEXT NOT NULL,batch TEXT NOT NULL,fingerprint TEXT NOT NULL,received INTEGER NOT NULL,PRIMARY KEY(run,batch),FOREIGN KEY(run) REFERENCES runs(id) ON DELETE CASCADE);\n   CREATE TABLE IF NOT EXISTS events(ordinal INTEGER PRIMARY KEY AUTOINCREMENT,run TEXT NOT NULL,producer TEXT NOT NULL,sequence INTEGER NOT NULL,cursor TEXT NOT NULL UNIQUE,origin TEXT NOT NULL,content TEXT NOT NULL,fingerprint TEXT NOT NULL,received INTEGER NOT NULL,charge INTEGER NOT NULL CHECK(charge>=2*length(CAST(content AS BLOB))+4096),UNIQUE(run,producer,sequence),FOREIGN KEY(run,origin) REFERENCES batches(run,batch) ON DELETE CASCADE,CHECK(json_extract(content,'$.run_id')=run AND json_extract(content,'$.process_role')=producer AND json_extract(content,'$.sequence')=sequence));\n   CREATE UNIQUE INDEX IF NOT EXISTS event_phase ON events(run,producer,json_extract(content,'$.action_id'),json_extract(content,'$.name')) WHERE json_extract(content,'$.name') IN('ui.input.observed','ui.action.started','ui.action.ended','ui.result.committed');\n   CREATE INDEX IF NOT EXISTS event_age ON events(received,ordinal);CREATE INDEX IF NOT EXISTS event_run ON events(run,ordinal);CREATE INDEX IF NOT EXISTS event_run_age ON events(run,received);CREATE INDEX IF NOT EXISTS event_origin ON events(run,origin);\n   CREATE TABLE IF NOT EXISTS counters(name TEXT PRIMARY KEY,value INTEGER NOT NULL);\n   CREATE TRIGGER IF NOT EXISTS run_conflict BEFORE INSERT ON runs WHEN EXISTS(SELECT 1 FROM runs WHERE id=new.id AND definition<>new.definition) BEGIN SELECT RAISE(ABORT,'run_conflict');END;\n   CREATE TRIGGER IF NOT EXISTS run_capacity BEFORE INSERT ON runs WHEN NOT EXISTS(SELECT 1 FROM runs WHERE id=new.id) AND (SELECT count(*) FROM runs)>=5120 BEGIN SELECT RAISE(ABORT,'run_capacity');END;\n   CREATE TRIGGER IF NOT EXISTS batch_conflict BEFORE INSERT ON batches WHEN EXISTS(SELECT 1 FROM batches WHERE run=new.run AND batch=new.batch AND fingerprint<>new.fingerprint) BEGIN SELECT RAISE(ABORT,'batch_conflict');END;\n   CREATE TRIGGER IF NOT EXISTS sequence_conflict BEFORE INSERT ON events WHEN EXISTS(SELECT 1 FROM events WHERE run=new.run AND producer=new.producer AND sequence=new.sequence AND fingerprint<>new.fingerprint) BEGIN SELECT RAISE(ABORT,'sequence_conflict');END;";
const schemaQuery =
  "SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name";
type SchemaRow = {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
};
const expected = (() => {
  const db = new Database(":memory:");
  try {
    db.exec(recordingDDL);
    return {
      catalog: JSON.stringify(db.query<SchemaRow, []>(schemaQuery).all()),
      minimumBytes:
        (db.query<{ page_count: number }, []>("PRAGMA page_count").get()
          ?.page_count ?? 0) *
        (db.query<{ page_size: number }, []>("PRAGMA page_size").get()
          ?.page_size ?? 4096),
    };
  } finally {
    db.close();
  }
})();
export const recordingMinimumBytes = expected.minimumBytes;
export function recognizeRecordingFormat(db: Database) {
  if (
    db.query<{ application_id: number }, []>("PRAGMA application_id").get()
      ?.application_id !== recordingApplicationId ||
    db.query<{ user_version: number }, []>("PRAGMA user_version").get()
      ?.user_version !== recordingSchemaVersion ||
    JSON.stringify(db.query<SchemaRow, []>(schemaQuery).all()) !==
      expected.catalog
  )
    throw new Error("Foreign database refused");
}

export type RecordingCatalogVerdict =
  | { readonly kind: "owned"; readonly committedFrames: number }
  | { readonly kind: "foreign_header" | "foreign_catalog" };
type Read = (target: Buffer, position: number) => number;
const walChecksum = (
  s: [number, number],
  data: Buffer,
  bigEndian: boolean,
): [number, number] => {
  let [s0, s1] = s;
  for (let i = 0; i + 8 <= data.length; i += 8) {
    const x0 = bigEndian ? data.readUInt32BE(i) : data.readUInt32LE(i);
    const x1 = bigEndian ? data.readUInt32BE(i + 4) : data.readUInt32LE(i + 4);
    s0 = (s0 + x0 + s1) >>> 0;
    s1 = (s1 + x1 + s0) >>> 0;
  }
  return [s0, s1];
};
const varint = (page: Buffer, at: number): [number, number] => {
  let value = 0;
  for (let i = 0; i < 8; i++) {
    const byte = page[at + i];
    if (byte === undefined) throw new Error("catalog");
    value = value * 128 + (byte & 0x7f);
    if (byte < 0x80) return [value, at + i + 1];
  }
  const last = page[at + 8];
  if (last === undefined) throw new Error("catalog");
  return [value * 256 + last, at + 9];
};
export function inspectRecordingCatalog(
  main: { read: Read; size: number },
  wal: { read: Read; size: number } | undefined,
): RecordingCatalogVerdict {
  const header = Buffer.alloc(100);
  if (main.read(header, 0) !== 100) return { kind: "foreign_header" };
  const rawPageSize = header.readUInt16BE(16);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0)
    return { kind: "foreign_header" };
  const committed = new Map<number, number>();
  let pageLimit = Math.floor(main.size / pageSize);
  let committedFrames = 0;
  if (wal && wal.size >= 32) {
    const walHeader = Buffer.alloc(32);
    const magic = wal.read(walHeader, 0) === 32 ? walHeader.readUInt32BE(0) : 0;
    const bigEndian = magic === 0x377f0683;
    let sum = walChecksum([0, 0], walHeader.subarray(0, 24), bigEndian);
    if (
      (magic === 0x377f0682 || bigEndian) &&
      walHeader.readUInt32BE(4) === 3007000 &&
      walHeader.readUInt32BE(8) === pageSize &&
      sum[0] === walHeader.readUInt32BE(24) &&
      sum[1] === walHeader.readUInt32BE(28)
    ) {
      const salt1 = walHeader.readUInt32BE(16),
        salt2 = walHeader.readUInt32BE(20);
      const frame = Buffer.alloc(24 + pageSize);
      const pending = new Map<number, number>();
      for (
        let offset = 32, index = 1;
        offset + frame.length <= wal.size;
        offset += frame.length, index++
      ) {
        if (wal.read(frame, offset) !== frame.length) break;
        const pgno = frame.readUInt32BE(0),
          commit = frame.readUInt32BE(4);
        if (
          pgno === 0 ||
          frame.readUInt32BE(8) !== salt1 ||
          frame.readUInt32BE(12) !== salt2
        )
          break;
        sum = walChecksum(sum, frame.subarray(0, 8), bigEndian);
        sum = walChecksum(sum, frame.subarray(24), bigEndian);
        if (
          sum[0] !== frame.readUInt32BE(16) ||
          sum[1] !== frame.readUInt32BE(20)
        )
          break;
        pending.set(pgno, offset + 24);
        if (commit !== 0) {
          for (const [page, at] of pending) committed.set(page, at);
          pending.clear();
          pageLimit = commit;
          committedFrames = index;
        }
      }
    }
  }
  const visited = new Set<number>();
  const page = (pgno: number) => {
    if (pgno < 1 || pgno > pageLimit || visited.size > 4096)
      throw new Error("catalog");
    const buffer = Buffer.alloc(pageSize);
    const at = committed.get(pgno);
    const read =
      at === undefined
        ? main.read(buffer, (pgno - 1) * pageSize)
        : wal?.read(buffer, at);
    if (read !== pageSize) throw new Error("catalog");
    return buffer;
  };
  try {
    const first = page(1);
    if (
      !first.subarray(0, 16).equals(Buffer.from("SQLite format 3\0")) ||
      first.readUInt32BE(68) !== recordingApplicationId ||
      first.readUInt32BE(60) !== recordingSchemaVersion
    )
      return { kind: "foreign_header" };
    if (first.readUInt32BE(56) !== 1) return { kind: "foreign_catalog" };
    const usable = pageSize - (first[20] ?? 0);
    const rows: SchemaRow[] = [];
    const payload = (buffer: Buffer, at: number) => {
      const [size, afterSize] = varint(buffer, at);
      const [, start] = varint(buffer, afterSize);
      const most = usable - 35;
      const least = Math.floor(((usable - 12) * 32) / 255) - 23;
      const spill = least + ((size - least) % (usable - 4));
      const local = size <= most ? size : spill <= most ? spill : least;
      const parts = [buffer.subarray(start, start + local)];
      let collected = local;
      let next = local < size ? buffer.readUInt32BE(start + local) : 0;
      while (collected < size) {
        if (visited.has(next)) throw new Error("catalog");
        visited.add(next);
        const overflow = page(next);
        const take = Math.min(usable - 4, size - collected);
        parts.push(overflow.subarray(4, 4 + take));
        collected += take;
        next = overflow.readUInt32BE(0);
      }
      return Buffer.concat(parts);
    };
    const record = (data: Buffer) => {
      const [headerSize, typesStart] = varint(data, 0);
      const types: number[] = [];
      for (let at = typesStart; at < headerSize; ) {
        const [type, next] = varint(data, at);
        types.push(type);
        at = next;
      }
      const fixed = [0, 1, 2, 3, 4, 6, 8, 8, 0, 0];
      const values: Array<string | null> = [];
      let at = headerSize;
      for (const type of types) {
        if (type === 10 || type === 11) throw new Error("catalog");
        const size = type >= 12 ? (type - 12) >> 1 : (fixed[type] ?? 0);
        values.push(
          type >= 13 && type % 2 === 1
            ? data.subarray(at, at + size).toString("utf8")
            : type === 0
              ? null
              : "",
        );
        at += size;
      }
      if (at > data.length) throw new Error("catalog");
      return values;
    };
    const walk = (pgno: number) => {
      if (visited.has(pgno)) throw new Error("catalog");
      visited.add(pgno);
      const buffer = pgno === 1 ? first : page(pgno);
      const base = pgno === 1 ? 100 : 0;
      const kind = buffer[base];
      const cells = buffer.readUInt16BE(base + 3);
      const pointers = base + (kind === 0x0d ? 8 : 12);
      if (kind === 0x05) {
        for (let i = 0; i < cells; i++)
          walk(buffer.readUInt32BE(buffer.readUInt16BE(pointers + 2 * i)));
        walk(buffer.readUInt32BE(base + 8));
      } else if (kind === 0x0d) {
        for (let i = 0; i < cells; i++) {
          const values = record(
            payload(buffer, buffer.readUInt16BE(pointers + 2 * i)),
          );
          const [type, name, tbl_name, , sql] = values;
          if (
            typeof type !== "string" ||
            typeof name !== "string" ||
            typeof tbl_name !== "string" ||
            sql === undefined
          )
            throw new Error("catalog");
          rows.push({ type, name, tbl_name, sql });
        }
      } else throw new Error("catalog");
    };
    walk(1);
    const order = (a: SchemaRow, b: SchemaRow) =>
      Buffer.compare(Buffer.from(a.type), Buffer.from(b.type)) ||
      Buffer.compare(Buffer.from(a.name), Buffer.from(b.name));
    return JSON.stringify(rows.sort(order)) === expected.catalog
      ? { kind: "owned", committedFrames }
      : { kind: "foreign_catalog" };
  } catch {
    return { kind: "foreign_catalog" };
  }
}
