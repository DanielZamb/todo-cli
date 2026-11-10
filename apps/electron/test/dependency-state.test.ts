import { expect, it } from "@effect/vitest";
import { DependencyError } from "@todo/domain";
import { Schema } from "effect";
import { DependencyDeleteController } from "../src/dependency-delete-state.ts";
import {
  dependencyAdvice,
  dependencyBadge,
  dependencyRecovery,
} from "../src/dependency-presentation.ts";
import { DependencyController } from "../src/dependency-state.ts";
import { errorReply } from "../src/error-reply.ts";
import { Reply, type Request } from "../src/protocol.ts";
import { dependencyGraph, dependencyTask } from "./fixtures/dependencies.ts";

const root = dependencyTask("root");
const scope = { profile: root.profile_id, root: root.id };
const edge = Schema.decodeUnknownSync(Reply)({
  _tag: "edge",
  report: {
    generated_at: "2026-11-09T00:00:00Z",
    outcome: "added",
    dependent_id: "root",
    blocker_id: "other",
    from_version: 1,
    to_version: 2,
    seq: 1,
    warnings: [],
  },
});
const reads = async (request: Request): Promise<Reply> =>
  request._tag === "graph"
    ? { _tag: "graph", report: dependencyGraph() }
    : { _tag: "dependencyCandidates", tasks: [dependencyTask("other", 7)] };
it("keeps checked links first under narrowed Profile-wide search and uses the candidate Version for Blocks", async () => {
  const controller = new DependencyController();
  await controller.open(scope, reads);
  await controller.find("other", reads);
  expect(controller.choices().map((row) => [row.task.id, row.checked])).toEqual(
    [
      ["linked", true],
      ["other", false],
    ],
  );
  controller.direction("blocks");
  const writes: Request[] = [];
  await controller.toggle(dependencyTask("other").id, true, async (request) => {
    if (request._tag === "depend") {
      writes.push(request);
      return edge;
    }
    return reads(request);
  });
  expect(writes).toEqual([
    {
      _tag: "depend",
      profile: "work",
      task: "other",
      payload: { blocker_id: "root", from_version: 7 },
    },
  ]);
});
it("serializes root writes and refreshes the authoritative Version before the next one", async () => {
  const controller = new DependencyController();
  let version = 1;
  const versions: number[] = [];
  const request = async (request: Request): Promise<Reply> => {
    if (request._tag === "graph")
      return { _tag: "graph", report: dependencyGraph(version) };
    if (request._tag === "depend") {
      versions.push(request.payload.from_version);
      version++;
      return edge;
    }
    return {
      _tag: "dependencyCandidates",
      tasks: [dependencyTask("other"), dependencyTask("third")],
    };
  };
  await controller.open(scope, request);
  await Promise.all([
    controller.toggle(dependencyTask("other").id, true, request),
    controller.toggle(dependencyTask("third").id, true, request),
  ]);
  expect(versions).toEqual([1, 2]);
});
it("retains Conflict and refuses resend until an explicit Reload", async () => {
  const controller = new DependencyController();
  await controller.open(scope, reads);
  let writes = 0;
  const request = async (): Promise<Reply> => {
    writes++;
    return {
      _tag: "conflict",
      latest: root,
      exit_detail: "error 4 - version conflict",
    };
  };
  await controller.toggle(dependencyTask("other").id, true, request);
  await controller.toggle(dependencyTask("other").id, true, request);
  expect(writes).toBe(1);
  expect(controller.snapshot()).toMatchObject({
    kind: "Open",
    failure: { _tag: "conflict" },
  });
  await controller.reload(reads);
  await controller.toggle(dependencyTask("other").id, true, request);
  expect(writes).toBe(2);
});
for (const result of [
  { _tag: "graph", report: dependencyGraph() },
  { _tag: "error", message: "private stale error" },
] satisfies Reply[])
  it(`discards late ${result._tag} after close and Profile/auth invalidation`, async () => {
    const controller = new DependencyController();
    let release: (reply: Reply) => void = () => {
      throw new Error("not waiting");
    };
    const pending = new Promise<Reply>((resolve) => {
      release = resolve;
    });
    const opening = controller.open(scope, () => pending);
    controller.close();
    release(result);
    await opening;
    expect(controller.snapshot()).toEqual({ kind: "Closed" });
  });
it("always previews even an empty Delete and sends the reviewed fingerprint and Version", async () => {
  const controller = new DependencyDeleteController();
  const calls: Request[] = [];
  const request = async (request: Request): Promise<Reply> => {
    calls.push(request);
    return request._tag === "graph"
      ? { _tag: "graph", report: dependencyGraph() }
      : {
          _tag: "task",
          task: {
            ...root,
            dry_run: true,
            dependency_fingerprint: "a".repeat(64),
            removed_dependencies: [],
          },
        };
  };
  await controller.open(root, request);
  expect(calls[0]).toEqual({
    _tag: "delete",
    profile: "work",
    task: "root",
    query: { from_version: 1, dry_run: true },
  });
  expect(controller.snapshot().kind).toBe("Review");
  await controller.confirm(request);
  expect(calls[2]).toEqual({
    _tag: "delete",
    profile: "work",
    task: "root",
    query: {
      from_version: 1,
      with_dependencies: true,
      dependency_fingerprint: "a".repeat(64),
    },
  });
});
it("projects structured recovery without agent copy and rejects missing exit pairs", () => {
  const error = Schema.decodeUnknownSync(DependencyError)({
    generated_at: "2026-11-09T00:00:00Z",
    code: "dependency_cycle",
    message: "secret CLI recovery command",
    exit_code: 2,
    exit_meaning: "validation or usage",
    details: {
      dependent_id: "root",
      blocker_id: "root",
      path: ["root", "root"],
    },
  });
  expect(dependencyRecovery(error, "add", [root])).toEqual({
    message: "A Task can't depend on itself.",
    detail: "error 2 - validation or usage",
    action: "choose",
    witnesses: [
      { id: "root", title: "Task root" },
      { id: "root", title: "Task root" },
    ],
  });
  expect(errorReply(error).message).toBe("A Task can't depend on itself.");
  const { exit_code: _removed, ...invalid } = error;
  expect(errorReply(invalid).message).toBe(
    "Todo returned an incompatible Dependency response. Reload after updating the server.",
  );
  expect(dependencyAdvice(14)).toBe(
    "This Task depends on 14 Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks.",
  );
});
it("keeps no-blocker and terminal rows calm and counts unresolved direct blockers", () => {
  const linked = dependencyTask("linked");
  expect(
    dependencyBadge({ ...root, depends_on: [], ready: true }, [linked]),
  ).toBeNull();
  expect(
    dependencyBadge({ ...root, depends_on: [linked.id], ready: true }, [
      linked,
    ]),
  ).toBe("Ready");
  expect(
    dependencyBadge({ ...root, depends_on: [linked.id], blocked: true }, [
      linked,
    ]),
  ).toBe("Blocked · 1");
  expect(
    dependencyBadge(
      { ...root, status: "done", depends_on: [linked.id], ready: true },
      [linked],
    ),
  ).toBeNull();
});
