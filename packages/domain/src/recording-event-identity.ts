import type { DiagnosticEvent } from "./client-diagnostics.ts";
import { RecordingRefusal } from "./recording-refusal.ts";

export const recordingEventKey = (event: DiagnosticEvent) =>
  `${event.run_id}:${event.process_role}:${event.sequence}`;
export const recordingEventContent = (event: DiagnosticEvent) =>
  JSON.stringify(event, (_key, value: unknown) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, Reflect.get(value, key)]),
        )
      : value,
  );
export function uniqueRecordingEvents(events: readonly DiagnosticEvent[]) {
  const phases = new Set<string>();
  const seen = new Map<string, string>(),
    unique: DiagnosticEvent[] = [];
  for (const event of events) {
    const key = recordingEventKey(event),
      content = recordingEventContent(event),
      previous = seen.get(key);
    if (previous !== undefined && previous !== content)
      throw new RecordingRefusal("sequence_conflict");
    if (previous === undefined) {
      if (
        event.action_id &&
        [
          "ui.input.observed",
          "ui.action.started",
          "ui.action.ended",
          "ui.result.committed",
        ].includes(event.name)
      ) {
        const phase = `${event.run_id}:${event.process_role}:${event.action_id}:${event.name}`;
        if (phases.has(phase)) throw new RecordingRefusal("action_conflict");
        phases.add(phase);
      }
      seen.set(key, content);
      unique.push(event);
    }
  }
  return unique;
}
