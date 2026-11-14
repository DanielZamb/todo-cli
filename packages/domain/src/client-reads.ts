import { Clock, Effect, Schema } from "effect";
import type { AccessRequest } from "./auth/model.ts";
import { Profile, Project, Tag, Task } from "./entities.ts";
import type { TaskId } from "./ids.ts";
import {
  checkTimeZone,
  type PlanningMembership,
  planningDay,
  planningMembership,
} from "./planning-day.ts";
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
  time_zone: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "The client's IANA time zone. Today is the date of now there, and an instant falls on its date in its own zone. Without it, today is the UTC date of now. An unknown zone is invalid_args.",
    }),
  ),
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
    timeZone?: string,
  ) =>
    Effect.gen({ self: this }, function* () {
      const unknown = checkTimeZone(timeZone);
      if (unknown) return yield* Effect.fail(unknown);
      const { selection: authority, data } = yield* this.store.auth.readCatalog(
        request,
        Schema.Struct({
          name: PlanningViewName,
          at: Schema.optionalKey(Instant),
          time_zone: Schema.optionalKey(Schema.String),
        }),
        {
          name,
          ...(at === undefined ? {} : { at }),
          ...(timeZone === undefined ? {} : { time_zone: timeZone }),
        },
      );
      const selected = authority.fields;
      const now =
        selected.at ??
        Schema.decodeUnknownSync(Instant)(
          new Date(yield* Clock.currentTimeMillis).toISOString(),
        );
      const day = planningDay(now, selected.time_zone);
      const tasks = openTasks(data.tasks).map((task) => ({
        task,
        member: planningMembership(task, day),
      }));
      const rows = (key: Exclude<keyof PlanningMembership, "open">) =>
        tasks.filter(({ member }) => member[key]).map(({ task }) => task);
      const groups: PlanningView["groups"] =
        selected.name === "today"
          ? [
              { name: "Overdue", tasks: rows("overdue") },
              { name: "Due today", tasks: rows("dueToday") },
              { name: "Scheduled today", tasks: rows("scheduledToday") },
            ]
          : selected.name === "overdue"
            ? [{ name: "Overdue", tasks: rows("overdue") }]
            : selected.name === "scheduled"
              ? [{ name: "Scheduled", tasks: rows("scheduled") }]
              : [{ name: "Inbox", tasks: rows("inbox") }];
      return { name: selected.name, now, groups };
    });

  readonly history = (request: AccessRequest & { readonly task_id: TaskId }) =>
    this.store.auth.taskHistory(request);
}
