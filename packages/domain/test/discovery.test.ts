import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import {
  AuthError,
  Discovery,
  Instant,
  ProfileId,
  Project,
  Task,
} from "@todo/domain";
import { type OperationStore, openStore } from "@todo/domain/store";
import { Clock, Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { actor, created, taskInput, time, work } from "./store-fixtures.ts";

const start = Date.parse(time);
const id = Schema.decodeUnknownSync(ProfileId);
const fixture = <A, E>(
  run: (
    store: OperationStore,
    path: string,
    credential: string,
  ) => Effect.Effect<A, E>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-discovery-test-"))),
    (dir) =>
      Effect.acquireUseRelease(
        openStore({ path: join(dir, "scratch.db") }),
        (store) =>
          Effect.gen(function* () {
            yield* TestClock.setTime(start);
            yield* store.putProfile(work);
            yield* store.putProfile({
              ...work,
              id: id("other"),
              name: "Other secret",
            });
            yield* store.auth.setupOwner("scratch discovery passphrase");
            const { credential } = yield* store.auth.signIn(
              "scratch discovery passphrase",
            );
            return yield* run(store, join(dir, "scratch.db"), credential);
          }),
        (store) => Effect.orDie(store.close()),
      ),
    (dir) => Effect.sync(() => rmSync(dir, { recursive: true, force: true })),
  );
const add = (
  store: OperationStore,
  profile: string,
  index: number,
  projectName?: string,
) =>
  store.append({
    actor,
    profile: id(profile),
    event: {
      ...created,
      project: projectName
        ? Schema.decodeUnknownSync(Project)({
            id: "project-" + index,
            profile_id: profile,
            name: projectName,
            created_at: time,
            updated_at: time,
          })
        : null,
      task: Schema.decodeUnknownSync(Task)({
        ...taskInput,
        id: `ab000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        profile_id: profile,
        project_id: projectName ? "project-" + index : null,
        title: `${profile} Task ${index}`,
      }),
    },
  });

const betweenReads = (store: OperationStore, action: () => void, at = 3) => {
  const original = store.diagnostics.credentialUsed.bind(store.diagnostics);
  let count = 0;
  Object.defineProperty(store.diagnostics, "credentialUsed", {
    configurable: true,
    value: (...args: Parameters<typeof original>) => {
      original(...args);
      if (++count === at) action();
    },
  });
  return () =>
    Object.defineProperty(store.diagnostics, "credentialUsed", {
      value: original,
    });
};

describe("authorized discovery", () => {
  it.effect(
    "returns every visible status, literal prefixes, sorted directory and empty Profiles",
    () =>
      fixture((store, _path, credential) =>
        Effect.gen(function* () {
          yield* add(store, "work", 1);
          yield* add(store, "other", 2);
          const query = new Discovery(store);
          expect(yield* query.lookup(credential, { prefix: "AB" })).toEqual([
            {
              profile: { id: "other", name: "Other secret" },
              task_id: "ab000000-0000-4000-8000-000000000002",
              title: "other Task 2",
              project: null,
            },
            {
              profile: { id: "work", name: "Work" },
              task_id: "ab000000-0000-4000-8000-000000000001",
              title: "work Task 1",
              project: null,
            },
          ]);
          expect(yield* query.lookup(credential, { prefix: "ff" })).toEqual([]);
          expect(
            (yield* query.directory(credential)).map((p) => [
              p.id,
              p.visible_task_count,
              p.projects,
            ]),
          ).toEqual([
            ["other", 1, []],
            ["work", 1, []],
          ]);
        }),
      ),
  );

  it.effect(
    "includes all statuses and excludes Deleted Tasks without removing their Projects",
    () =>
      fixture((store, _path, credential) =>
        Effect.gen(function* () {
          for (const [index, status] of [
            "open",
            "done",
            "cancelled",
            "snoozed",
            "open",
          ].entries()) {
            yield* store.auth.append({
              credential,
              profile: id("work"),
              event: {
                ...created,
                project:
                  index === 4
                    ? Schema.decodeUnknownSync(Project)({
                        id: "unused-project",
                        profile_id: "work",
                        name: "Empty Project",
                        created_at: time,
                        updated_at: time,
                      })
                    : null,
                task: Schema.decodeUnknownSync(Task)({
                  ...taskInput,
                  id: "ab-" + index,
                  profile_id: "work",
                  title: status,
                  status,
                  project_id: index === 4 ? "unused-project" : null,
                  deleted_at: index === 4 ? time : null,
                }),
              },
            });
          }
          const query = new Discovery(store);
          expect(
            (yield* query.lookup(credential, { prefix: "AB-" })).map((r) => [
              r.task_id,
              r.title,
              r.project,
            ]),
          ).toEqual([
            ["ab-0", "open", null],
            ["ab-1", "done", null],
            ["ab-2", "cancelled", null],
            ["ab-3", "snoozed", null],
          ]);
          expect(
            (yield* query.directory(credential)).map((p) => [
              p.id,
              p.visible_task_count,
              p.projects.map((project) => [project.id, project.name]),
            ]),
          ).toEqual([
            ["other", 0, []],
            ["work", 4, [["unused-project", "Empty Project"]]],
          ]);
        }),
      ),
  );

  it.effect(
    "generated authorized projections stay byte-identical under foreign changes for both Token scopes",
    () =>
      fixture((store, _path, credential) =>
        Effect.gen(function* () {
          yield* add(store, "work", 1);
          const query = new Discovery(store);
          for (const scope of ["read-only", "read-write"] as const) {
            const token = yield* store.auth.issueToken({
              credential,
              token: { name: scope, profile: id("work"), scope },
            });
            const before = JSON.stringify([
              yield* query.directory(token.credential),
              yield* query.lookup(token.credential, { prefix: "ab" }),
            ]);
            expect(
              (yield* query.lookup(token.credential, { prefix: "ab" })).map(
                (r) => r.profile.id,
              ),
            ).toEqual(["work"]);
            for (let seed = 1; seed <= 12; seed++) {
              yield* store.putProfile({
                ...work,
                id: id("other"),
                name: `Foreign ${scope} ${seed}`,
              });
              yield* store.putProfile({
                ...work,
                id: id("generated-" + seed),
                name: "Generated " + seed,
              });
              yield* add(
                store,
                "other",
                seed + (scope === "read-only" ? 10 : 30),
                `Foreign Project ${scope} ${seed}`,
              );
              expect(
                JSON.stringify([
                  yield* query.directory(token.credential),
                  yield* query.lookup(token.credential, { prefix: "ab" }),
                ]),
              ).toBe(before);
            }
          }
          const unscoped = yield* store.auth.issueToken({
            credential,
            token: { name: "all", profile: null, scope: "read-only" },
          });
          expect(
            (yield* query.lookup(unscoped.credential, { prefix: "ab" })).length,
          ).toBe(25);
          yield* store.auth.revokeToken({ credential, name: "all" });
          expect(
            yield* Effect.flip(query.directory(unscoped.credential)),
          ).toMatchObject({ detail: "revoked" });
          expect(
            yield* Effect.flip(query.lookup("tok_invalid", { prefix: "ab" })),
          ).toBeInstanceOf(AuthError);
        }),
      ),
  );

  for (const kind of ["directory", "lookup"] as const)
    it.effect(
      `${kind} holds one WAL snapshot across a competing committed writer`,
      () =>
        fixture((store, path, credential) =>
          Effect.gen(function* () {
            yield* add(store, "work", 1);
            yield* add(store, "other", 2);
            const writer = yield* openStore({ path });
            try {
              const query = new Discovery(store);
              const read = () =>
                kind === "directory"
                  ? query
                      .directory(credential)
                      .pipe(
                        Effect.map((rows) =>
                          rows.map((p) => [p.name, p.visible_task_count]),
                        ),
                      )
                  : query
                      .lookup(credential, { prefix: "ab" })
                      .pipe(
                        Effect.map((rows) =>
                          rows.map((r) => [r.profile.name, r.title]),
                        ),
                      );
              const restore = betweenReads(store, () => {
                Effect.runSync(
                  writer.putProfile({ ...work, name: "Changed Work" }),
                );
                Effect.runSync(add(writer, "work", 3));
              });
              try {
                expect(yield* read()).toEqual(
                  kind === "directory"
                    ? [
                        ["Other secret", 1],
                        ["Work", 1],
                      ]
                    : [
                        ["Other secret", "other Task 2"],
                        ["Work", "work Task 1"],
                      ],
                );
              } finally {
                restore();
              }
              expect(yield* read()).toEqual(
                kind === "directory"
                  ? [
                      ["Changed Work", 2],
                      ["Other secret", 1],
                    ]
                  : [
                      ["Changed Work", "work Task 1"],
                      ["Changed Work", "work Task 3"],
                      ["Other secret", "other Task 2"],
                    ],
              );
            } finally {
              yield* writer.close();
            }
          }),
        ),
    );

  for (const at of [2, 3])
    it.effect(
      `expiry at read ${at} fails the whole response then commits one auth rejection outside the read transaction`,
      () =>
        fixture((store, path, credential) =>
          Effect.gen(function* () {
            const token = yield* store.auth.issueToken({
              credential,
              token: {
                name: "expires",
                profile: null,
                scope: "read-only",
                expires_at: Schema.decodeUnknownSync(Instant)(
                  new Date(start + 1).toISOString(),
                ),
              },
            });
            let now = start;
            const clock = yield* Clock.Clock;
            const restore = betweenReads(
              store,
              () => {
                now = start + 1;
              },
              at,
            );
            try {
              expect(
                yield* Effect.flip(
                  new Discovery(store).directory(token.credential).pipe(
                    Effect.provideService(Clock.Clock, {
                      ...clock,
                      currentTimeMillis: Effect.sync(() => now),
                      currentTimeMillisUnsafe: () => now,
                    }),
                  ),
                ),
              ).toMatchObject({ detail: "expired" });
            } finally {
              restore();
            }
            const observer = new Database(path);
            try {
              expect(
                observer
                  .query(
                    "SELECT outcome, reason, profile FROM op_log WHERE reason='auth'",
                  )
                  .all(),
              ).toEqual([
                { outcome: "rejected", reason: "auth", profile: null },
              ]);
            } finally {
              observer.close();
            }
          }),
        ),
    );
});
