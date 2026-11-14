import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import {
  type CatalogChanged,
  type CatalogQuery,
  CatalogReads,
  type CatalogReply,
  ClientReads,
  Instant,
  Profile,
  type ProfileId,
  type TaskId,
} from "@todo/domain";
import {
  type OperationStore,
  openStore,
  TaskCommands,
} from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { vi } from "vitest";

const instant = Schema.decodeUnknownSync(Instant);
const start = "2026-11-13T15:00:00Z";
const profileOf = (id: string, name: string) =>
  Schema.decodeUnknownSync(Profile)({
    id,
    name,
    created_at: start,
    updated_at: start,
  });
const work = profileOf("work", "Work");
const personal = profileOf("personal", "Personal");
const date = (value: string) => ({ kind: "date" as const, date: value });

type Fixture = {
  readonly store: OperationStore;
  readonly credential: string;
  readonly request: { credential: string; profile: ProfileId };
  readonly ids: Record<string, TaskId>;
  readonly catalog: (
    query?: CatalogQuery,
  ) => Effect.Effect<CatalogReply, unknown>;
};

const withFixture = <A, E>(body: (fixture: Fixture) => Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-catalog-test-"))),
    (directory) =>
      Effect.acquireUseRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (store) =>
          Effect.gen(function* () {
            yield* TestClock.setTime(Date.parse(start));
            yield* store.putProfile(work);
            yield* store.putProfile(personal);
            yield* store.auth.setupOwner("catalog scratch only");
            const { credential } = yield* store.auth.signIn(
              "catalog scratch only",
            );
            const request = { credential, profile: work.id };
            const commands = new TaskCommands(store);
            const ids: Record<string, TaskId> = {};
            const add = (name: string, input: Record<string, unknown>) =>
              Effect.gen(function* () {
                yield* TestClock.adjust("1 minute");
                const result = yield* commands.create(request, {
                  source: "agent",
                  ...input,
                } as never);
                if (result.outcome !== "committed")
                  return yield* Effect.die(new Error(JSON.stringify(result)));
                ids[name] = result.task.id;
                return result.task;
              });
            const close = (name: string, action: "complete" | "cancel") =>
              Effect.gen(function* () {
                const id = ids[name] as TaskId;
                const current = yield* commands.get({
                  ...request,
                  task_id: id,
                });
                const result = yield* commands.transition(
                  { ...request, task_id: id },
                  { from_version: current?.row_version ?? 0, action } as never,
                );
                if (result.outcome !== "committed")
                  return yield* Effect.die(new Error(JSON.stringify(result)));
              });
            yield* add("T1", {
              title: "Pay rent",
              priority: "P1",
              due_at: date("2026-11-12"),
              scheduled_at: date("2026-11-13"),
              project_name: "Home",
              tag_names: ["home"],
            });
            yield* add("T2", {
              title: "Call bank",
              priority: "P2",
              due_at: date("2026-11-13"),
            });
            yield* add("T3", {
              title: "Plan trip",
              priority: "P3",
              scheduled_at: date("2026-11-20"),
              project_name: "Travel",
              tag_names: ["travel"],
            });
            yield* add("T4", {
              title: "Read book",
              priority: "P4",
              tag_names: ["home"],
            });
            yield* add("T5", { title: "Old task", priority: "P1" });
            yield* close("T5", "complete");
            yield* add("T6", {
              title: "Dropped",
              priority: "P2",
              due_at: date("2026-11-01"),
            });
            yield* close("T6", "cancel");
            yield* add("T7", {
              title: "Blocked thing",
              priority: "P2",
              depends_on: [ids.T2],
            });
            const reads = new CatalogReads(store);
            return yield* body({
              store,
              credential,
              request,
              ids,
              catalog: (query = {}) =>
                reads.read(request, { now: instant(start), ...query }),
            });
          }),
        (store) => Effect.orDie(store.close()),
      ),
    (directory) => Effect.sync(() => rmSync(directory, { recursive: true })),
  );

