import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import {
  ActorId,
  AuthError,
  ProfileId,
  Sequence,
  Task,
  Version,
} from "@todo/domain";
import { ensureProfile } from "@todo/domain/commands";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { migrate } from "../src/store/migration.ts";

it.effect("competing clients reuse one name as exactly one new Profile", () =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.now());
      const dir = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f10-name-race-"))),
        (d) => Effect.sync(() => rmSync(d, { recursive: true })),
      );
      const path = join(dir, "scratch.db");
      const first = yield* Effect.acquireRelease(openStore({ path }), (s) =>
        Effect.orDie(s.close()),
      );
      const second = yield* Effect.acquireRelease(openStore({ path }), (s) =>
        Effect.orDie(s.close()),
      );
      const work = yield* ensureProfile(first, "work");
      yield* ensureProfile(first, "personal");
      yield* first.auth.setupOwner("scratch passphrase");
      const session = yield* first.auth.signIn("scratch passphrase");
      yield* first.auth.deleteProfile({
        ...session,
        profile: work.id,
        options: { with_tasks: false, dry_run: false },
      });
      const clients = [first, second].map(
        (store) =>
          new Proxy(store, {
            get(target, key, receiver) {
              if (key === "profiles")
                return () =>
                  target
                    .profiles()
                    .pipe(
                      Effect.tap(() =>
                        Effect.promise(
                          () =>
                            new Promise<void>((resolve) =>
                              setTimeout(resolve, 25),
                            ),
                        ),
                      ),
                    );
              return Reflect.get(target, key, receiver);
            },
          }),
      );
      const results = yield* Effect.all(
        clients.map((store) => ensureProfile(store, "work")),
        { concurrency: "unbounded" },
      );
      expect(new Set(results.map((p) => p.id)).size).toBe(1);
      expect(results.map((p) => p.name)).toEqual(["work", "work"]);
      expect(results.every((p) => p.id !== work.id)).toBe(true);
      expect((yield* first.profiles()).map((p) => p.name).sort()).toEqual([
        "personal",
        "work",
      ]);
    }),
  ),
);

it.effect("a stale Move or Move Revert cannot enter a deleted Profile", () =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.now());
      const dir = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f10-move-"))),
        (d) => Effect.sync(() => rmSync(d, { recursive: true })),
      );
      const store = yield* Effect.acquireRelease(
        openStore({ path: join(dir, "scratch.db") }),
        (s) => Effect.orDie(s.close()),
      );
      const work = yield* ensureProfile(store, "work");
      const personal = yield* ensureProfile(store, "personal");
      yield* store.auth.setupOwner("scratch passphrase");
      const session = yield* store.auth.signIn("scratch passphrase");
      const request = { credential: session.credential, profile: work.id };
      yield* new TaskCommands(store).create(request, {
        title: "Keep me accessible",
      });
      const before = (yield* store.tasks())[0];
      if (!before) throw new Error("Missing fixture Task");
      const actor = Schema.decodeUnknownSync(ActorId)(
        (yield* store.auth.authenticate({ ...request, access: "write" })).id,
      );
      yield* store.auth.authenticate({
        ...request,
        profile: personal.id,
        access: "write",
      });
      yield* store.auth.deleteProfile({
        ...request,
        profile: personal.id,
        options: { with_tasks: false, dry_run: false },
      });
      const after = Schema.decodeUnknownSync(Task)({
        ...before,
        profile_id: personal.id,
        row_version: Schema.decodeUnknownSync(Version)(2),
      });
      for (const original_seq of [
        null,
        Schema.decodeUnknownSync(Sequence)(1),
      ]) {
        const moved = yield* store.move({ actor, before, after, original_seq });
        expect([moved.outcome, moved.reason]).toEqual([
          "rejected",
          "validation",
        ]);
        expect(yield* store.tasks()).toEqual([before]);
      }
    }),
  ),
);

