import type { RecordingBatch } from "./diagnostic-recordings.ts";
import { RecordingRefusal } from "./recording-refusal.ts";
import type { DiagnosticRecordings } from "./recordings.ts";
import { recordingWorkerPolicy } from "./recordings.ts";
export class RecordingService {
  private client: DiagnosticRecordings | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  private droppedBatches = 0;
  private droppedEvents = 0;
  private closed = false;
  constructor(private readonly factory: () => DiagnosticRecordings) {
    this.start();
  }
  private start() {
    if (this.closed) return;
    try {
      this.client = this.factory();
    } catch {
      this.failures++;
      this.timer = setTimeout(
        () => this.start(),
        recordingWorkerPolicy.restartMs,
      );
      this.timer.unref();
    }
  }
  health() {
    const h = this.client?.health();
    return {
      condition: h?.condition ?? "unavailable",
      failures: this.failures + (h?.failures ?? 0),
      droppedBatches:
        this.droppedBatches + (this.client?.status().loss.dropped_batches ?? 0),
      droppedEvents:
        this.droppedEvents + (this.client?.status().loss.dropped_events ?? 0),
    };
  }
  private get() {
    if (!this.client) throw new RecordingRefusal("metadata_unavailable");
    return this.client;
  }
  async whenReady() {
    await this.client?.whenReady();
  }
  async ingest(b: RecordingBatch, dry = false) {
    if (!this.client) {
      this.droppedBatches++;
      this.droppedEvents += b.events.length;
    }
    return this.get().ingest(b, dry);
  }
  async runs(c = 0) {
    return this.get().runs(c);
  }
  async show(id: string) {
    return this.get().show(id);
  }
  async export(id: string, c?: string) {
    return this.get().export(id, c);
  }
  async compare(a: string, b: string) {
    return this.get().compare(a, b);
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    await this.client?.close();
  }
}