const changed = (reply: CatalogReply): CatalogChanged => {
  if (reply.unchanged) throw new Error("expected a changed Catalog");
  return reply;
};
const named = (fixture: Fixture, reply: CatalogChanged) => {
  const titles = new Map(
    Object.entries(fixture.ids).map(([name, id]) => [id, name]),
  );
  return {
    groups: reply.view.groups.map((group) => [
      group.name,
      group.task_ids.map((id) => titles.get(id)),
    ]),
    tasks: reply.tasks.map((task) => titles.get(task.id)),
  };
};

it.effect("counts each open Task once per view and groups each Task once", () =>
  withFixture((fixture) =>
    Effect.gen(function* () {
      const today = changed(yield* fixture.catalog({ view: "today" }));
      expect(today.counts).toEqual({
        all: 5,
        today: 2,
        overdue: 1,
        scheduled: 2,
        inbox: 2,
      });
      expect(named(fixture, today).groups).toEqual([
        ["Overdue", ["T1"]],
        ["Due today", ["T2"]],
        ["Scheduled today", []],
      ]);
      expect(today.day).toBe("2026-11-13");
      expect(today.projects.map((p) => [p.name, p.open_task_count])).toEqual([
        ["Home", 1],
        ["Travel", 1],
      ]);
      expect(today.tags.map((t) => [t.name, t.open_task_count])).toEqual([
        ["home", 2],
        ["travel", 1],
      ]);
      expect(today.profiles.map((p) => p.name)).toEqual(["Personal", "Work"]);

      // The regression controls: what the two apps compute on the same data today.
      const reads = new ClientReads(fixture.store);
      const view = yield* reads.view(fixture.request, "today", instant(start));
      expect(
        view.groups.flatMap((g) => g.tasks).filter((t) => t.status === "open")
          .length,
      ).toBe(3);
      expect(
        (yield* new TaskCommands(fixture.store).list(fixture.request)).length,
      ).toBe(7);

      const all = changed(yield* fixture.catalog());
      expect(named(fixture, all)).toEqual({
        groups: [
          ["P1", ["T5", "T1"]],
          ["P2", ["T7", "T6", "T2"]],
          ["P3", ["T3"]],
          ["P4", ["T4"]],
        ],
        tasks: ["T5", "T1", "T7", "T6", "T2", "T3", "T4"],
      });
      const t7 = all.tasks.find((task) => task.id === fixture.ids.T7);
      expect([t7?.blocked, t7?.ready, t7?.open_blocker_count]).toEqual([
        true,
        false,
        1,
      ]);
    }),
  ),
);

it.effect("combines Project, Tag, filters and search by AND", () =>
  withFixture((fixture) =>
    Effect.gen(function* () {
      const home = changed(yield* fixture.catalog());
      const project = home.projects.find((p) => p.name === "Home")?.id;
      const tag = home.tags.find((t) => t.name === "home")?.id;
      const byTag = changed(
        yield* fixture.catalog({
          tasks: "matching",
          ...(tag ? { tag_id: tag } : {}),
        }),
      );
      expect(named(fixture, byTag).tasks).toEqual(["T1", "T4"]);
      const both = changed(
        yield* fixture.catalog({
          tasks: "matching",
          ...(tag ? { tag_id: tag } : {}),
          ...(project ? { project_id: project } : {}),
        }),
      );
      expect(named(fixture, both)).toEqual({
        groups: [
          ["P1", ["T1"]],
          ["P2", []],
          ["P3", []],
          ["P4", []],
        ],
        tasks: ["T1"],
      });
      expect(both.counts).toEqual(home.counts);
      const search = changed(
        yield* fixture.catalog({
          view: "today",
          text: "rent",
          tasks: "matching",
        }),
      );
      expect(named(fixture, search).groups).toEqual([
        ["Overdue", ["T1"]],
        ["Due today", []],
        ["Scheduled today", []],
      ]);
      expect(search.tasks[0]?.search_matches).toBeDefined();
      expect(search.counts).toEqual(home.counts);
      const elsewhere = changed(
        yield* fixture.catalog({
          tasks: "matching",
          project_id: "not-a-project" as never,
        }),
      );
      expect(elsewhere.tasks).toEqual([]);
    }),
  ),
);

