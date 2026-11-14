import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "@effect/vitest";
import { ChangeEvent } from "@todo/api";
import { Profile, ProfileId } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { serverLayer } from "../src/server.ts";
import { StreamWake } from "../src/stream-wake.ts";

// A change that commits after a stream's wake has fired and before the pass
// takes its lease. The hook runs inside the stream's own `wake.version` read
// that follows its wait, either before that read returns its value
// ("before-capture") or after the value has been taken ("after-capture"). In
// both orders the pass's fresh checked lease must see the change.
type Mode = "before-capture" | "after-capture";
const original = Object.getOwnPropertyDescriptor(
  StreamWake.prototype,
  "version",
);
if (!original?.get) throw new Error("StreamWake.version must be a getter");
const read = original.get;
let lastWake: StreamWake | undefined;
let hook:
  | { armed: number; mode: Mode; run: () => void; fired: number }
  | undefined;
Object.defineProperty(StreamWake.prototype, "version", {
  configurable: true,
  get(this: StreamWake) {
    lastWake = this;
    const value: number = read.call(this);
    if (!hook || hook.fired > 0 || value <= hook.armed) return value;
    hook.fired++;
    if (hook.mode === "after-capture") {
      hook.run();
      this.signal();
      return value;
    }
    hook.run();
    this.signal();
    return read.call(this);
  },
});
afterAll(() => {
  Object.defineProperty(StreamWake.prototype, "version", original);
});

