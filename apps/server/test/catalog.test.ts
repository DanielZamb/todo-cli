import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { CatalogReply, Profile } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { serverLayer } from "../src/server.ts";

const fixture = Effect.gen(function* () {
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-catalog-http-"))),
    (directory) =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
  );
  const path = join(directory, "scratch.db");
  const store = yield* Effect.acquireRelease(openStore({ path }), (store) =>
    Effect.orDie(store.close()),
  );
  yield* store.auth.setupOwner("catalog http");
  for (const [id, name] of [
    ["work", "Work"],
    ["personal", "Personal"],
  ])
    yield* store.putProfile(
      Schema.decodeUnknownSync(Profile)({
        id,
        name,
        created_at: "2026-11-13T00:00:00Z",
        updated_at: "2026-11-13T00:00:00Z",
      }),
    );
  const context = yield* Layer.build(serverLayer({ path, port: 0 }));
  const base = HttpServer.formatAddress(
    Context.get(context, HttpServer.HttpServer).address,
  );
  const request = (
    method: string,
    route: string,
    body?: unknown,
    credential?: string,
  ) =>
    Effect.tryPromise(async () => {
      const response = await fetch(base + route, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(credential === undefined
            ? {}
            : { Authorization: `Bearer ${credential}` }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return {
        status: response.status,
        body: (text ? JSON.parse(text) : null) as unknown,
      };
    });
  const signIn = yield* request("POST", "/auth/sessions", {
    passphrase: "catalog http",
  });
  const credential = (signIn.body as { credential: string }).credential;
  const opLog = () => {
    const db = new Database(path, { readonly: true });
    try {
      return db
        .query<{ rows: number; seq: number }, []>(
          "SELECT count(*) AS rows, coalesce(max(seq),0) AS seq FROM op_log",
        )
        .get();
    } finally {
      db.close();
    }
  };
  return { request, credential, opLog };
});

it.effect("serves the Catalog, its position and its refusals over HTTP", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { request, credential, opLog } = yield* fixture;
      for (const [title, due] of [
        ["Pay rent", "2026-11-12"],
        ["Call bank", "2026-11-13"],
        ["Read book", undefined],
      ] as const)
        expect(
          (yield* request(
            "POST",
            "/profiles/work/tasks",
            { title, ...(due ? { due_at: { kind: "date", date: due } } : {}) },
            credential,
          )).status,
        ).toBe(200);
      const now = "2026-11-13T15:00:00Z";
      const read = yield* request(
        "GET",
        `/profiles/work/catalog?view=today&now=${now}`,
        undefined,
        credential,
      );
      expect(read.status).toBe(200);
      const catalog = Schema.decodeUnknownSync(CatalogReply)(read.body);
      if (catalog.unchanged) throw new Error("expected lists");
      expect(catalog.counts).toEqual({
        all: 3,
        today: 2,
        overdue: 1,
        scheduled: 0,
        inbox: 1,
      });
      expect(
        catalog.view.groups.map((g) => [g.name, g.task_ids.length]),
      ).toEqual([
        ["Overdue", 1],
        ["Due today", 1],
        ["Scheduled today", 0],
      ]);
      expect(catalog.profiles.map((p) => p.name)).toEqual(["Personal", "Work"]);
      expect(catalog.position).toEqual({
        generation: "initial",
        seq: opLog()?.seq,
      });

      const known = `known_generation=initial&known_seq=${catalog.position.seq}&known_day=${catalog.day}`;
      const again = yield* request(
        "GET",
        `/profiles/work/catalog?view=today&now=${now}&${known}`,
        undefined,
        credential,
      );
      expect(again).toEqual({
        status: 200,
        body: {
          unchanged: true,
          position: catalog.position,
          day: "2026-11-13",
        },
      });

      const refusals = [
        [
          "/profiles/work/catalog?time_zone=Mars%2FOlympus",
          400,
          "invalid_args",
        ],
        ["/profiles/work/catalog?known_seq=1", 400, "invalid_args"],
        ["/profiles/work/catalog?colour=blue", 400, "invalid_query"],
        [
          "/profiles/work/views/today?time_zone=Mars%2FOlympus",
          400,
          "invalid_args",
        ],
        ["/profiles/never-created/catalog", 404, "not_found"],
      ] as const;
      const before = opLog();
      for (const [route, status, code] of refusals) {
        const response = yield* request("GET", route, undefined, credential);
        expect([
          route,
          response.status,
          (response.body as { code?: string }).code,
        ]).toEqual([route, status, code]);
      }
      // A refused read records nothing.
      expect(opLog()).toEqual(before);
      expect(
        (yield* request(
          "GET",
          "/profiles/work/views/today?time_zone=America%2FBogota",
          undefined,
          credential,
        )).status,
      ).toBe(200);
      expect((yield* request("GET", "/profiles/work/catalog")).status).toBe(
        401,
      );

      const scoped = (yield* request(
        "POST",
        "/auth/tokens",
        { name: "work reader", profile: "work", scope: "read-only" },
        credential,
      )).body as { credential: string };
      expect(
        (yield* request(
          "GET",
          "/profiles/personal/catalog",
          undefined,
          scoped.credential,
        )).status,
      ).toBe(403);
      const scopedRead = Schema.decodeUnknownSync(CatalogReply)(
        (yield* request(
          "GET",
          "/profiles/work/catalog",
          undefined,
          scoped.credential,
        )).body,
      );
      expect(
        scopedRead.unchanged ? [] : scopedRead.profiles.map((p) => p.id),
      ).toEqual(["work"]);
    }),
  ),
);
