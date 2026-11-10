import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import {
  DependencyDragController,
  dependencyDragHint,
} from "../src/dependency-drag-state.ts";
import { Reply, type Request } from "../src/protocol.ts";
import { dependencyTask } from "./fixtures/dependencies.ts";

it("keeps visible target metadata short and exposes the complete relation to accessibility", () => {
  const controller = new DependencyDragController();
  const source = dependencyTask("source");
  const target = dependencyTask("target");
  controller.hover(source, target);
  expect(dependencyDragHint(controller.snapshot())).toEqual({
    text: "Will depend on Task source",
    accessibilityValue: "Task target will depend on Task source",
  });
  controller.hover(source, { ...target, depends_on: [source.id] });
  expect(dependencyDragHint(controller.snapshot())).toEqual({
    text: "Already depends on Task source",
    accessibilityValue: "Task target already depends on Task source",
  });
});

it("makes TARGET depend on SOURCE using a fresh TARGET Version", async () => {
  const controller = new DependencyDragController();
  const source = dependencyTask("source");
  const target = dependencyTask("target");
  controller.hover(source, target);
  expect(controller.snapshot()).toMatchObject({ guidance: "allowed" });
  const requests: Request[] = [];
  expect(
    await controller.drop(async (input) => {
      requests.push(input);
      return input._tag === "showTask"
        ? { _tag: "task", task: dependencyTask("target", 7) }
        : Schema.decodeUnknownSync(Reply)({
            _tag: "edge",
            report: {
              generated_at: "2026-11-09T00:00:00Z",
              outcome: "added",
              dependent_id: "target",
              blocker_id: "source",
              from_version: 7,
              to_version: 8,
              seq: 10,
              warnings: [],
            },
          });
    }),
  ).toBe(true);
  expect(requests).toEqual([
    { _tag: "showTask", profile: "work", task: "target" },
    {
      _tag: "depend",
      profile: "work",
      task: "target",
      payload: { blocker_id: "source", from_version: 7 },
    },
  ]);
});
it("makes self, foreign and already-linked drops quiet guidance without a write", async () => {
  const controller = new DependencyDragController();
  const target = dependencyTask("target");
  let calls = 0;
  const request = async (): Promise<Reply> => {
    calls++;
    return { _tag: "ok" };
  };
  controller.hover(target, target);
  expect(await controller.drop(request)).toBe(false);
  expect(controller.snapshot()).toMatchObject({ guidance: "self" });
  controller.hover(null, target);
  expect(await controller.drop(request)).toBe(false);
  expect(controller.snapshot()).toMatchObject({
    source: null,
    guidance: "foreign",
  });
  controller.hover(dependencyTask("source"), {
    ...target,
    depends_on: [dependencyTask("source").id],
  });
  expect(await controller.drop(request)).toBe(false);
  expect(controller.snapshot()).toMatchObject({ guidance: "already" });
  expect(calls).toBe(0);
});
it("discards a late drag result after Profile/auth invalidation", async () => {
  const controller = new DependencyDragController();
  controller.hover(dependencyTask("source"), dependencyTask("target"));
  let finish: (reply: Reply) => void = () => {
    throw new Error("not waiting");
  };
  const pending = controller.drop(
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  controller.close();
  finish({ _tag: "error", message: "obsolete private response" });
  expect(await pending).toBe(false);
  expect(controller.snapshot()).toEqual({ kind: "Closed" });
});
