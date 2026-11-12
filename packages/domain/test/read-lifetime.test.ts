import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import {
  ClientReads,
  Discovery,
  ProfileId,
  TaskId,
  Version,
} from "@todo/domain";
import { AttachmentCommands } from "@todo/domain/attachments";
import { importTasks } from "@todo/domain/import";
import {
  type OperationStore,
  openStore,
  StoreError,
  TaskCommands,
} from "@todo/domain/store";
import { Cause, Clock, Effect, Exit, Schema } from "effect";
import { TestClock } from "effect/testing";
import { taskHistory } from "../src/store/history-reads.ts";
import { authorityModes, counterfeitAuthority } from "./authority-fixtures.ts";
import { actor, created, time, work } from "./store-fixtures.ts";

const target = Schema.Struct({ task_id: TaskId });
const attempt = <A>(run: () => A) =>
  Effect.try({ try: run, catch: (cause) => cause });
const task_id = Schema.decodeUnknownSync(TaskId)("task-1");
const version = Schema.decodeUnknownSync(Version);
const fixture = <A>(
  use: (
    store: OperationStore,
    credential: string,
    token: string,
    snapshot: string,
  ) => Effect.Effect<A, unknown>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-read-lifetime-"))),
    (directory) =>
      Effect.acquireUseRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (store) =>
          Effect.gen(function* () {
            yield* TestClock.setTime(Date.parse(time));
            yield* store.putProfile(work);
            yield* store.putProfile({
              ...work,
              id: Schema.decodeUnknownSync(ProfileId)("personal"),
              name: "Personal",
            });
            yield* store.auth.setupOwner("lifetime scratch passphrase");
            const { credential } = yield* store.auth.signIn(
              "lifetime scratch passphrase",
            );
            yield* store.append({ actor, profile: work.id, event: created });
            const token = yield* store.auth.issueToken({
              credential,
              token: { name: "reader", profile: work.id, scope: "read-only" },
            });
            const snapshot = yield* store.snapshots.create(
              "before lifetime transition",
            );
            return yield* use(store, credential, token.credential, snapshot.id);
          }),
        (store) => Effect.orDie(store.close()),
      ),
    (directory) =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
  );
const capture = (
  store: OperationStore,
  credential: string,
  token: string,
  snapshot: string,
) =>
  store.auth.readSnapshot(() =>
    Effect.gen(function* () {
      const read = yield* store.auth.authorizeRead(
        { credential: token, profile: work.id },
        target,
        { task_id },
      );
      const owner = yield* store.auth.ownerRead(
        { credential },
        Schema.Struct({ snapshot: Schema.String }),
        { snapshot },
      );
      const profiles = yield* store.auth.profilesRead(
        { credential: token },
        Schema.Struct({}),
        {},
      );
      expect(
        (yield* store.graphRead(read)).tasks.map((task) => task.id),
      ).toEqual(["task-1"]);
      expect((yield* store.snapshots.showRead(owner)).id).toBe(snapshot);
      return { read, owner, profiles: profiles.read };
    }),
  );
const ports = (
  store: OperationStore,
  values: Effect.Success<ReturnType<typeof capture>>,
) => {
  const projection = Reflect.get(store.auth, "projection"),
    db = Reflect.get(store, "db");
  const attachments = new AttachmentCommands(store);
  return [
    ["graph", store.graphRead(values.read)],
    ["changes", store.changesRead(values.read, 0)],
    [
      "image",
      Reflect.apply(Reflect.get(attachments, "imageWithin"), attachments, [
        values.read,
        created.task,
      ]),
    ],
    ["history", attempt(() => taskHistory(db, values.read))],
    ["snapshot-list", store.snapshots.listRead(values.owner)],
    ["snapshot-show", store.snapshots.showRead(values.owner)],
    [
      "diagnostics",
      Reflect.apply(
        Reflect.get(store.diagnostics, "readWithin"),
        store.diagnostics,
        [values.owner],
      ),
    ],
    [
      "profiles",
      attempt(() =>
        Reflect.apply(Reflect.get(projection, "profiles"), projection, [
          values.profiles,
        ]),
      ),
    ],
    ...["metadata", "tasks", "catalog", "projects", "tags"].map(
      (name) =>
        [
          name,
          attempt(() =>
            Reflect.apply(Reflect.get(projection, name), projection, [
              values.read,
            ]),
          ),
        ] as const,
    ),
  ] satisfies ReadonlyArray<readonly [string, Effect.Effect<unknown, unknown>]>;
};
const refused = (operation: Effect.Effect<unknown, unknown>) =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(operation);
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      const error = Cause.squash(result.cause);
      expect(Reflect.get(Object(error), "_tag")).toBe("StoreError");
    }
  });

