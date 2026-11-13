import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { AuthError, ProfileId } from "@todo/domain";
import { type OperationStore, openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { work } from "./store-fixtures.ts";

const time = Date.parse("2026-11-13T00:20:00.001Z");
const profile = Schema.decodeUnknownSync(ProfileId)("work");
const withDatabase = <A, E>(run: (path: string) => Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-durable-denial-"))),
    (directory) => run(join(directory, "scratch.db")),
    (directory) => Effect.sync(() => rmSync(directory, { recursive: true })),
  );
const refuseStore = (store: OperationStore) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      store.auth.authenticate({
        credential: "tok_forged",
        profile,
        access: "read",
      }),
    );
    expect(error).toBeInstanceOf(AuthError);
  });
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
const refuse = (path: string) => onStore(path, refuseStore);
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

it.effect("merges a refusal across reopened stores in the same minute", () =>
  withDatabase((path) =>
    Effect.gen(function* () {
      yield* TestClock.setTime(time);
      yield* refuse(path);
      yield* refuse(path);
      expect(count(path)).toBe(1);
      yield* TestClock.setTime(time + 60_000);
      yield* refuse(path);
      expect(count(path)).toBe(2);
    }),
  ),
);

const noise = [
  { label: "prior minute", at: "2026-11-13T00:19:59.999Z", expected: 1 },
  { label: "horizon equality", at: "2026-11-13T00:19:00.000Z", expected: 1 },
  {
    label: "older recording clock",
    at: "2026-11-13T00:18:59.999Z",
    expected: 2,
  },
  {
    label: "future recording clock",
    at: "2026-11-13T00:21:00.000Z",
    expected: 1,
  },
  { label: "missing stamp", at: null, expected: 1 },
  { label: "unparsable stamp", at: "not a date", expected: 1 },
];
for (const { label, at, expected } of noise)
  it.effect(`uses History horizon with ${label}`, () =>
    withDatabase((path) =>
      onStore(path, (store) =>
        Effect.gen(function* () {
          yield* TestClock.setTime(time);
          yield* refuseStore(store);
          const db = new Database(path);
          try {
            db.function("domain_write_allowed", () => 1);
            const insert = db.query(
              "INSERT INTO op_log(actor,profile,entity_version,event,outcome,reason) VALUES ('noise','work',1,?,'committed',NULL)",
            );
            db.transaction(() => {
              for (let index = 0; index < 5000; index++)
                insert.run(
                  JSON.stringify({
                    kind: "AuthChanged",
                    action: "signOut",
                    credential_id: null,
                    entity_version: 1,
                    ...(at === null ? {} : { occurred_at: at }),
                  }),
                );
            }).immediate();
          } finally {
            db.close();
          }
          yield* refuseStore(store);
          expect(count(path)).toBe(expected);
        }),
      ),
    ),
  );

const skippedKinds: ReadonlyArray<readonly [string, string]> = [
  ["TaskCreated", "migration:0002"],
  ["TaskAttemptRejected", "agent"],
  ["TaskHistoryRedacted", "agent"],
  ["UnknownFutureEvent", "agent"],
];
for (const [kind, actor] of skippedKinds)
  it.effect(`never ends the walk on ${kind}/${actor}`, () =>
    withDatabase((path) =>
      onStore(path, (store) =>
        Effect.gen(function* () {
          yield* TestClock.setTime(time);
          yield* refuseStore(store);
          const db = new Database(path);
          try {
            db.function("domain_write_allowed", () => 1);
            db.query(
              "INSERT INTO op_log(actor,profile,entity_version,event,outcome,reason) VALUES (?,'work',1,?,'committed',NULL)",
            ).run(
              actor,
              JSON.stringify({ kind, occurred_at: "2000-01-01T00:00:00Z" }),
            );
          } finally {
            db.close();
          }
          yield* refuseStore(store);
          expect(count(path)).toBe(1);
        }),
      ),
    ),
  );
