// One queue publishes run manifests and owns their immutable blobs, quotas, receipts and removal.
import type { Database } from "bun:sqlite";
import { chmod, lstat, mkdir, readdir, statfs } from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";
import {
  type RecordingBatch,
  RecordingLoss,
  type RecordingReceipt,
  recordingLimits,
  validateRecordingBatch,
} from "../diagnostic-recordings.ts";
import {
  emptyRecordingAdmission,
  type RecordingAdmission,
  recordingRunDefinition,
} from "../recording-admission.ts";
import { RecordingRefusal } from "../recording-refusal.ts";
import {
  RecordingEventIndex,
  recordingEventFingerprints,
} from "./recording-event-index.ts";
import {
  acquireRecordingLease,
  readRecordingFile,
  removeRecordingFile,
  writeRecordingFile,
} from "./recording-files.ts";
import {
  bytes,
  checksum,
  covers,
  decodeManifest,
  encodeManifest,
  fingerprint,
  inspectManifest,
  type Manifest,
  manifestByteLimit,
  manifestName,
  manifestSize,
  mergeAdmission,
  type Segment,
  segmentName,
  splitBatch,
  withRefusals,
} from "./recording-manifest.ts";
import { RecordingQueries } from "./recording-queries.ts";

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
type Options = { appBytes?: number; totalBytes?: number; now?: () => number };
type Refusals = {
  run: RecordingBatch["run"];
  batches: number;
  events: number;
  at: number;
};
type Result = { accepted: boolean; admission: RecordingAdmission };
export class DiagnosticRecordings {
  private readonly manifests = new Map<string, Manifest>();
  private readonly manifestSizes = new Map<string, number>();
  private readonly seen = new Map<string, string>();
  private readonly eventIndex = new RecordingEventIndex();
  private readonly pendingIds = new Map<string, string>();
  private pendingJobs = 0;
  private readonly pendingCounts = new Map<string, number>();
  private readonly blockedRuns = new Set<string>();
  private readonly pendingRuns = new Map<string, RecordingBatch["run"]>();
  private readonly refusals = new Map<string, Refusals>();
  private readonly admissionJobs = new Set<string>();
  private readonly outcomes = new WeakMap<
    typeof RecordingReceipt.Type,
    Result
  >();
  private readonly failedRuns = new Set<string>();
  private readonly garbage = new Map<string, number>();
  private readonly recoveredRuns = new Set<string>();
  private statusJob = false;
  private queued = 0;
  private loss = zero();
  private available = false;
  private closing = false;
  private blockBytes = 4096;
  private tail: Promise<void> = Promise.resolve();
  private ready: Promise<void> = Promise.resolve();
  private lease: Database | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private expiryBackingOff = false;
  private constructor(
    private readonly directory: string,
    private readonly options: Options = {},
  ) {}
  static start(directory: string, options: Options = {}) {
    const store = new DiagnosticRecordings(directory, options);
    store.ready = store.initialize();
    return store;
  }
  static async open(directory: string, options: Options = {}) {
    const store = DiagnosticRecordings.start(directory, options);
    await store.ready;
    return store;
  }
  whenReady() {
    return this.ready;
  }
  private time() {
    return Math.max(0, Math.floor((this.options.now ?? Date.now)()));
  }
  private charge(n: number) {
    return Math.ceil(n / this.blockBytes) * this.blockBytes;
  }
  private read(name: string) {
    return readRecordingFile(this.directory, name);
  }
  private async atomic(name: string, text: string) {
    try {
      await writeRecordingFile(this.directory, name, text);
    } catch (error) {
      await this.remove(`${name}.tmp`, this.charge(bytes(text)));
      throw error;
    }
  }
  private state(id: string) {
    return this.manifests.get(id)?.run.admission ?? emptyRecordingAdmission();
  }
  private async initialize() {
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const info = await lstat(this.directory);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error("Private directory required");
      await chmod(this.directory, 0o700);
      this.blockBytes = Math.max(4096, (await statfs(this.directory)).bsize);
      this.lease = await acquireRecordingLease(this.directory);
      if (!this.lease) throw new Error("Writer busy");
      try {
        this.loss = Schema.decodeUnknownSync(RecordingLoss)(
          JSON.parse(await this.read("status.json")),
        );
        this.loss.uncertain_restarts++;
      } catch {}
      const names = await readdir(this.directory);
      for (const name of names.filter((n) =>
        /^[a-f0-9-]{36}\.admission\.json$/iu.test(n),
      )) {
        try {
          const stat = await lstat(join(this.directory, name));
          if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            stat.size > manifestByteLimit
          )
            throw new Error("Invalid manifest");
          const m = decodeManifest(await this.read(name));
          if (
            name !== manifestName(m.run.run_id) ||
            this.manifests.size >= recordingLimits.knownRuns
          )
            throw new Error("Invalid manifest");
          this.manifests.set(m.run.run_id, m);
          this.manifestSizes.set(m.run.run_id, this.charge(stat.size));
          await chmod(join(this.directory, name), 0o600);
          this.recoveredRuns.add(m.run.run_id);
        } catch {
          this.loss.corrupt_segments++;
          await this.remove(name);
        }
        await pause();
      }
      for (const id of [...this.manifests.keys()]) {
        try {
          await this.repair(id);
        } catch {
          this.failedRuns.add(id);
        }
        await pause();
      }
      const retainedLoss = [...this.manifests.values()].reduce(
        (n, m) => ({
          capacity: n.capacity + m.loss.capacity_events,
          expired: n.expired + m.loss.expired_events,
          corrupt: n.corrupt + m.loss.corrupt_events,
        }),
        { capacity: 0, expired: 0, corrupt: 0 },
      );
      this.loss.capacity_events = Math.max(
        this.loss.capacity_events,
        retainedLoss.capacity,
      );
      this.loss.expired_events = Math.max(
        this.loss.expired_events,
        retainedLoss.expired,
      );
      this.loss.dropped_events = Math.max(
        this.loss.dropped_events,
        retainedLoss.capacity + retainedLoss.expired + retainedLoss.corrupt,
      );
      const referenced = new Set(
        [...this.manifests.values()].flatMap((m) =>
          m.segments.map(segmentName),
        ),
      );
      for (const name of names)
        if (
          name !== "status.json" &&
          name !== "writer.lock" &&
          !/^[a-f0-9-]{36}\.admission\.json$/iu.test(name) &&
          !referenced.has(name)
        ) {
          await this.remove(name);
          this.loss.corrupt_segments++;
          await pause();
        }
      await this.prune();
      this.available = true;
      this.saveLater();
    } catch {
      this.available = false;
      this.loss.storage_failures++;
      try {
        this.lease?.close();
      } catch {}
      this.lease = undefined;
    }
  }
  private schedule(run: () => Promise<void>) {
    this.tail = this.tail.then(run).catch(() => {
      this.loss.storage_failures++;
    });
  }
  async flush() {
    await this.ready;
    for (;;) {
      const tail = this.tail;
      await tail;
      if (tail === this.tail) return;
    }
  }
  async close() {
    this.closing = true;
    clearTimeout(this.expiry);
    await this.flush();
    if (this.available)
      for (const p of [...this.refusals.values()])
        try {
          await this.metadata(p.run);
        } catch {
          this.loss.storage_failures++;
        }
    this.available = false;
    clearTimeout(this.expiry);
    try {
      this.lease?.close();
    } catch {
      this.loss.storage_failures++;
    }
    this.lease = undefined;
  }
  private rebuildSeen() {
    this.seen.clear();
    for (const m of this.manifests.values())
      for (const s of m.segments) this.seen.set(s.origin, s.fingerprint);
  }
  private async remove(name: string, size = 0) {
    try {
      await removeRecordingFile(this.directory, name);
      this.garbage.delete(name);
      return true;
    } catch {
      this.loss.storage_failures++;
      const held =
        size ||
        (await lstat(join(this.directory, name)).then(
          (s) => Math.max(this.blockBytes, s.blocks * 512, this.charge(s.size)),
          () => this.blockBytes,
        ));
      this.garbage.set(name, held);
      this.expiryBackingOff = true;
      return false;
    }
  }
  private async clearGarbage(explicitRetry = false) {
    if (this.expiryBackingOff && this.expiry && !explicitRetry)
      return this.garbage.size === 0;
    for (const [name, size] of this.garbage) await this.remove(name, size);
    return this.garbage.size === 0;
  }
  private forget(id: string) {
    const old = this.manifests.get(id);
    for (const s of old?.segments ?? []) {
      this.eventIndex.forget(s.id);
      this.indexed.delete(s.id);
    }
    this.manifests.delete(id);
    this.manifestSizes.delete(id);
    this.failedRuns.delete(id);
    this.blockedRuns.delete(id);
    this.recoveredRuns.delete(id);
    this.rebuildSeen();
    return old;
  }
  private async refresh(id: string) {
    try {
      const stat = await lstat(join(this.directory, manifestName(id)));
      if (!stat.isFile() || stat.size > manifestByteLimit)
        throw new Error("Invalid manifest");
      const m = decodeManifest(await this.read(manifestName(id)));
      if (m.run.run_id !== id) throw new Error("Invalid manifest");
      const old = this.manifests.get(id);
      if (old && encodeManifest(old) !== encodeManifest(m)) {
        this.forget(id);
      }
      this.manifests.set(id, m);
      this.manifestSizes.set(id, this.charge(stat.size));
      return m;
    } catch {
      const old = this.forget(id);
      await this.remove(manifestName(id));
      for (const s of old?.segments ?? [])
        await this.remove(segmentName(s), this.charge(s.size));
      return undefined;
    }
  }
  private async load(s: Segment, run: RecordingBatch["run"]) {
    const text = await this.read(segmentName(s));
    if (bytes(text) !== s.size || checksum(text) !== s.checksum)
      throw new Error("Segment checksum");
    const value = Schema.decodeUnknownSync(
      Schema.Struct({ received: Schema.Number, batch: Schema.Unknown }),
      { onExcessProperty: "error" },
    )(JSON.parse(text));
    const batch = validateRecordingBatch(value.batch);
    if (
      batch.batch_id !== s.id ||
      value.received !== s.time ||
      JSON.stringify(recordingRunDefinition(batch.run)) !==
        JSON.stringify(recordingRunDefinition(run)) ||
      batch.events.length !== s.events
    )
      throw new Error("Invalid segment");
    return batch;
  }
  private indexed = new Set<string>();
  private async repair(id: string) {
    let m = await this.refresh(id);
    if (!m) return;
    const inspected = await inspectManifest(encodeManifest(m), async (name) => {
      try {
        return await this.read(name);
      } catch {
        return undefined;
      }
    });
    if (!inspected) return;
    if (inspected.bad.length) {
      try {
        await this.publish(inspected.manifest);
        for (const bad of inspected.bad) {
          this.loss.corrupt_segments++;
          this.loss.dropped_events += bad.events;
          await this.remove(segmentName(bad), this.charge(bad.size));
        }
      } catch {
        this.blockedRuns.add(id);
        throw new RecordingRefusal("metadata_unavailable");
      }
      m = inspected.manifest;
    }
    for (const [segment, batch] of inspected.batches)
      if (!this.indexed.has(segment)) {
        this.eventIndex.retain(
          segment,
          recordingEventFingerprints(batch),
          true,
        );
        this.indexed.add(segment);
      }
    this.rebuildSeen();
    return { manifest: m, batches: inspected.batches };
  }
  private async publish(m: Manifest) {
    const text = encodeManifest(m),
      old = this.manifests.get(m.run.run_id);
    if (old && text === encodeManifest(old)) return;
    if (this.charge(bytes(text)) > this.reserve())
      throw new Error("Manifest capacity");
    await this.atomic(manifestName(m.run.run_id), text);
    for (const s of old?.segments ?? [])
      if (!m.segments.some((x) => x.id === s.id)) {
        this.eventIndex.forget(s.id);
        this.indexed.delete(s.id);
      }
    this.manifests.set(m.run.run_id, m);
    this.manifestSizes.set(m.run.run_id, this.charge(bytes(text)));
    this.failedRuns.delete(m.run.run_id);
    this.blockedRuns.delete(m.run.run_id);
    this.rebuildSeen();
  }
  private proposed(run: RecordingBatch["run"]): Manifest {
    const old = this.manifests.get(run.run_id),
      pending = this.refusals.get(run.run_id);
    return {
      version: 2,
      updated_at: old?.updated_at ?? this.time(),
      run: {
        ...recordingRunDefinition(old?.run ?? run),
        admission: withRefusals(
          mergeAdmission(old?.run.admission, run.admission),
          pending?.batches ?? 0,
          pending?.events ?? 0,
        ),
      },
      segments: old?.segments ?? [],
      loss: old?.loss ?? {
        capacity_events: 0,
        expired_events: 0,
        corrupt_events: 0,
      },
    };
  }
  private consume(id: string, taken: Refusals | undefined) {
    if (!taken) return;
    const p = this.refusals.get(id);
    if (p) {
      p.batches -= taken.batches;
      p.events -= taken.events;
      if (!p.batches) this.refusals.delete(id);
    }
  }
  private snapshotRefusal(id: string) {
    const p = this.refusals.get(id);
    return p ? { ...p } : undefined;
  }
  private addRefusal(run: RecordingBatch["run"], n: number) {
    const p = this.refusals.get(run.run_id) ?? {
      run,
      batches: 0,
      events: 0,
      at: this.time(),
    };
    p.batches++;
    p.events += n;
    this.refusals.set(run.run_id, p);
  }
  private async metadata(run: RecordingBatch["run"]) {
    await this.refresh(run.run_id);
    const taken = this.snapshotRefusal(run.run_id),
      next = this.proposed(run);
    const bounded = await this.budget({ ...next, updated_at: this.time() }, 0);
    await this.publish(bounded);
    this.consume(run.run_id, taken);
  }
  private queueRefusal(id: string) {
    if (this.admissionJobs.has(id)) return;
    this.admissionJobs.add(id);
    this.schedule(async () => {
      let published = false;
      try {
        const p = this.refusals.get(id);
        if (p) await this.metadata(p.run);
        published = true;
      } catch {
        this.failedRuns.add(id);
        this.loss.storage_failures++;
      } finally {
        this.admissionJobs.delete(id);
        if (published && this.refusals.has(id)) this.queueRefusal(id);
        this.saveLater();
      }
    });
  }
  status() {
    return {
      bytes:
        [...this.manifests.values()]
          .flatMap((m) => m.segments)
          .reduce((n, s) => n + this.charge(s.size), 0) +
        [...this.garbage.values()].reduce((a, b) => a + b, 0),
      queued_bytes: this.queued,
      segments: [...this.manifests.values()].reduce(
        (n, m) => n + m.segments.length,
        0,
      ),
      loss: { ...this.loss },
      admission_bytes: [...this.manifestSizes.values()].reduce(
        (a, b) => a + b,
        0,
      ),
    };
  }
  admissionDurable(id: string, required?: RecordingAdmission) {
    return (
      this.available &&
      (required
        ? covers(this.state(id), required)
        : !this.failedRuns.has(id) && !this.refusals.has(id))
    );
  }
  private manifestCapacity() {
    return this.reserve() - 256;
  }
  private reserve() {
    const cap = this.options.appBytes ?? recordingLimits.appBytes;
    return Math.max(
      this.blockBytes,
      Math.min(
        manifestByteLimit,
        Math.floor(cap / 4 / this.blockBytes) * this.blockBytes,
      ),
    );
  }
  private totals(app?: string) {
    let n = 0;
    for (const m of this.manifests.values())
      if (!app || m.run.app === app)
        n +=
          (this.manifestSizes.get(m.run.run_id) ?? 0) +
          m.segments.reduce((a, s) => a + this.charge(s.size), 0);
    return n + [...this.garbage.values()].reduce((a, b) => a + b, 0);
  }
  private async evict(
    id: string,
    segments: readonly Segment[],
    expired = false,
  ) {
    const m = this.manifests.get(id);
    if (!m) return;
    const ids = new Set(segments.map((s) => s.id));
    const next = {
      ...m,
      run: { ...m.run, admission: { ...this.state(id), incomplete: true } },
      segments: m.segments.filter((s) => !ids.has(s.id)),
      loss: {
        ...m.loss,
        capacity_events:
          m.loss.capacity_events +
          (expired ? 0 : segments.reduce((n, s) => n + s.events, 0)),
        expired_events:
          m.loss.expired_events +
          (expired ? segments.reduce((n, s) => n + s.events, 0) : 0),
      },
    };
    await this.publish(next);
    for (const s of segments) {
      this.loss.dropped_batches++;
      this.loss.dropped_events += s.events;
      if (expired) this.loss.expired_events += s.events;
      else this.loss.capacity_events += s.events;
      await this.remove(segmentName(s), this.charge(s.size));
    }
  }
  private async budget(next: Manifest, incoming: number) {
    if (!(await this.clearGarbage(this.refusals.has(next.run.run_id))))
      throw new Error("Recording cleanup unavailable");
    const appCap = this.options.appBytes ?? recordingLimits.appBytes,
      totalCap = this.options.totalBytes ?? recordingLimits.totalBytes;
    const usage = () =>
      this.totals(next.run.app) +
      incoming +
      this.charge(bytes(encodeManifest(next))) -
      (this.manifestSizes.get(next.run.run_id) ?? 0);
    const totalUsage = () =>
      this.totals() +
      incoming +
      this.charge(bytes(encodeManifest(next))) -
      (this.manifestSizes.get(next.run.run_id) ?? 0);
    while (
      usage() > appCap - this.reserve() ||
      totalUsage() > totalCap - this.reserve() - 3 * this.blockBytes ||
      this.status().segments +
        next.segments.filter((s) => !this.indexed.has(s.id)).length >
        recordingLimits.segments
    ) {
      const overApp = usage() > appCap - this.reserve();
      const victims = [...this.manifests.values()]
        .filter((m) => !overApp || m.run.app === next.run.app)
        .flatMap((m) => m.segments.map((s) => ({ id: m.run.run_id, s })))
        .sort((a, b) => a.s.time - b.s.time);
      const victim = victims[0];
      if (!victim) {
        const empty = [...this.manifests.values()]
          .filter(
            (m) =>
              m.run.run_id !== next.run.run_id &&
              !m.segments.length &&
              (!overApp || m.run.app === next.run.app) &&
              !this.pendingRuns.has(m.run.run_id),
          )
          .sort((a, b) => a.updated_at - b.updated_at)[0];
        if (!empty) throw new Error("Recording capacity");
        if (
          !(await this.remove(
            manifestName(empty.run.run_id),
            this.manifestSizes.get(empty.run.run_id),
          ))
        )
          throw new Error("Recording capacity");
        this.forget(empty.run.run_id);
        continue;
      }
      await this.evict(victim.id, [victim.s]);
      if (victim.id === next.run.run_id) {
        next = {
          ...next,
          loss: this.manifests.get(victim.id)?.loss ?? next.loss,
          segments: next.segments.filter((s) => s.id !== victim.s.id),
          run: {
            ...next.run,
            admission: {
              ...(next.run.admission ?? emptyRecordingAdmission()),
              incomplete: true,
            },
          },
        };
      }
    }
    return next;
  }
  private async prune() {
    await this.clearGarbage();
    for (const id of [...this.manifests.keys()]) {
      const cached = this.manifests.get(id);
      if (!cached) continue;
      if (
        cached.updated_at >= this.time() - recordingLimits.retentionMs &&
        cached.segments.every(
          (s) => s.time >= this.time() - recordingLimits.retentionMs,
        )
      )
        continue;
      const m = await this.refresh(id);
      if (!m) continue;
      const expired = m.segments.filter(
        (s) => s.time < this.time() - recordingLimits.retentionMs,
      );
      if (expired.length)
        try {
          await this.evict(id, expired, true);
        } catch {
          this.loss.storage_failures++;
          this.expiryBackingOff = true;
        }
      const current = this.manifests.get(id);
      if (
        current &&
        !current.segments.length &&
        current.updated_at < this.time() - recordingLimits.retentionMs &&
        !this.pendingRuns.has(id) &&
        !this.refusals.has(id)
      ) {
        if (await this.remove(manifestName(id), this.manifestSizes.get(id))) {
          this.forget(id);
        } else this.expiryBackingOff = true;
      }
    }
    for (const [id, p] of this.refusals)
      if (
        p.at < this.time() - recordingLimits.retentionMs &&
        !this.manifests.has(id) &&
        !this.pendingRuns.has(id)
      ) {
        this.refusals.delete(id);
        this.failedRuns.delete(id);
      }
  }
  private armExpiry() {
    if (this.expiryBackingOff && this.expiry) return;
    clearTimeout(this.expiry);
    if (this.closing || !this.available) return;
    const times = [...this.manifests.values()].flatMap((m) =>
      m.segments.length ? m.segments.map((s) => s.time) : [m.updated_at],
    );
    if (!times.length && !this.garbage.size) return;
    const delay = this.expiryBackingOff
      ? 60000
      : Math.max(
          1,
          Math.min(...times) + recordingLimits.retentionMs - this.time() + 1,
        );
    this.expiry = setTimeout(
      () => {
        this.expiry = undefined;
        this.schedule(async () => {
          this.expiryBackingOff = false;
          await this.prune();
          await this.save();
        });
      },
      Math.min(delay, 2147483647),
    );
    this.expiry.unref();
  }
  private saveLater() {
    if (this.statusJob) return;
    this.statusJob = true;
    this.schedule(async () => {
      this.statusJob = false;
      await this.save();
    });
  }
  private async save() {
    if (!this.available) return;
    try {
      await this.atomic("status.json", JSON.stringify(this.loss));
    } catch {
      this.loss.storage_failures++;
    }
    this.armExpiry();
  }
  ingest(batch: RecordingBatch, dryRun = false): typeof RecordingReceipt.Type {
    const incoming = validateRecordingBatch(batch),
      id = incoming.run.run_id,
      required = mergeAdmission(this.state(id), incoming.run.admission);
    const receipt: typeof RecordingReceipt.Type = {
      generated_at: new Date().toISOString(),
      accepted: false,
      durability: dryRun ? "validated" : "dropped",
      duplicate: false,
      dry_run: dryRun,
      events: incoming.events.length,
      admission: required,
      status: this.status(),
    };
    if (!this.available || this.closing) {
      if (!dryRun) {
        this.loss.dropped_batches++;
        this.loss.dropped_events += incoming.events.length;
      }
      return receipt;
    }
    if (
      !this.manifests.has(id) &&
      !this.pendingRuns.has(id) &&
      new Set([
        ...this.manifests.keys(),
        ...this.pendingRuns.keys(),
        ...this.refusals.keys(),
      ]).size >= recordingLimits.knownRuns
    )
      throw new RecordingRefusal("run_capacity");
    const hash = fingerprint(incoming),
      items = recordingEventFingerprints(incoming),
      prior =
        this.seen.get(incoming.batch_id) ??
        this.pendingIds.get(incoming.batch_id),
      pendingExact = this.pendingIds.has(incoming.batch_id);
    try {
      if (prior && prior !== hash) throw new RecordingRefusal("batch_conflict");
      const base = this.manifests.get(id)?.run ?? this.pendingRuns.get(id);
      if (
        base &&
        JSON.stringify(recordingRunDefinition(base)) !==
          JSON.stringify(recordingRunDefinition(incoming.run))
      )
        throw new RecordingRefusal("run_conflict");
      const duplicate = this.eventIndex.check(items) || !!prior;
      if (dryRun) return { ...receipt, accepted: true, duplicate };
      const cost = bytes(JSON.stringify(incoming));
      if (
        this.queued + cost > recordingLimits.queueBytes ||
        this.pendingJobs >= recordingLimits.pendingBatches
      ) {
        this.loss.dropped_batches++;
        this.loss.dropped_events += incoming.events.length;
        this.addRefusal(base ?? incoming.run, incoming.events.length);
        this.queueRefusal(id);
        return receipt;
      }
      const out = {
        ...receipt,
        accepted: true,
        durability: "queued" as const,
        duplicate,
      };
      this.queued += cost;
      this.pendingJobs++;
      this.pendingCounts.set(id, (this.pendingCounts.get(id) ?? 0) + 1);
      this.pendingIds.set(incoming.batch_id, hash);
      this.pendingRuns.set(id, base ?? incoming.run);
      if (!duplicate) this.eventIndex.retain(incoming.batch_id, items);
      this.schedule(async () => {
        const staged: Segment[] = [];
        try {
          if (duplicate) await this.repair(id);
          else await this.refresh(id);
          await this.prune();
          if (pendingExact && !this.eventIndex.check(items)) {
            this.outcomes.set(out, {
              accepted: false,
              admission: this.state(id),
            });
            return;
          }
          const parts = this.eventIndex.check(items)
            ? []
            : splitBatch(incoming, this.time());
          let next = this.proposed(incoming.run);
          const taken = this.snapshotRefusal(id);
          next = {
            ...next,
            segments: [...next.segments, ...parts.map((p) => p.segment)],
            updated_at: parts.length ? this.time() : next.updated_at,
          };
          while (manifestSize(next) > this.manifestCapacity()) {
            const old = this.manifests
              .get(id)
              ?.segments.find((s) => next.segments.some((x) => x.id === s.id));
            if (!old) throw new Error("Manifest capacity");
            await this.evict(id, [old]);
            next = {
              ...this.proposed(incoming.run),
              segments: [
                ...(this.manifests.get(id)?.segments ?? []),
                ...parts.map((p) => p.segment),
              ],
            };
          }
          next = await this.budget(
            next,
            parts.reduce((n, p) => n + this.charge(p.segment.size), 0),
          );
          for (const p of parts) {
            await this.atomic(segmentName(p.segment), p.text);
            staged.push(p.segment);
          }
          await this.publish(next);
          this.consume(id, taken);
          for (const p of parts) {
            this.eventIndex.retain(
              p.segment.id,
              recordingEventFingerprints(p.batch),
              true,
            );
            this.indexed.add(p.segment.id);
          }
          this.rebuildSeen();
          this.outcomes.set(out, { accepted: true, admission: this.state(id) });
          if (duplicate) this.loss.duplicate_batches++;
        } catch {
          this.failedRuns.add(id);
          this.loss.storage_failures++;
          this.loss.dropped_batches++;
          this.loss.dropped_events += incoming.events.length;
          this.addRefusal(incoming.run, incoming.events.length);
          for (const s of staged)
            await this.remove(segmentName(s), this.charge(s.size));
          this.outcomes.set(out, {
            accepted: false,
            admission: this.state(id),
          });
        } finally {
          this.eventIndex.forget(incoming.batch_id);
          this.queued -= cost;
          if (this.pendingIds.get(incoming.batch_id) === hash)
            this.pendingIds.delete(incoming.batch_id);
          this.pendingJobs--;
          const remaining = (this.pendingCounts.get(id) ?? 1) - 1;
          if (remaining) this.pendingCounts.set(id, remaining);
          else {
            this.pendingCounts.delete(id);
            this.pendingRuns.delete(id);
          }
          this.saveLater();
        }
      });
      return out;
    } catch (error) {
      if (!dryRun && error instanceof RecordingRefusal) {
        this.loss.dropped_batches++;
        this.loss.dropped_events += incoming.events.length;
        this.addRefusal(
          this.manifests.get(id)?.run ??
            this.pendingRuns.get(id) ??
            incoming.run,
          incoming.events.length,
        );
        this.queueRefusal(id);
        throw new RecordingRefusal(
          error.reason === "sequence_conflict"
            ? "admission_sequence_conflict"
            : error.reason === "batch_conflict"
              ? "admission_batch_conflict"
              : "admission_run_conflict",
        );
      }
      throw error;
    }
  }
  settledReceipt(
    receipt: typeof RecordingReceipt.Type,
    _id: string,
    _run?: string,
  ): typeof RecordingReceipt.Type {
    const result = this.outcomes.get(receipt);
    return {
      ...receipt,
      accepted: result?.accepted ?? receipt.durability === "stored",
      durability: result?.accepted ? "stored" : "dropped",
      admission: result?.admission ?? receipt.admission,
      status: this.status(),
    };
  }
  private async query<A>(run: () => Promise<A>) {
    await this.ready;
    const result = this.tail.then(async () => {
      if (!this.available || this.closing)
        throw new RecordingRefusal("metadata_unavailable");
      await this.prune();
      return run();
    });
    this.tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  private queries(batches?: ReadonlyMap<string, RecordingBatch>) {
    return new RecordingQueries({
      manifests: this.manifests,
      read: async (s, run) => {
        const value = batches?.get(s.id);
        return value ?? (await this.load(s, run));
      },
      status: () => this.status(),
      recovered: (id) => this.recoveredRuns.has(id),
      unavailable: (id) => this.blockedRuns.has(id) || this.refusals.has(id),
    });
  }
  runs(cursor = 0) {
    return this.query(async () => {
      for (const id of [...this.manifests.keys()])
        try {
          await this.repair(id);
        } catch {}
      return this.queries().runs(cursor);
    });
  }
  show(id: string) {
    return this.query(async () => {
      const result = await this.repair(id);
      return this.queries(result?.batches).show(id);
    });
  }
  export(id: string, cursor?: string) {
    return this.query(async () => {
      const result = await this.repair(id);
      return this.queries(result?.batches).export(id, cursor);
    });
  }
  compare(before: string, after: string) {
    return this.query(async () => {
      const a = await this.repair(before),
        b = before === after ? a : await this.repair(after);
      return this.queries(
        new Map([...(a?.batches ?? []), ...(b?.batches ?? [])]),
      ).compare(before, after);
    });
  }
}
