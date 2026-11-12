import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  statfs,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";
import type { DiagnosticEvent } from "../client-diagnostics.ts";
import {
  type RecordingBatch,
  RecordingLoss,
  type RecordingReceipt,
  RecordingSummaryRow,
  recordingLimits,
  validateRecordingBatch,
} from "../diagnostic-recordings.ts";
import {
  recordingClockDiscontinuities,
  recordingSequenceGaps,
  recordingsComparable,
  summarizeRecording,
} from "../diagnostic-run-summary.ts";

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
  private readonly recoveredRuns = new Set<string>();
  private readonly pendingIds = new Map<string, string>();
  private readonly manifests = new Map<string, string>();
  private readonly seen = new Map<string, string>();
  private queued = 0;
  private loss = zero();
  private available = false;
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
        if (name === "status.json") continue;
        if (!/^\d{13}-[a-f0-9-]{36}\.json$/u.test(name)) {
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
        } catch {
          await unlink(join(directory, name));
          store.loss.corrupt_segments++;
        }
        await pause();
      }
      for (const entry of store.entries)
        store.recoveredRuns.add(entry.run.run_id);
      store.available = true;
      await store.prune();
      await store.save();
    } catch {
      store.loss.storage_failures++;
    }
    return store;
  }
  private charge(bytes: number) {
    return Math.ceil(bytes / this.blockBytes) * this.blockBytes;
  }
  private filename(time: number, id: string) {
    return `${Math.floor(time).toString().padStart(13, "0")}-${id}.json`;
  }
  private async read(name: string) {
    const file = await open(
      join(this.directory, name),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      return await file.readFile("utf8");
    } finally {
      await file.close();
    }
  }
  private async atomic(name: string, text: string) {
    const temp = join(this.directory, `${name}.tmp`);
    const file = await open(
      temp,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      try {
        await file.writeFile(text);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temp, join(this.directory, name));
    } catch (error) {
      await unlink(temp).catch(() => {});
      throw error;
    }
  }
  private schedule(run: () => Promise<void>) {
    this.tail = this.tail.then(run).catch(() => {
      this.loss.storage_failures++;
    });
  }
  private async save() {
    if (!this.available) return;
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
    const key = JSON.stringify(batch.run);
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
    };
  }
  private digest(batch: RecordingBatch) {
    return createHash("sha256").update(JSON.stringify(batch)).digest("hex");
  }
  ingest(batch: RecordingBatch, dryRun = false): typeof RecordingReceipt.Type {
    const digest = this.digest(batch);
    const previous =
      this.seen.get(batch.batch_id) ?? this.pendingIds.get(batch.batch_id);
    if (previous && previous !== digest)
      throw new Error("Conflicting batch id");
    const bytes =
      new TextEncoder().encode(JSON.stringify(batch)).byteLength + 64;
    const duplicate =
      this.seen.has(batch.batch_id) || this.pendingIds.has(batch.batch_id);
    const known = this.manifests.get(batch.run.run_id);
    if (known && known !== JSON.stringify(batch.run))
      throw new Error("Incompatible run metadata");
    const accepted =
      this.available &&
      (duplicate || this.queued + bytes <= recordingLimits.queueBytes);
    if (!dryRun) {
      if (duplicate) this.loss.duplicate_batches++;
      else if (!accepted) {
        this.loss.dropped_batches++;
        this.loss.dropped_events += batch.events.length;
        this.saveLater();
      } else {
        this.acceptManifest(batch);
        this.queued += bytes;
        this.pendingIds.set(batch.batch_id, digest);
        const received = this.time();
        this.schedule(async () => {
          try {
            const text = JSON.stringify({ received, batch });
            const length = this.charge(
              new TextEncoder().encode(text).byteLength,
            );
            await this.prune({ app: batch.run.app, bytes: length });
            const appCap = this.options.appBytes ?? recordingLimits.appBytes;
            if (
              length > appCap ||
              length >
                (this.options.totalBytes ?? recordingLimits.totalBytes) -
                  2 * this.blockBytes
            )
              throw new Error("Capacity");
            const name = this.filename(received, batch.batch_id);
            await this.atomic(name, text);
            this.entries.push({
              name,
              received,
              bytes: length,
              batch: batch.batch_id,
              run: batch.run,
              events: batch.events.length,
              digest,
            });
            this.seen.set(batch.batch_id, digest);
          } catch {
            this.loss.storage_failures++;
            this.loss.dropped_batches++;
            this.loss.dropped_events += batch.events.length;
          } finally {
            this.queued -= bytes;
            this.pendingIds.delete(batch.batch_id);
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
        : duplicate && this.seen.has(batch.batch_id)
          ? "stored"
          : accepted
            ? "queued"
            : "dropped",
      duplicate,
      dry_run: dryRun,
      events: batch.events.length,
      status: this.status(),
    };
  }
  private trimIdentity() {
    this.seen.clear();
    for (const e of this.entries) this.seen.set(e.batch, e.digest);
    const retained = new Set<string>(this.entries.map((e) => e.run.run_id));
    for (const id of this.manifests.keys())
      if (!retained.has(id) && this.pendingIds.size === 0)
        this.manifests.delete(id);
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
        bytes + (incoming?.bytes ?? 0) >
        (this.options.totalBytes ?? recordingLimits.totalBytes) -
          2 * this.blockBytes;
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
    return changed;
  }
  async flush() {
    await this.tail;
  }
  private async query<A>(read: () => Promise<A>): Promise<A> {
    const result = this.tail.then(async () => {
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
  runs(cursor = 0) {
    return this.query(async () => {
      const groups = new Map<
        string,
        {
          run: RecordingBatch["run"];
          events: number;
          bytes: number;
          batches: number;
        }
      >();
      for (const e of this.entries) {
        const old = groups.get(e.run.run_id) ?? {
          run: e.run,
          events: 0,
          bytes: 0,
          batches: 0,
        };
        old.events += e.events;
        old.bytes += e.bytes;
        old.batches++;
        groups.set(e.run.run_id, old);
      }
      const all = [...groups.values()];
      return {
        generated_at: new Date().toISOString(),
        runs: all.slice(cursor, cursor + 100),
        next_cursor: cursor + 100 < all.length ? cursor + 100 : null,
        status: this.status(),
      };
    });
  }
  export(run: string, cursor?: string) {
    return this.query(async () => {
      const entries = this.entries.filter((e) => e.run.run_id === run);
      if (!entries.length) throw new Error("Recording unavailable");
      const index = cursor ? entries.findIndex((e) => e.batch === cursor) : 0;
      if (index < 0) throw new Error("Export cursor expired");
      const entry = entries[index];
      const batches = entry
        ? [
            validateRecordingBatch(
              JSON.parse(await this.read(entry.name)).batch,
            ),
          ]
        : [];
      return {
        generated_at: new Date().toISOString(),
        batches,
        next_cursor: entries[index + 1]?.batch ?? null,
        status: this.status(),
      };
    });
  }
  private async showUnsafe(id: string) {
    const entries = this.entries.filter((e) => e.run.run_id === id);
    const first = entries[0];
    if (!first) throw new Error("Recording unavailable");
    const events: DiagnosticEvent[] = [];
    const seen = new Set<string>();
    for (const e of entries) {
      const batch = validateRecordingBatch(
        JSON.parse(await this.read(e.name)).batch,
      );
      for (const event of batch.events) {
        const key = `${event.process_role}:${event.sequence}`;
        if (!seen.has(key)) {
          events.push(event);
          seen.add(key);
        }
      }
      await pause();
    }
    const clock_discontinuities = recordingClockDiscontinuities(events);
    const sequence_gaps = recordingSequenceGaps(events);
    const recovery_uncertain =
      this.recoveredRuns.has(id) &&
      !events.some(
        (event) =>
          event.name === "process.terminated" && event.reason === "clean",
      );
    const unattributed_lost_starts = events.reduce(
      (n, e) =>
        n +
        (e.name === "recording.loss" && e.category.inventory_id === "unknown"
          ? e.lost_starts
          : 0),
      0,
    );
    const all = summarizeRecording(events).map((row) =>
      Schema.decodeUnknownSync(RecordingSummaryRow)({
        ...row,
        ...(clock_discontinuities ||
        sequence_gaps ||
        recovery_uncertain ||
        unattributed_lost_starts
          ? { evidence: "incomplete" }
          : {}),
      }),
    );
    return {
      generated_at: new Date().toISOString(),
      run: first.run,
      summary: all.slice(0, 256),
      omitted_groups: Math.max(0, all.length - 256),
      clock_discontinuities,
      sequence_gaps,
      recovery_uncertain,
      unattributed_lost_starts: events.reduce(
        (n, e) =>
          n +
          (e.name === "recording.loss" && e.category.inventory_id === "unknown"
            ? e.lost_starts
            : 0),
        0,
      ),
      status: this.status(),
    };
  }
  show(id: string) {
    return this.query(() => this.showUnsafe(id));
  }
  compare(before: string, after: string) {
    return this.query(async () => {
      const a = await this.showUnsafe(before),
        b = await this.showUnsafe(after);
      if (!recordingsComparable(a.run, b.run))
        throw new Error("Runs are not comparable");
      return {
        generated_at: new Date().toISOString(),
        before: a,
        after: b,
        comparable: true as const,
      };
    });
  }
}
