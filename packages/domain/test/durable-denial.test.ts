import { Database } from "bun:sqlite";
import { closeSync, mkdtempSync, openSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { AuthError, ProfileId } from "@todo/domain";
import { type OperationStore, openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import {
  maxWalkedEventBytes,
  repeatedAuthRejection,
} from "../src/auth/rejection-history.ts";
import { AuthAction, AuthAttemptRejected } from "../src/events.ts";
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

// A process can read its clock first and commit second: the other process's
// refusal in the same minute then carries a later stamp than this attempt.
// It is still the same minute's refusal, so nothing more is appended.
it.effect("merges a same-minute refusal stamped after the attempt", () =>
  withDatabase((path) =>
    Effect.gen(function* () {
      yield* TestClock.setTime(time + 50);
      yield* refuse(path);
      yield* TestClock.setTime(time);
      yield* refuse(path);
      expect(count(path)).toBe(1);
      yield* TestClock.setTime(time - 60_000);
      yield* refuse(path);
      expect(count(path)).toBe(2);
    }),
  ),
);

// Events larger than maxWalkedEventBytes are skipped unread. A refusal can
// never be one of them: its largest possible form is far below the bound.
it("keeps every possible refusal far below the walked-event bound", () => {
  const longest = (values: readonly string[]) =>
    values.reduce((a, b) => (b.length > a.length ? b : a));
  const largest = JSON.stringify({
    kind: "AuthAttemptRejected",
    code: "auth",
    detail: longest(AuthAttemptRejected.fields.detail.literals),
    action: longest(AuthAction.literals),
    entity_version: 1,
    occurred_at: "2026-11-13T00:20:00.001Z",
  });
  expect(Buffer.byteLength(largest)).toBeLessThan(200);
  expect(maxWalkedEventBytes).toBe(4096);
});

const largeEvent = (occurred_at: string) =>
  JSON.stringify({
    kind: "TaskCreated",
    entity_version: 1,
    occurred_at,
    task: { title: "Imported", description: "x".repeat(100_000) },
  });

// A large row stamped before the horizon and committed after the refusal used
// to end the walk and let the repeat append; it is now skipped unread.
it.effect("a large older-stamped row no longer hides a refusal", () =>
  withDatabase((path) =>
    onStore(path, (store) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(time);
        yield* refuseStore(store);
        const db = new Database(path);
        try {
          db.function("domain_write_allowed", () => 1);
          db.query(
            "INSERT INTO op_log(actor,profile,entity_version,event,outcome,reason) VALUES ('import','work',1,?,'committed',NULL)",
          ).run(largeEvent("2026-11-13T00:18:59.999Z"));
        } finally {
          db.close();
        }
        yield* refuseStore(store);
        expect(count(path)).toBe(1);
      }),
    ),
  ),
);

// The walk must not load a large event at all: with every overflow page of
// 20 large rows zeroed, any read of their content fails as corrupt, yet the
// production walk passes over them and finds the refusal below.
it.effect("walks past large events without reading their content", () =>
  withDatabase((path) =>
    Effect.gen(function* () {
      yield* TestClock.setTime(time);
      yield* onStore(path, refuseStore);
      const db = new Database(path);
      let overflow: number[];
      let pageSize: number;
      let actor: string;
      try {
        actor =
          db
            .query<{ actor: string }, []>(
              "SELECT actor FROM op_log WHERE outcome='rejected' AND profile='work'",
            )
            .get()?.actor ?? "";
        db.function("domain_write_allowed", () => 1);
        const insert = db.query(
          "INSERT INTO op_log(actor,profile,entity_version,event,outcome,reason) VALUES ('import','work',1,?,'committed',NULL)",
        );
        db.transaction(() => {
          for (let index = 0; index < 20; index++)
            insert.run(largeEvent("2026-11-13T00:19:59.999Z"));
        }).immediate();
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        pageSize =
          db.query<{ page_size: number }, []>("PRAGMA page_size").get()
            ?.page_size ?? 0;
        overflow = db
          .query<{ pageno: number }, []>(
            "SELECT pageno FROM dbstat WHERE name='op_log' AND pagetype='overflow'",
          )
          .all()
          .map((row) => row.pageno);
      } finally {
        db.close();
      }
      expect(overflow.length).toBeGreaterThan(400);
      const file = openSync(path, "r+");
      try {
        for (const page of overflow)
          writeSync(
            file,
            Buffer.alloc(pageSize),
            0,
            pageSize,
            (page - 1) * pageSize,
          );
      } finally {
        closeSync(file);
      }
      const check = new Database(path, { readonly: true });
      try {
        expect(() =>
          check
            .query("SELECT length(event) FROM op_log WHERE profile='work'")
            .all(),
        ).toThrow(/malformed/);
        expect(
          repeatedAuthRejection(check, {
            actor,
            profile,
            action: "authenticate",
            detail: "invalid_credential",
            time,
          }),
        ).toBe(true);
      } finally {
        check.close();
      }
    }),
  ),
);
