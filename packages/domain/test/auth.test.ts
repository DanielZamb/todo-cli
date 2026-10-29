import { Database } from "bun:sqlite";
import { chmodSync, mkdtempSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import {
  AuthError,
  FinishTaskRequest,
  Instant,
  ProfileId,
  Series,
  StartSeriesRequest,
} from "@todo/domain";
import { type OperationStore, openStore, StoreError } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { RRuleTemporal } from "rrule-temporal";
import { migrationSql } from "../src/store/0002.ts";
import { createProjection } from "../src/store/projection.ts";
import {
  actor,
  created,
  edited,
  profile,
  sequence,
  work,
} from "./store-fixtures.ts";

const start = Date.parse("2026-10-27T14:00:00Z");
const personal = Schema.decodeUnknownSync(ProfileId)("personal");
const scratch = <A, E>(run: (path: string) => Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-c04-test-"))),
    (directory) => run(join(directory, "scratch.db")),
    (directory) =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
  );
const usingStore = <A, E>(
  run: (store: OperationStore, path: string) => Effect.Effect<A, E>,
) =>
  scratch((path) =>
    Effect.acquireUseRelease(
      openStore({ path }),
      (store) => run(store, path),
      (store) => Effect.orDie(store.close()),
    ),
  );
const signIn = (store: OperationStore) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(start);
    yield* store.putProfile(work);
    yield* store.putProfile({ ...work, id: personal, name: "Personal" });
    yield* store.auth.setupOwner("scratch owner passphrase");
    return yield* store.auth.signIn("scratch owner passphrase");
  });
const denial = <A>(effect: Effect.Effect<A, AuthError | StoreError>) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(effect);
    expect(error).toBeInstanceOf(AuthError);
    return error instanceof AuthError
      ? [error.code, error.detail]
      : ["unexpected", "StoreError"];
  });

