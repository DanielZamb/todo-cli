import { Clock, Effect, Schema } from "effect";
import { copyAttachments, removeWrittenImage } from "./attachment-store.ts";
import { type AccessRequest, AuthError } from "./auth/model.ts";
import { isInboxTask } from "./client-reads.ts";
import {
  Profile,
  Project,
  Recurrence,
  Series,
  seriesForTask,
  Tag,
  Task,
  TaskDetails,
} from "./entities.ts";
import { Event, type OpLogEntry, type TaskMutationKind } from "./events.ts";
import { type ActorId, OccurrenceId, ProfileId, TaskId } from "./ids.ts";
import {
  type ExternalIdConflictDetails,
  type TaskView,
  taskView,
} from "./presentation.ts";
import type { QuickAddDraft } from "./quick-add.ts";
import {
  occurrenceCursor,
  occurrenceDate,
  rebaseTaskDetails,
  resolveNextTime,
  resolveOccurrence,
} from "./recurrence.ts";
import { StoreError } from "./store/error.ts";
import { changes as eventChanges } from "./store/projection.ts";
import type { OperationStore } from "./store/store.ts";
import {
  type CreateSeries,
  CreateTask,
  type EditSeries,
  type EditTask,
  type ExpectedVersion,
  type MoveTask,
  type RevertTask,
  TaskPatch,
  type TransitionTask,
} from "./task-commands.ts";
import { filterTaskRecords, type TaskFilters } from "./task-filters.ts";
import { CalendarDate, Instant, TaskTime } from "./time.ts";

export class CommandError extends Error {
  readonly _tag = "CommandError";
  constructor(
    readonly exit: number,
    readonly code: string,
    message: string,
    readonly latest?: TaskView,
  ) {
    super(message);
  }
}
const invalid = (message: string) =>
  new CommandError(2, "invalid_args", message);
const parse = <A>(run: () => A) =>
  Effect.try({
    try: run,
    catch: (error) =>
      error instanceof CommandError ? error : invalid(String(error)),
  });
export const nowInstant = () =>
  Schema.decodeUnknownSync(Instant)(new Date().toISOString());
export const profileId = Schema.decodeUnknownSync(ProfileId);
export const taskFlags = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  desc: Schema.optionalKey(Schema.String),
  external_id: Schema.optionalKey(Schema.String),
  project: Schema.optionalKey(Schema.String),
  priority: Schema.optionalKey(Schema.String),
  scheduled: Schema.optionalKey(Schema.String),
  due: Schema.optionalKey(Schema.String),
  recurrence: Schema.optionalKey(Schema.String),
  energy: Schema.optionalKey(Schema.String),
  estimate: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(Schema.String),
  tag: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type TaskFlags = typeof taskFlags.Type;
export function parseTime(input: string): TaskTime | null {
  const value = input.trim();
  if (!value) return null;
  if (Schema.is(CalendarDate)(value))
    return {
      kind: "date",
      date: Schema.decodeUnknownSync(CalendarDate)(value),
    };
  const us = /^(\d{2})\/(\d{2})\/(\d{4})(.*)$/.exec(value);
  const normalized = us ? `${us[3]}-${us[1]}-${us[2]}${us[4]}` : value;
  if (Schema.is(CalendarDate)(normalized))
    return {
      kind: "date",
      date: Schema.decodeUnknownSync(CalendarDate)(normalized),
    };
  const human = /^(\d{4}-\d{2}-\d{2}) (\d{2})(?::(\d{2}))?$/.exec(normalized);
  const rfc = human
    ? `${human[1]}T${human[2]}:${human[3] ?? "00"}:00Z`
    : normalized;
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      rfc,
    ) ||
    !Schema.is(CalendarDate)(rfc.slice(0, 10)) ||
    !Number.isFinite(Date.parse(rfc))
  )
    throw invalid(`invalid datetime format: ${value}`);
  return Schema.decodeUnknownSync(TaskTime)({
    kind: "instant",
    utc: new Date(rfc).toISOString(),
    time_zone: "UTC",
  });
}
const numberValue = (value: string) => {
  if (value === "") return null;
  if (!/^-?\d+$/.test(value)) throw invalid(`invalid integer: ${value}`);
  return Number(value);
};
export const readTasks = Effect.fn(function* (
  store: OperationStore,
  request: AccessRequest,
) {
  const data = yield* store.auth.read(request);
  const tasks = data.tasks
    .filter((t) => t.profile_id === request.profile && t.deleted_at === null)
    .sort(
      (a, b) =>
        a.priority.localeCompare(b.priority) ||
        (a.due_at === null
          ? ""
          : a.due_at.kind === "date"
            ? a.due_at.date
            : a.due_at.utc
        ).localeCompare(
          b.due_at === null
            ? ""
            : b.due_at.kind === "date"
              ? b.due_at.date
              : b.due_at.utc,
        ) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
  return {
    ...data,
    tasks,
    views: tasks.map((task) =>
      taskView(task, data.projects, data.tags, data.series),
    ),
  };
});
export const ensureProfile = Effect.fn(function* (
  store: OperationStore,
  name: string,
) {
  const time = nowInstant();
  const candidate = yield* parse(() =>
    Schema.decodeUnknownSync(Profile)({
      id: name,
      name,
      created_at: time,
      updated_at: time,
    }),
  );
  return yield* store.ensureProfile(candidate);
});

function metadata(
  flags: TaskFlags,
  request: AccessRequest,
  data: Pick<Effect.Success<ReturnType<typeof readTasks>>, "projects" | "tags">,
  before?: Task,
) {
  const now = nowInstant();
  const projectName = flags.project;
  const project =
    projectName === undefined
      ? (data.projects.find(
          (p) =>
            p.profile_id === request.profile && p.id === before?.project_id,
        ) ?? null)
      : projectName === ""
        ? null
        : (data.projects.find(
            (p) => p.profile_id === request.profile && p.name === projectName,
          ) ??
          Schema.decodeUnknownSync(Project)({
            id: crypto.randomUUID(),
            profile_id: request.profile,
            name: projectName,
            created_at: now,
            updated_at: now,
          }));
  const tags =
    flags.tag === undefined
      ? data.tags.filter(
          (t) =>
            t.profile_id === request.profile && before?.tags.includes(t.id),
        )
      : [
          ...new Set(
            flags.tag
              .flatMap((t) => t.split(","))
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean),
          ),
        ]
          .sort()
          .map(
            (name) =>
              data.tags.find(
                (t) => t.profile_id === request.profile && t.name === name,
              ) ??
              Schema.decodeUnknownSync(Tag)({
                id: crypto.randomUUID(),
                profile_id: request.profile,
                name,
              }),
          );
  return { project, tags, now };
}
type Definitions = {
  readonly project: Project | null;
  readonly tags: readonly Tag[];
};
type CommandOptions = {
  readonly definitions?: Definitions;
  readonly recurrence?: Recurrence | null;
};
type Target = AccessRequest & { readonly task_id: TaskId };
export type TaskCommandResult =
  | { readonly outcome: "not-found" }
  | { readonly outcome: "committed"; readonly task: Task }
  | {
      readonly outcome: "rejected";
      readonly reason: string;
      readonly message?: string;
      readonly details?: ExternalIdConflictDetails;
      readonly latest: Task | null;
    };

