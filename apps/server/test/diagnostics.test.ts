import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Profile } from "@todo/domain";
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
  const context = yield* Layer.build(
    serverLayer({ path: join(directory, "scratch.db"), port: 0 }),
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
  return { store, session, token, get };
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
