import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { DiagnosticRecorder, DiagnosticsSnapshot, Profile } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { TestClock } from "effect/testing";
import { verifyHttpFailures } from "../scripts/verify-diagnostics-failures.ts";
import { serverLayer } from "../src/server.ts";

const fixture = Effect.gen(function* () {
  yield* TestClock.setTime(Date.now());
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-diagnostics-test-"))),
    (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
  );
  const store = yield* Effect.acquireRelease(
    openStore({ path: join(directory, "scratch.db") }),
    (store) => Effect.orDie(store.close()),
  );
  yield* store.auth.setupOwner("diagnostics test passphrase");
  yield* store.putProfile(
    Schema.decodeUnknownSync(Profile)({
      id: "work",
      name: "Work",
      created_at: "2026-10-28T00:00:00Z",
      updated_at: "2026-10-28T00:00:00Z",
    }),
  );
  const session = yield* store.auth.signIn("diagnostics test passphrase");
  const token = yield* store.auth.issueToken({
    credential: session.credential,
    token: { name: "agent", profile: null, scope: "read-write" },
  });
  const profiler = new DiagnosticRecorder();
  const context = yield* Layer.build(
    serverLayer({ path: join(directory, "scratch.db"), port: 0, profiler }),
  );
  const base = HttpServer.formatAddress(
    Context.get(context, HttpServer.HttpServer).address,
  );
  const get = (credential?: string) =>
    Effect.tryPromise(() =>
      fetch(`${base}/diagnostics`, {
        headers: credential ? { Authorization: `Bearer ${credential}` } : {},
      }),
    );
  return { store, session, token, get, base, profiler };
});

describe("owner diagnostics HTTP contract", () => {
  it.live("counts an unmatched route and an uncaught defect once each", () =>
    verifyHttpFailures.pipe(Effect.asVoid),
  );
  it.effect(
    "allows only an active owner Session and never returns credential material",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { get, session, token, store } = yield* fixture;
          expect((yield* get()).status).toBe(401);
          expect((yield* get(token.credential)).status).toBe(403);
          const response = yield* get(session.credential);
          expect(response.status).toBe(200);
          expect(response.headers.get("cache-control")).toBe("no-store");
          const body = yield* Effect.promise(() => response.text());
          expect(body).not.toContain(session.credential);
          expect(body).not.toContain(token.credential);
          expect(body).not.toContain("secret_hash");
          expect(body).not.toContain("passphrase_hash");
          yield* store.auth.signOut({ credential: session.credential });
          expect((yield* get(session.credential)).status).toBe(401);
        }),
      ),
  );
});

it.effect(
  "accepts safe recording joins and replaces malformed ids without granting owner access",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { get, session, base, profiler } = yield* fixture;
        const headers = {
          "X-Todo-Trace": "11111111-1111-4111-8111-111111111111",
          "X-Todo-Request": "22222222-2222-4222-8222-222222222222",
          "X-Todo-Action": "33333333-3333-4333-8333-333333333333",
        };
        const response = yield* Effect.promise(() =>
          fetch(`${base}/profiles/work/tasks`, {
            headers: {
              ...headers,
              Authorization: `Bearer ${session.credential}`,
            },
          }),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("x-todo-request")).toBe(
          headers["X-Todo-Request"],
        );
        expect(response.headers.get("server-timing")).toMatch(
          /^todo-handler;dur=\d+(?:\.\d{1,3})?(?:, todo-(?:auth|queue|domain|db|encode);dur=\d+(?:\.\d{1,3})?)*$/u,
        );
        yield* Effect.promise(() => response.text());
        const joined = profiler
          .details()
          .recent.filter((x) => x.request_id === headers["X-Todo-Request"]);
        expect([...new Set(joined.map((x) => x.stage))].sort()).toEqual([
          "authentication",
          "database",
          "domain",
          "entry",
          "graph",
          "handler",
          "response_handoff",
          "writer_lock_wait",
        ]);
        expect(
          joined.every(
            (x) =>
              x.trace_id === headers["X-Todo-Trace"] &&
              x.action_id === headers["X-Todo-Action"],
          ),
        ).toBe(true);
        const malformed = yield* Effect.promise(() =>
          fetch(`${base}/health?private=content`, {
            headers: { "X-Todo-Request": "private-token" },
          }),
        );
        expect(malformed.headers.get("x-todo-request")).toMatch(
          /^[a-f0-9-]{36}$/,
        );
        const denied = yield* Effect.promise(() =>
          fetch(`${base}/diagnostics`, { headers }),
        );
        expect(denied.status).toBe(401);
        expect(denied.headers.get("server-timing")).toBe(null);
        const body = yield* Effect.promise(() => denied.text());
        expect(body).not.toContain("profiler");
        expect(body).not.toContain("recent");
        expect(JSON.stringify(profiler.details())).not.toContain("private");
        expect((yield* get(session.credential)).status).toBe(200);
      }),
    ),
);

