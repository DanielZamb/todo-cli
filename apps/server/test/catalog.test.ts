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
  const context = yield* Layer.build(
    serverLayer({ timeZone: "UTC", path, port: 0 }),
  );
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

      const known = `known_generation=initial&known_seq=${catalog.position.seq}&known_day=${catalog.day}&known_stamp=${catalog.stamp}`;
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
          stamp: catalog.stamp,
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
        // A blank Tag name is not a filter value: refused before the Profile
        // is resolved, on the Catalog and on the list alike. A blank Project
        // name is a real name (seat F7): see the test below.
        ["/profiles/work/catalog?tag=", 400, "invalid_args"],
        ["/profiles/work/catalog?tag=%20", 400, "invalid_args"],
        ["/profiles/work/catalog?tag=work&tag=%0A", 400, "invalid_args"],
        ["/profiles/never-created/catalog?tag=", 400, "invalid_args"],
        ["/profiles/work/tasks?tag=", 400, "invalid_args"],
        ["/profiles/never-created/tasks?tag=%20", 400, "invalid_args"],
        ["/profiles/work/tasks?project=%20%09", 200, undefined],
        ["/profiles/work/tasks?tag=%20work%20", 200, undefined],
        ["/profiles/work/catalog?project=Inbox", 200, undefined],
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

it.effect(
  "filters by a Project named two spaces, exactly, on /tasks and the Catalog (seat F7)",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { request, credential } = yield* fixture;
        for (const [title, project_name] of [
          ["Spaced", "  "],
          ["One space", " "],
          ["Plain", "Errands"],
        ])
          expect(
            (yield* request(
              "POST",
              "/profiles/work/tasks",
              { title, project_name },
              credential,
            )).status,
          ).toBe(200);
        const titles = (body: unknown) =>
          (body as { title: string }[]).map((task) => task.title);
        const list = yield* request(
          "GET",
          "/profiles/work/tasks?project=%20%20",
          undefined,
          credential,
        );
        expect([list.status, titles(list.body)]).toEqual([200, ["Spaced"]]);
        const catalog = Schema.decodeUnknownSync(CatalogReply)(
          (yield* request(
            "GET",
            "/profiles/work/catalog?project=%20%20&tasks=matching",
            undefined,
            credential,
          )).body,
        );
        if (catalog.unchanged) throw new Error("expected lists");
        expect(catalog.tasks.map((task) => task.title)).toEqual(["Spaced"]);
      }),
    ),
);

it.effect("carries operation_position on writes that committed History", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { request, credential, opLog } = yield* fixture;
      const committedMax = () => opLog()?.seq;
      const created = yield* request(
        "POST",
        "/profiles/work/tasks",
        { title: "One" },
        credential,
      );
      const task = created.body as {
        id: string;
        row_version: number;
        operation_position?: { generation: string; seq: number };
      };
      expect(task.operation_position).toEqual({
        generation: "initial",
        seq: committedMax(),
      });
      const catalog = Schema.decodeUnknownSync(CatalogReply)(
        (yield* request("GET", "/profiles/work/catalog", undefined, credential))
          .body,
      );
      if (catalog.unchanged) throw new Error("expected lists");
      expect(catalog.position.seq).toBeGreaterThanOrEqual(
        task.operation_position?.seq ?? 0,
      );
      expect(catalog.tasks.map((t) => t.id)).toContain(task.id);

      // A Conflict and a dry run commit nothing and carry no field.
      const conflict = yield* request(
        "PATCH",
        `/profiles/work/tasks/${task.id}`,
        { from_version: 99, changes: { title: "Stale" } },
        credential,
      );
      expect(conflict.status).toBe(409);
      expect(conflict.body).not.toHaveProperty("operation_position");
      const preview = yield* request(
        "DELETE",
        `/profiles/work/tasks/${task.id}?from_version=${task.row_version}&dry_run=true`,
        undefined,
        credential,
      );
      expect(preview.status).toBe(200);
      expect(preview.body).not.toHaveProperty("operation_position");

      // A request that commits several operations carries the highest.
      const before = committedMax() ?? 0;
      const imported = yield* request(
        "POST",
        "/profiles/work/import",
        {
          items: [
            { external_id: "a", title: "Imported A" },
            { external_id: "b", title: "Imported B" },
          ],
        },
        credential,
      );
      expect(imported.status).toBe(200);
      const report = imported.body as {
        operation_position?: { generation: string; seq: number };
      };
      expect(report.operation_position).toEqual({
        generation: "initial",
        seq: committedMax(),
      });
      expect((report.operation_position?.seq ?? 0) - before).toBe(2);
      const dryImport = yield* request(
        "POST",
        "/profiles/work/import",
        { items: [{ external_id: "c", title: "Not yet" }], dry_run: true },
        credential,
      );
      expect(dryImport.body).not.toHaveProperty("operation_position");

      const token = (yield* request(
        "POST",
        "/auth/tokens",
        { name: "seq token", profile: null, scope: "read-only" },
        credential,
      )).body as { operation_position?: { generation: string; seq: number } };
      expect(token.operation_position).toEqual({
        generation: "initial",
        seq: committedMax(),
      });
    }),
  ),
);

