import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, expect, it } from "@effect/vitest";
import { DiagnosticRecorder, Profile, ProfileId } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { TestClock } from "effect/testing";
import { modelBatch } from "../../../packages/domain/test/fixtures/recording-authority.ts";
import { serverLayer } from "../src/server.ts";
import { StreamWake } from "../src/stream-wake.ts";

// The Diagnostics observation this branch adds to the stream loop must not
// change the wake: the version is read on the line after the wait, delivery
// observations run outside every lease, an idle stream keeps the fallback
// pass rate, and the recordings worker's writes never signal the Task store.

const connections = new Set<Database>();
const query = Database.prototype.query;
Reflect.set(
  Database.prototype,
  "query",
  function (this: Database, ...args: [string]) {
    connections.add(this);
    return Reflect.apply(query, this, args);
  },
);
const inTransaction = () =>
  [...connections].some((db) => {
    try {
      return db.inTransaction;
    } catch {
      return false;
    }
  });
const observedInTransaction: boolean[] = [];
const delivery = DiagnosticRecorder.prototype.delivery;
DiagnosticRecorder.prototype.delivery = function (
  this: DiagnosticRecorder,
  ...args: Parameters<typeof delivery>
) {
  observedInTransaction.push(inTransaction());
  return delivery.apply(this, args);
};
const original = Object.getOwnPropertyDescriptor(
  StreamWake.prototype,
  "version",
);
if (!original?.get) throw new Error("StreamWake.version must be a getter");
const read = original.get;
let reads = 0;
let wake: StreamWake | undefined;
Object.defineProperty(StreamWake.prototype, "version", {
  configurable: true,
  get(this: StreamWake) {
    reads++;
    wake = this;
    return read.call(this);
  },
});
afterAll(() => {
  Reflect.set(Database.prototype, "query", query);
  DiagnosticRecorder.prototype.delivery = delivery;
  Object.defineProperty(StreamWake.prototype, "version", original);
});
const passesIn = (ms: number) =>
  Effect.gen(function* () {
    const before = reads;
    yield* Effect.promise(() => new Promise((done) => setTimeout(done, ms)));
    return reads - before;
  });

it("reads the wake version on the line after the wait", () => {
  const lines = readFileSync(
    resolve(import.meta.dirname, "../src/sse.ts"),
    "utf8",
  )
    .split("\n")
    .map((line) => line.trim());
  const wait = lines.indexOf("yield* wake.wait(state.wakeVersion);");
  expect(wait).toBeGreaterThan(0);
  expect(lines[wait + 1]).toBe("const wakeVersion = wake.version;");
});

