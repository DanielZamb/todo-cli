import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { DependencyDeleteController } from "../src/dependency-delete-state.ts";
import {
  DependencyController,
  type DependencyDirection,
} from "../src/dependency-state.ts";
import { Reply, type Request } from "../src/protocol.ts";
import { dependencyGraph, dependencyTask } from "./fixtures/dependencies.ts";

const root = dependencyTask("root");
const candidate = dependencyTask("candidate", 7);
const scope = { profile: root.profile_id, root: root.id };

for (const direction of ["dependsOn", "blocks"] satisfies DependencyDirection[])
  it(`keeps ${direction} Conflict recovery scoped through direction and dismiss until explicit Reload`, async () => {
    const controller = new DependencyController();
    const writes: Request[] = [];
    let candidateVersion = 7;
    const dependent = direction === "dependsOn" ? root : candidate;
    const failure: Extract<Reply, { _tag: "conflict" }> = {
      _tag: "conflict",
      latest: dependencyTask(dependent.id, dependent.row_version + 1),
      exit_detail: "error 4 - Conflict",
    };
    const request = async (input: Request): Promise<Reply> => {
      if (input._tag === "graph")
        return { _tag: "graph", report: dependencyGraph() };
      if (input._tag === "dependencyCandidates")
        return {
          _tag: "dependencyCandidates",
          tasks: [dependencyTask("candidate", candidateVersion)],
        };
      writes.push(input);
      return failure;
    };
    await controller.open(scope, request, direction);
    await controller.toggle(candidate.id, true, request);
    expect(writes).toEqual([
      {
        _tag: "depend",
        profile: "work",
        task: direction === "dependsOn" ? "root" : "candidate",
        payload: {
          blocker_id: direction === "dependsOn" ? "candidate" : "root",
          from_version: direction === "dependsOn" ? 1 : 7,
        },
      },
    ]);
    controller.direction(direction === "dependsOn" ? "blocks" : "dependsOn");
    const opposite = controller.snapshot();
    expect(opposite.kind).toBe("Open");
    if (opposite.kind !== "Open") throw new Error("Picker closed");
    expect(opposite.failure).toBeNull();
    for (const { task } of controller.choices())
      expect(
        opposite.conflicts.has(
          opposite.direction === "dependsOn" ? opposite.scope.root : task.id,
        ),
      ).toBe(false);
    controller.direction(direction);
    controller.dismissFailure();
    expect(controller.snapshot()).toMatchObject({
      kind: "Open",
      failure,
      attempted: candidate,
    });
    await controller.toggle(candidate.id, true, request);
    expect(writes).toHaveLength(1);
    candidateVersion = 8;
    await controller.reload(request);
    expect(controller.snapshot()).toMatchObject({ failure: null });
    expect(writes).toHaveLength(1);
    await controller.toggle(candidate.id, true, request);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toMatchObject({
      task: direction === "dependsOn" ? "root" : "candidate",
      payload: { from_version: direction === "dependsOn" ? 1 : 8 },
    });
  });

it("keeps the Conflict lock and Reload notice when candidate refresh fails", async () => {
  const controller = new DependencyController();
  await controller.open(scope, async (input) =>
    input._tag === "graph"
      ? { _tag: "graph", report: dependencyGraph() }
      : { _tag: "dependencyCandidates", tasks: [candidate] },
  );
  const failure: Extract<Reply, { _tag: "conflict" }> = {
    _tag: "conflict",
    latest: dependencyTask("root", 2),
    exit_detail: "error 4 - Conflict",
  };
  await controller.toggle(candidate.id, true, async () => failure);
  await controller.reload(async () => ({ _tag: "error", message: "offline" }));
  expect(controller.snapshot()).toMatchObject({ failure, loading: false });
  const state = controller.snapshot();
  if (state.kind !== "Open") throw new Error("Picker closed");
  expect(state.conflicts.has(root.id)).toBe(true);
});

it("keeps a Blocks candidate's Conflict when another dependent succeeds", async () => {
  const controller = new DependencyController();
  const other = dependencyTask("second", 9);
  const writes: Request[] = [];
  const failure: Extract<Reply, { _tag: "conflict" }> = {
    _tag: "conflict",
    latest: dependencyTask("candidate", 8),
    exit_detail: "error 4 - Conflict",
  };
  const request = async (input: Request): Promise<Reply> => {
    if (input._tag === "graph")
      return { _tag: "graph", report: dependencyGraph() };
    if (input._tag === "dependencyCandidates")
      return { _tag: "dependencyCandidates", tasks: [candidate, other] };
    writes.push(input);
    if (input._tag === "depend" && input.task === candidate.id) return failure;
    return Schema.decodeUnknownSync(Reply)({
      _tag: "edge",
      report: {
        generated_at: "2026-11-10T00:00:00Z",
        outcome: "unchanged",
        dependent_id: other.id,
        blocker_id: root.id,
        from_version: 9,
        to_version: 9,
        warnings: [],
      },
    });
  };
  await controller.open(scope, request, "blocks");
  await controller.toggle(candidate.id, true, request);
  await controller.toggle(other.id, true, request);
  controller.dismissFailure();
  expect(controller.snapshot()).toMatchObject({
    failure,
    attempted: candidate,
  });
  expect(writes.map((input) => "task" in input && input.task)).toEqual([
    "candidate",
    "second",
  ]);
});

const preview: Extract<Reply, { _tag: "task" }> = {
  _tag: "task",
  task: {
    ...root,
    dry_run: true,
    removed_dependencies: [],
    dependency_fingerprint: "a".repeat(64),
  },
};
const openDelete = (controller: DependencyDeleteController) =>
  controller.open(root, async (input) =>
    input._tag === "graph"
      ? { _tag: "graph", report: dependencyGraph() }
      : preview,
  );

it("returns the accepted deleted Task identity only for a current matching actual result", async () => {
  const controller = new DependencyDeleteController();
  await openDelete(controller);
  const deleted = { ...root, dry_run: false };
  expect(
    await controller.confirm(async () => ({ _tag: "task", task: deleted })),
  ).toEqual(deleted);
  expect(controller.snapshot()).toEqual({ kind: "Closed" });
});

for (const result of [
  preview,
  { _tag: "task", task: { ...dependencyTask("foreign"), dry_run: false } },
  Schema.decodeUnknownSync(Reply)({
    _tag: "task",
    task: { ...root, profile_id: "other", dry_run: false },
  }),
  { _tag: "error", message: "rejected" },
] satisfies Reply[])
  it(`returns no deleted identity for rejected ${result._tag} results`, async () => {
    const controller = new DependencyDeleteController();
    await openDelete(controller);
    expect(await controller.confirm(async () => result)).toBeNull();
    expect(controller.snapshot().kind).not.toBe("Closed");
  });

it("returns no deleted identity after the confirmation scope closes and reopens", async () => {
  const controller = new DependencyDeleteController();
  await openDelete(controller);
  let resolve: (reply: Reply) => void = () => {
    throw new Error("Not pending");
  };
  const pending = controller.confirm(
    () => new Promise<Reply>((complete) => (resolve = complete)),
  );
  controller.close();
  await openDelete(controller);
  resolve({ _tag: "task", task: { ...root, dry_run: false } });
  expect(await pending).toBeNull();
  expect(controller.snapshot().kind).toBe("Review");
});
