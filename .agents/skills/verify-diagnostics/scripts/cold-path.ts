import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { cpus, loadavg, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Schema } from "effect";
import { DiagnosticsSnapshot } from "../../../../packages/domain/src/index.ts";
import { FixtureSchema, type Fixture } from "./cold-path-fixture.ts";
import { coldPathHostGate as hostGate } from "./cold-path-host.ts";

const mode = process.argv[2];
const repeats = Number(process.env.COLD_PAIRS ?? (mode === "pilot" ? 1 : 5));
assert.ok(
  Number.isInteger(repeats) && repeats >= 1 && repeats <= 10,
  "Use 1 to 10 repeats; comparison reports need at least five complete pairs",
);
const fixtureRoot = resolve(process.argv[3] ?? ".scratch/cold-path/pilot");
const evidence = resolve(
  process.argv[4] ?? "docs/evidence/ui-speed/server-cold-path",
);
mkdirSync(evidence, { recursive: true });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const metrics = ["handler", "auth", "queue", "domain", "db", "encode"];
const now = "2026-11-11T12:00:00Z";
const routeNames = [
  "profiles",
  "tags",
  "tasks",
  "overdue",
  "projects",
  "inbox",
  "today",
  "scheduled",
];
async function stop(child: ChildProcess) {
  if (!child.pid) return;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = new Promise<void>((r) => child.once("exit", () => r()));
  child.kill("SIGTERM");
  await exit;
}
const timing = (header: string | null) =>
  Object.fromEntries(
    metrics.map((name) => [
      name,
      header?.match(
        new RegExp(`(?:^|, )todo-${name};dur=([0-9.]+)(?:,|$)`),
      )?.[1] === undefined
        ? null
        : Number(
            header?.match(
              new RegExp(`(?:^|, )todo-${name};dur=([0-9.]+)(?:,|$)`),
            )?.[1],
          ),
    ]),
  );
const cpu = (pid: number | undefined) =>
  spawnSync("ps", ["-p", String(pid), "-o", "cputime=,rss="], {
    encoding: "utf8",
  }).stdout.trim();
