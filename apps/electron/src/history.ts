import type {
  OpLogEntry,
  Recurrence,
  Sequence,
  TaskEdited,
  TaskTime,
} from "@todo/domain";

const labels = {
  AttachmentAdded: "Attachment added",
  AttachmentRemoved: "Attachment removed",
  TaskCreated: "Created",
  TaskEdited: "Edited",
  TaskCompleted: "Completed",
  TaskCancelled: "Cancelled",
  TaskReopened: "Reopened",
  TaskMovedIn: "Moved",
  TaskMovedOut: "Moved",
  TaskDeleted: "Deleted",
  TaskPurged: "Purged",
  TaskReverted: "Reverted",
  ReminderFired: "Reminder",
  ProfileDeleted: "Profile deleted",
  ProfileDeletionRejected: "Profile deletion refused",
  AuthChanged: "Access changed",
  DatabaseRestored: "Snapshot restored",
  AuthAttemptRejected: "Access attempt",
} satisfies Record<
  Exclude<
    OpLogEntry["event"]["kind"],
    "TaskHistoryRedacted" | "TaskAttemptRejected"
  >,
  string
>;

export function historyLabel(entry: OpLogEntry): string {
  const event = entry.event;
  switch (event.kind) {
    case "TaskAttemptRejected":
      return labels[event.attempted_kind];
    case "TaskHistoryRedacted":
      if (event.attempted_kind !== null) return labels[event.attempted_kind];
      return event.original_kind === "TaskAttemptRejected"
        ? "Change attempted"
        : labels[event.original_kind];
    case "TaskCreated":
      return event.copied_from
        ? `Copied from ${event.copied_from.profile_name} / ${event.copied_from.source_task_id}`
        : "Created";
    case "TaskMovedIn":
    case "TaskMovedOut":
      return event.original_seq === null ? "Moved" : "Reverted";
    default:
      return labels[event.kind];
  }
}

export function revertedSequences(
  entries: readonly OpLogEntry[],
): ReadonlySet<Sequence> {
  const reverted = new Set<Sequence>();
  for (const entry of entries) {
    if (entry.outcome !== "committed") continue;
    const event = entry.event;
    if (event.kind === "TaskReverted") reverted.add(event.original_seq);
    if (
      (event.kind === "TaskMovedIn" || event.kind === "TaskMovedOut") &&
      event.original_seq !== null
    )
      reverted.add(event.original_seq);
  }
  return reverted;
}

export function canRevertHistory(
  entry: OpLogEntry,
  reverted: ReadonlySet<Sequence>,
): boolean {
  return (
    entry.outcome === "committed" &&
    !reverted.has(entry.seq) &&
    [
      "AttachmentAdded",
      "AttachmentRemoved",
      "TaskEdited",
      "TaskCompleted",
      "TaskCancelled",
      "TaskReopened",
      "TaskMovedIn",
      "TaskDeleted",
      "TaskReverted",
    ].includes(entry.event.kind)
  );
}

export function rejectionReason(reason: string | null): string {
  switch (reason) {
    case "conflict":
      return "The task changed before this attempt was saved.";
    case "validation":
      return "Some values were not valid for this change.";
    case "auth":
      return "This attempt did not have permission to change the task.";
    case "profile_mismatch":
      return "The task belongs to another Profile.";
    case "task_purged":
      return "The task's content was erased by Purge.";
    case "invalid_revert":
      return "This change cannot be reverted.";
    case "not_found":
      return "The task was no longer available.";
    default:
      return "This attempt could not be saved.";
  }
}

export function localHistoryTime(
  instant: string,
  locale?: string,
  timeZone?: string,
): string {
  return new Date(instant).toLocaleString(locale, {
    dateStyle: "full",
    timeStyle: "long",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function relativeHistoryTime(
  instant: string,
  now = Date.now(),
  locale?: string,
): string {
  const seconds = (new Date(instant).getTime() - now) / 1000;
  if (Math.abs(seconds) < 60) return "Just now";
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  for (const [unit, size] of [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ] as const) {
    if (Math.abs(seconds) >= size)
      return format.format(Math.trunc(seconds / size), unit);
  }
  return "Just now";
}

function timeValue(value: TaskTime | null): string {
  if (value === null) return "None";
  if (value.kind === "instant")
    return `${new Date(value.utc).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "long",
    })} · ${value.time_zone}`;
  return new Date(`${value.date}T12:00:00Z`).toLocaleDateString(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

export type HistoryChange = { field: string; before: string; after: string };
export function editedChanges(event: TaskEdited): HistoryChange[] {
  const changes: HistoryChange[] = [];
  const add = (field: string, before: string, after: string) => {
    if (before !== after) changes.push({ field, before, after });
  };
  const before = event.before;
  const after = event.after;
  add("Title", before.title, after.title);
  const textValue = (value: string | null) =>
    value === null ? "None" : `"${value}"`;
  if (before.description !== after.description)
    changes.push({
      field: "Description",
      before: textValue(before.description),
      after: textValue(after.description),
    });
  add("Priority", before.priority, after.priority);
  add("Source", before.source, after.source);
  if (before.project_id !== after.project_id)
    changes.push({
      field: "Project",
      before: textValue(event.project_before?.name ?? null),
      after: textValue(event.project_after?.name ?? null),
    });
  if (
    JSON.stringify([...before.tags].sort()) !==
    JSON.stringify([...after.tags].sort())
  ) {
    const tagValue = (tags: TaskEdited["tags_before"]) =>
      tags.length === 0
        ? "None"
        : tags
            .map((tag) => textValue(tag.name))
            .sort()
            .join(", ");
    changes.push({
      field: "Tags",
      before: tagValue(event.tags_before),
      after: tagValue(event.tags_after),
    });
  }
  for (const [field, oldTime, newTime] of [
    ["Due", before.due_at, after.due_at],
    ["Scheduled", before.scheduled_at, after.scheduled_at],
  ] as const) {
    if (JSON.stringify(oldTime) !== JSON.stringify(newTime))
      changes.push({
        field,
        before: timeValue(oldTime),
        after: timeValue(newTime),
      });
  }
  add(
    "Energy",
    before.energy?.toString() ?? "None",
    after.energy?.toString() ?? "None",
  );
  add(
    "Estimate",
    before.estimate_min === null ? "None" : `${before.estimate_min} min`,
    after.estimate_min === null ? "None" : `${after.estimate_min} min`,
  );
  const beforeRecurrence =
    event.series_before?.deleted_at === null
      ? event.series_before.recurrence
      : null;
  const afterRecurrence =
    event.series_after?.deleted_at === null
      ? event.series_after.recurrence
      : null;
  const recurrenceValue = (recurrence: Recurrence | null) =>
    recurrence === null
      ? "None"
      : `${recurrence.rrule}; starts ${timeValue(recurrence.dtstart)}${recurrence.exdate.length ? `; excludes ${recurrence.exdate.map(timeValue).join(", ")}` : ""}`;
  if (JSON.stringify(beforeRecurrence) !== JSON.stringify(afterRecurrence))
    changes.push({
      field: "Recurrence",
      before: recurrenceValue(beforeRecurrence),
      after: recurrenceValue(afterRecurrence),
    });
  return changes;
}
