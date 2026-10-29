import { TodoApi } from "@todo/api";
import { type PlanningView, seriesForTask, type TaskId } from "@todo/domain";
import { Effect } from "effect";
import type { HttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import type { NativeAttachmentRequest, Reply, Request } from "./protocol.ts";
import { historyTaskIds, seriesFromHistory, seriesKey } from "./recurrence.ts";

export type TaskRequest = Exclude<
  Request,
  | typeof NativeAttachmentRequest.Type
  | {
      _tag:
        | "openDiagnostics"
        | "restore"
        | "signIn"
        | "signOut"
        | "watch"
        | "draft"
        | "windowMode"
        | "setWindowMode"
        | "snapshotReveal";
    }
>;
const makeClient = () => HttpApiClient.make(TodoApi);
type Client = Effect.Success<ReturnType<typeof makeClient>>;
export const taskRequest = (
  http: Client,
  request: TaskRequest,
  draft = "",
): Effect.Effect<Reply, unknown, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    switch (request._tag) {
      case "diagnostics":
        return {
          _tag: "diagnostics",
          snapshot: (yield* http.diagnostics.snapshot()).body,
        };
      case "snapshots":
        return { _tag: "snapshots", ...(yield* http.snapshots.list()) };
      case "snapshotCreate":
        return {
          _tag: "snapshot",
          snapshot: yield* http.snapshots.create({
            payload: { reason: request.reason },
          }),
        };
      case "snapshotRestore":
        return {
          _tag: "snapshotRestore",
          restore: yield* http.snapshots.restore({
            params: { snapshot: request.id },
            payload: { dry_run: request.dryRun },
          }),
        };
      case "labelAttachment":
        return {
          _tag: "task",
          task: yield* http.tasks.labelAttachment({
            params: { profile: request.profile, task: request.task },
            payload: request.payload,
          }),
        };
      case "attach":
        return {
          _tag: "task",
          task: yield* http.tasks.attach({
            params: { profile: request.profile, task: request.task },
            payload: request.payload,
          }),
        };
      case "detach":
        return {
          _tag: "task",
          task: yield* http.tasks.detach({
            params: { profile: request.profile, task: request.task },
            payload: request.payload,
          }),
        };
      case "uploadAttachment":
        return {
          _tag: "task",
          task: yield* http.tasks.uploadAttachment({
            params: { profile: request.profile, task: request.task },
            payload: request.payload,
          }),
        };
      case "importTasks":
        return {
          _tag: "importReport",
          report: yield* http.tasks.importTasks({
            params: { profile: request.profile },
            payload: request.payload,
          }),
        };
      case "profiles":
        return { _tag: "signedIn", profiles: yield* http.reads.profiles() };
      case "deleteProfile":
        return {
          _tag: "profileDeleted",
          report: yield* http.reads.deleteProfile({
            params: { profile: request.profile },
            payload: request.payload,
          }),
        };
      case "list": {
        const params = { profile: request.profile };
        const [tasks, profiles, projects, tags, planning, matching] =
          yield* Effect.all(
            [
              http.tasks.list({ params, query: {} }),
              http.reads.profiles(),
              http.reads.projects({ params }),
              http.reads.tags({ params }),
              Effect.all(
                {
                  today: http.reads.view({
                    params: { ...params, view: "today" },
                    query: {},
                  }),
                  overdue: http.reads.view({
                    params: { ...params, view: "overdue" },
                    query: {},
                  }),
                  scheduled: http.reads.view({
                    params: { ...params, view: "scheduled" },
                    query: {},
                  }),
                  inbox: http.reads.view({
                    params: { ...params, view: "inbox" },
                    query: {},
                  }),
                },
                { concurrency: "unbounded" },
              ),
              request.filters
                ? http.tasks.list({ params, query: request.filters })
                : Effect.succeed(null),
            ],
            { concurrency: "unbounded" },
          );
        const count = (view: PlanningView) =>
          view.groups.reduce((sum, group) => sum + group.tasks.length, 0);
        return {
          _tag: "tasks",
          tasks,
          ...(matching === null
            ? {}
            : { matching_task_ids: matching.map((task) => task.id) }),
          profiles,
          projects: [...projects].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
          ),
          tags: [...tags].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
          ),
          planning: request.view === "tasks" ? null : planning[request.view],
          counts: {
            tasks: tasks.length,
            today: count(planning.today),
            overdue: count(planning.overdue),
            scheduled: count(planning.scheduled),
            inbox: count(planning.inbox),
          },
          draft: draft,
        };
      }
      case "parse":
        return {
          _tag: "parsed",
          draft: yield* http.reads.quickAdd({
            params: { profile: request.profile },
            payload: request.payload,
          }),
        };
      case "history":
        return {
          _tag: "history",
          entries: yield* http.reads.history({
            params: { profile: request.profile, task: request.task },
          }),
        };
      case "create":
        return {
          _tag: "task",
          task: yield* http.tasks.create({
            params: { profile: request.profile },
            payload: request.payload,
          }),
        };
      case "edit":
        return {
          _tag: "task",
          task: yield* http.tasks.edit({
            params: { profile: request.profile, task: request.task },
            payload: request.payload,
          }),
        };
      case "move":
        return {
          _tag: "task",
          task: yield* http.tasks.move({
            params: { profile: request.profile, task: request.task },
            payload: request.payload,
          }),
        };
      case "copy":
        return {
          _tag: "task",
          task: yield* http.tasks.copy({
            params: { profile: request.profile, task: request.task },
            payload: request.payload,
          }),
        };
      case "revert":
        return {
          _tag: "task",
          task: yield* http.tasks.revert({
            params: { profile: request.profile, task: request.task },
            payload: request.payload,
          }),
        };
      case "editSeries":
        return {
          _tag: "task",
          task: yield* http.tasks.editSeries({
            params: { profile: request.profile, task: request.task },
            payload: request.payload,
          }),
        };
      case "skipOccurrence":
        return {
          _tag: "task",
          task: yield* http.tasks.skipOccurrence({
            params: { profile: request.profile, task: request.task },
            payload: request.payload,
          }),
        };
      case "createSeries":
        return {
          _tag: "task",
          task: yield* http.tasks.createSeries({
            params: { profile: request.profile },
            payload: request.payload,
          }),
        };
      case "recurrence": {
        const tasks = yield* http.tasks.list({
          params: { profile: request.profile },
          query: {},
        });
        const task = tasks.find((task) => task.id === request.task);
        if (!task) return { _tag: "error", message: "Task not found" };
        const id = seriesKey(task);
        if (id === null) return { _tag: "series", series: null };
        const queue = tasks
          .filter((task) => seriesKey(task) === id)
          .map((task) => task.id);
        const seen = new Set<TaskId>();
        const entries = [];
        while (queue.length) {
          const batch = [...new Set(queue.splice(0))].filter(
            (id) => !seen.has(id),
          );
          for (const id of batch) seen.add(id);
          const histories = yield* Effect.all(
            batch.map((task) =>
              http.reads.history({
                params: { profile: request.profile, task },
              }),
            ),
            { concurrency: 8 },
          );
          for (const history of histories) {
            entries.push(...history);
            queue.push(
              ...historyTaskIds(history, id).filter((id) => !seen.has(id)),
            );
          }
        }
        return {
          _tag: "series",
          series: seriesForTask(task, seriesFromHistory(entries)),
        };
      }
      case "delete":
        return {
          _tag: "task",
          task: yield* http.tasks.delete({
            params: { profile: request.profile, task: request.task },
            query: request.query,
          }),
        };
      case "transition":
        return {
          _tag: "task",
          task: yield* http.tasks.transition({
            params: { profile: request.profile, task: request.task },
            payload: request.payload,
          }),
        };
    }
  });
