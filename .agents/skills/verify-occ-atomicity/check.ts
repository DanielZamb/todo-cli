import assert from "node:assert/strict";
import {
  type ChildProcessWithoutNullStreams,
  spawn,
  spawnSync,
} from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { Schema } from "effect";
import { Task } from "../../../packages/domain/src/entities.ts";
import { OpLogEntry } from "../../../packages/domain/src/events.ts";
import coverage from "./coverage.json";
import { initial, proposal } from "./fixture.ts";
import pin from "./tool.json";

const skill = import.meta.dirname;
const root = resolve(skill, "../../..");
const base = join(root, "docs/evidence/fv01");
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "fv01-check-"));
const scratch = join(evidence, "scratch");
mkdirSync(scratch);
const started = performance.now();
const sha256 = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const record = (name: string, value: unknown) =>
  writeFileSync(
    join(evidence, `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
function execute(
  label: string,
  command: string,
  args: string[],
  env = process.env,
) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });
  writeFileSync(join(evidence, `${label}.stdout`), result.stdout ?? "");
  writeFileSync(join(evidence, `${label}.stderr`), result.stderr ?? "");
  record(label, {
    command,
    args,
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message,
  });
  return result;
}
function success(label: string, command: string, args: string[]) {
  const result = execute(label, command, args);
  assert.equal(
    result.status,
    0,
    `${label} failed; read ${join(evidence, `${label}.stderr`)}`,
  );
  return result.stdout;
}
function once(source: string, from: string, to: string) {
  assert.equal(
    source.split(from).length,
    2,
    `Instrumentation point changed: ${from}`,
  );
  return source.replace(from, to);
}
function instrument(source: string) {
  const start = source.indexOf("  private appendSync(");
  const end = source.indexOf("  readonly append =", start);
  assert.ok(
    start >= 0 && end > start,
    "appendSync moved; review the model mapping",
  );
  let body = source.slice(start, end);
  body = once(
    body,
    "return this.transaction(() => {",
    "const accepted = this.transaction(() => {",
  );
  body = once(
    body,
    "this.validate(event, input.profile);",
    'this.validate(event, input.profile); __fv01("validated");',
  );
  body = once(
    body,
    "applyEvent(this.db, event, input.profile);",
    '{ __fv01("recorded"); applyEvent(this.db, event, input.profile); __fv01("projected"); }',
  );
  body = once(
    body,
    "      });\n    } catch",
    '      });\n      __fv01("committed");\n      return accepted;\n    } catch',
  );
  const rejectionStart = source.indexOf("  private recordRejection(");
  const rejectionEnd = source.indexOf("  private validate(", rejectionStart);
  assert.ok(rejectionStart >= 0 && rejectionEnd > rejectionStart);
  let rejection = source.slice(rejectionStart, rejectionEnd);
  rejection = once(
    rejection,
    "return this.transaction(() => {",
    "const rejected = this.transaction(() => {",
  );
  rejection = once(
    rejection,
    "      for (const id of this.snapshots.purgedIdsSync())",
    '      __fv01("rejection-recorded");\n      for (const id of this.snapshots.purgedIdsSync())',
  );
  rejection = once(
    rejection,
    "    });\n  }",
    '    });\n    __fv01("rejection-committed");\n    return rejected;\n  }',
  );
  return `function __fv01(point: string) {
    if (process.env.FV01_FAULT === point) process.kill(process.pid, "SIGKILL");
  }\n${source.slice(0, rejectionStart)}${rejection}${source.slice(rejectionEnd, start)}${body}${source.slice(end)}`;
}
const State = Schema.Struct({
  tasks: Schema.Array(Task),
  history: Schema.Array(OpLogEntry),
  replay: Schema.Array(Task),
  versions: Schema.Array(
    Schema.Struct({ id: Schema.String, version: Schema.Number }),
  ),
});
const binary = join(scratch, "drive");
const faultBinary = join(scratch, "drive-faults");
const children = new Set<ChildProcessWithoutNullStreams>();
function inspect(label: string, path: string) {
  return Schema.decodeUnknownSync(State)(
    JSON.parse(success(label, binary, ["inspect", path])),
  );
}
function attempt(label: string, path: string, extra: Record<string, string>) {
  const executable = extra.FV01_FAULT === undefined ? binary : faultBinary;
  const child = spawn(executable, ["attempt", path], {
    cwd: root,
    env: { ...process.env, ...extra },
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.add(child);
  let stdout = "";
  let stderr = "";
  let readyResolve: () => void = () => {};
  let readyReject: (error: Error) => void = () => {};
  const ready = new Promise<void>((resolveReady, rejectReady) => {
    readyResolve = resolveReady;
    readyReject = rejectReady;
  });
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    readyReject(new Error(`${label} exceeded 15 seconds`));
  }, 15000);
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
    if (stdout.includes("READY\n")) readyResolve();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.on("error", readyReject);
  const done = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolveDone) => {
    child.on("close", (code, signal) => {
      children.delete(child);
      clearTimeout(timer);
      writeFileSync(join(evidence, `${label}.stdout`), stdout);
      writeFileSync(join(evidence, `${label}.stderr`), stderr);
      record(label, {
        command: executable,
        args: ["attempt", path],
        extra,
        exitCode: code,
        signal,
      });
      readyReject(
        new Error(`${label} exited before READY: ${code}, ${signal}`),
      );
      resolveDone({ code, signal });
    });
  });
  return { ready, done, release: () => child.stdin.end("go\n") };
}

let exitCode = 1;
try {
  assert.equal(
    Bun.version,
    "1.4.4",
    "Use the recorded Bun 1.4.4 runtime; review mapping before changing it",
  );
  const provenance = {
    head: success("git-head", "git", ["rev-parse", "HEAD"]).trim(),
    branch: success("git-branch", "git", ["branch", "--show-current"]).trim(),
    bun: Bun.version,
    source: Object.fromEntries(
      coverage.files.map(({ path }) => [path, sha256(join(root, path))]),
    ),
    model: sha256(join(skill, "AtomicOCC.tla")),
    config: sha256(join(skill, "AtomicOCC.cfg")),
    tool: pin,
  };
  record("provenance", provenance);
  const sqlite = new (await import("bun:sqlite")).Database(":memory:");
  try {
    record(
      "sqlite-version",
      sqlite.query("SELECT sqlite_version() AS version").get(),
    );
  } finally {
    sqlite.close();
  }
  const jar = join(base, "tools/tla2tools-1.7.4.jar");
  if (!existsSync(jar)) {
    const disk = statfsSync(base);
    assert.ok(
      disk.bavail * disk.bsize >= 10_000_000_000,
      "DISK STOP: fewer than 10 GB free",
    );
    mkdirSync(join(base, "tools"), { recursive: true });
    success("tool-download", "curl", [
      "--fail",
      "--location",
      "--proto",
      "=https",
      "--tlsv1.2",
      pin.url,
      "-o",
      jar,
    ]);
  }
  assert.equal(
    sha256(jar),
    pin.sha256,
    "TLC checksum mismatch; do not update the pin to bypass this failure",
  );
  success("java-version", "java", ["-version"]);
  const config = readFileSync(join(skill, "AtomicOCC.cfg"), "utf8");
  copyFileSync(join(skill, "AtomicOCC.tla"), join(evidence, "AtomicOCC.tla"));
  for (const mode of [
    "baseline",
    "without-before-check",
    "without-atomic-commit",
  ]) {
    const cfg = join(evidence, `${mode}.cfg`);
    writeFileSync(
      cfg,
      mode === "baseline"
        ? config
        : mode === "without-before-check"
          ? config.replace("CheckBefore = TRUE", "CheckBefore = FALSE")
          : config.replace("AtomicCommit = TRUE", "AtomicCommit = FALSE"),
    );
    const result = execute(`tlc-${mode}`, "java", [
      "-XX:+UseParallelGC",
      "-Xmx512m",
      "-cp",
      jar,
      "tlc2.TLC",
      "-workers",
      "1",
      "-fp",
      "0",
      "-metadir",
      join(evidence, `states-${mode}`),
      "-config",
      cfg,
      join(evidence, "AtomicOCC.tla"),
    ]);
    if (mode === "baseline") {
      assert.equal(result.status, 0, "TLC failed; read tlc-baseline.stdout");
      assert.match(
        result.stdout,
        /Model checking completed\. No error has been found\./,
      );
      assert.match(result.stdout, /0 states left on queue/);
    } else {
      assert.equal(result.status, 12, `${mode} must violate AtomicCAS`);
      assert.match(result.stdout, /Invariant AtomicCAS is violated/);
    }
  }
  const production = await Bun.build({
    entrypoints: [join(skill, "driver.ts")],
    target: "bun",
    compile: { outfile: binary },
  });
  record("compile-production", {
    success: production.success,
    logs: production.logs.map(String),
  });
  assert.equal(
    production.success,
    true,
    "Production driver compilation failed",
  );
  const enumeration = success("enumerate", binary, ["enumerate"]);
  assert.match(enumeration, /"checked":216/);
  record("enumeration", JSON.parse(enumeration));
  const built = await Bun.build({
    entrypoints: [join(skill, "driver.ts")],
    target: "bun",
    compile: { outfile: faultBinary },
    plugins: [
      {
        name: "fv01-crash-boundaries",
        setup(build) {
          build.onLoad({ filter: /\/store\/store\.ts$/ }, async ({ path }) => {
            const original = await Bun.file(path).text();
            const contents = instrument(original);
            writeFileSync(join(evidence, "instrumented-store.ts"), contents);
            return { contents, loader: "ts" };
          });
          build.onLoad(
            { filter: /\/store\/projection\.ts$/ },
            async ({ path }) => {
              const original = await Bun.file(path).text();
              const statement = ".run(task.id, JSON.stringify(task));";
              const contents = once(
                original,
                statement,
                `${statement}\n  if (process.env.FV01_FAULT === "task-written") process.kill(process.pid, "SIGKILL");`,
              );
              writeFileSync(
                join(evidence, "instrumented-projection.ts"),
                contents,
              );
              return { contents, loader: "ts" };
            },
          );
        },
      },
    ],
  });
  record("compile-faults", {
    success: built.success,
    logs: built.logs.map(String),
  });
  assert.equal(built.success, true, "Compiled driver failed");
  for (const point of [
    "validated",
    "recorded",
    "task-written",
    "projected",
    "committed",
  ]) {
    const path = join(scratch, `${point}.db`);
    success(`seed-${point}`, binary, ["seed", path]);
    const child = attempt(`kill-${point}`, path, { FV01_FAULT: point });
    await child.ready;
    child.release();
    const killed = await child.done;
    assert.equal(
      killed.signal,
      "SIGKILL",
      `Fault ${point} did not terminate its process`,
    );
    const state = inspect(`inspect-${point}`, path);
    const expected =
      point === "committed"
        ? proposal(initial, 2, "TaskEdited").after
        : initial;
    assert.ok(expected);
    assert.deepEqual(state.tasks, [expected], `Task after kill at ${point}`);
    assert.deepEqual(state.replay, [expected], `Replay after kill at ${point}`);
    assert.deepEqual(state.versions, [
      { id: initial.id, version: expected.row_version },
    ]);
    assert.equal(state.history.length, point === "committed" ? 2 : 1);
    assert.ok(state.history.every((entry) => entry.outcome === "committed"));
  }
  for (const point of ["rejection-recorded", "rejection-committed"]) {
    const path = join(scratch, `${point}.db`);
    success(`seed-${point}`, binary, ["seed", path]);
    const child = attempt(`kill-${point}`, path, {
      FV01_FAULT: point,
      FV01_KIND: "stale",
    });
    await child.ready;
    child.release();
    assert.equal((await child.done).signal, "SIGKILL");
    const state = inspect(`inspect-${point}`, path);
    assert.deepEqual(state.tasks, [initial]);
    assert.deepEqual(state.replay, [initial]);
    assert.deepEqual(state.versions, [{ id: initial.id, version: 1 }]);
    assert.deepEqual(
      state.history.map(({ outcome }) => outcome),
      point === "rejection-committed"
        ? ["committed", "rejected"]
        : ["committed"],
    );
  }
  const racePath = join(scratch, "race.db");
  success("seed-race", binary, ["seed", racePath]);
  const first = attempt("race-attachment", racePath, {
    FV01_KIND: "attachment",
  });
  const second = attempt("race-import-edit", racePath, { FV01_KIND: "edit" });
  await Promise.all([first.ready, second.ready]);
  first.release();
  second.release();
  const racers = await Promise.all([first.done, second.done]);
  assert.ok(racers.every(({ code, signal }) => code === 0 && signal === null));
  const race = inspect("inspect-race", racePath);
  assert.equal(race.tasks[0]?.row_version, 2);
  assert.deepEqual(race.versions, [{ id: initial.id, version: 2 }]);
  assert.deepEqual(race.replay, race.tasks);
  assert.deepEqual(
    race.history.map((entry) => [entry.outcome, entry.reason]),
    [
      ["committed", null],
      ["committed", null],
      ["rejected", "conflict"],
    ],
  );
  const rollbackPath = join(scratch, "rollback.db");
  success("seed-rollback", binary, ["seed", rollbackPath]);
  success("rollback", binary, ["rollback", rollbackPath]);
  success("typecheck", "bun", [
    "--bun",
    "node_modules/typescript/bin/tsc",
    "-p",
    join(skill, "tsconfig.json"),
  ]);
  const drift = coverage.files.filter(
    ({ path, sha256: expected }) => sha256(join(root, path)) !== expected,
  );
  record("source-drift", {
    confirmedCommit: coverage.confirmedCommit,
    changed: drift.map(({ path }) => path),
  });
  assert.equal(
    drift.length,
    0,
    "Source mapping changed. Read coverage.json and SKILL.md before renewing it; observed checks alone do not renew the model.",
  );
  exitCode = 0;
  record("result", {
    status: "pass",
    exitCode,
    elapsedSeconds: (performance.now() - started) / 1000,
    model: "AtomicCAS",
    enumeration: 216,
    replayChecks: 432,
    processKills: 7,
    competingWriters: 2,
    sourceMapping: coverage.confirmedCommit,
  });
  console.log(
    `PASS: AtomicCAS model and production checks. Evidence: ${evidence}`,
  );
} catch (error) {
  record("result", {
    status: "fail",
    exitCode,
    error: String(error),
    elapsedSeconds: (performance.now() - started) / 1000,
  });
  console.error(error);
  console.error(`FAIL: evidence: ${evidence}`);
} finally {
  for (const child of children) child.kill("SIGKILL");
  rmSync(scratch, { recursive: true, force: true });
}
process.exitCode = exitCode;
