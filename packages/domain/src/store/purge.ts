import type { Database } from "bun:sqlite";
import { Schema } from "effect";
import type { Task, TaskDetails } from "../entities.ts";
import { Event, type OpLogEntry, TaskHistoryRedacted } from "../events.ts";
import { type SeriesId, TaskId } from "../ids.ts";
import { changes, metadata, Snapshot } from "./projection.ts";

const resolved = (entry: OpLogEntry) =>
  entry.event.kind === "TaskHistoryRedacted"
    ? entry.event.replay
    : Schema.is(Event)(entry.event)
      ? {
          ...changes(entry.event),
          ...metadata(entry.event),
          versions: [],
          series_versions: [],
        }
      : {
          tasks: [],
          series: [],
          projects: [],
          tags: [],
          versions: [],
          series_versions: [],
        };

const taskReference = Schema.Struct({ id: TaskId });
const references = (value: unknown, id: TaskId): boolean =>
  Array.isArray(value)
    ? value.some((value) => references(value, id))
    : Schema.is(taskReference)(value) && value.id === id;
const mentions = (value: unknown, id: TaskId): boolean => {
  if (Array.isArray(value)) return value.some((value) => mentions(value, id));
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, value]) =>
      (key === "task_id" && value === id) ||
      (["task", "before", "after", "next_occurrences"].includes(key) &&
        references(value, id)) ||
      mentions(value, id),
  );
};

