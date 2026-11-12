import {
  type DiagnosticEvent,
  type DiagnosticObservation,
  summarizeInteractions,
} from "./client-diagnostics.ts";
import type { RecordingBatch } from "./diagnostic-recordings.ts";

export function recordingObservations(
  events: readonly DiagnosticEvent[],
): DiagnosticObservation[] {
  const clockUnknown = recordingClockDiscontinuities(events) > 0;
  const actions = new Map<
    string,
    { start: DiagnosticEvent; end?: DiagnosticEvent }
  >();
  const losses: DiagnosticObservation[] = [];
  const latest = new Map<string, number>();
  const crashed = new Set<string>();
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    latest.set(
      event.process_role,
      Math.max(latest.get(event.process_role) ?? 0, event.monotonic_ms),
    );
    if (event.name === "process.terminated" && event.reason === "crashed")
      crashed.add(event.process_role);
    if (
      (event.name === "ui.action.started" ||
        event.name === "ui.input.observed") &&
      !actions.has(`${event.process_role}:${event.action_id}`)
    )
      actions.set(`${event.process_role}:${event.action_id}`, { start: event });
    if (
      (event.name === "ui.result.committed" ||
        event.name === "ui.action.ended") &&
      event.action_id
    ) {
      const action = actions.get(`${event.process_role}:${event.action_id}`);
      if (action && action.end?.name !== "ui.result.committed")
        action.end = event;
      else if (!action)
        actions.set(`${event.process_role}:${event.action_id}`, {
          start: event,
          end: event,
        });
    }
    if (
      event.name === "recording.loss" &&
      event.lost_starts > 0 &&
      event.category.inventory_id !== "unknown"
    )
      losses.push({
        ...event,
        category: event.category,
        kind: "unfinished",
        outcome: "lost",
        count: event.lost_starts,
        age_ms: null,
      });
  }
  const result = [...losses];
  for (const { start, end } of actions.values()) {
    if (start.category.inventory_id === "unknown") continue;
    if (
      end?.name === "ui.result.committed" &&
      ["completed", "refused", "conflicted", "failed"].includes(end.outcome)
    ) {
      const outcome = end.outcome;
      if (
        outcome === "completed" ||
        outcome === "refused" ||
        outcome === "conflicted" ||
        outcome === "failed"
      )
        result.push({
          ...start,
          category: start.category,
          kind: "rendered",
          outcome,
          duration_ms: end.duration_ms,
          correct:
            end.correct &&
            !clockUnknown &&
            (start.name === "ui.input.observed" ||
              start.name === "ui.action.started"),
          render_stage: end.render_stage,
        });
    } else {
      const outcome =
        end?.name === "ui.action.ended"
          ? end.outcome
          : crashed.has(start.process_role)
            ? "crashed"
            : "pending";
      const unfinished =
        outcome === "failed" ||
        outcome === "refused" ||
        outcome === "conflicted" ||
        outcome === "superseded" ||
        outcome === "cancelled" ||
        outcome === "unavailable" ||
        outcome === "crashed" ||
        outcome === "timed_out" ||
        outcome === "lost"
          ? outcome
          : "pending";
      result.push({
        ...start,
        category: start.category,
        kind: "unfinished",
        outcome: unfinished,
        count: 1,
        age_ms: clockUnknown
          ? null
          : Math.max(
              0,
              (latest.get(start.process_role) ?? start.monotonic_ms) -
                start.monotonic_ms,
            ),
      });
    }
  }
  return result;
}
export function summarizeRecording(events: readonly DiagnosticEvent[]) {
  return analyzeRecording(events).summary;
}
export function recordingsComparable(
  before: RecordingBatch["run"],
  after: RecordingBatch["run"],
) {
  return (
    before.app === after.app &&
    before.contract_id === after.contract_id &&
    before.contract_id !== "unknown" &&
    before.build_id !== "dev" &&
    after.build_id !== "dev" &&
    before.comparison.configuration !== "unknown" &&
    before.comparison.render_stage !== "unknown" &&
    before.comparison.render_stage !== "unavailable" &&
    JSON.stringify(before.comparison) === JSON.stringify(after.comparison)
  );
}

export function recordingClockDiscontinuities(
  events: readonly DiagnosticEvent[],
) {
  const clocks = new Map<string, number>();
  let discontinuities = 0;
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const last = clocks.get(event.process_role);
    if (last !== undefined && event.monotonic_ms < last) discontinuities++;
    clocks.set(event.process_role, event.monotonic_ms);
  }
  return discontinuities;
}

export function recordingSequenceGaps(events: readonly DiagnosticEvent[]) {
  const sequences = new Map<string, number>();
  let gaps = 0;
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const last = sequences.get(event.process_role);
    gaps += Math.max(0, event.sequence - (last === undefined ? 1 : last + 1));
    sequences.set(event.process_role, event.sequence);
  }
  return gaps;
}

export function analyzeRecording(
  events: readonly DiagnosticEvent[],
  recovered = false,
) {
  const clock_discontinuities = recordingClockDiscontinuities(events),
    sequence_gaps = recordingSequenceGaps(events);
  const roles = new Set(events.map((event) => event.process_role));
  const recovery_uncertain =
    recovered &&
    [...roles].some(
      (role) =>
        !events.some(
          (event) =>
            event.process_role === role &&
            event.name === "process.terminated" &&
            event.reason === "clean",
        ),
    );
  const unattributed_lost_starts = events.reduce(
    (n, event) =>
      n +
      (event.name === "recording.loss" &&
      event.category.inventory_id === "unknown"
        ? event.lost_starts
        : 0),
    0,
  );
  const unknown =
    clock_discontinuities > 0 ||
    sequence_gaps > 0 ||
    recovery_uncertain ||
    unattributed_lost_starts > 0;
  const summary = summarizeInteractions(recordingObservations(events)).map(
    (row) => ({
      ...row,
      ...(unknown
        ? {
            evidence: "incomplete",
            fraction_by_20_ms: null,
            fraction_by_300_ms: null,
          }
        : {}),
    }),
  );
  return {
    clock_discontinuities,
    sequence_gaps,
    recovery_uncertain,
    unattributed_lost_starts,
    summary,
  };
}
