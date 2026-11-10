import { expect, it } from "@effect/vitest";
import { DependencyGraphController } from "../src/dependency-graph-state.ts";
import type { Reply } from "../src/protocol.ts";
import { dependencyGraph, dependencyTask } from "./fixtures/dependencies.ts";

const graph = dependencyGraph();
const scope = { profile: graph.profile_id, root: graph.task_id };
it("keeps a person's camera through a frame resize until Reset", async () => {
  const controller = new DependencyGraphController();
  await controller.open(scope, async () => ({ _tag: "graph", report: graph }));
  controller.setViewport({ x: 37, y: -19, scale: 1.5 });
  controller.refit();
  expect(controller.snapshot()).toMatchObject({
    camera: { kind: "Manual", viewport: { x: 37, y: -19, scale: 1.5 } },
  });
  controller.setViewport({ x: 10, y: 20, scale: 0.5 }, true);
  expect(controller.snapshot()).toMatchObject({
    camera: { kind: "Manual", viewport: { x: 37, y: -19, scale: 1.5 } },
  });
  controller.reset();
  expect(controller.snapshot()).toMatchObject({
    camera: { kind: "FitPending", viewport: null },
  });
  controller.setViewport({ x: 10, y: 20, scale: 0.5 }, true);
  expect(controller.snapshot()).toMatchObject({
    camera: { kind: "Fitted", viewport: { x: 10, y: 20, scale: 0.5 } },
  });
  expect(controller.refit()).toBe(true);
  expect(controller.snapshot()).toMatchObject({
    camera: { kind: "FitPending", viewport: null },
  });
});
for (const failure of [
  {
    _tag: "error",
    code: "not_found",
    message: "Task not found.",
    exit_detail: "error 3 - not found or auth missing",
  },
  {
    _tag: "error",
    message: "Task not found in Work.",
    exit_detail: "error 3 - not found or auth missing",
    details: {
      profile: { id: scope.profile, name: "Work" },
      task_id: scope.root,
      recovery: "agent recovery must not be shown",
    },
  },
] satisfies Reply[])
  it("clears a removed root's stale diagram and scoped display state", async () => {
    const controller = new DependencyGraphController();
    await controller.open(scope, async () => ({
      _tag: "graph",
      report: graph,
    }));
    controller.setViewport({ x: 37, y: -19, scale: 1.5 });
    controller.select(dependencyTask("linked").id);
    controller.focus(dependencyTask("linked").id);
    controller.expand(dependencyTask("linked").id);
    await controller.refresh(async () => failure);
    expect(controller.snapshot()).toMatchObject({
      report: null,
      camera: { kind: "FitPending", viewport: null },
      focused: null,
      selected: "root",
      failure,
    });
    expect(controller.visibleIds()).toEqual([]);
  });
it("rejects a graph report without its root", async () => {
  const controller = new DependencyGraphController();
  await controller.open(scope, async () => ({
    _tag: "graph",
    report: {
      ...graph,
      nodes: graph.nodes.filter((node) => node.task.id !== scope.root),
    },
  }));
  expect(controller.snapshot()).toMatchObject({
    report: null,
    failure: { message: "Todo returned an incompatible Dependency graph." },
  });
});
it("omits the initial camera, stores a resolved camera and refits a new layout without losing focus", async () => {
  const controller = new DependencyGraphController();
  await controller.open(scope, async () => ({ _tag: "graph", report: graph }));
  expect(controller.snapshot()).toMatchObject({
    camera: { kind: "FitPending", viewport: null },
  });
  controller.setViewport({ x: 12, y: 13, scale: 0.5 }, true);
  controller.focus(dependencyTask("linked").id);
  controller.refit();
  expect(controller.snapshot()).toMatchObject({
    camera: { kind: "FitPending", viewport: null },
    focused: "linked",
  });
});
it("uses the Profile server search and discards late results after closing the graph", async () => {
  const controller = new DependencyGraphController();
  await controller.open(scope, async () => ({ _tag: "graph", report: graph }));
  const requests: unknown[] = [];
  await controller.find("contract", async (request) => {
    requests.push(request);
    return { _tag: "dependencyCandidates", tasks: [dependencyTask("linked")] };
  });
  expect(requests).toEqual([
    {
      _tag: "dependencyCandidates",
      profile: "work",
      filters: { text: "contract" },
    },
  ]);
  const state = controller.snapshot();
  expect(state.kind === "Open" && [...(state.searchIds ?? [])]).toEqual([
    "linked",
  ]);
  let finish: (reply: Reply) => void = () => {
    throw new Error("not waiting");
  };
  const waiting = controller.find(
    "late",
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  controller.close();
  finish({ _tag: "dependencyCandidates", tasks: [dependencyTask("other")] });
  await waiting;
  expect(controller.snapshot()).toEqual({ kind: "Closed" });
});
it("starts with direct neighbours and makes overview explicit and reversible without recomputing graph metrics", async () => {
  const controller = new DependencyGraphController();
  await controller.open(scope, async () => ({ _tag: "graph", report: graph }));
  expect(controller.visibleIds()).toEqual(["linked", "root"]);
  controller.overview(true);
  expect(controller.visibleIds()).toEqual(["linked", "root", "other"]);
  controller.overview(false);
  expect(controller.visibleIds()).toEqual(["linked", "root"]);
});
it("preserves surviving viewport, selection, focus and expansion through SSE replacement", async () => {
  const controller = new DependencyGraphController();
  await controller.open(scope, async () => ({ _tag: "graph", report: graph }));
  controller.setViewport({ x: 37, y: -19, scale: 1.5 });
  controller.select(dependencyTask("linked").id);
  controller.focus(dependencyTask("linked").id);
  controller.expand(dependencyTask("linked").id);
  await controller.refresh(async () => ({
    _tag: "graph",
    report: dependencyGraph(2),
  }));
  expect(controller.snapshot()).toMatchObject({
    selected: "linked",
    focused: "linked",
    camera: { kind: "Manual", viewport: { x: 37, y: -19, scale: 1.5 } },
  });
  const state = controller.snapshot();
  expect(state.kind === "Open" && [...state.expanded]).toEqual(["linked"]);
  await controller.refresh(async () => ({
    _tag: "graph",
    report: {
      ...graph,
      nodes: graph.nodes.filter((node) => node.task.id !== "linked"),
    },
  }));
  expect(controller.snapshot()).toMatchObject({
    selected: "root",
    focused: "root",
    camera: { kind: "Manual", viewport: { x: 37, y: -19, scale: 1.5 } },
  });
});
for (const late of [
  { _tag: "graph", report: graph },
  { _tag: "error", message: "obsolete private error" },
] satisfies Reply[])
  it(`discards obsolete graph ${late._tag} after auth/Profile/root invalidation`, async () => {
    const controller = new DependencyGraphController();
    let finish: (reply: Reply) => void = () => {
      throw new Error("not waiting");
    };
    const waiting = new Promise<Reply>((done) => {
      finish = done;
    });
    const request = controller.open(scope, () => waiting);
    controller.close();
    finish(late);
    await request;
    expect(controller.snapshot()).toEqual({ kind: "Closed" });
  });
