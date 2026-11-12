import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from "node:worker_threads";
import { Schema } from "effect";
import {
  type RecordingBatch,
  RecordingCompare,
  RecordingExport,
  RecordingReceipt,
  RecordingRunList,
  RecordingShow,
  RecordingStatus,
  recordingLimits,
} from "./diagnostic-recordings.ts";
import { emptyRecordingAdmission } from "./recording-admission.ts";
import { RecordingRefusal, recordingRefusals } from "./recording-refusal.ts";
import { RecordingDatabase } from "./recordings-sqlite.ts";

const methods = [
  "ingest",
  "runs",
  "show",
  "export",
  "compare",
  "flush",
  "close",
] as const;
const Request = Schema.Struct({
  id: Schema.Int,
  method: Schema.Literals(methods),
  args: Schema.Unknown,
  now: Schema.Number,
});
const Boot = Schema.Struct({
  todoRecordings: Schema.Literal(1),
  directory: Schema.String,
  appBytes: Schema.optionalKey(Schema.Number),
  totalBytes: Schema.optionalKey(Schema.Number),
});
const blank = () => ({
  bytes: 0,
  queued_bytes: 0,
  segments: 0,
  admission_bytes: 0,
  loss: {
    dropped_batches: 0,
    dropped_events: 0,
    expired_events: 0,
    capacity_events: 0,
    storage_failures: 0,
    corrupt_segments: 0,
    duplicate_batches: 0,
    uncertain_restarts: 0,
  },
});
if (
  !isMainThread &&
  workerData &&
  typeof workerData === "object" &&
  "todoRecordings" in workerData
) {
  const boot = Schema.decodeUnknownSync(Boot)(workerData),
    port = parentPort;
  if (!port) throw new Error("Missing recording port");
  let engine: RecordingDatabase | undefined;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      engine = new RecordingDatabase(boot.directory, boot);
      break;
    } catch (error) {
      if (!(error instanceof Error && /locked|busy/iu.test(error.message)))
        break;
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  let offset = 0,
    nextSweep = performance.now() + 60000,
    blockedUntil = 0;
  const maintain = (now: number) => {
    if (!engine) return;
    engine.at(now);
    if (performance.now() < blockedUntil) return;
    const n = engine.maintenance(now);
    if (n < 0) {
      blockedUntil = performance.now() + 60000;
      nextSweep = blockedUntil;
    } else if (n > 0) nextSweep = performance.now();
  };
  const timer = setInterval(() => {
    if (performance.now() >= nextSweep) {
      nextSweep = performance.now() + 60000;
      maintain(Date.now() + offset);
    }
  }, 1000);
  timer.unref();
  port.on("message", (input: unknown) => {
    const r = Schema.decodeUnknownSync(Request)(input);
    offset = r.now - Date.now();
    try {
      if (!engine) throw new RecordingRefusal("metadata_unavailable");
      let value: unknown;
      switch (r.method) {
        case "ingest": {
          const args = Schema.decodeUnknownSync(
            Schema.Struct({ batch: Schema.Unknown, dry: Schema.Boolean }),
          )(r.args);
          value = engine.ingest(args.batch, r.now, args.dry);
          break;
        }
        case "runs":
          maintain(r.now);
          value = engine.runs(Schema.decodeUnknownSync(Schema.Number)(r.args));
          break;
        case "show":
          maintain(r.now);
          value = engine.show(Schema.decodeUnknownSync(Schema.String)(r.args));
          break;
        case "export": {
          maintain(r.now);
          const a = Schema.decodeUnknownSync(
            Schema.Struct({
              id: Schema.String,
              cursor: Schema.optionalKey(Schema.String),
            }),
          )(r.args);
          value = engine.export(a.id, a.cursor);
          break;
        }
        case "compare": {
          maintain(r.now);
          const a = Schema.decodeUnknownSync(
            Schema.Struct({ before: Schema.String, after: Schema.String }),
          )(r.args);
          value = engine.compare(a.before, a.after);
          break;
        }
        case "flush":
          maintain(r.now);
          value = null;
          break;
        case "close":
          engine.close();
          clearInterval(timer);
          port.postMessage({ id: r.id, value: null, status: blank() });
          port.close();
          return;
      }
      port.postMessage({ id: r.id, value, status: engine.status() });
    } catch (error) {
      let status = blank();
      try {
        status = engine?.status() ?? status;
      } catch {}
      port.postMessage({
        id: r.id,
        error:
          error instanceof RecordingRefusal
            ? error.reason
            : "metadata_unavailable",
        status,
      });
    }
  });
  port.postMessage({ ready: true, status: engine?.status() ?? blank() });
  await new Promise(() => {});
}
const Response = Schema.Struct({
  id: Schema.optionalKey(Schema.Int),
  ready: Schema.optionalKey(Schema.Boolean),
  value: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.String),
  status: RecordingStatus,
});
export class DiagnosticRecordings {
  private worker: Worker;
  private cache = blank();
  private serial = 0;
  private closed = false;
  private queued = 0;
  private jobs = 0;
  private droppedBatches = 0;
  private droppedEvents = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private ready: Promise<void>;
  private constructor(
    directory: string,
    private readonly options: {
      appBytes?: number;
      totalBytes?: number;
      now?: () => number;
    } = {},
  ) {
    this.worker = new Worker(new URL(import.meta.url), {
      workerData: {
        todoRecordings: 1,
        directory,
        ...(options.appBytes === undefined
          ? {}
          : { appBytes: options.appBytes }),
        ...(options.totalBytes === undefined
          ? {}
          : { totalBytes: options.totalBytes }),
      },
    });
    this.ready = new Promise((resolve) => {
      this.worker.on("message", (input: unknown) => {
        const decoded = Schema.decodeUnknownOption(Response)(input);
        if (decoded._tag === "None") {
          for (const p of this.pending.values())
            p.reject(new RecordingRefusal("metadata_unavailable"));
          this.pending.clear();
          this.closed = true;
          resolve();
          void this.worker.terminate();
          return;
        }
        const r = decoded.value;
        this.cache = { ...r.status };
        if (r.ready) {
          resolve();
          if (!this.pending.size) this.worker.unref();
          return;
        }
        const p = this.pending.get(r.id ?? -1);
        if (!p) return;
        this.pending.delete(r.id ?? -1);

        if (r.error) {
          const reason = Object.keys(recordingRefusals).find(
            (k) => k === r.error,
          );
          p.reject(
            new RecordingRefusal(
              Schema.decodeUnknownSync(
                Schema.Literals(
                  Object.keys(
                    recordingRefusals,
                  ) as (keyof typeof recordingRefusals)[],
                ),
              )(reason ?? "metadata_unavailable"),
            ),
          );
        } else p.resolve(r.value);
        if (!this.pending.size) this.worker.unref();
      });
      const failed = () => {
        resolve();
        for (const p of this.pending.values())
          p.reject(new RecordingRefusal("metadata_unavailable"));
        this.pending.clear();
        this.closed = true;
      };
      this.worker.on("error", failed);
      this.worker.on("exit", () => {
        if (!this.closed) failed();
      });
    });
  }
  static start(
    directory: string,
    options: {
      appBytes?: number;
      totalBytes?: number;
      now?: () => number;
    } = {},
  ) {
    return new DiagnosticRecordings(directory, options);
  }
  static async open(
    directory: string,
    options: {
      appBytes?: number;
      totalBytes?: number;
      now?: () => number;
    } = {},
  ) {
    const s = DiagnosticRecordings.start(directory, options);
    await s.whenReady();
    return s;
  }
  private time() {
    return (this.options.now ?? Date.now)();
  }
  whenReady() {
    return this.ready;
  }
  status() {
    return {
      ...this.cache,
      queued_bytes: this.queued,
      loss: {
        ...this.cache.loss,
        dropped_batches: this.cache.loss.dropped_batches + this.droppedBatches,
        dropped_events: this.cache.loss.dropped_events + this.droppedEvents,
      },
    };
  }
  private async call(method: (typeof methods)[number], args: unknown) {
    await this.ready;
    if (this.closed) throw new RecordingRefusal("metadata_unavailable");
    const id = ++this.serial;
    this.worker.ref();

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, args, now: this.time() });
    });
  }
  async ingest(batch: RecordingBatch, dry = false) {
    const cost = Buffer.byteLength(JSON.stringify(batch));
    const dropped = () => ({
      generated_at: new Date().toISOString(),
      accepted: false,
      durability: "dropped" as const,
      duplicate: false,
      dry_run: dry,
      events: batch.events.length,
      admission: batch.run.admission ?? emptyRecordingAdmission(),
      status: this.status(),
    });
    if (
      this.queued + cost > recordingLimits.queueBytes ||
      this.jobs >= recordingLimits.pendingBatches
    ) {
      this.droppedBatches++;
      this.droppedEvents += batch.events.length;
      return dropped();
    }
    this.queued += cost;
    this.jobs++;
    try {
      const result = Schema.decodeUnknownSync(RecordingReceipt)(
        await this.call("ingest", { batch, dry }),
      );
      return {
        ...result,
        status: { ...this.status(), queued_bytes: this.queued - cost },
      };
    } catch (error) {
      if (
        error instanceof RecordingRefusal &&
        error.reason !== "metadata_unavailable"
      )
        throw error;
      this.droppedBatches++;
      this.droppedEvents += batch.events.length;
      return dropped();
    } finally {
      this.queued -= cost;
      this.jobs--;
    }
  }

  async runs(cursor = 0) {
    const r = Schema.decodeUnknownSync(RecordingRunList)(
      await this.call("runs", cursor),
    );
    return { ...r, status: this.status() };
  }
  async show(id: string) {
    const r = Schema.decodeUnknownSync(RecordingShow)(
      await this.call("show", id),
    );
    return { ...r, status: this.status() };
  }
  async export(id: string, cursor?: string) {
    const result = Schema.decodeUnknownSync(RecordingExport)(
      await this.call("export", {
        id,
        ...(cursor === undefined ? {} : { cursor }),
      }),
    );
    return { ...result, status: this.status() };
  }
  async compare(before: string, after: string) {
    const result = Schema.decodeUnknownSync(RecordingCompare)(
      await this.call("compare", { before, after }),
    );
    return {
      ...result,
      before: { ...result.before, status: this.status() },
      after: { ...result.after, status: this.status() },
    };
  }
  async flush() {
    await this.call("flush", null);
  }
  async close() {
    if (this.closed) return;
    try {
      await this.call("close", null);
    } catch {
    } finally {
      this.closed = true;
      await this.worker.terminate();
    }
  }
}
