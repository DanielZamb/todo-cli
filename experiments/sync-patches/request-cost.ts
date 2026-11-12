import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
const sample = JSON.parse(
    readFileSync("docs/evidence/sync-experiment/samples.json", "utf8"),
  )[0],
  row = Object.values(sample.after.rows)[40];
let version = 0;
const handle = (message: string) => {
  const input = JSON.parse(message);
  return JSON.stringify(
    input.kind === "read" ? row : { version: ++version, patch: sample.whole },
  );
};
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(r, s) {
    if (new URL(r.url).pathname === "/ws") {
      if (s.upgrade(r, { data: undefined })) return;
      return new Response("failed", { status: 400 });
    }
    return new Response(handle(await r.text()), {
      headers: { "content-type": "application/json" },
    });
  },
  websocket: {
    message(ws, msg) {
      ws.send(handle(String(msg)));
    },
  },
});
const result = [];
try {
  for (let pair = 0; pair < 5; pair++)
    for (const arm of pair % 2 ? ["ws", "http"] : ["http", "ws"])
      for (const kind of ["read", "write"]) {
        const ws =
          arm === "ws"
            ? new WebSocket(String(server.url).replace("http:", "ws:") + "ws")
            : undefined;
        let ready = () => {},
          message = "";
        if (ws) {
          await new Promise<void>((r) => (ws.onopen = () => r()));
          ws.onmessage = (e) => {
            message = String(e.data);
            ready();
          };
        }
        const times = [],
          load = loadavg(),
          input = JSON.stringify({ kind });
        for (let i = 0; i < 110; i++) {
          const t = performance.now();
          let output: unknown;
          if (ws) {
            const received = new Promise<void>((r) => (ready = r));
            ws.send(input);
            await received;
            output = JSON.parse(message);
          } else {
            output = await (
              await fetch(server.url, {
                method: "POST",
                body: input,
                headers: { "content-type": "application/json" },
              })
            ).json();
          }
          assert.ok(output);
          if (i >= 10) times.push(performance.now() - t);
        }
        ws?.close();
        result.push({ pair, arm, kind, load, times, prototype_echo: true });
      }
  writeFileSync(
    "docs/evidence/sync-experiment/request-cost.json",
    JSON.stringify(result, null, 2),
  );
  console.log("requests", result.length);
} finally {
  server.stop(true);
}