const taskId = () => Schema.decodeUnknownSync(TaskId)(crypto.randomUUID());
const now = Clock.currentTimeMillis.pipe(
  Effect.map((time) =>
    Schema.decodeUnknownSync(Instant)(new Date(time).toISOString()),
  ),
);

export class TaskCommands {
  constructor(private readonly store: OperationStore) {}

  readonly list = (request: AccessRequest, filters: TaskFilters = {}) =>
    this.store.auth.read(request).pipe(
      Effect.map((view) =>
        filterTaskRecords(
          view.tasks.filter(
            (task) =>
              task.profile_id === request.profile && task.deleted_at === null,
          ),
          filters,
          view,
        ),
      ),
    );

  readonly get = (request: Target) =>
    this.list(request).pipe(
      Effect.map(
        (tasks) =>
          tasks.find(
            (task) =>
              task.profile_id === request.profile &&
              task.id === request.task_id,
          ) ?? null,
      ),
    );

  private result(entry: OpLogEntry, task: Task | null): TaskCommandResult {
    if (entry.outcome === "rejected")
      return { outcome: "rejected", reason: entry.reason, latest: task };
    if (task === null) return { outcome: "not-found" };
    return { outcome: "committed", task };
  }

  definitions(task: Task, profile: ProfileId, proposed?: Definitions) {
    return Effect.gen({ self: this }, function* () {
      const project =
        [
          ...(proposed?.project ? [proposed.project] : []),
          ...(yield* this.store.projects()),
        ].find(
          (project) =>
            project.profile_id === profile && project.id === task.project_id,
        ) ?? null;
      const tags = yield* this.store.tags();
      const resolvedTags = task.tags.flatMap((id) => {
        const tag = [...(proposed?.tags ?? []), ...tags].find(
          (tag) => tag.profile_id === profile && tag.id === id,
        );
        return tag ? [tag] : [];
      });
      return { project, tags: resolvedTags };
    });
  }

  private resolveMetadata(
    task: Task,
    input: EditTask["changes"],
    request: AccessRequest,
    proposed?: Definitions,
  ) {
    return Effect.gen({ self: this }, function* () {
      const data = {
        projects: yield* this.store.projects(),
        tags: yield* this.store.tags(),
      };
      const named = metadata(
        {
          ...(input.project_name === undefined
            ? {}
            : { project: input.project_name }),
          ...(input.tag_names === undefined ? {} : { tag: input.tag_names }),
        },
        request,
        data,
        task,
      );
      const resolved = {
        ...task,
        ...(input.project_name !== undefined && input.project_id == null
          ? { project_id: named.project?.id ?? null }
          : {}),
        ...(input.tag_names === undefined
          ? {}
          : {
              tags: [
                ...new Set([
                  ...(input.tags ?? []),
                  ...named.tags.map((tag) => tag.id),
                ]),
              ],
            }),
      };
      const definitions = yield* this.definitions(resolved, request.profile, {
        project:
          input.project_name !== undefined
            ? named.project
            : (proposed?.project ?? null),
        tags: [...(proposed?.tags ?? []), ...named.tags],
      });
      return { task: resolved, definitions };
    });
  }

