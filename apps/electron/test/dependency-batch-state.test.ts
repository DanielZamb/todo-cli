import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { DependencyBatchController } from "../src/dependency-batch-state.ts";
import { Reply, type Request } from "../src/protocol.ts";
import { dependencyGraph, dependencyTask } from "./fixtures/dependencies.ts";
import { dependencyRefusals } from "./fixtures/dependency-errors.ts";

const root = dependencyTask("root");
it("treats a missing root inside a graph response as compatibility failure and sends no batch", async () => {
  const controller = new DependencyBatchController();
  controller.open(root, "dependsOn");
  controller.select([dependencyTask("other")]);
  const graph = dependencyGraph();
  const calls: Request[] = [];
  await controller.preview(async (request) => {
    calls.push(request);
    return {
      _tag: "graph",
      report: {
        ...graph,
        nodes: graph.nodes.filter((node) => node.task.id !== root.id),
      },
    };
  });
  expect(calls.map((request) => request._tag)).toEqual(["graph"]);
  expect(controller.snapshot()).toMatchObject({
    failure: {
      _tag: "error",
      message: "Todo returned an incompatible Dependency graph.",
    },
    report: null,
  });
});
const edge = (
  index: number,
  dependent: string,
  blocker: string,
  outcome = "added",
) => ({
  index,
  result: {
    generated_at: "2026-11-09T00:00:00Z",
    outcome,
    dependent_id: dependent,
    blocker_id: blocker,
    from_version: 1,
    to_version: outcome === "unchanged" ? 1 : 2,
    seq: outcome === "unchanged" ? null : 10,
    warnings: [],
  },
});
const report = (dry_run: boolean, results: readonly unknown[]) =>
  Schema.decodeUnknownSync(Reply)({
    _tag: "batchDepend",
    report: { generated_at: "2026-11-09T00:00:00Z", dry_run, results },
  });
