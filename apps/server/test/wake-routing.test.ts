// One wake object after the CLI routing merge: the local nudge, an in-process
// routed command and the fallback timer all reach streams through the server's
// single StreamWake. Scratch databases and owned servers on port 0 only.
import { Database } from "bun:sqlite";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { ensureProfile } from "@todo/domain/commands";
import {
  databaseBinding,
  type EndpointRecord,
  endpointPath,
  routeMac,
} from "@todo/domain/database-route";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Effect, Layer } from "effect";
import { serverLayer } from "../src/server.ts";
import { StreamWake } from "../src/stream-wake.ts";
import { streamWakeStore } from "../src/stream-wake-store.ts";

const passphrase = "wake routing test passphrase";

const scratch = Effect.gen(function* () {
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-wake-route-"))),
    (directory) =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
  );
  const path = join(directory, "scratch.db");
  const store = yield* Effect.acquireRelease(openStore({ path }), (store) =>
    Effect.orDie(store.close()),
  );
  yield* store.auth.setupOwner(passphrase);
  const profile = yield* ensureProfile(store, "work");
  const session = yield* store.auth.signIn(passphrase);
  return { path, store, profile, session };
});

const serve = (path: string, wake: StreamWake) =>
  Effect.gen(function* () {
    yield* Layer.build(serverLayer({ path, port: 0, wake }));
    const binding = databaseBinding(path);
    if (!binding) throw new Error("No binding");
    const file = endpointPath(binding.path);
    const record: EndpointRecord = JSON.parse(readFileSync(file, "utf8"));
    return { record, file };
  });

type Event = { id?: string; event?: string; data?: string };
const openStream = async (port: number, credential: string, after: number) => {
  const controller = new AbortController();
  const response = await fetch(
    `http://127.0.0.1:${port}/profiles/work/events`,
    {
      headers: {
        Authorization: `Bearer ${credential}`,
        "last-event-id": String(after),
      },
      signal: controller.signal,
    },
  );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No stream");
  const events: Event[] = [];
  const decoder = new TextDecoder();
  let buffer = "";
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        for (
          let end = buffer.indexOf("\n\n");
          end >= 0;
          end = buffer.indexOf("\n\n")
        ) {
          const event: Event = {};
          for (const line of buffer.slice(0, end).split("\n")) {
            const colon = line.indexOf(":");
            if (colon > 0)
              Object.assign(event, {
                [line.slice(0, colon)]: line.slice(colon + 1).trim(),
              });
          }
          buffer = buffer.slice(end + 2);
          events.push(event);
        }
      }
    } catch {}
  })();
  const until = async (test: () => boolean, milliseconds: number) => {
    const deadline = performance.now() + milliseconds;
    while (!test() && performance.now() < deadline)
      await new Promise((resume) => setTimeout(resume, 5));
    return test();
  };
  await until(() => events.some((e) => e.event === "ready"), 5000);
  const operations = () => events.filter((e) => e.event === "operation");
  return { events, operations, until, close: () => controller.abort() };
};

