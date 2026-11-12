import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { openStore } from "@todo/domain/store";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { time, work } from "./store-fixtures.ts";

it.effect(
  "Diagnostics materialization holds one owner lease through a real Snapshot list",
  () =>
    Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-diagnostics-scope-"))),
      (directory) =>
        Effect.acquireUseRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (store) =>
            Effect.gen(function* () {
              yield* TestClock.setTime(Date.parse(time));
              yield* store.putProfile(work);
              yield* store.auth.setupOwner(
                "diagnostics scope scratch passphrase",
              );
              const { credential } = yield* store.auth.signIn(
                "diagnostics scope scratch passphrase",
              );
              const saved = yield* store.snapshots.create(
                "diagnostics scope proof",
              );
              const snapshot = Reflect.get(store.diagnostics, "snapshot");
              Object.defineProperty(store.diagnostics, "snapshot", {
                configurable: true,
                value: (...args: unknown[]) => {
                  expect(
                    Reflect.get(store, "db").inTransaction,
                    "Diagnostics materialization must hold its owner lease",
                  ).toBe(true);
                  return Reflect.apply(snapshot, store.diagnostics, args);
                },
              });
              const body = yield* store.diagnostics.read({ credential });
              expect(body.storage.last_snapshot?.id).toBe(saved.id);
              expect(Reflect.get(store, "db").inTransaction).toBe(false);
            }),
          (store) => Effect.orDie(store.close()),
        ),
      (directory) =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    ),
);