  readonly create = (
    request: AccessRequest,
    input: CreateTask,
    options: CommandOptions = {},
  ) =>
    Effect.gen({ self: this }, function* () {
      const time = yield* now;
      return yield* this.store.auth.mutate(request, (identity) =>
        Effect.gen({ self: this }, function* () {
          if (!Schema.is(CreateTask)(input))
            return yield* this.rejectValidation(request, {
              kind: "TaskCreated",
              input,
            });
          const initial = Schema.decodeUnknownSync(Task)({
            description: null,
            project_id: null,
            priority: "P3",
            scheduled_at: null,
            due_at: null,
            energy: null,
            estimate_min: null,
            source: "manual",
            tags: [],
            ...input,
            id: taskId(),
            profile_id: identity.profile,
            entity_version: 1,
            row_version: 1,
            status: "open",
            occurrence: null,
            created_at: time,
            updated_at: time,
            completed_at: null,
            deleted_at: null,
          });
          const { task, definitions } = yield* this.resolveMetadata(
            initial,
            input,
            request,
            options.definitions,
          );
          const entry = options.recurrence
            ? yield* this.store.startSeries({
                ...identity,
                occurred_at: time,
                series: Schema.decodeUnknownSync(Series)({
                  id: crypto.randomUUID(),
                  profile_id: identity.profile,
                  entity_version: 1,
                  row_version: 1,
                  recurrence: options.recurrence,
                  task,
                  created_at: time,
                  updated_at: time,
                  deleted_at: null,
                }),
                ...definitions,
                ...(task.external_id === undefined
                  ? {}
                  : { external_id: task.external_id }),
                task_id: task.id,
                occurrence_id: Schema.decodeUnknownSync(OccurrenceId)(
                  crypto.randomUUID(),
                ),
              })
            : yield* this.store.append({
                ...identity,
                event: {
                  kind: "TaskCreated",
                  entity_version: 1,
                  occurred_at: time,
                  task,
                  series: null,
                  ...definitions,
                },
              });
          return this.result(
            entry,
            entry.outcome === "committed" && entry.event.kind === "TaskCreated"
              ? entry.event.task
              : null,
          );
        }),
      );
    });

  readonly rejectValidation = (
    request: AccessRequest,
    attempt: {
      readonly kind: TaskMutationKind;
      readonly input: unknown;
      readonly task_id?: TaskId;
      readonly from_version?: ExpectedVersion["from_version"];
    },
  ) =>
    Effect.gen({ self: this }, function* () {
      const time = yield* now;
      return yield* this.store.auth.mutate(request, (identity) =>
        this.store
          .reject({
            ...identity,
            reason: "validation",
            ...(attempt.from_version === undefined
              ? {}
              : { from_version: attempt.from_version }),
            event: {
              kind: attempt.kind,
              occurred_at: time,
              input: attempt.input,
              ...(attempt.task_id === undefined
                ? {}
                : { task_id: attempt.task_id }),
            },
          })
          .pipe(Effect.map((entry) => this.result(entry, null))),
      );
    });

