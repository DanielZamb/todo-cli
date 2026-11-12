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
import type { RecordingAdmissions } from "./recording-admissions.ts";
import { readRecordingEvents } from "./recording-event-index.ts";

type Entry = {
  name: string;
  run: RecordingBatch["run"];
  batch: RecordingBatch["batch_id"];
  bytes: number;
  events: number;
};
export class RecordingQueries {
  constructor(
    private readonly state: {
      entries: readonly Entry[];
      admissions: RecordingAdmissions;
      read: (name: string) => Promise<string>;
      status: () => ReturnType<DiagnosticRecordings["status"]>;
      recovered: (id: string) => boolean;
    },
  ) {}
  runs(cursor = 0) {
    const groups = new Map<
      string,
      {
        run: RecordingBatch["run"];
        events: number;
        bytes: number;
        batches: number;
      }
    >();
    for (const e of this.state.entries) {
      const old = groups.get(e.run.run_id) ?? {
        run: this.state.admissions.describe(e.run),
        events: 0,
        bytes: 0,
        batches: 0,
      };
      old.events += e.events;
      old.bytes += e.bytes;
      old.batches++;
      groups.set(e.run.run_id, old);
    }
    for (const state of this.state.admissions.values())
      if (!groups.has(state.run.run_id))
        groups.set(state.run.run_id, {
          run: this.state.admissions.describe(state.run),
          events: 0,
          bytes: 0,
          batches: 0,
        });
    const all = [...groups.values()];
    return {
      generated_at: new Date().toISOString(),
      runs: all.slice(cursor, cursor + 100),
      next_cursor: cursor + 100 < all.length ? cursor + 100 : null,
      status: this.state.status(),
    };
  }
  async export(run: string, cursor?: string) {
    const entries = this.state.entries.filter((e) => e.run.run_id === run),
      base = entries[0]?.run ?? this.state.admissions.base(run);
    if (!base) throw new RecordingRefusal("missing_run");
    const index = cursor ? entries.findIndex((e) => e.batch === cursor) : 0;
    if (index < 0) throw new RecordingRefusal("expired_cursor");
    const entry = entries[index];
    const batch = entry
      ? validateRecordingBatch(
          JSON.parse(await this.state.read(entry.name)).batch,
        )
      : {
          schema_version: 1 as const,
          batch_id: randomUUID(),
          run: base,
          events: [],
        };
    return {
      generated_at: new Date().toISOString(),
      batches: [
        validateRecordingBatch({
          ...batch,
          run: this.state.admissions.describe(base),
        }),
      ],
      next_cursor: entries[index + 1]?.batch ?? null,
      status: this.state.status(),
    };
  }
  async show(id: string) {
    const entries = this.state.entries.filter((e) => e.run.run_id === id),
      base = entries[0]?.run ?? this.state.admissions.base(id);
    if (!base) throw new RecordingRefusal("missing_run");
    const events = await readRecordingEvents(entries, this.state.read),
      run = this.state.admissions.describe(base);
    const analysis = analyzeRecording(
      events,
      this.state.recovered(id),
      new Map([[id, this.state.admissions.state(id)]]),
    );
    const all = analysis.summary.map((row) =>
      Schema.decodeUnknownSync(RecordingSummaryRow)(row),
    );
    return {
      generated_at: new Date().toISOString(),
      run,
      omitted_groups: Math.max(0, all.length - 256),
      ...analysis,
      summary: all.slice(0, 256),
      status: this.state.status(),
    };
  }
  async compare(before: string, after: string) {
    const a = await this.show(before),
      b = await this.show(after),
      refusal = recordingComparisonRefusal(a.run, b.run);
    if (refusal) throw new RecordingRefusal(refusal);
    return {
      generated_at: new Date().toISOString(),
      before: a,
      after: b,
      comparable: true as const,
    };
  }
}
