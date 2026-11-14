import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { AuthError, ProfileId } from "@todo/domain";
import { type OperationStore, openStore } from "@todo/domain/store";
import { Clock, Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { vi } from "vitest";
import { work } from "./store-fixtures.ts";

// A repeated refusal is decided first in a read (ADR-0007 amendment). These
// tests act exactly between that read and the refusal's return through a
// test-only wrapper; the decision function itself is the production one.
type ReadHook = (result: boolean, detail: string) => void;
const hook = vi.hoisted(() => ({
  current: undefined as ReadHook | undefined,
  reads: [] as string[],
}));
vi.mock("../src/auth/rejection-history.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/auth/rejection-history.ts")>();
  return {
    ...actual,
    repeatedAuthRejection: (
      ...args: Parameters<typeof actual.repeatedAuthRejection>
    ) => {
      const [db, attempt] = args;
      const result = actual.repeatedAuthRejection(...args);
      if (!db.inTransaction) {
        hook.reads.push(attempt.detail);
        const run = hook.current;
        hook.current = undefined;
        run?.(result, attempt.detail);
      }
      return result;
    },
  };
});

const time = Date.parse("2026-11-13T00:20:00.001Z");
const profile = Schema.decodeUnknownSync(ProfileId)("work");
const fixedClock = Clock.clockWith((clock) =>
  Effect.succeed({
    ...clock,
    currentTimeMillisUnsafe: () => time,
    currentTimeMillis: Effect.succeed(time),
    currentTimeNanosUnsafe: () => BigInt(time) * 1_000_000n,
    currentTimeNanos: Effect.succeed(BigInt(time) * 1_000_000n),
  }),
);
// Runs another store's whole operation synchronously inside the hook, as a
// second process would between this process's read and its return.
const runElsewhere = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runSync(
    Effect.flatMap(fixedClock, (clock) =>
      Effect.provideService(effect, Clock.Clock, clock),
    ),
  );
const withDatabase = <A, E>(run: (path: string) => Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-durable-read-"))),
    (directory) => run(join(directory, "scratch.db")),
    (directory) => Effect.sync(() => rmSync(directory, { recursive: true })),
  );
const onStore = <A, E>(
  path: string,
  run: (store: OperationStore) => Effect.Effect<A, E>,
) =>
  Effect.acquireUseRelease(
    openStore({ path }),
    (store) =>
      Effect.gen(function* () {
        yield* store.putProfile(work);
        return yield* run(store);
      }),
    (store) => Effect.orDie(store.close()),
  );
const refusal = (store: OperationStore) =>
  Effect.flip(
    store.auth.authenticate({
      credential: "tok_forged",
      profile,
      access: "read",
    }),
  );
const count = (path: string) => {
  const db = new Database(path, { readonly: true });
  try {
    return db
      .query<{ n: number }, []>(
        "SELECT count(*) n FROM op_log WHERE json_extract(event,'$.kind')='AuthAttemptRejected'",
      )
      .get()?.n;
  } finally {
    db.close();
  }
};
// 5,000 committed rows stamped in the preceding minute, appended after the
// first refusal: every repeat has to read them to reach its match.
const bulk = (path: string) => {
  const db = new Database(path);
  try {
    db.function("domain_write_allowed", () => 1);
    const insert = db.query(
      "INSERT INTO op_log(actor,profile,entity_version,event,outcome,reason) VALUES ('noise','work',1,?,'committed',NULL)",
    );
    const event = JSON.stringify({
      kind: "AuthChanged",
      action: "signOut",
      credential_id: null,
      entity_version: 1,
      occurred_at: "2026-11-13T00:19:59.999Z",
    });
    db.transaction(() => {
      for (let index = 0; index < 5000; index++) insert.run(event);
    }).immediate();
  } finally {
    db.close();
  }
};
const reset = () => {
  hook.current = undefined;
  hook.reads.length = 0;
};

// Counts the store's write transactions (BEGIN IMMEDIATE) and their holds.
const lockCounter = (store: OperationStore) => {
  const original: unknown = Reflect.get(store, "transaction");
  if (typeof original !== "function") throw new Error("no transaction");
  const holds: number[] = [];
  let depth = 0;
  Reflect.set(store, "transaction", (run: () => unknown) => {
    const outer = depth++ === 0;
    let acquired: number | undefined;
    try {
      return original.call(store, () => {
        if (outer) acquired = performance.now();
        return run();
      });
    } finally {
      depth--;
      if (outer && acquired !== undefined)
        holds.push(performance.now() - acquired);
    }
  });
  return holds;
};