  private change(
    request: Target,
    input: ExpectedVersion,
    kind: "TaskEdited" | "TaskReopened" | "TaskDeleted" | "TaskPurged",
    changes: EditTask["changes"],
    options: CommandOptions = {},
    invalidChanges?: TaskFlags,
  ) {
    return Effect.gen({ self: this }, function* () {
      const time = yield* now;
      return yield* this.store.auth.mutate(request, (identity) =>
        Effect.gen({ self: this }, function* () {
          const tasks = yield* this.store.tasks();
          const before = tasks.find(
            (task) =>
              task.id === request.task_id &&
              task.profile_id === identity.profile,
          );
          if (
            !before ||
            (kind !== "TaskPurged" && before.deleted_at !== null)
          ) {
            yield* this.store.reject({
              ...identity,
              reason: "profile_mismatch",
              from_version: input.from_version,
              event: {
                kind,
                occurred_at: time,
                task_id: request.task_id,
              },
            });
            return { outcome: "not-found" } satisfies TaskCommandResult;
          }
          const seriesBefore =
            options.recurrence === undefined
              ? null
              : seriesForTask(before, yield* this.store.series());
          const recurrence = options.recurrence;
          const incompatibleCursor =
            recurrence !== undefined &&
            recurrence !== null &&
            seriesBefore !== null &&
            tasks.some(
              (task) =>
                task.id !== before.id &&
                task.deleted_at === null &&
                seriesForTask(task, [seriesBefore]) !== null &&
                (task.occurrence?.time?.kind ??
                  seriesBefore.recurrence.dtstart.kind) !==
                  recurrence.dtstart.kind,
            );
          const rejection =
            before.row_version !== input.from_version
              ? "conflict"
              : invalidChanges !== undefined || !Schema.is(TaskPatch)(changes)
                ? "validation"
                : incompatibleCursor ||
                    (options.recurrence !== undefined &&
                      before.status !== "open" &&
                      before.status !== "snoozed")
                  ? "validation"
                  : kind === "TaskPurged" && before.deleted_at === null
                    ? "validation"
                    : kind === "TaskReopened" &&
                        before.status !== "done" &&
                        before.status !== "cancelled" &&
                        before.status !== "snoozed"
                      ? "validation"
                      : null;
          if (rejection !== null) {
            const entry = yield* this.store.reject({
              ...identity,
              reason: rejection,
              from_version: input.from_version,
              event: {
                kind,
                occurred_at: time,
                task_id: request.task_id,
                from_version: input.from_version,
                changes: invalidChanges ?? changes,
              },
            });
            return this.result(entry, before);
          }
          let after = Schema.decodeUnknownSync(Task)({
            ...before,
            ...changes,
            row_version: before.row_version + 1,
            updated_at: time,
            ...(kind === "TaskReopened"
              ? { status: "open", completed_at: null }
              : {}),
            ...(kind === "TaskDeleted" ? { deleted_at: time } : {}),
          });
          const resolved = yield* this.resolveMetadata(
            after,
            changes,
            request,
            options.definitions,
          );
          after = resolved.task;
          let seriesAfter: Series | null = null;
          if (options.recurrence !== undefined) {
            if (options.recurrence === null) {
              if (seriesBefore)
                seriesAfter = Schema.decodeUnknownSync(Series)({
                  ...seriesBefore,
                  row_version: seriesBefore.row_version + 1,
                  updated_at: time,
                  deleted_at: time,
                });
              after = { ...after, occurrence: null };
            } else {
              const recurrence = Schema.decodeUnknownSync(Recurrence)(
                options.recurrence,
              );
              const first = resolveNextTime(recurrence, null);
              if (!first) throw new Error("Series has no Occurrence");
              seriesAfter = Schema.decodeUnknownSync(Series)({
                id: seriesBefore?.id ?? crypto.randomUUID(),
                profile_id: before.profile_id,
                entity_version: 1,
                row_version: (seriesBefore?.row_version ?? 0) + 1,
                recurrence,
                task: Schema.decodeUnknownSync(TaskDetails)(after),
                created_at: seriesBefore?.created_at ?? time,
                updated_at: time,
                deleted_at: null,
              });
              const origin = after.occurrence ?? {
                id: Schema.decodeUnknownSync(OccurrenceId)(crypto.randomUUID()),
                series_id: seriesAfter.id,
                date: occurrenceDate(seriesBefore?.recurrence.dtstart ?? first),
                time: seriesBefore?.recurrence.dtstart ?? first,
              };
              const { time: previousTime, ...dateOrigin } = origin;
              const cursor =
                previousTime?.kind === recurrence.dtstart.kind
                  ? previousTime
                  : occurrenceCursor(seriesAfter, dateOrigin);
              seriesAfter = {
                ...seriesAfter,
                task: rebaseTaskDetails(
                  Schema.decodeUnknownSync(TaskDetails)(after),
                  cursor,
                  recurrence.dtstart,
                ),
              };
              const occurrence = resolveOccurrence({
                series: seriesAfter,
                time: cursor,
                task_id: after.id,
                occurrence_id: origin.id,
                occurred_at: time,
              });
              after = {
                ...after,
                occurrence: occurrence.occurrence,
                scheduled_at: after.scheduled_at ?? occurrence.scheduled_at,
              };
            }
          }
          const beforeDefinitions = yield* this.definitions(
            before,
            identity.profile,
          );
          const afterDefinitions = resolved.definitions;
          const entry = yield* this.store.append({
            ...identity,
            event:
              kind === "TaskPurged"
                ? {
                    kind,
                    entity_version: 1,
                    occurred_at: time,
                    task_id: before.id,
                    before,
                  }
                : {
                    kind,
                    entity_version: 1,
                    occurred_at: time,
                    before,
                    after,
                    ...(kind === "TaskEdited"
                      ? {
                          series_before: seriesBefore,
                          series_after: seriesAfter,
                          project_before: beforeDefinitions.project,
                          project_after: afterDefinitions.project,
                          tags_before: beforeDefinitions.tags,
                          tags_after: afterDefinitions.tags,
                        }
                      : {}),
                  },
          });
          return this.result(
            entry,
            entry.outcome === "committed" ? after : before,
          );
        }),
      );
    });
  }

  readonly edit = (
    request: Target,
    input: EditTask,
    options: CommandOptions = {},
  ) => this.change(request, input, "TaskEdited", input.changes, options);
  readonly rejectEdit = (
    request: Target,
    input: ExpectedVersion & { readonly changes: TaskFlags },
  ) => this.change(request, input, "TaskEdited", {}, {}, input.changes);
  readonly purge = (request: Target, input: ExpectedVersion) =>
    this.change(request, input, "TaskPurged", {});
  readonly delete = (request: Target, input: ExpectedVersion) =>
    this.change(request, input, "TaskDeleted", {});
  readonly transition = (request: Target, input: TransitionTask) => {
    if (input.action === "reopen")
      return this.change(request, input, "TaskReopened", {});
    const action = input.action;
    return Effect.gen({ self: this }, function* () {
      const time = yield* now;
      return yield* this.store.auth.mutate(request, (identity) =>
        Effect.gen({ self: this }, function* () {
          const before = (yield* this.store.tasks()).find(
            (task) =>
              task.id === request.task_id &&
              task.profile_id === identity.profile,
          );
          if (!before || before.deleted_at !== null) {
            yield* this.store.reject({
              ...identity,
              reason: "profile_mismatch",
              from_version: input.from_version,
              event: {
                kind: action === "complete" ? "TaskCompleted" : "TaskCancelled",
                occurred_at: time,
                task_id: request.task_id,
              },
            });
            return { outcome: "not-found" } satisfies TaskCommandResult;
          }
          const entry = yield* this.store.finishTask({
            ...identity,
            task_id: request.task_id,
            from_version: input.from_version,
            action,
            occurred_at: time,
            next_task_id: taskId(),
            next_occurrence_id: Schema.decodeUnknownSync(OccurrenceId)(
              crypto.randomUUID(),
            ),
          });
          const latest =
            (yield* this.store.tasks()).find(
              (task) =>
                task.profile_id === identity.profile &&
                task.id === request.task_id,
            ) ?? null;
          return this.result(entry, latest);
        }),
      );
    });
  };
}

