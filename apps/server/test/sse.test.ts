import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { ChangeEvent } from "@todo/api";
import { Profile, ProfileId, Task } from "@todo/domain";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { serverLayer } from "../src/server.ts";

const fixture = Effect.gen(function* () {
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-s02-test-"))),
    (directory) =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
  );
  const path = join(directory, "scratch.db");
  const store = yield* Effect.acquireRelease(openStore({ path }), (store) =>
    Effect.orDie(store.close()),
  );
  yield* store.auth.setupOwner("sse test passphrase");
  for (const id of ["work", "personal"])
    yield* store.putProfile(
      Schema.decodeUnknownSync(Profile)({
        id,
        name: id,
        created_at: "2026-10-27T00:00:00Z",
        updated_at: "2026-10-27T00:00:00Z",
      }),
    );
  const session = yield* store.auth.signIn("sse test passphrase");
  const context = yield* Layer.build(serverLayer({ path, port: 0 }));
  const base = HttpServer.formatAddress(
    Context.get(context, HttpServer.HttpServer).address,
  );
  const request = (
    method: string,
    path: string,
    body: unknown,
    credential = session.credential,
  ) =>
    Effect.tryPromise(() =>
      fetch(base + path, {
        method,
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  const connect = (
    credential = session.credential,
    cursor?: string,
    profile = "work",
  ) =>
    Effect.acquireRelease(
      Effect.tryPromise(async () => {
        const controller = new AbortController();
        const response = await fetch(`${base}/profiles/${profile}/events`, {
          headers: {
            Authorization: `Bearer ${credential}`,
            ...(cursor === undefined ? {} : { "Last-Event-ID": cursor }),
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
  return { store, request, connect, session };
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
        const fields = Object.fromEntries(
          pending
            .slice(0, boundary)
            .split("\n")
            .map((line) => {
              const colon = line.indexOf(":");
              return [line.slice(0, colon), line.slice(colon + 1).trimStart()];
            }),
        );
        yield fields;
        pending = pending.slice(boundary + 2);
        boundary = pending.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
const next = (reader: ReturnType<typeof frames>) =>
  Effect.tryPromise(async () => {
    const frame = await reader.next();
    if (frame.done) throw new Error("Stream ended before next event");
    return Schema.decodeUnknownSync(ChangeEvent)(frame.value);
  });
const operation = (frame: typeof ChangeEvent.Type) => {
  if (frame.event !== "operation") throw new Error("Expected operation");
  return frame;
};
const task = (response: Response) =>
  Effect.tryPromise(async () =>
    Schema.decodeUnknownSync(Task)(await response.json()),
  );

it.live(
  "orders committed operations across connections, skips rejected History, and resumes after an aborted connection",
  () =>
    Effect.gen(function* () {
      const { store, request, connect, session } = yield* fixture;
      const first = yield* task(
        yield* request("POST", "/profiles/work/tasks", { title: "First" }),
      );
      const connection = yield* connect();
      expect(connection.response.status).toBe(200);
      expect(connection.response.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      const reader = frames(connection.response);
      expect(yield* next(reader)).toEqual({ event: "ready", data: null });
      const created = operation(yield* next(reader));
      expect([
        created.data.event.kind,
        created.data.outcome,
        created.data.to_version,
      ]).toEqual(["TaskCreated", "committed", 1]);
      expect(created.id).toBe(String(created.data.seq));
      connection.controller.abort();
      yield* request("PATCH", `/profiles/work/tasks/${first.id}`, {
        from_version: 1,
        changes: { title: "Second" },
      });
      expect(
        (yield* request("PATCH", `/profiles/work/tasks/${first.id}`, {
          from_version: 1,
          changes: { title: "Rejected" },
        })).status,
      ).toBe(409);
      yield* request("POST", "/profiles/personal/tasks", { title: "Private" });
      const external = yield* new TaskCommands(store).create(
        {
          credential: session.credential,
          profile: Schema.decodeUnknownSync(ProfileId)("work"),
        },
        { title: "External" },
      );
      expect(external.outcome).toBe("committed");
      const resumed = yield* connect(session.credential, created.id);
      const resumeReader = frames(resumed.response);
      expect(yield* next(resumeReader)).toEqual({ event: "ready", data: null });
      const second = operation(yield* next(resumeReader));
      const third = operation(yield* next(resumeReader));
      expect([second.data.event.kind, third.data.event.kind]).toEqual([
        "TaskEdited",
        "TaskCreated",
      ]);
      expect([second.data.to_version, third.data.to_version]).toEqual([2, 1]);
      expect(second.data.seq).toBeGreaterThan(created.data.seq);
      expect(third.data.seq).toBeGreaterThan(second.data.seq);
      expect([second.data.profile, third.data.profile]).toEqual([
        "work",
        "work",
      ]);
      const all = yield* store.history();
      expect(
        all
          .filter((entry) => entry.outcome === "rejected")
          .map((entry) => entry.reason),
      ).toEqual(["conflict"]);
      expect(
        all
          .filter(
            (entry) =>
              entry.profile === "work" && entry.outcome === "committed",
          )
          .map((entry) => entry.seq),
      ).toEqual([created.data.seq, second.data.seq, third.data.seq]);
    }),
  15000,
);

it.live(
  "authenticates Profile streams, validates cursors, and stops a connected Token after revocation",
  () =>
    Effect.gen(function* () {
      const { store, connect, session, request } = yield* fixture;
      const token = yield* store.auth.issueToken({
        credential: session.credential,
        token: {
          name: "sse-reader",
          profile: Schema.decodeUnknownSync(ProfileId)("work"),
          scope: "read-only",
        },
      });
      expect((yield* connect("invalid")).response.status).toBe(401);
      expect(
        (yield* connect(token.credential, undefined, "personal")).response
          .status,
      ).toBe(403);
      for (const cursor of [
        "-1",
        "1.5",
        "1e2",
        "01",
        "9007199254740992",
        "abc",
      ])
        expect(
          (yield* connect(session.credential, cursor)).response.status,
        ).toBe(400);
      const connection = yield* connect(token.credential, "0");
      const reader = frames(connection.response);
      expect(yield* next(reader)).toEqual({ event: "ready", data: null });
      yield* store.auth.revokeToken({
        credential: session.credential,
        name: "sse-reader",
      });
      yield* request("POST", "/profiles/work/tasks", {
        title: "After revocation",
      });
      const failure = yield* Effect.tryPromise(() => reader.next());
      expect(failure.done).toBe(false);
      expect(failure.value?.event).toBe("effect/http-api/stream/failure");
      expect((yield* Effect.tryPromise(() => reader.next())).done).toBe(true);
    }),
  15000,
);

it.live(
  "delivers a committed Task after twelve idle seconds and closes on Session revocation",
  () =>
    Effect.gen(function* () {
      const { store, request, connect, session } = yield* fixture;
      const connection = yield* connect();
      const reader = frames(connection.response);
      expect(yield* next(reader)).toEqual({ event: "ready", data: null });
      yield* Effect.sleep("12 seconds");
      const created = yield* task(
        yield* request("POST", "/profiles/work/tasks", {
          title: "After twelve idle seconds",
        }),
      );
      expect([created.title, created.status, created.row_version]).toEqual([
        "After twelve idle seconds",
        "open",
        1,
      ]);
      const received = operation(yield* next(reader));
      expect([
        received.id,
        received.data.seq,
        received.data.outcome,
        received.data.profile,
      ]).toEqual(["3", 3, "committed", "work"]);
      expect(received.data.event.kind).toBe("TaskCreated");
      if (received.data.event.kind === "TaskCreated")
        expect(received.data.event.task.title).toBe(
          "After twelve idle seconds",
        );
      yield* store.auth.signOut({ credential: session.credential });
      const failure = yield* Effect.tryPromise(() => reader.next());
      expect(failure.value?.event).toBe("effect/http-api/stream/failure");
      expect((yield* Effect.tryPromise(() => reader.next())).done).toBe(true);
      expect((yield* connect()).response.status).toBe(401);
      expect((yield* request("GET", "/health", undefined)).status).toBe(200);
    }),
  25000,
);

it.live(
  "reloads both Profile streams across restore without broadcasting global AuthChanged",
  () =>
    Effect.gen(function* () {
      const { store, connect, session, request } = yield* fixture;
      const saved = yield* store.snapshots.create(
        "pre-restore-two-Profile proof",
      );
      const work = frames(
        (yield* connect(session.credential, "0", "work")).response,
      );
      const personal = frames(
        (yield* connect(session.credential, "0", "personal")).response,
      );
      expect(yield* next(work)).toEqual({ event: "ready", data: null });
      expect(yield* next(personal)).toEqual({ event: "ready", data: null });
      const restored = yield* store.snapshots.restore(saved.id);
      yield* store.auth.signIn("sse test passphrase");
      yield* request("POST", "/profiles/work/tasks", {
        title: "Work after restore",
      });
      yield* request("POST", "/profiles/personal/tasks", {
        title: "Personal after restore",
      });
      const workReload = yield* next(work);
      const personalReload = yield* next(personal);
      expect([workReload.event, personalReload.event]).toEqual([
        "reload",
        "reload",
      ]);
      if (workReload.event !== "reload" || personalReload.event !== "reload")
        throw new Error("Both Profile streams must reload");
      expect(workReload.data).toEqual({
        generation: restored.generation,
        seq: 3,
      });
      expect(personalReload.data).toEqual({
        generation: restored.generation,
        seq: 3,
      });
      const workEvent = operation(yield* next(work));
      const personalEvent = operation(yield* next(personal));
      expect([
        workEvent.data.profile,
        workEvent.data.event.kind,
        personalEvent.data.profile,
        personalEvent.data.event.kind,
      ]).toEqual(["work", "TaskCreated", "personal", "TaskCreated"]);
      expect(
        (yield* store.history())
          .filter((entry) => entry.event.kind === "AuthChanged")
          .map((entry) => [
            entry.profile,
            entry.event.kind === "AuthChanged"
              ? entry.event.action
              : "unexpected",
          ]),
      ).toEqual([
        [null, "setupOwner"],
        [null, "signIn"],
        [null, "signIn"],
      ]);
    }),
  15000,
);
