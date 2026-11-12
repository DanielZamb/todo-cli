import assert from "node:assert/strict";
import {
  readFileSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir, loadavg } from "node:os";
import { spawn } from "node:child_process";
import { Effect, Schema } from "effect";
import {
  openStore,
  TaskCommands,
} from "../../packages/domain/src/store/store.ts";
import { Task, ProfileId } from "../../packages/domain/src/index.ts";
import { attach } from "./observer.ts";
import { baseline, database } from "./baseline.ts";
import { applyPatch } from "./patch.ts";
import { Patch, Replica } from "./model.ts";
const config = JSON.parse(
    readFileSync(".scratch/sync-patches/owner/fixture.json", "utf8"),
  ),
  dir = mkdtempSync(join(tmpdir(), "todo-sync-transport-")),
  path = join(dir, "scratch.db");
copyFileSync(config.path, path);
const run = Effect.runPromise,
  store = await run(openStore({ path })),
  observer = attach(store, "memory", "p0", config.at, path),
  commands = new TaskCommands(store),
  db = database(store);
const streams = new Set<ReadableStreamDefaultController<Uint8Array>>(),
  sockets = new Set<import("bun").ServerWebSocket<undefined>>(),
  encoder = new TextEncoder();
let sentBytes = 0;
const commitToSend: number[] = [];
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(req, server) {
    const url = new URL(req.url);
    switch (url.pathname) {
      case "/baseline":
        return Response.json(observer.replica);
      case "/diagnostics":
        return Response.json({
          ...(await run(
            store.diagnostics.read({
              credential: config.credential,
              detail: true,
            }),
          )),
          sync_experiment: {
            replica_bytes: Buffer.byteLength(JSON.stringify(observer.replica)),
            ring_bytes: observer.memory().ring_bytes,
            ring_count: observer.ring.length,
            metrics: [
              ...new Map(
                observer.metrics.map((metric) => [metric.stage, metric]),
              ).values(),
            ],
          },
        });
      case "/ws":
        if (server.upgrade(req, { data: undefined })) return;
        return new Response("upgrade failed", { status: 400 });
      case "/events": {
        let controller: ReadableStreamDefaultController<Uint8Array>;
        return new Response(
          new ReadableStream({
            start(c) {
              controller = c;
              streams.add(c);
              c.enqueue(encoder.encode(": ready\n\n"));
            },
            cancel() {
              streams.delete(controller);
            },
          }),
          {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-store",
            },
          },
        );
      }
      case "/drive": {
        const task = Schema.decodeUnknownSync(Task)(
          JSON.parse(
            db
              .query<{ payload: string }, []>(
                "SELECT payload FROM tasks WHERE id='p0-t040'",
              )
              .get()?.payload ?? "null",
          ),
        );
        const result = await run(
          commands.edit(
            {
              credential: config.credential,
              profile: Schema.decodeUnknownSync(ProfileId)("p0"),
              task_id: task.id,
            },
            {
              from_version: task.row_version,
              changes: { title: "transport edit " + task.row_version },
            },
          ),
        );
        assert.equal(result.outcome, "committed");
        const patch = observer.patches.at(-1);
        assert.ok(patch);
        const frame = JSON.stringify({
            committed: observer.committedAt,
            patch,
          }),
          sse = encoder.encode(
            "id: " + patch.to + "\nevent: patch\ndata: " + frame + "\n\n",
          );
        for (const c of streams) {
          try {
            c.enqueue(sse);
            sentBytes += sse.byteLength;
          } catch {
            streams.delete(c);
          }
        }
        for (const ws of sockets) {
          ws.send(frame);
          sentBytes += Buffer.byteLength(frame) + 4;
        }
        commitToSend.push(
          performance.timeOrigin + performance.now() - observer.committedAt,
        );
        return new Response("ok");
      }
      default:
        return new Response("missing", { status: 404 });
    }
  },
  websocket: {
    open(ws) {
      sockets.add(ws);
      ws.send("ready");
    },
    message() {},
    close(ws) {
      sockets.delete(ws);
    },
  },
});
function decodePatch(payload: unknown) {
  const t = performance.now(),
    patch = observer.sample("decode", () =>
      Schema.decodeUnknownSync(Patch)(payload),
    );
  observer.metrics.push({
    stage: "client-decode",
    decode_ms: performance.now() - t,
  });
  return patch;
}
function applyClient(replica: Replica, patch: Patch) {
  const t = performance.now(),
    next = applyPatch(replica, patch);
  observer.metrics.push({
    stage: "client-apply",
    apply_ms: performance.now() - t,
  });
  return next;
}
const results = [];
try {
  for (let pair = 0; pair < (process.env.SYNC_DIAGNOSTICS_ONLY ? 1 : 5); pair++)
    for (const client of ["typescript", "swift"])
      for (const arm of pair % 2 ? ["ws", "sse"] : ["sse", "ws"]) {
        const load = loadavg(),
          beforeBytes = sentBytes,
          beforeSent = commitToSend.length;
        let times: number[] = [];
        if (client === "swift") {
          const child = spawn(
            resolve(".scratch/sync-patches/bin/swift-bench"),
            [arm, String(server.url)],
            {
              stdio: ["ignore", "pipe", "pipe"],
              env: { ...process.env, HOME: dir },
            },
          );
          let out = "",
            err = "";
          child.stdout.on("data", (b) => (out += b));
          child.stderr.on("data", (b) => (err += b));
          await new Promise<void>((r, j) =>
            child.on("exit", (code) => (code === 0 ? r() : j(Error(err)))),
          );
          times = JSON.parse(out);
        } else {
          let replica = Schema.decodeUnknownSync(Replica)(
            await (await fetch(new URL("/baseline", server.url))).json(),
          );
          if (arm === "ws") {
            const ws = new WebSocket(
                String(server.url).replace("http:", "ws:") + "ws",
              ),
              messages: string[] = [];
            let wake = () => {};
            ws.onmessage = (e) => {
              messages.push(String(e.data));
              wake();
            };
            const next = async () => {
              while (!messages.length)
                await new Promise<void>((r) => (wake = r));
              return messages.shift() ?? "";
            };
            await next();
            for (let i = 0; i < 100; i++) {
              const drive = fetch(new URL("/drive", server.url));
              const f = JSON.parse(await next()),
                patch = decodePatch(f.patch);
              replica = applyClient(replica, patch);
              times.push(
                performance.timeOrigin + performance.now() - f.committed,
              );
              assert.equal((await drive).status, 200);
            }
            ws.close();
          } else {
            const abort = new AbortController(),
              response = await fetch(new URL("/events", server.url), {
                signal: abort.signal,
              }),
              reader = response.body!.getReader(),
              decoder = new TextDecoder();
            let buffer = "";
            await reader.read();
            for (let i = 0; i < 100; i++) {
              const drive = fetch(new URL("/drive", server.url));
              while (!buffer.includes("\n\n")) {
                const r = await reader.read();
                assert.ok(!r.done);
                buffer += decoder.decode(r.value);
              }
              const end = buffer.indexOf("\n\n"),
                frame = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const data = frame
                .split("\n")
                .find((s) => s.startsWith("data: "));
              assert.ok(data);
              const f = JSON.parse(data.slice(6)),
                patch = decodePatch(f.patch);
              replica = applyClient(replica, patch);
              times.push(
                performance.timeOrigin + performance.now() - f.committed,
              );
              assert.equal((await drive).status, 200);
            }
            abort.abort();
            await reader.cancel().catch(() => {});
          }
          assert.deepEqual(replica, baseline(store, "p0", config.at));
        }
        results.push({
          pair,
          client,
          arm,
          load,
          times,
          sent_bytes: sentBytes - beforeBytes,
          commit_to_send_ms: commitToSend.slice(beforeSent),
        });
        console.log("transport", pair, client, arm);
      }
  const diagnostics = await (
    await fetch(new URL("/diagnostics", server.url))
  ).json();
  writeFileSync(
    "docs/evidence/sync-experiment/diagnostics.json",
    JSON.stringify(diagnostics, null, 2),
  );
  writeFileSync(
    "docs/evidence/sync-experiment/" +
      (process.env.SYNC_DIAGNOSTICS_ONLY
        ? "diagnostics-transport"
        : "transport") +
      ".json",
    JSON.stringify(results, null, 2),
  );
} finally {
  for (const ws of sockets) ws.close();
  for (const c of streams) c.close();
  server.stop(true);
  await run(store.close());
  rmSync(dir, { recursive: true, force: true });
}
