import { expect, it } from "@effect/vitest";
import { OpLogEntry, Task, TaskEdited } from "@todo/domain";
import { Effect, Schema } from "effect";
import {
  canRevertHistory,
  editedChanges,
  historyLabel,
  localHistoryTime,
  rejectionReason,
  relativeHistoryTime,
  revertedSequences,
} from "../src/history.ts";

const task = Schema.decodeUnknownSync(Task)({
  id: "task-1",
  profile_id: "work",
  entity_version: 1,
  row_version: 1,
  title: "Original title",
  description: null,
  project_id: null,
  priority: "P3",
  scheduled_at: null,
  due_at: null,
  energy: null,
  estimate_min: null,
  source: "manual",
  tags: [],
  status: "open",
  occurrence: null,
  created_at: "2026-10-27T12:00:00Z",
  updated_at: "2026-10-27T12:00:00Z",
  completed_at: null,
  deleted_at: null,
});
const eventFields = { entity_version: 1, occurred_at: "2026-10-27T12:00:00Z" };
function entry(
  seq: number,
  event: unknown,
  reason: string | null = null,
): OpLogEntry {
  return Schema.decodeUnknownSync(OpLogEntry)({
    seq,
    actor: "test",
    profile: "work",
    from_version: null,
    to_version: null,
    outcome: reason === null ? "committed" : "rejected",
    reason,
    event: {
      ...eventFields,
      ...Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
        event,
      ),
    },
  });
}
const edit = Schema.decodeUnknownSync(TaskEdited)({
  ...eventFields,
  kind: "TaskEdited",
  before: task,
  after: {
    ...task,
    row_version: 2,
    title: "New title",
    description: "Notes",
    priority: "P1",
    energy: 2,
    estimate_min: 25,
  },
  project_before: null,
  project_after: null,
  tags_before: [],
  tags_after: [],
  series_before: null,
  series_after: null,
});

it.effect(
  "labels every task event and the attempted operation in plain words",
  () =>
    Effect.sync(() => {
      const events = [
        entry(1, {
          kind: "TaskCreated",
          task,
          series: null,
          project: null,
          tags: [],
        }),
        entry(2, edit),
        entry(3, {
          kind: "TaskCompleted",
          before: task,
          after: task,
          next_occurrences: [],
        }),
        entry(4, {
          kind: "TaskCancelled",
          before: task,
          after: task,
          next_occurrences: [],
        }),
        entry(5, { kind: "TaskReopened", before: task, after: task }),
        entry(6, {
          kind: "TaskMovedIn",
          task,
          move_id: "move",
          original_seq: null,
        }),
        entry(7, { kind: "TaskDeleted", before: task, after: task }),
        entry(8, {
          kind: "TaskReverted",
          original_seq: 2,
          tasks: [],
          series: [],
        }),
        entry(9, {
          kind: "ReminderFired",
          task_id: task.id,
          title: task.title,
          due_at: eventFields.occurred_at,
          task_version: 1,
        }),
        entry(
          10,
          {
            kind: "TaskAttemptRejected",
            attempted_kind: "TaskEdited",
            task_id: task.id,
            violations: [],
          },
          "conflict",
        ),
        entry(11, {
          kind: "TaskMovedOut",
          task,
          move_id: "inverse",
          original_seq: 6,
        }),
      ];
      expect(events.map(historyLabel)).toEqual([
        "Created",
        "Edited",
        "Completed",
        "Cancelled",
        "Reopened",
        "Moved",
        "Deleted",
        "Reverted",
        "Reminder",
        "Edited",
        "Reverted",
      ]);
      const reverted = revertedSequences(events);
      expect(events.map((value) => canRevertHistory(value, reverted))).toEqual([
        false,
        false,
        true,
        true,
        true,
        false,
        true,
        true,
        false,
        false,
        false,
      ]);
      expect(rejectionReason("conflict")).toBe(
        "The task changed before this attempt was saved.",
      );
      expect(rejectionReason("future_reason")).toBe(
        "This attempt could not be saved.",
      );
    }),
);

it.effect("lists only changed fields with their old and new values", () =>
  Effect.sync(() => {
    expect(editedChanges(edit)).toEqual([
      { field: "Title", before: "Original title", after: "New title" },
      { field: "Description", before: "None", after: '"Notes"' },
      { field: "Priority", before: "P3", after: "P1" },
      { field: "Energy", before: "None", after: "2" },
      { field: "Estimate", before: "None", after: "25 min" },
    ]);
    expect(editedChanges({ ...edit, after: task })).toEqual([]);
  }),
);