const prepareFlags = (
  flags: TaskFlags,
  request: AccessRequest,
  data: Effect.Success<ReturnType<typeof readTasks>>,
  before?: Task,
) =>
  parse(() => {
    const { project, tags } = metadata(flags, request, data, before);
    const fields = Schema.decodeUnknownSync(TaskPatch)({
      ...(flags.title === undefined ? {} : { title: flags.title.trim() }),
      ...(flags.external_id === undefined
        ? {}
        : { external_id: flags.external_id || null }),
      ...(flags.desc === undefined ? {} : { description: flags.desc || null }),
      project_id: project?.id ?? null,
      tags: tags.map((tag) => tag.id),
      ...(flags.priority === undefined ? {} : { priority: flags.priority }),
      ...(flags.source === undefined ? {} : { source: flags.source }),
      ...(flags.due === undefined ? {} : { due_at: parseTime(flags.due) }),
      ...(flags.scheduled === undefined
        ? {}
        : { scheduled_at: parseTime(flags.scheduled) }),
      ...(flags.energy === undefined
        ? {}
        : { energy: numberValue(flags.energy) }),
      ...(flags.estimate === undefined
        ? {}
        : { estimate_min: numberValue(flags.estimate) }),
    });
    const recurrence =
      flags.recurrence === undefined
        ? undefined
        : flags.recurrence === ""
          ? null
          : Schema.decodeUnknownSync(Recurrence)(JSON.parse(flags.recurrence));
    if (before && recurrence && !resolveNextTime(recurrence, null))
      throw invalid("Series has no Occurrence");
    const options: CommandOptions = {
      definitions: { project, tags },
      ...(recurrence === undefined ? {} : { recurrence }),
    };
    return { fields, options };
  });
const cliResult = (
  result: TaskCommandResult,
  data: Effect.Success<ReturnType<typeof readTasks>>,
) => {
  if (result.outcome === "not-found")
    return Effect.fail(new CommandError(3, "not_found", "task not found"));
  if (result.outcome === "rejected")
    return Effect.fail(
      new CommandError(
        result.reason === "conflict" ? 4 : 2,
        result.reason === "conflict" ? "occ_conflict" : "update_failed",
        result.reason === "conflict"
          ? result.latest
            ? `stale Version; retry with --expected-version ${result.latest.row_version}`
            : "stale Version; read the Task and pass --expected-version"
          : result.reason,
        result.latest
          ? taskView(result.latest, data.projects, data.tags, data.series)
          : undefined,
      ),
    );
  return Effect.succeed(result);
};
export const createTask = Effect.fn(function* (
  store: OperationStore,
  request: AccessRequest,
  input: TaskFlags,
  draft?: QuickAddDraft,
) {
  const data = yield* readTasks(store, request);
  const commands = new TaskCommands(store);
  const prepared = yield* Effect.gen(function* () {
    const flags = yield* parse(() =>
      Schema.decodeUnknownSync(taskFlags)(input),
    );
    const prepared = yield* prepareFlags(
      {
        ...(draft?.project ? { project: draft.project } : {}),
        ...(draft ? { priority: draft.priority } : {}),
        ...flags,
        ...(draft ? { tag: [...draft.tags, ...(flags.tag ?? [])] } : {}),
      },
      request,
      data,
    );
    const inputTask = yield* parse(() =>
      Schema.decodeUnknownSync(CreateTask)({
        ...(draft
          ? { due_at: draft.due_at, scheduled_at: draft.scheduled_at }
          : {}),
        ...prepared.fields,
      }),
    );
    return { inputTask, options: prepared.options };
  }).pipe(
    Effect.tapError(() =>
      commands.rejectValidation(request, { kind: "TaskCreated", input }),
    ),
  );
  return yield* cliResult(
    yield* commands.create(request, prepared.inputTask, prepared.options),
    data,
  );
});
export type Mutation = "edit" | "done" | "cancel" | "reopen" | "rm";
export const mutateTask = Effect.fn(function* (
  store: OperationStore,
  request: AccessRequest,
  command: Mutation,
  id: string,
  expected: number,
  flags: TaskFlags = {},
  force = false,
) {
  const data = yield* readTasks(store, request);
  if (!Number.isSafeInteger(expected) || expected < 1)
    return yield* Effect.gen(function* () {
      const task = (yield* store.auth.read(request)).tasks.find(
        (task) => task.profile_id === request.profile && task.id === id,
      );
      return yield* Effect.fail(
        new CommandError(
          2,
          "invalid_args",
          task
            ? `--expected-version is required; pass --expected-version ${task.row_version}`
            : "--expected-version is required and must be > 0; read the Task's current Version",
          task
            ? taskView(task, data.projects, data.tags, data.series)
            : undefined,
        ),
      );
    });
  const target = { ...request, task_id: Schema.decodeUnknownSync(TaskId)(id) };
  const version = {
    from_version: Schema.decodeUnknownSync(Task.fields.row_version)(expected),
  };
  const commands = new TaskCommands(store);
  if (command === "edit") {
    const before = data.tasks.find(
      (task) => task.profile_id === request.profile && task.id === id,
    );
    if (!before)
      return yield* cliResult(
        yield* commands.edit(target, { ...version, changes: {} }),
        data,
      );
    const prepared = yield* prepareFlags(flags, request, data, before).pipe(
      Effect.tapError(() =>
        commands
          .rejectEdit(target, { ...version, changes: flags })
          .pipe(
            Effect.flatMap((result) =>
              result.outcome === "rejected" && result.reason === "validation"
                ? Effect.void
                : cliResult(result, data),
            ),
          ),
      ),
    );
    return yield* cliResult(
      yield* commands.edit(
        target,
        { ...version, changes: prepared.fields },
        prepared.options,
      ),
      data,
    );
  }
  if (command === "rm")
    return yield* cliResult(
      yield* force
        ? commands.purge(target, version)
        : commands.delete(target, version),
      data,
    );
  return yield* cliResult(
    yield* commands.transition(target, {
      ...version,
      action: command === "done" ? "complete" : command,
    }),
    data,
  );
});
export type Filters = {
  readonly status?: string;
  readonly project?: string;
  readonly tag?: string;
  readonly priority?: string;
  readonly today?: boolean;
  readonly overdue?: boolean;
  readonly inbox?: boolean;
};
export function filterTasks(
  tasks: readonly TaskView[],
  filters: Filters,
  now: string,
) {
  const today = now.slice(0, 10);
  return tasks.filter(
    (t) =>
      (!filters.status || t.status === filters.status) &&
      (!filters.project || t.project === filters.project) &&
      (!filters.tag || t.tags?.includes(filters.tag.trim().toLowerCase())) &&
      (!filters.priority || t.priority === filters.priority) &&
      (!filters.today ||
        t.due_at?.slice(0, 10) === today ||
        t.scheduled_at?.slice(0, 10) === today) &&
      (!filters.overdue ||
        Boolean(
          t.status === "open" && t.due_at && t.due_at.slice(0, 10) < today,
        )) &&
      (!filters.inbox || isInboxTask(t)),
  );
}
export function exportScope(
  tasks: readonly TaskView[],
  scope: string,
  now: string,
) {
  if (scope === "all") return tasks;
  if (scope === "today") return filterTasks(tasks, { today: true }, now);
  if (scope === "weekly")
    return tasks.filter(
      (t) => t.due_at && Date.parse(t.due_at) < Date.parse(now) + 7 * 86400000,
    );
  if (scope.startsWith("project:"))
    return filterTasks(tasks, { project: scope.slice(8) }, now);
  if (scope.startsWith("id:") && scope.slice(3)) {
    const task = tasks.find((t) => t.id === scope.slice(3));
    if (!task) throw new CommandError(3, "not_found", "task not found");
    return [task];
  }
  throw invalid("invalid export scope");
}
export const authFailure = (error: unknown) =>
  error instanceof AuthError
    ? new CommandError(3, "auth_required", "invalid or expired session")
    : error;

