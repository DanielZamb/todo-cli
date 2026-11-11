import { Clock, Effect, Schema } from "effect";
import type { AccessRequest } from "./auth/model.ts";
import { filterTasks } from "./commands.ts";
import { Profile, Project, Tag, Task } from "./entities.ts";
import type { TaskId } from "./ids.ts";
import { taskView } from "./presentation.ts";
import type { OperationStore } from "./store/store.ts";
import { Instant, type TaskTime } from "./time.ts";

const count = {
  open_task_count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
};
export const ProfileSummary = Schema.Struct({
  ...Profile.fields,
  ...count,
  inbox_task_count: count.open_task_count,
  visible_task_count: Schema.optionalKey(count.open_task_count),
  projects: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({ id: Project.fields.id, name: Project.fields.name }),
    ).annotate({
      description:
        "Present with --projects or include_projects=true. Includes defined Projects even without visible Tasks; an empty Profile has [].",
    }),
  ),
});
export const ProjectSummary = Schema.Struct({ ...Project.fields, ...count });
export const TagSummary = Schema.Struct({ ...Tag.fields, ...count });
export const PlanningViewName = Schema.Literals([
  "today",
  "overdue",
  "scheduled",
  "inbox",
]);
export type PlanningViewName = typeof PlanningViewName.Type;
export const PlanningViewQuery = Schema.Struct({
  now: Schema.optionalKey(Instant),
});
export const PlanningView = Schema.Struct({
  name: PlanningViewName,
  now: Instant,
  groups: Schema.Array(
    Schema.Struct({
      name: Schema.Literals([
        "Overdue",
        "Due today",
        "Scheduled today",
        "Scheduled",
        "Inbox",
      ]),
      tasks: Schema.Array(Task),
    }),
  ),
});
export type PlanningView = typeof PlanningView.Type;

export const isInboxTask = (
  task: Pick<Task, "status"> & {
    readonly due_at?: TaskTime | string | null;
    readonly scheduled_at?: TaskTime | string | null;
  },
) =>
  task.status === "open" &&
  (task.due_at === null || task.due_at === undefined) &&
  (task.scheduled_at === null || task.scheduled_at === undefined);

const openTasks = (tasks: readonly Task[]) =>
  tasks.filter((task) => task.status === "open" && task.deleted_at === null);
export const profileTaskCounts = (tasks: readonly Task[]) => ({
  visible_task_count: tasks.filter((task) => task.deleted_at === null).length,
  open_task_count: openTasks(tasks).length,
  inbox_task_count: openTasks(tasks).filter(isInboxTask).length,
});

export class ClientReads {
  constructor(private readonly store: OperationStore) {}

  readonly profiles = (credential: string) =>
    this.store.auth.profileSummaries({ credential });

  readonly projects = (request: AccessRequest) =>
    this.store.auth.projects(request);

  readonly tags = (request: AccessRequest) => this.store.auth.tags(request);

  readonly view = (
    request: AccessRequest,
    name: PlanningViewName,
    at?: Instant,
  ) =>
    Effect.gen({ self: this }, function* () {
      const data = yield* this.store.auth.catalog(request);
      const now =
        at ??
        Schema.decodeUnknownSync(Instant)(
          new Date(yield* Clock.currentTimeMillis).toISOString(),
        );
      const tasks = openTasks(data.tasks);
      const views = tasks.map((task) =>
        taskView(task, data.projects, data.tags),
      );
      const overdueIds = new Set(
        filterTasks(views, { overdue: true }, now).map((task) => task.id),
      );
      const today = now.slice(0, 10);
      const rows = (ids: ReadonlySet<string>) =>
        tasks.filter((task) => ids.has(task.id));
      const dueToday = new Set(
        views
          .filter((task) => task.due_at?.slice(0, 10) === today)
          .map((task) => task.id),
      );
      const scheduledToday = new Set(
        views
          .filter((task) => task.scheduled_at?.slice(0, 10) === today)
          .map((task) => task.id),
      );
      const groups: PlanningView["groups"] =
        name === "today"
          ? [
              { name: "Overdue", tasks: rows(overdueIds) },
              { name: "Due today", tasks: rows(dueToday) },
              { name: "Scheduled today", tasks: rows(scheduledToday) },
            ]
          : name === "overdue"
            ? [{ name: "Overdue", tasks: rows(overdueIds) }]
            : name === "scheduled"
              ? [
                  {
                    name: "Scheduled",
                    tasks: tasks.filter((task) => task.scheduled_at !== null),
                  },
                ]
              : [
                  {
                    name: "Inbox",
                    tasks: tasks.filter(isInboxTask),
                  },
                ];
      return { name, now, groups };
    });

  readonly history = (request: AccessRequest & { readonly task_id: TaskId }) =>
    this.store.auth.taskHistory(request);
}