it.effect(
  "uses recorded Project and Tag names and formats dates without UTC day shifts",
  () =>
    Effect.sync(() => {
      const project = {
        id: "project-1",
        profile_id: "work",
        name: "Launch",
        created_at: eventFields.occurred_at,
        updated_at: eventFields.occurred_at,
      };
      const value = Schema.decodeUnknownSync(TaskEdited)({
        ...edit,
        project_after: project,
        tags_after: [{ id: "tag-1", profile_id: "work", name: "Focus" }],
        after: {
          ...task,
          project_id: "project-1",
          tags: ["tag-1"],
          due_at: { kind: "date", date: "2026-10-28" },
        },
      });
      const changes = editedChanges(value);
      expect(changes.slice(0, 2)).toEqual([
        { field: "Project", before: "None", after: '"Launch"' },
        { field: "Tags", before: "None", after: '"Focus"' },
      ]);
      expect(changes.find((change) => change.field === "Due")?.after).toContain(
        "28",
      );
      expect(JSON.stringify(changes)).not.toContain("2026-10-28");
    }),
);

it.effect("keeps Purge-redacted content erased and unavailable to Revert", () =>
  Effect.sync(() => {
    const value = entry(1, {
      kind: "TaskHistoryRedacted",
      original_kind: "TaskEdited",
      attempted_kind: null,
      task_ids: [task.id],
      replay: {
        tasks: [],
        series: [],
        projects: [],
        tags: [],
        versions: [],
        series_versions: [],
      },
    });
    expect(historyLabel(value)).toBe("Edited");
    expect(canRevertHistory(value, revertedSequences([value]))).toBe(false);
  }),
);

it.effect("formats relative time and a full local date", () =>
  Effect.sync(() => {
    expect(
      relativeHistoryTime(
        eventFields.occurred_at,
        Date.parse("2026-10-27T12:02:00Z"),
        "en-US",
      ),
    ).toBe("2 minutes ago");
    expect(
      relativeHistoryTime(
        eventFields.occurred_at,
        Date.parse("2026-10-27T12:00:30Z"),
        "en-US",
      ),
    ).toBe("Just now");
    expect(
      localHistoryTime(eventFields.occurred_at, "en-US", "America/Bogota"),
    ).toBe("Tuesday, October 27, 2026 at 7:00:00 AM GMT-5");
  }),
);

it.effect("shows recurrence removal when the retained Series is deleted", () =>
  Effect.sync(() => {
    const series = {
      id: "series-1",
      profile_id: "work",
      entity_version: 1,
      row_version: 1,
      recurrence: {
        dtstart: { kind: "date", date: "2026-10-28" },
        rrule: "FREQ=DAILY",
        exdate: [],
      },
      task,
      created_at: eventFields.occurred_at,
      updated_at: eventFields.occurred_at,
      deleted_at: null,
    };
    const value = Schema.decodeUnknownSync(TaskEdited)({
      ...edit,
      before: task,
      after: task,
      series_before: series,
      series_after: {
        ...series,
        row_version: 2,
        deleted_at: eventFields.occurred_at,
      },
    });
    expect(editedChanges(value)).toEqual([
      {
        field: "Recurrence",
        before: "FREQ=DAILY; starts Oct 28, 2026",
        after: "None",
      },
    ]);
  }),
);

it.effect(
  "distinguishes absent values, empty text and literal placeholder names",
  () =>
    Effect.sync(() => {
      const project = {
        id: "project-1",
        profile_id: "work",
        name: "None",
        created_at: eventFields.occurred_at,
        updated_at: eventFields.occurred_at,
      };
      const value = Schema.decodeUnknownSync(TaskEdited)({
        ...edit,
        before: task,
        after: {
          ...task,
          description: "None",
          project_id: "project-1",
          tags: ["tag-1"],
        },
        project_after: project,
        tags_after: [{ id: "tag-1", profile_id: "work", name: "None" }],
      });
      expect(editedChanges(value)).toEqual([
        { field: "Description", before: "None", after: '"None"' },
        { field: "Project", before: "None", after: '"None"' },
        { field: "Tags", before: "None", after: '"None"' },
      ]);
      expect(
        editedChanges({
          ...edit,
          before: { ...task, description: "" },
          after: { ...task, description: "None" },
        }),
      ).toEqual([{ field: "Description", before: '""', after: '"None"' }]);
      expect(
        editedChanges({
          ...edit,
          before: task,
          after: { ...task, description: "" },
        }),
      ).toEqual([{ field: "Description", before: "None", after: '""' }]);
    }),
);

it("Attachment History offers Revert until its inverse is committed", () => {
  const after = Schema.decodeUnknownSync(Task)({
    ...task,
    row_version: 2,
    attachments: [
      {
        id: "attachment-1",
        kind: "file",
        path: "/tmp/jira.md",
        label: "jira",
        added_at: "2026-10-27T12:00:00Z",
      },
    ],
  });
  const added = entry(50, { kind: "AttachmentAdded", before: task, after });
  const removed = entry(51, {
    kind: "AttachmentRemoved",
    before: after,
    after: task,
  });
  expect(historyLabel(added)).toBe("Attachment added");
  expect(historyLabel(removed)).toBe("Attachment removed");
  expect(canRevertHistory(added, new Set())).toBe(true);
  expect(canRevertHistory(removed, new Set())).toBe(true);
  expect(canRevertHistory(removed, new Set([removed.seq]))).toBe(false);
});
