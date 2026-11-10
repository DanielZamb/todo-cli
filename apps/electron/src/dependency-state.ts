import type {
  DependencyWarning,
  GraphReport,
  ProfileId,
  Task,
  TaskId,
  TaskRead,
} from "@todo/domain";
import type { Reply, Request } from "./protocol.ts";

export type DependencyDirection = "dependsOn" | "blocks";
export type DependencyScope = {
  readonly profile: ProfileId;
  readonly root: TaskId;
};
type Requester = (request: Request) => Promise<Reply>;
type Failure = Extract<Reply, { _tag: "error" | "conflict" }>;
export type DependencyState =
  | { readonly kind: "Closed" }
  | {
      readonly kind: "Open";
      readonly scope: DependencyScope;
      readonly direction: DependencyDirection;
      readonly query: string;
      readonly appliedQuery: string;
      readonly searchFailure: Extract<Reply, { _tag: "error" }> | null;
      readonly graph: GraphReport | null;
      readonly candidates: readonly TaskRead[];
      readonly loading: boolean;
      readonly pending: ReadonlyMap<TaskId, boolean>;
      readonly conflicts: ReadonlySet<TaskId>;
      readonly failure: Failure | null;
      readonly attempted: Task | null;
      readonly warnings: readonly DependencyWarning[];
      readonly notice: string;
    };
