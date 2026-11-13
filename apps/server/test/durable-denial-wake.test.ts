import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "@effect/vitest";
import { Profile, ProfileId } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { serverLayer } from "../src/server.ts";
import { StreamWake } from "../src/stream-wake.ts";
import { streamWakeStore } from "../src/stream-wake-store.ts";

// The durable repeated-refusal rule (fix/durable-denial) on the merged server:
// a refusal is decided from History, first in a read and, on absence, again
// inside the recording transaction. Every walk is observed at its query, with
// the connection's transaction state at that moment.
const walkPrefix = "SELECT seq,octet_length(event) AS bytes";
const walks: boolean[] = [];
const query = Database.prototype.query;
Database.prototype.query = function (this: Database, sql: string) {
  if (sql.startsWith(walkPrefix)) walks.push(this.inTransaction);
  return query.call(this, sql) as ReturnType<typeof query>;
} as typeof query;
afterAll(() => {
  Database.prototype.query = query;
});

const work = Schema.decodeUnknownSync(Profile)({
  id: "work",
  name: "work",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
});
const workId = Schema.decodeUnknownSync(ProfileId)("work");
const scratch = Effect.acquireRelease(
  Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-denial-wake-"))),
  (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
);
const refusals = (raw: Effect.Success<ReturnType<typeof openStore>>) =>
  raw
    .history()
    .pipe(
      Effect.map((rows) =>
        rows
          .filter((row) => row.event.kind === "AuthAttemptRejected")
          .map((row) => [row.outcome, row.profile, row.event.kind]),
      ),
    );

it.live(
  "a repeated refusal through the decorated store commits nothing and wakes no stream",
  () =>
    Effect.gen(function* () {
      const directory = yield* scratch;
      const raw = yield* Effect.acquireRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (store) => Effect.orDie(store.close()),
      );
      yield* raw.auth.setupOwner("denial wake passphrase");
      yield* raw.putProfile(work);
      const owner = yield* raw.auth.signIn("denial wake passphrase");
      const token = yield* raw.auth.issueToken({
        credential: owner.credential,
        token: { name: "refused", profile: null, scope: "read-only" },
      });
      yield* raw.auth.revokeToken({
        credential: owner.credential,
        name: "refused",
      });
      const wake = new StreamWake();
      const store = streamWakeStore(raw, wake);
      const request = {
        credential: token.credential,
        profile: workId,
        access: "read" as const,
      };
      walks.length = 0;
      const steps: unknown[] = [];
      for (const label of ["read first", "read repeat", "read repeat"]) {
        const version = wake.version;
        const exit = yield* Effect.exit(store.auth.authenticate(request));
        steps.push([
          label,
          exit._tag,
          (yield* refusals(raw)).length,
          wake.version - version,
        ]);
      }
      // A member classified "write" signals on every exit, by design: a refusal
      // that commits nothing still costs one empty pass.
      for (const label of ["write first", "write repeat"]) {
        const version = wake.version;
        const exit = yield* Effect.exit(
          store.auth.append({
            credential: token.credential,
            profile: workId,
            event: {},
          }),
        );
        steps.push([
          label,
          exit._tag,
          (yield* refusals(raw)).length,
          wake.version - version,
        ]);
      }
      expect(steps).toEqual([
        ["read first", "Failure", 1, 0],
        ["read repeat", "Failure", 1, 0],
        ["read repeat", "Failure", 1, 0],
        ["write first", "Failure", 2, 1],
        ["write repeat", "Failure", 2, 1],
      ]);
      expect(yield* refusals(raw)).toEqual([
        ["rejected", "work", "AuthAttemptRejected"],
        ["rejected", "work", "AuthAttemptRejected"],
      ]);
      // First of each key: the read misses, the locked walk misses, one row.
      // Each repeat: the read matches and nothing is locked.
      expect(walks).toEqual([false, true, false, false, false, true, false]);
    }),
  15000,
);

async function* frames(response: Response) {
  if (!response.body) throw new Error("Missing SSE body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return;
      pending += decoder.decode(chunk.value, { stream: true });
      let boundary = pending.indexOf("\n\n");
      while (boundary >= 0) {
        const block = pending.slice(0, boundary);
        yield block.match(/^event: (.*)$/m)?.[1] ?? "";
        pending = pending.slice(boundary + 2);
        boundary = pending.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

it.live(
  "a stream's refusal is recorded once per minute and leaves other passes' leases intact",
  () =>
    Effect.gen(function* () {
      const directory = yield* scratch;
      const path = join(directory, "scratch.db");
      const raw = yield* Effect.acquireRelease(openStore({ path }), (store) =>
        Effect.orDie(store.close()),
      );
      yield* raw.auth.setupOwner("denial stream passphrase");
      yield* raw.putProfile(work);
      const owner = yield* raw.auth.signIn("denial stream passphrase");
      const token = yield* raw.auth.issueToken({
        credential: owner.credential,
        token: { name: "stream", profile: null, scope: "read-only" },
      });
      const cursor = String((yield* raw.history()).at(-1)?.seq ?? 0);
      const context = yield* Layer.build(serverLayer({ path, port: 0 }));
      const base = HttpServer.formatAddress(
        Context.get(context, HttpServer.HttpServer).address,
      );
      const controllers: AbortController[] = [];
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          for (const controller of controllers) controller.abort();
        }),
      );
      const connect = (credential: string) =>
        Effect.promise(() => {
          const controller = new AbortController();
          controllers.push(controller);
          return fetch(`${base}/profiles/work/events`, {
            headers: {
              Authorization: `Bearer ${credential}`,
              "Last-Event-ID": cursor,
            },
            signal: controller.signal,
          });
        });
      const next = (reader: AsyncGenerator<string>) =>
        Effect.promise(async () => (await reader.next()).value ?? "closed");
      const post = (title: string) =>
        Effect.promise(() =>
          fetch(`${base}/profiles/work/tasks`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${owner.credential}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ title }),
          }).then((reply) => reply.status),
        );
      const valid = frames(yield* connect(owner.credential));
      const refused = frames(yield* connect(token.credential));
      expect([yield* next(valid), yield* next(refused)]).toEqual([
        "ready",
        "ready",
      ]);
      walks.length = 0;
      // Revoked from another connection, as the CLI would; the write below
      // wakes both streams.
      yield* raw.auth.revokeToken({
        credential: owner.credential,
        name: "stream",
      });
      expect(yield* post("Wakes both streams")).toBe(200);
      expect(yield* next(refused)).toBe("effect/http-api/stream/failure");
      expect(yield* next(refused)).toBe("closed");
      expect(yield* next(valid)).toBe("operation");
      const reconnects: number[] = [];
      for (let i = 0; i < 3; i++)
        reconnects.push((yield* connect(token.credential)).status);
      expect(reconnects).toEqual([401, 401, 401]);
      expect(yield* post("After the refusals")).toBe(200);
      expect(yield* next(valid)).toBe("operation");
      expect(yield* refusals(raw)).toEqual([
        ["rejected", "work", "AuthAttemptRejected"],
      ]);
      // The stream's refusal leaves its lease's transaction before it is
      // decided: the read misses, the locked walk misses, one row. Each
      // reconnect's refusal matches in the read; nothing is locked.
      expect(walks).toEqual([false, true, false, false, false]);
    }),
  20000,
);
