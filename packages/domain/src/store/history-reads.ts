import type { Database } from "bun:sqlite";
import { Schema } from "effect";
import { type AuthorizedRead, readAuthority } from "../auth/authorized-read.ts";
import { OpLogEntry } from "../events.ts";
import type { ProfileId, TaskId } from "../ids.ts";

const taskPair =
  "json_extract(event,'$.before.id')=:id OR json_extract(event,'$.after.id')=:id";
const taskChanges = (path: string) =>
  `EXISTS (SELECT 1 FROM json_each(event,'${path}') c WHERE json_extract(c.value,'$.before.id')=:id OR json_extract(c.value,'$.after.id')=:id)`;
const edges = (path: string) =>
  `EXISTS (SELECT 1 FROM json_each(event,'${path}.added') e WHERE json_extract(e.value,'$.dependent_id')=:id OR json_extract(e.value,'$.blocker_id')=:id) OR EXISTS (SELECT 1 FROM json_each(event,'${path}.removed') e WHERE json_extract(e.value,'$.dependent_id')=:id OR json_extract(e.value,'$.blocker_id')=:id)`;
const successor = `${taskPair} OR EXISTS (SELECT 1 FROM json_each(event,'$.next_occurrences') n WHERE json_extract(n.value,'$.id')=:id)`;
const predicates = {
  TaskCreated: `json_extract(event,'$.task.id')=:id OR ${edges("$.dependencies")}`,
  TaskEdited: taskPair,
  TaskCompleted: successor,
  TaskCancelled: successor,
  TaskReopened: taskPair,
  TaskDeleted: `${taskPair} OR ${edges("$.dependencies")}`,
  TaskPurged: `json_extract(event,'$.before.id')=:id OR ${edges("$.dependencies")}`,
  TaskReverted: `${taskChanges("$.tasks")} OR ${edges("$.dependencies")}`,
  TaskMovedOut: `json_extract(event,'$.task.id')=:id OR ${edges("$.dependencies")}`,
  TaskMovedIn: "json_extract(event,'$.task.id')=:id",
  AttachmentAdded: taskPair,
  AttachmentRemoved: taskPair,
  DependencyAdded:
    "json_extract(event,'$.dependent_id')=:id OR json_extract(event,'$.blocker_id')=:id",
  DependencyRemoved:
    "json_extract(event,'$.dependent_id')=:id OR json_extract(event,'$.blocker_id')=:id",
  ReminderFired: "json_extract(event,'$.task_id')=:id",
  TaskAttemptRejected: `json_extract(event,'$.task_id')=:id OR EXISTS (
    SELECT 1 FROM json_each(event,'$.violations') v
    WHERE json_type(v.value,'$.received.dependent_id')='text'
      AND json_extract(v.value,'$.received.dependent_id')<>''
      AND json_type(v.value,'$.received.blocker_id')='text'
      AND json_extract(v.value,'$.received.blocker_id')<>''
      AND (json_extract(v.value,'$.received.dependent_id')=:id OR json_extract(v.value,'$.received.blocker_id')=:id))`,
  AuthChanged: "0",
  AuthAttemptRejected: "0",
  ProfileDeleted: "0",
  ProfileDeletionRejected: "0",
  DatabaseRestored: "0",
  TaskHistoryRedacted: `EXISTS (SELECT 1 FROM json_each(event,'$.task_ids') t WHERE t.value=:id) OR ${taskChanges("$.replay.tasks")} OR ${edges("$.replay.dependencies")}`,
} satisfies Record<OpLogEntry["event"]["kind"], string>;

const relevant = `CASE json_extract(event,'$.kind') ${Object.entries(predicates)
  .map(([kind, predicate]) => `WHEN '${kind}' THEN (${predicate})`)
  .join(" ")} ELSE 0 END`;
const decode = (rows: { event: string }[]) =>
  rows.map((row) =>
    Schema.decodeUnknownSync(OpLogEntry)({
      ...row,
      event: JSON.parse(row.event),
    }),
  );

export const taskHistory = (
  db: Database,
  read: AuthorizedRead<{ task_id: TaskId }>,
) => {
  const value = readAuthority(read, "read", db);
  const profile = value.profile,
    id = value.fields.task_id;
  return decode(
    db
      .query<{ event: string }, { profile: string; id: string }>(
        `SELECT * FROM op_log WHERE profile=:profile AND (${relevant}) ORDER BY seq`,
      )
      .all({ profile, id }),
  );
};

export const committedHistory = (
  db: Database,
  profile: ProfileId,
  after: number,
) =>
  db
    .transaction(() => ({
      cursor: Math.max(
        after,
        db
          .query<{ seq: number }, []>(
            "SELECT coalesce(max(seq),0) AS seq FROM op_log",
          )
          .get()?.seq ?? 0,
      ),
      entries: decode(
        db
          .query<{ event: string }, [string, number]>(
            "SELECT * FROM op_log WHERE profile=? AND outcome='committed' AND seq>? ORDER BY seq",
          )
          .all(profile, after),
      ),
    }))
    .deferred();
