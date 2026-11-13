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
import {
  recordingMethods as methods,
  RecordingServiceRates,
} from "./recording-rate.ts";
import { RecordingRefusal, recordingRefusals } from "./recording-refusal.ts";
import { RecordingDatabase } from "./recordings-sqlite.ts";

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
  let currentId: number | undefined,
    stepStarted = performance.now();
  const progress = () => {
    const now = performance.now();
    if (currentId !== undefined)
      port.postMessage({ progress: currentId, step_ms: now - stepStarted });
    stepStarted = now;
  };
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      engine = new RecordingDatabase(boot.directory, { ...boot, progress });
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
      if (engine)
        port.postMessage({
          update: true,
          status: engine.status(),
          held: engine.heldReader,
        });
    }
  }, 1000);
  timer.unref();
  port.on("message", (input: unknown) => {
    const r = Schema.decodeUnknownSync(Request)(input);
    offset = r.now - Date.now();
    currentId = r.id;
    stepStarted = performance.now();
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
      port.postMessage({
        id: r.id,
        value,
        status: engine.status(),
        held: engine.heldReader,
      });
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
        held: engine?.heldReader ?? false,
      });
    }
  });
  port.postMessage({
    ready: true,
    available: !!engine,
    status: engine?.status() ?? blank(),
  });
  await new Promise(() => {});
}
const Response = Schema.Struct({
  id: Schema.optionalKey(Schema.Int),
  ready: Schema.optionalKey(Schema.Boolean),
  update: Schema.optionalKey(Schema.Boolean),
  value: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.String),
  status: RecordingStatus,
  available: Schema.optionalKey(Schema.Boolean),
  held: Schema.optionalKey(Schema.Boolean),
});
const decodeWorkerMessage = Schema.decodeUnknownOption(
  Schema.Union([
    Schema.Struct({ progress: Schema.Int, step_ms: Schema.Finite }),
    Response,
  ]),
);
export const recordingWorkerPolicy = {
  deadlineMs: 5000,
  inactivityMs: 10000,
  restartMs: 60000,
} as const;
type Connection =
  | {
      kind: "starting";
      worker: Worker;
      ready: Promise<void>;
      resolve: () => void;
      timer: ReturnType<typeof setTimeout>;
    }
  | { kind: "ready"; worker: Worker }
  | { kind: "unavailable"; timer: ReturnType<typeof setTimeout> }
  | { kind: "closed" };