for (const transition of [
  "commit",
  "rollback",
  "interruption",
  "failure",
  "restore",
  "Purge",
  "expiry",
  "revocation",
  "Profile deletion",
  "unrelated request",
]) {
  it.effect(`every port refuses a retained authority after ${transition}`, () =>
    fixture((store, credential, token, snapshot) =>
      Effect.gen(function* () {
        let values: Effect.Success<ReturnType<typeof capture>> | undefined;
        if (["rollback", "interruption", "failure"].includes(transition)) {
          yield* Effect.exit(
            store.auth.readSnapshot(() =>
              Effect.gen(function* () {
                values = yield* capture(store, credential, token, snapshot);
                if (transition === "interruption")
                  return yield* Effect.interrupt;
                return yield* Effect.fail(
                  new StoreError(new Error(transition)),
                );
              }),
            ),
          );
        } else values = yield* capture(store, credential, token, snapshot);
        if (transition === "restore")
          yield* store.snapshots.restore(snapshot, { dryRun: false });
        if (transition === "expiry") yield* TestClock.adjust("8 days");
        if (transition === "revocation")
          yield* store.auth.revokeToken({ credential, name: "reader" });
        if (transition === "Profile deletion") {
          const deleted = yield* store.auth.deleteProfile({
            credential,
            profile: work.id,
            options: { with_tasks: true, dry_run: false },
          });
          expect(deleted.outcome).toBe("deleted");
        }
        if (transition === "Purge") {
          const commands = new TaskCommands(store),
            request = { credential, profile: work.id, task_id };
          expect(
            (yield* commands.delete(request, { from_version: version(1) }))
              .outcome,
          ).toBe("committed");
          expect(
            (yield* commands.purge(request, { from_version: version(2) }))
              .outcome,
          ).toBe("committed");
        }
        if (transition === "unrelated request")
          expect(
            (yield* new TaskCommands(store).list({
              credential,
              profile: work.id,
            })).map((task) => task.id),
          ).toEqual(["task-1"]);
        if (!values) throw new Error("Missing captured authorities");
        const db = Reflect.get(store, "db"),
          original = db.query.bind(db);
        let queries = 0;
        Object.defineProperty(db, "query", {
          configurable: true,
          value: (...args: unknown[]) => {
            queries++;
            return Reflect.apply(original, db, args);
          },
        });
        try {
          for (const [, operation] of ports(store, values))
            yield* refused(operation);
          expect(queries).toBe(0);
        } finally {
          Object.defineProperty(db, "query", { value: original });
        }
      }),
    ),
  );
}

