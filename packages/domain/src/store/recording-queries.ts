import { randomUUID } from "node:crypto";
import { Schema } from "effect";
import {
  type RecordingBatch,
  RecordingSummaryRow,
  validateRecordingBatch,
} from "../diagnostic-recordings.ts";
import {
  analyzeRecording,
  recordingComparisonRefusal,
} from "../diagnostic-run-summary.ts";
import { RecordingRefusal } from "../recording-refusal.ts";
import type { DiagnosticRecordings } from "./diagnostic-recordings.ts";
import type { Manifest, Segment } from "./recording-manifest.ts";
export class RecordingQueries {
  constructor(
    private readonly state: {
      manifests: ReadonlyMap<string, Manifest>;
      read: (s: Segment, run: RecordingBatch["run"]) => Promise<RecordingBatch>;
      status: () => ReturnType<DiagnosticRecordings["status"]>;
      recovered: (id: string) => boolean;
      unavailable: (id: string) => boolean;
    },
  ) {}
  runs(cursor = 0) {
    const all = [...this.state.manifests.values()]
      .filter((m) => !this.state.unavailable(m.run.run_id))
      .map((m) => ({
        run: m.run,
        events: m.segments.reduce((n, s) => n + s.events, 0),
        bytes: m.segments.reduce((n, s) => n + s.size, 0),
        batches: new Set(m.segments.map((s) => s.origin)).size,
      }));
    return {
      generated_at: new Date().toISOString(),
      runs: all.slice(cursor, cursor + 100),
      next_cursor: cursor + 100 < all.length ? cursor + 100 : null,
      status: this.state.status(),
    };
  }
  private manifest(id: string) {
    const m = this.state.manifests.get(id);
    if (!m) throw new RecordingRefusal("missing_run");
    if (this.state.unavailable(id))
      throw new RecordingRefusal("metadata_unavailable");
    return m;
  }
  async export(id: string, cursor?: string) {
    const m = this.manifest(id),
      index = cursor ? m.segments.findIndex((s) => s.id === cursor) : 0;
    if (index < 0) throw new RecordingRefusal("expired_cursor");
    const s = m.segments[index];
    const batch = s
      ? await this.state.read(s, m.run)
      : { schema_version: 1, batch_id: randomUUID(), run: m.run, events: [] };
    return {
      generated_at: new Date().toISOString(),
      batches: [validateRecordingBatch({ ...batch, run: m.run })],
      next_cursor: m.segments[index + 1]?.id ?? null,
      status: this.state.status(),
    };
  }
  async show(id: string) {
    const m = this.manifest(id),
      events: RecordingBatch["events"][number][] = [];
    for (const s of m.segments)
      events.push(...(await this.state.read(s, m.run)).events);
    const analysis = analyzeRecording(
      events,
      this.state.recovered(id),
      new Map(m.run.admission ? [[id, m.run.admission]] : []),
    );
    const rows = analysis.summary.map((row) =>
      Schema.decodeUnknownSync(RecordingSummaryRow)(row),
    );
    return {
      generated_at: new Date().toISOString(),
      run: m.run,
      ...analysis,
      summary: rows.slice(0, 256),
      omitted_groups: Math.max(0, rows.length - 256),
      status: this.state.status(),
    };
  }
  async compare(before: string, after: string) {
    const a = await this.show(before),
      b = await this.show(after),
      reason = recordingComparisonRefusal(a.run, b.run);
    if (reason) throw new RecordingRefusal(reason);
    return {
      generated_at: new Date().toISOString(),
      before: a,
      after: b,
      comparable: true as const,
    };
  }
}