it.effect("decides a repeat after a bulk write outside the write lock", () =>
  withDatabase((path) =>
    onStore(path, (store) =>
      Effect.gen(function* () {
        reset();
        yield* TestClock.setTime(time);
        const holds = lockCounter(store);
        yield* refusal(store);
        // The first refusal: the failed check's transaction, then the
        // recording transaction that appends.
        expect(holds).toHaveLength(2);
        bulk(path);
        holds.length = 0;
        const inside: boolean[] = [];
        hook.current = (result) => inside.push(result);
        const error = yield* refusal(store);
        expect(error).toBeInstanceOf(AuthError);
        // The walk over 5,000 rows ran outside any transaction and matched;
        // the only write transaction is the failed check's own, as before
        // this change. No recording transaction was opened.
        expect(inside).toEqual([true]);
        expect(holds).toHaveLength(1);
        expect(count(path)).toBe(1);
      }),
    ),
  ),
);

it.effect(
  "two processes that both miss in their reads leave one row",
  () =>
    withDatabase((path) =>
      onStore(path, (first) =>
        onStore(path, (second) =>
          Effect.gen(function* () {
            reset();
            yield* TestClock.setTime(time);
            const seen: boolean[] = [];
            hook.current = (result) => {
              seen.push(result);
              // The other process reads, misses, locks, re-checks, appends.
              hook.current = (other) => seen.push(other);
              runElsewhere(refusal(second));
            };
            yield* refusal(first);
            // Both reads missed; the first then took the lock, decided again
            // inside it and found the second's row.
            expect(seen).toEqual([false, false]);
            expect(count(path)).toBe(1);
          }),
        ),
      ),
    ),
  15_000,
);

it.effect(
  "a restore between the read and the return: one outcome",
  () =>
    withDatabase((path) =>
      onStore(path, (store) =>
        onStore(path, (other) =>
          Effect.gen(function* () {
            reset();
            yield* TestClock.setTime(time);
            const before = yield* store.snapshots.create("before refusal");
            yield* refusal(store);
            expect(count(path)).toBe(1);
            const seen: boolean[] = [];
            hook.current = (result) => {
              seen.push(result);
              runElsewhere(other.snapshots.restore(before.id));
            };
            const error = yield* refusal(store);
            // The repeat matched at its read snapshot and is merged with the
            // refusal the restore then removed: denied, nothing appended, and
            // History is the restored one, with no refusal in this minute.
            expect(error).toBeInstanceOf(AuthError);
            expect(seen).toEqual([true]);
            expect(count(path)).toBe(0);
            // The next identical refusal finds nothing and is recorded.
            yield* refusal(store);
            expect(count(path)).toBe(1);
          }),
        ),
      ),
    ),
  15_000,
);

it.effect(
  "wrong passphrases never take the read decision and are all counted",
  () =>
    withDatabase((path) =>
      onStore(path, (store) =>
        Effect.gen(function* () {
          reset();
          yield* TestClock.setTime(time);
          yield* store.auth.setupOwner("scratch durable passphrase");
          for (let index = 0; index < 10; index++) {
            const error = yield* Effect.flip(
              store.auth.signIn("wrong passphrase"),
            );
            expect(error).toBeInstanceOf(AuthError);
            expect((error as AuthError).detail).toBe("invalid_passphrase");
          }
          const locked = yield* Effect.flip(
            store.auth.signIn("scratch durable passphrase"),
          );
          expect((locked as AuthError).detail).toBe("sign_in_locked");
          expect(hook.reads).not.toContain("invalid_passphrase");
          const db = new Database(path, { readonly: true });
          try {
            expect(
              db
                .query<{ n: number }, []>(
                  "SELECT count(*) n FROM op_log WHERE json_extract(event,'$.detail')='invalid_passphrase'",
                )
                .get()?.n,
            ).toBe(10);
          } finally {
            db.close();
          }
        }),
      ),
    ),
  30_000,
);

it.effect("keeps the stated limit across processes: two rows", () =>
  withDatabase((path) =>
    Effect.gen(function* () {
      reset();
      yield* TestClock.setTime(time);
      yield* onStore(path, refusal);
      const db = new Database(path);
      try {
        db.function("domain_write_allowed", () => 1);
        db.query(
          "INSERT INTO op_log(actor,profile,entity_version,event,outcome,reason) VALUES ('noise','work',1,?,'committed',NULL)",
        ).run(
          JSON.stringify({
            kind: "AuthChanged",
            action: "signOut",
            credential_id: null,
            entity_version: 1,
            occurred_at: "2026-11-13T00:18:59.999Z",
          }),
        );
      } finally {
        db.close();
      }
      yield* onStore(path, refusal);
      expect(count(path)).toBe(2);
    }),
  ),
);
