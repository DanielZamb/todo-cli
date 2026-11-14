// ADR-0006 (amended 2026-11-13): planning views and their counts take "today"
// from the zone sent with the read, or the server's own zone when none is
// sent. Every server here names its zone; nothing depends on the machine's.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "@effect/vitest";
import { createTask, ensureProfile } from "@todo/domain/commands";
import { openStore } from "@todo/domain/store";
import { Context, Effect, Layer } from "effect";
import { HttpServer } from "effect/http";
import { serverLayer } from "../src/server.ts";

/** A server in `timeZone` with one Task due on each of `dues`. */
const serverIn = (timeZone: string, dues: readonly string[]) =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-planning-zone-"))),
      (directory) =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    );
    const path = join(directory, "scratch.db");
    const store = yield* Effect.acquireRelease(openStore({ path }), (store) =>
      Effect.orDie(store.close()),
    );
    yield* store.auth.setupOwner("planning zone");
    const profile = yield* ensureProfile(store, "work");
    const { credential } = yield* store.auth.signIn("planning zone");
    for (const due of dues)
      yield* createTask(
        store,
        { credential, profile: profile.id },
        { title: `Due ${due}`, due },
      );
    const context = yield* Layer.build(
      serverLayer({ path, port: 0, timeZone }),
    );
    const base = HttpServer.formatAddress(
      Context.get(context, HttpServer.HttpServer).address,
    );
    const get = (route: string) =>
      Effect.tryPromise(async () => {
        const response = await fetch(base + route, {
          headers: { Authorization: `Bearer ${credential}` },
        });
        return {
          status: response.status,
          body: (await response.json()) as Record<string, unknown>,
        };
      });
    /** [day, today count, overdue count] from the Catalog. */
    const catalog = (query: string) =>
      Effect.map(get(`/profiles/work/catalog?${query}`), ({ body }) => {
        const counts = body.counts as { today: number; overdue: number };
        return [body.day, counts.today, counts.overdue];
      });
    /** The Today view's Overdue and Due today group sizes. */
    const today = (query: string) =>
      Effect.map(get(`/profiles/work/views/today?${query}`), ({ body }) =>
        (body.groups as { name: string; tasks: unknown[] }[])
          .filter((group) => group.name !== "Scheduled today")
          .map((group) => [group.name, group.tasks.length]),
      );
    return { get, catalog, today };
  });
const at = (utc: string) => `now=${encodeURIComponent(utc)}`;

it.effect(
  "a server in America/Bogota with no zone sent keeps its own date at 18:59 and 19:01",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* serverIn("America/Bogota", [
          "2026-11-12",
          "2026-11-13",
          "2026-11-14",
        ]);
        // 18:59 and 19:01 in Bogota are 23:59Z and 00:01Z: the UTC date moves,
        // Bogota's does not.
        expect(yield* server.catalog(at("2026-11-13T23:59:00Z"))).toEqual([
          "2026-11-13",
          2,
          1,
        ]);
        expect(yield* server.catalog(at("2026-11-14T00:01:00Z"))).toEqual([
          "2026-11-13",
          2,
          1,
        ]);
        expect(yield* server.today(at("2026-11-14T00:01:00Z"))).toEqual([
          ["Overdue", 1],
          ["Due today", 1],
        ]);
        // Bogota's midnight moves it.
        expect(yield* server.catalog(at("2026-11-14T05:01:00Z"))).toEqual([
          "2026-11-14",
          3,
          2,
        ]);
        expect(yield* server.today(at("2026-11-14T05:01:00Z"))).toEqual([
          ["Overdue", 2],
          ["Due today", 1],
        ]);
      }),
    ),
);

it.effect("a client that sends another zone gets its own date", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* serverIn("America/Bogota", [
        "2026-11-12",
        "2026-11-13",
        "2026-11-14",
      ]);
      const now = at("2026-11-13T23:59:00Z");
      // 08:59 on the 14th in Tokyo, 18:59 on the 13th in Bogota.
      expect(yield* server.catalog(`${now}&time_zone=Asia%2FTokyo`)).toEqual([
        "2026-11-14",
        3,
        2,
      ]);
      expect(yield* server.today(`${now}&time_zone=Asia%2FTokyo`)).toEqual([
        ["Overdue", 2],
        ["Due today", 1],
      ]);
      expect(yield* server.catalog(now)).toEqual(["2026-11-13", 2, 1]);
    }),
  ),
);

