import type { Database } from "bun:sqlite";
import type { AuthAction, AuthAttemptRejected, OpLogEntry } from "../events.ts";
import type { ProfileId } from "../ids.ts";

type Attempt = {
  readonly actor: string;
  readonly profile: ProfileId | null;
  readonly action: AuthAction;
  readonly detail: AuthAttemptRejected["detail"];
  readonly time: number;
};

// Whether a stored event's occurred_at is the clock its writer read when it
// recorded the operation, so the stamp may end the walk. Total over every kind
// History can hold: adding a kind fails the typecheck until it is classified.
// TaskAttemptRejected copies a supplied attempted event's stamp, and
// TaskHistoryRedacted keeps the redacted event's original stamp; neither is
// the recording clock. Migration 0002's TaskCreated rows are excluded by actor.
const recordingClockKinds = {
  AuthChanged: true,
  AuthAttemptRejected: true,
  ProfileDeleted: true,
  ProfileDeletionRejected: true,
  DatabaseRestored: true,
  ReminderFired: true,
  DependencyAdded: true,
  DependencyRemoved: true,
  AttachmentAdded: true,
  AttachmentRemoved: true,
  TaskCreated: true,
  TaskEdited: true,
  TaskCompleted: true,
  TaskCancelled: true,
  TaskReopened: true,
  TaskDeleted: true,
  TaskPurged: true,
  TaskReverted: true,
  TaskMovedOut: true,
  TaskMovedIn: true,
  TaskAttemptRejected: false,
  TaskHistoryRedacted: false,
} as const satisfies Record<OpLogEntry["event"]["kind"], boolean>;

const recordingClock = (actor: unknown, kind: unknown): boolean =>
  actor !== "migration:0002" &&
  typeof kind === "string" &&
  Object.hasOwn(recordingClockKinds, kind) &&
  recordingClockKinds[kind as keyof typeof recordingClockKinds];

// The walk reads an event only if its stored text is at most this many bytes.
// A refusal (AuthAttemptRejected) has a fixed shape of bounded literals and an
// instant, about 160 bytes, so no refusal is ever skipped. A larger row (a Task
// with a long description) is skipped unread: it is never a match, and skipping
// it as evidence can only let the walk go further, never end early.
export const maxWalkedEventBytes = 4096;

// Every Task event carries whole Tasks, so in a Profile of long descriptions
// most rows can be large. So that such rows cannot carry the walk far past the
// horizon, every (K+1)-th large row the walk meets is read for its kind and
// stamp and counted as ordinary evidence: past the horizon, a run of large
// recording-clock rows ends the walk within K+1 of them. The count spans small
// rows too: a small row that cannot end the walk (a rejected Task attempt
// between large edits, for example) must not reset it.
export const largeRowsBetweenSamples = 256;

type Row = {
  seq: number;
  bytes: number;
  actor: string | null;
  outcome: string | null;
  reason: string | null;
  kind: unknown;
  action: unknown;
  detail: unknown;
  occurred_at: unknown;
};

// octet_length() of a TEXT column is answered from the record header without
// loading the value, so a skipped row costs no overflow-page reads. Every other
// column is read only inside the size gate: outcome and reason are stored after
// event, and reaching them would walk a large event's overflow chain.
const gated = (expression: string, name: string) =>
  `CASE WHEN octet_length(event)<=${maxWalkedEventBytes} THEN ${expression} END AS ${name}`;
const walkSql = `SELECT seq,octet_length(event) AS bytes,${[
  gated("actor", "actor"),
  gated("outcome", "outcome"),
  gated("reason", "reason"),
  gated("json_extract(event,'$.kind')", "kind"),
  gated("json_extract(event,'$.action')", "action"),
  gated("json_extract(event,'$.detail')", "detail"),
  gated("json_extract(event,'$.occurred_at')", "occurred_at"),
].join(",")} FROM op_log WHERE profile IS ? ORDER BY seq DESC`;
// Reads one sampled large row's provenance, loading that row only.
const sampleSql =
  "SELECT actor,json_extract(event,'$.kind') AS kind,json_extract(event,'$.occurred_at') AS occurred_at FROM op_log WHERE seq=?";

export const repeatedAuthRejection = (
  db: Database,
  attempt: Attempt,
): boolean => {
  const minute = Math.floor(attempt.time / 60_000);
  const horizon = (minute - 1) * 60_000;
  const rows = db
    .query<Row, [ProfileId | null]>(walkSql)
    .iterate(attempt.profile);
  // One pass from the newest row: the first match or the first recording-clock
  // row before the horizon decides. A match is any refusal in the attempt's
  // minute, even one stamped after this attempt: another process may have read
  // its clock later and committed first. A stamp after the attempt is never
  // before the horizon, so it cannot end the walk.
  let skipped = 0;
  for (const row of rows) {
    if (row.bytes > maxWalkedEventBytes) {
      if (skipped < largeRowsBetweenSamples) {
        skipped++;
        continue;
      }
      skipped = 0;
      // Evidence only: a large row is never a refusal.
      const sampled = db
        .query<
          { actor: string; kind: unknown; occurred_at: unknown },
          [number]
        >(sampleSql)
        .get(row.seq);
      if (typeof sampled?.occurred_at !== "string") continue;
      const time = Date.parse(sampled.occurred_at);
      if (
        Number.isFinite(time) &&
        recordingClock(sampled.actor, sampled.kind) &&
        time < horizon
      )
        return false;
      continue;
    }
    if (typeof row.occurred_at !== "string") continue;
    const time = Date.parse(row.occurred_at);
    if (!Number.isFinite(time)) continue;
    if (
      row.outcome === "rejected" &&
      row.reason === "auth" &&
      row.kind === "AuthAttemptRejected" &&
      row.actor === attempt.actor &&
      row.action === attempt.action &&
      row.detail === attempt.detail &&
      Math.floor(time / 60_000) === minute
    )
      return true;
    if (recordingClock(row.actor, row.kind) && time < horizon) return false;
  }
  return false;
};
