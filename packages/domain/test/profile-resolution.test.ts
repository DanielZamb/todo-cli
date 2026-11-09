import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import {
  AuthError,
  Instant,
  ProfileId,
  ProfileResolutionError,
} from "@todo/domain";
import {
  type OperationStore,
  openStore,
  type StoreError,
} from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { time, work } from "./store-fixtures.ts";

const start = Date.parse(time);
const id = Schema.decodeUnknownSync(ProfileId);
const using = <A, E>(
  run: (store: OperationStore, path: string) => Effect.Effect<A, E>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-profile-resolution-"))),
    (directory) =>
      Effect.acquireUseRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (store) => run(store, join(directory, "scratch.db")),
        (store) => Effect.orDie(store.close()),
      ),
    (directory) =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
  );
const setup = (store: OperationStore) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(start);
    yield* store.putProfile({ ...work, name: "Named Work" });
    yield* store.putProfile({
      ...work,
      id: id("other-id"),
      name: "Foreign name",
    });
    yield* store.putProfile({ ...work, id: id("gone-id"), name: "Gone name" });
    yield* store.auth.setupOwner("scratch resolution passphrase");
    return yield* store.auth.signIn("scratch resolution passphrase");
  });

it.effect(
  "resolves only authorized metadata and conceals absent, foreign and deleted Profiles",
  () =>
    using((store) =>
      Effect.gen(function* () {
        const owner = yield* setup(store);
        const token = yield* store.auth.issueToken({
          credential: owner.credential,
          token: { name: "scoped", profile: id("work"), scope: "read-write" },
        });
        yield* store.auth.deleteProfile({
          credential: owner.credential,
          profile: id("gone-id"),
          options: { with_tasks: false, dry_run: false },
        });
        expect(
          yield* store.auth.resolveProfile({
            credential: token.credential,
            profile: "Named Work",
            action: "read",
          }),
        ).toEqual({ id: "work", name: "Named Work" });
        const rejectionProfiles = [];
        for (const profile of ["Foreign name", "absent", "gone-id"]) {
          const copy = yield* store.fork();
          try {
            const before = (yield* copy.history()).length;
            const error = yield* Effect.flip(
              copy.auth.resolveProfile({
                credential: token.credential,
                profile,
                action: "read",
              }),
            );
            expect(error).toBeInstanceOf(ProfileResolutionError);
            expect([
              error.message,
              "code" in error ? error.code : null,
            ]).toEqual(["Profile not found", "not_found"]);
            const rows = (yield* copy.history()).slice(before);
            expect(rows.length).toBe(1);
            rejectionProfiles.push(
              rows.map((row) => [
                row.profile,
                row.event.kind === "AuthAttemptRejected"
                  ? row.event.action
                  : null,
              ]),
            );
          } finally {
            yield* copy.close();
          }
        }
        expect(rejectionProfiles).toEqual([
          [["other-id", "read"]],
          [[null, "read"]],
          [["gone-id", "read"]],
        ]);
        expect(
          yield* store.auth.resolveProfile({
            credential: owner.credential,
            profile: "Foreign name",
            action: "mutate",
          }),
        ).toEqual({ id: "other-id", name: "Foreign name" });
        for (const profile of ["absent", "Gone name"])
          expect(
            yield* Effect.flip(
              store.auth.resolveProfile({
                credential: owner.credential,
                profile,
                action: "read",
              }),
            ),
          ).toBeInstanceOf(ProfileResolutionError);
      }),
    ),
);

