import type { Task, TaskId } from "@todo/domain";
import { Schema } from "effect";
import {
  ChevronDown,
  Ellipsis,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./components/ui/collapsible.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu.tsx";
import { Field } from "./components/ui/field.tsx";
import { Input } from "./components/ui/input.tsx";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group.tsx";
import {
  DependencyErrorStatus,
  DependencySearchStatus,
} from "./dependency-dialog.tsx";
import type { DependencyGraphController } from "./dependency-graph-state.ts";
import { DependencyTaskLabel } from "./dependency-task-label.tsx";
import { countTasks } from "./presentation.ts";
import type { Reply, Request } from "./protocol.ts";
import type { FindTask } from "./task-lookup-status.tsx";

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
  refit,
  automaticFit,
}: {
  command: GraphHostRender;
  receive: (reply: GraphHostReply, automaticFit: boolean) => void;
  refit: () => boolean;
  automaticFit: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const current = useRef(command);
  current.current = command;
  const handle = useRef(receive);
  handle.current = receive;
  const resize = useRef(refit);
  resize.current = refit;
  const automatic = useRef(automaticFit);
  automatic.current = automaticFit;
  const pendingSend = useRef(0);
  const fitSend = useRef(false);
  const send = useCallback((fit = false) => {
    fitSend.current ||= fit;
    if (pendingSend.current) return;
    pendingSend.current = requestAnimationFrame(() => {
      pendingSend.current = 0;
      const { viewport: _viewport, ...fitted } = current.current;
      frame.current?.contentWindow?.postMessage(
        {
          ...(fitSend.current && automatic.current ? fitted : current.current),
          theme: graphTheme(current.current.theme.mode === "dark"),
        },
        "*",
      );
      fitSend.current = false;
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(pendingSend.current), []);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let width = element.clientWidth;
    let height = element.clientHeight;
    let pending = 0;
    let candidateWidth = Number.NaN;
    let candidateHeight = Number.NaN;
    const settledSize = () => {
      const nextWidth = element.clientWidth;
      const nextHeight = element.clientHeight;
      if (nextWidth !== candidateWidth || nextHeight !== candidateHeight) {
        candidateWidth = nextWidth;
        candidateHeight = nextHeight;
        pending = requestAnimationFrame(settledSize);
        return;
      }
      pending = 0;
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      if (resize.current()) send(true);
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      candidateWidth = Number.NaN;
      candidateHeight = Number.NaN;
      pending = requestAnimationFrame(settledSize);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(pending);
    };
  }, [send]);
  useEffect(() => {
    let rendering = false;
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
        const reply = decodeGraphReply(event.data, current.current);
        if (reply.type === "ready") rendering = true;
        handle.current(reply, rendering);
        if (reply.type === "viewport" && rendering && !automatic.current)
          send();
        if (reply.type === "rendered" || reply.type === "renderError")
          rendering = false;
      } catch {
        handle.current(
          {
            v: 1,
            type: "renderError",
            identity: current.current.identity,
            message:
              "Todo received an incompatible graph response. Use the Task list or Retry.",
          },
          false,
        );
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [send]);
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
      onLoad={() => send()}
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
  projects,
  onFindTask,
}: {
  controller: DependencyGraphController;
  request: (request: Request) => Promise<Reply>;
  compact: boolean;
  dark: boolean;
  connected: boolean;
  returnFocus: () => HTMLElement | null;
  openTask: (task: Task) => void;
  addDependency: (task: Task) => void;
  projects: readonly { id: string; name: string }[];
  onFindTask?: FindTask | undefined;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const [diagram, setDiagram] = useState(!compact);
  const [copied, setCopied] = useState(false);
  const [showDiagramTasks, setShowDiagramTasks] = useState(false);
  const frame = useRef<HTMLElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const epoch = state.kind === "Open" ? state.generation : -1;
  const large = state.kind === "Open" && (state.report?.nodes.length ?? 0) > 50;
  useEffect(() => {
    if (epoch >= 0) setShowDiagramTasks(false);
  }, [epoch]);
  useEffect(() => {
    if (large) setShowDiagramTasks(true);
  }, [large]);
  useEffect(() => {
    if (epoch >= 0) {
      setDiagram(!compact);
      setCopied(false);
      controller.refit();
    }
  }, [compact, epoch, controller]);
  useEffect(() => () => clearTimeout(debounce.current), []);
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
            root_id: state.scope.root,
            identity: {
              profile: state.scope.profile,
              root: state.scope.root,
              credentialGeneration: state.generation,
              request: state.request,
            },
            nodes: state.report.nodes.map((node) => ({
              mermaid_id: node.mermaid_id,
              task_id: node.task.id,
              title: node.task.title,
              ...(node.task.status === "done" ||
              node.task.status === "cancelled"
                ? { state: node.task.status }
                : node.blocked
                  ? { state: "blocked" as const }
                  : node.ready
                    ? { state: "ready" as const }
                    : {}),
            })),
            mermaid: state.report.mermaid,
            visible_ids: visible,
            ...(state.camera.viewport
              ? { viewport: state.camera.viewport }
              : {}),
            selected_id: state.selected,
            focused_id: state.focused,
            theme: graphTheme(dark),
            reduced_motion: matchMedia("(prefers-reduced-motion: reduce)")
              .matches,
          }
        : null,
    [state, visible, dark],
  );
  if (state.kind === "Closed") return null;
  const report = state.report;
  const root = report?.nodes.find((node) => node.task.id === state.scope.root);
  const task = (id: string) =>
    report?.nodes.find((node) => node.task.id === id)?.task;
  const close = () => {
    clearTimeout(debounce.current);
    controller.close();
  };
  const diagramVisible =
    report !== null && (!compact || diagram) && !state.renderFailure;
  const receive = (reply: GraphHostReply, automaticFit: boolean) => {
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
        controller.setViewport(reply, automaticFit);
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
  const zoom = (factor: number) => {
    if (!state.camera.viewport || !frame.current) return;
    const scale = Math.min(
      4,
      Math.max(0.1, state.camera.viewport.scale * factor),
    );
    const ratio = scale / state.camera.viewport.scale;
    const { clientWidth: width, clientHeight: height } = frame.current;
    controller.setViewport({
      x: width / 2 - (width / 2 - state.camera.viewport.x) * ratio,
      y: height / 2 - (height / 2 - state.camera.viewport.y) * ratio,
      scale,
    });
  };
  const matches = state.searchIds;
  const list = (
    name: string,
    ids: readonly TaskId[],
    section:
      | "shown"
      | "depends-on"
      | "blocks"
      | "lightest-next"
      | "starts-at"
      | "ends-at"
      | "ancestors"
      | "descendants",
  ) => {
    const shown = matches === null ? ids : ids.filter((id) => matches.has(id));
    return (
      <section className="dependency-graph-section" data-section={section}>
        {section !== "shown" && (
          <h3>
            {name} · {ids.length}
          </h3>
        )}
        {shown.length === 0 ? (
          <p className="text-muted-foreground">
            {ids.length > 0 ? "No matching Tasks" : "None"}
          </p>
        ) : (
          <ul>
            {shown.map((id) => {
              const value = task(id);
              return (
                <li key={id}>
                  <Button
                    variant="ghost"
                    data-testid={
                      section === "shown"
                        ? `dependency-graph-task-${id}`
                        : `dependency-graph-related-${section}-${id}`
                    }
                    onClick={() => {
                      if (value) {
                        close();
                        openTask(value);
                      }
                    }}
                  >
                    <DependencyTaskLabel
                      task={value}
                      id={id}
                      projects={projects}
                    />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${value?.title ?? id}`}
                          data-testid={`dependency-graph-actions-${section}-${id}`}
                        />
                      }
                    >
                      <Ellipsis />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() =>
                            void controller.open(
                              { ...state.scope, root: id },
                              request,
                            )
                          }
                        >
                          Show this Task's Dependencies
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!connected}
                          onClick={() => {
                            if (value) {
                              close();
                              addDependency(value);
                            }
                          }}
                        >
                          Add dependency…
                        </DropdownMenuItem>
                        {diagramVisible && (
                          <DropdownMenuItem
                            data-testid={
                              section === "shown"
                                ? `dependency-graph-expand-${id}`
                                : `dependency-graph-expand-related-${section}-${id}`
                            }
                            onClick={() => controller.expand(id)}
                          >
                            Expand in diagram
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };
  const shape =
    report?.shape === "tree"
      ? `${report.orientation} tree`
      : report?.shape === "single"
        ? "Single Task"
        : report?.shape === "chain"
          ? "Chain"
          : "DAG";
  const retry = (
    <Button
      variant="outline"
      disabled={!connected}
      data-testid="dependency-graph-retry"
      onClick={() => {
        void controller.refresh(request);
        setDiagram(true);
      }}
    >
      Retry
    </Button>
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
        <DialogDescription
          className="truncate"
          title={root?.task.title ?? state.scope.root}
        >
          {root?.task.title ?? state.scope.root}
        </DialogDescription>
        {compact && (
          <ToggleGroup
            variant="segment"
            size="sm"
            spacing={0}
            aria-label="Dependency view"
            data-testid="dependency-graph-mode"
            value={[diagram ? "diagram" : "list"]}
            onValueChange={(value) => {
              if (value[0]) setDiagram(value[0] === "diagram");
            }}
          >
            <ToggleGroupItem value="list" data-testid="dependency-graph-list">
              List
            </ToggleGroupItem>
            <ToggleGroupItem value="diagram">Diagram</ToggleGroupItem>
          </ToggleGroup>
        )}
        {report && (
          <div className="dependency-graph-controls">
            {(state.overview ||
              controller.visibleIds({ ...state, overview: false }).length <
                report.nodes.length) && (
              <Button
                variant="outline"
                size="sm"
                data-testid="dependency-graph-overview"
                onClick={() => controller.overview(!state.overview)}
              >
                {state.overview
                  ? "Show nearby Tasks"
                  : `Show all ${countTasks(report.nodes.length, true)}`}
              </Button>
            )}
            <small className="text-muted-foreground">
              {visible.length} of {countTasks(report.nodes.length, true)} shown
            </small>
          </div>
        )}
        {!connected && (
          <p role="status">Offline. The last Dependencies are read-only.</p>
        )}
        {state.loading && <p role="status">Loading Dependencies…</p>}
        <div
          className="dependency-graph-body"
          data-diagram={diagramVisible}
          data-compact={compact}
        >
          {(state.failure || state.renderFailure) && (
            <div className="space-y-2">
              {state.renderFailure ? (
                <Alert role="status">
                  <AlertDescription>
                    Couldn't draw the diagram. The list below is complete.
                    {retry}
                  </AlertDescription>
                </Alert>
              ) : state.failure ? (
                <DependencyErrorStatus
                  failure={state.failure}
                  context="add"
                  tasks={report?.nodes.map((node) => node.task) ?? []}
                  onFindTask={
                    onFindTask
                      ? (details) => {
                          close();
                          onFindTask(details);
                        }
                      : undefined
                  }
                />
              ) : null}
              {!state.renderFailure && retry}
            </div>
          )}
          {diagramVisible && command && (
            <section ref={frame} className="dependency-diagram-region">
              <GraphDiagram
                command={command}
                receive={receive}
                refit={() => controller.refit()}
                automaticFit={state.camera.kind !== "Manual"}
              />
              <fieldset
                className="dependency-diagram-tools"
                aria-label="Diagram controls"
              >
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Zoom in"
                  disabled={!state.camera.viewport}
                  onClick={() => zoom(1.2)}
                >
                  <ZoomIn />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Zoom out"
                  disabled={!state.camera.viewport}
                  onClick={() => zoom(1 / 1.2)}
                >
                  <ZoomOut />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Reset diagram"
                  data-testid="dependency-graph-reset"
                  onClick={() => {
                    controller.reset();
                    frame.current?.querySelector("iframe")?.focus();
                  }}
                >
                  <RotateCcw />
                </Button>
              </fieldset>
            </section>
          )}
          {report && (!compact || !diagramVisible) && (
            <div
              className="dependency-graph-native"
              data-testid="dependency-graph-details"
            >
              {visible.length > 10 && (
                <Field>
                  <Input
                    key={state.generation}
                    aria-label="Search these Tasks"
                    placeholder="Search these Tasks"
                    defaultValue={state.query}
                    onChange={(event) => {
                      setShowDiagramTasks(true);
                      const query = event.target.value;
                      clearTimeout(debounce.current);
                      debounce.current = setTimeout(
                        () => void controller.find(query, request),
                        250,
                      );
                    }}
                  />
                </Field>
              )}
              {report.nodes.length > 50 && (
                <p className="text-muted-foreground">
                  Use the list and search to choose a Task.
                </p>
              )}
              {state.searchFailure && (
                <DependencySearchStatus
                  failure={state.searchFailure}
                  appliedQuery={state.appliedQuery}
                />
              )}
              {list(
                "Depends on",
                report.edges
                  .filter((edge) => edge.dependent_id === state.scope.root)
                  .map((edge) => edge.blocker_id),
                "depends-on",
              )}
              {list(
                "Blocks",
                report.edges
                  .filter((edge) => edge.blocker_id === state.scope.root)
                  .map((edge) => edge.dependent_id),
                "blocks",
              )}
              {list("Lightest next", report.lightest_next, "lightest-next")}
              {root && (
                <p>
                  Energy left: {root.remaining_energy.energy}
                  {root.remaining_energy.unweighted > 0 &&
                    ` · ${countTasks(root.remaining_energy.unweighted, true)} without Energy`}
                </p>
              )}
              <Collapsible>
                <CollapsibleTrigger render={<Button variant="ghost" />}>
                  <ChevronDown data-icon="inline-start" />
                  Graph details
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <section className="dependency-graph-section">
                    <dl>
                      <dt>Shape</dt>
                      <dd>{shape}</dd>
                      <dt>Depth</dt>
                      <dd>{root?.depth ?? 0}</dd>
                      <dt>Direct Dependencies</dt>
                      <dd>{root?.in_degree ?? 0}</dd>
                      <dt>Tasks blocked</dt>
                      <dd>{root?.out_degree ?? 0}</dd>
                    </dl>
                  </section>
                  {list("Starts at", report.sources, "starts-at")}
                  {list("Ends at", report.sinks, "ends-at")}
                  {list("Ancestors", report.ancestors, "ancestors")}
                  {list("Descendants", report.descendants, "descendants")}
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
                    {copied ? "Copied Mermaid" : "Copy as Mermaid"}
                  </Button>
                </CollapsibleContent>
              </Collapsible>
              <Collapsible
                open={showDiagramTasks}
                onOpenChange={setShowDiagramTasks}
              >
                <CollapsibleTrigger render={<Button variant="ghost" />}>
                  Tasks in diagram · {visible.length}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {list("Tasks in diagram", visible, "shown")}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
        <DialogFooter>
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
