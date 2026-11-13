import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, loadavg, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

const [binary, manifest, output] = process.argv.slice(2);
assert.ok(binary && manifest && output);
const fixtures = JSON.parse(readFileSync(manifest, "utf8"));
const owner = fixtures.find((f) => f.id === "n178-p8-large1-h2048") ?? fixtures[0];
assert.ok(owner);
mkdirSync(output, { recursive: true });
const results = [];
for (const fixture of [owner]) {
  assert.ok(fixture.path.startsWith(resolve(".scratch") + "/"));
  const scratch = mkdtempSync(join(tmpdir(), "todo-read-holds-"));
  const path = join(scratch, "scratch.db");
  copyFileSync(fixture.path, path);
  const db = new Database(path);
  const profile = db.query("SELECT id FROM profiles ORDER BY id='work' DESC,id LIMIT 1").get().id;
  const task = db.query("SELECT id FROM tasks WHERE profile_id=? ORDER BY id LIMIT 1").get(profile).id;
  const cursor = db.query("SELECT coalesce(max(seq),0) AS seq FROM op_log").get().seq;
  const generation = db.query("SELECT json_extract(event,'$.generation') AS generation FROM op_log WHERE json_extract(event,'$.kind')='DatabaseRestored' ORDER BY seq DESC LIMIT 1").get()?.generation ?? "initial";
  const image = db.query("SELECT t.id AS task,json_extract(a.value,'$.id') AS attachment FROM tasks t,json_each(t.payload,'$.attachments') a WHERE t.profile_id=? AND json_extract(a.value,'$.kind')='image' LIMIT 1").get(profile);
  db.close();
  const child = spawn(resolve(binary), [], { env: { ...process.env, HOME: scratch, TODO_DB: path, TODO_ATTACHMENT_ROOT: fixture.attachment_root ?? join(scratch, "attachments") }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (chunk) => { log += chunk; });
  child.stderr.on("data", (chunk) => { log += chunk; });
  try {
    const deadline = performance.now() + 60000;
    while (!/Listening on (http:\/\/127.0.0.1:\d+)/.test(log)) {
      assert.equal(child.exitCode, null, log);
      assert.ok(performance.now() < deadline, log);
      await pause(10);
    }
    const base = log.match(/Listening on (http:\/\/127.0.0.1:\d+)/)[1];
    const routes = ["/profiles", "/profiles?include_projects=true", "/tasks/lookup?prefix=a", "/auth/tokens", "/snapshots", "/snapshots/00000000-0000-4000-8000-000000000000", "/diagnostics", ...["projects", "tags", "tasks", "tasks?text=Task", "views/inbox", "views/today", "views/overdue", "views/scheduled", `tasks/${task}`, `tasks/${task}/history`, `tasks/${task}/graph`, `tasks/${image?.task ?? task}/attachments/${image?.attachment ?? "missing"}/image`, "quick-add/parse", "events"].map((s) => `/profiles/${profile}/${s}`)];
    for (const route of routes) {
      const samples = [], expected = route.includes("00000000-") || (route.endsWith("/image") && !image) ? 404 : 200;
      for (let i = 0; i < 21; i++) {
        const controller = new AbortController(), stream = route.endsWith("/events"), quick = route.endsWith("quick-add/parse");
        const response = await fetch(base + route, {
          method: quick ? "POST" : "GET", signal: controller.signal,
          headers: { Authorization: `Bearer ${fixture.credential}`, "Content-Type": "application/json", ...(stream ? { "Last-Event-ID": String(cursor), "X-Todo-Generation": generation } : {}) },
          ...(quick ? { body: JSON.stringify({ text: "Draft #focus", now: "2026-11-11T12:00:00Z", time_zone: "UTC" }) } : {}),
        });
        assert.equal(response.status, expected, route);
        if (stream) {
          const reader = response.body.getReader();
          await reader.read();
          controller.abort();
          await reader.cancel().catch((error) => {
            if (error.name !== "AbortError") throw error;
          });
        }
        else await response.arrayBuffer();
        const holds = JSON.parse(response.headers.get("x-control-lock-holds") ?? "null");
        const statements = JSON.parse(response.headers.get("x-control-statements") ?? "null");
        assert.ok(Array.isArray(holds) && holds.length > 0, route);
        assert.ok(Array.isArray(statements), route);
        const lookups = statements.filter((s) => s.includes("FROM credentials WHERE secret_hash=?")).length;
        const decodes = Number(response.headers.get("x-control-history-decodes"));
        if (!route.endsWith("/history") && !stream) assert.equal(decodes, 0, route);
        if (!stream) assert.equal(lookups, 1, route);
        if (i) samples.push({ holds, lookups, decodes });
      }
      const values = samples.map((s) => s.holds.reduce((a, b) => a + b, 0)).sort((a, b) => a - b);
      results.push({ fixture: fixture.id, route, status: expected, reads: samples.length, transactions: [...new Set(samples.map((s) => s.holds.length))], lookups: [...new Set(samples.map((s) => s.lookups))], median: values[Math.floor(values.length / 2)], p99: values.at(-1), max: values.at(-1), samples });
      writeFileSync(join(output, "result.json"), JSON.stringify({ cores: cpus().length, load: loadavg(), instrumented: true, results }, null, 2));
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const exited = new Promise((done) => child.once("exit", done)); child.kill("SIGTERM"); await exited; }
    writeFileSync(join(output, "server.log"), log);
    rmSync(scratch, { recursive: true, force: true });
  }
}
console.log(JSON.stringify({ routes: results.length, successfulReads: results.reduce((n, r) => n + r.reads, 0) }));
