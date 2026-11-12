import { createHash } from "node:crypto";
import type { DiagnosticEvent } from "../client-diagnostics.ts";
import {
  type RecordingBatch,
  validateRecordingBatch,
} from "../diagnostic-recordings.ts";
import {
  recordingEventContent,
  recordingEventKey,
} from "../recording-event-identity.ts";
import { RecordingRefusal } from "../recording-refusal.ts";

const fingerprint = (event: DiagnosticEvent) => ({
  key: recordingEventKey(event),
  digest: createHash("sha256")
    .update(recordingEventContent(event))
    .digest("hex"),
});
export const recordingEventFingerprints = (batch: RecordingBatch) =>
  batch.events.map(fingerprint);
export class RecordingEventIndex {
  private readonly batches = new Map<
    string,
    { items: ReturnType<typeof recordingEventFingerprints>; stored: boolean }
  >();
  private readonly events = new Map<
    string,
    Map<string, { references: number; stored: number }>
  >();
  check(items: ReturnType<typeof recordingEventFingerprints>) {
    let duplicate = true;
    for (const item of items) {
      const hashes = this.events.get(item.key);
      if (hashes && (hashes.size !== 1 || !hashes.has(item.digest)))
        throw new RecordingRefusal("sequence_conflict");
      if (!hashes?.get(item.digest)?.stored) duplicate = false;
    }
    return duplicate;
  }
  retain(
    id: string,
    items: ReturnType<typeof recordingEventFingerprints>,
    stored = false,
  ) {
    this.batches.set(id, { items, stored });
    for (const item of items) {
      const hashes =
        this.events.get(item.key) ??
        new Map<string, { references: number; stored: number }>();
      const counts = hashes.get(item.digest) ?? { references: 0, stored: 0 };
      counts.references++;
      counts.stored += Number(stored);
      hashes.set(item.digest, counts);
      this.events.set(item.key, hashes);
    }
  }
  commit(id: string) {
    const batch = this.batches.get(id);
    if (!batch || batch.stored) return;
    batch.stored = true;
    for (const item of batch.items) {
      const counts = this.events.get(item.key)?.get(item.digest);
      if (counts) counts.stored++;
    }
  }
  forget(id: string) {
    const batch = this.batches.get(id);
    for (const item of batch?.items ?? []) {
      const hashes = this.events.get(item.key),
        counts = hashes?.get(item.digest);
      if (counts) {
        counts.references--;
        counts.stored -= Number(batch?.stored);
      }
      if (!counts || counts.references === 0) hashes?.delete(item.digest);
      if (hashes?.size === 0) this.events.delete(item.key);
    }
    this.batches.delete(id);
  }
}
export async function readRecordingEvents(
  entries: readonly { name: string }[],
  read: (name: string) => Promise<string>,
) {
  const events: DiagnosticEvent[] = [],
    seen = new Map<string, string>();
  for (const entry of entries) {
    const batch = validateRecordingBatch(
      JSON.parse(await read(entry.name)).batch,
    );
    for (const event of batch.events) {
      const item = fingerprint(event),
        previous = seen.get(item.key);
      if (previous && previous !== item.digest)
        throw new RecordingRefusal("sequence_conflict");
      if (!previous) {
        seen.set(item.key, item.digest);
        events.push(event);
      }
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return events;
}
