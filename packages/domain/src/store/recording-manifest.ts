import { createHash, randomUUID } from "node:crypto";
import { Schema } from "effect";
import { DiagnosticRunId } from "../client-diagnostics.ts";
import {
  type RecordingBatch,
  RecordingRun,
  recordingLimits,
  validateRecordingBatch,
} from "../diagnostic-recordings.ts";
import {
  admissionIncomplete,
  emptyRecordingAdmission,
  type RecordingAdmission,
  recordingRunDefinition,
} from "../recording-admission.ts";

export const manifestByteLimit = 256 * 1024;
const count = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
);
const hash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
export const Segment = Schema.Struct({
  id: DiagnosticRunId,
  time: count,
  size: count,
  checksum: hash,
  events: count,
  origin: DiagnosticRunId,
  fingerprint: hash,
});
export type Segment = typeof Segment.Type;
export const Manifest = Schema.Struct({
  version: Schema.Literal(2),
  updated_at: count,
  run: RecordingRun,
  loss: Schema.Struct({
    capacity_events: count,
    expired_events: count,
    corrupt_events: count,
  }),
  segments: Schema.Array(Segment).check(
    Schema.isMaxLength(recordingLimits.segments),
  ),
});
export type Manifest = typeof Manifest.Type;
export const manifestName = (id: string) => `${id}.admission.json`;
export const segmentName = (s: Pick<Segment, "id" | "time">) =>
  `${s.time.toString().padStart(13, "0")}-${s.id}.json`;
export const checksum = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export const fingerprint = (batch: RecordingBatch) =>
  checksum(
    JSON.stringify({ ...batch, run: recordingRunDefinition(batch.run) }),
  );
export const bytes = (text: string) => Buffer.byteLength(text);
const max = (a: number | null, b: number | null) =>
  a === null || b === null ? null : Math.max(a, b);
const add = (a: number | null, b: number) =>
  a === null || !Number.isSafeInteger(a + b) ? null : a + b;
export function mergeAdmission(
  a = emptyRecordingAdmission(),
  b = emptyRecordingAdmission(),
): RecordingAdmission {
  return {
    schema_version: 1,
    policy: "whole_batch",
    refused_batches: max(a.refused_batches, b.refused_batches),
    unadmitted_events: max(a.unadmitted_events, b.unadmitted_events),
    incomplete: admissionIncomplete(a) || admissionIncomplete(b),
  };
}
export function withRefusals(
  a: RecordingAdmission,
  batches: number,
  events: number,
): RecordingAdmission {
  return {
    ...a,
    refused_batches: add(a.refused_batches, batches),
    unadmitted_events: add(a.unadmitted_events, events),
    incomplete: a.incomplete || batches > 0,
  };
}
export function covers(
  actual: RecordingAdmission,
  required: RecordingAdmission,
) {
  const includes = (a: number | null, b: number | null) =>
    a === null || (b !== null && a >= b);
  return (
    !admissionIncomplete(required) ||
    (admissionIncomplete(actual) &&
      includes(actual.refused_batches, required.refused_batches) &&
      includes(actual.unadmitted_events, required.unadmitted_events))
  );
}
export function encodeManifest(value: Manifest) {
  const valid = Schema.decodeUnknownSync(Manifest, {
    onExcessProperty: "error",
  })(value);
  const text = JSON.stringify({
    manifest: valid,
    checksum: checksum(JSON.stringify(valid)),
  });
  if (bytes(text) > manifestByteLimit) throw new Error("Manifest capacity");
  return text;
}
export function decodeManifest(text: string): Manifest {
  if (bytes(text) > manifestByteLimit) throw new Error("Manifest capacity");
  const stored = Schema.decodeUnknownSync(
    Schema.Struct({ manifest: Manifest, checksum: hash }),
    { onExcessProperty: "error" },
  )(JSON.parse(text));
  const value = stored.manifest;
  if (checksum(JSON.stringify(value)) !== stored.checksum)
    throw new Error("Manifest checksum");
  if (
    !value.run.admission ||
    new Set(value.segments.map((s) => s.id)).size !== value.segments.length
  )
    throw new Error("Invalid manifest");
  return value;
}
const maximum: RecordingAdmission = {
  schema_version: 1,
  policy: "whole_batch",
  refused_batches: Number.MAX_SAFE_INTEGER,
  unadmitted_events: Number.MAX_SAFE_INTEGER,
  incomplete: true,
};
export function splitBatch(batch: RecordingBatch, time: number) {
  const run = recordingRunDefinition(batch.run),
    parts: { batch: RecordingBatch; text: string; segment: Segment }[] = [];
  let events: RecordingBatch["events"][number][] = [];
  const emit = () => {
    if (!events.length) return;
    const value = validateRecordingBatch({
      schema_version: 1,
      batch_id: randomUUID(),
      run,
      events,
    });
    if (
      bytes(JSON.stringify({ ...value, run: { ...run, admission: maximum } })) >
      recordingLimits.batchBytes - 4096
    )
      throw new Error("Export capacity");
    validateRecordingBatch({ ...value, run: { ...run, admission: maximum } });
    const text = JSON.stringify({ received: time, batch: value });
    if (bytes(text) > recordingLimits.batchBytes + 64)
      throw new Error("Segment capacity");
    parts.push({
      batch: value,
      text,
      segment: {
        id: value.batch_id,
        time,
        size: bytes(text),
        checksum: checksum(text),
        events: events.length,
        origin: batch.batch_id,
        fingerprint: fingerprint(batch),
      },
    });
    events = [];
  };
  for (const event of batch.events) {
    try {
      const candidate = validateRecordingBatch({
        schema_version: 1,
        batch_id: batch.batch_id,
        run: { ...run, admission: maximum },
        events: [...events, event],
      });
      if (bytes(JSON.stringify(candidate)) > recordingLimits.batchBytes - 4096)
        throw new Error("Export capacity");
    } catch {
      emit();
    }
    events.push(event);
  }
  emit();
  return parts;
}