it.effect("reflects History up to its position, and a commit moves it", () =>
  withFixture((fixture) =>
    Effect.gen(function* () {
      const db: { query: (sql: string) => { get: () => unknown } } =
        Reflect.get(fixture.store, "db");
      const maxSeq = () =>
        (
          db.query("SELECT max(seq) AS seq FROM op_log").get() as {
            seq: number;
          }
        ).seq;
      const before = changed(yield* fixture.catalog());
      expect(before.position).toEqual({ generation: "initial", seq: maxSeq() });
      const commands = new TaskCommands(fixture.store);
      const t2 = yield* commands.get({
        ...fixture.request,
        task_id: fixture.ids.T2 as TaskId,
      });
      yield* commands.transition(
        { ...fixture.request, task_id: fixture.ids.T2 as TaskId },
        { from_version: t2?.row_version ?? 0, action: "complete" } as never,
      );
      const after = changed(yield* fixture.catalog());
      expect(after.position.seq).toBe(maxSeq());
      expect(after.position.seq).toBeGreaterThan(before.position.seq);
      const t7 = after.tasks.find((task) => task.id === fixture.ids.T7);
      expect([t7?.ready, t7?.open_blocker_count]).toEqual([true, 0]);
      expect(after.counts.today).toBe(1);
    }),
  ),
);

it.effect("answers unchanged only when nothing can have changed", () =>
  withFixture((fixture) =>
    Effect.gen(function* () {
      const first = changed(yield* fixture.catalog({ view: "today" }));
      const known = {
        view: "today" as const,
        known_generation: first.position.generation,
        known_seq: first.position.seq,
        known_day: first.day,
      };
      expect(yield* fixture.catalog(known)).toEqual({
        unchanged: true,
        position: first.position,
        day: "2026-11-13",
      });
      // A rejected attempt (a stale Version) changes nothing.
      const commands = new TaskCommands(fixture.store);
      const stale = yield* commands.edit(
        { ...fixture.request, task_id: fixture.ids.T4 as TaskId },
        { from_version: 99, changes: { title: "Stale" } } as never,
      );
      expect(stale.outcome).toBe("rejected");
      const afterRejection = yield* fixture.catalog(known);
      expect(afterRejection.unchanged).toBe(true);
      expect(afterRejection.position.seq).toBeGreaterThan(first.position.seq);
      // Another day, another generation or a later known seq is never unchanged.
      expect(
        (yield* fixture.catalog({
          ...known,
          now: instant("2026-11-14T15:00:00Z"),
        })).unchanged,
      ).toBe(false);
      expect(
        (yield* fixture.catalog({ ...known, known_generation: "other" }))
          .unchanged,
      ).toBe(false);
      expect(
        (yield* fixture.catalog({
          ...known,
          known_seq: first.position.seq + 1000,
        })).unchanged,
      ).toBe(false);
      // A commit in another Profile changes its count in the Profile list.
      const other = yield* commands.create(
        { credential: fixture.credential, profile: personal.id },
        { title: "Elsewhere", source: "agent" } as never,
      );
      expect(other.outcome).toBe("committed");
      expect((yield* fixture.catalog(known)).unchanged).toBe(false);
      // A commit here.
      const current = changed(yield* fixture.catalog({ view: "today" }));
      const again = {
        ...known,
        known_seq: current.position.seq,
      };
      expect((yield* fixture.catalog(again)).unchanged).toBe(true);
      yield* commands.create(fixture.request, {
        title: "New",
        source: "agent",
      } as never);
      expect((yield* fixture.catalog(again)).unchanged).toBe(false);
      const partial = yield* Effect.flip(
        fixture.catalog({ known_generation: "initial" }),
      );
      expect(partial).toMatchObject({
        _tag: "CatalogUsageError",
        code: "invalid_args",
      });
    }),
  ),
);

