import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, loadavg, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
const [before, after, manifest, output] = process.argv.slice(2);
assert.ok(before && after && manifest && output);
const fixtures = JSON.parse(readFileSync(manifest, "utf8"));
const fixture = fixtures.find((f) => f.id === "n178-p8-large1-h2048") ?? fixtures[0];
assert.ok(fixture.path.startsWith(resolve(".scratch") + "/"));
mkdirSync(output, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-paired-holds-")), children = [], results = [];
async function start(binary, name) {
  const directory = join(scratch, name); mkdirSync(directory);
  const path = join(directory, "scratch.db"); copyFileSync(fixture.path, path);
  const child = spawn(resolve(binary), [], { env: { ...process.env, HOME: directory, TODO_DB: path, TODO_ATTACHMENT_ROOT: fixture.attachment_root ?? join(directory, "attachments") }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; child.stdout.on("data", (b) => { log += b; }); child.stderr.on("data", (b) => { log += b; });
  children.push({ child, name, log: () => log });
  const deadline = performance.now() + 60000;
  while (!/Listening on (http:\/\/127.0.0.1:\d+)/.test(log)) { assert.equal(child.exitCode, null, log); assert.ok(performance.now() < deadline, log); await pause(10); }
  return { base: log.match(/Listening on (http:\/\/127.0.0.1:\d+)/)[1], path };
}
try {
  const arms = { before: await start(before, "before"), after: await start(after, "after") };
  const db = new Database(arms.after.path, { readonly: true });
  const profile = db.query("SELECT id FROM profiles ORDER BY id='work' DESC,id LIMIT 1").get().id;
  const task = db.query("SELECT id FROM tasks WHERE profile_id=? ORDER BY id LIMIT 1").get(profile).id;
  const cursor = db.query("SELECT coalesce(max(seq),0) AS seq FROM op_log").get().seq;
  const image = db.query("SELECT t.id AS task,json_extract(a.value,'$.id') AS attachment FROM tasks t,json_each(t.payload,'$.attachments') a WHERE t.profile_id=? AND json_extract(a.value,'$.kind')='image' LIMIT 1").get(profile); db.close();
  const routes = ["/profiles", "/profiles?include_projects=true", "/tasks/lookup?prefix=a", "/auth/tokens", "/snapshots", "/snapshots/00000000-0000-4000-8000-000000000000", "/diagnostics", ...["projects", "tags", "tasks", "tasks?text=Task", "views/inbox", "views/today", "views/overdue", "views/scheduled", `tasks/${task}`, `tasks/${task}/history`, `tasks/${task}/graph`, `tasks/${image?.task ?? task}/attachments/${image?.attachment ?? "missing"}/image`, "quick-add/parse", "events"].map((s) => `/profiles/${profile}/${s}`)];
  const snapshotIds = {};
  for (const route of routes) {
    const samples = { before: [], after: [] }, status = route.includes("00000000-") || (route.endsWith("/image") && !image) ? 404 : 200;
    for (let pair = -1; pair < 5; pair++) {
      const bytes = {};
      for (const side of pair % 2 ? ["after", "before"] : ["before", "after"]) {
        const controller = new AbortController(), stream = route.endsWith("events"), quick = route.endsWith("quick-add/parse");
        const selectedRoute = route === "/snapshots/:real" ? `/snapshots/${snapshotIds[side]}` : route;
        const response = await fetch(arms[side].base + selectedRoute, { method: quick ? "POST" : "GET", signal: controller.signal, headers: { Authorization: `Bearer ${fixture.credential}`, "Content-Type": "application/json", ...(stream ? { "Last-Event-ID": String(cursor), "X-Todo-Generation": "initial" } : {}) }, ...(quick ? { body: JSON.stringify({ text: "Draft #focus", now: "2026-11-11T12:00:00Z", time_zone: "UTC" }) } : {}) });
        assert.equal(response.status, status, route);
        if (stream) { const reader = response.body.getReader(); bytes[side] = Buffer.from((await reader.read()).value).toString("base64"); controller.abort(); await reader.cancel().catch((error) => { if (error.name !== "AbortError") throw error; }); }
        else {
          const body = Buffer.from(await response.arrayBuffer());
          if (route === "/snapshots" || route === "/snapshots/:real") {
            const value = JSON.parse(body.toString());
            for (const snapshot of value.snapshots ?? [value.snapshot ?? value]) {
              assert.ok(snapshot);
              snapshotIds[side] ??= snapshot.id;
              snapshot.id = "scratch-snapshot"; snapshot.path = "scratch-snapshot.sqlite";
            }
            bytes[side] = JSON.stringify(value);
          } else bytes[side] = body.toString("base64");
        }
        const holds = JSON.parse(response.headers.get("x-control-lock-holds")), modes = JSON.parse(response.headers.get("x-control-modes")), statements = JSON.parse(response.headers.get("x-control-statements"));
        assert.ok(holds.length > 0); assert.equal(holds.length, modes.length);
        const decodes = Number(response.headers.get("x-control-history-decodes")), lookups = statements.filter((s) => s.includes("FROM credentials WHERE secret_hash=?")).length;
        if (side === "after" && !stream) { assert.equal(lookups, 1, route); if (!route.endsWith("history")) assert.equal(decodes, 0, route); }
        if (pair >= 0) samples[side].push({ pair, holds, modes, lookups, decodes });
      }
      if (route !== "/diagnostics") assert.equal(bytes.after, bytes.before, route);
    }
    if (route === "/snapshots" && snapshotIds.before && snapshotIds.after) routes.push("/snapshots/:real");
    const summarize = (samples) => {
      const values = samples.map((s) => Math.max(...s.holds)).sort((a,b) => a-b);
      return { median: values[2], min: values[0], max: values.at(-1), transactions: [...new Set(samples.map((s) => s.holds.length))], modes: [...new Set(samples.flatMap((s) => s.modes))], lookups: [...new Set(samples.map((s) => s.lookups))] };
    };
    results.push({ route, status, before: summarize(samples.before), after: summarize(samples.after), samples });
    writeFileSync(join(output, "result.json"), JSON.stringify({ fixture: fixture.id, pairedAlternating: true, pairsPerRoute: 5, cores: cpus().length, load: loadavg(), instrumented: true, results }, null, 2));
  }
} finally {
  for (const { child, name, log } of children) { if (child.exitCode === null && child.signalCode === null) { const exited = new Promise((done) => child.once("exit", done)); child.kill("SIGTERM"); await exited; } writeFileSync(join(output, name + ".log"), log()); }
  rmSync(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify({ routes: results.length, pairs: results.length * 5, repliesEqualExceptDiagnostics: true }));