for (const transition of [
  "commit",
  "rollback",
  "interruption",
  "failure",
  "restore",
  "Purge",
  "expiry",
  "revocation",
  "Profile deletion",
  "unrelated request",
]) {
  it.effect(
    `the terminal port refuses its permission after ${transition}`,
    () =>
      fixture((store, credential, _token, snapshot) =>
        Effect.gen(function* () {
          const deletion = yield* store.auth.deleteProfile({
            credential,
            profile: work.id,
            options: { with_tasks: true, dry_run: false },
          });
          expect(deletion.outcome).toBe("deleted");
          let retained: unknown;
          yield* Effect.exit(
            store.auth.withStreamRead(
              { credential, profile: work.id },
              Schema.Struct({}),
              {},
              { after: 0, generation: "initial" },
              (result) => {
                if (result.kind !== "terminal")
                  return Effect.die("Expected terminal permission");
                retained = result.read;
                if (transition === "interruption") return Effect.interrupt;
                if (transition === "rollback" || transition === "failure")
                  return Effect.fail(new StoreError(new Error(transition)));
                return Effect.void;
              },
            ),
          );
          expect(retained).toBeDefined();
          if (transition === "restore")
            yield* store.snapshots.restore(snapshot, { dryRun: false });
          if (transition === "expiry") yield* TestClock.adjust("8 days");
          if (transition === "revocation")
            yield* store.auth.signOut({ credential });
          const personal = Schema.decodeUnknownSync(ProfileId)("personal");
          const commands = new TaskCommands(store);
          if (transition === "Purge") {
            const id = Schema.decodeUnknownSync(TaskId)("ab-terminal-purge");
            yield* commands.create(
              { credential, profile: personal },
              { title: "Later purge" },
              { task_id: id },
            );
            yield* commands.delete(
              { credential, profile: personal, task_id: id },
              { from_version: version(1) },
            );
            yield* commands.purge(
              { credential, profile: personal, task_id: id },
              { from_version: version(2) },
            );
          }
          if (transition === "unrelated request")
            expect(
              yield* commands.list({ credential, profile: personal }),
            ).toEqual([]);
          const db = Reflect.get(store, "db"),
            original = db.query.bind(db);
          let queries = 0;
          Object.defineProperty(db, "query", {
            configurable: true,
            value: (...args: unknown[]) => {
              queries++;
              return Reflect.apply(original, db, args);
            },
          });
          try {
            yield* refused(
              Reflect.apply(store.terminalChangesRead, store, [retained]),
            );
            expect(queries).toBe(0);
          } finally {
            Object.defineProperty(db, "query", { value: original });
          }
        }),
      ),
  );
}

it.effect(
  "a fresh checked scope rechecks once and cannot revive a failed nested scope",
  () =>
    fixture((store, credential, token, snapshot) =>
      Effect.gen(function* () {
        const saved = yield* capture(store, credential, token, snapshot);
        expect(
          (yield* store.auth.recheckRead(saved.read, (read) =>
            store.graphRead(read),
          )).tasks.map((task) => task.id),
        ).toEqual(["task-1"]);
        yield* store.auth.readSnapshot(() =>
          Effect.gen(function* () {
            const outer = yield* store.auth.authorizeRead(
              { credential: token, profile: work.id },
              target,
              { task_id },
            );
            let failed: typeof outer | undefined;
            yield* Effect.exit(
              store.auth.withRead(
                { credential: token, profile: work.id },
                target,
                { task_id },
                (read) => {
                  failed = read;
                  return Effect.fail(new StoreError("rollback child"));
                },
              ),
            );
            if (!failed) throw new Error("Missing failed child authority");
            yield* refused(store.graphRead(failed));
            expect(
              (yield* store.graphRead(outer)).tasks.map((task) => task.id),
            ).toEqual(["task-1"]);
            yield* store.auth.projects({ credential: token, profile: work.id });
            expect(
              (yield* store.graphRead(outer)).tasks.map((task) => task.id),
            ).toEqual(["task-1"]);
          }),
        );
        yield* store.snapshots.restore(snapshot, { dryRun: false });
        yield* refused(
          store.auth.recheckRead(saved.read, (read) => store.graphRead(read)),
        );
      }),
    ),
);

it.effect(
  "materialized ordinary reads use one credential lookup, including Discovery's nested snapshot",
  () =>
    fixture((store, credential) =>
      Effect.gen(function* () {
        const commands = new TaskCommands(store),
          reads = new ClientReads(store),
          discovery = new Discovery(store);
        const request = { credential, profile: work.id, task_id };
        const operations = [
          commands.list(request),
          commands.list(request, { text: "store" }),
          commands.get(request),
          reads.view(request, "inbox", time),
          reads.history(request),
          reads.profiles(credential),
          reads.projects(request),
          reads.tags(request),
          discovery.directory(credential),
          discovery.lookup(credential, { prefix: "a" }),
          store.auth.withOwnerRead(
            { credential },
            Schema.Struct({}),
            {},
            (read) => store.snapshots.listRead(read),
          ),
        ];
        const db = Reflect.get(store, "db"),
          original = db.query.bind(db);
        let lookups = 0;
        Object.defineProperty(db, "query", {
          configurable: true,
          value: (sql: string) => {
            if (sql.includes("FROM credentials WHERE secret_hash=?")) lookups++;
            return original(sql);
          },
        });
        try {
          for (const operation of operations) {
            lookups = 0;
            yield* operation;
            expect(lookups).toBe(1);
            expect(db.inTransaction).toBe(false);
          }
        } finally {
          Object.defineProperty(db, "query", { value: original });
        }
      }),
    ),
);