it.effect(
  "deletes atomically, revokes only scoped Tokens, preserves every foreign byte and replays tombstones",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.now());
        const dir = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f10-domain-"))),
          (dir) => Effect.sync(() => rmSync(dir, { recursive: true })),
        );
        const path = join(dir, "scratch.db");
        const store = yield* Effect.acquireRelease(openStore({ path }), (s) =>
          Effect.orDie(s.close()),
        );
        yield* store.auth.setupOwner("scratch passphrase");
        const session = yield* store.auth.signIn("scratch passphrase");
        const work = yield* ensureProfile(store, "work");
        const personal = yield* ensureProfile(store, "personal");
        const command = new TaskCommands(store);
        const request = { credential: session.credential, profile: work.id };
        yield* command.create(request, {
          title: "Delete recoverably",
          project_name: "Work project",
          tag_names: ["work-tag"],
        });
        yield* command.create(
          { ...request, profile: personal.id },
          {
            title: "Other Profile stays exact",
            project_name: "Personal project",
            tag_names: ["personal-tag"],
          },
        );
        const scoped = yield* store.auth.issueToken({
          ...session,
          token: { name: "work-token", profile: work.id, scope: "read-write" },
        });
        const global = yield* store.auth.issueToken({
          ...session,
          token: { name: "global-token", profile: null, scope: "read-write" },
        });
        const sql = new Database(path);
        try {
          const foreign = () =>
            JSON.stringify({
              tasks: sql
                .query(
                  "SELECT * FROM tasks WHERE profile_id='personal' ORDER BY id",
                )
                .all(),
              projects: sql
                .query(
                  "SELECT * FROM projects WHERE profile_id='personal' ORDER BY id",
                )
                .all(),
              tags: sql
                .query(
                  "SELECT * FROM tags WHERE profile_id='personal' ORDER BY id",
                )
                .all(),
              ops: sql
                .query(
                  "SELECT * FROM op_log WHERE profile='personal' ORDER BY seq",
                )
                .all(),
            });
          const before = foreign();
          const historyBefore = JSON.stringify(yield* store.history());
          const preview = yield* store.auth.deleteProfile({
            ...request,
            options: { with_tasks: true, dry_run: true },
          });
          expect(
            preview.outcome === "deleted" && [
              preview.report.tasks_affected,
              preview.report.access_tokens_revoked,
              preview.report.sessions_revoked,
              preview.report.dry_run,
            ],
          ).toEqual([1, 1, 0, true]);
          expect(JSON.stringify(yield* store.history())).toBe(historyBefore);
          const refused = yield* store.auth.deleteProfile({
            ...request,
            options: { with_tasks: false, dry_run: false },
          });
          expect(refused.outcome === "refused" && refused.error).toMatchObject({
            code: "profile_not_empty",
            details: { visible_task_count: 1 },
          });
          expect((yield* command.list(request)).map((t) => t.title)).toEqual([
            "Delete recoverably",
          ]);
          const deleted = yield* store.auth.deleteProfile({
            ...request,
            options: { with_tasks: true, dry_run: false },
          });
          expect(
            deleted.outcome === "deleted" && [
              deleted.report.tasks_affected,
              deleted.report.access_tokens_revoked,
              deleted.report.sessions_revoked,
            ],
          ).toEqual([1, 1, 0]);
          expect(foreign()).toBe(before);
          expect(
            (yield* store.snapshots.list()).snapshots.map((s) => s.reason),
          ).toEqual(["before Profile delete work"]);
          expect((yield* store.profiles()).map((p) => p.name)).toEqual([
            "personal",
          ]);
          expect(
            (yield* store.tasks()).find((t) => t.profile_id === work.id)
              ?.row_version,
          ).toBe(2);
          expect(
            (yield* store.tasks()).find((t) => t.profile_id === work.id)
              ?.deleted_at,
          ).not.toBeNull();
          const denied = yield* Effect.flip(
            store.auth.authenticate({
              credential: scoped.credential,
              profile: work.id,
              access: "read",
            }),
          );
          expect(denied instanceof AuthError && denied.detail).toBe("revoked");
          expect(
            (yield* store.auth.authenticate({
              credential: global.credential,
              profile: personal.id,
              access: "write",
            })).kind,
          ).toBe("token");
          expect(
            (yield* store.auth.profiles(session)).map((p) => p.name),
          ).toEqual(["personal"]);
          const hidden = yield* Effect.flip(store.auth.read(request));
          expect(hidden instanceof AuthError && hidden.detail).toBe(
            "profile_deleted",
          );
          const history = JSON.stringify(yield* store.history());
          yield* store.takeSnapshot();
          yield* store.rebuild({ useSnapshot: true });
          expect((yield* store.profiles()).map((p) => p.name)).toEqual([
            "personal",
          ]);
          yield* store.rebuild();
          expect((yield* store.profiles()).map((p) => p.name)).toEqual([
            "personal",
          ]);
          expect(foreign()).toBe(before);
          expect(JSON.stringify(yield* store.history())).toBe(history);
          const last = yield* store.auth.deleteProfile({
            ...session,
            profile: personal.id,
            options: { with_tasks: true, dry_run: false },
          });
          expect(last.outcome === "refused" && last.error.code).toBe(
            "last_profile",
          );
          const missing = yield* store.auth.deleteProfile({
            ...session,
            profile: Schema.decodeUnknownSync(ProfileId)("absent"),
            options: { with_tasks: true, dry_run: false },
          });
          expect(missing.outcome === "refused" && missing.error.code).toBe(
            "not_found",
          );
        } finally {
          sql.close();
        }
      }),
    ),
);

