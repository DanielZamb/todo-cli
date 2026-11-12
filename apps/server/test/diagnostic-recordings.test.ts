import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Profile } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { TestClock } from "effect/testing";
import { serverLayer } from "../src/server.ts";

it.effect(
  "guards recording routes before decoding and accepts a client-shaped run",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.now());
        const path = yield* Effect.acquireRelease(
          Effect.sync(() =>
            mkdtempSync(join(tmpdir(), "todo-recording-http-")),
          ),
          (p) => Effect.sync(() => rmSync(p, { recursive: true, force: true })),
        );
        const store = yield* Effect.acquireRelease(
          openStore({ path: join(path, "scratch.db") }),
          (s) => Effect.orDie(s.close()),
        );
        yield* store.auth.setupOwner("recording test passphrase");
        const session = yield* store.auth.signIn("recording test passphrase");
        const token = yield* store.auth.issueToken({
          credential: session.credential,
          token: { name: "agent", profile: null, scope: "read-write" },
        });
        yield* TestClock.setTime(Date.now() - 8 * 86400000);
        const expired = yield* store.auth.signIn("recording test passphrase");
        yield* TestClock.setTime(Date.now());
        const context = yield* Layer.build(
          serverLayer({ path: join(path, "scratch.db"), port: 0 }),
        );
        const base = HttpServer.formatAddress(
          Context.get(context, HttpServer.HttpServer).address,
        );
        const call = (credential?: string, body?: unknown) =>
          Effect.promise(() =>
            fetch(base + "/diagnostics/profiler/ingest", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(credential
                  ? { Authorization: `Bearer ${credential}` }
                  : {}),
              },
              body: JSON.stringify(body ?? { title: "must never echo" }),
            }),
          );
        expect((yield* call()).status).toBe(401);
        expect((yield* call(token.credential)).status).toBe(403);
        expect((yield* call(expired.credential)).status).toBe(401);
        const bad = yield* call(session.credential);
        expect(bad.status).toBe(400);
        expect(yield* Effect.promise(() => bad.text())).not.toContain(
          "must never echo",
        );
        yield* store.auth.signOut({ credential: session.credential });
        expect((yield* call(session.credential)).status).toBe(401);
      }),
    ),
);
it.effect(
  "a broken private journal cannot turn one committed Task into an error",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() =>
            mkdtempSync(join(tmpdir(), "todo-recording-http-disk-")),
          ),
          (p) => Effect.sync(() => rmSync(p, { recursive: true, force: true })),
        );
        const store = yield* Effect.acquireRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (s) => Effect.orDie(s.close()),
        );
        yield* store.auth.setupOwner("disk fault passphrase");
        const session = yield* store.auth.signIn("disk fault passphrase");
        yield* store.putProfile(
          Schema.decodeUnknownSync(Profile)({
            id: "work",
            name: "Work",
            created_at: "2026-11-12T00:00:00Z",
            updated_at: "2026-11-12T00:00:00Z",
          }),
        );
        yield* Effect.sync(() =>
          writeFileSync(join(directory, "diagnostic-recordings"), "blocked"),
        );
        const context = yield* Layer.build(
          serverLayer({ path: join(directory, "scratch.db"), port: 0 }),
        );
        const base = HttpServer.formatAddress(
          Context.get(context, HttpServer.HttpServer).address,
        );
        const headers = {
          Authorization: `Bearer ${session.credential}`,
          "Content-Type": "application/json",
        };
        const response = yield* Effect.promise(() =>
          fetch(`${base}/profiles/work/tasks`, {
            method: "POST",
            headers,
            body: JSON.stringify({ title: "Only once", source: "manual" }),
          }),
        );
        expect(response.status).toBe(200);
        const body = yield* Effect.promise(() => response.json());
        expect(body.title).toBe("Only once");
        const tasks = yield* Effect.promise(async () => {
          const read = await fetch(`${base}/profiles/work/tasks`, { headers });
          expect(read.status).toBe(200);
          return read.json();
        });
        expect(tasks).toHaveLength(1);
        const history = yield* store.history();
        expect(
          history.filter((row) => row.event.kind === "TaskCreated"),
        ).toHaveLength(1);
        const recordings = yield* Effect.promise(() =>
          fetch(`${base}/diagnostics/profiler/runs`, { headers }),
        );
        expect(recordings.status).toBe(400);
        expect(yield* Effect.promise(() => recordings.json())).toEqual({
          _tag: "BadRequest",
          message:
            "Recording admission metadata is unavailable; no complete summary can be shown.",
          exit_code: 2,
          exit_meaning: "validation or usage",
        });
      }),
    ),
);
