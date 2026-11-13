import type { Database } from "bun:sqlite";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Profile, ProfileId, type Task, ZonedInstant } from "@todo/domain";
import { OperationStore, TaskCommands } from "@todo/domain/store";
import { Clock, Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import {
  finish,
  occurrenceId,
  start,
  taskId,
  weekly,
} from "../../../packages/domain/test/recurrence-fixtures.ts";
import {
  actor,
  created,
  later,
  profile,
  sequence,
  task,
  work,
} from "../../../packages/domain/test/store-fixtures.ts";
import { StreamWake } from "../src/stream-wake.ts";
import { streamWakeStore } from "../src/stream-wake-store.ts";

// Review 4 (R4-2): a writer classified as a read would lose its signal and
// leave its commit to the 250 ms fallback. Each member classified "write" runs
// here once, at top level through the decorated store, with inputs that really
// change durable state. Every case requires that change, literally, and exactly
// one wake. Reclassifying any of these members as a read turns its case red.

const passphrase = "writer catalog passphrase";
const personal = Schema.decodeUnknownSync(Profile)({
  ...work,
  id: "personal",
  name: "Personal",
});
const personalId = Schema.decodeUnknownSync(ProfileId)("personal");

type World = {
  readonly raw: OperationStore;
  readonly store: OperationStore;
  readonly credential: string;
  readonly request: {
    readonly credential: string;
    readonly profile: ProfileId;
  };
  readonly task: Task;
  readonly prepared: unknown;
};
type Case = {
  readonly name: string;
  readonly owner?: false;
  readonly prepare?: (
    world: Omit<World, "prepared">,
  ) => Effect.Effect<unknown, unknown>;
  readonly run: (world: World) => Effect.Effect<unknown, unknown> | unknown;
  readonly committed: readonly string[];
  readonly database: boolean;
  readonly files?: "added" | "removed" | "changed";
};

const edit = (world: Omit<World, "prepared">) =>
  Effect.gen(function* () {
    const result = yield* new TaskCommands(world.raw).edit(
      { ...world.request, task_id: world.task.id },
      { from_version: world.task.row_version, changes: { title: "Edited" } },
    );
    if (result.outcome !== "committed")
      return yield* Effect.die("edit refused");
    const last = (yield* world.raw.history()).at(-1);
    if (last?.event.kind !== "TaskEdited") return yield* Effect.die("no edit");
    return sequence(last.seq);
  });
const snapshot = (world: Omit<World, "prepared">, reason = "manual") =>
  world.raw.snapshots.create(reason);

const cases: readonly Case[] = [
  {
    name: "store.ensureProfile",
    run: ({ store }) =>
      store.ensureProfile(
        Schema.decodeUnknownSync(Profile)({
          ...work,
          id: "extra",
          name: "Extra",
        }),
      ),
    committed: [],
    database: true,
  },
  {
    name: "store.putProfile",
    run: ({ store }) => store.putProfile({ ...work, name: "Renamed" }),
    committed: [],
    database: true,
  },
  {
    name: "store.append",
    run: ({ store }) =>
      store.append({
        actor,
        profile,
        event: { ...created, task: { ...task, id: "appended" } },
      }),
    committed: ["TaskCreated"],
    database: true,
  },
  {
    name: "store.move",
    run: ({ store, task: before }) =>
      store.move({
        actor,
        before,
        after: {
          ...before,
          profile_id: personalId,
          row_version: before.row_version + 1,
          updated_at: later,
        } as Task,
        original_seq: null,
      }),
    committed: ["TaskMovedOut", "TaskMovedIn"],
    database: true,
  },
  {
    name: "store.startSeries",
    run: ({ store }) => store.startSeries(start(weekly, "w1")),
    committed: ["TaskCreated"],
    database: true,
  },
  {
    name: "store.finishTask",
    prepare: ({ raw }) => raw.startSeries(start(weekly, "w1")),
    run: ({ store }) => store.finishTask(finish("w1", "w2")),
    committed: ["TaskCompleted"],
    database: true,
  },
  {
    name: "store.reject",
    run: ({ store }) =>
      store.reject({
        actor,
        profile,
        event: { ...created, task: { ...task, id: "rejected" } },
        reason: "validation",
      }),
    committed: [],
    database: true,
  },
  {
    name: "store.takeSnapshot",
    run: ({ store }) => store.takeSnapshot(),
    committed: [],
    database: true,
  },
  {
    name: "store.rebuild",
    run: ({ store }) => store.rebuild(),
    committed: [],
    database: true,
  },
  {
    name: "store.revert",
    prepare: edit,
    run: ({ store, prepared }) =>
      store.revert({
        actor,
        profile,
        seq: prepared as ReturnType<typeof sequence>,
        occurred_at: later,
      }),
    committed: ["TaskReverted"],
    database: true,
  },
  {
    name: "auth.setupOwner",
    owner: false,
    run: ({ store }) => store.auth.setupOwner(passphrase),
    committed: ["AuthChanged"],
    database: true,
  },
  {
    name: "auth.resetPassphrase",
    run: ({ store }) => store.auth.resetPassphrase("a new writer passphrase"),
    committed: ["AuthChanged"],
    database: true,
  },
  {
    name: "auth.signIn",
    run: ({ store }) => store.auth.signIn(passphrase),
    committed: ["AuthChanged"],
    database: true,
  },
  {
    name: "auth.issueToken",
    run: ({ store, credential }) =>
      store.auth.issueToken({
        credential,
        token: { name: "issued", profile: null, scope: "read-only" },
      }),
    committed: ["AuthChanged"],
    database: true,
  },
  {
    name: "auth.cleanupExpired",
    prepare: () => TestClock.adjust("8 days"),
    run: ({ store }) => store.auth.cleanupExpired(),
    committed: ["AuthChanged"],
    database: true,
  },
  {
    name: "auth.revokeToken",
    prepare: ({ raw, credential }) =>
      raw.auth.issueToken({
        credential,
        token: { name: "revoked", profile: null, scope: "read-only" },
      }),
    run: ({ store, credential }) =>
      store.auth.revokeToken({ credential, name: "revoked" }),
    committed: ["AuthChanged"],
    database: true,
  },
  {
    name: "auth.signOut",
    run: ({ store, credential }) => store.auth.signOut({ credential }),
    committed: ["AuthChanged"],
    database: true,
  },
  {
    name: "auth.deleteProfile",
    run: ({ store, credential }) =>
      store.auth.deleteProfile({
        credential,
        profile: personalId,
        options: { dry_run: false, with_tasks: true },
      }),
    committed: ["ProfileDeleted"],
    database: true,
    files: "added",
  },
  {
    name: "auth.append",
    run: ({ store, request }) =>
      store.auth.append({
        ...request,
        event: { ...created, task: { ...task, id: "copied" } },
      }),
    committed: ["TaskCreated"],
    database: true,
  },
  {
    name: "auth.startSeries",
    run: ({ store, request }) =>
      store.auth.startSeries({
        ...request,
        series: weekly,
        attachments: [],
        external_id: null,
        task_id: taskId("w1"),
        occurrence_id: occurrenceId("occ-w1"),
      }),
    committed: ["TaskCreated"],
    database: true,
  },
  {
    name: "auth.finishTask",
    prepare: ({ raw }) => raw.startSeries(start(weekly, "w1")),
    run: ({ store, request }) =>
      store.auth.finishTask({
        ...request,
        task_id: taskId("w1"),
        from_version: finish("w1", "w2").from_version,
        action: "complete",
        next_task_id: taskId("w2"),
        next_occurrence_id: occurrenceId("occ-w2"),
      }),
    committed: ["TaskCompleted"],
    database: true,
  },
  {
    name: "auth.mutate",
    // The body writes through the raw store, so only mutate's own exit can
    // signal.
    run: ({ store, raw, request }) =>
      store.auth.mutate(request, () =>
        raw.putProfile({ ...work, name: "Mutated" }),
      ),
    committed: [],
    database: true,
  },
  {
    name: "auth.revert",
    prepare: edit,
    run: ({ store, request, prepared }) =>
      store.auth.revert({
        ...request,
        seq: prepared as ReturnType<typeof sequence>,
      }),
    committed: ["TaskReverted"],
    database: true,
  },
  {
    name: "snapshots.createSync",
    run: ({ store }) => store.snapshots.createSync("manual"),
    committed: [],
    database: false,
    files: "added",
  },
  {
    name: "snapshots.create",
    run: ({ store }) => store.snapshots.create("manual"),
    committed: [],
    database: false,
    files: "added",
  },
  {
    name: "snapshots.discardSync",
    prepare: snapshot,
    run: ({ store, prepared }) =>
      store.snapshots.discardSync((prepared as { id: string }).id),
    committed: [],
    database: false,
    files: "removed",
  },
  {
    name: "snapshots.redactAllSync",
    prepare: snapshot,
    run: ({ store, task: target }) =>
      store.snapshots.redactAllSync([target.id]),
    committed: [],
    database: false,
    files: "changed",
  },
  {
    name: "snapshots.restore",
    prepare: snapshot,
    run: ({ store, prepared }) =>
      store.snapshots.restore((prepared as { id: string }).id),
    committed: ["DatabaseRestored"],
    database: true,
    files: "added",
  },
  {
    name: "snapshots.prune",
    prepare: (world) =>
      snapshot(world).pipe(Effect.andThen(snapshot(world, "manual again"))),
    run: ({ store }) => store.snapshots.prune(),
    committed: [],
    database: false,
    files: "removed",
  },
  {
    name: "snapshots.runDaily",
    run: ({ store }) => store.snapshots.runDaily(),
    committed: [],
    database: false,
    files: "added",
  },
  {
    name: "scheduled.runDue",
    prepare: ({ raw, request }) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        return yield* new TaskCommands(raw).create(request, {
          title: "Due reminder",
          due_at: Schema.decodeUnknownSync(ZonedInstant)({
            kind: "instant",
            utc: new Date(now - 1000).toISOString(),
            time_zone: "UTC",
          }),
        });
      }),
    run: ({ store }) => store.scheduled.runDue(),
    committed: ["ReminderFired"],
    database: true,
  },
];

