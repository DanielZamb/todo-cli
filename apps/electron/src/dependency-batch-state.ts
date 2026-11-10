import {
  type BatchEdgeReport,
  type BatchEdgeRequest,
  type GraphReport,
  type Task,
  type TaskRead,
  Version,
} from "@todo/domain";
import { Schema } from "effect";
import { isDependencyConflict } from "./dependency-presentation.ts";
import type { DependencyDirection } from "./dependency-state.ts";
import type { Reply, Request } from "./protocol.ts";

type Requester = (request: Request) => Promise<Reply>;
type OpenState = {
  readonly kind: "Open";
  readonly root: Task;
  readonly direction: DependencyDirection;
  readonly action: "depend" | "undepend";
  readonly selected: readonly TaskRead[];
  readonly phase: "select" | "review";
  readonly busy: boolean;
  readonly graph: GraphReport | null;
  readonly items: BatchEdgeRequest["items"] | null;
  readonly report: BatchEdgeReport | null;
  readonly failure: Extract<Reply, { _tag: "error" | "conflict" }> | null;
  readonly needsReload: boolean;
};
export type DependencyBatchState = { readonly kind: "Closed" } | OpenState;
export class DependencyBatchController {
  private state: DependencyBatchState = { kind: "Closed" };
  private epoch = 0;
  private listeners = new Set<() => void>();
  readonly snapshot = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: DependencyBatchState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  readonly close = () => {
    this.epoch++;
    this.publish({ kind: "Closed" });
  };
  open(root: Task, direction: DependencyDirection) {
    this.close();
    this.publish({
      kind: "Open",
      root,
      direction,
      action: "depend",
      selected: [],
      phase: "select",
      busy: false,
      graph: null,
      items: null,
      report: null,
      failure: null,
      needsReload: false,
    });
  }
  select(selected: readonly TaskRead[]) {
    const state = this.state;
    if (state.kind === "Open" && !state.busy)
      this.publish({
        ...state,
        selected: selected.filter(
          (task) => task.profile_id === state.root.profile_id,
        ),
        items: null,
        report: null,
      });
  }
  action(action: "depend" | "undepend") {
    if (this.state.kind === "Open" && !this.state.busy)
      this.publish({
        ...this.state,
        action,
        items: null,
        report: null,
        needsReload: false,
      });
  }
  back() {
    if (this.state.kind === "Open" && !this.state.busy)
      this.publish({
        ...this.state,
        phase: "select",
        report: null,
        items: null,
      });
  }
  changed() {
    if (
      this.state.kind === "Open" &&
      this.state.phase === "review" &&
      this.state.report?.dry_run &&
      !this.state.busy
    )
      this.publish({ ...this.state, needsReload: true });
  }
  async preview(request: Requester) {
    const state = this.state;
    if (state.kind === "Closed" || state.busy || state.selected.length === 0)
      return;
    const epoch = ++this.epoch;
    this.publish({
      ...state,
      phase: "review",
      busy: true,
      failure: null,
      report: null,
      items: null,
    });
    const result = await this.call(request, {
      _tag: "graph",
      profile: state.root.profile_id,
      task: state.root.id,
    });
    if (!this.current(epoch)) return;
    if (
      result._tag !== "graph" ||
      result.report.task_id !== state.root.id ||
      result.report.profile_id !== state.root.profile_id
    ) {
      this.publish({
        ...state,
        phase: "review",
        busy: false,
        failure:
          result._tag === "error"
            ? result
            : {
                _tag: "error",
                message:
                  "Couldn't load the Dependency preview. Reload and try again.",
              },
      });
      return;
    }
    const graph = result.report;
    const versions = new Map(
      graph.nodes.map((node) => [node.task.id, node.task.row_version]),
    );
    const root = graph.nodes.find(
      (node) => node.task.id === state.root.id,
    )?.task;
    if (!root) {
      this.publish({
        ...state,
        phase: "review",
        busy: false,
        failure: { _tag: "error", message: "Task not found." },
      });
      return;
    }
    const items: BatchEdgeRequest["items"][number][] = state.selected.map(
      (candidate, index) => {
        const dependent = state.direction === "dependsOn" ? root : candidate;
        const blocker = state.direction === "dependsOn" ? candidate : root;
        const from_version =
          versions.get(dependent.id) ?? dependent.row_version;
        const existing = graph.edges.some(
          (edge) =>
            edge.dependent_id === dependent.id &&
            edge.blocker_id === blocker.id,
        );
        const previous = state.report?.dry_run
          ? state.report.results.find((row) => row.index === index)
          : undefined;
        const refused =
          previous &&
          "error" in previous &&
          !isDependencyConflict(previous.error.code);
        if ((state.action === "depend" ? !existing : existing) && !refused)
          versions.set(
            dependent.id,
            Schema.decodeUnknownSync(Version)(from_version + 1),
          );
        return {
          action: state.action,
          dependent_id: dependent.id,
          blocker_id: blocker.id,
          from_version,
        };
      },
    );
    const reply = await this.call(request, {
      _tag: "batchDepend",
      profile: root.profile_id,
      payload: { items, dry_run: true },
    });
    if (!this.current(epoch)) return;
    this.finish({ ...state, root, phase: "review", graph, items }, reply, true);
  }
  async apply(request: Requester): Promise<boolean> {
    const state = this.state;
    if (
      state.kind === "Closed" ||
      state.busy ||
      state.needsReload ||
      !state.items ||
      state.report?.dry_run !== true
    )
      return false;
    const epoch = ++this.epoch;
    this.publish({ ...state, busy: true, failure: null });
    const reply = await this.call(request, {
      _tag: "batchDepend",
      profile: state.root.profile_id,
      payload: { items: state.items, dry_run: false },
    });
    if (!this.current(epoch)) return false;
    return this.finish(state, reply, false);
  }
  private current(epoch: number) {
    return epoch === this.epoch && this.state.kind === "Open";
  }
  private finish(state: OpenState, reply: Reply, preview: boolean) {
    if (
      reply._tag !== "batchDepend" ||
      reply.report.dry_run !== preview ||
      reply.report.results.length !== state.items?.length ||
      new Set(reply.report.results.map((row) => row.index)).size !==
        reply.report.results.length ||
      reply.report.results.some((row) => {
        const item = state.items?.[row.index];
        return (
          !item ||
          ("result" in row &&
            (row.result.dependent_id !== item.dependent_id ||
              row.result.blocker_id !== item.blocker_id))
        );
      })
    ) {
      this.publish({
        ...state,
        busy: false,
        failure:
          reply._tag === "error" || reply._tag === "conflict"
            ? reply
            : {
                _tag: "error",
                message:
                  "Todo returned an incompatible Dependency batch report.",
              },
      });
      return false;
    }
    this.publish({
      ...state,
      busy: false,
      report: reply.report,
      failure: null,
      needsReload: reply.report.results.some(
        (row) => "error" in row && isDependencyConflict(row.error.code),
      ),
    });
    return true;
  }
  private async call(request: Requester, input: Request): Promise<Reply> {
    try {
      return await request(input);
    } catch {
      return {
        _tag: "error",
        message: "Couldn't update Dependencies. Try again when connected.",
      };
    }
  }
}
