import type { Database } from "bun:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "@effect/vitest";
import { Profile, ZonedInstant } from "@todo/domain";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Clock, Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import type { CacheHygieneReads, StreamReads } from "../src/raw-store-reads.ts";
import { StreamWake } from "../src/stream-wake.ts";
import { streamWakeStore } from "../src/stream-wake-store.ts";
import {
  type CompositionScope,
  compose,
  compositionLeaves,
  leaseScopes,
} from "./fixtures/stream-wake-compositions.ts";

const root = resolve(import.meta.dirname, "../../..");
const sources = (directory: string): string[] =>
  readdirSync(resolve(root, directory), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? sources(join(directory, entry.name))
        : entry.name.endsWith(".ts")
          ? [join(directory, entry.name)]
          : [],
    )
    .sort();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

// Review 3's adapter limits (R3-1, R3-2, R3-3) need the store's private
// connection, SQL transaction control or a writer built on the raw store. None
// of those may appear in the server's source.
it("keeps the store's private connection and raw transactions out of apps/server", () => {
  const server = sources("apps/server/src");
  const reaches = server.flatMap((path) =>
    [
      ...read(path).matchAll(
        /Reflect\.\w+\([^)]*["'`]db["'`]|\[\s*["'`]db["'`]\s*\]|\.db\b/g,
      ),
    ].map((match) => [path, match[0]]),
  );
  expect(reaches).toEqual([
    ["apps/server/src/stream-wake-store.ts", 'Reflect.get(store, "db"'],
  ]);
  const control = server.flatMap((path) =>
    [
      ...read(path).matchAll(/\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/gi),
    ].map((match) => [path, match[0]]),
  );
  expect(control).toEqual([]);
  const opened = server.flatMap((path) =>
    [...read(path).matchAll(/\bopenStore\(|new OperationStore\(/g)].map(
      (match) => [path, match[0]],
    ),
  );
  expect(opened).toEqual([["apps/server/src/server.ts", "openStore("]]);
  const raw = read("apps/server/src/server.ts")
    .split("\n")
    .filter((line) => /\brawStore\b/.test(line))
    .map((line) => line.trim());
  expect(raw).toEqual([
    "const rawStore = yield* Effect.acquireRelease(",
    "const store = streamWakeStore(rawStore, wake);",
    "const cacheHygiene = yield* taskSearchCacheHygiene(rawStore);",
    "changesLayer(rawStore, wake).pipe(Layer.provide(AuthorizationLive)),",
  ]);
});

// Type-level guard: the two raw-store readers cannot be used as a store.
it("types the raw-store readers so neither can reach a writer", () => {
  const narrowedReaders = (
    stream: StreamReads,
    cache: CacheHygieneReads,
    wake: StreamWake,
  ) => [
    // @ts-expect-error a stream reader cannot build Task commands
    () => new TaskCommands(stream),
    // @ts-expect-error cache hygiene cannot build Task commands
    () => new TaskCommands(cache),
    // @ts-expect-error a stream reader is not a store to decorate
    () => streamWakeStore(stream, wake),
    // @ts-expect-error a stream reader has no writer
    () => stream.append,
    // @ts-expect-error a stream reader has no Authentication writer
    () => stream.auth.mutate,
    // @ts-expect-error a stream reader cannot restore
    () => stream.snapshots.restore,
    // @ts-expect-error cache hygiene has no writer
    () => cache.append,
  ];
  expect(typeof narrowedReaders).toBe("function");
});

// Every database transaction runs to its end synchronously: its callback may
// not be async, await or chain a promise. The decorator's inTransaction check
// and the base loop both rely on it. Four call sites pass a `run` callback
// through; their callers are among the literal callbacks checked here.
it("pins every transaction callback as synchronous", () => {
  const calls = [
    ...sources("packages/domain/src"),
    ...sources("apps/server/src"),
  ].flatMap((path) => {
    const source = read(path);
    return [...source.matchAll(/\btransaction\(/g)].map((match) => {
      let depth = 1;
      let end = (match.index ?? 0) + match[0].length;
      const start = end;
      while (depth > 0) {
        const character = source[end++];
        if (character === undefined) throw new Error(`unbalanced in ${path}`);
        if ("([{".includes(character)) depth++;
        if (")]}".includes(character)) depth--;
      }
      return { path, argument: source.slice(start, end - 1).trim() };
    });
  });
  expect(calls).toHaveLength(36);
  const passed = calls.filter((call) => !call.argument.includes("=>"));
  expect(passed.map((call) => [call.path, call.argument])).toEqual([
    ["packages/domain/src/auth/auth.ts", "run"],
    ["packages/domain/src/store/store.ts", "run"],
    ["packages/domain/src/store/store.ts", "run"],
    ["packages/domain/src/store/store.ts", "run"],
  ]);
  const asynchronous = calls.filter((call) =>
    /\basync\b|\bawait\b|\.then\(|Promise|runPromise|runFork/.test(
      call.argument,
    ),
  );
  expect(asynchronous).toEqual([]);
});

const fixture = Effect.gen(function* () {
  yield* TestClock.setTime(Date.now());
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-raw-guard-"))),
    (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
  );
  const path = join(directory, "scratch.db");
  const raw = yield* Effect.acquireRelease(openStore({ path }), (store) =>
    Effect.orDie(store.close()),
  );
  yield* raw.auth.setupOwner("guard test passphrase");
  const profile = Schema.decodeUnknownSync(Profile)({
    id: "work",
    name: "work",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  });
  yield* raw.putProfile(profile);
  const session = yield* raw.auth.signIn("guard test passphrase");
  const request = { credential: session.credential, profile: profile.id };
  const created = yield* new TaskCommands(raw).create(request, {
    title: "Guard fixture",
    due_at: Schema.decodeUnknownSync(ZonedInstant)({
      kind: "instant",
      utc: new Date((yield* Clock.currentTimeMillis) - 1000).toISOString(),
      time_zone: "UTC",
    }),
  });
  if (created.outcome !== "committed")
    return yield* Effect.die("fixture Task refused");
  const wake = new StreamWake();
  const connection: Database = Reflect.get(raw, "db");
  return {
    raw,
    request,
    profile,
    task: created.task,
    wake,
    connection,
    store: streamWakeStore(raw, wake),
  };
});

// An asynchronous step inside any callback boundary cannot keep its
// transaction open: the boundary fails, the composed write rolls back and the
// connection is outside a transaction when the boundary returns.
for (const scope of [
  "mutate",
  "readSnapshot",
  ...leaseScopes,
] satisfies CompositionScope[]) {
  it.effect(`an asynchronous step inside ${scope} commits nothing`, () =>
    Effect.gen(function* () {
      const { raw, request, profile, task, connection, store } = yield* fixture;
      const before = (yield* raw.history()).length;
      const result = yield* Effect.exit(
        compose(
          store,
          { credential: request.credential, profile, task },
          [scope],
          Effect.gen(function* () {
            yield* new TaskCommands(store).create(request, {
              title: "Composed before an async step",
            });
            yield* Effect.promise(() => Promise.resolve());
          }),
          () => {},
        ),
      );
      expect(result._tag).toBe("Failure");
      expect(connection.inTransaction).toBe(false);
      yield* Effect.promise(() => new Promise((done) => setTimeout(done, 20)));
      expect(connection.inTransaction).toBe(false);
      expect((yield* raw.tasks()).map((row) => row.title).sort()).toEqual([
        "Guard fixture",
      ]);
      expect(
        (yield* raw.history())
          .slice(before)
          .filter((entry) => entry.outcome === "committed"),
      ).toEqual([]);
    }),
  );
}

// Integration note (c): a member that leaves the wake untouched may only
// write refusals, which no stream delivers. Every catalog leaf runs with the
// owner's Session and with an unknown credential, at top level, through the
// decorated store. Any leaf that does not advance the wake (every member
// classified "read", and the conditional scheduler members on empty work)
// must add only `rejected` op_log rows.
it.effect("rows written by unsignalled members are all rejected", () =>
  Effect.gen(function* () {
    const { raw, request, profile, task, wake, store } = yield* fixture;
    const silent: string[] = [];
    const committed: Array<[string, string]> = [];
    let refusals = 0;
    for (const credential of [request.credential, "unknown-credential"])
      for (const leaf of compositionLeaves) {
        const cursor = (yield* raw.history()).at(-1)?.seq ?? 0;
        const version = wake.version;
        yield* Effect.exit(
          Effect.suspend(() => leaf.run(store, { credential, profile, task })),
        );
        if (wake.version !== version) continue;
        silent.push(`${leaf.name}:${credential === request.credential}`);
        for (const entry of yield* raw.history(cursor)) {
          if (entry.outcome === "rejected") refusals++;
          else committed.push([leaf.name, entry.event.kind]);
        }
      }
    expect(committed).toEqual([]);
    expect(refusals).toBeGreaterThan(0);
    expect(silent.length).toBeGreaterThan(0);
  }),
);