it("previews once through the shared command and applies the reviewed items without advancing an editor", async () => {
  const controller = new DependencyBatchController();
  controller.open(root, "dependsOn");
  controller.select([dependencyTask("linked"), dependencyTask("other")]);
  const calls: Request[] = [];
  const request = async (input: Request): Promise<Reply> => {
    calls.push(input);
    return input._tag === "graph"
      ? { _tag: "graph", report: dependencyGraph() }
      : report(input._tag === "batchDepend" && input.payload.dry_run === true, [
          edge(0, "root", "linked", "unchanged"),
          edge(1, "root", "other"),
        ]);
  };
  await controller.preview(request);
  expect(calls[1]).toEqual({
    _tag: "batchDepend",
    profile: "work",
    payload: {
      dry_run: true,
      items: [
        {
          action: "depend",
          dependent_id: "root",
          blocker_id: "linked",
          from_version: 1,
        },
        {
          action: "depend",
          dependent_id: "root",
          blocker_id: "other",
          from_version: 1,
        },
      ],
    },
  });
  expect(await controller.apply(request)).toBe(true);
  expect(calls[2]).toEqual({
    ...calls[1],
    payload: {
      dry_run: false,
      items: [
        {
          action: "depend",
          dependent_id: "root",
          blocker_id: "linked",
          from_version: 1,
        },
        {
          action: "depend",
          dependent_id: "root",
          blocker_id: "other",
          from_version: 1,
        },
      ],
    },
  });
});
it("uses the chosen dependent's Version for a Blocks batch", async () => {
  const controller = new DependencyBatchController();
  controller.open(root, "blocks");
  controller.select([dependencyTask("candidate", 7)]);
  let batch: Request | null = null;
  await controller.preview(async (input) => {
    if (input._tag === "graph")
      return { _tag: "graph", report: dependencyGraph() };
    batch = input;
    return report(true, [edge(0, "candidate", "root")]);
  });
  expect(batch).toEqual({
    _tag: "batchDepend",
    profile: "work",
    payload: {
      dry_run: true,
      items: [
        {
          action: "depend",
          dependent_id: "candidate",
          blocker_id: "root",
          from_version: 7,
        },
      ],
    },
  });
});
it("uses the server's refused preview result when Reload rebuilds Versions for one dependent", async () => {
  const controller = new DependencyBatchController();
  controller.open(root, "dependsOn");
  controller.select([dependencyTask("refused"), dependencyTask("other")]);
  const blocked = dependencyRefusals.find(
    (fixture) => fixture.error.code === "blocked",
  );
  if (!blocked) throw new Error("Missing blocked fixture");
  const refused = { index: 0, exit_code: 2, error: blocked.error };
  await controller.preview(async (input) =>
    input._tag === "graph"
      ? { _tag: "graph", report: dependencyGraph() }
      : report(true, [
          refused,
          {
            index: 1,
            exit_code: 4,
            error: {
              generated_at: "2026-11-09T00:00:00Z",
              code: "conflict",
              message: "AGENT ONLY stale Version",
              exit_code: 4,
              exit_meaning: "Conflict",
              details: { current_version: 1 },
            },
          },
        ]),
  );
  expect(controller.snapshot()).toMatchObject({ needsReload: true });
  const requests: Request[] = [];
  await controller.preview(async (input) => {
    requests.push(input);
    return input._tag === "graph"
      ? { _tag: "graph", report: dependencyGraph() }
      : report(true, [refused, edge(1, "root", "other")]);
  });
  expect(requests[1]).toEqual({
    _tag: "batchDepend",
    profile: "work",
    payload: {
      dry_run: true,
      items: [
        {
          action: "depend",
          dependent_id: "root",
          blocker_id: "refused",
          from_version: 1,
        },
        {
          action: "depend",
          dependent_id: "root",
          blocker_id: "other",
          from_version: 1,
        },
      ],
    },
  });
});
it("requires Reload after a Conflict or an SSE change before Apply", async () => {
  const controller = new DependencyBatchController();
  controller.open(root, "dependsOn");
  controller.select([dependencyTask("other")]);
  await controller.preview(async (input) =>
    input._tag === "graph"
      ? { _tag: "graph", report: dependencyGraph() }
      : report(true, [
          {
            index: 0,
            exit_code: 4,
            error: {
              generated_at: "2026-11-09T00:00:00Z",
              code: "conflict",
              message: "unsafe recovery",
              exit_code: 4,
              exit_meaning: "Conflict",
              details: { current_version: 2 },
            },
          },
        ]),
  );
  let writes = 0;
  const apply = async (): Promise<Reply> => {
    writes++;
    return report(false, [edge(0, "root", "other")]);
  };
  expect(await controller.apply(apply)).toBe(false);
  expect(writes).toBe(0);
  await controller.preview(async (input) =>
    input._tag === "graph"
      ? { _tag: "graph", report: dependencyGraph(2) }
      : report(true, [edge(0, "root", "other")]),
  );
  controller.changed();
  expect(await controller.apply(apply)).toBe(false);
  expect(writes).toBe(0);
});
it("drops a closed batch's late error and refuses a mismatched result row", async () => {
  const controller = new DependencyBatchController();
  controller.open(root, "dependsOn");
  controller.select([dependencyTask("other")]);
  let finish: (reply: Reply) => void = () => {
    throw new Error("not waiting");
  };
  const pending = controller.preview(
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  controller.close();
  finish({ _tag: "error", message: "obsolete private refusal" });
  await pending;
  expect(controller.snapshot()).toEqual({ kind: "Closed" });
  controller.open(root, "dependsOn");
  controller.select([dependencyTask("other")]);
  await controller.preview(async (input) =>
    input._tag === "graph"
      ? { _tag: "graph", report: dependencyGraph() }
      : report(true, [edge(0, "foreign", "other")]),
  );
  expect(controller.snapshot()).toMatchObject({
    report: null,
    failure: {
      _tag: "error",
      message: "Todo returned an incompatible Dependency batch report.",
    },
  });
});
