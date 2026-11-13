import type { Database } from "bun:sqlite";
import type { AuthAction, AuthAttemptRejected } from "../events.ts";
import type { ProfileId } from "../ids.ts";

type Attempt = {
  readonly actor: string;
  readonly profile: ProfileId | null;
  readonly action: AuthAction;
  readonly detail: AuthAttemptRejected["detail"];
  readonly time: number;
};

type Row = {
  actor: string;
  outcome: string;
  reason: string | null;
  kind: unknown;
  action: unknown;
  detail: unknown;
  occurred_at: unknown;
};

const recordingClock = (row: Row): boolean => {
  if (row.actor === "migration:0002") return false;
  switch (row.kind) {
    case "AuthChanged":
    case "AuthAttemptRejected":
    case "ProfileDeleted":
    case "ProfileDeletionRejected":
    case "DatabaseRestored":
    case "ReminderFired":
    case "DependencyAdded":
    case "DependencyRemoved":
    case "AttachmentAdded":
    case "AttachmentRemoved":
    case "TaskCreated":
    case "TaskEdited":
    case "TaskCompleted":
    case "TaskCancelled":
    case "TaskReopened":
    case "TaskDeleted":
    case "TaskPurged":
    case "TaskReverted":
    case "TaskMovedOut":
    case "TaskMovedIn":
      return true;
    default:
      return false;
  }
};

export const repeatedAuthRejection = (
  db: Database,
  attempt: Attempt,
): boolean => {
  const minute = Math.floor(attempt.time / 60_000);
  const horizon = (minute - 1) * 60_000;
  const rows = db
    .query<Row, [ProfileId | null]>(
      "SELECT actor,outcome,reason,json_extract(event,'$.kind') kind,json_extract(event,'$.action') action,json_extract(event,'$.detail') detail,json_extract(event,'$.occurred_at') occurred_at FROM op_log WHERE profile IS ? ORDER BY seq DESC",
    )
    .iterate(attempt.profile);
  for (const row of rows) {
    if (typeof row.occurred_at !== "string") continue;
    const time = Date.parse(row.occurred_at);
    if (!Number.isFinite(time) || time > attempt.time) continue;
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
    if (recordingClock(row) && time < horizon) return false;
  }
  return false;
};