type ClientWriteContext = {
  readonly before: Task;
  readonly time: Instant;
  readonly identity: { readonly actor: ActorId; readonly profile: ProfileId };
};

const clientWrite = (
  store: OperationStore,
  request: Target,
  input: ExpectedVersion,
  kind: TaskMutationKind,
  run: (
    context: ClientWriteContext,
  ) => Effect.Effect<TaskCommandResult, StoreError | AuthError>,
) =>
  Effect.gen(function* () {
    const time = yield* now;
    return yield* store.auth.mutate(request, (identity) =>
      Effect.gen(function* () {
        const before = (yield* store.tasks()).find(
          (task) =>
            task.id === request.task_id && task.profile_id === identity.profile,
        );
        const reason = !before
          ? "profile_mismatch"
          : before.row_version !== input.from_version
            ? "conflict"
            : null;
        if (reason) {
          yield* store.reject({
            ...identity,
            from_version: input.from_version,
            reason,
            event: { kind, occurred_at: time, task_id: request.task_id },
          });
          return before
            ? ({
                outcome: "rejected",
                reason,
                latest: before,
              } satisfies TaskCommandResult)
            : ({ outcome: "not-found" } satisfies TaskCommandResult);
        }
        if (!before)
          return { outcome: "not-found" } satisfies TaskCommandResult;
        return yield* run({ before, time, identity });
      }),
    );
  });

const rejectClientWrite = (
  store: OperationStore,
  context: ClientWriteContext,
  kind: TaskMutationKind,
  reason = "validation",
  message?: string,
): Effect.Effect<TaskCommandResult, StoreError> =>
  store
    .reject({
      ...context.identity,
      reason,
      from_version: context.before.row_version,
      event: {
        kind,
        occurred_at: context.time,
        task_id: context.before.id,
        ...(message === undefined ? {} : { message }),
      },
    })
    .pipe(
      Effect.as({
        outcome: "rejected",
        reason,
        latest: context.before,
        ...(message === undefined ? {} : { message }),
      }),
    );