describe("owner, Sessions and Access Tokens", () => {
  it.effect(
    "stores Argon2id and hashed secrets, returns secrets only at issue, and persists across reopen",
    () =>
      usingStore((store, path) =>
        Effect.gen(function* () {
          const session = yield* signIn(store);
          expect(session.credential).toMatch(/^ses_[a-f0-9]{64}$/);
          expect([
            session.created_at,
            session.expires_at,
            session.profile,
            session.scope,
          ]).toEqual([
            "2026-10-27T14:00:00.000Z",
            "2026-11-03T14:00:00.000Z",
            null,
            "read-write",
          ]);
          const token = yield* store.auth.issueToken({
            credential: session.credential,
            token: { name: "work reader", profile, scope: "read-only" },
          });
          expect(token.credential).toMatch(/^tok_[a-f0-9]{64}$/);
          expect(token.expires_at).toBe("2027-01-25T14:00:00.000Z");
          const listed = yield* store.auth.listTokens(session);
          expect(
            listed.map((value) => [
              value.name,
              value.profile,
              value.scope,
              "credential" in value,
              "secret_hash" in value,
            ]),
          ).toEqual([["work reader", "work", "read-only", false, false]]);
          const sql = new Database(path);
          try {
            const hash = sql
              .query<{ passphrase_hash: string }, []>(
                "SELECT passphrase_hash FROM owner",
              )
              .get()?.passphrase_hash;
            expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
            expect(
              sql
                .query<{ secret_hash: string }, []>(
                  "SELECT secret_hash FROM credentials ORDER BY kind",
                )
                .all()
                .every((row) => /^[a-f0-9]{64}$/.test(row.secret_hash)),
            ).toBe(true);
            const stored =
              JSON.stringify(sql.query("SELECT * FROM credentials").all()) +
              JSON.stringify(yield* store.history());
            expect(stored.includes(session.credential)).toBe(false);
            expect(stored.includes(token.credential)).toBe(false);
            expect(stored.includes("scratch owner passphrase")).toBe(false);
          } finally {
            sql.close();
          }
          const reopened = yield* openStore({ path, create: false });
          try {
            expect(
              (yield* reopened.auth.authenticate({
                credential: token.credential,
                profile,
                access: "read",
              })).name,
            ).toBe("work reader");
          } finally {
            yield* reopened.close();
          }
        }),
      ),
  );

  it.effect(
    "keeps fixed Session expiry and rejects exact Session and default Token expiry",
    () =>
      usingStore((store) =>
        Effect.gen(function* () {
          const session = yield* signIn(store);
          const token = yield* store.auth.issueToken({
            credential: session.credential,
            token: { name: "long lived", profile: null, scope: "read-write" },
          });
          yield* TestClock.setTime(Date.parse("2026-11-03T13:59:59.999Z"));
          expect(
            (yield* store.auth.authenticate({
              ...session,
              profile,
              access: "write",
            })).expires_at,
          ).toBe("2026-11-03T14:00:00.000Z");
          yield* TestClock.setTime(Date.parse("2026-11-03T14:00:00Z"));
          expect(
            yield* denial(store.auth.read({ ...session, profile })),
          ).toEqual(["auth", "expired"]);
          yield* TestClock.setTime(Date.parse("2027-01-25T13:59:59.999Z"));
          expect(
            (yield* store.auth.authenticate({
              ...token,
              profile: personal,
              access: "write",
            })).scope,
          ).toBe("read-write");
          yield* TestClock.setTime(Date.parse("2027-01-25T14:00:00Z"));
          expect(yield* denial(store.auth.read({ ...token, profile }))).toEqual(
            ["auth", "expired"],
          );
          expect(
            (yield* store.history())
              .filter((entry) => entry.outcome === "rejected")
              .map((entry) => [entry.reason, entry.event.kind]),
          ).toEqual([
            ["auth", "AuthAttemptRejected"],
            ["auth", "AuthAttemptRejected"],
          ]);
        }),
      ),
  );

  it.effect(
    "enforces Profile and write scopes on reads, append, revert and the shared mutation path",
    () =>
      usingStore((store) =>
        Effect.gen(function* () {
          const session = yield* signIn(store);
          const reader = yield* store.auth.issueToken({
            ...session,
            token: { name: "reader", profile, scope: "read-only" },
          });
          const writer = yield* store.auth.issueToken({
            ...session,
            token: { name: "writer", profile, scope: "read-write" },
          });
          const global = yield* store.auth.issueToken({
            ...session,
            token: { name: "all profiles", profile: null, scope: "read-write" },
          });
          expect(
            yield* denial(
              store.auth.append({ ...reader, profile, event: created }),
            ),
          ).toEqual(["auth", "write_scope"]);
          expect(
            yield* denial(store.auth.read({ ...writer, profile: personal })),
          ).toEqual(["auth", "profile_scope"]);
          expect(
            yield* denial(
              store.auth.append({
                ...writer,
                profile,
                event: {
                  ...created,
                  task: { ...created.task, profile_id: personal },
                },
              }),
            ),
          ).toEqual(["auth", "profile_scope"]);
          const accepted = yield* store.auth.append({
            ...writer,
            profile,
            event: created,
          });
          expect([accepted.outcome, accepted.actor === writer.id]).toEqual([
            "committed",
            true,
          ]);
          const personalCreated = {
            ...created,
            task: {
              ...created.task,
              id: "personal-task",
              profile_id: personal,
              title: "Personal task",
            },
          };
          expect(
            (yield* store.auth.append({
              ...global,
              profile: personal,
              event: personalCreated,
            })).outcome,
          ).toBe("committed");
          expect(
            (yield* store.auth.read({ ...reader, profile })).tasks.map(
              (task) => task.title,
            ),
          ).toEqual(["Write the store"]);
          const read = yield* store.auth.read({ ...reader, profile });
          expect(read.profiles.map((value) => value.id)).toEqual(["work"]);
          expect(read.history.every((value) => value.profile === "work")).toBe(
            true,
          );
          expect(
            yield* denial(
              store.auth.revert({ ...reader, profile, seq: accepted.seq }),
            ),
          ).toEqual(["auth", "write_scope"]);
          expect(
            yield* denial(
              store.auth.mutate({ ...reader, profile }, (identity) =>
                store.append({ ...identity, event: edited }),
              ),
            ),
          ).toEqual(["auth", "write_scope"]);
          const changed = yield* store.auth.mutate(
            { ...writer, profile },
            (identity) => store.append({ ...identity, event: edited }),
          );
          expect(changed.outcome).toBe("committed");
          expect(
            (yield* store.auth.revert({ ...writer, profile, seq: sequence(1) }))
              .reason,
          ).toBe("invalid_revert");
          expect(
            (yield* store.auth.revert({ ...writer, profile, seq: changed.seq }))
              .outcome,
          ).toBe("committed");
          expect(
            (yield* store.auth.read({ ...session, profile })).tasks.map(
              (task) => [task.title, task.row_version],
            ),
          ).toEqual([["Write the store", 3]]);
          const rebuilt = yield* store.rebuild();
          expect(rebuilt.map((task) => [task.title, task.row_version])).toEqual(
            [
              ["Personal task", 1],
              ["Write the store", 3],
            ],
          );
          yield* store.takeSnapshot();
          expect(
            (yield* store.rebuild({ useSnapshot: true })).map((task) => [
              task.title,
              task.row_version,
            ]),
          ).toEqual([
            ["Personal task", 1],
            ["Write the store", 3],
          ]);
        }),
      ),
  );

  it.effect(
    "revokes by name and sign-out, rejects Token credential management, and records sanitized failures without a Profile",
    () =>
      usingStore((store) =>
        Effect.gen(function* () {
          expect(
            yield* denial(store.auth.signIn("missing owner secret")),
          ).toEqual(["auth", "invalid_passphrase"]);
          const session = yield* signIn(store);
          const token = yield* store.auth.issueToken({
            ...session,
            token: { name: "agent", profile: null, scope: "read-write" },
          });
          expect(
            yield* denial(store.auth.setupOwner("overwrite secret")),
          ).toEqual(["auth", "owner_exists"]);
          expect(yield* denial(store.auth.signIn("wrong secret"))).toEqual([
            "auth",
            "invalid_passphrase",
          ]);
          expect(yield* denial(store.auth.listTokens(token))).toEqual([
            "auth",
            "owner_required",
          ]);
          expect(
            yield* denial(
              store.auth.issueToken({
                ...token,
                token: {
                  name: "escalation",
                  profile: null,
                  scope: "read-write",
                },
              }),
            ),
          ).toEqual(["auth", "owner_required"]);
          expect(
            yield* denial(store.auth.revokeToken({ ...token, name: "agent" })),
          ).toEqual(["auth", "owner_required"]);
          expect(yield* denial(store.auth.signOut(token))).toEqual([
            "auth",
            "owner_required",
          ]);
          yield* store.auth.revokeToken({ ...session, name: "agent" });
          yield* store.auth.revokeToken({ ...session, name: "agent" });
          expect(
            yield* denial(
              store.auth.authenticate({ ...token, profile, access: "read" }),
            ),
          ).toEqual(["auth", "revoked"]);
          expect(
            (yield* store.auth.listTokens(session)).map((value) => [
              value.name,
              value.revoked_at,
            ]),
          ).toEqual([["agent", "2026-10-27T14:00:00.000Z"]]);
          yield* store.auth.signOut(session);
          expect(
            yield* denial(store.auth.read({ ...session, profile })),
          ).toEqual(["auth", "revoked"]);
          expect(
            yield* denial(
              store.auth.read({
                credential: "Bearer accidentally logged secret",
                profile: Schema.decodeUnknownSync(ProfileId)("missing"),
              }),
            ),
          ).toEqual(["auth", "invalid_credential"]);
          expect(
            yield* denial(
              store.auth.authenticate({
                credential: `tok_${"a".repeat(64)}`,
                profile,
                access: "read",
              }),
            ),
          ).toEqual(["auth", "invalid_credential"]);
          const failures = (yield* store.history()).filter(
            (entry) => entry.outcome === "rejected",
          );
          expect(failures.map((entry) => entry.reason)).toEqual([
            "auth",
            "auth",
            "auth",
            "auth",
            "auth",
            "auth",
            "auth",
            "auth",
            "auth",
            "auth",
            "auth",
          ]);
          expect(failures[0]?.profile).toBe(null);
          expect(failures[9]?.profile).toBe(null);
          expect(JSON.stringify(failures).includes("secret")).toBe(false);
          expect(
            (yield* store.history()).filter(
              (entry) =>
                entry.event.kind === "AuthChanged" &&
                entry.event.action === "revokeToken",
            ),
          ).toHaveLength(1);
        }),
      ),
  );

  it.effect(
    "honors custom expiry and rejects invalid issue requests without creating credentials",
    () =>
      usingStore((store) =>
        Effect.gen(function* () {
          const session = yield* signIn(store);
          const expires_at = Schema.decodeUnknownSync(Instant)(
            "2026-10-28T14:00:00Z",
          );
          const token = yield* store.auth.issueToken({
            ...session,
            token: {
              name: "one day",
              profile,
              scope: "read-write",
              expires_at,
            },
          });
          expect(token.expires_at).toBe("2026-10-28T14:00:00Z");
          expect(
            yield* denial(
              store.auth.issueToken({
                ...session,
                token: { name: "one day", profile, scope: "read-only" },
              }),
            ),
          ).toEqual(["auth", "invalid_request"]);
          expect(
            yield* denial(
              store.auth.issueToken({
                ...session,
                token: {
                  name: "missing profile",
                  profile: Schema.decodeUnknownSync(ProfileId)("missing"),
                  scope: "read-only",
                },
              }),
            ),
          ).toEqual(["auth", "invalid_request"]);
          yield* TestClock.setTime(Date.parse("2026-10-28T14:00:00Z"));
          expect(yield* denial(store.auth.read({ ...token, profile }))).toEqual(
            ["auth", "expired"],
          );
          expect(
            yield* denial(
              store.auth.issueToken({
                ...session,
                token: {
                  name: "expired",
                  profile,
                  scope: "read-write",
                  expires_at,
                },
              }),
            ),
          ).toEqual(["auth", "invalid_request"]);
          expect(
            (yield* store.auth.listTokens(session)).map((value) => value.name),
          ).toEqual(["one day"]);
        }),
      ),
  );

  it.effect(
    "rolls back a failed authenticated mutation and keeps a revoked token denied through another connection",
    () =>
      usingStore((store, path) =>
        Effect.gen(function* () {
          const session = yield* signIn(store);
          const token = yield* store.auth.issueToken({
            ...session,
            token: { name: "worker", profile, scope: "read-write" },
          });
          const before = yield* store.history();
          const error = yield* Effect.flip(
            store.auth.mutate({ ...token, profile }, (identity) =>
              Effect.gen(function* () {
                yield* store.append({ ...identity, event: created });
                return yield* Effect.fail(new StoreError("abort mutation"));
              }),
            ),
          );
          expect(error).toBeInstanceOf(StoreError);
          expect(yield* store.tasks()).toEqual([]);
          expect(yield* store.history()).toEqual(before);
          const second = yield* openStore({ path });
          try {
            yield* second.auth.revokeToken({ ...session, name: "worker" });
            expect(
              yield* denial(
                store.auth.append({ ...token, profile, event: created }),
              ),
            ).toEqual(["auth", "revoked"]);
            expect(yield* store.tasks()).toEqual([]);
          } finally {
            yield* second.close();
          }
        }),
      ),
  );
});

