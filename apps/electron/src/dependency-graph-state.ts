import type { GraphReport, TaskId } from "@todo/domain";
import type { GraphViewport } from "../graph-browser/protocol.ts";
import type { DependencyScope } from "./dependency-state.ts";
import type { Reply, Request } from "./protocol.ts";

type OpenState = {
  readonly kind: "Open";
  readonly scope: DependencyScope;
  readonly generation: number;
  readonly request: number;
  readonly report: GraphReport | null;
  readonly loading: boolean;
  readonly failure: Extract<Reply, { _tag: "error" }> | null;
  readonly selected: TaskId;
  readonly focused: TaskId | null;
  readonly expanded: ReadonlySet<TaskId>;
  readonly overview: boolean;
  readonly viewport: GraphViewport | null;
  readonly renderFailure: string | null;
};
export type DependencyGraphState = { readonly kind: "Closed" } | OpenState;
export class DependencyGraphController {
  private state: DependencyGraphState = { kind: "Closed" };
  private epoch = 0;
  private read = 0;
  private listeners = new Set<() => void>();
  readonly snapshot = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: DependencyGraphState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  readonly close = () => {
    this.epoch++;
    this.read++;
    this.publish({ kind: "Closed" });
  };
  async open(
    scope: DependencyScope,
    request: (request: Request) => Promise<Reply>,
  ) {
    this.close();
    this.publish({
      kind: "Open",
      scope,
      generation: this.epoch,
      request: 0,
      report: null,
      loading: true,
      failure: null,
      selected: scope.root,
      focused: scope.root,
      expanded: new Set(),
      overview: false,
      viewport: null,
      renderFailure: null,
    });
    await this.refresh(request);
  }
  async refresh(request: (request: Request) => Promise<Reply>) {
    const state = this.state;
    if (state.kind === "Closed") return;
    const epoch = this.epoch;
    const read = ++this.read;
    this.publish({ ...state, loading: true });
    let result: Reply;
    try {
      result = await request({
        _tag: "graph",
        profile: state.scope.profile,
        task: state.scope.root,
      });
    } catch {
      result = {
        _tag: "error",
        message: "Couldn't load Dependencies. Try again when connected.",
      };
    }
    const current = this.state;
    if (epoch !== this.epoch || read !== this.read || current.kind === "Closed")
      return;
    if (
      result._tag !== "graph" ||
      result.report.profile_id !== state.scope.profile ||
      result.report.task_id !== state.scope.root
    ) {
      this.publish({
        ...current,
        loading: false,
        failure:
          result._tag === "error"
            ? result
            : {
                _tag: "error",
                message: "Todo returned an incompatible Dependency graph.",
              },
      });
      return;
    }
    const known = new Set(result.report.nodes.map((node) => node.task.id));
    this.publish({
      ...current,
      loading: false,
      failure: null,
      renderFailure: null,
      request: read,
      report: result.report,
      selected: known.has(current.selected)
        ? current.selected
        : state.scope.root,
      focused:
        current.focused !== null && known.has(current.focused)
          ? current.focused
          : state.scope.root,
      expanded: new Set([...current.expanded].filter((id) => known.has(id))),
    });
  }
  setViewport(viewport: GraphViewport) {
    if (
      this.state.kind === "Open" &&
      (!this.state.viewport ||
        this.state.viewport.x !== viewport.x ||
        this.state.viewport.y !== viewport.y ||
        this.state.viewport.scale !== viewport.scale)
    )
      this.publish({ ...this.state, viewport });
  }
  select(id: TaskId) {
    if (
      this.state.kind === "Open" &&
      this.state.selected !== id &&
      this.known(id)
    )
      this.publish({ ...this.state, selected: id });
  }
  focus(id: TaskId | null) {
    if (
      this.state.kind === "Open" &&
      (id === null || this.known(id)) &&
      this.state.focused !== id
    )
      this.publish({ ...this.state, focused: id });
  }
  expand(id: TaskId) {
    if (this.state.kind === "Open" && this.known(id))
      this.publish({
        ...this.state,
        expanded: new Set([...this.state.expanded, id]),
      });
  }
  overview(overview: boolean) {
    if (this.state.kind === "Open") this.publish({ ...this.state, overview });
  }
  renderFailed(message: string | null) {
    if (this.state.kind === "Open" && this.state.renderFailure !== message)
      this.publish({ ...this.state, renderFailure: message });
  }
  reset() {
    if (this.state.kind === "Open")
      this.publish({
        ...this.state,
        viewport: null,
        focused: this.state.selected,
      });
  }
  visibleIds(state: DependencyGraphState = this.state): readonly TaskId[] {
    if (state.kind === "Closed" || !state.report) return [];
    if (state.overview) return state.report.topological_order;
    const seeds = new Set([state.scope.root, ...state.expanded]);
    const visible = new Set(seeds);
    for (const edge of state.report.edges) {
      if (seeds.has(edge.dependent_id)) visible.add(edge.blocker_id);
      if (seeds.has(edge.blocker_id)) visible.add(edge.dependent_id);
    }
    return state.report.topological_order.filter((id) => visible.has(id));
  }
  private known(id: TaskId) {
    return (
      this.state.kind === "Open" &&
      this.state.report?.nodes.some((node) => node.task.id === id)
    );
  }
}
