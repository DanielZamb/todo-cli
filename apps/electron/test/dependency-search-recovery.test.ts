import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { DependencyBatchController } from "../src/dependency-batch-state.ts";
import { DependencyGraphController } from "../src/dependency-graph-state.ts";
import { DependencyController } from "../src/dependency-state.ts";
import { Reply, type Request } from "../src/protocol.ts";
import { dependencyGraph, dependencyTask } from "./fixtures/dependencies.ts";
import { dependencyRefusals } from "./fixtures/dependency-errors.ts";

const graph = dependencyGraph();
const scope = { profile: graph.profile_id, root: graph.task_id };
const broad: Extract<Reply, { _tag: "error" }> = {
  _tag: "error",
  code: "search_too_broad",
  message:
    "Search is too broad. Narrow the search with a Project, Tag or Status filter, use fewer or shorter words, or quote a phrase.\nerror 2 - validation or usage",
};
const refusal = Schema.decodeUnknownSync(Reply)({
  _tag: "error",
  message: "This Dependency would create a loop.",
  dependency: dependencyRefusals[0]?.error,
  exit_detail: "error 2 - validation or usage",
});
const reads = async (request: Request): Promise<Reply> =>
  request._tag === "graph"
    ? { _tag: "graph", report: graph }
    : { _tag: "dependencyCandidates", tasks: [dependencyTask("other")] };
it("picker search success and clear preserve the attempted mutation refusal", async () => {
  const controller = new DependencyController();
  await controller.open(scope, reads);
  await controller.toggle(
    dependencyTask("other").id,
    true,
    async () => refusal,
  );
  await controller.find("other", reads);
  expect(controller.snapshot()).toMatchObject({
    failure: refusal,
    attempted: { id: "other" },
  });
  await controller.find("", reads);
  expect(controller.snapshot()).toMatchObject({
    failure: refusal,
    attempted: { id: "other" },
  });
});
it("picker broad-search recovery preserves Conflict and its explicit Reload gate", async () => {
  const controller = new DependencyController();
  await controller.open(scope, reads);
  const conflict: Extract<Reply, { _tag: "conflict" }> = {
    _tag: "conflict",
    latest: dependencyTask("root", 2),
    exit_detail: "error 4 - Conflict",
  };
  await controller.toggle(
    dependencyTask("other").id,
    true,
    async () => conflict,
  );
  await controller.find("broad", async () => broad);
  await controller.find("other", reads);
  await controller.find("", reads);
  expect(controller.snapshot()).toMatchObject({ failure: conflict });
  let writes = 0;
  await controller.toggle(dependencyTask("other").id, true, async () => {
    writes++;
    return refusal;
  });
  expect(writes).toBe(0);
});
for (const client of ["picker", "graph"] as const) {
  it(`${client} clears only the current search notice after narrower success and empty query`, async () => {
    const controller =
      client === "picker"
        ? new DependencyController()
        : new DependencyGraphController();
    await controller.open(scope, reads);
    await controller.find("broad", async () => broad);
    expect(controller.snapshot()).toMatchObject({ searchFailure: broad });
    await controller.find("other", reads);
    expect(controller.snapshot()).toMatchObject({
      query: "other",
      searchFailure: null,
    });
    await controller.find("broad", async () => broad);
    await controller.find("", reads);
    expect(controller.snapshot()).toMatchObject({
      query: "",
      searchFailure: null,
    });
  });
  it(`${client} rejects a delayed older search error after a newer success and clear`, async () => {
    const controller =
      client === "picker"
        ? new DependencyController()
        : new DependencyGraphController();
    await controller.open(scope, reads);
    let release: (reply: Reply) => void = () => {
      throw Error("No delayed request");
    };
    const old = controller.find(
      "old broad",
      () =>
        new Promise<Reply>((done) => {
          release = done;
        }),
    );
    await controller.find("other", reads);
    await controller.find("", reads);
    release(broad);
    await old;
    expect(controller.snapshot()).toMatchObject({
      query: "",
      searchFailure: null,
    });
  });
}
it("graph query success and clear preserve an independent graph read failure", async () => {
  const controller = new DependencyGraphController();
  await controller.open(scope, reads);
  const failure: Extract<Reply, { _tag: "error" }> = {
    _tag: "error",
    message: "Couldn't load Dependencies. Try again when connected.",
  };
  await controller.refresh(async () => failure);
  await controller.find("broad", async () => broad);
  await controller.find("other", reads);
  await controller.find("", reads);
  expect(controller.snapshot()).toMatchObject({ failure, searchFailure: null });
});
it("picker and graph search recovery leave a reviewed batch report unchanged", async () => {
  const batch = new DependencyBatchController();
  batch.open(dependencyTask("root"), "dependsOn");
  batch.select([dependencyTask("other")]);
  await batch.preview(async (request) =>
    request._tag === "graph"
      ? { _tag: "graph", report: graph }
      : Schema.decodeUnknownSync(Reply)({
          _tag: "batchDepend",
          report: {
            generated_at: "2026-11-09T00:00:00Z",
            dry_run: true,
            results: [
              { index: 0, exit_code: 2, error: dependencyRefusals[0]?.error },
            ],
          },
        }),
  );
  const before = batch.snapshot();
  expect(before).toMatchObject({
    report: { dry_run: true, results: [{ index: 0, exit_code: 2 }] },
  });
  for (const controller of [
    new DependencyController(),
    new DependencyGraphController(),
  ]) {
    await controller.open(scope, reads);
    await controller.find("broad", async () => broad);
    await controller.find("other", reads);
    await controller.find("", reads);
  }
  expect(batch.snapshot()).toEqual(before);
});
