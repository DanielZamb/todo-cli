// One writer queue coordinates admission, segment persistence, and their shared byte and retention budgets.
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readdir, statfs, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";
import {
  type RecordingBatch,
  RecordingLoss,
  type RecordingReceipt,
  RecordingRun,
  recordingLimits,
  validateRecordingBatch,
} from "../diagnostic-recordings.ts";
import { recordingRunDefinition } from "../recording-admission.ts";
import { RecordingRefusal } from "../recording-refusal.ts";

import { RecordingAdmissions } from "./recording-admissions.ts";
import {
  RecordingEventIndex,
  recordingEventFingerprints,
} from "./recording-event-index.ts";
import {
  acquireRecordingLease,
  readRecordingFile,
  writeRecordingFile,
} from "./recording-files.ts";
import { RecordingQueries } from "./recording-queries.ts";

type Segment = {
  name: string;
  received: number;
  bytes: number;
  batch: RecordingBatch["batch_id"];
  run: RecordingBatch["run"];
  events: number;
  digest: string;
};
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
const pause = () => new Promise<void>((r) => setImmediate(r));
export class DiagnosticRecordings {
  private entries: Segment[] = [];
  private readonly admissionJobs = new Set<string>();
  private readonly admissions = new RecordingAdmissions(() => this.blockBytes);
  private readonly recoveredRuns = new Set<string>();
  private readonly eventIndex = new RecordingEventIndex();
  private readonly pendingRuns = new Map<string, string>();
  private expiryBackingOff = false;
  private readonly pendingIds = new Map<string, string>();
  private readonly manifests = new Map<string, string>();
  private readonly seen = new Map<string, string>();
  private queued = 0;
  private loss = zero();
  private available = false;
  private closing = false;
  private lease: Database | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private blockBytes = 4096;
  private tail: Promise<void> = Promise.resolve();
  private statsQueued = false;
  private constructor(
    private readonly directory: string,
    private readonly options: {
      appBytes?: number;
      totalBytes?: number;
      now?: () => number;
    } = {},
  ) {}
  private time() {
    return (this.options.now ?? Date.now)();
  }
  static async open(
    directory: string,
    options: {
      appBytes?: number;
      totalBytes?: number;
      now?: () => number;
    } = {},
  ) {
    const store = new DiagnosticRecordings(directory, options);
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const dir = await lstat(directory);
      if (!dir.isDirectory() || dir.isSymbolicLink())
        throw new Error("Private directory required");
      await chmod(directory, 0o700);
      store.blockBytes = Math.max(4096, (await statfs(directory)).bsize);
      if (!(await store.acquireLease()))
        throw new Error("Recording writer already active");
      try {
        store.loss = Schema.decodeUnknownSync(RecordingLoss)(
          JSON.parse(await store.read("status.json")),
        );
        store.loss.uncertain_restarts++;
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
        )
          store.loss.corrupt_segments++;
      }
      for (const name of (await readdir(directory)).sort()) {
        if (
          name === "status.json" ||
          name === "writer.lock" ||
          RecordingAdmissions.isFile(name)
        )
          continue;
        if (!/^\d{13}-[a-f0-9-]{36}\.json$/iu.test(name)) {
          await unlink(join(directory, name));
          store.loss.corrupt_segments++;
          continue;
        }
        try {
          const info = await lstat(join(directory, name));
          if (
            !info.isFile() ||
            info.isSymbolicLink() ||
            info.size > recordingLimits.batchBytes + 256
          )
            throw new Error("Invalid segment");
          const stored = Schema.decodeUnknownSync(
            Schema.Struct({ received: Schema.Number, batch: Schema.Unknown }),
            { onExcessProperty: "error" },
          )(JSON.parse(await store.read(name)));
          const batch = validateRecordingBatch(stored.batch);
          if (name !== store.filename(stored.received, batch.batch_id))
            throw new Error("Invalid segment");
          await chmod(join(directory, name), 0o600);
          if (store.seen.has(batch.batch_id))
            throw new Error("Duplicate segment");
          if (!store.acceptManifest(batch)) throw new Error("Invalid run");
          store.entries.push({
            name,
            received: stored.received,
            bytes: store.charge(info.size),
            batch: batch.batch_id,
            run: batch.run,
            events: batch.events.length,
            digest: store.digest(batch),
          });
          store.seen.set(batch.batch_id, store.digest(batch));
          store.eventIndex.retain(
            batch.batch_id,
            recordingEventFingerprints(batch),
            true,
          );
        } catch {
          await unlink(join(directory, name));
          store.loss.corrupt_segments++;
        }
        await pause();
      }
      await store.admissions.load(directory, await readdir(directory), (name) =>
        store.read(name),
      );
      for (const entry of store.entries)
        store.recoveredRuns.add(entry.run.run_id);
      store.trimIdentity();
      store.available = true;
      await store.prune();
      await store.save();
    } catch {
      store.available = false;
      store.loss.storage_failures++;
      store.releaseLease();
    }
    return store;
  }
  private async acquireLease() {
    this.lease = await acquireRecordingLease(this.directory);
    return !!this.lease;
  }
  async close() {
    this.closing = true;
    clearTimeout(this.expiry);
    for (;;) {
      const tail = this.tail;
      await tail;
      if (tail === this.tail) break;
    }
    if (this.available)
      for (const id of this.admissions.ids())
        if (this.admissions.dirty(id))
          try {
            await this.persistAdmission(id);
          } catch {
            this.loss.storage_failures++;
          }
    this.available = false;
    clearTimeout(this.expiry);
    this.releaseLease();
  }
  private releaseLease() {
    try {
      this.lease?.close();
    } catch {
      this.loss.storage_failures++;
    }
    this.lease = undefined;
  }
  private charge(bytes: number) {
    return Math.ceil(bytes / this.blockBytes) * this.blockBytes;
  }
  private filename(time: number, id: string) {
    return `${Math.floor(time).toString().padStart(13, "0")}-${id}.json`;
  }
  private read(name: string) {
    return readRecordingFile(this.directory, name);
  }
  private atomic(name: string, text: string) {
    return writeRecordingFile(this.directory, name, text);
  }
  private schedule(run: () => Promise<void>) {
    this.tail = this.tail.then(run).catch(() => {
      this.loss.storage_failures++;
    });
  }
  private armExpiry() {
    if (this.closing) return;
    if (this.expiryBackingOff && this.expiry) return;
    clearTimeout(this.expiry);
    const received = Math.min(
      this.entries[0]?.received ?? Infinity,
      this.admissions.oldest(this.activeRuns()),
    );
    if (!this.available || !Number.isFinite(received)) return;
    const delay = Math.max(
      this.expiryBackingOff ? 60000 : 1,
      received + recordingLimits.retentionMs - this.time() + 1,
    );
    this.expiry = setTimeout(
      () => {
        this.schedule(async () => {
          this.expiry = undefined;
          try {
            if (await this.prune()) await this.save();
            this.expiryBackingOff = false;
          } catch {
            this.loss.storage_failures++;
            this.expiryBackingOff = true;
            await this.save();
          } finally {
            this.armExpiry();
          }
        });
      },
      Math.min(delay, 2147483647),
    );
    this.expiry.unref();
  }
  private async save() {
    if (!this.available) return;
    this.armExpiry();
    try {
      await this.atomic("status.json", JSON.stringify(this.loss));
    } catch {
      this.loss.storage_failures++;
    }
  }
  private saveLater() {
    if (this.statsQueued) return;
    this.statsQueued = true;
    this.schedule(async () => {
      this.statsQueued = false;
      await this.save();
    });
  }
  private acceptManifest(batch: RecordingBatch) {
    const key = JSON.stringify(recordingRunDefinition(batch.run));
    const previous = this.manifests.get(batch.run.run_id);
    if (previous && previous !== key) return false;
    if (!previous) this.manifests.set(batch.run.run_id, key);
    return true;
  }
  status() {
    return {
      bytes: this.entries.reduce((n, e) => n + e.bytes, 0),
      queued_bytes: this.queued,
      segments: this.entries.length,
      loss: { ...this.loss },
      admission_bytes: this.admissions.bytes(),
    };
  }
  private digest(batch: RecordingBatch) {
    return createHash("sha256")
      .update(
        JSON.stringify({ ...batch, run: recordingRunDefinition(batch.run) }),
      )
      .digest("hex");
  }
  ingest(batch: RecordingBatch, dryRun = false): typeof RecordingReceipt.Type {
    if (this.closing) throw new RecordingRefusal("metadata_unavailable");
    if (!this.available) {
      if (!dryRun) {
        this.loss.dropped_batches++;
        this.loss.dropped_events += batch.events.length;
      }
      return {
        generated_at: new Date().toISOString(),
        accepted: false,
        durability: dryRun ? "validated" : "dropped",
        duplicate: false,
        dry_run: dryRun,
        events: batch.events.length,
        admission: this.admissions.state(batch.run.run_id),
        status: this.status(),
      };
    }
    try {
      return this.admit(batch, dryRun);
    } catch (error) {
      if (
        !dryRun &&
        error instanceof RecordingRefusal &&
        error.reason === "run_capacity"
      ) {
        this.loss.dropped_batches++;
        this.loss.dropped_events += batch.events.length;
        this.saveLater();
      }
      if (
        !dryRun &&
        error instanceof RecordingRefusal &&
        ["sequence_conflict", "batch_conflict", "run_conflict"].includes(
          error.reason,
        )
      ) {
        this.loss.dropped_batches++;
        this.loss.dropped_events += batch.events.length;
        this.markRefusal(batch);
        this.queueAdmission(batch.run.run_id);
        const reason =
          error.reason === "sequence_conflict"
            ? "admission_sequence_conflict"
            : error.reason === "batch_conflict"
              ? "admission_batch_conflict"
              : "admission_run_conflict";
        throw new RecordingRefusal(reason);
      }
      throw error;
    }
  }
  admissionDurable(id: string) {
    return this.available && !this.admissions.dirty(id);
  }
  private activeRuns() {
    return new Set([
      ...this.entries.map((entry) => entry.run.run_id),
      ...this.pendingRuns.values(),
    ]);
  }
  private markRefusal(batch: RecordingBatch) {
    const known = this.manifests.get(batch.run.run_id);
    const run =
      this.admissions.base(batch.run.run_id) ??
      (known
        ? Schema.decodeUnknownSync(RecordingRun)(JSON.parse(known))
        : batch.run);
    this.admissions.refuse(run, batch.events.length, this.time());
  }
  private queueAdmission(id: string) {
    if (this.admissionJobs.has(id)) return;
    this.admissionJobs.add(id);
    this.schedule(async () => {
      let persisted = false;
      try {
        await this.persistAdmission(id);
        persisted = true;
      } finally {
        this.admissionJobs.delete(id);
        if (persisted && this.admissions.dirty(id)) this.queueAdmission(id);
      }
    });
  }
  private async persistAdmission(id: string) {
    const run = this.admissions.base(id);
    if (!run) return;
    const cap = this.options.appBytes ?? recordingLimits.appBytes;
    const data = this.entries
      .filter((entry) => entry.run.app === run.app)
      .reduce((sum, entry) => sum + entry.bytes, 0);
    if (
      data + this.admissions.charge(run.app, cap) > cap ||
      this.entries.reduce((sum, entry) => sum + entry.bytes, 0) +
        this.admissions.bytes() >
        (this.options.totalBytes ?? recordingLimits.totalBytes) -
          3 * this.blockBytes
    )
      await this.prune({ app: run.app, bytes: 0 });
    await this.admissions.persist(id, (name, text) => this.atomic(name, text));
    await this.save();
  }
  private admit(
    batch: RecordingBatch,
    dryRun = false,
  ): typeof RecordingReceipt.Type {
    const run = recordingRunDefinition(batch.run);
    const knownRuns = new Set([
      ...this.manifests.keys(),
      ...this.admissions.ids(),
    ]);
    if (
      !knownRuns.has(run.run_id) &&
      knownRuns.size >= recordingLimits.knownRuns
    )
      throw new RecordingRefusal("run_capacity");
    const digest = this.digest(batch);
    const previous =
      this.seen.get(batch.batch_id) ?? this.pendingIds.get(batch.batch_id);
    if (previous && previous !== digest)
      throw new RecordingRefusal("batch_conflict");
    const bytes =
      new TextEncoder().encode(JSON.stringify(batch)).byteLength + 64;
    const items = recordingEventFingerprints(batch);
    const duplicate =
      this.seen.has(batch.batch_id) ||
      this.pendingIds.has(batch.batch_id) ||
      this.eventIndex.check(items);
    const marked = this.admissions.base(run.run_id);
    const known =
      this.manifests.get(batch.run.run_id) ??
      (marked ? JSON.stringify(recordingRunDefinition(marked)) : undefined);
    if (known && known !== JSON.stringify(run))
      throw new RecordingRefusal("run_conflict");
    const accepted =
      this.available &&
      (duplicate ||
        (this.queued + bytes <= recordingLimits.queueBytes &&
          this.pendingIds.size < recordingLimits.pendingBatches));
    if (!dryRun) {
      if (accepted && this.admissions.merge(batch.run, this.time()))
        this.queueAdmission(run.run_id);
      if (duplicate) this.loss.duplicate_batches++;
      else if (!accepted) {
        this.loss.dropped_batches++;
        this.loss.dropped_events += batch.events.length;
        if (this.available) {
          this.markRefusal(batch);
          this.queueAdmission(run.run_id);
        }
        this.saveLater();
      } else {
        this.acceptManifest(batch);
        this.queued += bytes;
        this.pendingIds.set(batch.batch_id, digest);
        this.pendingRuns.set(batch.batch_id, batch.run.run_id);
        this.eventIndex.retain(batch.batch_id, items);
        const received = this.time();
        this.schedule(async () => {
          try {
            const text = JSON.stringify({ received, batch: { ...batch, run } });
            const length = this.charge(
              new TextEncoder().encode(text).byteLength,
            );
            await this.prune({ app: batch.run.app, bytes: length });
            const appCap = this.options.appBytes ?? recordingLimits.appBytes;
            if (
              length > appCap ||
              length >
                (this.options.totalBytes ?? recordingLimits.totalBytes) -
                  3 * this.blockBytes
            )
              throw new Error("Capacity");
            const name = this.filename(received, batch.batch_id);
            await this.atomic(name, text);
            this.entries.push({
              name,
              received,
              bytes: length,
              batch: batch.batch_id,
              run,
              events: batch.events.length,
              digest,
            });
            this.seen.set(batch.batch_id, digest);
            this.eventIndex.commit(batch.batch_id);
          } catch {
            this.eventIndex.forget(batch.batch_id);
            this.loss.storage_failures++;
            this.loss.dropped_batches++;
            this.loss.dropped_events += batch.events.length;
            this.markRefusal(batch);
            try {
              await this.persistAdmission(run.run_id);
            } catch {}
          } finally {
            this.queued -= bytes;
            this.pendingIds.delete(batch.batch_id);
            this.pendingRuns.delete(batch.batch_id);
            this.trimIdentity();
            await this.save();
          }
        });
      }
    }
    return {
      generated_at: new Date().toISOString(),
      accepted,
      durability: dryRun
        ? "validated"
        : duplicate &&
            !this.pendingIds.has(batch.batch_id) &&
            !this.admissions.dirty(run.run_id)
          ? "stored"
          : accepted
            ? "queued"
            : "dropped",
      duplicate,
      dry_run: dryRun,
      events: batch.events.length,
      admission: this.admissions.state(run.run_id),
      status: this.status(),
    };
  }
  settledReceipt(
    receipt: typeof RecordingReceipt.Type,
    id: string,
    run?: string,
  ): typeof RecordingReceipt.Type {
    const stored =
      this.seen.has(id) ||
      (receipt.duplicate && !!run && !this.admissions.dirty(run));
    return {
      ...receipt,
      accepted: stored,
      durability: stored ? "stored" : "dropped",
      admission: run ? this.admissions.state(run) : receipt.admission,
      status: this.status(),
    };
  }
  private trimIdentity() {
    this.seen.clear();
    for (const e of this.entries) this.seen.set(e.batch, e.digest);
    const retained = new Set<string>(this.entries.map((e) => e.run.run_id));
    for (const id of this.pendingRuns.values()) retained.add(id);
    for (const id of this.manifests.keys())
      if (!retained.has(id)) this.manifests.delete(id);
    for (const id of this.recoveredRuns)
      if (!retained.has(id)) this.recoveredRuns.delete(id);
  }
  private async prune(incoming?: {
    app: RecordingBatch["run"]["app"];
    bytes: number;
  }) {
    this.entries.sort(
      (a, b) => a.received - b.received || a.name.localeCompare(b.name),
    );
    const totals = new Map<string, number>();
    let bytes = 0;
    let changed = false;
    for (const entry of this.entries) {
      bytes += entry.bytes;
      totals.set(entry.run.app, (totals.get(entry.run.app) ?? 0) + entry.bytes);
    }
    const appCap = this.options.appBytes ?? recordingLimits.appBytes;
    for (const app of ["macos", "electron", "cli", "server"])
      totals.set(
        app,
        (totals.get(app) ?? 0) + this.admissions.charge(app, appCap),
      );
    for (;;) {
      const oldest = this.entries[0];
      const expired =
        oldest && oldest.received < this.time() - recordingLimits.retentionMs
          ? oldest
          : undefined;
      const app =
        incoming?.app ?? [...totals].find(([, size]) => size > appCap)?.[0];
      const overApp =
        app && (totals.get(app) ?? 0) + (incoming?.bytes ?? 0) > appCap;
      const overTotal =
        bytes + this.admissions.bytes() + (incoming?.bytes ?? 0) >
        (this.options.totalBytes ?? recordingLimits.totalBytes) -
          3 * this.blockBytes;
      const overSegments =
        this.entries.length + Number(!!incoming) > recordingLimits.segments;
      const victim =
        expired ??
        (overApp
          ? this.entries.find((e) => e.run.app === app)
          : overTotal || overSegments
            ? oldest
            : undefined);
      if (!victim) break;
      await unlink(join(this.directory, victim.name));
      this.entries.splice(this.entries.indexOf(victim), 1);
      this.eventIndex.forget(victim.batch);
      bytes -= victim.bytes;
      totals.set(
        victim.run.app,
        (totals.get(victim.run.app) ?? 0) - victim.bytes,
      );
      changed = true;
      this.loss.dropped_batches++;
      this.loss.dropped_events += victim.events;
      if (expired) this.loss.expired_events += victim.events;
      else this.loss.capacity_events += victim.events;
    }
    if (changed) this.trimIdentity();
    await this.admissions.expire(
      this.directory,
      this.time(),
      this.activeRuns(),
    );
    return changed;
  }
  async flush() {
    await this.tail;
  }
  private async query<A>(read: () => Promise<A>): Promise<A> {
    const result = this.tail.then(async () => {
      if (!this.available) throw new RecordingRefusal("metadata_unavailable");
      if (await this.prune()) await this.save();
      return read();
    });
    this.tail = result.then(
      () => {},
      (error) => {
        if (error instanceof Error && "code" in error)
          this.loss.storage_failures++;
      },
    );
    return result;
  }
  private get queries() {
    return new RecordingQueries({
      entries: this.entries,
      admissions: this.admissions,
      read: (name) => this.read(name),
      status: () => this.status(),
      recovered: (id) => this.recoveredRuns.has(id),
    });
  }
  runs(cursor = 0) {
    return this.query(() => Promise.resolve(this.queries.runs(cursor)));
  }
  export(run: string, cursor?: string) {
    return this.query(() => this.queries.export(run, cursor));
  }
  show(id: string) {
    return this.query(() => this.queries.show(id));
  }
  compare(before: string, after: string) {
    return this.query(() => this.queries.compare(before, after));
  }
}