it.effect(
  "migration 0004 is additive, transactional, idempotent and preserves existing rows",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const dir = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f10-migration-"))),
          (d) => Effect.sync(() => rmSync(d, { recursive: true })),
        );
        const store = yield* openStore({ path: join(dir, "scratch.db") });
        yield* ensureProfile(store, "work");
        yield* store.close();
        const db = new Database(join(dir, "scratch.db"));
        db.function("domain_write_allowed", () => 1);
        try {
          const rows = JSON.stringify(db.query("SELECT * FROM profiles").all());
          db.exec(
            "DROP TRIGGER profiles_reserved_insert; DROP TRIGGER profiles_reserved_update; DROP TABLE profile_deletions; PRAGMA user_version=3",
          );
          db.transaction(() => {
            migrate(db);
            migrate(db);
          }).immediate();
          expect(
            db.query<{ user_version: number }, []>("PRAGMA user_version").get()
              ?.user_version,
          ).toBe(6);
          expect(JSON.stringify(db.query("SELECT * FROM profiles").all())).toBe(
            rows,
          );
          expect(db.query("SELECT * FROM profile_deletions").all()).toEqual([]);
        } finally {
          db.close();
        }
      }),
    ),
);

it.effect(
  "a failed Profile tombstone leaves Tasks, credentials and History unchanged",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.now());
        const dir = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f10-atomic-"))),
          (d) => Effect.sync(() => rmSync(d, { recursive: true })),
        );
        const path = join(dir, "scratch.db");
        const store = yield* Effect.acquireRelease(openStore({ path }), (s) =>
          Effect.orDie(s.close()),
        );
        yield* ensureProfile(store, "work");
        yield* ensureProfile(store, "personal");
        yield* store.auth.setupOwner("scratch passphrase");
        const session = yield* store.auth.signIn("scratch passphrase");
        const request = {
          credential: session.credential,
          profile: Schema.decodeUnknownSync(ProfileId)("work"),
        };
        yield* new TaskCommands(store).create(request, {
          title: "Atomic deletion",
        });
        const token = yield* store.auth.issueToken({
          ...session,
          token: {
            name: "atomic-token",
            profile: request.profile,
            scope: "read-only",
          },
        });
        const before = JSON.stringify({
          tasks: yield* store.tasks(),
          history: yield* store.history(),
        });
        const sql = new Database(path);
        try {
          sql.exec(
            "CREATE TRIGGER fail_profile_delete BEFORE INSERT ON profile_deletions BEGIN SELECT RAISE(ABORT,'forced tombstone failure'); END",
          );
          const failure = yield* Effect.flip(
            store.auth.deleteProfile({
              ...request,
              options: { with_tasks: true, dry_run: false },
            }),
          );
          expect(failure._tag).toBe("StoreError");
          expect(
            JSON.stringify({
              tasks: yield* store.tasks(),
              history: yield* store.history(),
            }),
          ).toBe(before);
          expect(
            (yield* store.auth.authenticate({
              credential: token.credential,
              profile: request.profile,
              access: "read",
            })).name,
          ).toBe("atomic-token");
          expect((yield* store.profiles()).map((p) => p.name)).toEqual([
            "personal",
            "work",
          ]);
        } finally {
          sql.close();
        }
      }),
    ),
);

it.effect("Snapshot failure aborts Profile deletion before any mutation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.now());
      const dir = yield* Effect.acquireRelease(
        Effect.sync(() =>
          mkdtempSync(join(tmpdir(), "todo-f10-snapshot-fail-")),
        ),
        (d) => Effect.sync(() => rmSync(d, { recursive: true })),
      );
      const store = yield* Effect.acquireRelease(
        openStore({ path: join(dir, "scratch.db") }),
        (s) => Effect.orDie(s.close()),
      );
      const work = yield* ensureProfile(store, "work");
      yield* ensureProfile(store, "personal");
      yield* store.auth.setupOwner("scratch passphrase");
      const session = yield* store.auth.signIn("scratch passphrase");
      const request = { credential: session.credential, profile: work.id };
      yield* new TaskCommands(store).create(request, {
        title: "Snapshot failure keeps me",
      });
      const before = JSON.stringify({
        tasks: yield* store.tasks(),
        history: yield* store.history(),
        profiles: yield* store.profiles(),
      });
      writeFileSync(join(dir, "snapshots"), "Block the Snapshot directory");
      const failed = yield* Effect.flip(
        store.auth.deleteProfile({
          ...request,
          options: { with_tasks: true, dry_run: false },
        }),
      );
      expect(failed._tag).toBe("StoreError");
      expect(
        JSON.stringify({
          tasks: yield* store.tasks(),
          history: yield* store.history(),
          profiles: yield* store.profiles(),
        }),
      ).toBe(before);
    }),
  ),
);

