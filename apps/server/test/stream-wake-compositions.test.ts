import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Profile, ZonedInstant } from "@todo/domain";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Clock, Effect, Fiber, Schema } from "effect";
import { TestClock } from "effect/testing";
import { StoreError } from "../../../packages/domain/src/store/error.ts";
import { StreamWake } from "../src/stream-wake.ts";
import { streamWakeStore } from "../src/stream-wake-store.ts";
import {
  compose,
  compositionLeaves,
  compositionPaths,
} from "./fixtures/stream-wake-compositions.ts";

const fixture = Effect.gen(function* () {
  yield* TestClock.setTime(Date.now());
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-wake-composition-"))),
    (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
  );
  const raw = yield* Effect.acquireRelease(
    openStore({ path: join(directory, "scratch.db") }),
    (store) => Effect.orDie(store.close()),
  );
  yield* raw.auth.setupOwner("composition test passphrase");
  const profile = Schema.decodeUnknownSync(Profile)({
    id: "work",
    name: "work",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  });
  yield* raw.putProfile(profile);
  const session = yield* raw.auth.signIn("composition test passphrase");
  const request = { credential: session.credential, profile: profile.id };
  const due = Schema.decodeUnknownSync(ZonedInstant)({
    kind: "instant",
    utc: new Date((yield* Clock.currentTimeMillis) - 1000).toISOString(),
    time_zone: "UTC",
  });
  const created = yield* new TaskCommands(raw).create(request, {
    title: "Provisional reminder",
    due_at: due,
  });
  if (created.outcome !== "committed")
    return yield* Effect.die("fixture Task refused");
  const wake = new StreamWake();
  return {
    raw,
    request,
    profile,
    task: created.task,
    wake,
    store: streamWakeStore(raw, wake),
  };
});

for (const boundary of ["readSnapshot", "sync-snapshot"] as const) {
  it.effect(
    `holds ${boundary} notifications until the real transaction ends`,
    () =>
      Effect.gen(function* () {
        const { raw, request, wake, store } = yield* fixture;
        let inside = -1;
        const operation = () =>
          Effect.gen(function* () {
            yield* store.scheduled.runDue();
            if (boundary === "sync-snapshot")
              store.snapshots.createSync("Provisional Snapshot");
            inside = wake.version;
            return yield* Effect.fail(new StoreError("rollback"));
          });
        yield* Effect.exit(
          boundary === "readSnapshot"
            ? store.auth.readSnapshot(operation)
            : store.auth.mutate(request, operation),
        );
        expect(
          (yield* raw.history()).filter(
            (entry) => entry.event.kind === "ReminderFired",
          ),
        ).toEqual([]);
        expect(inside).toBe(0);
        expect(wake.version).toBe(1);
      }),
  );
}

it.effect(
  "signals a detached child's commit after the parent transaction has ended",
  () =>
    Effect.gen(function* () {
      const { raw, request, wake, store } = yield* fixture;
      const child = yield* store.auth.mutate(request, () =>
        Effect.forkDetach(
          Effect.sleep("100 millis").pipe(
            Effect.andThen(store.scheduled.runDue()),
          ),
        ),
      );
      expect(wake.version).toBe(1);
      const waiting = yield* wake.wait(wake.version).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      yield* TestClock.adjust("100 millis");
      expect(yield* Fiber.join(child)).toEqual({ woken: 0, reminders: 1 });
      expect(
        (yield* raw.history()).filter(
          (entry) => entry.event.kind === "ReminderFired",
        ),
      ).toHaveLength(1);
      expect(wake.version).toBe(2);
      yield* Fiber.join(waiting);
      expect(wake.waiting).toBe(0);
    }),
);

for (const path of compositionPaths) {
  for (const rollback of [false, true]) {
    it.effect(
      `all member exits under ${path.join(" / ")} with ${rollback ? "rollback" : "commit"}`,
      () =>
        Effect.gen(function* () {
          const { raw, request, profile, wake, store } = yield* fixture;
          const commands = new TaskCommands(raw);
          yield* raw.scheduled.runDue();
          for (const leaf of compositionLeaves) {
            const created = yield* commands.create(request, {
              title: `Provisional ${leaf.name}`,
              due_at: Schema.decodeUnknownSync(ZonedInstant)({
                kind: "instant",
                utc: new Date(
                  (yield* Clock.currentTimeMillis) - 1000,
                ).toISOString(),
                time_zone: "UTC",
              }),
            });
            if (created.outcome !== "committed")
              return yield* Effect.die("fixture Task refused");
            const cursor = (yield* raw.history()).at(-1)?.seq ?? 0;
            const version = wake.version;
            let observed: unknown[] = [];
            const reader = yield* Effect.gen(function* () {
              yield* wake.wait(version);
              observed = (yield* raw.history(cursor)).filter(
                (entry) =>
                  entry.outcome === "committed" && entry.profile === profile.id,
              );
            }).pipe(Effect.forkScoped);
            yield* Effect.yieldNow;
            const check = () => {
              expect(wake.version, leaf.name).toBe(version);
              expect(reader.pollUnsafe(), leaf.name).toBeUndefined();
            };
            const input = {
              credential: request.credential,
              profile,
              task: created.task,
            };
            const result = yield* Effect.exit(
              compose(
                store,
                input,
                path,
                Effect.gen(function* () {
                  expect(yield* store.scheduled.runDue(), leaf.name).toEqual({
                    woken: 0,
                    reminders: 1,
                  });
                  check();
                  yield* Effect.exit(
                    Effect.suspend(() => leaf.run(store, input)),
                  );
                  check();
                  if (rollback)
                    return yield* Effect.fail(new StoreError("outer rollback"));
                }),
                check,
              ),
            );
            expect(result._tag, leaf.name).toBe(
              rollback ? "Failure" : "Success",
            );
            yield* Fiber.join(reader);
            const durable = (yield* raw.history(cursor)).filter(
              (entry) =>
                entry.outcome === "committed" && entry.profile === profile.id,
            );
            expect(
              durable.map((entry) => entry.event.kind),
              leaf.name,
            ).toEqual(rollback ? [] : ["ReminderFired"]);
            expect(observed, leaf.name).toEqual(durable);
            expect(wake.version, leaf.name).toBe(version + 1);
            yield* raw.scheduled.runDue();
          }
        }),
      { timeout: 60000 },
    );
  }
}