const daily = Schema.decodeUnknownSync(Series)({
  id: "auth-series",
  profile_id: profile,
  entity_version: 1,
  row_version: 1,
  recurrence: {
    dtstart: { kind: "date", date: "2026-10-27" },
    rrule: "FREQ=DAILY;COUNT=3",
    exdate: [],
  },
  task: { ...created.task, title: "Daily auth review" },
  created_at: work.created_at,
  updated_at: work.updated_at,
  deleted_at: null,
});
const seriesRequest = (credential: string, id: string, series = daily) =>
  Schema.decodeUnknownSync(StartSeriesRequest)({
    credential,
    profile: series.profile_id,
    series,
    task_id: id,
    occurrence_id: `occ-${id}`,
  });
const finishRequest = (
  credential: string,
  id: string,
  next: string,
  action: "complete" | "cancel" = "complete",
) =>
  Schema.decodeUnknownSync(FinishTaskRequest)({
    credential,
    profile,
    task_id: id,
    from_version: 1,
    action,
    next_task_id: next,
    next_occurrence_id: `occ-${next}`,
  });

describe("authenticated Series and Occurrences", () => {
  it.effect(
    "starts and advances Series with derived identity, denies scopes without successors, and replays resolved results",
    () =>
      usingStore((store) =>
        Effect.gen(function* () {
          const session = yield* signIn(store);
          const reader = yield* store.auth.issueToken({
            ...session,
            token: { name: "recurrence reader", profile, scope: "read-only" },
          });
          const writer = yield* store.auth.issueToken({
            ...session,
            token: { name: "recurrence writer", profile, scope: "read-write" },
          });
          expect(
            yield* denial(
              store.auth.startSeries(
                seriesRequest(reader.credential, "denied-first"),
              ),
            ),
          ).toEqual(["auth", "write_scope"]);
          expect(yield* store.tasks()).toEqual([]);
          expect(yield* store.series()).toEqual([]);
          const foreignSeries = Schema.decodeUnknownSync(Series)({
            ...daily,
            id: "personal-series",
            profile_id: personal,
          });
          expect(
            yield* denial(
              store.auth.startSeries({
                ...seriesRequest(
                  writer.credential,
                  "denied-personal",
                  foreignSeries,
                ),
              }),
            ),
          ).toEqual(["auth", "profile_scope"]);
          expect(
            yield* denial(
              store.auth.startSeries({
                ...seriesRequest(
                  writer.credential,
                  "disguised-personal",
                  foreignSeries,
                ),
                profile,
              }),
            ),
          ).toEqual(["auth", "profile_scope"]);
          const supplied = {
            ...seriesRequest(writer.credential, "auth-first"),
            actor: "client-spoof",
            occurred_at: "1900-01-01T00:00:00Z",
          };
          const started = yield* store.auth.startSeries(supplied);
          expect([
            started.outcome,
            started.actor === writer.id,
            started.event.occurred_at,
          ]).toEqual(["committed", true, "2026-10-27T14:00:00.000Z"]);
          yield* store.auth.startSeries(
            seriesRequest(session.credential, "personal-first", foreignSeries),
          );
          const beforeDenial = yield* store.tasks();
          expect(
            yield* denial(
              store.auth.finishTask(
                finishRequest(reader.credential, "auth-first", "denied-next"),
              ),
            ),
          ).toEqual(["auth", "write_scope"]);
          expect(
            yield* denial(
              store.auth.finishTask({
                ...finishRequest(
                  writer.credential,
                  "personal-first",
                  "denied-personal-next",
                ),
                profile: personal,
              }),
            ),
          ).toEqual(["auth", "profile_scope"]);
          expect(
            yield* denial(
              store.auth.finishTask(
                finishRequest(
                  writer.credential,
                  "personal-first",
                  "disguised-next",
                ),
              ),
            ),
          ).toEqual(["auth", "profile_scope"]);
          expect(yield* store.tasks()).toEqual(beforeDenial);
          const completed = yield* store.auth.finishTask(
            finishRequest(writer.credential, "auth-first", "auth-second"),
          );
          expect(
            completed.event.kind === "TaskCompleted"
              ? completed.event.next_occurrences.map((value) => value.id)
              : [],
          ).toEqual(["auth-second"]);
          yield* store.takeSnapshot();
          const cancelled = yield* store.auth.finishTask(
            finishRequest(
              writer.credential,
              "auth-second",
              "auth-third",
              "cancel",
            ),
          );
          expect(
            cancelled.event.kind === "TaskCancelled"
              ? cancelled.event.next_occurrences.map((value) => value.id)
              : [],
          ).toEqual(["auth-third"]);
          expect(
            (yield* store.auth.finishTask(
              finishRequest(writer.credential, "auth-first", "duplicate-next"),
            )).reason,
          ).toBe("conflict");
          const expected = [
            ["auth-first", "done", 2, { kind: "date", date: "2026-10-27" }],
            [
              "auth-second",
              "cancelled",
              2,
              { kind: "date", date: "2026-10-28" },
            ],
            ["auth-third", "open", 1, { kind: "date", date: "2026-10-29" }],
          ];
          expect(
            (yield* store.auth.read({ ...reader, profile })).tasks.map(
              (value) => [
                value.id,
                value.status,
                value.row_version,
                value.scheduled_at,
              ],
            ),
          ).toEqual(expected);
          const tasks = yield* store.tasks();
          const history = yield* store.history();
          const original = RRuleTemporal.prototype.next;
          RRuleTemporal.prototype.next = () => {
            throw new Error("Replay expanded recurrence");
          };
          try {
            expect(yield* store.rebuild()).toEqual(tasks);
            expect(yield* store.rebuild({ useSnapshot: true })).toEqual(tasks);
          } finally {
            RRuleTemporal.prototype.next = original;
          }
          expect(yield* store.history()).toEqual(history);
          expect(
            history
              .filter((entry) => entry.event.kind === "AuthAttemptRejected")
              .map((entry) =>
                entry.event.kind === "AuthAttemptRejected"
                  ? [entry.event.action, entry.event.detail, entry.reason]
                  : [],
              ),
          ).toEqual([
            ["startSeries", "write_scope", "auth"],
            ["startSeries", "profile_scope", "auth"],
            ["startSeries", "profile_scope", "auth"],
            ["finishTask", "write_scope", "auth"],
            ["finishTask", "profile_scope", "auth"],
            ["finishTask", "profile_scope", "auth"],
          ]);
        }),
      ),
  );

  it.effect(
    "rolls back authenticated complete and cancel when successor insertion fails, then retries exactly once",
    () =>
      usingStore((store, path) =>
        Effect.gen(function* () {
          const session = yield* signIn(store);
          yield* store.auth.startSeries(
            seriesRequest(session.credential, "auth-first"),
          );
          for (const [current, next, action] of [
            ["auth-first", "auth-second", "complete"],
            ["auth-second", "auth-third", "cancel"],
          ] satisfies [string, string, "complete" | "cancel"][]) {
            const before = yield* store.tasks();
            const history = yield* store.history();
            const db = new Database(path);
            try {
              db.exec(
                `CREATE TRIGGER fail_auth_successor BEFORE INSERT ON tasks WHEN NEW.id='${next}' BEGIN SELECT RAISE(ABORT, 'forced successor failure'); END`,
              );
              expect(
                yield* Effect.flip(
                  store.auth.finishTask(
                    finishRequest(session.credential, current, next, action),
                  ),
                ),
              ).toBeInstanceOf(StoreError);
              expect(yield* store.tasks()).toEqual(before);
              expect(yield* store.history()).toEqual(history);
            } finally {
              db.exec("DROP TRIGGER fail_auth_successor");
              db.close();
            }
            expect(
              (yield* store.auth.finishTask(
                finishRequest(session.credential, current, next, action),
              )).outcome,
            ).toBe("committed");
          }
          expect(
            (yield* store.tasks()).map((value) => [
              value.id,
              value.status,
              value.row_version,
            ]),
          ).toEqual([
            ["auth-first", "done", 2],
            ["auth-second", "cancelled", 2],
            ["auth-third", "open", 1],
          ]);
        }),
      ),
  );
});

