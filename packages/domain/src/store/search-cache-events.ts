import type { Database } from "bun:sqlite";

export const searchCacheEvents = (db: Database, after: number) =>
  db
    .query<
      { seq: number; kind: string; original_kind: string | null },
      [number]
    >(
      "SELECT seq,json_extract(event,'$.kind') AS kind,json_extract(event,'$.original_kind') AS original_kind FROM op_log WHERE seq>? AND outcome='committed' ORDER BY seq",
    )
    .all(after);
