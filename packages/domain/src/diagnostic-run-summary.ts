import {
  type DiagnosticEvent,
  type DiagnosticObservation,
  summarizeInteractions,
} from "./client-diagnostics.ts";
import type { RecordingBatch } from "./diagnostic-recordings.ts";
import {
  admissionIncomplete,
  type RecordingAdmission,
} from "./recording-admission.ts";
import { uniqueRecordingEvents } from "./recording-event-identity.ts";
import type { recordingRefusals } from "./recording-refusal.ts";

const scope = (event: DiagnosticEvent) =>
  `${event.run_id}:${event.process_role}`;
const actionScope = (event: DiagnosticEvent) =>
  `${scope(event)}:${event.action_id}`;
function byRun(events: readonly DiagnosticEvent[]) {
  const groups = new Map<string, DiagnosticEvent[]>();
  for (const event of events) {
    const group = groups.get(event.run_id) ?? [];
    group.push(event);
    groups.set(event.run_id, group);
  }
  return groups;
}
export function recordingObservations(
  events: readonly DiagnosticEvent[],
): DiagnosticObservation[] {
  events = uniqueRecordingEvents(events);
  const unknownClocks = new Set(
    [...byRun(events)]
      .filter(([, group]) => recordingClockDiscontinuities(group) > 0)
      .map(([id]) => id),
  );
  const actions = new Map<
    string,
    { start: DiagnosticEvent; end?: DiagnosticEvent }
  >();
  const losses: DiagnosticObservation[] = [];
  const latest = new Map<string, number>();
  const crashed = new Set<string>();
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    latest.set(
      scope(event),
      Math.max(latest.get(scope(event)) ?? 0, event.monotonic_ms),
    );
    if (event.name === "process.terminated" && event.reason === "crashed")
      crashed.add(scope(event));
    if (
      (event.name === "ui.action.started" ||
        event.name === "ui.input.observed") &&
      !actions.has(actionScope(event))
    )
      actions.set(actionScope(event), { start: event });
    if (
      (event.name === "ui.result.committed" ||
        event.name === "ui.action.ended") &&
      event.action_id
    ) {
      const action = actions.get(actionScope(event));
      if (action && action.end?.name !== "ui.result.committed")
        action.end = event;
      else if (!action)
        actions.set(actionScope(event), {
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
            !unknownClocks.has(start.run_id) &&
            (start.name === "ui.input.observed" ||
              start.name === "ui.action.started"),
          render_stage: end.render_stage,
        });
    } else {
      const outcome =
        end?.name === "ui.action.ended"
          ? end.outcome
          : crashed.has(scope(start))
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
        age_ms: unknownClocks.has(start.run_id)
          ? null
          : Math.max(
              0,
              (latest.get(scope(start)) ?? start.monotonic_ms) -
                start.monotonic_ms,
            ),
      });
    }
  }
  return result;
}
export function summarizeRecording(
  events: readonly DiagnosticEvent[],
  admissions: ReadonlyMap<string, RecordingAdmission> = new Map(),
) {
  return analyzeRecording(events, false, admissions).summary;
}
export function recordingComparisonRefusal(
  before: RecordingBatch["run"],
  after: RecordingBatch["run"],
): keyof typeof recordingRefusals | undefined {
  if (
    admissionIncomplete(before.admission) ||
    admissionIncomplete(after.admission)
  )
    return "incomplete_run";
  const a = before.comparison,
    b = after.comparison;
  if (!a || !b) return "missing_comparison";
  if (before.build_id === "dev" || after.build_id === "dev")
    return "unknown_build";
  if (before.contract_id === "unknown" || after.contract_id === "unknown")
    return "unknown_contract";
  if (a.configuration === "unknown" || b.configuration === "unknown")
    return "unknown_configuration";
  if (
    [a.render_stage, b.render_stage].some(
      (stage) => stage === "unknown" || stage === "unavailable",
    )
  )
    return "unknown_render_stage";
  if (before.app !== after.app) return "app_mismatch";
  if (before.contract_id !== after.contract_id) return "contract_mismatch";
  if (a.fixture_hash !== b.fixture_hash) return "fixture_mismatch";
  if (a.script_hash !== b.script_hash) return "script_mismatch";
  if (a.environment_hash !== b.environment_hash) return "environment_mismatch";
  if (a.configuration !== b.configuration) return "configuration_mismatch";
  if (a.render_stage !== b.render_stage) return "render_stage_mismatch";
  if (a.concurrency !== b.concurrency) return "concurrency_mismatch";
  return undefined;
}
export function recordingsComparable(
  before: RecordingBatch["run"],
  after: RecordingBatch["run"],
) {
  return recordingComparisonRefusal(before, after) === undefined;
}

export function recordingClockDiscontinuities(
  events: readonly DiagnosticEvent[],
) {
  const clocks = new Map<string, number>();
  let discontinuities = 0;
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const last = clocks.get(scope(event));
    if (last !== undefined && event.monotonic_ms < last) discontinuities++;
    clocks.set(scope(event), event.monotonic_ms);
  }
  return discontinuities;
}

export function recordingSequenceGaps(events: readonly DiagnosticEvent[]) {
  const sequences = new Map<string, number>();
  let gaps = 0;
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const last = sequences.get(scope(event));
    gaps += Math.max(0, event.sequence - (last === undefined ? 1 : last + 1));
    sequences.set(scope(event), event.sequence);
  }
  return gaps;
}

function analyzeRun(events: readonly DiagnosticEvent[], recovered = false) {
  events = uniqueRecordingEvents(events);
  const clock_discontinuities = recordingClockDiscontinuities(events),
    sequence_gaps = recordingSequenceGaps(events);
  const roles = new Set(events.map(scope));
  const recovery_uncertain =
    recovered &&
    [...roles].some(
      (role) =>
        !events.some(
          (event) =>
            scope(event) === role &&
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

export function analyzeRecording(
  events: readonly DiagnosticEvent[],
  recovered = false,
  admissions: ReadonlyMap<string, RecordingAdmission> = new Map(),
) {
  const analyses = [...byRun(uniqueRecordingEvents(events)).values()].map(
    (group) => {
      const analysis = analyzeRun(group, recovered);
      if (admissionIncomplete(admissions.get(group[0]?.run_id ?? "")))
        return {
          ...analysis,
          summary: analysis.summary.map((row) => ({
            ...row,
            evidence: "incomplete" as const,
            fraction_by_20_ms: null,
            fraction_by_300_ms: null,
          })),
        };
      return analysis;
    },
  );
  return {
    clock_discontinuities: analyses.reduce(
      (n, analysis) => n + analysis.clock_discontinuities,
      0,
    ),
    sequence_gaps: analyses.reduce(
      (n, analysis) => n + analysis.sequence_gaps,
      0,
    ),
    recovery_uncertain: analyses.some(
      (analysis) => analysis.recovery_uncertain,
    ),
    unattributed_lost_starts: analyses.reduce(
      (n, analysis) => n + analysis.unattributed_lost_starts,
      0,
    ),
    summary: analyses.flatMap((analysis) => analysis.summary),
  };
}
