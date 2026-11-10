import {
  type DependencyWarning,
  ProfileId,
  type Task,
  TaskId,
  type TaskRead,
} from "@todo/domain";
import { Schema } from "effect";
import type { Reply, Request } from "./protocol.ts";
export const dependencyDragType = "application/x-todo-task-dependency";
const DragInput = Schema.Struct({
  v: Schema.Literal(1),
  profile: ProfileId,
  task: TaskId,
});
export function dependencyDragSource(
  input: string,
  profile: ProfileId,
  tasks: readonly Task[],
): Task | null {
  try {
    const message = Schema.decodeUnknownSync(DragInput)(JSON.parse(input));
    return message.profile === profile
      ? (tasks.find(
          (task) => task.id === message.task && task.profile_id === profile,
        ) ?? null)
      : null;
  } catch {
    return null;
  }
}

type Pair = { readonly source: Task; readonly target: TaskRead };
type Failure = Extract<Reply, { _tag: "error" | "conflict" }>;
export type DependencyDragState =
  | { readonly kind: "Closed" }
  | { readonly kind: "Dragging"; readonly source: Task }
  | {
      readonly kind: "Hover";
      readonly source: Task | null;
      readonly target: TaskRead;
      readonly guidance: "allowed" | "already" | "self" | "foreign";
    }
  | ({ readonly kind: "Pending" } & Pair)
  | ({
      readonly kind: "Result";
      readonly message: string;
      readonly failure: Failure | null;
      readonly warnings: readonly DependencyWarning[];
    } & Pair);
export function dependencyDragHint(
  state: DependencyDragState,
): { text: string; accessibilityValue: string } | null {
  if (state.kind === "Pending")
    return {
      text: "Updating Dependencies…",
      accessibilityValue: `Updating Dependencies: ${state.target.title} will depend on ${state.source.title}.`,
    };
  if (state.kind !== "Hover") return null;
  switch (state.guidance) {
    case "foreign":
      return {
        text: "Choose a Task in this Profile.",
        accessibilityValue: "Choose a Task in this Profile.",
      };
    case "self":
      return {
        text: "A Task can't depend on itself.",
        accessibilityValue: `${state.target.title} can't depend on itself.`,
      };
    case "already":
      return {
        text: `Already depends on ${state.source?.title ?? "this Task"}`,
        accessibilityValue: `${state.target.title} already depends on ${state.source?.title ?? "this Task"}`,
      };
    case "allowed":
      return {
        text: `Will depend on ${state.source?.title ?? "this Task"}`,
        accessibilityValue: `${state.target.title} will depend on ${state.source?.title ?? "this Task"}`,
      };
  }
}
export class DependencyDragController {
  private state: DependencyDragState = { kind: "Closed" };
  private epoch = 0;
  private listeners = new Set<() => void>();
  readonly snapshot = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: DependencyDragState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  readonly close = () => {
    this.epoch++;
    this.publish({ kind: "Closed" });
  };
  begin(source: Task) {
    if (this.state.kind !== "Pending")
      this.publish({ kind: "Dragging", source });
  }
  end() {
    if (this.state.kind === "Dragging" || this.state.kind === "Hover")
      this.close();
  }
  hover(source: Task | null, target: TaskRead) {
    if (this.state.kind === "Pending") return;
    const local = source?.profile_id === target.profile_id ? source : null;
    this.publish({
      kind: "Hover",
      source: local,
      target,
      guidance: !local
        ? "foreign"
        : local.id === target.id
          ? "self"
          : target.depends_on?.includes(local.id)
            ? "already"
            : "allowed",
    });
  }
  leave() {
    if (this.state.kind === "Hover") {
      if (this.state.source)
        this.publish({ kind: "Dragging", source: this.state.source });
      else this.close();
    }
  }
  async drop(request: (request: Request) => Promise<Reply>): Promise<boolean> {
    const state = this.state;
    if (state.kind !== "Hover" || state.guidance !== "allowed" || !state.source)
      return false;
    const { source, target } = state;
    const epoch = ++this.epoch;
    this.publish({ kind: "Pending", source, target });
    const current = () => epoch === this.epoch && this.state.kind !== "Closed";
    const call = async (input: Request): Promise<Reply> => {
      try {
        return await request(input);
      } catch {
        return {
          _tag: "error",
          message: "Couldn't update Dependencies. Try again when connected.",
        };
      }
    };
    const latest = await call({
      _tag: "showTask",
      profile: target.profile_id,
      task: target.id,
    });
    if (!current()) return false;
    if (
      latest._tag !== "task" ||
      latest.task.id !== target.id ||
      latest.task.profile_id !== target.profile_id
    ) {
      this.publish({
        kind: "Result",
        source,
        target,
        message: "",
        failure:
          latest._tag === "error"
            ? latest
            : {
                _tag: "error",
                message: "Couldn't reload this Task's Dependencies. Try again.",
              },
        warnings: [],
      });
      return false;
    }
    const reply = await call({
      _tag: "depend",
      profile: target.profile_id,
      task: target.id,
      payload: { blocker_id: source.id, from_version: latest.task.row_version },
    });
    if (!current()) return false;
    if (
      reply._tag === "edge" &&
      reply.report.dependent_id === target.id &&
      reply.report.blocker_id === source.id &&
      reply.report.outcome !== "removed"
    ) {
      this.publish({
        kind: "Result",
        source,
        target: latest.task,
        message:
          reply.report.outcome === "unchanged"
            ? "Already linked"
            : "Dependency added",
        failure: null,
        warnings: reply.report.warnings,
      });
      return true;
    }
    this.publish({
      kind: "Result",
      source,
      target: latest.task,
      message: "",
      failure:
        reply._tag === "error" || reply._tag === "conflict"
          ? reply
          : {
              _tag: "error",
              message: "Todo returned an incompatible Dependency result.",
            },
      warnings: [],
    });
    return false;
  }
}