it.effect(
  "records commit-seen and encoded transport handoff per stream without exporting content",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { session, base, profiler } = yield* fixture;
        const created = yield* Effect.promise(() =>
          fetch(`${base}/profiles/work/tasks`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.credential}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ title: "private stream fixture" }),
          }),
        );
        expect(created.status).toBe(200);
        yield* Effect.promise(() => created.text());
        const controllers: AbortController[] = [];
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            for (const controller of controllers) controller.abort();
          }),
        );
        for (let index = 0; index < 2; index++) {
          const controller = new AbortController();
          controllers.push(controller);
          const response = yield* Effect.promise(() =>
            fetch(`${base}/profiles/work/events`, {
              headers: { Authorization: `Bearer ${session.credential}` },
              signal: controller.signal,
            }),
          );
          const reader = response.body?.getReader();
          if (!reader) throw new Error("Missing SSE body");
          let frame = "";
          while (!frame.includes("event: operation")) {
            const chunk = yield* Effect.promise(() => reader.read());
            if (chunk.done) throw new Error("SSE ended early");
            frame += new TextDecoder().decode(chunk.value);
            if (!frame.includes("event: operation"))
              yield* TestClock.adjust("250 millis");
          }
        }
        const deliveries = profiler.details().deliveries;
        expect(deliveries.map((x) => x.stage)).toEqual([
          "commit_seen",
          "transport_handoff",
          "commit_seen",
          "transport_handoff",
        ]);
        expect(new Set(deliveries.map((x) => x.stream_id)).size).toBe(2);
        expect(new Set(deliveries.map((x) => x.frame_id)).size).toBe(2);
        expect(new Set(deliveries.map((x) => x.commit_receipt)).size).toBe(1);
        expect(deliveries[0]?.bytes).toBe(null);
        expect(deliveries[1]?.bytes).toBeGreaterThan(0);
        expect(JSON.stringify(profiler.details())).not.toContain(
          "private stream fixture",
        );
      }),
    ),
);

it.effect("adds one versioned profiler object only to owner Diagnostics", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { get, session, token } = yield* fixture;
      const owner = yield* get(session.credential);
      const body = yield* Effect.promise(() => owner.json());
      expect(body.profiler.schema_version).toBe(2);
      expect(body.profiler.capacity).toBe(2048);
      expect(body.profiler.detail).toBeUndefined();
      expect(body.profiler.recent).toBeUndefined();
      expect(body.profiler.deliveries).toBeUndefined();
      expect(body.profiler.unobserved).toContain("socket_accept_to_entry");
      const agent = yield* get(token.credential);
      expect(agent.headers.get("server-timing")).toBe(null);
      const refused = yield* Effect.promise(() => agent.text());
      expect(refused).not.toContain("profiler");
    }),
  ),
);

it.effect(
  "requires an owner Session for the declared bounded detail opt-in",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { base, session, token } = yield* fixture;
        for (const [credential, expected] of [
          [undefined, 401],
          [token.credential, 403],
          [session.credential, 200],
        ] as const) {
          const response = yield* Effect.promise(() =>
            fetch(`${base}/diagnostics?detail=true`, {
              headers: credential
                ? { Authorization: `Bearer ${credential}` }
                : {},
            }),
          );
          expect(response.status).toBe(expected);
          const text = yield* Effect.promise(() => response.text());
          if (expected === 200) {
            const body = Schema.decodeUnknownSync(
              Schema.fromJsonString(DiagnosticsSnapshot),
            )(text);
            expect(body.profiler?.detail?.run_id).toBe(body.profiler?.run_id);
            expect(
              new TextEncoder().encode(JSON.stringify(body, null, 2) + "\n")
                .length,
            ).toBeLessThanOrEqual(65536);
          } else expect(text).not.toContain("profiler");
        }
      }),
    ),
);