export async function inspectManifest(
  text: string | undefined,
  read: (name: string) => Promise<string | undefined>,
) {
  let manifest: Manifest;
  try {
    if (text === undefined) return undefined;
    manifest = decodeManifest(text);
  } catch {
    return undefined;
  }
  const batches = new Map<string, RecordingBatch>(),
    bad: Segment[] = [];
  for (const s of manifest.segments)
    try {
      const blob = await read(segmentName(s));
      if (
        blob === undefined ||
        bytes(blob) !== s.size ||
        checksum(blob) !== s.checksum
      )
        throw new Error("Segment checksum");
      const stored = Schema.decodeUnknownSync(
        Schema.Struct({ received: Schema.Number, batch: Schema.Unknown }),
        { onExcessProperty: "error" },
      )(JSON.parse(blob));
      const batch = validateRecordingBatch(stored.batch);
      if (
        batch.batch_id !== s.id ||
        stored.received !== s.time ||
        batch.events.length !== s.events ||
        JSON.stringify(recordingRunDefinition(batch.run)) !==
          JSON.stringify(recordingRunDefinition(manifest.run))
      )
        throw new Error("Segment identity");
      batches.set(s.id, batch);
    } catch {
      bad.push(s);
    }
  const badIds = new Set(bad.map((s) => s.id));
  return {
    manifest: bad.length
      ? {
          ...manifest,
          run: {
            ...manifest.run,
            admission: {
              ...(manifest.run.admission ?? emptyRecordingAdmission()),
              incomplete: true,
            },
          },
          segments: manifest.segments.filter((s) => !badIds.has(s.id)),
          loss: {
            ...manifest.loss,
            corrupt_events:
              manifest.loss.corrupt_events +
              bad.reduce((n, s) => n + s.events, 0),
          },
        }
      : manifest,
    batches,
    bad,
  };
}

export const manifestSize = (value: Manifest) =>
  bytes(JSON.stringify({ manifest: value, checksum: "0".repeat(64) }));
