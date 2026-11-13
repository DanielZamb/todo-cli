import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { openStore } from "@todo/domain/store";
import { Cause, Effect, Exit, Schema } from "effect";
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
              const db = Reflect.get(store, "db");
              const transaction = db.transaction.bind(db);
              let physical = 0,
                uses = 0;
              Object.defineProperty(db, "transaction", {
                configurable: true,
                value: (...args: unknown[]) => {
                  if (!db.inTransaction) physical++;
                  return Reflect.apply(transaction, db, args);
                },
              });
              const credentialUsed = store.diagnostics.credentialUsed.bind(
                store.diagnostics,
              );
              Object.defineProperty(store.diagnostics, "credentialUsed", {
                configurable: true,
                value: (...args: Parameters<typeof credentialUsed>) => {
                  uses++;
                  return credentialUsed(...args);
                },
              });
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
              expect(
                physical,
                "Diagnostics must use one physical transaction",
              ).toBe(1);
              expect(uses, "Diagnostics must record credential use once").toBe(
                1,
              );
              expect(Reflect.get(store, "db").inTransaction).toBe(false);
              Object.defineProperty(store.diagnostics, "snapshot", {
                value: snapshot,
              });
              const retained = yield* store.auth.ownerRead(
                { credential },
                Schema.Struct({}),
                {},
              );
              yield* store.diagnostics.read({ credential });
              for (const value of [{}, structuredClone(retained), retained]) {
                const operation: Effect.Effect<unknown, unknown> =
                  Reflect.apply(
                    Reflect.get(store.diagnostics, "readWithin"),
                    store.diagnostics,
                    [value],
                  );
                const result = yield* Effect.exit(operation);
                expect(
                  Exit.isFailure(result),
                  "Diagnostics must reject an owner authority outside its lease",
                ).toBe(true);
                if (Exit.isFailure(result))
                  expect(
                    Reflect.get(Object(Cause.squash(result.cause)), "message"),
                  ).toBe("Error: Invalid read authority");
              }
            }),
          (store) => Effect.orDie(store.close()),
        ),
      (directory) =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    ),
);