it.effect("never answers unchanged after a change, over random histories", () =>
  withFixture((fixture) =>
    Effect.gen(function* () {
      const commands = new TaskCommands(fixture.store);
      const lists = (reply: CatalogChanged) =>
        JSON.stringify({ ...reply, position: null, now: null });
      let seed = 1113;
      const next = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % 5;
      };
      let unchangedSeen = 0;
      let changedSeen = 0;
      for (let step = 0; step < 60; step++) {
        const before = changed(yield* fixture.catalog({ view: "today" }));
        const choice = next();
        if (choice === 0)
          yield* commands.create(fixture.request, {
            title: `Step ${step}`,
            source: "agent",
          } as never);
        if (choice === 1)
          yield* commands.create(
            { credential: fixture.credential, profile: personal.id },
            { title: `Other ${step}`, source: "agent" } as never,
          );
        if (choice === 2)
          yield* commands.edit(
            { ...fixture.request, task_id: fixture.ids.T4 as TaskId },
            { from_version: 999, changes: { title: "Stale" } } as never,
          );
        if (choice === 3)
          yield* Effect.exit(
            fixture.store.auth.authenticate({
              ...fixture.request,
              credential: "invalid",
              access: "read",
            }),
          );
        const reply = yield* fixture.catalog({
          view: "today",
          known_generation: before.position.generation,
          known_seq: before.position.seq,
          known_day: before.day,
        });
        const full = changed(yield* fixture.catalog({ view: "today" }));
        if (reply.unchanged) {
          unchangedSeen++;
          expect(lists(full)).toBe(lists(before));
        } else changedSeen++;
        if (choice === 0 || choice === 1) expect(reply.unchanged).toBe(false);
      }
      expect(unchangedSeen).toBeGreaterThan(0);
      expect(changedSeen).toBeGreaterThan(0);
    }),
  ),
);

it.effect("uses the client's day when a time zone is sent", () =>
  withFixture((fixture) =>
    Effect.gen(function* () {
      const commands = new TaskCommands(fixture.store);
      const zone = (time_zone: string) => ({ time_zone });
      // A Bogota evening instant: 22:00 on 13 November there, 03:00 on 14 November UTC.
      yield* commands.create(fixture.request, {
        title: "Evening call",
        priority: "P3",
        source: "agent",
        due_at: {
          kind: "instant",
          utc: "2026-11-14T03:00:00Z",
          time_zone: "America/Bogota",
        },
      } as never);
      const at = (now: string, extra = {}) =>
        Effect.map(
          fixture.catalog({ view: "today", now: instant(now), ...extra }),
          (reply) => {
            const value = changed(reply);
            return [value.day, value.counts.today, value.counts.overdue];
          },
        );
      // 18:59 and 19:01 in Bogota (UTC-5, no daylight saving).
      expect(yield* at("2026-11-13T23:59:00Z")).toEqual(["2026-11-13", 2, 1]);
      expect(yield* at("2026-11-14T00:01:00Z")).toEqual(["2026-11-14", 3, 2]);
      expect(yield* at("2026-11-13T23:59:00Z", zone("America/Bogota"))).toEqual(
        ["2026-11-13", 3, 1],
      );
      expect(yield* at("2026-11-14T00:01:00Z", zone("America/Bogota"))).toEqual(
        ["2026-11-13", 3, 1],
      );
      const unknown = yield* Effect.flip(
        fixture.catalog({ time_zone: "Mars/Olympus" }),
      );
      expect(unknown).toMatchObject({
        _tag: "UnknownTimeZone",
        code: "invalid_args",
      });
      const view = yield* Effect.flip(
        new ClientReads(fixture.store).view(
          fixture.request,
          "today",
          instant(start),
          "Mars/Olympus",
        ),
      );
      expect(view).toMatchObject({ _tag: "UnknownTimeZone" });
    }),
  ),
);