const transferMetadata = Effect.fn(function* (
  store: OperationStore,
  task: Task,
  destination: ProfileId,
  request: AccessRequest,
) {
  const data = yield* store.auth.read(request);
  const target = yield* store.auth.read({ ...request, profile: destination });
  const project = data.projects.find((p) => p.id === task.project_id);
  return metadata(
    {
      project: project?.name ?? "",
      tag: task.tags.flatMap((id) =>
        data.tags.filter((tag) => tag.id === id).map((tag) => tag.name),
      ),
    },
    { ...request, profile: destination },
    target,
  );
});

export const moveTask = (
  store: OperationStore,
  request: Target,
  input: MoveTask,
) =>
  Effect.gen(function* () {
    yield* store.auth.authenticate({ ...request, access: "write" });
    yield* store.auth.authenticate({
      credential: request.credential,
      profile: input.destination_profile,
      access: "write",
    });
    return yield* clientWrite(
      store,
      request,
      input,
      "TaskMovedOut",
      (context) =>
        Effect.gen(function* () {
          const definition = seriesForTask(
            context.before,
            yield* store.series(),
          );
          const definitions = yield* transferMetadata(
            store,
            context.before,
            input.destination_profile,
            request,
          );
          const after = Schema.decodeUnknownSync(Task)({
            ...context.before,
            profile_id: input.destination_profile,
            project_id: definitions.project?.id ?? null,
            tags: definitions.tags.map((tag) => tag.id),
            occurrence: null,
            ...(definition?.id === `legacy-series:${context.before.id}`
              ? { legacy_series_detached: true }
              : {}),
            row_version: context.before.row_version + 1,
            updated_at: context.time,
          });
          const entry = yield* store.move({
            actor: context.identity.actor,
            before: context.before,
            after,
            original_seq: null,
            definitions,
          });
          if (entry.outcome === "committed")
            return {
              outcome: "committed",
              task: after,
            } satisfies TaskCommandResult;
          const destination = (yield* store.profiles()).find(
            (profile) => profile.id === input.destination_profile,
          );
          const name = destination?.name ?? input.destination_profile;
          const displayName = name.charAt(0).toUpperCase() + name.slice(1);
          return {
            outcome: "rejected",
            reason: entry.reason,
            latest: context.before,
            ...(entry.reason === "external_id_conflict" &&
            context.before.external_id != null
              ? {
                  message: `${JSON.stringify(displayName)} already has a Task with external id ${JSON.stringify(context.before.external_id)}. Choose another Profile.`,
                  details: {
                    external_id: context.before.external_id,
                    profile_id: input.destination_profile,
                  },
                }
              : {}),
          } satisfies TaskCommandResult;
        }),
    );
  });

export const copyTask = (
  store: OperationStore,
  request: Target,
  input: MoveTask,
) =>
  Effect.gen(function* () {
    const files: string[] = [];
    const fileIO = <A>(work: () => A) =>
      Effect.try({ try: work, catch: (cause) => new StoreError(cause) });
    const cleanup = () =>
      fileIO(() => {
        for (const path of files)
          removeWrittenImage(store.attachmentRoot, path);
      });
    yield* store.auth.authenticate({ ...request, access: "write" });
    yield* store.auth.authenticate({
      credential: request.credential,
      profile: input.destination_profile,
      access: "write",
    });
    return yield* clientWrite(store, request, input, "TaskCreated", (context) =>
      Effect.gen(function* () {
        if (input.destination_profile === context.before.profile_id)
          return yield* rejectClientWrite(
            store,
            context,
            "TaskCreated",
            "validation",
            "Copy needs a different Profile.",
          );
        if (
          context.before.deleted_at !== null ||
          !(yield* store.profiles()).some(
            (profile) => profile.id === input.destination_profile,
          )
        )
          return yield* rejectClientWrite(store, context, "TaskCreated");
        const definitions = yield* transferMetadata(
          store,
          context.before,
          input.destination_profile,
          request,
        );
        const source = (yield* store.profiles()).find(
          (p) => p.id === context.before.profile_id,
        );
        const id = taskId();
        const attachments = yield* fileIO(() =>
          copyAttachments(
            store.attachmentRoot,
            context.before,
            { id, profile_id: input.destination_profile },
            files,
            !store.isPreview,
          ),
        );
        const task = Schema.decodeUnknownSync(Task)({
          ...context.before,
          id,
          ...(attachments === undefined ? {} : { attachments }),
          external_id: null,
          profile_id: input.destination_profile,
          project_id: definitions.project?.id ?? null,
          tags: definitions.tags.map((tag) => tag.id),
          occurrence: null,
          legacy_series_detached: true,
          row_version: 1,
          updated_at: context.time,
        });
        const entry = yield* store.auth.append({
          credential: request.credential,
          profile: input.destination_profile,
          event: {
            kind: "TaskCreated",
            entity_version: 1,
            occurred_at: context.time,
            task,
            series: null,
            ...definitions,
            copied_from: {
              profile_id: context.before.profile_id,
              profile_name: source?.name ?? context.before.profile_id,
              source_task_id: context.before.id,
            },
          },
        });
        return entry.outcome === "committed"
          ? { outcome: "committed", task }
          : {
              outcome: "rejected",
              reason: entry.reason,
              latest: context.before,
            };
      }),
    ).pipe(
      Effect.onError(() => Effect.orDie(cleanup())),
      Effect.tap((result) =>
        result.outcome === "committed" ? Effect.void : cleanup(),
      ),
    );
  });

export const createSeries = (
  store: OperationStore,
  request: AccessRequest,
  input: CreateSeries,
) =>
  new TaskCommands(store).create(request, input.task, {
    recurrence: input.recurrence,
  });

