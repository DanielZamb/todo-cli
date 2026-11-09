import { expect, it } from "@effect/vitest";
import { LookupMatch, Task } from "@todo/domain";
import { Schema } from "effect";
import { DiscoveryStateController } from "../src/discovery-state.ts";
import { errorReply } from "../src/error-reply.ts";
import type { Reply, Request } from "../src/protocol.ts";

const match = Schema.decodeUnknownSync(LookupMatch)({
  profile: { id: "personal", name: "Personal" },
  task_id: "aaaaaaaa-0000-4000-8000-000000000001",
  title: "Completed Task",
  project: null,
});
const task = Schema.decodeUnknownSync(Task)({
  id: match.task_id,
  profile_id: "personal",
  title: match.title,
  status: "done",
  entity_version: 1,
  row_version: 2,
  description: "",
  project_id: null,
  priority: "P2",
  scheduled_at: null,
  due_at: null,
  energy: null,
  estimate_min: null,
  source: "electron",
  tags: [],
  occurrence: null,
  created_at: "2026-11-09T00:00:00Z",
  updated_at: "2026-11-09T00:00:00Z",
  completed_at: "2026-11-09T00:00:00Z",
  deleted_at: null,
});
const success: Reply = { _tag: "lookup", matches: [match] };
const deferred = <A>() => {
  let resolve: (value: A) => void = () => {
    throw new Error("Not initialized");
  };
  const promise = new Promise<A>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const showing = async () => {
  const controller = new DiscoveryStateController();
  controller.open("lookup");
  await controller.submit(async () => success, "a", "lookup");
  const state = controller.snapshot();
  if (state.kind !== "Showing") throw new Error("Expected applied lookup");
  return { controller, appliedSnapshot: state.appliedSnapshot };
};
it("invalid prefixes make no request and duplicate pending submit is disabled", async () => {
  const controller = new DiscoveryStateController();
  const requests: Request[] = [];
  const pending = deferred<Reply>();
  const request = async (value: Request) => {
    requests.push(value);
    return pending.promise;
  };
  controller.open("lookup");
  await controller.submit(request, " a", "lookup");
  expect(controller.snapshot().kind).toBe("Invalid");
  expect(requests).toEqual([]);
  controller.editPrefix("a");
  const first = controller.submit(request, "a", "lookup");
  await controller.submit(request, "a", "lookup");
  expect(requests).toEqual([{ _tag: "lookup", prefix: "a" }]);
  pending.resolve(success);
  await first;
  expect(controller.snapshot().kind).toBe("Showing");
});
for (const late of [
  success,
  { _tag: "error", message: "obsolete private failure" } satisfies Reply,
]) {
  for (const invalidate of [
    "ABA",
    "Close/reopen",
    "credential replacement",
    "sign out",
    "offline",
  ] as const) {
    it(`discards late ${late._tag} after ${invalidate} at the production controller`, async () => {
      const controller = new DiscoveryStateController();
      const pending = deferred<Reply>();
      controller.open("lookup");
      const run = controller.submit(() => pending.promise, "a", "lookup");
      if (invalidate === "ABA") {
        controller.editPrefix("b");
        controller.editPrefix("a");
      }
      if (invalidate === "Close/reopen") {
        controller.close();
        controller.open("lookup");
      }
      if (invalidate === "credential replacement" || invalidate === "sign out")
        controller.credentialChanged();
      if (invalidate === "offline") controller.offline();
      const expected = controller.snapshot();
      pending.resolve(late);
      await run;
      expect(controller.snapshot()).toBe(expected);
    });
  }
}
it("Retry submits the failed identity and edits clear its authority", async () => {
  const controller = new DiscoveryStateController();
  const requests: Request[] = [];
  const request = async (value: Request): Promise<Reply> => {
    requests.push(value);
    return { _tag: "error", message: "failed" };
  };
  controller.open("lookup");
  await controller.submit(request, "Ab", "lookup");
  await controller.retry(request);
  expect(requests).toEqual([
    { _tag: "lookup", prefix: "Ab" },
    { _tag: "lookup", prefix: "Ab" },
  ]);
  controller.editPrefix("b");
  await controller.retry(request);
  expect(requests.length).toBe(2);
});
it("a retained Show callback has no authority after prefix ABA", async () => {
  const { controller, appliedSnapshot } = await showing();
  let reads = 0;
  controller.editPrefix("b");
  controller.editPrefix("a");
  await controller.show(appliedSnapshot, match, {
    prepare: () => true,
    request: async () => {
      reads++;
      return { _tag: "task", task };
    },
    open: () => {
      throw new Error("Obsolete Show");
    },
    error: () => {
      throw new Error("Obsolete error");
    },
  });
  expect(reads).toBe(0);
});
it("Show rechecks credential replacement after an awaited draft decision", async () => {
  const { controller, appliedSnapshot } = await showing();
  const decision = deferred<boolean>();
  let reads = 0;
  const run = controller.show(appliedSnapshot, match, {
    prepare: () => decision.promise,
    request: async () => {
      reads++;
      return { _tag: "task", task };
    },
    open: () => {
      throw new Error("Obsolete Show");
    },
    error: () => {},
  });
  controller.credentialChanged();
  decision.resolve(true);
  await run;
  expect(reads).toBe(0);
  expect(controller.snapshot()).toEqual({ kind: "Closed" });
});
it("cancelled draft decision preserves the applied snapshot", async () => {
  const { controller, appliedSnapshot } = await showing();
  const state = controller.snapshot();
  await controller.show(appliedSnapshot, match, {
    prepare: () => false,
    request: async () => {
      throw new Error("No read");
    },
    open: () => {
      throw new Error("No navigation");
    },
    error: () => {},
  });
  expect(controller.snapshot()).toBe(state);
});
for (const late of [
  { _tag: "task", task } satisfies Reply,
  { _tag: "error", message: "late exact read error" } satisfies Reply,
]) {
  it(`Show discards ${late._tag} after credential replacement during the exact-id read`, async () => {
    const { controller, appliedSnapshot } = await showing();
    const read = deferred<Reply>();
    const requests: Request[] = [];
    const publications: string[] = [];
    const run = controller.show(appliedSnapshot, match, {
      prepare: () => true,
      request: (request) => {
        requests.push(request);
        return read.promise;
      },
      open: () => {
        publications.push("open");
      },
      error: (message) => {
        publications.push(message.message);
      },
    });
    await Promise.resolve();
    expect(controller.snapshot()).toEqual({ kind: "Closed" });
    expect(requests).toEqual([
      {
        _tag: "showTask",
        profile: "personal",
        task: "aaaaaaaa-0000-4000-8000-000000000001",
      },
    ]);
    controller.credentialChanged();
    read.resolve(late);
    await run;
    expect(publications).toEqual([]);
  });
}
it("Show captures the source before Close and opens only the authorized exact Task", async () => {
  const { controller, appliedSnapshot } = await showing();
  const opened: string[] = [];
  await controller.show(appliedSnapshot, match, {
    prepare: () => true,
    request: async () => ({ _tag: "task", task }),
    open: (task) => {
      opened.push(`${task.profile_id}/${task.id}/${task.status}`);
    },
    error: () => {
      throw new Error("No error");
    },
  });
  expect(opened).toEqual([
    "personal/aaaaaaaa-0000-4000-8000-000000000001/done",
  ]);
  expect(controller.snapshot()).toEqual({ kind: "Closed" });
});
it("builds human Task lookup copy from authorized structured details", () => {
  expect(
    errorReply({
      message: "Task not found in Personal (personal)",
      exit_code: 3,
      exit_meaning: "not found or auth missing",
      details: {
        profile: { id: "personal", name: "Personal" },
        task_id: "aaaa",
        recovery: "Use scoped list or explicit lookup.",
      },
    }),
  ).toEqual({
    _tag: "error",
    message: "Task not found in Personal.",
    details: {
      profile: { id: "personal", name: "Personal" },
      task_id: "aaaa",
      recovery: "Use scoped list or explicit lookup.",
    },
  });
  expect(
    errorReply({
      message: "Internal failure",
      exit_code: 1,
      exit_meaning: "runtime failure",
    }).message,
  ).toBe("Internal failure\nerror 1 - runtime failure");
});

it("opening a prefilled lookup sends nothing until explicit submit", async () => {
  const controller = new DiscoveryStateController();
  const requests: Request[] = [];
  controller.open("lookup", "aaaa");
  expect(controller.snapshot()).toEqual({
    kind: "Editing",
    dialog: "lookup",
    prefix: "aaaa",
  });
  expect(requests).toEqual([]);
  await controller.submit(
    async (request) => {
      requests.push(request);
      return { _tag: "lookup", matches: [] };
    },
    "aaaa",
    "lookup",
  );
  expect(requests).toEqual([{ _tag: "lookup", prefix: "aaaa" }]);
});
