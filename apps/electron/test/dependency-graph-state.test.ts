import { expect, it } from "@effect/vitest";
import { DependencyGraphController } from "../src/dependency-graph-state.ts";
import type { Reply } from "../src/protocol.ts";
import { dependencyGraph, dependencyTask } from "./fixtures/dependencies.ts";

const graph = dependencyGraph();
const scope = { profile: graph.profile_id, root: graph.task_id };
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
    viewport: { x: 37, y: -19, scale: 1.5 },
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
    viewport: { x: 37, y: -19, scale: 1.5 },
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