it.live(
  "observes deliveries outside every lease, keeps the pass rate, and recordings never wake streams",
  () =>
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-wake-diag-"))),
        (path) =>
          Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      );
      const path = join(directory, "scratch.db");
      const store = yield* Effect.acquireRelease(openStore({ path }), (s) =>
        Effect.orDie(s.close()),
      );
      yield* store.auth.setupOwner("wake diagnostics passphrase");
      yield* store.putProfile(
        Schema.decodeUnknownSync(Profile)({
          id: "work",
          name: "work",
          created_at: "2026-11-01T00:00:00Z",
          updated_at: "2026-11-01T00:00:00Z",
        }),
      );
      const { credential } = yield* store.auth.signIn(
        "wake diagnostics passphrase",
      );
      const cursor = (yield* store.history()).at(-1)?.seq ?? 0;
      const profiler = new DiagnosticRecorder();
      const context = yield* Layer.build(
        serverLayer({ path, port: 0, profiler }),
      );
      const base = HttpServer.formatAddress(
        Context.get(context, HttpServer.HttpServer).address,
      );
      const headers = {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      };
      const controller = new AbortController();
      yield* Effect.addFinalizer(() => Effect.sync(() => controller.abort()));
      const response = yield* Effect.promise(() =>
        fetch(`${base}/profiles/work/events`, {
          headers: { ...headers, "Last-Event-ID": String(cursor) },
          signal: controller.signal,
        }),
      );
      expect(response.status).toBe(200);
      const body = response.body?.getReader();
      if (!body) throw new Error("Missing SSE body");
      let text = "";
      const until = (needle: string) =>
        Effect.promise(async () => {
          while (!text.includes(needle)) {
            const chunk = await body.read();
            if (chunk.done) throw new Error("stream ended");
            text += new TextDecoder().decode(chunk.value);
          }
        });
      yield* until("event: ready");
      yield* passesIn(600);
      const idle = yield* passesIn(1000);
      if (!wake) throw new Error("wake not observed");
      const beforeRecording = read.call(wake);
      const upload = yield* Effect.promise(() =>
        fetch(`${base}/diagnostics/profiler/ingest`, {
          method: "POST",
          headers,
          body: JSON.stringify(modelBatch()),
        }),
      );
      expect(upload.status).toBe(200);
      expect(
        ((yield* Effect.promise(() => upload.json())) as { accepted: boolean })
          .accepted,
      ).toBe(true);
      yield* passesIn(300);
      const afterRecording = read.call(wake);
      const created = yield* Effect.promise(async () => {
        const reply = await fetch(`${base}/profiles/work/tasks`, {
          method: "POST",
          headers,
          body: JSON.stringify({ title: "One write" }),
        });
        expect(reply.status).toBe(200);
        return (await reply.json()) as { id: string };
      });
      yield* until(created.id);
      const afterWrite = read.call(wake);
      yield* passesIn(300);
      const ratedAfterWrite = yield* passesIn(1000);
      expect(idle).toBeGreaterThanOrEqual(3);
      expect(idle).toBeLessThanOrEqual(5);
      expect(ratedAfterWrite).toBeGreaterThanOrEqual(3);
      expect(ratedAfterWrite).toBeLessThanOrEqual(5);
      expect(afterRecording).toBe(beforeRecording);
      expect(afterWrite).toBe(beforeRecording + 1);
      expect(observedInTransaction.length).toBeGreaterThanOrEqual(1);
      expect(observedInTransaction.every((inside) => !inside)).toBe(true);
    }),
  20000,
);

it.effect(
  "an authentication span does not change which refusals are recorded",
  () =>
    Effect.gen(function* () {
      const directory = mkdtempSync(join(tmpdir(), "todo-wake-refusal-"));
      try {
        const path = join(directory, "scratch.db");
        const time = Date.parse("2026-11-13T00:20:00.001Z");
        yield* TestClock.setTime(time);
        const profiler = new DiagnosticRecorder();
        const refuse = Effect.acquireUseRelease(
          openStore({ path }),
          (store) =>
            Effect.gen(function* () {
              store.diagnostics.profiler = profiler;
              yield* store.putProfile(
                Schema.decodeUnknownSync(Profile)({
                  id: "work",
                  name: "work",
                  created_at: "2026-11-01T00:00:00Z",
                  updated_at: "2026-11-01T00:00:00Z",
                }),
              );
              yield* Effect.flip(
                store.auth.authenticate({
                  credential: "tok_forged",
                  profile: Schema.decodeUnknownSync(ProfileId)("work"),
                  access: "read",
                }),
              );
            }),
          (store) => Effect.orDie(store.close()),
        );
        const { withDiagnosticRoot } = yield* Effect.promise(
          () => import("@todo/domain"),
        );
        const rooted = withDiagnosticRoot(
          { recorder: profiler, role: "cli", stage: "command" },
          refuse,
        );
        const count = () => {
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
        yield* rooted;
        yield* rooted;
        expect(count()).toBe(1);
        yield* TestClock.setTime(time + 60_000);
        yield* rooted;
        expect(count()).toBe(2);
        expect(
          profiler
            .details()
            .recent.some((span) => span.stage === "authentication"),
        ).toBe(true);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }),
);