const local = (
  record: EndpointRecord,
  route: "nudge" | "commands",
  body?: unknown,
  credential?: string,
) =>
  fetch(`http://127.0.0.1:${record.port}/local/${route}`, {
    method: "POST",
    headers: {
      "x-todo-incarnation": record.incarnation,
      "x-todo-proof": routeMac(
        record.secret,
        route === "nudge" ? "nudge" : "command",
        record.incarnation,
      ),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(credential === undefined
        ? {}
        : { Authorization: `Bearer ${credential}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const historyRows = (path: string) => {
  const reader = new Database(path, { readonly: true });
  try {
    return (
      reader.query<{ n: number }, []>("SELECT count(*) AS n FROM op_log").get()
        ?.n ?? -1
    );
  } finally {
    reader.close();
  }
};

it.live(
  "a nudge wakes only its own server's streams and adds nothing to History",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const one = yield* scratch;
        const two = yield* scratch;
        const wakeOne = new StreamWake(Effect.never);
        const wakeTwo = new StreamWake(Effect.never);
        const serverOne = yield* serve(one.path, wakeOne);
        yield* serve(two.path, wakeTwo);
        const seq = (yield* one.store.snapshots.generation()).seq;
        const result = yield* Effect.promise(async () => {
          const stream = await openStream(
            serverOne.record.port,
            one.session.credential,
            seq,
          );
          return stream;
        });
        yield* Effect.addFinalizer(() => Effect.sync(result.close));
        const created = yield* new TaskCommands(one.store).create(
          { credential: one.session.credential, profile: one.profile.id },
          { title: "Outside write waits for the nudge" },
        );
        expect(created.outcome).toBe("committed");
        const observed = yield* Effect.promise(async () => {
          // With the fallback disabled, an outside write is not delivered
          // until something signals.
          const beforeNudge = await result.until(
            () => result.operations().length > 0,
            600,
          );
          const rows = historyRows(one.path);
          const versions = [wakeOne.version, wakeTwo.version];
          const response = await local(serverOne.record, "nudge");
          const delivered = await result.until(
            () => result.operations().length > 0,
            2000,
          );
          return {
            beforeNudge,
            status: response.status,
            delivered,
            frames: result.operations().length,
            rowsAdded: historyRows(one.path) - rows,
            wakeOneDelta: wakeOne.version - (versions[0] ?? 0),
            wakeTwoDelta: wakeTwo.version - (versions[1] ?? 0),
          };
        });
        expect(observed).toEqual({
          beforeNudge: false,
          status: 200,
          delivered: true,
          frames: 1,
          rowsAdded: 0,
          wakeOneDelta: 1,
          wakeTwoDelta: 0,
        });
        expect(result.operations()[0]?.data).toContain(
          "Outside write waits for the nudge",
        );
      }),
    ),
  20000,
);

it.live(
  "a nudge and an in-process routed command together deliver each entry once",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const one = yield* scratch;
        const wake = new StreamWake(Effect.never);
        const server = yield* serve(one.path, wake);
        const seq = (yield* one.store.snapshots.generation()).seq;
        const stream = yield* Effect.promise(() =>
          openStream(server.record.port, one.session.credential, seq),
        );
        yield* Effect.addFinalizer(() => Effect.sync(stream.close));
        const observed = yield* Effect.promise(async () => {
          const before = wake.version;
          const rows = historyRows(one.path);
          const [command, nudge] = await Promise.all([
            local(
              server.record,
              "commands",
              {
                kind: "add",
                profile: "work",
                flags: { title: "Routed in process" },
              },
              one.session.credential,
            ).then(async (r) => ({ status: r.status, body: await r.json() })),
            local(server.record, "nudge").then((r) => r.status),
          ]);
          await stream.until(() => stream.operations().length > 0, 2000);
          // Anything else would arrive within a few passes.
          await new Promise((resume) => setTimeout(resume, 400));
          const afterDelivery = wake.version;
          const ids = stream.operations().map((e) => e.id);
          // A nudge for a commit the stream has already delivered: one empty
          // pass, no frame.
          const repeat = await local(server.record, "nudge");
          await new Promise((resume) => setTimeout(resume, 400));
          return {
            commandStatus: command.status,
            outcome: command.body.outcome,
            nudgeStatus: nudge,
            rowsAdded: historyRows(one.path) - rows,
            frames: ids.length,
            uniqueIds: new Set(ids).size,
            wakeDelta: afterDelivery - before,
            repeatStatus: repeat.status,
            framesAfterRepeat: stream.operations().length,
            repeatWakeDelta: wake.version - afterDelivery,
          };
        });
        expect(observed.wakeDelta === 1 || observed.wakeDelta === 2).toBe(true);
        expect({ ...observed, wakeDelta: "1 or 2" }).toEqual({
          commandStatus: 200,
          outcome: "success",
          nudgeStatus: 200,
          rowsAdded: 1,
          frames: 1,
          uniqueIds: 1,
          wakeDelta: "1 or 2",
          repeatStatus: 200,
          framesAfterRepeat: 1,
          repeatWakeDelta: 1,
        });
        expect(stream.operations()[0]?.data).toContain("Routed in process");
      }),
    ),
  20000,
);

it.live(
  "the fallback timer still delivers an outside write when the record is hidden",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const one = yield* scratch;
        const wake = new StreamWake();
        const server = yield* serve(one.path, wake);
        renameSync(server.file, `${server.file}.hidden`);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => renameSync(`${server.file}.hidden`, server.file)),
        );
        const seq = (yield* one.store.snapshots.generation()).seq;
        const stream = yield* Effect.promise(() =>
          openStream(server.record.port, one.session.credential, seq),
        );
        yield* Effect.addFinalizer(() => Effect.sync(stream.close));
        const before = wake.version;
        const started = performance.now();
        yield* new TaskCommands(one.store).create(
          { credential: one.session.credential, profile: one.profile.id },
          { title: "Timer delivers without a nudge" },
        );
        const delivered = yield* Effect.promise(() =>
          stream.until(() => stream.operations().length > 0, 1000),
        );
        const elapsed = performance.now() - started;
        expect({
          delivered,
          frames: stream.operations().length,
          wakeDelta: wake.version - before,
        }).toEqual({
          delivered: true,
          frames: 1,
          wakeDelta: 0,
        });
        expect(elapsed).toBeLessThan(1000);
      }),
    ),
  20000,
);

it.live("the wake decorator opens no file at construction", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const one = yield* scratch;
      const descriptors = () =>
        readdirSync(
          process.platform === "linux" ? "/proc/self/fd" : "/dev/fd",
        ).sort();
      const before = descriptors();
      const decorated = streamWakeStore(
        one.store,
        new StreamWake(Effect.never),
      );
      const after = descriptors();
      expect(after).toEqual(before);
      expect(decorated.auth).not.toBe(one.store.auth);
    }),
  ),
);

it.live(
  "an in-process routed command alone wakes streams at its outermost exit",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const one = yield* scratch;
        const wake = new StreamWake(Effect.never);
        const server = yield* serve(one.path, wake);
        const seq = (yield* one.store.snapshots.generation()).seq;
        const stream = yield* Effect.promise(() =>
          openStream(server.record.port, one.session.credential, seq),
        );
        yield* Effect.addFinalizer(() => Effect.sync(stream.close));
        const observed = yield* Effect.promise(async () => {
          const before = wake.version;
          const response = await local(
            server.record,
            "commands",
            {
              kind: "add",
              profile: "work",
              flags: { title: "Signals by itself" },
            },
            one.session.credential,
          );
          const body = await response.json();
          const delivered = await stream.until(
            () => stream.operations().length > 0,
            2000,
          );
          return {
            status: response.status,
            outcome: body.outcome,
            delivered,
            frames: stream.operations().length,
            wakeDelta: wake.version - before,
          };
        });
        expect(observed).toEqual({
          status: 200,
          outcome: "success",
          delivered: true,
          frames: 1,
          wakeDelta: 1,
        });
      }),
    ),
  20000,
);
