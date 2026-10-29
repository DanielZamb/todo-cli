import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { AuthError, nextOccurrenceTime, Series } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import {
  finish,
  monthly,
  recurrence,
  start,
  weekly,
} from "./recurrence-fixtures.ts";
import { actor, later, profile, task, time, work } from "./store-fixtures.ts";

const scratch = <A, E>(run: (path: string) => Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-c03-review-"))),
    (dir) => run(join(dir, "scratch.db")),
    (dir) => Effect.sync(() => rmSync(dir, { recursive: true, force: true })),
  );
const usingStore = <A, E>(
  path: string,
  run: (
    store: Effect.Success<ReturnType<typeof openStore>>,
  ) => Effect.Effect<A, E>,
) =>
  Effect.acquireUseRelease(openStore({ path }), run, (store) =>
    Effect.orDie(store.close()),
  );

describe("C03 review regressions", () => {
  it.effect(
    "advances an existing v2 migrated Series whose original task has no Occurrence",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          const db = new Database(path);
          try {
            db.exec(
              readFileSync(
                new URL("fixtures/v2-recurrence.sql", import.meta.url),
                "utf8",
              ),
            );
            expect(db.query("PRAGMA user_version").get()).toEqual({
              user_version: 2,
            });
          } finally {
            db.close();
          }
          yield* usingStore(path, (store) =>
            Effect.gen(function* () {
              expect(
                (yield* store.tasks()).find((t) => t.id === "legacy-1")
                  ?.occurrence,
              ).toBe(null);
              expect(
                (yield* store.finishTask(
                  finish("legacy-1", "legacy-next", "complete", 7),
                )).outcome,
              ).toBe("committed");
              expect(
                (yield* store.tasks()).map((t) => [
                  t.id,
                  t.status,
                  t.occurrence?.date ?? null,
                ]),
              ).toEqual([
                ["legacy-1", "done", null],
                ["legacy-2", "done", null],
                ["legacy-next", "open", "2026-10-28"],
              ]);
              expect(
                (yield* store.tasks()).find((t) => t.id === "legacy-next")
                  ?.scheduled_at,
              ).toEqual({
                kind: "instant",
                utc: "2026-10-28T14:00:00Z",
                time_zone: "UTC",
              });
              const before = yield* store.tasks();
              expect(yield* store.rebuild()).toEqual(before);
            }),
          );
        }),
      ),
  );

  it.effect(
    "starts a Series with existing Project and Tag definitions in its Profile",
    () =>
      scratch((path) =>
        usingStore(path, (store) =>
          Effect.gen(function* () {
            yield* store.putProfile(work);
            const project = {
              id: "project",
              profile_id: profile,
              name: "Port",
              created_at: time,
              updated_at: time,
            };
            const tag = { id: "tag", profile_id: profile, name: "focus" };
            yield* store.append({
              actor,
              profile,
              event: {
                kind: "TaskCreated",
                entity_version: 1,
                occurred_at: time,
                task: { ...task, project_id: "project", tags: ["tag"] },
                series: null,
                project,
                tags: [tag],
              },
            });
            for (const [id, defaults] of [
              ["with-project", { project_id: "project", tags: [] }],
              ["with-tag", { project_id: null, tags: ["tag"] }],
              ["with-both", { project_id: "project", tags: ["tag"] }],
            ] as const) {
              const series = Schema.decodeUnknownSync(Series)({
                ...weekly,
                id,
                task: { ...weekly.task, ...defaults },
              });
              expect(
                (yield* store.startSeries(start(series, id))).outcome,
              ).toBe("committed");
            }
            expect(
              (yield* store.tasks()).map((t) => [t.id, t.project_id, t.tags]),
            ).toEqual([
              ["task-1", "project", ["tag"]],
              ["with-both", "project", ["tag"]],
              ["with-project", "project", []],
              ["with-tag", null, ["tag"]],
            ]);
            const before = yield* store.tasks();
            expect(yield* store.rebuild()).toEqual(before);
          }),
        ),
      ),
  );

  it.effect(
    "creates a visible successor after Revert deletes the previous successor",
    () =>
      scratch((path) =>
        usingStore(path, (store) =>
          Effect.gen(function* () {
            yield* store.putProfile(work);
            yield* store.startSeries(start(weekly, "w1"));
            const completed = yield* store.finishTask(finish("w1", "w2"));
            yield* store.revert({
              actor,
              profile,
              seq: completed.seq,
              occurred_at: later,
            });
            expect(
              (yield* store.finishTask(finish("w1", "w3", "complete", 3)))
                .outcome,
            ).toBe("committed");
            expect(
              (yield* store.tasks())
                .filter((t) => t.status === "open" && t.deleted_at === null)
                .map((t) => [t.id, t.occurrence?.date]),
            ).toEqual([["w3", "2026-03-09"]]);
            expect(
              (yield* store.tasks()).find((t) => t.id === "w2")?.deleted_at,
            ).toBe(later);
          }),
        ),
      ),
  );

  it.effect(
    "shifts date-only due metadata by the calendar date crossed within two hours",
    () =>
      scratch((path) =>
        usingStore(path, (store) =>
          Effect.gen(function* () {
            yield* store.putProfile(work);
            const series = Schema.decodeUnknownSync(Series)({
              ...weekly,
              id: "midnight",
              recurrence: {
                dtstart: {
                  kind: "instant",
                  utc: "2026-03-07T04:00:00Z",
                  time_zone: "America/New_York",
                },
                rrule: "FREQ=HOURLY;INTERVAL=2;COUNT=3",
                exdate: [],
              },
              task: {
                ...weekly.task,
                due_at: { kind: "date", date: "2026-03-06" },
              },
            });
            yield* store.startSeries(start(series, "first"));
            yield* store.finishTask(finish("first", "second"));
            expect(
              (yield* store.tasks()).find((t) => t.id === "second")?.occurrence
                ?.time,
            ).toEqual({
              kind: "instant",
              utc: "2026-03-07T06:00:00Z",
              time_zone: "America/New_York",
            });
            expect(
              (yield* store.tasks()).find((t) => t.id === "second")?.due_at,
            ).toEqual({ kind: "date", date: "2026-03-07" });
          }),
        ),
      ),
  );

  it.effect(
    "records invalid command schemas in rejected History with received facts",
    () =>
      scratch((path) =>
        usingStore(path, (store) =>
          Effect.gen(function* () {
            yield* store.putProfile(work);
            const invalid = {
              ...start(weekly, "invalid"),
              series: { ...weekly, task: { ...weekly.task, title: "" } },
            };
            expect((yield* store.startSeries(invalid)).reason).toBe(
              "validation",
            );
            expect(
              (yield* store.finishTask({
                ...finish("missing", "next"),
                next_task_id: "",
              })).reason,
            ).toBe("validation");
            expect(
              (yield* store.history()).map((e) => [
                e.event.kind,
                e.outcome,
                e.reason,
              ]),
            ).toEqual([
              ["TaskAttemptRejected", "rejected", "validation"],
              ["TaskAttemptRejected", "rejected", "validation"],
            ]);
            const first = (yield* store.history())[0];
            if (first?.event.kind !== "TaskAttemptRejected")
              throw new Error("Missing task rejection");
            expect(first.event.violations[0]?.received).toMatchObject({
              series: { task: { title: "" } },
            });
            expect(yield* store.tasks()).toEqual([]);
          }),
        ),
      ),
  );

  it.effect(
    "preserves authenticated metadata, Revert advancement and rejected History without bearer facts",
    () =>
      scratch((path) =>
        usingStore(path, (store) =>
          Effect.gen(function* () {
            yield* store.putProfile(work);
            yield* store.auth.setupOwner("scratch review passphrase");
            const session = yield* store.auth.signIn(
              "scratch review passphrase",
            );
            const project = {
              id: "auth-project",
              profile_id: profile,
              name: "Port",
              created_at: time,
              updated_at: time,
            };
            const tag = { id: "auth-tag", profile_id: profile, name: "focus" };
            yield* store.auth.append({
              ...session,
              profile,
              event: {
                kind: "TaskCreated",
                entity_version: 1,
                occurred_at: time,
                task: {
                  ...task,
                  project_id: "auth-project",
                  tags: ["auth-tag"],
                },
                series: null,
                project,
                tags: [tag],
              },
            });
            const series = Schema.decodeUnknownSync(Series)({
              ...weekly,
              task: {
                ...weekly.task,
                project_id: "auth-project",
                tags: ["auth-tag"],
              },
            });
            const created = yield* store.auth.startSeries({
              ...start(series, "auth-first"),
              credential: session.credential,
            });
            expect(created.outcome).toBe("committed");
            expect(created.actor).toBe(session.id);
            const completed = yield* store.auth.finishTask({
              ...finish("auth-first", "auth-second"),
              credential: session.credential,
            });
            yield* store.auth.revert({
              credential: session.credential,
              profile,
              seq: completed.seq,
            });
            expect(
              (yield* store.auth.finishTask({
                ...finish("auth-first", "auth-third", "complete", 3),
                credential: session.credential,
              })).outcome,
            ).toBe("committed");
            expect(
              (yield* store.tasks())
                .filter(
                  (t) =>
                    t.status === "open" &&
                    t.deleted_at === null &&
                    t.occurrence !== null,
                )
                .map((t) => [t.id, t.project_id, t.tags]),
            ).toEqual([["auth-third", "auth-project", ["auth-tag"]]]);
            const denied = yield* Effect.flip(
              store.auth.startSeries({
                ...start(series, "invalid"),
                credential: session.credential,
                series: { ...series, task: { ...series.task, title: "" } },
              }),
            );
            expect(denied).toBeInstanceOf(AuthError);
            expect((yield* store.history()).at(-1)?.event.kind).toBe(
              "AuthAttemptRejected",
            );
            expect(JSON.stringify(yield* store.history())).not.toContain(
              session.credential,
            );
          }),
        ),
      ),
  );

  for (const rule of [
    "FREQ=DAILY;COUNT=2;COUNT=3",
    "FREQ=DAILY;UNTIL=20261028;UNTIL=20261030",
  ]) {
    it.effect(`rejects duplicate rule parts in ${rule}`, () =>
      Effect.gen(function* () {
        const result = yield* Effect.exit(
          nextOccurrenceTime(
            recurrence({ ...monthly.recurrence, rrule: rule }),
          ),
        );
        expect(result._tag).toBe("Failure");
      }),
    );
  }

  it.effect(
    "accepts FREQ after COUNT and exhausts the specified two dates",
    () =>
      Effect.gen(function* () {
        const rule = recurrence({
          ...monthly.recurrence,
          rrule: "COUNT=2;FREQ=DAILY",
        });
        const first = yield* nextOccurrenceTime(rule);
        const second = yield* nextOccurrenceTime(rule, first);
        expect([
          first,
          second,
          yield* nextOccurrenceTime(rule, second),
        ]).toEqual([
          { kind: "date", date: "2026-01-30" },
          { kind: "date", date: "2026-01-31" },
          null,
        ]);
      }),
  );
});
