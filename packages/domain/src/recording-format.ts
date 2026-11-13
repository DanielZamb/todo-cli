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