it.effect(
  "a zone with a daylight-saving change keeps the local date on both sides of it",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        // New York leaves daylight time at 02:00 EDT on 2026-11-01 (UTC-4 to UTC-5).
        const server = yield* serverIn("America/New_York", [
          "2026-10-31",
          "2026-11-01",
          "2026-11-02",
        ]);
        const days = [];
        for (const utc of [
          "2026-11-01T03:59:00Z", // 23:59 EDT, Oct 31
          "2026-11-01T04:01:00Z", // 00:01 EDT, Nov 1
          "2026-11-02T04:59:00Z", // 23:59 EST, Nov 1 (UTC-4 would say Nov 2)
          "2026-11-02T05:01:00Z", // 00:01 EST, Nov 2
        ])
          days.push(yield* server.catalog(at(utc)));
        expect(days).toEqual([
          ["2026-10-31", 1, 0],
          ["2026-11-01", 2, 1],
          ["2026-11-01", 2, 1],
          ["2026-11-02", 3, 2],
        ]);
      }),
    ),
);

it.effect("the date line: one instant, three dates", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* serverIn("Pacific/Pago_Pago", [
        "2026-11-12",
        "2026-11-13",
        "2026-11-14",
        "2026-11-15",
      ]);
      // 23:00 on the 13th in Pago Pago (UTC-11), the 14th in UTC, 04:00 on
      // the 15th in Kiritimati (UTC+14).
      const now = at("2026-11-14T10:00:00Z");
      expect(yield* server.catalog(now)).toEqual(["2026-11-13", 2, 1]);
      expect(yield* server.catalog(`${now}&time_zone=Etc%2FUTC`)).toEqual([
        "2026-11-14",
        3,
        2,
      ]);
      expect(
        yield* server.catalog(`${now}&time_zone=Pacific%2FKiritimati`),
      ).toEqual(["2026-11-15", 4, 3]);
    }),
  ),
);

it.effect("an unknown zone is refused as invalid_args on both reads", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* serverIn("America/Bogota", []);
      const refused = [];
      for (const route of [
        "/profiles/work/catalog?time_zone=Mars%2FOlympus",
        "/profiles/work/views/today?time_zone=Mars%2FOlympus",
        "/profiles/work/catalog?time_zone=%2B05%3A00",
      ]) {
        const reply = yield* server.get(route);
        refused.push([reply.status, reply.body.code]);
      }
      expect(refused).toEqual([
        [400, "invalid_args"],
        [400, "invalid_args"],
        [400, "invalid_args"],
      ]);
    }),
  ),
);

it.effect("known's day check uses the day the read uses", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* serverIn("America/Bogota", ["2026-11-13"]);
      const first = (yield* server.get(
        `/profiles/work/catalog?${at("2026-11-13T23:59:00Z")}`,
      )).body as {
        day: string;
        stamp: string;
        position: { generation: string; seq: number };
      };
      expect(first.day).toBe("2026-11-13");
      const known = `known_generation=${first.position.generation}&known_seq=${first.position.seq}&known_day=${first.day}&known_stamp=${first.stamp}`;
      const reply = (query: string) =>
        Effect.map(
          server.get(`/profiles/work/catalog?${known}&${query}`),
          ({ body }) => [body.unchanged, body.day],
        );
      // Past the UTC date, inside Bogota's: still the same day, unchanged.
      expect(yield* reply(at("2026-11-14T00:01:00Z"))).toEqual([
        true,
        "2026-11-13",
      ]);
      // Bogota's midnight: a new day, a full reply.
      expect(yield* reply(at("2026-11-14T05:01:00Z"))).toEqual([
        false,
        "2026-11-14",
      ]);
      // A client zone whose day differs: a full reply on its day.
      expect(
        yield* reply(`${at("2026-11-14T00:01:00Z")}&time_zone=Asia%2FTokyo`),
      ).toEqual([false, "2026-11-14"]);
    }),
  ),
);

it("reads the server's own zone from the process, which TZ sets", () => {
  const script = `import { processTimeZone } from ${JSON.stringify(resolve(import.meta.dirname, "../../../packages/domain/src/planning-day.ts"))}; console.log(processTimeZone());`;
  const zone = (TZ: string) =>
    spawnSync(process.execPath, ["-e", script], {
      env: { ...process.env, TZ },
      encoding: "utf8",
    }).stdout.trim();
  expect(
    ["America/Bogota", "Asia/Tokyo", "Pacific/Kiritimati", "UTC"].map(zone),
  ).toEqual(["America/Bogota", "Asia/Tokyo", "Pacific/Kiritimati", "UTC"]);
});