export const editSeries = (
  store: OperationStore,
  request: Target,
  input: EditSeries,
) =>
  clientWrite(store, request, input, "TaskEdited", (context) =>
    Effect.gen(function* () {
      const definition = seriesForTask(context.before, yield* store.series());
      const valid = yield* Effect.try(() =>
        resolveNextTime(input.recurrence, null),
      ).pipe(
        Effect.map((value) => value !== null),
        Effect.catch(() => Effect.succeed(false)),
      );
      if (
        !valid ||
        definition === null ||
        definition.deleted_at !== null ||
        context.before.deleted_at !== null
      )
        return yield* rejectClientWrite(store, context, "TaskEdited");
      return yield* new TaskCommands(store).edit(request, input, {
        recurrence: input.recurrence,
      });
    }),
  );

export const skipOccurrence = (
  store: OperationStore,
  request: Target,
  input: ExpectedVersion,
) =>
  clientWrite(store, request, input, "TaskCancelled", (context) =>
    Effect.gen(function* () {
      const definition = seriesForTask(context.before, yield* store.series());
      if (
        definition === null ||
        definition.deleted_at !== null ||
        context.before.deleted_at !== null
      )
        return yield* rejectClientWrite(store, context, "TaskCancelled");
      return yield* new TaskCommands(store).transition(request, {
        ...input,
        action: "cancel",
      });
    }),
  );

export const revertTask = (
  store: OperationStore,
  request: Target,
  input: RevertTask,
) =>
  Effect.gen(function* () {
    const data = yield* store.auth.read(request);
    const entry = data.history.find((entry) => entry.seq === input.seq);
    if (
      entry?.event.kind === "TaskHistoryRedacted" &&
      (entry.event.task_ids.includes(request.task_id) ||
        entry.event.replay.tasks.some(
          ({ before, after }) =>
            before?.id === request.task_id || after?.id === request.task_id,
        ))
    )
      return yield* store.auth.mutate(request, (identity) =>
        Effect.gen(function* () {
          yield* store.reject({
            ...identity,
            reason: "task_purged",
            from_version: input.from_version,
            event: {
              kind: "TaskReverted",
              occurred_at: yield* now,
              task_id: request.task_id,
              original_seq: input.seq,
            },
          });
          return {
            outcome: "rejected",
            reason: "task_purged",
            latest: null,
          } satisfies TaskCommandResult;
        }),
      );
    const event =
      entry?.outcome === "committed" && Schema.is(Event)(entry.event)
        ? entry.event
        : null;
    if (event?.kind === "TaskMovedOut" || event?.kind === "TaskMovedIn") {
      const pair = (yield* store.history()).filter(
        (entry) =>
          entry.outcome === "committed" &&
          (entry.event.kind === "TaskMovedOut" ||
            entry.event.kind === "TaskMovedIn") &&
          entry.event.move_id === event.move_id,
      );
      const departure = pair.find(
        (entry) => entry.event.kind === "TaskMovedOut",
      )?.event;
      const arrival = pair.find(
        (entry) => entry.event.kind === "TaskMovedIn",
      )?.event;
      if (
        departure?.kind === "TaskMovedOut" &&
        arrival?.kind === "TaskMovedIn" &&
        arrival.task.id === request.task_id
      ) {
        yield* store.auth.authenticate({
          ...request,
          profile: departure.task.profile_id,
          access: "write",
        });
        yield* store.auth.authenticate({
          ...request,
          profile: arrival.task.profile_id,
          access: "write",
        });
        return yield* clientWrite(
          store,
          { ...request, profile: arrival.task.profile_id },
          input,
          "TaskReverted",
          (context) =>
            Effect.gen(function* () {
              if (
                JSON.stringify(context.before) !== JSON.stringify(arrival.task)
              )
                return yield* rejectClientWrite(
                  store,
                  context,
                  "TaskReverted",
                  "conflict",
                );
              const after = Schema.decodeUnknownSync(Task)({
                ...departure.task,
                row_version: context.before.row_version + 1,
                updated_at: context.time,
              });
              const result = yield* store.move({
                actor: context.identity.actor,
                before: context.before,
                after,
                original_seq: input.seq,
              });
              return result.outcome === "committed"
                ? { outcome: "committed", task: after }
                : {
                    outcome: "rejected",
                    reason: result.reason,
                    latest: context.before,
                  };
            }),
        );
      }
    }
    return yield* clientWrite(
      store,
      request,
      input,
      "TaskReverted",
      (context) =>
        Effect.gen(function* () {
          if (
            !event ||
            !eventChanges(event).tasks.some(
              (change) =>
                (change.after ?? change.before)?.id === request.task_id,
            )
          )
            return yield* rejectClientWrite(
              store,
              context,
              "TaskReverted",
              "invalid_revert",
            );
          const result = yield* store.revert({
            ...context.identity,
            seq: input.seq,
            occurred_at: context.time,
          });
          const latest =
            (yield* store.tasks()).find(
              (task) =>
                task.id === request.task_id &&
                task.profile_id === request.profile,
            ) ?? null;
          return result.outcome === "committed" && latest
            ? { outcome: "committed", task: latest }
            : {
                outcome: "rejected",
                reason: result.reason ?? "invalid_revert",
                latest,
              };
        }),
    );
  });