it.effect(
  "never-created Profile reads execute only credential lookup and classification, and the absent value grants no query",
  () =>
    fixture((store, credential) =>
      Effect.gen(function* () {
        const profile = Schema.decodeUnknownSync(ProfileId)("never-created");
        const request = { credential, profile, task_id };
        const reads = new ClientReads(store),
          commands = new TaskCommands(store);
        const db = Reflect.get(store, "db"),
          original = db.query.bind(db);
        const statements: string[] = [];
        Object.defineProperty(db, "query", {
          configurable: true,
          value: (sql: string) => {
            statements.push(sql);
            return original(sql);
          },
        });
        try {
          for (const [operation, expected] of [
            [commands.list(request), []],
            [commands.list(request, { text: "store" }), []],
            [commands.get(request), null],
            [reads.projects(request), []],
            [reads.tags(request), []],
            [reads.history(request), []],
            [
              store.auth.catalog(request),
              { tasks: [], projects: [], tags: [] },
            ],
            [
              new AttachmentCommands(store).image(
                request,
                Schema.decodeUnknownSync(
                  Schema.NonEmptyString.pipe(Schema.brand("AttachmentId")),
                )("image"),
              ),
              null,
            ],
          ] satisfies ReadonlyArray<
            readonly [Effect.Effect<unknown, unknown>, unknown]
          >) {
            statements.length = 0;
            expect(yield* operation).toEqual(expected);
            expect(statements.length).toBe(2);
            expect(statements[0]).toContain(
              "FROM credentials WHERE secret_hash=?",
            );
            expect(statements[1]).toContain("AS requested");
          }
          statements.length = 0;
          const selection = yield* store.auth.withRead(
            request,
            target,
            { task_id },
            () => Effect.die("Absent Profile entered a read callback"),
            "read",
            (selection) => Effect.succeed(selection),
          );
          expect(selection.kind).toBe("absent");
          expect(Object.hasOwn(selection, "profile")).toBe(false);
          expect(statements.length).toBe(2);
          statements.length = 0;
          const forged: Effect.Effect<unknown, unknown> = Reflect.apply(
            store.graphRead,
            store,
            [selection],
          );
          yield* refused(forged);
          expect(statements).toEqual([]);
        } finally {
          Object.defineProperty(db, "query", { value: original });
        }
      }),
    ),
);

it.effect(
  "Profile classification changes only between snapshots and name reuse resolves the new id",
  () =>
    fixture((store, credential) =>
      Effect.gen(function* () {
        const profile = Schema.decodeUnknownSync(ProfileId)("never-created"),
          commands = new TaskCommands(store);
        const request = { credential, profile };
        expect(yield* commands.list(request)).toEqual([]);
        yield* store.ensureProfile({
          ...work,
          id: profile,
          name: "Fresh name",
        });
        const result = yield* commands.create(
          request,
          { title: "First write" },
          { task_id: Schema.decodeUnknownSync(TaskId)("ab-first") },
        );
        expect(result.outcome).toBe("committed");
        expect((yield* commands.list(request)).map((task) => task.id)).toEqual([
          "ab-first",
        ]);
        expect(
          (yield* store.auth.deleteProfile({
            ...request,
            options: { with_tasks: true, dry_run: false },
          })).outcome,
        ).toBe("deleted");
        const missing = yield* Effect.flip(commands.list(request));
        expect(missing).toMatchObject({
          _tag: "AuthError",
          detail: "profile_deleted",
        });
        const reused = yield* store.ensureProfile({
          ...work,
          id: Schema.decodeUnknownSync(ProfileId)("never-reused"),
          name: "Fresh name",
        });
        expect(reused.id).toBe("never-reused");
        expect(
          (yield* store.auth.resolveProfile({
            credential,
            profile: "Fresh name",
            action: "read",
          })).id,
        ).toBe("never-reused");
        expect(
          yield* commands.list({ credential, profile: reused.id }),
        ).toEqual([]);
        expect(yield* Effect.flip(commands.list(request))).toMatchObject({
          detail: "profile_deleted",
        });
      }),
    ),
);