const work = Schema.decodeUnknownSync(ProfileId)("work");
const fixture = Effect.gen(function* () {
  hook = undefined;
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-wake-lease-"))),
    (directory) =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
  );
  const path = join(directory, "scratch.db");
  const store = yield* Effect.acquireRelease(openStore({ path }), (store) =>
    Effect.orDie(store.close()),
  );
  yield* store.auth.setupOwner("lease window passphrase");
  for (const id of ["work", "personal"])
    yield* store.putProfile(
      Schema.decodeUnknownSync(Profile)({
        id,
        name: id,
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
      }),
    );
  const session = yield* store.auth.signIn("lease window passphrase");
  const context = yield* Layer.build(serverLayer({ path, port: 0 }));
  const base = HttpServer.formatAddress(
    Context.get(context, HttpServer.HttpServer).address,
  );
  const post = (title: string) =>
    Effect.tryPromise(async () => {
      const reply = await fetch(`${base}/profiles/work/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      });
      if (reply.status !== 200) throw new Error(`POST ${reply.status}`);
      return (await reply.json()) as { id: string };
    });
  const connect = (credential: string, cursor: number) =>
    Effect.acquireRelease(
      Effect.tryPromise(async () => {
        const controller = new AbortController();
        const response = await fetch(`${base}/profiles/work/events`, {
          headers: {
            Authorization: `Bearer ${credential}`,
            "Last-Event-ID": String(cursor),
          },
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20000),
          ]),
        });
        return { response, controller };
      }),
      ({ controller }) => Effect.sync(() => controller.abort()),
    );
  return { store, session, post, connect };
});

async function* frames(response: Response) {
  if (!response.body) throw new Error("Missing SSE body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return;
      pending += decoder.decode(chunk.value, { stream: true });
      let boundary = pending.indexOf("\n\n");
      while (boundary >= 0) {
        yield Object.fromEntries(
          pending
            .slice(0, boundary)
            .split("\n")
            .map((line) => {
              const colon = line.indexOf(":");
              return [line.slice(0, colon), line.slice(colon + 1).trimStart()];
            }),
        );
        pending = pending.slice(boundary + 2);
        boundary = pending.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
const take = (reader: ReturnType<typeof frames>) =>
  Effect.tryPromise(async () => {
    const frame = await reader.next();
    if (frame.done) return { event: "closed" } as const;
    return frame.value.event === "effect/http-api/stream/failure"
      ? ({ event: "failure", data: String(frame.value.data) } as const)
      : Schema.decodeUnknownSync(ChangeEvent)(frame.value);
  });
const summary = (frame: Effect.Success<ReturnType<typeof take>>) =>
  frame.event === "operation"
    ? [frame.event, frame.data.event.kind, frame.id]
    : [frame.event];
const arm = (mode: Mode, run: () => void) => {
  if (!lastWake) throw new Error("no stream has read its wake yet");
  hook = { armed: read.call(lastWake), mode, run, fired: 0 };
};

for (const mode of ["before-capture", "after-capture"] as const) {
  it.live(
    `ends a revoked Token's stream at the pass after the wake (${mode})`,
    () =>
      Effect.gen(function* () {
        const { store, session, post, connect } = yield* fixture;
        const token = yield* store.auth.issueToken({
          credential: session.credential,
          token: { name: "window", profile: null, scope: "read-only" },
        });
        const reader = frames(
          (yield* connect(
            token.credential,
            (yield* store.history()).at(-1)?.seq ?? 0,
          )).response,
        );
        expect(summary(yield* take(reader))).toEqual(["ready"]);
        arm(mode, () =>
          Effect.runSync(
            store.auth.revokeToken({
              credential: session.credential,
              name: "window",
            }),
          ),
        );
        yield* post("Wake trigger");
        expect(summary(yield* take(reader))).toEqual(["failure"]);
        expect(summary(yield* take(reader))).toEqual(["closed"]);
        expect(hook?.fired).toBe(1);
      }),
    15000,
  );

  it.live(
    `delivers a Session's final deletion batch once when the Profile is deleted after the wake (${mode})`,
    () =>
      Effect.gen(function* () {
        const { store, session, post, connect } = yield* fixture;
        const reader = frames(
          (yield* connect(
            session.credential,
            (yield* store.history()).at(-1)?.seq ?? 0,
          )).response,
        );
        expect(summary(yield* take(reader))).toEqual(["ready"]);
        arm(mode, () =>
          Effect.runSync(
            store.auth.deleteProfile({
              credential: session.credential,
              profile: work,
              options: { dry_run: false, with_tasks: true },
            }),
          ),
        );
        const trigger = yield* post("Wake trigger");
        const durable = (yield* store.history()).filter(
          (entry) => entry.profile === "work" && entry.outcome === "committed",
        );
        const received = [
          summary(yield* take(reader)),
          summary(yield* take(reader)),
          summary(yield* take(reader)),
          summary(yield* take(reader)),
          summary(yield* take(reader)),
        ];
        expect(received).toEqual([
          ...durable
            .slice(-3)
            .map((entry) => ["operation", entry.event.kind, String(entry.seq)]),
          ["failure"],
          ["closed"],
        ]);
        expect(durable.slice(-3).map((entry) => entry.event.kind)).toEqual([
          "TaskCreated",
          "TaskDeleted",
          "ProfileDeleted",
        ]);
        const created = durable.at(-3)?.event;
        expect(created?.kind === "TaskCreated" ? created.task.id : null).toBe(
          trigger.id,
        );
        expect(hook?.fired).toBe(1);
      }),
    15000,
  );

  it.live(
    `closes a deletion-revoked scoped Token with no deletion batch (${mode})`,
    () =>
      Effect.gen(function* () {
        const { store, session, post, connect } = yield* fixture;
        const token = yield* store.auth.issueToken({
          credential: session.credential,
          token: { name: "scoped", profile: work, scope: "read-only" },
        });
        const reader = frames(
          (yield* connect(
            token.credential,
            (yield* store.history()).at(-1)?.seq ?? 0,
          )).response,
        );
        expect(summary(yield* take(reader))).toEqual(["ready"]);
        arm(mode, () =>
          Effect.runSync(
            store.auth.deleteProfile({
              credential: session.credential,
              profile: work,
              options: { dry_run: false, with_tasks: true },
            }),
          ),
        );
        yield* post("Wake trigger");
        expect(summary(yield* take(reader))).toEqual(["failure"]);
        expect(summary(yield* take(reader))).toEqual(["closed"]);
        expect(hook?.fired).toBe(1);
      }),
    15000,
  );

  it.live(
    `announces a restore that lands after the wake with reload before any later operation (${mode})`,
    () =>
      Effect.gen(function* () {
        const { store, session, post, connect } = yield* fixture;
        const saved = yield* store.snapshots.create(
          // A pre-change reason survives the server's own daily retention.
          "pre-lease-window restore",
        );
        const reader = frames(
          (yield* connect(
            session.credential,
            (yield* store.history()).at(-1)?.seq ?? 0,
          )).response,
        );
        expect(summary(yield* take(reader))).toEqual(["ready"]);
        let restored: { generation: string } | undefined;
        arm(mode, () => {
          restored = Effect.runSync(store.snapshots.restore(saved.id));
        });
        yield* post("Wake trigger, erased by the restore");
        const reload = yield* take(reader);
        expect(reload, JSON.stringify(reload)).toMatchObject({
          event: "reload",
        });
        if (reload.event !== "reload") throw new Error("expected reload");
        expect(reload.data.generation).toBe(restored?.generation);
        const after = yield* post("After restore");
        const event = yield* take(reader);
        expect(event.event).toBe("operation");
        if (event.event !== "operation") throw new Error("expected operation");
        expect([
          event.data.event.kind,
          event.data.event.kind === "TaskCreated"
            ? event.data.event.task.id
            : null,
        ]).toEqual(["TaskCreated", after.id]);
        expect(event.data.seq).toBeGreaterThan(reload.data.seq);
        expect((yield* store.tasks()).map((task) => task.title)).toEqual([
          "After restore",
        ]);
        expect(hook?.fired).toBe(1);
      }),
    15000,
  );
}