export function redactTaskHistory(
  db: Database,
  history: readonly OpLogEntry[],
  id: TaskId,
) {
  const snapshots = db
    .query<{ seq: number; payload: string }, []>(
      "SELECT seq,payload FROM snapshots",
    )
    .all()
    .map((row) => ({
      ...row,
      value: Schema.decodeUnknownSync(Snapshot)(JSON.parse(row.payload)),
    }));
  const facts = history.map(resolved);
  const tasks = [
    ...facts.flatMap((value) =>
      value.tasks.flatMap(({ before, after }) =>
        [before, after].filter((task): task is Task => task !== null),
      ),
    ),
    ...snapshots.flatMap(({ value }) => value.tasks),
  ];
  const series = [
    ...facts.flatMap((value) =>
      value.series.flatMap(({ before, after }) =>
        [before, after].filter((value) => value !== null),
      ),
    ),
    ...snapshots.flatMap(({ value }) => value.series),
  ];
  const targetTasks = tasks.filter((task) => task.id === id);
  const targetSeries = new Set([
    `legacy-series:${id}`,
    ...targetTasks.flatMap((task) =>
      task.occurrence ? [task.occurrence.series_id] : [],
    ),
    ...facts.flatMap((value) =>
      value.tasks.some(
        ({ before, after }) => before?.id === id || after?.id === id,
      )
        ? value.series.flatMap(({ before, after }) =>
            [before?.id, after?.id].filter((id) => id !== undefined),
          )
        : [],
    ),
  ]);
  const retainedTasks = tasks.filter((task) => task.id !== id);
  const removedSeries = new Set(
    [...targetSeries].filter(
      (id) =>
        !retainedTasks.some(
          (task) =>
            task.occurrence?.series_id === id ||
            `legacy-series:${task.id}` === id,
        ),
    ),
  );
  const retainedDetails: readonly TaskDetails[] = [
    ...retainedTasks,
    ...series
      .filter((value) => !removedSeries.has(value.id))
      .map((value) => value.task),
  ];
  const targetDetails: readonly TaskDetails[] = [
    ...targetTasks,
    ...series
      .filter((value) => removedSeries.has(value.id))
      .map((value) => value.task),
  ];
  const removedProjects = new Set(
    targetDetails.flatMap((value) =>
      value.project_id === null ||
      retainedDetails.some((other) => other.project_id === value.project_id)
        ? []
        : [value.project_id],
    ),
  );
  const removedTags = new Set(
    targetDetails.flatMap((value) =>
      value.tags.filter(
        (id) => !retainedDetails.some((other) => other.tags.includes(id)),
      ),
    ),
  );
  const keepTask = (change: ReturnType<typeof changes>["tasks"][number]) =>
    (change.after ?? change.before)?.id !== id;
  const keepSeries = (change: ReturnType<typeof changes>["series"][number]) =>
    !removedSeries.has((change.after ?? change.before)?.id ?? "");

  db.exec("DROP TRIGGER op_log_no_update; DROP TRIGGER snapshots_no_update;");
  for (const entry of history) {
    const event = entry.event;
    const value = resolved(entry);
    const concernsTarget =
      (event.kind === "TaskHistoryRedacted" && event.task_ids.includes(id)) ||
      value.tasks.some(
        ({ before, after }) => before?.id === id || after?.id === id,
      ) ||
      ((event.kind === "TaskAttemptRejected" ||
        event.kind === "ReminderFired") &&
        mentions(event, id));
    if (
      !concernsTarget &&
      !value.series.some((change) => !keepSeries(change)) &&
      !value.projects.some((project) => removedProjects.has(project.id)) &&
      !value.tags.some((tag) => removedTags.has(tag.id))
    )
      continue;
    if (
      event.kind === "AuthChanged" ||
      event.kind === "AuthAttemptRejected" ||
      event.kind === "ProfileDeleted" ||
      event.kind === "ProfileDeletionRejected" ||
      event.kind === "DatabaseRestored"
    )
      continue;
    const versions = new Map<TaskId, number>(
      value.versions.map((version) => [version.id, version.version]),
    );
    for (const task of value.tasks.flatMap(({ before, after }) => [
      before,
      after,
    ]))
      if (task?.id === id)
        versions.set(id, Math.max(versions.get(id) ?? 0, task.row_version));
    const seriesVersions = new Map<SeriesId, number>(
      value.series_versions.map((version) => [version.id, version.version]),
    );
    for (const series of value.series.flatMap(({ before, after }) => [
      before,
      after,
    ]))
      if (series && removedSeries.has(series.id))
        seriesVersions.set(
          series.id,
          Math.max(seriesVersions.get(series.id) ?? 0, series.row_version),
        );
    const redacted = Schema.decodeUnknownSync(TaskHistoryRedacted)({
      kind: "TaskHistoryRedacted",
      entity_version: event.entity_version,
      occurred_at: event.occurred_at,
      original_kind:
        event.kind === "TaskHistoryRedacted" ? event.original_kind : event.kind,
      attempted_kind:
        event.kind === "TaskAttemptRejected" ||
        event.kind === "TaskHistoryRedacted"
          ? event.attempted_kind
          : null,
      task_ids: [
        ...new Set([
          ...(event.kind === "TaskHistoryRedacted" ? event.task_ids : []),
          ...(concernsTarget ? [id] : []),
        ]),
      ],
      replay: {
        tasks: value.tasks.filter(keepTask),
        series: value.series.filter(keepSeries),
        projects: value.projects.filter(
          (value) => !removedProjects.has(value.id),
        ),
        tags: value.tags.filter((value) => !removedTags.has(value.id)),
        versions: [...versions].map(([id, version]) => ({ id, version })),
        series_versions: [...seriesVersions].map(([id, version]) => ({
          id,
          version,
        })),
      },
    });
    db.query("UPDATE op_log SET event=? WHERE seq=?").run(
      JSON.stringify(redacted),
      entry.seq,
    );
  }
  for (const { seq, value } of snapshots)
    db.query("UPDATE snapshots SET payload=? WHERE seq=?").run(
      JSON.stringify({
        ...value,
        tasks: value.tasks.filter((task) => task.id !== id),
        series: value.series.filter((value) => !removedSeries.has(value.id)),
        projects: value.projects.filter(
          (value) => !removedProjects.has(value.id),
        ),
        tags: value.tags.filter((value) => !removedTags.has(value.id)),
      }),
      seq,
    );
  db.query("DELETE FROM tasks WHERE id=?").run(id);
  for (const id of removedSeries)
    db.query("DELETE FROM series WHERE id=?").run(id);
  for (const id of removedProjects)
    db.query("DELETE FROM projects WHERE id=?").run(id);
  for (const id of removedTags) db.query("DELETE FROM tags WHERE id=?").run(id);
  db.exec(`CREATE TRIGGER op_log_no_update BEFORE UPDATE ON op_log
    BEGIN SELECT RAISE(ABORT, 'op_log is append-only'); END;
    CREATE TRIGGER snapshots_no_update BEFORE UPDATE ON snapshots
    BEGIN SELECT RAISE(ABORT, 'snapshots are immutable'); END;`);
}