it.effect(
  "a terminal query is bounded, one-shot, kind-checked and dead after its scope",
  () =>
    fixture((store, credential) =>
      Effect.gen(function* () {
        const deleted = yield* store.auth.deleteProfile({
          credential,
          profile: work.id,
          options: { with_tasks: true, dry_run: false },
        });
        expect(deleted.outcome).toBe("deleted");
        const personal = Schema.decodeUnknownSync(ProfileId)("personal");
        expect(
          (yield* new TaskCommands(store).create(
            { credential, profile: personal },
            { title: "Later unrelated write" },
            { task_id: Schema.decodeUnknownSync(TaskId)("ab-later") },
          )).outcome,
        ).toBe("committed");
        const retained = yield* store.auth.withStreamRead(
          { credential, profile: work.id },
          Schema.Struct({}),
          {},
          { after: 0, generation: "initial" },
          (result) =>
            Effect.gen(function* () {
              if (result.kind !== "terminal")
                return yield* Effect.die("Expected terminal permission");
              for (const mode of authorityModes) {
                try {
                  const value = counterfeitAuthority(result.read, mode);
                  const operation: Effect.Effect<unknown, unknown> =
                    Reflect.apply(store.terminalChangesRead, store, [value]);
                  yield* refused(operation);
                } catch (error) {
                  expect(
                    error instanceof TypeError ||
                      Reflect.get(Object(error), "_tag") === "StoreError",
                  ).toBe(true);
                }
              }
              const batch = yield* store.terminalChangesRead(result.read);
              expect(batch.entries.map((entry) => entry.event.kind)).toEqual([
                "TaskCreated",
                "AuthChanged",
                "TaskDeleted",
                "ProfileDeleted",
              ]);
              expect(batch.entries.at(-1)?.seq).toBe(batch.cursor);
              yield* refused(store.terminalChangesRead(result.read));
              return result.read;
            }),
        );
        yield* refused(store.terminalChangesRead(retained));
        yield* store.auth.withRead(
          { credential, profile: personal },
          target,
          { task_id },
          (read) => {
            const operation: Effect.Effect<unknown, unknown> = Reflect.apply(
              store.terminalChangesRead,
              store,
              [read],
            );
            return refused(operation);
          },
        );
      }),
    ),
);

it.effect(
  "writes and expiry inside a live checked callback invalidate every earlier port",
  () =>
    fixture((store, credential, token, snapshot) =>
      Effect.gen(function* () {
        yield* store.auth.readSnapshot(() =>
          Effect.gen(function* () {
            const values = yield* capture(store, credential, token, snapshot);
            yield* store.auth.revokeToken({ credential, name: "reader" });
            for (const [, operation] of ports(store, values))
              yield* refused(operation);
          }),
        );
        const clock = yield* Clock.Clock;
        let current = Date.parse(time);
        yield* store.auth
          .readSnapshot(() =>
            Effect.gen(function* () {
              const values = yield* capture(
                store,
                credential,
                credential,
                snapshot,
              );
              current += 8 * 86400000;
              for (const [, operation] of ports(store, values))
                yield* refused(operation);
            }),
          )
          .pipe(
            Effect.provideService(Clock.Clock, {
              monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
              monotonicTimeNanos: clock.monotonicTimeNanos,
              sleep: (duration) => clock.sleep(duration),
              currentTimeMillisUnsafe: () => current,
              currentTimeMillis: Effect.sync(() => current),
              currentTimeNanosUnsafe: () => BigInt(current) * 1000000n,
              currentTimeNanos: Effect.sync(() => BigInt(current) * 1000000n),
            }),
          );
      }),
    ),
);