export class DependencyController {
  private state: DependencyState = { kind: "Closed" };
  private epoch = 0;
  private read = 0;
  private search = 0;
  private queues = new Map<TaskId, Promise<void>>();
  private listeners = new Set<() => void>();
  readonly snapshot = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: DependencyState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  readonly close = () => {
    this.epoch++;
    this.read++;
    this.search++;
    this.queues.clear();
    this.publish({ kind: "Closed" });
  };
  async open(
    scope: DependencyScope,
    request: Requester,
    direction: DependencyDirection = "dependsOn",
  ) {
    this.close();
    this.publish({
      kind: "Open",
      scope,
      direction,
      query: "",
      appliedQuery: "",
      searchFailure: null,
      graph: null,
      candidates: [],
      loading: true,
      pending: new Map(),
      conflicts: new Set(),
      failure: null,
      attempted: null,
      warnings: [],
      notice: "",
    });
    await Promise.all([this.reload(request), this.find("", request)]);
  }
  dismissFailure() {
    if (this.state.kind === "Open")
      this.publish({ ...this.state, failure: null });
  }
  direction(direction: DependencyDirection) {
    if (this.state.kind === "Open")
      this.publish({
        ...this.state,
        direction,
        failure: null,
        warnings: [],
        notice: "",
      });
  }
  private current(epoch: number) {
    const state = this.state;
    return epoch === this.epoch && state.kind === "Open" ? state : null;
  }
  async reload(request: Requester, clearConflicts = true) {
    if (this.state.kind === "Closed") return;
    const { scope } = this.state;
    const epoch = this.epoch;
    const read = ++this.read;
    this.publish({ ...this.state, loading: true });
    const result = await this.call(request, {
      _tag: "graph",
      profile: scope.profile,
      task: scope.root,
    });
    const current = this.current(epoch);
    if (!current || read !== this.read) return;
    if (
      result._tag === "graph" &&
      result.report.profile_id === scope.profile &&
      result.report.task_id === scope.root
    )
      this.publish({
        ...current,
        loading: false,
        graph: result.report,
        conflicts: clearConflicts ? new Set() : current.conflicts,
        failure: clearConflicts ? null : current.failure,
      });
    else
      this.publish({
        ...current,
        loading: false,
        failure: this.failure(result),
      });
  }
  async find(query: string, request: Requester) {
    if (this.state.kind === "Closed") return;
    const { scope } = this.state;
    const epoch = this.epoch;
    const search = ++this.search;
    this.publish({ ...this.state, query, searchFailure: null });
    const result = await this.call(request, {
      _tag: "dependencyCandidates",
      profile: scope.profile,
      filters: query ? { text: query } : {},
    });
    const current = this.current(epoch);
    if (!current || search !== this.search) return;
    if (result._tag === "dependencyCandidates")
      this.publish({
        ...current,
        candidates: result.tasks,
        appliedQuery: query,
        searchFailure: null,
      });
    else
      this.publish({
        ...current,
        searchFailure:
          result._tag === "error"
            ? result
            : {
                _tag: "error",
                message: "Todo returned an incompatible Task search.",
              },
      });
  }
  choices(): readonly { task: TaskRead; checked: boolean }[] {
    const state = this.state;
    if (state.kind === "Closed" || !state.graph) return [];
    const linked = state.graph.edges.flatMap((edge) =>
      state.direction === "dependsOn"
        ? edge.dependent_id === state.scope.root
          ? [edge.blocker_id]
          : []
        : edge.blocker_id === state.scope.root
          ? [edge.dependent_id]
          : [],
    );
    const existing = state.graph.nodes
      .filter((node) => linked.includes(node.task.id))
      .map((node) => ({ task: node.task, checked: true }));
    return [
      ...existing,
      ...state.candidates
        .filter(
          (task) => task.id !== state.scope.root && !linked.includes(task.id),
        )
        .map((task) => ({ task, checked: false })),
    ];
  }
  async toggle(candidate: TaskId, checked: boolean, request: Requester) {
    if (
      this.state.kind === "Closed" ||
      !this.state.graph ||
      this.state.pending.has(candidate)
    )
      return;
    const state = this.state;
    const dependent =
      state.direction === "dependsOn" ? state.scope.root : candidate;
    const blocker =
      state.direction === "dependsOn" ? candidate : state.scope.root;
    if (state.conflicts.has(dependent)) return;
    const epoch = this.epoch;
    const before = this.queues.get(dependent) ?? Promise.resolve();
    this.publish({
      ...state,
      pending: new Map([...state.pending, [candidate, checked]]),
      failure: null,
      warnings: [],
      notice: "",
    });
    const job = before
      .then(async () => {
        const current = this.current(epoch);
        if (!current) return;
        const task =
          current.graph?.nodes.find((node) => node.task.id === dependent)
            ?.task ?? current.candidates.find((task) => task.id === dependent);
        if (!task || current.conflicts.has(dependent)) return;
        const result = await this.call(request, {
          _tag: checked ? "depend" : "undepend",
          profile: state.scope.profile,
          task: dependent,
          payload: { blocker_id: blocker, from_version: task.row_version },
        });
        const received = this.current(epoch);
        if (!received) return;
        if (result._tag === "edge") {
          await Promise.all([
            this.reload(request, false),
            this.find(received.query, request),
          ]);
          const refreshed = this.current(epoch);
          if (!refreshed) return;
          this.publish({
            ...refreshed,
            warnings: result.report.warnings,
            notice:
              result.report.outcome === "unchanged"
                ? checked
                  ? "Already linked"
                  : "Already removed"
                : checked
                  ? "Dependency added"
                  : "Dependency removed",
          });
        } else
          this.publish({
            ...received,
            failure: this.failure(result),
            attempted:
              state.candidates.find((task) => task.id === candidate) ??
              state.graph?.nodes.find((node) => node.task.id === candidate)
                ?.task ??
              null,
            conflicts:
              result._tag === "conflict"
                ? new Set([...received.conflicts, dependent])
                : received.conflicts,
          });
      })
      .finally(() => {
        const current = this.current(epoch);
        if (!current) return;
        this.publish({
          ...current,
          pending: new Map(
            [...current.pending].filter(([id]) => id !== candidate),
          ),
        });
        if (this.queues.get(dependent) === job) this.queues.delete(dependent);
      });
    this.queues.set(dependent, job);
    return job;
  }
  private failure(result: Reply): Failure {
    return result._tag === "error" || result._tag === "conflict"
      ? result
      : { _tag: "error", message: "Couldn't update Dependencies. Try again." };
  }
  private async call(request: Requester, input: Request): Promise<Reply> {
    try {
      return await request(input);
    } catch {
      return {
        _tag: "error",
        message: "Couldn't update Dependencies. Try again.",
      };
    }
  }
}
