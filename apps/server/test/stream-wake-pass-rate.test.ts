import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "@effect/vitest";
import { Profile } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { serverLayer } from "../src/server.ts";
import { StreamWake } from "../src/stream-wake.ts";

// Review 4 (R4-1): if a pass returned the previous state's wakeVersion instead
// of the one it read, every later wait would return at once and an idle stream
// would spin (about 12,000 passes a second on the compiled server). The loop
// reads wake.version once per pass, right after its wait, so counting those
// reads counts passes. An idle stream must stay at the 250 ms fallback rate,
// before and after a write.
const original = Object.getOwnPropertyDescriptor(
  StreamWake.prototype,
  "version",
);
if (!original?.get) throw new Error("StreamWake.version must be a getter");
const read = original.get;
let reads = 0;
Object.defineProperty(StreamWake.prototype, "version", {
  configurable: true,
  get(this: StreamWake) {
    reads++;
    return read.call(this);
  },
});
afterAll(() => {
  Object.defineProperty(StreamWake.prototype, "version", original);
});

const passesIn = (ms: number) =>
  Effect.gen(function* () {
    const before = reads;
    yield* Effect.promise(() => new Promise((done) => setTimeout(done, ms)));
    return reads - before;
  });

it.live(
  "an idle stream keeps the fallback pass rate after a write and after a reload",
  () =>
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-wake-rate-"))),
        (path) =>
          Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      );
      const path = join(directory, "scratch.db");
      const store = yield* Effect.acquireRelease(openStore({ path }), (store) =>
        Effect.orDie(store.close()),
      );
      yield* store.auth.setupOwner("pass rate passphrase");
      yield* store.putProfile(
        Schema.decodeUnknownSync(Profile)({
          id: "work",
          name: "work",
          created_at: "2026-11-01T00:00:00Z",
          updated_at: "2026-11-01T00:00:00Z",
        }),
      );
      const { credential } = yield* store.auth.signIn("pass rate passphrase");
      // A pre-change reason survives the server's own daily retention.
      const saved = yield* store.snapshots.create("pre-pass-rate restore");
      const cursor = (yield* store.history()).at(-1)?.seq ?? 0;
      const context = yield* Layer.build(serverLayer({ path, port: 0 }));
      const base = HttpServer.formatAddress(
        Context.get(context, HttpServer.HttpServer).address,
      );
      const controller = new AbortController();
      yield* Effect.addFinalizer(() => Effect.sync(() => controller.abort()));
      const response = yield* Effect.promise(() =>
        fetch(`${base}/profiles/work/events`, {
          headers: {
            Authorization: `Bearer ${credential}`,
            "Last-Event-ID": String(cursor),
          },
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
      const created = yield* Effect.promise(async () => {
        const reply = await fetch(`${base}/profiles/work/tasks`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credential}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: "One write" }),
        });
        expect(reply.status).toBe(200);
        return (await reply.json()) as { id: string };
      });
      yield* until(created.id);
      yield* passesIn(300);
      const afterWrite = yield* passesIn(1000);
      const restored = yield* Effect.promise(async () => {
        const reply = await fetch(`${base}/snapshots/${saved.id}/restore`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credential}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dry_run: false }),
        });
        expect(reply.status).toBe(200);
        return (await reply.json()) as { generation: string };
      });
      yield* until(restored.generation);
      yield* passesIn(300);
      const afterReload = yield* passesIn(1000);
      // The fallback is 250 ms: four passes a second, five at a boundary.
      expect(idle).toBeGreaterThanOrEqual(3);
      expect(idle).toBeLessThanOrEqual(5);
      expect(afterWrite).toBeGreaterThanOrEqual(3);
      expect(afterWrite).toBeLessThanOrEqual(5);
      expect(afterReload).toBeGreaterThanOrEqual(3);
      expect(afterReload).toBeLessThanOrEqual(5);
    }),
  15000,
);