it("cancels a yielding Task search after its read lease has ended", async () => {
  const directory = mkdtempSync(join(tmpdir(), "todo-read-cancel-"));
  const store = await Effect.runPromise(
    openStore({ path: join(directory, "scratch.db") }),
  );
  try {
    await Effect.runPromise(store.putProfile(work));
    await Effect.runPromise(store.auth.setupOwner("cancel scratch passphrase"));
    const { credential } = await Effect.runPromise(
      store.auth.signIn("cancel scratch passphrase"),
    );
    await Effect.runPromise(
      store.append({
        actor,
        profile: work.id,
        event: {
          ...created,
          task: { ...created.task, description: "Café ".repeat(10000) },
        },
      }),
    );
    const original = store.searchWords.words.bind(store.searchWords);
    const controller = new AbortController();
    let prepared = 0;
    Object.defineProperty(store.searchWords, "words", {
      configurable: true,
      value: function* (...args: Parameters<typeof original>) {
        prepared++;
        expect(Reflect.get(store, "db").inTransaction).toBe(false);
        setImmediate(() => controller.abort());
        return yield* original(...args);
      },
    });
    const result = await Effect.runPromiseExit(
      new TaskCommands(store).list(
        { credential, profile: work.id },
        { text: "cafe" },
      ),
      { signal: controller.signal },
    );
    expect(
      Exit.isFailure(result) && Cause.hasInterruptsOnly(result.cause),
    ).toBe(true);
    expect(prepared).toBeGreaterThan(0);
    expect(store.searchWords.usage.pending).toBe(0);
    expect(Reflect.get(store, "db").inTransaction).toBe(false);
    expect(
      await Effect.runPromise(
        store.auth.projects({ credential, profile: work.id }),
      ),
    ).toEqual([]);
  } finally {
    await Effect.runPromise(store.close());
    rmSync(directory, { recursive: true, force: true });
  }
});

it.effect(
  "Import previews write nothing and later graph reads use freshly checked scopes",
  () =>
    fixture((store, credential) =>
      Effect.gen(function* () {
        const request = { credential, profile: work.id },
          db = Reflect.get(store, "db");
        const original = store.graphRead.bind(store);
        const seen = new WeakSet<object>();
        let graphs = 0;
        Object.defineProperty(store, "graphRead", {
          configurable: true,
          value: (...args: Parameters<typeof original>) =>
            Effect.suspend(() => {
              expect(db.inTransaction).toBe(true);
              expect(seen.has(args[0])).toBe(false);
              seen.add(args[0]);
              graphs++;
              return original(...args);
            }),
        });
        try {
          const before = db
            .query("SELECT total_changes() AS count")
            .get().count;
          const preview = yield* importTasks(store, request, {
            dry_run: true,
            items: [{ external_id: "scope:new", title: "New preview" }],
          });
          expect(preview.totals).toEqual({
            created: 1,
            updated: 0,
            unchanged: 0,
            rejected: 0,
          });
          expect(db.query("SELECT total_changes() AS count").get().count).toBe(
            before,
          );
          expect((yield* store.tasks()).map((task) => task.id)).toEqual([
            "task-1",
          ]);
          expect(
            (yield* importTasks(store, request, {
              items: [{ external_id: "scope:new", title: "First apply" }],
            })).totals,
          ).toEqual({ created: 1, updated: 0, unchanged: 0, rejected: 0 });
          expect(
            (yield* importTasks(store, request, {
              items: [
                {
                  external_id: "scope:new",
                  title: "Second apply",
                  depends_on: [],
                },
              ],
            })).totals,
          ).toEqual({ created: 0, updated: 1, unchanged: 0, rejected: 0 });
          expect(
            (yield* store.tasks()).find(
              (task) => task.external_id === "scope:new",
            )?.title,
          ).toBe("Second apply");
          expect(graphs).toBe(3);
        } finally {
          Object.defineProperty(store, "graphRead", { value: original });
        }
      }),
    ),
);
