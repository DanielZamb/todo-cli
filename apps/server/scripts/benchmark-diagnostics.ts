import { strict as assert } from "node:assert";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { loadavg } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DiagnosticsSnapshot, Task } from "@todo/domain";
import { Schema } from "effect";

assert.equal(
  process.env.TODO_DIAGNOSTICS_BENCHMARK,
  "1",
  "Wait for the coordinator's quiet-host go-ahead",
);
const quiet = () =>
  assert.ok(
    (loadavg()[0] ?? Infinity) <= 4,
    "Host load exceeded 4; measurement stopped",
  );
quiet();
const polling = process.env.TODO_DIAGNOSTICS_POLLING !== "0";
const root = resolve(import.meta.dirname, "../../..");
const directory = join(root, ".scratch", "benchmark");
const evidence = process.argv[2] ?? "";
assert.ok(evidence.startsWith("/") && !existsSync(evidence));
mkdirSync(evidence, { recursive: true });
mkdirSync(directory, { recursive: true });
const command = (
  executable: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {},
) => {
  quiet();
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    ...(options.input === undefined ? {} : { input: options.input }),
    encoding: "utf8",
    timeout: 120000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
const base = command("git", [
  "rev-parse",
  process.env.TODO_DIAGNOSTICS_BASELINE ?? "3618e09",
]).trim();
const baseline = join(directory, base);
if (
  !existsSync(join(baseline, "bin", "todo-server")) ||
  !existsSync(join(baseline, "bin", "todo"))
) {
  mkdirSync(baseline, { recursive: true });
  const archive = spawnSync(
    "git",
    [
      "archive",
      base,
      "package.json",
      "apps/server",
      "apps/cli",
      "packages/domain",
      "packages/api",
    ],
    { cwd: root, maxBuffer: 10000000 },
  );
  assert.equal(archive.status, 0);
  const unpack = spawnSync("tar", ["-x", "-C", baseline], {
    input: archive.stdout,
  });
  assert.equal(unpack.status, 0);
  const workspaces = [
    "apps/server",
    "apps/cli",
    "packages/domain",
    "packages/api",
  ];
  const Package = Schema.Struct({
    name: Schema.String,
    dependencies: Schema.Record(Schema.String, Schema.String),
  });
  const names = new Map(
    workspaces.map((path) => [
      Schema.decodeUnknownSync(Package)(
        JSON.parse(readFileSync(join(baseline, path, "package.json"), "utf8")),
      ).name,
      path,
    ]),
  );
  for (const path of workspaces) {
    const pkg = Schema.decodeUnknownSync(Package)(
      JSON.parse(readFileSync(join(baseline, path, "package.json"), "utf8")),
    );
    for (const name of Object.keys(pkg.dependencies)) {
      const target = join(baseline, path, "node_modules", name);
      mkdirSync(dirname(target), { recursive: true });
      if (!existsSync(target))
        symlinkSync(
          names.has(name)
            ? join(baseline, names.get(name) ?? "")
            : realpathSync(join(root, path, "node_modules", name)),
          target,
        );
    }
  }
  mkdirSync(join(baseline, "bin"), { recursive: true });
  command(
    "bun",
    [
      "build",
      "--compile",
      join(baseline, "apps/server/src/main.ts"),
      "--outfile",
      join(baseline, "bin/todo-server"),
    ],
    { cwd: join(baseline, "bin") },
  );
  command(
    "bun",
    [
      "build",
      "--compile",
      join(baseline, "apps/cli/src/main.ts"),
      "--outfile",
      join(baseline, "bin/todo"),
    ],
    { cwd: join(baseline, "bin") },
  );
}
const children: ChildProcess[] = [];
const logs: Record<string, string> = {};
const stop = async (child: ChildProcess) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
  await stopped;
  clearTimeout(timer);
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sources = readFileSync(join(root, ".scratch/bin/source.json"), "utf8");
const setup = async (name: string, executable: string) => {
  const home = join(directory, `${Date.now()}-${name}`);
  mkdirSync(home, { recursive: true });
  const env = {
    ...process.env,
    HOME: home,
    TODO_DB: join(home, "scratch.db"),
    TODO_PORT: "0",
    TODO_ATTACHMENT_ROOT: join(home, "attachments"),
  };
  const cli = (args: string[], input?: string) =>
    command(
      name === "baseline"
        ? join(baseline, "bin/todo")
        : join(root, ".scratch/bin/todo"),
      ["--profile", "work", ...args],
      {
        env,
        ...(input === undefined ? {} : { input }),
      },
    );
  cli(["init", "--password-stdin"], "scratch benchmark passphrase\n");
  cli(["login", "--password-stdin"], "scratch benchmark passphrase\n");
  for (let index = 0; index < 100; index++)
    cli([
      "add",
      `Benchmark Task ${String(index).padStart(3, "0")}`,
      "--format",
      "json",
    ]);
  let log = "";
  const server = spawn(executable, [], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(server);
  server.stdout.on("data", (chunk: Buffer) => {
    log += chunk.toString();
    logs[name] = log;
  });
  server.stderr.on("data", (chunk: Buffer) => {
    log += chunk.toString();
    logs[name] = log;
  });
  let url = "";
  for (let attempt = 0; attempt < 1200 && !url; attempt++) {
    assert.equal(server.exitCode, null);
    url = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
    if (!url) await sleep(50);
  }
  assert.ok(url);
  const session = await fetch(`${url}/auth/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase: "scratch benchmark passphrase" }),
  });
  assert.equal(session.status, 200);
  const credential = Schema.decodeUnknownSync(
    Schema.Struct({ credential: Schema.String }),
  )(await session.json()).credential;
  return { server, url, credential, home };
};
const percentile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[
    Math.max(0, Math.ceil(values.length * fraction) - 1)
  ] ?? 0;
const rounds: Array<{
  name: string;
  round: number;
  p50_ms: number;
  p95_ms: number;
  requests: number;
  errors: number;
  polls: number;
  cpu: string;
}> = [];
try {
  writeFileSync(
    join(evidence, "environment.txt"),
    command("uptime", []) + command("sysctl", ["-n", "hw.ncpu"]),
  );
  writeFileSync(join(evidence, "compiled-source.json"), sources);
  const variants = {
    baseline: await setup("baseline", join(baseline, "bin/todo-server")),
    diagnostics: await setup(
      "diagnostics",
      join(root, ".scratch/bin/todo-server"),
    ),
  };
  const read = async (variant: (typeof variants)[keyof typeof variants]) => {
    quiet();
    const start = performance.now();
    const response = await fetch(`${variant.url}/profiles/work/tasks`, {
      headers: { Authorization: `Bearer ${variant.credential}` },
      cache: "no-store",
    });
    assert.equal(response.status, 200);
    const body: unknown = await response.json();
    const elapsed = performance.now() - start;
    const tasks = Schema.decodeUnknownSync(Schema.Array(Task))(body);
    assert.equal(tasks.length, 100);
    assert.deepEqual(
      tasks.map((task) => task.title).sort(),
      Array.from(
        { length: 100 },
        (_, index) => `Benchmark Task ${String(index).padStart(3, "0")}`,
      ),
    );
    return elapsed;
  };
  for (const variant of Object.values(variants))
    for (let warm = 0; warm < 20; warm++) await read(variant);
  const profileBinary = join(directory, "profile-current");
  command(
    "bun",
    [
      "build",
      "--compile",
      join(root, "apps/server/src/main.ts"),
      "--compile-exec-argv",
      `--cpu-prof --cpu-prof-md --cpu-prof-dir=${evidence} --cpu-prof-name=server.cpuprofile`,
      "--outfile",
      profileBinary,
    ],
    { cwd: directory },
  );
  const profiled = await setup("profile", profileBinary);
  const profileUntil = performance.now() + 1500;
  while (performance.now() < profileUntil) await read(profiled);
  await stop(profiled.server);
  const order: Array<keyof typeof variants> = ["baseline", "diagnostics"];
  for (let round = 0; round < 5; round++)
    for (const name of order) {
      const variant = variants[name];
      let pollBusy = false;
      let polls = 0;
      const timer =
        name === "diagnostics" && polling
          ? setInterval(async () => {
              if (pollBusy) return;
              pollBusy = true;
              polls++;
              try {
                const response = await fetch(`${variant.url}/diagnostics`, {
                  headers: { Authorization: `Bearer ${variant.credential}` },
                });
                assert.equal(response.status, 200);
                const snapshot = Schema.decodeUnknownSync(DiagnosticsSnapshot)(
                  await response.json(),
                );
                assert.equal(
                  snapshot.storage.entities.find(
                    (entity) => entity.profile === "work",
                  )?.tasks,
                  100,
                );
              } finally {
                pollBusy = false;
              }
            }, 1000)
          : undefined;
      const durations: number[] = [];
      try {
        const until = performance.now() + 2000;
        for (let index = 0; index < 200 || performance.now() < until; index++) {
          durations.push(await read(variant));
        }
      } finally {
        clearInterval(timer);
        while (pollBusy) await sleep(10);
      }
      if (name === "diagnostics" && polling) assert.ok(polls >= 1);
      else assert.equal(polls, 0);
      rounds.push({
        name,
        round,
        p50_ms: percentile(durations, 0.5),
        p95_ms: percentile(durations, 0.95),
        requests: durations.length,
        errors: 0,
        polls,
        cpu: command("ps", [
          "-p",
          `${variant.server.pid},${process.pid}`,
          "-o",
          "pid,pcpu,time,comm",
        ]),
      });
    }
  const summary = Object.fromEntries(
    Object.keys(variants).map((name) => {
      const values = rounds
        .filter((round) => round.name === name)
        .map((round) => round.p50_ms);
      return [
        name,
        {
          median_p50_ms: percentile(values, 0.5),
          min_p50_ms: Math.min(...values),
          max_p50_ms: Math.max(...values),
        },
      ];
    }),
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        baseline_sha: base,
        source_hash: Schema.decodeUnknownSync(
          Schema.Struct({ source_hash: Schema.String }),
        )(JSON.parse(sources)).source_hash,
        task_count: 100,
        rounds,
        summary,
        timed_path:
          "fetch + HTTP + authenticated SQLite read + JSON parse; validation and literal assertions follow each timed request",
        poll_interval_ms: polling ? 1000 : null,
        profiled_run_in_timing: false,
      },
      null,
      2,
    ),
  );
  if (!polling) {
    const baselineMedian = percentile(
      rounds
        .filter((round) => round.name === "baseline")
        .map((round) => round.p50_ms),
      0.5,
    );
    const currentMedian = percentile(
      rounds
        .filter((round) => round.name === "diagnostics")
        .map((round) => round.p50_ms),
      0.5,
    );
    assert.ok(
      currentMedian <= baselineMedian + 0.15,
      "No-poll median exceeded baseline by more than 0.15 ms",
    );
  }
} finally {
  for (const child of children) await stop(child);
  for (const [name, log] of Object.entries(logs))
    writeFileSync(join(evidence, `${name}.log`), log);
}