describe("database boundary", () => {
  it.effect(
    "repairs target database and live WAL siblings through a file symlink while preserving Tasks",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          const targetPaths = [path, `${path}-wal`, `${path}-shm`];
          const alias = `${path}.alias`;
          const target = yield* openStore({ path });
          try {
            yield* target.putProfile(work);
            yield* target.append({ actor, profile, event: created });
            symlinkSync(path, alias);
            for (const file of targetPaths) chmodSync(file, 0o666);
            expect(
              targetPaths.map((file) => statSync(file).mode & 0o777),
            ).toEqual([0o666, 0o666, 0o666]);
            const reopened = yield* openStore({ path: alias, create: false });
            try {
              expect(
                targetPaths.map((file) => statSync(file).mode & 0o777),
              ).toEqual([0o600, 0o600, 0o600]);
              expect(
                (yield* reopened.tasks()).map((task) => [
                  task.id,
                  task.title,
                  task.row_version,
                ]),
              ).toEqual([["task-1", "Write the store", 1]]);
              expect(
                (yield* target.tasks()).map((task) => [
                  task.id,
                  task.title,
                  task.row_version,
                ]),
              ).toEqual([["task-1", "Write the store", 1]]);
            } finally {
              yield* reopened.close();
            }
          } finally {
            yield* target.close();
          }
        }),
      ),
  );

  it.effect(
    "creates database, WAL and SHM files with mode 0600 and repairs existing permissive siblings on open",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          const paths = [path, `${path}-wal`, `${path}-shm`];
          const store = yield* openStore({ path });
          try {
            expect(paths.map((file) => statSync(file).mode & 0o777)).toEqual([
              0o600, 0o600, 0o600,
            ]);
            for (const file of paths) chmodSync(file, 0o666);
            expect(paths.map((file) => statSync(file).mode & 0o777)).toEqual([
              0o666, 0o666, 0o666,
            ]);
            const reopened = yield* openStore({ path, create: false });
            try {
              expect(paths.map((file) => statSync(file).mode & 0o777)).toEqual([
                0o600, 0o600, 0o600,
              ]);
            } finally {
              yield* reopened.close();
            }
          } finally {
            yield* store.close();
          }
          chmodSync(path, 0o644);
          const reopened = yield* openStore({ path, create: false });
          try {
            expect(paths.map((file) => statSync(file).mode & 0o777)).toEqual([
              0o600, 0o600, 0o600,
            ]);
          } finally {
            yield* reopened.close();
          }
        }),
      ),
  );

  it.effect(
    "upgrades v2 with immutable history and snapshots intact and can reopen v3",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          const db = new Database(path, { create: true });
          db.function("domain_write_allowed", () => 1);
          try {
            db.exec(migrationSql);
            createProjection(db);
            db.query("INSERT INTO profiles VALUES (?,?,?,?)").run(
              "work",
              "Work",
              "2026-10-27T14:00:00Z",
              "2026-10-27T14:00:00Z",
            );
            db.query(
              "INSERT INTO op_log(seq,actor,profile,entity_version,event,from_version,to_version,outcome,reason) VALUES (7,'fixture','work',1,?,NULL,1,'committed',NULL)",
            ).run(JSON.stringify(created));
            db.query("INSERT INTO snapshots VALUES (7,1,?)").run(
              JSON.stringify({
                tasks: [],
                series: [],
                projects: [],
                tags: [],
                versions: [],
                series_versions: [],
              }),
            );
            db.exec("PRAGMA user_version=2");
          } finally {
            db.close();
          }
          const store = yield* openStore({ path });
          try {
            expect((yield* store.settings()).user_version).toBe(6);
            expect(
              (yield* store.history()).map((entry) => [
                entry.seq,
                entry.profile,
                entry.event.kind,
              ]),
            ).toEqual([[7, "work", "TaskCreated"]]);
            yield* TestClock.setTime(start);
            yield* store.auth.setupOwner("scratch passphrase");
            expect((yield* store.history()).map((entry) => entry.seq)).toEqual([
              7, 8,
            ]);
            const sql = new Database(path);
            try {
              expect(
                sql.query("SELECT seq,entity_version FROM snapshots").all(),
              ).toEqual([{ seq: 7, entity_version: 1 }]);
              expect(sql.query("PRAGMA foreign_key_check").all()).toEqual([]);
              expect(() =>
                sql.exec("UPDATE op_log SET actor='tampered'"),
              ).toThrow("append-only");
              expect(() => sql.exec("DELETE FROM op_log")).toThrow(
                "append-only",
              );
            } finally {
              sql.close();
            }
          } finally {
            yield* store.close();
          }
          const reopened = yield* openStore({ path, create: false });
          try {
            expect(
              (yield* reopened.history()).map((entry) => entry.seq),
            ).toEqual([7, 8]);
          } finally {
            yield* reopened.close();
          }
        }),
      ),
  );
});