const files = (directory: string) => {
  try {
    return readdirSync(directory)
      .sort()
      .map((name) => {
        const stat = statSync(join(directory, name));
        return `${name}:${stat.size}:${stat.mtimeMs}`;
      });
  } catch {
    return [];
  }
};

const writerCases = cases.map((value) => value.name);

for (const value of cases)
  it.effect(
    `${value.name} really commits and wakes streams once`,
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2026-11-01T12:00:00Z"));
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-wake-writer-"))),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const raw = yield* Effect.acquireRelease(
          Effect.sync(
            () =>
              new OperationStore({
                path: join(directory, "scratch.db"),
                attachmentRoot: join(directory, "attachments"),
              }),
          ),
          (store) => Effect.orDie(store.close()),
        );
        yield* raw.putProfile(work);
        yield* raw.putProfile(personal);
        const appended = yield* raw.append({ actor, profile, event: created });
        if (appended.outcome !== "committed") return yield* Effect.die("task");
        let credential = "";
        if (value.owner !== false) {
          yield* raw.auth.setupOwner(passphrase);
          credential = (yield* raw.auth.signIn(passphrase)).credential;
        }
        const target = (yield* raw.tasks()).find((row) => row.id === task.id);
        if (!target) return yield* Effect.die("missing task");
        const wake = new StreamWake();
        const base = {
          raw,
          store: streamWakeStore(raw, wake),
          credential,
          request: { credential, profile },
          task: target,
        };
        const prepared = value.prepare ? yield* value.prepare(base) : undefined;
        const connection: Database = Reflect.get(raw, "db");
        const changes = () =>
          connection
            .query<{ n: number }, []>("SELECT total_changes() AS n")
            .get()?.n ?? 0;
        const cursor = (yield* raw.history()).at(-1)?.seq ?? 0;
        const filesBefore = files(raw.snapshots.directory);
        const changesBefore = changes();
        const version = wake.version;
        const result = value.run({ ...base, prepared });
        const exit = yield* Effect.exit(
          Effect.isEffect(result)
            ? (result as Effect.Effect<unknown, unknown>)
            : Effect.succeed(result),
        );
        expect(exit._tag, value.name).toBe("Success");
        const filesAfter = files(raw.snapshots.directory);
        const observed = {
          committed: (yield* raw.history(cursor))
            .filter((entry) => entry.outcome === "committed")
            .map((entry) => entry.event.kind),
          databaseChanged: changes() > changesBefore,
          files:
            filesAfter.length > filesBefore.length
              ? "added"
              : filesAfter.length < filesBefore.length
                ? "removed"
                : filesAfter.join() !== filesBefore.join()
                  ? "changed"
                  : undefined,
        };
        expect(observed, value.name).toEqual({
          committed: value.committed,
          databaseChanged: value.database,
          files: value.files,
        });
        expect(
          observed.databaseChanged || observed.files !== undefined,
          `${value.name} changed nothing durable`,
        ).toBe(true);
        expect(connection.inTransaction).toBe(false);
        expect(wake.version, value.name).toBe(version + 1);
      }),
    30000,
  );

it("covers every member the decorator classifies as a write", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../src/stream-wake-store.ts"),
    "utf8",
  );
  const groups: Record<string, string> = {
    "store.scheduled": "scheduled",
    "store.auth": "auth",
    "store.snapshots": "snapshots",
    "store,": "store",
  };
  const writes: string[] = [];
  for (const block of source.split("observe(").slice(1)) {
    const target = Object.entries(groups).find(([key]) =>
      block.trimStart().startsWith(key),
    )?.[1];
    if (!target) continue;
    const policy = block.slice(0, block.indexOf("finished,"));
    for (const match of policy.matchAll(/(\w+): "write"/g))
      writes.push(`${target}.${match[1]}`);
  }
  expect(writes.sort()).toEqual([...writerCases].sort());
  expect(writes).toHaveLength(31);
});
