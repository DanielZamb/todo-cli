import type { GraphReport, Task } from "@todo/domain";
import type { Reply, Request } from "./protocol.ts";

type Requester = (request: Request) => Promise<Reply>;
type Preview = Extract<Reply, { _tag: "task" }>["task"];
type Failure = Extract<Reply, { _tag: "error" | "conflict" }>;
type PreviewChange =
  | { readonly kind: "Initial" }
  | { readonly kind: "Changed"; readonly refusal: Failure };
const changedPreview = (failure: Failure): PreviewChange => ({
  kind: "Changed",
  refusal: failure,
});
export type DependencyDeleteState =
  | { readonly kind: "Closed" }
  | {
      readonly kind: "Loading";
      readonly task: Task;
      readonly change: PreviewChange;
    }
  | {
      readonly kind: "Review" | "Applying";
      readonly task: Preview;
      readonly graph: GraphReport | null;
      readonly fromVersion: Task["row_version"];
      readonly change: PreviewChange;
      readonly failure: Failure | null;
    }
  | {
      readonly kind: "Error";
      readonly task: Task;
      readonly change: PreviewChange;
      readonly failure: Failure;
    };
export class DependencyDeleteController {
  private state: DependencyDeleteState = { kind: "Closed" };
  private epoch = 0;
  private listeners = new Set<() => void>();
  readonly snapshot = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: DependencyDeleteState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  readonly close = () => {
    this.epoch++;
    this.publish({ kind: "Closed" });
  };
  async open(
    task: Task,
    request: Requester,
    options: { change?: PreviewChange; reloadConflict?: boolean } = {},
  ): Promise<void> {
    const change: PreviewChange = options.change ?? { kind: "Initial" };
    const epoch = ++this.epoch;
    this.publish({ kind: "Loading", task, change });
    const result = await this.call(request, {
      _tag: "delete",
      profile: task.profile_id,
      task: task.id,
      query: { from_version: task.row_version, dry_run: true },
    });
    if (epoch !== this.epoch) return;
    if (
      result._tag === "conflict" &&
      result.latest &&
      result.latest.id === task.id &&
      result.latest.profile_id === task.profile_id &&
      options.reloadConflict !== false
    )
      return this.open(result.latest, request, {
        change: changedPreview(result),
        reloadConflict: false,
      });
    if (
      result._tag !== "task" ||
      result.task.id !== task.id ||
      result.task.profile_id !== task.profile_id ||
      result.task.dry_run !== true ||
      (result.task.confirm_from_version !== undefined &&
        result.task.confirm_from_version !== task.row_version) ||
      !/^[a-f0-9]{64}$/u.test(result.task.dependency_fingerprint ?? "") ||
      !result.task.removed_dependencies
    ) {
      this.publish({
        kind: "Error",
        task,
        change,
        failure:
          result._tag === "error" || result._tag === "conflict"
            ? result
            : {
                _tag: "error",
                message:
                  "Couldn't load the Delete preview. Reload and try again.",
              },
      });
      return;
    }
    const graph = await this.call(request, {
      _tag: "graph",
      profile: task.profile_id,
      task: task.id,
    });
    if (epoch !== this.epoch) return;
    this.publish({
      kind: "Review",
      task: result.task,
      fromVersion: task.row_version,
      graph:
        graph._tag === "graph" &&
        graph.report.profile_id === task.profile_id &&
        graph.report.task_id === task.id
          ? graph.report
          : null,
      change,
      failure: null,
    });
  }
  async confirm(request: Requester): Promise<Task | null> {
    const state = this.state;
    if (state.kind !== "Review" || !state.task.dependency_fingerprint)
      return null;
    const epoch = this.epoch;
    this.publish({ ...state, kind: "Applying", failure: null });
    const result = await this.call(request, {
      _tag: "delete",
      profile: state.task.profile_id,
      task: state.task.id,
      query: {
        from_version: state.fromVersion,
        with_dependencies: true,
        dependency_fingerprint: state.task.dependency_fingerprint,
      },
    });
    if (epoch !== this.epoch) return null;
    if (
      result._tag === "task" &&
      result.task.id === state.task.id &&
      result.task.profile_id === state.task.profile_id &&
      result.task.dry_run === false &&
      (result.task.confirm_from_version === undefined ||
        result.task.confirm_from_version === state.fromVersion)
    ) {
      this.close();
      return result.task;
    }
    if (result._tag === "task") {
      this.publish({
        kind: "Error",
        task: state.task,
        change: state.change,
        failure: {
          _tag: "error",
          message:
            "Todo returned an incompatible Delete result. Reload its Dependencies before trying again.",
        },
      });
      return null;
    }
    if (
      result._tag === "conflict" ||
      (result._tag === "error" &&
        result.dependency?.code === "has_dependencies")
    ) {
      const current = result._tag === "conflict" ? result.latest : null;
      const latest =
        current ??
        (await this.call(request, {
          _tag: "showTask",
          profile: state.task.profile_id,
          task: state.task.id,
        }));
      if (epoch !== this.epoch) return null;
      const task =
        latest && "_tag" in latest
          ? latest._tag === "task"
            ? latest.task
            : null
          : latest;
      if (
        task &&
        task.id === state.task.id &&
        task.profile_id === state.task.profile_id
      )
        await this.open(task, request, { change: changedPreview(result) });
      else
        this.publish({
          ...state,
          kind: "Review",
          failure:
            latest &&
            "_tag" in latest &&
            (latest._tag === "error" || latest._tag === "conflict")
              ? latest
              : {
                  _tag: "error",
                  message: "Couldn't reload this Task. Close and try again.",
                },
        });
      return null;
    }
    this.publish({
      ...state,
      kind: "Review",
      failure:
        result._tag === "error"
          ? result
          : {
              _tag: "error",
              message:
                "Todo returned an incompatible Delete result. Reload its Dependencies before trying again.",
            },
    });
    return null;
  }
  private async call(request: Requester, input: Request): Promise<Reply> {
    try {
      return await request(input);
    } catch {
      return {
        _tag: "error",
        message: "Couldn't contact Todo. Try again when connected.",
      };
    }
  }
}
