const recordingFailures = new WeakMap<object, number>();
const failedStarts = new WeakMap<object, number>();
const failedEvents = new WeakMap<object, number>();

export function observeDiagnostic<Recorder extends object, A>(
  recorder: Recorder,
  observation: () => A,
  loss: "start" | "event" = "event",
): A | undefined {
  try {
    return observation();
  } catch {
    recordingFailures.set(recorder, (recordingFailures.get(recorder) ?? 0) + 1);
    const losses = loss === "start" ? failedStarts : failedEvents;
    losses.set(recorder, (losses.get(recorder) ?? 0) + 1);
    return undefined;
  }
}

export function diagnosticFailureCounts(recorder: object): {
  readonly total: number;
  readonly lost_starts: number;
  readonly lost_events: number;
} {
  return {
    total: recordingFailures.get(recorder) ?? 0,
    lost_starts: failedStarts.get(recorder) ?? 0,
    lost_events: failedEvents.get(recorder) ?? 0,
  };
}