it.effect(
  "a write reply names its generation: the seat's F8 schedule across a restore",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { request, credential } = yield* fixture;
        type Position = { generation: string; seq: number };
        type Written = {
          id: string;
          row_version: number;
          title: string;
          operation_position?: Position;
        };
        const catalog = () =>
          Effect.map(
            request("GET", "/profiles/work/catalog", undefined, credential),
            ({ body }) => {
              const reply = Schema.decodeUnknownSync(CatalogReply)(body);
              if (reply.unchanged) throw new Error("expected lists");
              return reply;
            },
          );
        // The client rule: a write is covered by a Catalog only when the
        // generations are equal and its seq is at or below the position's.
        const covered = (write: Position | undefined, at: Position) =>
          write !== undefined &&
          write.generation === at.generation &&
          write.seq <= at.seq;
        let task = (yield* request(
          "POST",
          "/profiles/work/tasks",
          { title: "X-0" },
          credential,
        )).body as Written;
        const saved = (yield* request(
          "POST",
          "/snapshots",
          { reason: "before the edits" },
          credential,
        )).body as { id: string };
        for (const title of ["X-1", "X-2", "X-3", "X-4", "X-5"]) {
          task = (yield* request(
            "PATCH",
            `/profiles/work/tasks/${task.id}`,
            { from_version: task.row_version, changes: { title } },
            credential,
          )).body as Written;
        }
        // One generation: the write and the Catalog after it agree.
        const held = yield* catalog();
        expect(held.position.generation).toBe("initial");
        expect(covered(task.operation_position, held.position)).toBe(true);
        // 1. The client holds {initial, n} showing X-5.
        // 2. Another request restores the Snapshot.
        const restore = (yield* request(
          "POST",
          `/snapshots/${saved.id}/restore`,
          { dry_run: false },
          credential,
        )).body as { generation: string; operation_position?: Position };
        // The restore's own position names the generation its body reports.
        expect(restore.operation_position?.generation).toBe(restore.generation);
        // 3. Before seeing the reload, the client writes.
        const current = (yield* request(
          "GET",
          `/profiles/work/tasks/${task.id}`,
          undefined,
          credential,
        )).body as Written;
        const write = (yield* request(
          "PATCH",
          `/profiles/work/tasks/${task.id}`,
          {
            from_version: current.row_version,
            changes: { title: "client write" },
          },
          credential,
        )).body as Written;
        // Its seq alone would read as covered by the old Catalog; its
        // generation says it is not: read.
        expect([
          write.operation_position?.generation,
          (write.operation_position?.seq ?? 0) <= held.position.seq,
          covered(write.operation_position, held.position),
        ]).toEqual([restore.generation, true, false]);
        // 4. The later Catalog is in the write's generation and covers it.
        const later = yield* catalog();
        expect([
          later.position.generation,
          covered(write.operation_position, later.position),
          later.tasks.find((t) => t.id === task.id)?.title,
        ]).toEqual([restore.generation, true, "client write"]);
      }),
    ),
);