it.effect("keeps the local day across a daylight-saving change", () =>
  withFixture((fixture) =>
    Effect.gen(function* () {
      const commands = new TaskCommands(fixture.store);
      // New York leaves daylight saving at 06:00 UTC on 1 November 2026.
      for (const [title, utc] of [
        ["Before the change", "2026-11-01T05:30:00Z"],
        ["Late that night", "2026-11-02T04:59:00Z"],
      ] as const)
        yield* commands.create(fixture.request, {
          title,
          priority: "P3",
          source: "agent",
          due_at: { kind: "instant", utc, time_zone: "America/New_York" },
        } as never);
      yield* commands.create(fixture.request, {
        title: "Dated",
        priority: "P3",
        source: "agent",
        due_at: date("2026-11-01"),
      } as never);
      const at = (now: string, time_zone?: string) =>
        Effect.map(
          fixture.catalog({
            view: "today",
            now: instant(now),
            ...(time_zone ? { time_zone } : {}),
          }),
          (reply) => {
            const value = changed(reply);
            return [value.day, value.counts.today, value.counts.overdue];
          },
        );
      // 01:59 EDT and 01:01 EST: the same local day either side of the change.
      expect(yield* at("2026-11-01T05:59:00Z", "America/New_York")).toEqual([
        "2026-11-01",
        3,
        0,
      ]);
      expect(yield* at("2026-11-01T06:01:00Z", "America/New_York")).toEqual([
        "2026-11-01",
        3,
        0,
      ]);
      // 23:30 EST on 1 November: all three are due today there; in UTC it is 2 November.
      expect(yield* at("2026-11-02T04:30:00Z", "America/New_York")).toEqual([
        "2026-11-01",
        3,
        0,
      ]);
      expect(yield* at("2026-11-02T04:30:00Z")).toEqual(["2026-11-02", 3, 2]);
    }),
  ),
);

it.effect(
  "decodes no History, and only the Tasks it returns without Dependencies",
  () =>
    withFixture((fixture) =>
      Effect.gen(function* () {
        const commands = new TaskCommands(fixture.store);
        const elsewhere = {
          credential: fixture.credential,
          profile: personal.id,
        };
        for (const title of ["One", "Two", "Three"])
          yield* commands.create(elsewhere, {
            title,
            source: "agent",
            ...(title === "Three" ? { due_at: date("2026-11-13") } : {}),
          } as never);
        const reads = new CatalogReads(fixture.store);
        const isObject = (value: unknown): value is Record<string, unknown> =>
          typeof value === "object" && value !== null;
        const decodes = (query: CatalogQuery, request = elsewhere) =>
          Effect.gen(function* () {
            const parse = JSON.parse;
            const spy = vi.spyOn(JSON, "parse");
            try {
              const reply = changed(
                yield* reads.read(request, { now: instant(start), ...query }),
              );
              const parsed = spy.mock.calls.map(
                ([text]) => parse(text) as unknown,
              );
              return {
                returned: reply.tasks.length,
                tasks: parsed.filter(
                  (value) => isObject(value) && "title" in value,
                ).length,
                history: parsed.filter(
                  (value) => isObject(value) && "occurred_at" in value,
                ).length,
              };
            } finally {
              spy.mockRestore();
            }
          });
        expect(yield* decodes({ view: "inbox", tasks: "matching" })).toEqual({
          returned: 2,
          tasks: 2,
          history: 0,
        });
        expect(yield* decodes({ view: "inbox" })).toEqual({
          returned: 3,
          tasks: 3,
          history: 0,
        });
        // With a Dependency in the Profile, Ready and remaining energy need the
        // whole graph, so every visible Task is decoded once, as GET /tasks does.
        expect(
          yield* decodes({ view: "today", tasks: "matching" }, fixture.request),
        ).toEqual({ returned: 2, tasks: 7, history: 0 });
      }),
    ),
);

it.effect(
  "lists Profiles, Projects and Tags in name order on the existing reads",
  () =>
    withFixture((fixture) =>
      Effect.gen(function* () {
        const commands = new TaskCommands(fixture.store);
        for (const [title, project, tag] of [
          ["a", "Project 10", "b10"],
          ["b", "project 9", "B9"],
          ["c", "Éclair", "e"],
          ["d", "eclair", "é"],
        ] as const)
          yield* commands.create(fixture.request, {
            title,
            source: "agent",
            project_name: project,
            tag_names: [tag],
          } as never);
        const reads = new ClientReads(fixture.store);
        expect(
          (yield* reads.projects(fixture.request)).map((p) => p.name),
        ).toEqual([
          "eclair",
          "Éclair",
          "Home",
          "project 9",
          "Project 10",
          "Travel",
        ]);
        expect((yield* reads.tags(fixture.request)).map((t) => t.name)).toEqual(
          ["b9", "b10", "e", "é", "home", "travel"],
        );
        expect(
          (yield* reads.profiles(fixture.credential)).map((p) => p.name),
        ).toEqual(["Personal", "Work"]);
      }),
    ),
);
