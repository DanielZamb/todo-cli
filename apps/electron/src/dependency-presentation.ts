import {
  DependencyError,
  type DependencyWarning,
  type Task,
  type TaskId,
} from "@todo/domain";
import { Schema } from "effect";

export type DependencyContext =
  | "add"
  | "complete"
  | "reopen"
  | "revert"
  | "delete";
export const dependencyAdvice = (count: number) =>
  `This Task depends on ${count} Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks.`;
export type DependencyRecovery = {
  readonly message: string;
  readonly detail: string;
  readonly witnesses: readonly {
    readonly id: TaskId;
    readonly title: string;
    readonly status?: Task["status"];
  }[];
  readonly advice?: string;
  readonly action: "choose" | "followUp" | "review" | "openBlocker";
  readonly followUp?: TaskId;
};
export function dependencyRecovery(
  error: DependencyError,
  context: DependencyContext,
  tasks: readonly Task[] = [],
): DependencyRecovery {
  const detail = `error ${error.exit_code} - ${error.exit_meaning}`;
  const named = (id: TaskId) => ({
    id,
    title: tasks.find((task) => task.id === id)?.title ?? id,
  });
  const captured = (task: Task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
  });
  switch (error.code) {
    case "dependency_cycle":
      return {
        message:
          error.details.dependent_id === error.details.blocker_id
            ? "A Task can't depend on itself."
            : "This Dependency would create a loop.",
        detail,
        witnesses: error.details.path.map(named),
        action: "choose",
      };
    case "too_many_dependencies":
      return {
        message: "A Task can have at most 13 direct Dependencies.",
        detail,
        advice: dependencyAdvice(error.details.count),
        witnesses: [],
        action: "choose",
      };
    case "blocked":
      return {
        message:
          context === "add"
            ? "A done Task can only depend on done or cancelled Tasks."
            : "Finish or cancel these Dependencies before marking this Task done.",
        detail,
        witnesses: error.details.blockers.map(captured),
        action: context === "add" ? "choose" : "openBlocker",
      };
    case "blocks_done_task":
      return {
        message:
          context === "revert"
            ? "This completion can't be reverted while these Tasks are done."
            : "This Task blocks done Tasks and can't be reopened.",
        detail,
        witnesses: error.details.done_dependents.map(captured),
        action: "followUp",
        followUp: error.details.follow_up_depends_on,
      };
    case "has_dependencies":
      return {
        message: "Review these Dependencies before deleting this Task.",
        detail,
        witnesses: error.details.dependencies.flatMap((edge) => [
          named(edge.blocker_id),
          named(edge.dependent_id),
        ]),
        action: "review",
      };
    case "dependency_profile_mismatch":
      return {
        message: "A Task and its Dependency must be in the same Profile.",
        detail,
        witnesses: [],
        action: "choose",
      };
  }
}
export function dependencyWarning(
  warning: DependencyWarning,
  tasks: readonly Task[] = [],
) {
  return warning.code === "many_dependencies"
    ? { message: dependencyAdvice(warning.count), path: [] }
    : {
        message:
          "This Dependency is already implied by the path below. The Dependency was kept.",
        path: warning.path.map(
          (id) => tasks.find((task) => task.id === id)?.title ?? id,
        ),
      };
}
export function dependencyErrorText(
  error: DependencyError,
  context: DependencyContext,
  tasks: readonly Task[] = [],
) {
  const projection = dependencyRecovery(error, context, tasks);
  return [
    projection.message,
    projection.advice,
    ...projection.witnesses.map(
      (task, index) =>
        `${error.code === "dependency_cycle" && index > 0 ? "→ " : ""}${task.title}${task.status ? ` · ${task.status === "cancelled" ? "Cancelled" : task.status}` : ""}`,
    ),
    projection.detail,
  ]
    .filter(Boolean)
    .join("\n");
}
const Nested = Schema.Struct({
  details: Schema.Struct({ dependency_error: DependencyError }),
});
export function nestedDependencyError(input: unknown): DependencyError | null {
  if (Schema.is(DependencyError)(input)) return input;
  const parsed = Schema.decodeUnknownExit(Nested)(input);
  return parsed._tag === "Success"
    ? parsed.value.details.dependency_error
    : null;
}
export function dependencyBadge(
  task: {
    readonly status: Task["status"];
    readonly depends_on?: readonly TaskId[];
    readonly ready?: boolean;
    readonly blocked?: boolean;
  },
  tasks: readonly Task[],
) {
  if (
    (task.status !== "open" && task.status !== "snoozed") ||
    !task.depends_on?.length
  )
    return null;
  if (task.ready) return "Ready";
  if (!task.blocked) return null;
  const count = task.depends_on.filter((id) => {
    const blocker = tasks.find((task) => task.id === id);
    return blocker?.status === "open" || blocker?.status === "snoozed";
  }).length;
  return `Blocked · ${count}`;
}