async function sample(
  f: Fixture,
  first: string,
  pressure: boolean,
  control?: "serial" | "lock" | "new-profile",
  limit = 85000,
) {
  if (mode === "quiet" && (loadavg()[0] ?? Infinity) > 4)
    return {
      fixture: f.id,
      first,
      pressure,
      held: true,
      reason: "quiet_load_ceiling",
      load: loadavg()[0],
    };
  const gate = pressure ? hostGate() : null;
  if (pressure && !gate?.allowed)
    return { fixture: f.id, first, pressure, gate, held: true };
  const directory = mkdtempSync(join(tmpdir(), "todo-cold-path-"));
  mkdirSync(join(directory, "home"));
  copyFileSync(f.path, join(directory, "scratch.db"));
  const workers: ChildProcess[] = [];
  let locker: ChildProcess | undefined;
  let server: ChildProcess | undefined;
  let spawnError: Error | undefined;
  let log = "";
  let ended = false;
  let interrupted = false;
  let guardChange: ReturnType<typeof hostGate> | undefined;
  let successful = 0;
  const started = performance.now();
  const load_start = loadavg()[0];
  const deadline = setTimeout(
    () => {
      interrupted = true;
      for (const p of workers) p.kill("SIGTERM");
      server?.kill("SIGTERM");
    },
    Math.min(85000, limit),
  );
  let guard: ReturnType<typeof setInterval> | undefined;
  try {
    if (pressure) {
      for (let i = 0; i < 6; i++)
        workers.push(
          spawn(
            process.execPath,
            [
              "-e",
              'console.log("ready"); let x=1; for(;;) x=Math.imul(x+1,1664525);',
            ],
            { stdio: ["ignore", "pipe", "ignore"] },
          ),
        );
      await Promise.all(
        workers.map(
          (worker) =>
            new Promise<void>((resolve, reject) => {
              let ready = false;
              worker.stdout?.once("data", () => {
                ready = true;
                resolve();
              });
              worker.once("error", reject);
              worker.once("exit", () => {
                if (!ready)
                  reject(
                    new Error(
                      "Pressure worker exited before its readiness signal",
                    ),
                  );
              });
            }),
        ),
      );
    }
    if (pressure || mode === "pressure") {
      guard = setInterval(() => {
        const current = hostGate();
        if (pressure && !current.allowed) {
          guardChange = current;
          interrupted = true;
          for (const p of workers) p.kill("SIGTERM");
          server?.kill("SIGTERM");
        }
      }, 1000);
    }
    server = spawn(
      mode === "profile"
        ? process.execPath
        : resolve(".scratch/bin/todo-server"),
      mode === "profile"
        ? [
            "--cpu-prof",
            "--cpu-prof-md",
            `--cpu-prof-dir=${evidence}`,
            "--cpu-prof-name=cold-path-server.cpuprofile",
            "apps/server/src/main.ts",
          ]
        : [],
      {
        env: {
          ...process.env,
          HOME: join(directory, "home"),
          TODO_DB: join(directory, "scratch.db"),
          TODO_PORT: "0",
          TODO_ATTACHMENT_ROOT: join(directory, "attachments"),
          TODO_DIAGNOSTICS_RECORDING: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout?.on("data", (b) => {
      log += b.toString();
    });
    server.once("error", (error) => {
      spawnError = error;
    });
    server.stderr?.on("data", (b) => {
      log += b.toString();
    });
    let url = "";
    while (!url && performance.now() - started < 60000) {
      if (spawnError) throw spawnError;
      assert.equal(server.exitCode, null, log);
      url = /Listening on (http:\/\/127\.0\.0\.1:[0-9]+)/u.exec(log)?.[1] ?? "";
      if (!url) await pause(10);
    }
    assert.ok(url, log);
    const ready_ms = performance.now() - started;
    let target = "p0";
    const path = (name: string) =>
      name === "profiles"
        ? "/profiles"
        : `/profiles/${target}/${["tags", "tasks", "projects"].includes(name) ? name : `views/${name}?now=${now}`}`;
    async function read(name: string, pass: string) {
      const request_id = randomUUID();
      const start = performance.now();
      const response = await fetch(url + path(name), {
        headers: {
          Authorization: `Bearer ${f.credential}`,
          "X-Todo-Request": request_id,
        },
        signal: AbortSignal.timeout(30000),
        cache: "no-store",
      });
      const text = await response.text();
      const client_ms = performance.now() - start;
      assert.equal(response.status, 200, text);
      assert.equal(response.headers.get("x-todo-request"), request_id);
      const body: unknown = JSON.parse(text);
      const rows = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))(
        body,
      );
      if (name === "profiles" || name === "tasks") {
        assert.equal(rows._tag, "Some");
        if (rows._tag === "Some")
          assert.equal(
            rows.value.length,
            name === "profiles" ? f.profiles : f.tasks,
          );
      }
      if (name === "tags" && f.rich && f.tasks === 178 && rows._tag === "Some")
        assert.equal(rows.value.length, 38);
      else if (name === "tags" || name === "projects") {
        assert.deepEqual(body, []);
      }
      if (["today", "overdue", "scheduled", "inbox"].includes(name)) {
        const view = Schema.decodeUnknownSync(
          Schema.Struct({
            groups: Schema.Array(
              Schema.Struct({ tasks: Schema.Array(Schema.Unknown) }),
            ),
          }),
        )(body);
        assert.equal(
          view.groups.reduce((s, g) => s + g.tasks.length, 0),
          name === "inbox" ? (f.tasks === 178 ? 50 : 15) : 0,
        );
      }
      const stages = timing(response.headers.get("server-timing"));
      assert.equal(typeof stages.handler, "number");
      successful++;
      return {
        name,
        pass,
        request_id,
        status: response.status,
        bytes: Buffer.byteLength(text),
        client_ms,
        ...stages,
      };
    }
    const order =
      first === "profiles" ? routeNames : [...routeNames.slice(1), "profiles"];
    const observations = [];
    if (control === "new-profile") {
      for (const name of routeNames.slice(1))
        await read(name, "primer_other_profile");
      target = "p1";
    }
    const cpu_before = cpu(server.pid);
    const generator = process.cpuUsage();
    for (const pass of ["first", "second", "third"])
      for (const name of order) observations.push(await read(name, pass));
    if (mode === "profile")
      for (let i = 0; i < 40; i++)
        await read("profiles", "untimed_cpu_profile");
    const observed_cpu = process.cpuUsage(generator);
    const cpu_after = cpu(server.pid);
    const detail = await fetch(url + "/diagnostics?detail=true", {
      headers: { Authorization: `Bearer ${f.credential}` },
    });
    assert.equal(detail.status, 200);
    const snapshot = Schema.decodeUnknownSync(DiagnosticsSnapshot)(
      await detail.json(),
    );
    const last = observations.at(-1);
    assert.ok(last);
    const recorded = (snapshot.profiler?.detail?.recent ?? []).filter(
      (s) => s.request_id === last.request_id,
    );
    let parallel: Awaited<ReturnType<typeof read>>[] | undefined;
    let parallel_spans:
      | Array<{
          request_id: string | undefined;
          start: number;
          end: number;
          duration_ms: number;
        }>
      | undefined;
    if (control === "serial")
      parallel = await Promise.all(order.map((name) => read(name, "parallel")));
    if (parallel) {
      const response = await fetch(url + "/diagnostics?detail=true", {
        headers: { Authorization: `Bearer ${f.credential}` },
      });
      assert.equal(response.status, 200);
      const snap = Schema.decodeUnknownSync(DiagnosticsSnapshot)(
        await response.json(),
      );
      const ids = new Set<string>(parallel.map((o) => o.request_id));
      parallel_spans = (snap.profiler?.detail?.recent ?? [])
        .filter(
          (s) => s.stage === "entry" && s.request_id && ids.has(s.request_id),
        )
        .map((s) => ({
          request_id: s.request_id,
          start: s.monotonic_ms - s.duration_ms,
          end: s.monotonic_ms,
          duration_ms: s.duration_ms,
        }));
    }
    let locked: Awaited<ReturnType<typeof read>> | undefined;
    let locked_spans: Array<{ stage: string; duration_ms: number }> | undefined;
    if (control === "lock") {
      locker = spawn(
        process.execPath,
        [
          "-e",
          'import {Database} from "bun:sqlite"; const d=new Database(process.argv[1]); d.exec("BEGIN IMMEDIATE"); console.log("locked"); setTimeout(()=>{d.exec("COMMIT");d.close();},300);',
          join(directory, "scratch.db"),
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      await new Promise<void>((resolve, reject) => {
        locker?.stdout?.once("data", () => resolve());
        locker?.once("error", reject);
      });
      locked = await read("profiles", "external_writer_300ms");
      await new Promise<void>((resolve) => {
        if (locker?.exitCode !== null) resolve();
        else locker?.once("exit", () => resolve());
      });
      const response = await fetch(url + "/diagnostics?detail=true", {
        headers: { Authorization: `Bearer ${f.credential}` },
      });
      assert.equal(response.status, 200);
      const snap = Schema.decodeUnknownSync(DiagnosticsSnapshot)(
        await response.json(),
      );
      locked_spans = (snap.profiler?.detail?.recent ?? [])
        .filter((s) => s.request_id === locked?.request_id)
        .map((s) => ({ stage: s.stage, duration_ms: s.duration_ms }));
      assert.ok(
        locked_spans.some(
          (s) => s.stage === "writer_lock_wait" && s.duration_ms >= 100,
        ),
        "The held 300ms writer lock must remain attributable in Diagnostics detail",
      );
    }
    const result = {
      fixture: f.id,
      server_pid: server.pid,
      tasks: f.tasks,
      profiles: f.profiles,
      extra: f.extra,
      large: f.large,
      ops: f.ops,
      history_bytes: f.history_bytes,
      task_bytes: f.task_bytes,
      first,
      pressure,
      gate,
      held: false,
      interrupted,
      ready_ms,
      load_start,
      load_end: loadavg()[0],
      observations,
      parallel,
      parallel_spans,
      locked,
      locked_spans,
      cpu_before,
      cpu_after,
      generator_cpu_ms: (observed_cpu.user + observed_cpu.system) / 1000,
      workers: workers.map((p) => p.pid),
      worker_cpu: workers.map((p) => cpu(p.pid)),
      elapsed_ms: performance.now() - started,
      profile_requests: mode === "profile" ? 40 : 0,
      span_sample: {
        matched_last: recorded.map((s) => ({
          stage: s.stage,
          duration_ms: s.duration_ms,
        })),
        omitted: snapshot.profiler?.omitted,
        unobserved: snapshot.profiler?.unobserved,
      },
    };
    assert.equal(
      interrupted,
      false,
      "Host input/frontmost guard or cell deadline interrupted run",
    );
    ended = true;
    return result;
  } catch (error) {
    if (interrupted) {
      const held = {
        fixture: f.id,
        first,
        pressure,
        held: true,
        aborted: true,
        gate_before: gate,
        gate_after: guardChange,
        reason: guardChange ? "host_gate" : "cell_deadline",
        successful_before_abort: successful,
        elapsed_ms: performance.now() - started,
        worker_pids: workers.map((p) => p.pid),
      };
      writeFileSync(
        join(evidence, `abort-${Date.now()}.json`),
        JSON.stringify(held, null, 2),
      );
      return held;
    }
    throw error;
  } finally {
    clearTimeout(deadline);
    clearInterval(guard);
    for (const p of workers) await stop(p);
    if (locker) await stop(locker);
    if (server) await stop(server);
    if (!ended) writeFileSync(join(evidence, `failure-${Date.now()}.log`), log);
    rmSync(directory, { recursive: true, force: true });
  }
}
const fixtures = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(FixtureSchema)),
)(readFileSync(join(fixtureRoot, "fixtures.json"), "utf8"));
for (const f of fixtures)
  assert.ok(
    f.path.startsWith(`${resolve(".scratch")}/`),
    "Only checkout-local scratch fixtures are allowed",
  );
if (mode === "gate") console.log(JSON.stringify(hostGate()));
else {
  const results: object[] = [];
  const write = () =>
    writeFileSync(
      join(evidence, `${mode}.json`),
      JSON.stringify({ mode, cores: cpus().length, results }, null, 2),
    );
  const selected =
    process.env.COLD_PILOT === "1"
      ? fixtures.filter(
          (f) =>
            f.tasks === 15 && f.profiles === 1 && f.extra === 256 && f.large,
        )
      : fixtures
          .filter((f) =>
            mode === "serial"
              ? f.extra === 2048 && f.large && [1, 8].includes(f.profiles)
              : mode === "lock"
                ? f.tasks === 15 &&
                  f.profiles === 1 &&
                  f.extra === 256 &&
                  f.large
                : mode === "new-profile"
                  ? f.profiles === 3 && f.extra === 2048 && f.large
                  : true,
          )
          .filter((f) =>
            process.env.COLD_ONLY
              ? process.env.COLD_ONLY.split(",").includes(f.id)
              : true,
          );
  assert.ok(selected.length > 0, "No fixture matches the requested filter");
  for (const f of selected)
    for (const first of ["profiles", "profile"]) {
      if (process.env.COLD_FIRST && first !== process.env.COLD_FIRST) continue;
      if (
        ["serial", "lock", "new-profile"].includes(mode ?? "") &&
        first === "profiles"
      )
        continue;
      if (mode === "pressure") {
        const gate = hostGate();
        if (!gate.allowed) {
          results.push({
            fixture: f.id,
            first,
            pressure: true,
            held: true,
            gate,
          });
          write();
          continue;
        }
      }
      const cell = performance.now();
      for (let pair = 0; pair < repeats; pair++) {
        if (performance.now() - cell > 90000) {
          results.push({ fixture: f.id, first, cell_timeout: true });
          break;
        }
        let held = false;
        for (const pressure of mode === "pressure"
          ? pair % 2
            ? [true, false]
            : [false, true]
          : [false]) {
          const result = await sample(
            f,
            first,
            pressure,
            mode === "serial" || mode === "lock" || mode === "new-profile"
              ? mode
              : undefined,
            90000 - (performance.now() - cell),
          );
          results.push({ pair, ...result });
          write();
          held = result.held;
          if (held) break;
        }
        if (held) break;
      }
      console.error(`${mode} ${f.id} ${first}`);
    }
  write();
  if (
    results.some((r) => ("held" in r && r.held === true) || "cell_timeout" in r)
  )
    process.exitCode = 2;
}
