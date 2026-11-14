import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Instant, Profile, ZonedInstant } from "@todo/domain";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Clock, Effect, Exit, Fiber, Schema } from "effect";
import { TestClock } from "effect/testing";
import { StoreError } from "../../../packages/domain/src/store/error.ts";
import { StreamWake } from "../src/stream-wake.ts";
import { streamWakeStore } from "../src/stream-wake-store.ts";

const fixture = Effect.gen(function* () {
  yield* TestClock.setTime(Date.now());
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-wake-observer-"))),
    (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
  );
  const raw = yield* Effect.acquireRelease(
    openStore({ path: join(directory, "scratch.db") }),
    (store) => Effect.orDie(store.close()),
  );
  yield* raw.auth.setupOwner("observer test passphrase");
  const profile = Schema.decodeUnknownSync(Profile)({
    id: "work",
    name: "work",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  });
  yield* raw.putProfile(profile);
  const session = yield* raw.auth.signIn("observer test passphrase");
  return {
    raw,
    request: { credential: session.credential, profile: profile.id },
  };
});

class ThrowingWake extends StreamWake {
  override readonly signal = () => {
    throw new Error("failing wake observer");
  };
}

it.effect(
  "preserves an accepted Task and its result when the wake observer dies",
  () =>
    Effect.gen(function* () {
      const { raw, request } = yield* fixture;
      const store = streamWakeStore(raw, new ThrowingWake());
      const result = yield* Effect.exit(
        new TaskCommands(store).create(request, {
          title: "Accepted exactly once",
        }),
      );
      expect(
        (yield* raw.tasks()).map((task) => [task.title, task.row_version]),
      ).toEqual([["Accepted exactly once", 1]]);
      expect(
        (yield* raw.history()).filter(
          (entry) =>
            entry.outcome === "committed" && entry.event.kind === "TaskCreated",
        ),
      ).toHaveLength(1);
      expect(result._tag).toBe("Success");
      if (Exit.isSuccess(result))
        expect(result.value.outcome).toBe("committed");
    }),
);

it.effect("contains conditional and synchronous observer defects", () =>
  Effect.gen(function* () {
    const { raw } = yield* fixture;
    const store = streamWakeStore(raw, new ThrowingWake());
    const daily = yield* Effect.exit(store.snapshots.runDaily());
    expect(daily._tag).toBe("Success");
    const snapshot = store.snapshots.createSync("Synchronous observer");
    expect(snapshot.reason).toBe("Synchronous observer");
    expect((yield* raw.snapshots.show(snapshot.id)).reason).toBe(
      "Synchronous observer",
    );
  }),
);

it.effect(
  "preserves the original typed failure, defect and interruption with a failing observer",
  () =>
    Effect.gen(function* () {
      const { raw } = yield* fixture;
      const failure = new StoreError("original typed failure");
      const defect = new Error("original defect");
      const effects = [
        Effect.fail(failure),
        Effect.die(defect),
        Effect.interrupt,
      ];
      for (const effect of effects) {
        const port = new Proxy(raw, {
          get(target, key, receiver) {
            return key === "takeSnapshot"
              ? () => effect
              : Reflect.get(target, key, receiver);
          },
        });
        const store = streamWakeStore(port, new ThrowingWake());
        expect(yield* Effect.exit(store.takeSnapshot())).toEqual(
          yield* Effect.exit(effect),
        );
      }
    }),
);

for (const method of ["runDue", "cleanupExpired", "runDaily"] as const) {
  it.effect(
    `defers ${method} until the enclosing write ends, including rollback`,
    () =>
      Effect.gen(function* () {
        const { raw, request } = yield* fixture;
        if (method === "runDue") {
          const due = Schema.decodeUnknownSync(ZonedInstant)({
            kind: "instant",
            utc: new Date(
              (yield* Clock.currentTimeMillis) - 1000,
            ).toISOString(),
            time_zone: "UTC",
          });
          yield* new TaskCommands(raw).create(request, {
            title: "Provisional reminder",
            due_at: due,
          });
        }
        if (method === "cleanupExpired") {
          yield* raw.auth.issueToken({
            credential: request.credential,
            token: {
              name: "Expires in outer write",
              profile: request.profile,
              scope: "read-only",
              expires_at: Schema.decodeUnknownSync(Instant)(
                new Date((yield* Clock.currentTimeMillis) + 1000).toISOString(),
              ),
            },
          });
          yield* TestClock.adjust("2 seconds");
        }
        const wake = new StreamWake();
        const store = streamWakeStore(raw, wake);
        const cursor = (yield* raw.history()).at(-1)?.seq ?? 0;
        let seen: string[] = [];
        let insideVersion = -1;
        const reader = yield* Effect.gen(function* () {
          yield* wake.wait(0);
          yield* raw.snapshots.generation();
          seen = (yield* raw.history(cursor)).map((entry) => entry.event.kind);
          yield* raw.auth.authenticate({ ...request, access: "read" });
        }).pipe(Effect.forkScoped);
        yield* Effect.yieldNow;
        const result = yield* Effect.exit(
          store.auth.mutate(request, () =>
            Effect.gen(function* () {
              if (method === "runDue")
                expect(yield* store.scheduled.runDue()).toEqual({
                  woken: 0,
                  reminders: 1,
                });
              if (method === "cleanupExpired")
                expect(yield* store.auth.cleanupExpired()).toBe(1);
              if (method === "runDaily")
                expect(yield* store.snapshots.runDaily()).not.toBeNull();
              insideVersion = wake.version;
              expect(reader.pollUnsafe()).toBeUndefined();
              return yield* Effect.fail(new StoreError("enclosing rollback"));
            }),
          ),
        );
        yield* Fiber.join(reader);
        expect(result._tag).toBe("Failure");
        expect(insideVersion).toBe(0);
        expect(wake.version).toBe(1);
        expect(seen).toEqual([]);
        expect(
          (yield* raw.history(cursor)).map((entry) => entry.event.kind),
        ).toEqual([]);
        if (method === "cleanupExpired")
          expect(
            (yield* raw.auth.listTokens({
              credential: request.credential,
            })).map((token) => token.name),
          ).toEqual(["Expires in outer write"]);
      }),
  );
}

it.effect(
  "preserves synchronous Snapshot results when the observer throws",
  () =>
    Effect.gen(function* () {
      const { raw } = yield* fixture;
      const store = streamWakeStore(raw, new ThrowingWake());
      const snapshot = store.snapshots.createSync(
        "Synchronous committed result",
      );
      expect(snapshot.reason).toBe("Synchronous committed result");
      expect((yield* raw.snapshots.show(snapshot.id)).reason).toBe(
        "Synchronous committed result",
      );
    }),
);

it.effect(
  "retains the timer fallback after a committed write with a broken observer",
  () =>
    Effect.gen(function* () {
      const { raw, request } = yield* fixture;
      const wake = new ThrowingWake();
      const store = streamWakeStore(raw, wake);
      const waiting = yield* wake.wait(0).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      const result = yield* new TaskCommands(store).create(request, {
        title: "Fallback survives observer failure",
      });
      expect(result.outcome).toBe("committed");
      expect(waiting.pollUnsafe()).toBeUndefined();
      yield* TestClock.adjust("250 millis");
      yield* Fiber.join(waiting);
      expect(wake.waiting).toBe(0);
      expect((yield* raw.tasks()).map((task) => task.title)).toEqual([
        "Fallback survives observer failure",
      ]);
    }),
);