it.effect(
  "opening version 3 creates exactly one pre-migration Snapshot before migration 0004",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const dir = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f10-upgrade-"))),
          (d) => Effect.sync(() => rmSync(d, { recursive: true })),
        );
        const path = join(dir, "scratch.db");
        const first = yield* openStore({ path });
        yield* ensureProfile(first, "work");
        yield* first.close();
        const legacy = new Database(path);
        try {
          legacy.exec(
            "DROP TRIGGER profiles_reserved_insert; DROP TRIGGER profiles_reserved_update; DROP TABLE profile_deletions; PRAGMA user_version=3",
          );
        } finally {
          legacy.close();
        }
        const upgraded = yield* openStore({ path });
        try {
          expect((yield* upgraded.settings()).user_version).toBe(6);
          const snapshots = (yield* upgraded.snapshots.list()).snapshots;
          expect(snapshots.map((s) => [s.reason, s.schema_version])).toEqual([
            ["pre-migration", 3],
          ]);
          const recovery = new Database(snapshots[0]?.path ?? "", {
            readonly: true,
          });
          try {
            expect(
              recovery
                .query<{ user_version: number }, []>("PRAGMA user_version")
                .get()?.user_version,
            ).toBe(3);
            expect(recovery.query("SELECT name FROM profiles").all()).toEqual([
              { name: "work" },
            ]);
            expect(
              recovery
                .query(
                  "SELECT name FROM sqlite_master WHERE name='profile_deletions'",
                )
                .all(),
            ).toEqual([]);
          } finally {
            recovery.close();
          }
        } finally {
          yield* upgraded.close();
        }
        const reopened = yield* openStore({ path });
        try {
          expect(
            (yield* reopened.snapshots.list()).snapshots.map((s) => s.reason),
          ).toEqual(["pre-migration"]);
        } finally {
          yield* reopened.close();
        }
      }),
    ),
);

it.effect(
  "concurrent version 3 opens create exactly one version 3 Snapshot",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() =>
            mkdtempSync(join(tmpdir(), "todo-f10-upgrade-race-")),
          ),
          (path) => Effect.sync(() => rmSync(path, { recursive: true })),
        );
        const path = join(directory, "scratch.db");
        const first = yield* openStore({ path });
        yield* ensureProfile(first, "work");
        yield* first.close();
        const lock = yield* Effect.acquireRelease(
          Effect.sync(() => new Database(path)),
          (db) => Effect.sync(() => db.close()),
        );
        lock.exec(
          "DROP TRIGGER profiles_reserved_insert; DROP TRIGGER profiles_reserved_update; DROP TABLE profile_deletions; PRAGMA user_version=3; BEGIN IMMEDIATE",
        );
        const children = yield* Effect.acquireRelease(
          Effect.sync(() =>
            Array.from({ length: 3 }, () =>
              Bun.spawn(
                [
                  process.execPath,
                  new URL("fixtures/open-store.ts", import.meta.url).pathname,
                  path,
                ],
                { stdout: "pipe", stderr: "pipe" },
              ),
            ),
          ),
          (children) =>
            Effect.promise(async () => {
              for (const child of children)
                if (child.exitCode === null) child.kill();
              await Promise.all(children.map((child) => child.exited));
            }),
        );
        yield* Effect.promise(() =>
          Promise.all(
            children.map(async (child) => {
              const reader = child.stdout.getReader();
              const ready = await reader.read();
              reader.releaseLock();
              expect(new TextDecoder().decode(ready.value)).toBe("opening\n");
            }),
          ),
        );
        yield* Effect.promise(
          () => new Promise<void>((resolve) => setTimeout(resolve, 1000)),
        );
        lock.exec("COMMIT");
        expect(
          yield* Effect.promise(() =>
            Promise.all(children.map((child) => child.exited)),
          ),
        ).toEqual([0, 0, 0]);
        const upgraded = yield* Effect.acquireRelease(
          openStore({ path }),
          (s) => Effect.orDie(s.close()),
        );
        expect((yield* upgraded.settings()).user_version).toBe(6);
        const snapshots = (yield* upgraded.snapshots.list()).snapshots;
        expect(snapshots.map((s) => [s.reason, s.schema_version])).toEqual([
          ["pre-migration", 3],
        ]);
        expect((yield* upgraded.profiles()).map((p) => p.name)).toEqual([
          "work",
        ]);
      }),
    ),
);
