import { expect, it } from "@effect/vitest";
import { Version } from "@todo/domain";
import { Schema } from "effect";
import { DependencyDeleteController } from "../src/dependency-delete-state.ts";
import type { Reply, Request } from "../src/protocol.ts";
import { dependencyTask } from "./fixtures/dependencies.ts";

it("keeps the reviewed Task and requires Reload when the confirmation Version disagrees", async () => {
  const task = dependencyTask("reviewed");
  const controller = new DependencyDeleteController();
  const calls: Request[] = [];
  await controller.open(task, async (request): Promise<Reply> => {
    calls.push(request);
    return {
      _tag: "task",
      task: {
        ...dependencyTask("reviewed", 2),
        dry_run: true,
        confirm_from_version: Schema.decodeUnknownSync(Version)(2),
        dependency_fingerprint: "a".repeat(64),
        removed_dependencies: [],
      },
    };
  });
  expect(calls.map((request) => request._tag)).toEqual(["delete"]);
  expect(controller.snapshot()).toMatchObject({
    kind: "Error",
    task: { id: "reviewed", row_version: 1 },
    failure: {
      _tag: "error",
      message: "Couldn't load the Delete preview. Reload and try again.",
    },
  });
});