export class DiagnosticRecordings {
  private connection: Connection = { kind: "closed" };
  private cache = blank();
  private serial = 0;
  private queued = 0;
  private inactivity: ReturnType<typeof setTimeout> | undefined;
  private active:
    | { request: typeof Request.Type; cost: number; started: number }
    | undefined;
  private rates = new RecordingServiceRates();
  private maxStepMs = 0;
  private failures = 0;
  private droppedBatches = 0;
  private droppedEvents = 0;
  private condition: "available" | "unavailable" | "held_reader" =
    "unavailable";
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      cost: number;
      request: typeof Request.Type;
    }
  >();
  private constructor(
    private readonly directory: string,
    private readonly options: {
      appBytes?: number;
      totalBytes?: number;
      now?: () => number;
    } = {},
  ) {
    this.spawn();
  }
  private get worker() {
    return this.connection.kind === "starting" ||
      this.connection.kind === "ready"
      ? this.connection.worker
      : undefined;
  }
  private spawn() {
    try {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: {
          todoRecordings: 1,
          directory: this.directory,
          ...(this.options.appBytes === undefined
            ? {}
            : { appBytes: this.options.appBytes }),
          ...(this.options.totalBytes === undefined
            ? {}
            : { totalBytes: this.options.totalBytes }),
        },
      });
      let resolveReady = () => {};
      const ready = new Promise<void>((r) => {
        resolveReady = r;
      });
      const timer = setTimeout(() => {
        if (this.worker === worker && this.connection.kind === "starting")
          this.connection.resolve();
      }, recordingWorkerPolicy.deadlineMs);
      this.connection = {
        kind: "starting",
        worker,
        ready,
        resolve: resolveReady,
        timer,
      };
      this.watch();
      worker.on("message", (input: unknown) => {
        if (this.worker !== worker) return;
        const decoded = decodeWorkerMessage(input);
        if (decoded._tag === "None") {
          this.failures++;
          this.unavailable();
          return;
        }
        const r = decoded.value;
        if ("progress" in r) {
          if (this.active?.request.id === r.progress) {
            this.maxStepMs = Math.max(this.maxStepMs, r.step_ms);
            this.watch();
          }
          return;
        }
        if (r.update) {
          this.cache = { ...r.status };
          this.condition = r.held ? "held_reader" : "available";
          return;
        }
        if (r.ready) {
          if (this.connection.kind !== "starting") return;
          clearTimeout(this.connection.timer);
          this.connection.resolve();
          if (r.available === false) {
            this.failures++;
            this.unavailable();
            return;
          }
          this.connection = { kind: "ready", worker };
          this.condition = "available";
          this.cache = { ...r.status };
          this.watch();
          this.dispatch();
        } else {
          const id = r.id ?? -1;
          if (this.active?.request.id !== id) return;
          this.cache = { ...r.status };
          this.condition = r.held ? "held_reader" : "available";

          const reason = Object.keys(recordingRefusals).find(
            (k) => k === r.error,
          );
          const error = r.error
            ? new RecordingRefusal(
                Schema.decodeUnknownSync(
                  Schema.Literals(
                    Object.keys(
                      recordingRefusals,
                    ) as (keyof typeof recordingRefusals)[],
                  ),
                )(reason ?? "metadata_unavailable"),
              )
            : undefined;
          const active = this.active;
          this.rates.observe(
            active.request.method,
            performance.now() - active.started,
          );
          this.settle(id, r.value, error);
          this.queued -= active.cost;
          this.active = undefined;
          this.watch();
          this.dispatch();
        }
        if (!this.pending.size && !this.active) worker.unref();
      });
      const failed = () => {
        if (this.worker === worker) {
          this.failures++;
          this.unavailable();
        }
      };
      worker.on("error", failed);
      worker.on("exit", failed);
    } catch {
      this.failures++;
      this.unavailable();
    }
  }
  private unavailable() {
    if (this.inactivity) clearTimeout(this.inactivity);
    const old = this.connection;
    this.condition = "unavailable";
    if (old.kind === "starting") {
      clearTimeout(old.timer);
      old.resolve();
    }
    if (old.kind === "unavailable") clearTimeout(old.timer);
    const timer = setTimeout(
      () => this.spawn(),
      recordingWorkerPolicy.restartMs,
    );
    timer.unref();
    this.connection = { kind: "unavailable", timer };
    if (old.kind === "starting" || old.kind === "ready")
      void old.worker.terminate().catch(() => {});
    for (const id of this.pending.keys()) {
      this.failures++;
      this.settle(id, undefined, new RecordingRefusal("metadata_unavailable"));
    }
    if (this.active) {
      this.queued -= this.active.cost;
      this.active = undefined;
    }
  }
  private watch() {
    if (this.inactivity) clearTimeout(this.inactivity);
    if (this.active || this.connection.kind === "starting")
      this.inactivity = setTimeout(() => {
        this.failures++;
        this.unavailable();
      }, recordingWorkerPolicy.inactivityMs);
  }
  private estimate(method: (typeof methods)[number]) {
    const initial =
      method === "show"
        ? 25
        : method === "compare"
          ? 50
          : method === "export"
            ? 10
            : 1;
    return this.rates.estimate(method, initial);
  }
  private dispatch() {
    if (this.active || this.connection.kind !== "ready") return;
    const next = this.pending.values().next().value;
    if (!next) return;
    this.active = {
      request: next.request,
      cost: next.cost,
      started: performance.now(),
    };
    this.send(next.request);
    this.watch();
  }
  private settle(id: number, value: unknown, error?: Error) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    if (this.active?.request.id !== id) this.queued -= p.cost;
    if (error) p.reject(error);
    else p.resolve(value);
  }
  private send(request: typeof Request.Type) {
    try {
      this.worker?.postMessage(request);
    } catch {
      this.failures++;
      this.unavailable();
    }
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
    return this.connection.kind === "starting"
      ? this.connection.ready
      : Promise.resolve();
  }
  health() {
    return {
      condition: this.condition,
      failures: this.failures + this.cache.loss.storage_failures,
    };
  }
  status() {
    return {
      ...this.cache,
      queued_bytes: this.queued,
      loss: {
        ...this.cache.loss,
        storage_failures: this.cache.loss.storage_failures + this.failures,
        dropped_batches: this.cache.loss.dropped_batches + this.droppedBatches,
        dropped_events: this.cache.loss.dropped_events + this.droppedEvents,
      },
    };
  }
  private call(method: (typeof methods)[number], args: unknown) {
    if (
      this.connection.kind === "unavailable" ||
      this.connection.kind === "closed"
    ) {
      this.failures++;
      return Promise.reject(new RecordingRefusal("metadata_unavailable"));
    }
    const id = ++this.serial,
      request = { id, method, args, now: this.time() },
      cost = Buffer.byteLength(JSON.stringify(request)) + 256;
    if (
      this.pending.size +
        Number(!!this.active && !this.pending.has(this.active.request.id)) >=
        recordingLimits.pendingBatches ||
      [...this.pending.values()].reduce(
        (n, p) =>
          n +
          (p.request.id === this.active?.request.id
            ? 0
            : this.estimate(p.request.method)),
        0,
      ) +
        (this.active
          ? Math.max(
              this.estimate(this.active.request.method),
              performance.now() - this.active.started,
            )
          : 0) +
        this.estimate(method) >
        recordingWorkerPolicy.deadlineMs ||
      this.queued + cost > recordingLimits.queueBytes
    ) {
      this.failures++;
      return Promise.reject(new RecordingRefusal("rpc_capacity"));
    }
    this.queued += cost;
    this.worker?.ref();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.failures++;
        this.settle(id, undefined, new RecordingRefusal("rpc_deadline"));
      }, recordingWorkerPolicy.deadlineMs);
      this.pending.set(id, { resolve, reject, cost, timer, request });
      this.dispatch();
    });
  }
  async ingest(batch: RecordingBatch, dry = false) {
    try {
      const result = Schema.decodeUnknownSync(RecordingReceipt)(
        await this.call("ingest", { batch, dry }),
      );
      return { ...result, status: this.status() };
    } catch (error) {
      if (
        error instanceof RecordingRefusal &&
        !["metadata_unavailable", "rpc_deadline", "rpc_capacity"].includes(
          error.reason,
        )
      )
        throw error;
      this.droppedBatches++;
      this.droppedEvents += batch.events.length;
      return {
        generated_at: new Date().toISOString(),
        accepted: false,
        durability: "dropped" as const,
        duplicate: false,
        dry_run: dry,
        events: batch.events.length,
        admission: batch.run.admission ?? emptyRecordingAdmission(),
        status: this.status(),
      };
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
    const r = Schema.decodeUnknownSync(RecordingExport)(
      await this.call("export", {
        id,
        ...(cursor === undefined ? {} : { cursor }),
      }),
    );
    return { ...r, status: this.status() };
  }
  async compare(before: string, after: string) {
    const r = Schema.decodeUnknownSync(RecordingCompare)(
      await this.call("compare", { before, after }),
    );
    return {
      ...r,
      before: { ...r.before, status: this.status() },
      after: { ...r.after, status: this.status() },
    };
  }
  async flush() {
    await this.call("flush", null);
  }
  async close() {
    if (this.connection.kind === "closed") return;
    try {
      if (this.worker) await this.call("close", null);
    } catch {
    } finally {
      if (this.inactivity) clearTimeout(this.inactivity);
      const old = this.connection;
      this.connection = { kind: "closed" };
      this.condition = "unavailable";
      if (old.kind === "starting") {
        clearTimeout(old.timer);
        old.resolve();
      }
      if (old.kind === "unavailable") clearTimeout(old.timer);
      for (const id of this.pending.keys())
        this.settle(
          id,
          undefined,
          new RecordingRefusal("metadata_unavailable"),
        );
      if (this.active) {
        this.queued -= this.active.cost;
        this.active = undefined;
      }
      if (old.kind === "ready" || old.kind === "starting")
        void old.worker.terminate().catch(() => {});
    }
  }
}
