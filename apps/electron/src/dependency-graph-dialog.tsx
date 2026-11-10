import type { Task, TaskId } from "@todo/domain";
import { Schema } from "effect";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  decodeGraphReply,
  GraphHostIdentity,
  type GraphHostRender,
  type GraphHostReply,
  type GraphTheme,
} from "../graph-browser/protocol.ts";
import { Alert, AlertDescription } from "./components/ui/alert.tsx";
import { Button } from "./components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import type { DependencyGraphController } from "./dependency-graph-state.ts";
import { DependencyTaskLabel } from "./dependency-task-label.tsx";
import type { Reply, Request } from "./protocol.ts";

function graphTheme(dark: boolean): GraphTheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(`--${name}`).trim();
  return {
    mode: dark ? "dark" : "light",
    tokens: {
      ink: token("foreground"),
      paper: token("background"),
      card: token("card"),
      border: token("input"),
      "muted-text": token("muted-foreground"),
      primary: token("primary"),
      "on-primary": token("primary-foreground"),
      accent: token("accent"),
      warning: token("warning"),
      danger: token("destructive"),
    },
  };
}
function GraphDiagram({
  command,
  receive,
}: {
  command: GraphHostRender;
  receive: (reply: GraphHostReply) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const current = useRef(command);
  current.current = command;
  const handle = useRef(receive);
  handle.current = receive;
  const send = useCallback(() => {
    requestAnimationFrame(() =>
      frame.current?.contentWindow?.postMessage(
        {
          ...current.current,
          theme: graphTheme(current.current.theme.mode === "dark"),
        },
        "*",
      ),
    );
  }, []);
  useEffect(() => {
    const listener = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow) return;
      const envelope = Schema.decodeUnknownExit(
        Schema.Struct({ identity: GraphHostIdentity }),
      )(event.data);
      if (
        envelope._tag === "Success" &&
        JSON.stringify(envelope.value.identity) !==
          JSON.stringify(current.current.identity)
      )
        return;
      try {
        handle.current(decodeGraphReply(event.data, current.current));
      } catch {
        handle.current({
          v: 1,
          type: "renderError",
          identity: current.current.identity,
          message:
            "Todo received an incompatible graph response. Use the Task list or Retry.",
        });
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);
  useEffect(() => {
    current.current = command;
    send();
  }, [command, send]);
  return (
    <iframe
      ref={frame}
      title="Task Dependency diagram"
      data-testid="dependency-graph-diagram"
      src={new URL("../graph-browser/index.html", location.href).href}
      onLoad={send}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
export function DependencyGraphDialog({
  controller,
  request,
  compact,
  dark,
  connected,
  returnFocus,
  openTask,
  addDependency,
}: {
  controller: DependencyGraphController;
  request: (request: Request) => Promise<Reply>;
  compact: boolean;
  dark: boolean;
  connected: boolean;
  returnFocus: () => HTMLElement | null;
  openTask: (task: Task) => void;
  addDependency: (task: Task) => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const [diagram, setDiagram] = useState(!compact);
  const [copied, setCopied] = useState(false);
  const reset = useRef<HTMLButtonElement>(null);
  const epoch = state.kind === "Open" ? state.generation : -1;
  useEffect(() => {
    if (epoch < 0) return;
    setDiagram(!compact);
    setCopied(false);
  }, [compact, epoch]);
  const visible = useMemo(
    () => controller.visibleIds(state),
    [controller, state],
  );
  const command = useMemo<GraphHostRender | null>(
    () =>
      state.kind === "Open" && state.report
        ? {
            v: 1,
            type: "render",
            identity: {
              profile: state.scope.profile,
              root: state.scope.root,
              credentialGeneration: state.generation,
              request: state.request,
            },
            nodes: state.report.nodes.map((node) => ({
              mermaid_id: node.mermaid_id,
              task_id: node.task.id,
            })),
            mermaid: state.report.mermaid,
            visible_ids: visible,
            viewport: state.viewport,
            selected_id: state.selected,
            focused_id: state.focused,
            theme: graphTheme(dark),
            reduced_motion: matchMedia("(prefers-reduced-motion: reduce)")
              .matches,
          }
        : null,
    [state, visible, dark],
  );
  const viewport = state.kind === "Open" ? state.viewport : null;
  useLayoutEffect(() => {
    if (
      viewport &&
      reset.current?.disabled &&
      document.activeElement === reset.current
    )
      document
        .querySelector<HTMLElement>('[data-testid="dependency-graph-selected"]')
        ?.focus();
  }, [viewport]);
  if (state.kind === "Closed") return null;
  const report = state.report;
  const root = report?.nodes.find((node) => node.task.id === state.scope.root);
  const task = (id: string) =>
    report?.nodes.find((node) => node.task.id === id)?.task;
  const close = () => controller.close();
  const receive = (reply: GraphHostReply) => {
    switch (reply.type) {
      case "activate": {
        const value = task(reply.task_id);
        if (value) {
          controller.select(value.id);
          close();
          openTask(value);
        }
        break;
      }
      case "context": {
        const value = task(reply.task_id);
        if (value) {
          close();
          addDependency(value);
        }
        break;
      }
      case "focus": {
        const value = reply.task_id === null ? null : task(reply.task_id);
        if (value !== undefined) controller.focus(value?.id ?? null);
        break;
      }
      case "expand": {
        const value = task(reply.task_id);
        if (value) controller.expand(value.id);
        break;
      }
      case "viewport":
        controller.setViewport(reply);
        break;
      case "renderError":
        controller.renderFailed(reply.message);
        break;
      case "rendered":
        controller.renderFailed(null);
        break;
      case "ready":
        break;
    }
  };
  const identified = new Set<TaskId>();
  const list = (name: string, ids: readonly TaskId[]) => (
    <section className="dependency-graph-section">
      <h3>
        {name} · {ids.length}
      </h3>
      {ids.length === 0 ? (
        <p className="text-muted-foreground">None</p>
      ) : (
        <ul>
          {ids.map((id) => {
            const value = task(id);
            const first = !identified.has(id);
            identified.add(id);
            return (
              <li key={id}>
                <Button
                  variant="ghost"
                  data-testid={
                    first ? `dependency-graph-task-${id}` : undefined
                  }
                  onClick={() => {
                    if (value) {
                      close();
                      openTask(value);
                    }
                  }}
                >
                  <DependencyTaskLabel task={value} id={id} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={
                    first ? `dependency-graph-expand-${id}` : undefined
                  }
                  onClick={() => controller.expand(id)}
                >
                  Expand
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="dependency-graph-dialog"
        data-testid="dependency-graph"
        finalFocus={returnFocus}
        showCloseButton={false}
      >
        <DialogTitle>Dependencies</DialogTitle>
        <DialogDescription>
          {root?.task.title ?? state.scope.root}
        </DialogDescription>
        <div className="dependency-graph-controls">
          <Button
            variant="outline"
            data-testid="dependency-graph-list"
            aria-pressed={!diagram}
            onClick={() => setDiagram(false)}
          >
            List
          </Button>
          <Button
            variant="outline"
            aria-pressed={diagram}
            onClick={() => setDiagram(true)}
          >
            Diagram
          </Button>
          <Button
            variant="outline"
            data-testid="dependency-graph-overview"
            aria-pressed={state.overview}
            onClick={() => controller.overview(!state.overview)}
          >
            {state.overview ? "Selected region" : "Whole group"}
          </Button>
        </div>
        {!connected && (
          <p role="status">Offline. The last Dependencies are read-only.</p>
        )}
        {state.loading && <p role="status">Loading Dependencies…</p>}
        <div
          className="dependency-graph-body"
          data-diagram={diagram && !state.renderFailure}
          data-compact={compact}
        >
          {state.failure && (
            <Alert role="status">
              <AlertDescription>
                {state.failure.message}
                <Button
                  variant="outline"
                  disabled={!connected}
                  data-testid="dependency-graph-retry"
                  onClick={() => void controller.refresh(request)}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {state.renderFailure && (
            <Alert role="status">
              <AlertDescription>
                {state.renderFailure}
                <Button
                  variant="outline"
                  disabled={!connected}
                  data-testid="dependency-graph-retry"
                  onClick={() => {
                    controller.renderFailed(null);
                    void controller.refresh(request);
                    setDiagram(true);
                  }}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {diagram && !state.renderFailure && command && (
            <section className="dependency-diagram-region">
              <GraphDiagram command={command} receive={receive} />
              <div className="dependency-graph-controls">
                <Button
                  variant="outline"
                  onClick={() =>
                    controller.setViewport({
                      ...state.viewport,
                      scale: Math.min(4, state.viewport.scale * 1.2),
                    })
                  }
                >
                  Zoom in
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    controller.setViewport({
                      ...state.viewport,
                      scale: Math.max(0.1, state.viewport.scale / 1.2),
                    })
                  }
                >
                  Zoom out
                </Button>
                <Button
                  ref={reset}
                  variant="outline"
                  data-testid="dependency-graph-reset"
                  disabled={
                    state.viewport.x === 0 &&
                    state.viewport.y === 0 &&
                    state.viewport.scale === 1
                  }
                  onClick={() => controller.reset()}
                >
                  Reset
                </Button>
              </div>
              {root && (
                <Button
                  variant="ghost"
                  data-testid="dependency-graph-selected"
                  onClick={() => {
                    const value = task(state.selected);
                    if (value) {
                      close();
                      openTask(value);
                    }
                  }}
                >
                  Open {task(state.selected)?.title ?? root.task.title}
                </Button>
              )}
              <p className="text-muted-foreground">
                {visible.length} of {report?.nodes.length ?? 0} Tasks shown
              </p>
            </section>
          )}
          {report && (
            <div
              className="dependency-graph-native"
              data-testid="dependency-graph-details"
            >
              {report.nodes.length > 50 && (
                <p>
                  More than 50 Tasks. Use the list and Task search to choose a
                  region.
                </p>
              )}
              {(!diagram || !compact || state.renderFailure) && (
                <>
                  {list(
                    "Depends on",
                    report.edges
                      .filter((edge) => edge.dependent_id === state.scope.root)
                      .map((edge) => edge.blocker_id),
                  )}
                  {list(
                    "Blocks",
                    report.edges
                      .filter((edge) => edge.blocker_id === state.scope.root)
                      .map((edge) => edge.dependent_id),
                  )}
                  {list("Lightest next", report.lightest_next)}
                </>
              )}
              {root && (
                <section className="dependency-graph-section">
                  <h3>Task details</h3>
                  <p>
                    {report.shape === "tree"
                      ? `${report.orientation} tree`
                      : report.shape === "single"
                        ? "Single Task"
                        : report.shape === "chain"
                          ? "Chain"
                          : "DAG"}
                  </p>
                  <dl>
                    <dt>Depends on</dt>
                    <dd>{root.in_degree}</dd>
                    <dt>Blocks</dt>
                    <dd>{root.out_degree}</dd>
                    <dt>Depth</dt>
                    <dd>{root.depth}</dd>
                    <dt>Remaining Energy</dt>
                    <dd>
                      {root.remaining_energy.energy} ·{" "}
                      {root.remaining_energy.unweighted} unweighted
                    </dd>
                    <dt>Sources</dt>
                    <dd>
                      {report.sources
                        .map((id) => task(id)?.title ?? id)
                        .join(", ")}
                    </dd>
                    <dt>Sinks</dt>
                    <dd>
                      {report.sinks
                        .map((id) => task(id)?.title ?? id)
                        .join(", ")}
                    </dd>
                  </dl>
                  <Button
                    variant="outline"
                    onClick={() => {
                      close();
                      addDependency(root.task);
                    }}
                  >
                    Add dependency
                  </Button>
                </section>
              )}
              {(!diagram || !compact || state.renderFailure) && (
                <>
                  {list("Ancestors", report.ancestors)}
                  {list("Descendants", report.descendants)}
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          {report && (
            <Button
              variant="outline"
              data-testid="dependency-graph-copy-mermaid"
              onClick={() =>
                void request({
                  _tag: "copyMermaid",
                  text: report.mermaid,
                }).then((reply) => setCopied(reply._tag === "ok"))
              }
            >
              {copied ? "Copied Mermaid" : "Copy Mermaid"}
            </Button>
          )}
          <Button
            variant="outline"
            data-testid="dependency-graph-close"
            onClick={close}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
