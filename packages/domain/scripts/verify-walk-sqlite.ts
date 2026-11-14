// Proves, in the SQLite this compiled binary actually loads, that the refusal
// walk reads no large event except the ones it samples. First, every overflow
// page of 20 large rows (fewer than one sampling interval) is zeroed, after
// which any read of their content fails as corrupt, while octet_length() and
// the production walk still answer. Second, of 600 large rows only the two the
// walk samples are left readable.
import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import {
  closeSync,
  mkdirSync,
  openSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { Schema } from "effect";
import {
  largeRowsBetweenSamples,
  maxWalkedEventBytes,
  repeatedAuthRejection,
} from "../src/auth/rejection-history.ts";
import { ProfileId } from "../src/ids.ts";

const [directory, evidence] = process.argv.slice(2);
assert.ok(directory && isAbsolute(directory));
assert.ok(evidence && isAbsolute(evidence));
mkdirSync(directory, { recursive: true });
mkdirSync(evidence, { recursive: true });
const path = join(directory, "walk.db");
const profile = Schema.decodeUnknownSync(ProfileId)("work");
const time = Date.parse("2026-11-13T00:20:00.001Z");
const db = new Database(path, { create: true });
db.exec(
  "CREATE TABLE op_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, profile TEXT, entity_version INTEGER NOT NULL, event TEXT NOT NULL, from_version INTEGER, to_version INTEGER, outcome TEXT NOT NULL, reason TEXT); CREATE INDEX op_log_profile_seq ON op_log(profile, seq);",
);
const library = db
  .query<{ version: string; source: string }, []>(
    "SELECT sqlite_version() AS version, sqlite_source_id() AS source",
  )
  .get();
const insert = db.query(
  "INSERT INTO op_log(actor,profile,entity_version,event,outcome,reason) VALUES (?,?,1,?,?,?)",
);
insert.run(
  "tok_walk",
  profile,
  JSON.stringify({
    kind: "AuthAttemptRejected",
    code: "auth",
    detail: "invalid_credential",
    action: "authenticate",
    entity_version: 1,
    occurred_at: "2026-11-13T00:20:00.001Z",
  }),
  "rejected",
  "auth",
);
const large = JSON.stringify({
  kind: "TaskCreated",
  entity_version: 1,
  occurred_at: "2026-11-13T00:19:59.999Z",
  task: { description: "x".repeat(100_000) },
});
for (let i = 0; i < 20; i++)
  insert.run("import", profile, large, "committed", null);
const pageSize =
  db.query<{ page_size: number }, []>("PRAGMA page_size").get()?.page_size ?? 0;
const overflow = db
  .query<{ pageno: number }, []>(
    "SELECT pageno FROM dbstat WHERE name='op_log' AND pagetype='overflow'",
  )
  .all()
  .map((row) => row.pageno);
const plan = db
  .query<{ detail: string }, [string]>(
    "EXPLAIN QUERY PLAN SELECT octet_length(event) FROM op_log WHERE profile IS ? ORDER BY seq DESC",
  )
  .all(profile)
  .map((row) => row.detail);
db.close();
const file = openSync(path, "r+");
for (const page of overflow)
  writeSync(file, Buffer.alloc(pageSize), 0, pageSize, (page - 1) * pageSize);
closeSync(file);
const check = new Database(path, { readonly: true });
const attempt = (sql: string) => {
  try {
    return { ok: check.query(sql).all(profile).length };
  } catch (error) {
    return { error: String(error) };
  }
};
const result = {
  library,
  pageSize,
  overflowPagesZeroed: overflow.length,
  largeEventBytes: Buffer.byteLength(large),
  maxWalkedEventBytes,
  plan,
  octetLength: attempt(
    "SELECT octet_length(event) FROM op_log WHERE profile IS ? ORDER BY seq DESC",
  ),
  length: attempt(
    "SELECT length(event) FROM op_log WHERE profile IS ? ORDER BY seq DESC",
  ),
  outcomeAfterEvent: attempt(
    "SELECT outcome FROM op_log WHERE profile IS ? ORDER BY seq DESC",
  ),
  walk: repeatedAuthRejection(check, {
    actor: "tok_walk",
    profile,
    action: "authenticate",
    detail: "invalid_credential",
    time,
  }),
};
check.close();

// Sampling: 600 large rows inside the window above a refusal. The walk meets
// them newest first and reads only the (K+1)-th and 2(K+1)-th. Zero every
// other large row's overflow pages: the walk still finds the refusal. Zero a
// sampled one too: it fails as corrupt, so sampling really reads that row.
const path2 = join(directory, "walk-sampling.db");
const db2 = new Database(path2, { create: true });
db2.exec(
  "CREATE TABLE op_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, profile TEXT, entity_version INTEGER NOT NULL, event TEXT NOT NULL, from_version INTEGER, to_version INTEGER, outcome TEXT NOT NULL, reason TEXT); CREATE INDEX op_log_profile_seq ON op_log(profile, seq);",
);
const insert2 = db2.query(
  "INSERT INTO op_log(actor,profile,entity_version,event,outcome,reason) VALUES (?,?,1,?,?,?)",
);
insert2.run(
  "tok_walk",
  profile,
  JSON.stringify({
    kind: "AuthAttemptRejected",
    code: "auth",
    detail: "invalid_credential",
    action: "authenticate",
    entity_version: 1,
    occurred_at: "2026-11-13T00:20:00.001Z",
  }),
  "rejected",
  "auth",
);
const medium = JSON.stringify({
  kind: "TaskEdited",
  entity_version: 1,
  occurred_at: "2026-11-13T00:19:59.999Z",
  after: { description: "y".repeat(5_000) },
});
for (let i = 0; i < 600; i++)
  insert2.run("import", profile, medium, "committed", null);
const seqs = db2
  .query<{ seq: number }, []>("SELECT seq FROM op_log ORDER BY seq")
  .all()
  .map((row) => row.seq);
const pages = db2
  .query<{ path: string; pageno: number; pagetype: string; ncell: number }, []>(
    "SELECT path,pageno,pagetype,ncell FROM dbstat WHERE name='op_log' ORDER BY path",
  )
  .all();
db2.close();
const first = new Map<string, number>();
let ordinal = 0;
for (const page of pages)
  if (page.pagetype === "leaf") {
    first.set(page.path, ordinal);
    ordinal += page.ncell;
  }
const bySeq = new Map<number, number[]>();
for (const page of pages) {
  const match = /^(.*\/)([0-9a-f]{3})\+[0-9a-f]{6}$/.exec(page.path);
  if (page.pagetype !== "overflow" || !match) continue;
  const seq =
    seqs[
      (first.get(match[1] ?? "") ?? 0) + Number.parseInt(match[2] ?? "", 16)
    ];
  assert.ok(seq !== undefined, page.path);
  bySeq.set(seq, [...(bySeq.get(seq) ?? []), page.pageno]);
}
const largeSeqs = seqs.slice(1).reverse();
const sampled = [
  largeSeqs[largeRowsBetweenSamples],
  largeSeqs[2 * largeRowsBetweenSamples + 1],
].filter((seq): seq is number => seq !== undefined);
const zero = (targets: number[]) => {
  const handle = openSync(path2, "r+");
  for (const seq of targets)
    for (const page of bySeq.get(seq) ?? [])
      writeSync(
        handle,
        Buffer.alloc(pageSize),
        0,
        pageSize,
        (page - 1) * pageSize,
      );
  closeSync(handle);
};
const walk2 = () => {
  const reader = new Database(path2, { readonly: true });
  try {
    return {
      found: repeatedAuthRejection(reader, {
        actor: "tok_walk",
        profile,
        action: "authenticate",
        detail: "invalid_credential",
        time,
      }),
    };
  } catch (error) {
    return { error: String(error) };
  } finally {
    reader.close();
  }
};
zero(largeSeqs.filter((seq) => !sampled.includes(seq)));
const unsampledZeroed = walk2();
zero(sampled.slice(0, 1));
const sampledZeroed = walk2();
Object.assign(result, {
  sampling: {
    largeRows: largeSeqs.length,
    largeRowsBetweenSamples,
    sampledSeqs: sampled,
    zeroedRows: largeSeqs.length - sampled.length,
    unsampledZeroed,
    sampledZeroed,
  },
});
writeFileSync(
  join(evidence, "walk-sqlite.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
assert.ok(overflow.length > 400);
assert.deepEqual(result.octetLength, { ok: 21 });
assert.match(result.length.error ?? "", /malformed/);
assert.match(result.outcomeAfterEvent.error ?? "", /malformed/);
assert.equal(result.walk, true);
assert.deepEqual(unsampledZeroed, { found: true });
assert.match(sampledZeroed.error ?? "", /malformed/);
assert.deepEqual(plan, [
  "SEARCH op_log USING INDEX op_log_profile_seq (profile=?)",
]);
console.log(
  `PASS walk reads only sampled large events: SQLite ${library?.version}`,
);
