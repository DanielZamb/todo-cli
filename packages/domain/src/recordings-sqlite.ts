import type { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { Schema } from "effect";
import {
  type RecordingBatch,
  RecordingRun,
  RecordingSummaryRow,
  recordingLimits,
  validateRecordingBatch,
} from "./diagnostic-recordings.ts";
import {
  analyzeRecording,
  recordingComparisonRefusal,
} from "./diagnostic-run-summary.ts";
import {
  emptyRecordingAdmission,
  type RecordingAdmission,
  recordingRunDefinition,
} from "./recording-admission.ts";
import {
  guardRecordingCommit,
  openRecordingDatabase,
} from "./recording-database.ts";
import { recordingEventContent } from "./recording-event-identity.ts";
import { RecordingRefusal } from "./recording-refusal.ts";

const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const bytes = (s: string) => Buffer.byteLength(s);
const charge = (s: string) => Math.ceil((bytes(s) * 2 + 4096) / 1024) * 1024;
const maximum: RecordingAdmission = {
  schema_version: 1,
  policy: "whole_batch",
  refused_batches: Number.MAX_SAFE_INTEGER,
  unadmitted_events: Number.MAX_SAFE_INTEGER,
  incomplete: true,
};
const merge = (
  a = emptyRecordingAdmission(),
  b = emptyRecordingAdmission(),
): RecordingAdmission => ({
  schema_version: 1,
  policy: "whole_batch",
  refused_batches:
    a.refused_batches === null || b.refused_batches === null
      ? null
      : Math.max(a.refused_batches, b.refused_batches),
  unadmitted_events:
    a.unadmitted_events === null || b.unadmitted_events === null
      ? null
      : Math.max(a.unadmitted_events, b.unadmitted_events),
  incomplete: a.incomplete || b.incomplete,
});
const zero = () => ({
  dropped_batches: 0,
  dropped_events: 0,
  expired_events: 0,
  capacity_events: 0,
  storage_failures: 0,
  corrupt_segments: 0,
  duplicate_batches: 0,
  uncertain_restarts: 0,
});
type RunRow = {
  id: string;
  definition: string;
  admission: string;
  updated: number;
  app: string;
};
type EventRow = {
  ordinal: number;
  cursor: string;
  origin: string;
  content: string;
  charge: number;
  run: string;
  received: number;
};
export type RecordingDatabaseOptions = {
  appBytes?: number;
  totalBytes?: number;
  boundary?: (point: string) => void;
};
export class RecordingDatabase {
  readonly db: Database;
  private readonly recoveredThrough: number;
  private failures = zero();
  private now = Date.now();
  at(now: number) {
    this.now = now;
  }
  readonly timings: number[] = [];
  constructor(
    directory: string,
    private readonly options: RecordingDatabaseOptions = {},
  ) {
    this.db = openRecordingDatabase(
      directory,
      options.totalBytes ?? recordingLimits.totalBytes,
    );
    this.recoveredThrough =
      this.db
        .query<{ n: number }, []>(
          "SELECT coalesce(max(ordinal),0) n FROM events",
        )
        .get()?.n ?? 0;
  }

  private count(name: keyof ReturnType<typeof zero>, n: number) {
    if (n === 0) return;
    this.db
      .query("UPDATE counters SET value=value+? WHERE name=?")
      .run(n, name);
  }
  private transaction<A>(run: () => A, dry = false): A {
    const start = performance.now();
    this.options.boundary?.("before_begin");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.options.boundary?.("after_begin");
      const result = run();
      if (!dry)
        guardRecordingCommit(
          this.db,
          this.options.totalBytes ?? recordingLimits.totalBytes,
        );
      this.options.boundary?.("before_commit");
      this.db.exec(dry ? "ROLLBACK" : "COMMIT");
      this.options.boundary?.("after_commit");
      return result;
    } catch (e) {
      if (this.db.inTransaction) this.db.exec("ROLLBACK");
      if (e instanceof Error && e.message === "Recording physical capacity")
        try {
          this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        } catch {}
      throw e;
    } finally {
      this.timings.push(performance.now() - start);
      if (this.timings.length > 256) this.timings.shift();
    }
  }
  private row(id: string) {
    return this.db
      .query<RunRow, [string]>("SELECT * FROM runs WHERE id=?")
      .get(id);
  }
  private run(row: RunRow) {
    const expired = this.db
      .query("SELECT 1 FROM events WHERE run=? AND received<? LIMIT 1")
      .get(row.id, this.now - recordingLimits.retentionMs);
    return Schema.decodeUnknownSync(RecordingRun)({
      ...JSON.parse(row.definition),
      admission: {
        ...JSON.parse(row.admission),
        ...(expired ? { incomplete: true } : {}),
      },
    });
  }
  private loss() {
    const result = zero();
    for (const row of this.db
      .query<{ name: keyof typeof result; value: number }, []>(
        "SELECT * FROM counters",
      )
      .all())
      result[row.name] = row.value;
    for (const key of Object.keys(this.failures))
      if (key in result) {
        const k = Schema.decodeUnknownSync(
          Schema.Literals([
            "dropped_batches",
            "dropped_events",
            "expired_events",
            "capacity_events",
            "storage_failures",
            "corrupt_segments",
            "duplicate_batches",
            "uncertain_restarts",
          ]),
        )(key);
        result[k] += this.failures[k];
      }
    return result;
  }
  status() {
    return {
      bytes:
        this.db
          .query<{ n: number }, []>(
            "SELECT coalesce(sum(charge),0) n FROM events",
          )
          .get()?.n ?? 0,
      queued_bytes: 0,
      segments:
        this.db.query<{ n: number }, []>("SELECT count(*) n FROM batches").get()
          ?.n ?? 0,
      admission_bytes:
        (this.db.query<{ n: number }, []>("SELECT count(*) n FROM runs").get()
          ?.n ?? 0) * 4096,
      loss: this.loss(),
    };
  }
  private mark(id: string, events: number, refusal = false) {
    const add = (n: number | null, v: number) =>
      n === null || !Number.isSafeInteger(n + v) ? null : n + v;
    const row = this.row(id);
    if (!row) return;
    const a = this.run(row).admission ?? emptyRecordingAdmission();
    this.db.query("UPDATE runs SET admission=? WHERE id=?").run(
      JSON.stringify({
        ...a,
        incomplete: true,
        refused_batches: add(a.refused_batches, Number(refusal)),
        unadmitted_events: add(a.unadmitted_events, refusal ? events : 0),
      }),
      id,
    );
  }
  private remove(rows: EventRow[], expired: boolean) {
    if (!rows.length) return;
    const ordinals = JSON.stringify(rows.map((r) => r.ordinal));
    this.db
      .query(
        "UPDATE runs SET admission=json_set(admission,'$.incomplete',json('true')) WHERE id IN(SELECT run FROM events WHERE ordinal IN(SELECT value FROM json_each(?)))",
      )
      .run(ordinals);
    const removed = this.db
      .query(
        "DELETE FROM events WHERE ordinal IN(SELECT value FROM json_each(?))",
      )
      .run(ordinals).changes;
    this.count("dropped_events", removed);
    this.count(expired ? "expired_events" : "capacity_events", removed);
    const batches = this.db
      .query(
        "DELETE FROM batches WHERE NOT EXISTS(SELECT 1 FROM events WHERE events.run=batches.run AND origin=batches.batch)",
      )
      .run().changes;
    this.count("dropped_batches", batches);
  }
  private bounded(rows: EventRow[]) {
    let size = 0;
    return rows.filter((r) => {
      size += r.charge;
      return size <= 1048576;
    });
  }
  private prune(now: number) {
    const rows = this.bounded(
      this.db
        .query<EventRow, [number]>(
          "SELECT ordinal,run,origin,charge,received,cursor,content FROM events WHERE received<? ORDER BY received,ordinal LIMIT 128",
        )
        .all(now - recordingLimits.retentionMs),
    );
    this.remove(rows, true);
    this.db
      .query(
        "DELETE FROM runs WHERE id IN(SELECT id FROM runs WHERE updated<? AND NOT EXISTS(SELECT 1 FROM events WHERE run=runs.id) LIMIT 128)",
      )
      .run(now - recordingLimits.retentionMs);
    return rows.length;
  }
  maintenance(now: number) {
    this.now = now;
    try {
      return this.transaction(() => this.prune(now));
    } catch {
      this.failures.storage_failures++;
      return -1;
    }
  }
  private usage(app?: string) {
    return (
      this.db
        .query<
          { n: number },
          [
            string | null,
            string | null,
            string | null,
            string | null,
            string | null,
            string | null,
          ]
        >(
          `SELECT coalesce((SELECT sum(charge) FROM events e JOIN runs r ON e.run=r.id WHERE ? IS NULL OR r.app=?),0)+(SELECT count(*)*4096 FROM runs WHERE ? IS NULL OR app=?)+(SELECT count(*)*512 FROM batches b JOIN runs r ON b.run=r.id WHERE ? IS NULL OR r.app=?) n`,
        )
        .get(
          app ?? null,
          app ?? null,
          app ?? null,
          app ?? null,
          app ?? null,
          app ?? null,
        )?.n ?? 0
    );
  }
  private fit(app: string, keep: string, batch = "") {
    let work = 0;
    const ac = this.options.appBytes ?? recordingLimits.appBytes,
      tc = this.options.totalBytes ?? recordingLimits.totalBytes;
    for (;;) {
      const overApp =
          this.usage(app) > ac - Math.min(1048576, Math.floor(ac / 8)),
        overTotal = this.usage() > tc - Math.min(1048576, Math.floor(tc / 8)),
        overBatches =
          (this.db
            .query<{ n: number }, []>("SELECT count(*) n FROM batches")
            .get()?.n ?? 0) > recordingLimits.segments;
      if (!overApp && !overTotal && !overBatches) return;
      const rows = this.db
        .query<EventRow, [string | null, string | null, string, string]>(
          `SELECT e.* FROM events e WHERE (e.run,e.origin)=(SELECT x.run,x.origin FROM events x JOIN runs r ON r.id=x.run WHERE (? IS NULL OR r.app=?) AND NOT(x.run=? AND x.origin=?) ORDER BY x.received,x.ordinal LIMIT 1) ORDER BY e.ordinal LIMIT 128`,
        )
        .all(overApp ? app : null, overApp ? app : null, keep, batch);
      const selected = this.bounded(rows);
      if (selected.length) {
        work += selected.length;
        if (work > 512) throw new Error("Transaction capacity");
        this.remove(selected, false);
      } else {
        const row = this.db
          .query<{ id: string }, [string, string | null, string | null]>(
            `SELECT id FROM runs WHERE id<>? AND (? IS NULL OR app=?) AND NOT EXISTS(SELECT 1 FROM events WHERE run=runs.id) ORDER BY updated LIMIT 1`,
          )
          .get(keep, overApp ? app : null, overApp ? app : null);
        if (!row) throw new Error("Recording capacity");
        this.db.query("DELETE FROM runs WHERE id=?").run(row.id);
        if (++work > 512) throw new Error("Transaction capacity");
      }
    }
  }
  ingest(input: unknown, now: number, dry = false) {
    this.now = now;
    const b = validateRecordingBatch(input);
    let duplicate = false,
      reason:
        | "admission_action_conflict"
        | "admission_sequence_conflict"
        | "admission_batch_conflict"
        | "admission_run_conflict"
        | undefined;
    try {
      this.transaction(() => {
        this.prune(now);
        const expiredInput = this.db
          .query<EventRow, [string, number, string, string]>(
            "SELECT * FROM events WHERE run=? AND received<? AND (origin=? OR EXISTS(SELECT 1 FROM json_each(?) WHERE json_extract(value,'$.producer')=events.producer AND json_extract(value,'$.sequence')=events.sequence)) LIMIT 256",
          )
          .all(
            b.run.run_id,
            now - recordingLimits.retentionMs,
            b.batch_id,
            JSON.stringify(
              b.events.map((e) => ({
                producer: e.process_role,
                sequence: e.sequence,
              })),
            ),
          );
        this.remove(expiredInput, true);
        this.db.exec("SAVEPOINT incoming");
        try {
          const def = JSON.stringify(recordingRunDefinition(b.run));
          this.db
            .query(
              "INSERT INTO runs VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
            )
            .run(
              b.run.run_id,
              b.run.app,
              def,
              JSON.stringify(emptyRecordingAdmission()),
              now,
            );
          const existing = this.row(b.run.run_id);
          if (!existing) throw new Error("Missing run");
          const admission = merge(
            this.run(existing).admission,
            b.run.admission,
          );
          this.db
            .query("UPDATE runs SET admission=?,updated=? WHERE id=?")
            .run(JSON.stringify(admission), now, b.run.run_id);
          const fp = digest(
            JSON.stringify({ ...b, run: recordingRunDefinition(b.run) }),
          );
          if (b.events.length)
            this.db
              .query(
                "INSERT INTO batches VALUES(?,?,?,?) ON CONFLICT(run,batch) DO NOTHING",
              )
              .run(b.run.run_id, b.batch_id, fp, now);
          let added = 0;
          for (const e of b.events) {
            const text = JSON.stringify(e);
            added += this.db
              .query(
                "INSERT INTO events(run,producer,sequence,cursor,origin,content,fingerprint,received,charge) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(run,producer,sequence) DO NOTHING",
              )
              .run(
                b.run.run_id,
                e.process_role,
                e.sequence,
                randomUUID(),
                b.batch_id,
                text,
                digest(recordingEventContent(e)),
                now,
                charge(text),
              ).changes;
          }
          duplicate = b.events.length > 0 && added === 0;
          this.db.exec(
            "DELETE FROM batches WHERE NOT EXISTS(SELECT 1 FROM events WHERE events.run=batches.run AND origin=batches.batch)",
          );
          if (duplicate) this.count("duplicate_batches", 1);
          this.fit(b.run.app, b.run.run_id, b.batch_id);
          this.db.exec("RELEASE incoming");
        } catch (error) {
          this.db.exec("ROLLBACK TO incoming; RELEASE incoming");
          if (
            error instanceof Error &&
            (/^(sequence|batch|run)_conflict$/u.test(error.message) ||
              error.message.includes(
                "UNIQUE constraint failed: index 'event_phase'",
              ))
          ) {
            reason = error.message.includes("event_phase")
              ? "admission_action_conflict"
              : error.message === "sequence_conflict"
                ? "admission_sequence_conflict"
                : error.message === "batch_conflict"
                  ? "admission_batch_conflict"
                  : "admission_run_conflict";
            if (dry) throw new RecordingRefusal(reason);
            const old = this.row(b.run.run_id);
            if (!old)
              this.db
                .query("INSERT INTO runs VALUES(?,?,?,?,?)")
                .run(
                  b.run.run_id,
                  b.run.app,
                  JSON.stringify(recordingRunDefinition(b.run)),
                  JSON.stringify(emptyRecordingAdmission()),
                  now,
                );
            this.mark(b.run.run_id, b.events.length, true);
            this.db
              .query("UPDATE runs SET updated=? WHERE id=?")
              .run(now, b.run.run_id);
            this.count("dropped_batches", 1);
            this.count("dropped_events", b.events.length);
            this.fit(old?.app ?? b.run.app, b.run.run_id);
          } else throw error;
        }
      }, dry);
    } catch (error) {
      if (error instanceof RecordingRefusal) throw error;
      if (error instanceof Error && error.message === "run_capacity")
        throw new RecordingRefusal("run_capacity");
      this.failures.storage_failures++;
      this.failures.dropped_batches++;
      this.failures.dropped_events += b.events.length;
      return this.receipt(b, false, false, dry);
    }
    if (reason) throw new RecordingRefusal(reason);
    return this.receipt(b, true, duplicate, dry);
  }
  private receipt(
    b: RecordingBatch,
    accepted: boolean,
    duplicate: boolean,
    dry_run: boolean,
  ) {
    return {
      generated_at: new Date().toISOString(),
      accepted,
      durability: dry_run
        ? ("validated" as const)
        : accepted
          ? ("stored" as const)
          : ("dropped" as const),
      duplicate,
      dry_run,
      events: b.events.length,
      admission: this.row(b.run.run_id)
        ? (this.run(this.row(b.run.run_id)!).admission ??
          emptyRecordingAdmission())
        : (b.run.admission ?? emptyRecordingAdmission()),
      status: this.status(),
    };
  }
  private snapshot<A>(read: () => A): A {
    this.db.exec("BEGIN");
    try {
      const value = read();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      if (this.db.inTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
  }
  runs(cursor = 0) {
    return this.snapshot(() => this.list(cursor));
  }
  show(id: string) {
    return this.snapshot(() => this.view(id));
  }
  export(id: string, cursor?: string) {
    return this.snapshot(() => this.page(id, cursor));
  }
  private list(cursor = 0) {
    const rows = this.db
      .query<RunRow, [number, number]>(
        "SELECT * FROM runs WHERE updated>=? OR EXISTS(SELECT 1 FROM events WHERE run=runs.id AND received>=?) ORDER BY updated,id",
      )
      .all(
        this.now - recordingLimits.retentionMs,
        this.now - recordingLimits.retentionMs,
      );
    return {
      generated_at: new Date().toISOString(),
      runs: rows.slice(cursor, cursor + 100).map((r) => ({
        run: this.run(r),
        events:
          this.db
            .query<{ n: number }, [string, number]>(
              "SELECT count(*) n FROM events WHERE run=? AND received>=?",
            )
            .get(r.id, this.now - recordingLimits.retentionMs)?.n ?? 0,
        bytes:
          this.db
            .query<{ n: number }, [string, number]>(
              "SELECT coalesce(sum(length(content)),0) n FROM events WHERE run=? AND received>=?",
            )
            .get(r.id, this.now - recordingLimits.retentionMs)?.n ?? 0,
        batches:
          this.db
            .query<{ n: number }, [string]>(
              "SELECT count(*) n FROM batches WHERE run=?",
            )
            .get(r.id)?.n ?? 0,
      })),
      next_cursor: cursor + 100 < rows.length ? cursor + 100 : null,
      status: this.status(),
    };
  }
  private view(id: string) {
    const r = this.row(id);
    if (
      !r ||
      (r.updated < this.now - recordingLimits.retentionMs &&
        !this.db
          .query("SELECT 1 FROM events WHERE run=? AND received>=?")
          .get(id, this.now - recordingLimits.retentionMs))
    )
      throw new RecordingRefusal("missing_run");
    const run = this.run(r);
    const events = this.db
      .query<{ content: string }, [string, number]>(
        "SELECT content FROM events WHERE run=? AND received>=? ORDER BY ordinal",
      )
      .all(id, this.now - recordingLimits.retentionMs)
      .map((e) => JSON.parse(e.content));
    const analysis = analyzeRecording(
      events,
      !!this.db
        .query("SELECT 1 FROM events WHERE run=? AND ordinal<=? LIMIT 1")
        .get(id, this.recoveredThrough),
      new Map([[id, run.admission ?? emptyRecordingAdmission()]]),
    );
    const summary = analysis.summary.map((r) =>
      Schema.decodeUnknownSync(RecordingSummaryRow)(r),
    );
    return {
      generated_at: new Date().toISOString(),
      run,
      ...analysis,
      summary: summary.slice(0, 256),
      omitted_groups: Math.max(0, summary.length - 256),
      status: this.status(),
    };
  }
  private page(id: string, cursor?: string) {
    const row = this.row(id);
    if (
      !row ||
      (row.updated < this.now - recordingLimits.retentionMs &&
        !this.db
          .query("SELECT 1 FROM events WHERE run=? AND received>=?")
          .get(id, this.now - recordingLimits.retentionMs))
    )
      throw new RecordingRefusal("missing_run");
    const run = this.run(row);
    let from = 0;
    if (cursor) {
      const entry = this.db
        .query<{ ordinal: number }, [string, string, number]>(
          "SELECT ordinal FROM events WHERE run=? AND cursor=? AND received>=?",
        )
        .get(id, cursor, this.now - recordingLimits.retentionMs);
      if (!entry) throw new RecordingRefusal("expired_cursor");
      from = entry.ordinal;
    }
    const rows = this.db
        .query<EventRow, [string, number, number]>(
          "SELECT * FROM events WHERE run=? AND ordinal>=? AND received>=? ORDER BY ordinal LIMIT 129",
        )
        .all(id, from, this.now - recordingLimits.retentionMs),
      events: RecordingBatch["events"][number][] = [];
    let end = 0;
    for (const r of rows) {
      if (events.length >= 128 || r.origin !== rows[0]?.origin) break;
      const event = JSON.parse(r.content),
        next = {
          schema_version: 1,
          batch_id: rows[0]?.cursor ?? randomUUID(),
          run: { ...run, admission: maximum },
          events: [...events, event],
        };
      if (bytes(JSON.stringify(next)) > recordingLimits.batchBytes - 4096)
        break;
      events.push(event);
      end = r.ordinal;
    }
    const batch = validateRecordingBatch({
      schema_version: 1,
      batch_id: rows[0]?.cursor ?? randomUUID(),
      run,
      events,
    });
    const next = this.db
      .query<{ cursor: string }, [string, number, number]>(
        "SELECT cursor FROM events WHERE run=? AND ordinal>? AND received>=? ORDER BY ordinal LIMIT 1",
      )
      .get(id, end, this.now - recordingLimits.retentionMs);
    return {
      generated_at: new Date().toISOString(),
      batches: [batch],
      next_cursor: next?.cursor ?? null,
      status: this.status(),
    };
  }
  compare(before: string, after: string) {
    return this.snapshot(() => {
      const a = this.view(before),
        b = this.view(after),
        reason = recordingComparisonRefusal(a.run, b.run);
      if (reason) throw new RecordingRefusal(reason);
      return {
        generated_at: new Date().toISOString(),
        before: a,
        after: b,
        comparable: true as const,
      };
    });
  }

  close() {
    this.db.close();
  }
}
