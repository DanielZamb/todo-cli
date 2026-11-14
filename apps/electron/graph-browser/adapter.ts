import { register, render } from "pele/core";
import flowchart from "pele/diagrams/flowchart";
import type {
  GraphHostRender,
  GraphHostReply,
  GraphViewport,
} from "./protocol.ts";
import { graphNodeAccessibleName } from "./protocol.ts";

register(flowchart);
const fallbacks = {
  ink: "#161D19",
  paper: "#F7F8F5",
  card: "#FFFFFF",
  border: "#7B897E",
  "muted-text": "#546359",
  primary: "#285D46",
  "on-primary": "#FFFFFF",
  accent: "#E8EDE7",
  warning: "#76550B",
  danger: "#AF302D",
};
const variables = {
  ink: "--pele-fg",
  paper: "--pele-bg",
  card: "--pele-surface",
  border: "--pele-border",
  "muted-text": "--pele-muted",
  primary: "--pele-accent",
  "on-primary": "--graph-on-primary",
  accent: "--pele-surface-alt",
  warning: "--pele-critical",
  danger: "--pele-error",
};
export function fitGraphViewport(
  bounds: { x: number; y: number; width: number; height: number },
  frame: { width: number; height: number },
): GraphViewport {
  const scale = Math.max(
    0.01,
    Math.min(
      1,
      Math.max(1, frame.width - 32) / Math.max(1, bounds.width),
      Math.max(1, frame.height - 32) / Math.max(1, bounds.height),
    ),
  );
  return {
    x: (frame.width - bounds.width * scale) / 2 - bounds.x * scale,
    y: (frame.height - bounds.height * scale) / 2 - bounds.y * scale,
    scale,
  };
}
export class GraphBrowserAdapter {
  private message: GraphHostRender | null = null;
  private viewport: GraphViewport = { x: 0, y: 0, scale: 1 };
  private drag: {
    pointer: number;
    x: number;
    y: number;
    viewport: GraphViewport;
  } | null = null;
  private content = document.createElement("div");
  private events = new AbortController();
  private focused: HTMLElement | SVGElement | null = null;
  private observer: MutationObserver;
  constructor(
    private readonly root: HTMLElement,
    private readonly send: (reply: GraphHostReply) => void,
  ) {
    this.content.className = "graph-content";
    root.replaceChildren(this.content);
    root.tabIndex = 0;
    root.setAttribute("aria-label", "Dependency diagram");
    const signal = this.events.signal;
    root.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15);
      },
      { passive: false, signal },
    );
    root.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0) return;
        this.drag = {
          pointer: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          viewport: this.viewport,
        };
        root.setPointerCapture(event.pointerId);
      },
      { signal },
    );
    root.addEventListener(
      "pointermove",
      (event) => {
        const drag = this.drag;
        if (!drag || drag.pointer !== event.pointerId) return;
        this.viewport = {
          ...drag.viewport,
          x: drag.viewport.x + event.clientX - drag.x,
          y: drag.viewport.y + event.clientY - drag.y,
        };
        this.applyViewport();
      },
      { signal },
    );
    root.addEventListener(
      "pointerup",
      () => {
        this.drag = null;
        this.changedViewport();
      },
      { signal },
    );
    root.addEventListener(
      "pointercancel",
      () => {
        this.drag = null;
      },
      { signal },
    );
    root.addEventListener(
      "focusin",
      (event) => {
        if (
          event.target instanceof HTMLElement ||
          event.target instanceof SVGElement
        )
          this.focused = event.target;
      },
      { signal },
    );
    this.observer = new MutationObserver(() => this.returnFocus());
    this.observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "disabled", "style", "class"],
    });
  }
  draw(message: GraphHostRender) {
    const hadFocus = this.root.contains(document.activeElement);
    this.message = message;
    this.send({ v: 1, type: "ready", identity: message.identity });
    try {
      for (const key of Object.keys(variables)) {
        const value =
          Reflect.get(message.theme.tokens, key) ?? Reflect.get(fallbacks, key);
        const variable = Reflect.get(variables, key);
        if (
          typeof value === "string" &&
          typeof variable === "string" &&
          CSS.supports("color", value)
        )
          this.root.style.setProperty(variable, value);
      }
      this.root.style.setProperty(
        "--pele-line",
        this.root.style.getPropertyValue("--pele-muted"),
      );
      this.root.dataset.mode = message.theme.mode;
      this.root.dataset.reducedMotion = String(message.reduced_motion);
      const result = render(message.mermaid, {
        fontFamily: "system-ui",
        fontSize: 14,
        responsive: false,
        images: false,
        links: false,
      });
      this.content.innerHTML = result.svg;
      const map = new Map(message.nodes.map((node) => [node.mermaid_id, node]));
      const visible = new Set(message.visible_ids);
      const visibleMermaid = new Set(
        message.nodes
          .filter((node) => visible.has(node.task_id))
          .map((node) => node.mermaid_id),
      );
      let nodeCount = 0;
      for (const node of this.content.querySelectorAll<SVGElement>(
        ".pele-node",
      )) {
        const mapped = map.get(node.dataset.id ?? "");
        if (!mapped) throw new Error("Pele returned an unknown Task identity");
        const id = mapped.task_id;
        node.classList.toggle("graph-hidden", !visible.has(id));
        if (!visible.has(id)) continue;
        nodeCount++;
        node.tabIndex = 0;
        node.dataset.taskId = id;
        node.dataset.selected = String(message.selected_id === id);
        node.dataset.root = String(message.root_id === id);
        if (mapped.state) node.dataset.state = mapped.state;
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", graphNodeAccessibleName(mapped));
        node.addEventListener("pointerdown", (event) =>
          event.stopPropagation(),
        );
        node.addEventListener("click", (event) => {
          event.preventDefault();
          this.emitTask("activate", id);
        });
        node.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          this.emitTask("context", id);
        });
        node.addEventListener("focus", () => this.emitTask("focus", id));
        node.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.emitTask("activate", id);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            this.emitTask("expand", id);
          }
          if (
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          ) {
            event.preventDefault();
            this.emitTask("context", id);
          }
        });
      }
      for (const edge of this.content.querySelectorAll<SVGElement>(
        ".pele-edge",
      )) {
        const endpoints = /^L_(n[0-9]+)_(n[0-9]+)_[0-9]+$/u.exec(
          edge.dataset.id ?? "",
        );
        edge.classList.toggle(
          "graph-hidden",
          !endpoints ||
            !visibleMermaid.has(endpoints[1] ?? "") ||
            !visibleMermaid.has(endpoints[2] ?? ""),
        );
      }
      this.viewport = message.viewport ?? this.fittedViewport();
      this.applyViewport();
      if (!message.viewport) this.changedViewport();
      if (hadFocus) this.focus(message.focused_id);
      this.send({
        v: 1,
        type: "rendered",
        identity: message.identity,
        node_count: nodeCount,
      });
    } catch {
      this.content.replaceChildren();
      this.send({
        v: 1,
        type: "renderError",
        identity: message.identity,
        message: "Couldn't draw Dependencies. Use the Task list or Retry.",
      });
    }
  }
  focus(id: string | null) {
    const node = [
      ...this.content.querySelectorAll<SVGElement>("[data-task-id]"),
    ].find(
      (node) =>
        node.dataset.taskId === id && !node.classList.contains("graph-hidden"),
    );
    (node ?? this.root).focus({ preventScroll: true });
  }
  returnFocus() {
    const focused = this.focused;
    if (
      !focused ||
      (focused.isConnected &&
        !(focused instanceof HTMLElement && focused.hidden) &&
        !focused.matches(":disabled") &&
        getComputedStyle(focused).display !== "none")
    )
      return;
    this.focus(this.message?.focused_id ?? null);
  }
  zoom(factor: number) {
    const scale = Math.min(4, Math.max(0.1, this.viewport.scale * factor));
    const ratio = scale / this.viewport.scale;
    this.viewport = {
      x:
        this.root.clientWidth / 2 -
        (this.root.clientWidth / 2 - this.viewport.x) * ratio,
      y:
        this.root.clientHeight / 2 -
        (this.root.clientHeight / 2 - this.viewport.y) * ratio,
      scale,
    };
    this.applyViewport();
    this.changedViewport();
  }
  reset() {
    this.viewport = this.fittedViewport();
    this.applyViewport();
    this.changedViewport();
    this.returnFocus();
  }
  dispose() {
    this.events.abort();
    this.observer.disconnect();
    this.message = null;
    this.root.replaceChildren();
  }
  private emitTask(
    type: "activate" | "context" | "focus" | "expand",
    task_id: string,
  ) {
    if (this.message)
      this.send({ v: 1, type, identity: this.message.identity, task_id });
  }
  private fittedViewport(): GraphViewport {
    this.content.style.transform = "none";
    const frame = this.root.getBoundingClientRect();
    const boxes = [
      ...this.content.querySelectorAll<SVGElement>(
        ".pele-node:not(.graph-hidden), .pele-edge:not(.graph-hidden)",
      ),
    ].map((element) => element.getBoundingClientRect());
    if (boxes.length === 0) return { x: 0, y: 0, scale: 1 };
    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    return fitGraphViewport(
      {
        x: left - frame.left,
        y: top - frame.top,
        width: Math.max(...boxes.map((box) => box.right)) - left,
        height: Math.max(...boxes.map((box) => box.bottom)) - top,
      },
      frame,
    );
  }
  private applyViewport() {
    this.content.style.transform = `translate(${this.viewport.x}px, ${this.viewport.y}px) scale(${this.viewport.scale})`;
  }
  private changedViewport() {
    if (this.message)
      this.send({
        v: 1,
        type: "viewport",
        identity: this.message.identity,
        ...this.viewport,
      });
  }
}