it.effect(
  "expired and revoked owner/scoped credentials record exactly the real read/mutate rejection with stable named Profile attribution",
  () =>
    using((store) =>
      Effect.gen(function* () {
        const owner = yield* setup(store);
        const expiredToken = yield* store.auth.issueToken({
          credential: owner.credential,
          token: {
            name: "expired",
            profile: id("work"),
            scope: "read-write",
            expires_at: Schema.decodeUnknownSync(Instant)(
              new Date(start + 1).toISOString(),
            ),
          },
        });
        const revokedToken = yield* store.auth.issueToken({
          credential: owner.credential,
          token: { name: "revoked", profile: id("work"), scope: "read-write" },
        });
        const expiredOwner = yield* store.auth.signIn(
          "scratch resolution passphrase",
        );
        const revokedOwner = yield* store.auth.signIn(
          "scratch resolution passphrase",
        );
        yield* store.auth.revokeToken({
          credential: owner.credential,
          name: "revoked",
        });
        yield* store.auth.signOut(revokedOwner);
        const cases = [
          { issued: expiredToken, at: start + 1, detail: "expired" },
          { issued: revokedToken, at: start, detail: "revoked" },
          { issued: expiredOwner, at: start + 7 * 86400000, detail: "expired" },
          { issued: revokedOwner, at: start, detail: "revoked" },
        ];
        for (const { issued, at, detail } of cases)
          for (const action of ["read", "mutate"] as const) {
            yield* TestClock.setTime(at);
            const results: unknown[] = [];
            for (const via of ["operation", "resolver"] as const) {
              const connection = yield* store.fork();
              try {
                const before = (yield* connection.history()).length;
                const request = {
                  credential: issued.credential,
                  profile: id("work"),
                };
                const operation: Effect.Effect<
                  unknown,
                  AuthError | ProfileResolutionError | StoreError
                > =
                  via === "resolver"
                    ? connection.auth.resolveProfile({
                        ...request,
                        profile: "Named Work",
                        action,
                      })
                    : action === "read"
                      ? connection.auth.read(request)
                      : connection.auth.mutate(request, () => Effect.void);
                const error = yield* Effect.flip(operation);
                expect(error).toBeInstanceOf(AuthError);
                const rows = (yield* connection.history()).slice(before);
                expect(rows.length).toBe(1);
                const row = rows[0];
                if (!row || row.event.kind !== "AuthAttemptRejected")
                  throw new Error("Expected one auth rejection");
                const fields = [
                  row.actor,
                  row.profile,
                  row.event.entity_version,
                  row.from_version,
                  row.to_version,
                  row.outcome,
                  row.reason,
                  row.event.kind,
                  row.event.code,
                  row.event.detail,
                  row.event.action,
                  row.event.occurred_at,
                ];
                expect(fields).toEqual([
                  issued.id,
                  "work",
                  1,
                  null,
                  null,
                  "rejected",
                  "auth",
                  "AuthAttemptRejected",
                  "auth",
                  detail,
                  action,
                  new Date(at).toISOString(),
                ]);
                results.push(fields);
              } finally {
                yield* connection.close();
              }
            }
            expect(results[0]).toEqual(results[1]);
          }
      }),
    ),
);

it.effect(
  "keeps direct id-only rejection context separate from resolver name lookup",
  () =>
    using((store) =>
      Effect.gen(function* () {
        const owner = yield* setup(store);
        const token = yield* store.auth.issueToken({
          credential: owner.credential,
          token: { name: "revoked-name", profile: null, scope: "read-write" },
        });
        yield* store.auth.revokeToken({
          credential: owner.credential,
          name: "revoked-name",
        });
        const recorded = [];
        for (const via of ["operation", "resolver"] as const) {
          const copy = yield* store.fork();
          try {
            const before = (yield* copy.history()).length;
            const operation: Effect.Effect<
              unknown,
              AuthError | ProfileResolutionError | StoreError
            > =
              via === "operation"
                ? copy.auth.read({
                    credential: token.credential,
                    profile: id("Named Work"),
                  })
                : copy.auth.resolveProfile({
                    credential: token.credential,
                    profile: "Named Work",
                    action: "read",
                  });
            expect(yield* Effect.flip(operation)).toBeInstanceOf(AuthError);
            const rows = (yield* copy.history()).slice(before);
            expect(rows.length).toBe(1);
            recorded.push(rows.map((row) => row.profile));
          } finally {
            yield* copy.close();
          }
        }
        expect(recorded).toEqual([[null], ["work"]]);
      }),
    ),
);

it.effect(
  "resolver follows an active name over a colliding deleted id while direct id History retains the tombstone",
  () =>
    using((store) =>
      Effect.gen(function* () {
        const owner = yield* setup(store);
        const token = yield* store.auth.issueToken({
          credential: owner.credential,
          token: {
            name: "revoked-collision",
            profile: null,
            scope: "read-write",
          },
        });
        yield* store.auth.deleteProfile({
          credential: owner.credential,
          profile: id("work"),
          options: { with_tasks: false, dry_run: false },
        });
        yield* store.putProfile({ ...work, id: id("new-work"), name: "work" });
        expect(
          yield* store.auth.resolveProfile({
            credential: owner.credential,
            profile: "work",
            action: "read",
          }),
        ).toEqual({ id: "new-work", name: "work" });
        yield* store.auth.revokeToken({
          credential: owner.credential,
          name: "revoked-collision",
        });
        const recorded = [];
        for (const via of ["operation", "resolver"] as const) {
          const copy = yield* store.fork();
          try {
            const before = (yield* copy.history()).length;
            const operation: Effect.Effect<
              unknown,
              AuthError | ProfileResolutionError | StoreError
            > =
              via === "operation"
                ? copy.auth.read({
                    credential: token.credential,
                    profile: id("work"),
                  })
                : copy.auth.resolveProfile({
                    credential: token.credential,
                    profile: "work",
                    action: "read",
                  });
            expect(yield* Effect.flip(operation)).toBeInstanceOf(AuthError);
            const rows = (yield* copy.history()).slice(before);
            expect(rows.length).toBe(1);
            recorded.push(rows.map((row) => row.profile));
          } finally {
            yield* copy.close();
          }
        }
        expect(recorded).toEqual([["work"], ["new-work"]]);
      }),
    ),
);
