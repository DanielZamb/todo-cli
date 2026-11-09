import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { availableParallelism, loadavg, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect } from "@playwright/test";
import { Schema } from "effect";

const [surface, artifact, output] = process.argv.slice(2);
assert(surface === "swift" || surface === "electron");
assert(artifact && output);
const root = resolve(import.meta.dirname, "../../..");
const evidence = resolve(output);
mkdirSync(evidence, { recursive: true });
const resolvedPaths = spawnSync(
  "git",
  ["ls-files", "-z", "--", ":(glob)**/Package.resolved", "Package.resolved"],
  { cwd: root, encoding: "utf8" },
);
assert.equal(resolvedPaths.status, 0);
const packageFiles = resolvedPaths.stdout.split("\0").filter(Boolean);
const checkResolved = (phase: "before" | "after") => {
  const command = ["diff", "--exit-code", "HEAD", "--", ...packageFiles];
  const result = spawnSync("git", command, { cwd: root, encoding: "utf8" });
  writeFileSync(
    join(evidence, `package-resolved-${phase}.json`),
    JSON.stringify(
      {
        command: ["git", ...command],
        files: packageFiles,
        exit: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
      },
      null,
      2,
    ),
  );
  return result.status;
};
if (surface === "swift") assert.equal(checkResolved("before"), 0);
const scratch = mkdtempSync(join(tmpdir(), "todo-s01-verify-refresh-"));
const home = join(scratch, "home");
mkdirSync(home);
const binaries = Schema.decodeUnknownSync(
  Schema.Struct({
    cli: Schema.String,
    server: Schema.String,
    seed: Schema.String,
    sourceHash: Schema.String,
    head: Schema.String,
  }),
)(JSON.parse(readFileSync(join(root, ".scratch/bin/build.json"), "utf8")));

const env: NodeJS.ProcessEnv = {
  ...process.env,
  HOME: home,
  TODO_DB: join(scratch, "scratch.db"),
  TODO_PORT: "0",
};
delete env.ELECTRON_RUN_AS_NODE;
const command = (file: string, args: string[]) => {
  const result = spawnSync(file, args, { cwd: root, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
command(binaries.seed, [scratch, "diagnostics"]);
let log = "";
const server = spawn(binaries.server, [], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (data) => {
  log += data;
});
server.stderr.on("data", (data) => {
  log += data;
});
type Call = {
  path: string;
  start: number;
  end: number | null;
  status: number | null;
  error: string | null;
  cancelled: boolean;
  interval: string | null;
};
const calls: Call[] = [];
const samples: { name: string; start: number; end: number; load1: number }[] =
  [];
let interval: { name: string; start: number; load1: number } | null = null;
let upstream = "";
let desktop: ElectronApplication | undefined;
let restoreSwiftBundle: (() => void) | undefined;
const profileReceipts: { label: string; pid: number; exit: number | null }[] =
  [];
const profilers: Promise<void>[] = [];
const sampleProcess = (pid: number | undefined, label: string) => {
  if (process.env.TODO_REFRESH_PROFILE !== "1") return;
  assert(pid !== undefined && pid > 0, "Expected an owned process to profile");
  const child = spawn(
    "/usr/bin/sample",
    [String(pid), "2", "1", "-file", join(evidence, `${label}.sample.txt`)],
    { stdio: "ignore" },
  );
  profilers.push(
    new Promise<void>((done) =>
      child.on("close", (code) => {
        profileReceipts.push({ label, pid, exit: code });
        done();
      }),
    ),
  );
};
let failNextList = false;
let profileStarted = false;
let swiftRunnerPid: number | undefined;
let rendererPid: number | undefined;
const loadBefore = command("uptime", []);
const delay = Number(process.env.TODO_REFRESH_DELAY_MS ?? 0);
const mark = (action: string, name: string) => {
  if (action === "start") {
    assert.equal(interval, null);
    interval = { name, start: performance.now(), load1: loadavg()[0] ?? 0 };
    if (
      process.env.TODO_REFRESH_PROFILE === "1" &&
      name.startsWith("warmup") &&
      !profileStarted
    ) {
      profileStarted = true;
      sampleProcess(server.pid, "server");
      if (surface === "electron")
        sampleProcess(rendererPid, "electron-renderer");
      else {
        const processRows = command("ps", ["-axo", "pid,ppid,comm"])
          .split("\n")
          .map((row) => row.trim().split(/\s+/));
        const test = processRows.find(
          (row) =>
            Number(row[1]) === swiftRunnerPid &&
            row.slice(2).join(" ").endsWith("/xctest"),
        );
        if (test) sampleProcess(Number(test[0]), "swift-model");
        else
          profileReceipts.push({
            label: "swift-model-not-found",
            pid: 0,
            exit: null,
          });
      }
    }
  } else {
    assert(interval);
    samples.push({ ...interval, end: performance.now() });
    interval = null;
  }
};
const proxy = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/__measurement/")) {
      mark(
        url.pathname.split("/").at(-1) ?? "",
        url.searchParams.get("name") ?? "",
      );
      return new Response("ok");
    }
    const call: Call = {
      path: url.pathname + url.search,
      start: performance.now(),
      end: null,
      status: null,
      error: null,
      cancelled: false,
      interval: interval?.name ?? null,
    };
    calls.push(call);
    request.signal.addEventListener("abort", () => {
      if (call.end === null) call.cancelled = true;
    });
    try {
      const response = await fetch(upstream + url.pathname + url.search, {
        method: request.method,
        headers: request.headers,
        signal: request.signal,
        ...(request.method === "GET" ? {} : { body: await request.text() }),
      });
      call.status = response.status;
      if (url.pathname.endsWith("/events")) return response;
      const body = await response.arrayBuffer();
      if (delay && request.method === "GET") await Bun.sleep(delay);
      call.end = performance.now();
      if (url.pathname.endsWith("/tasks") && failNextList) {
        failNextList = false;
        call.status = 503;
        return new Response("Controlled measurement failure", { status: 503 });
      }
      return new Response(body, {
        status: response.status,
        headers: response.headers,
      });
    } catch (error) {
      call.error = String(error);
      call.end = performance.now();
      throw error;
    }
  },
});
let exit = 1;
try {
  await expect
    .poll(() => log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1], {
      timeout: 60000,
    })
    .toBeTruthy();
  upstream = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
  const auth = await fetch(upstream + "/auth/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passphrase: "scratch verification passphrase" }),
  });
  assert.equal(auth.status, 200);
  const { credential } = Schema.decodeUnknownSync(
    Schema.Struct({ credential: Schema.String }),
  )(await auth.json());
  const today = new Date().toISOString().slice(0, 10);
  for (const payload of [
    { title: "Refresh Inbox" },
    { title: "Refresh Today", scheduled_at: { kind: "date", date: today } },
    { title: "Refresh Overdue", due_at: { kind: "date", date: "2000-01-01" } },
    {
      title: "Refresh Scheduled",
      scheduled_at: { kind: "date", date: "2099-01-01" },
    },
  ]) {
    const response = await fetch(upstream + "/profiles/work/tasks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${credential}`,
      },
      body: JSON.stringify({ ...payload, priority: "P1" }),
    });
    assert.equal(response.status, 200, await response.text());
  }
  const url = `http://127.0.0.1:${proxy.port}`;
  if (surface === "swift") {
    const buildPath = join(root, "apps/macos/DerivedData/RefreshBefore");
    const activeBundle = join(
      buildPath,
      "debug/TodoStateProofPackageTests.xctest/Contents/MacOS/TodoStateProofPackageTests",
    );
    const savedBundle = join(scratch, "saved-test-bundle");
    copyFileSync(activeBundle, savedBundle);
    restoreSwiftBundle = () => copyFileSync(savedBundle, activeBundle);
    copyFileSync(resolve(artifact), activeBundle);
    const child = spawn(
      "swift",
      [
        "test",
        "--disable-automatic-resolution",
        "--skip-build",
        "--no-parallel",
        "--package-path",
        "apps/macos",
        "--scratch-path",
        buildPath,
        "--filter",
        "refreshMeasurement",
      ],
      {
        cwd: root,
        env: { ...env, TODO_REFRESH_SERVER: url },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    swiftRunnerPid = child.pid;
    let text = "";
    child.stdout.on("data", (data) => {
      text += data;
    });
    child.stderr.on("data", (data) => {
      text += data;
    });
    exit = await new Promise<number>((done) =>
      child.on("close", (code) => done(code ?? 1)),
    );
    writeFileSync(join(evidence, "client.log"), text);
    const resolvedExit = checkResolved("after");
    if (resolvedExit !== 0) exit = resolvedExit ?? 1;
    assert.equal(exit, 0, text);
  } else {
    desktop = await _electron.launch({
      executablePath: createRequire(import.meta.url)("electron"),
      args: [join(resolve(artifact), "verification/write-host.mjs")],
      env: {
        ...env,
        TODO_ELECTRON_VERIFY_HOST: "1",
        TODO_ELECTRON_VERIFY_BACKGROUND: "1",
        TODO_SERVER_URL: url,
        TODO_ELECTRON_DATA: join(scratch, "electron"),
      },
      timeout: 60000,
    });
    const page = await desktop.firstWindow();
    rendererPid = await desktop.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId() ?? 0,
    );
    const pane = page.locator(".task-pane");
    const field = page.getByRole("textbox", {
      name: "Search tasks",
      exact: true,
    });
    const showing = async () => {
      await expect(pane).toHaveAttribute("data-search-phase", "Showing");
      await expect(pane).toHaveAttribute("data-search-stale", "false");
    };
    await showing();
    await page
      .getByRole("button", { name: "Compact mode", exact: true })
      .click();
    for (const view of [
      "All tasks",
      "Today",
      "Overdue",
      "Scheduled",
      "Inbox",
    ]) {
      mark("start", `full-${view}`);
      await page
        .getByRole("button", { name: "Navigate tasks", exact: true })
        .click();
      await page
        .getByRole("menuitemradio", { name: new RegExp(`^${view}`) })
        .click();
      await showing();
      mark("end", `full-${view}`);
      for (let index = -1; index < 1; index++) {
        for (const action of [
          "text",
          "apply",
          "clear-filters",
          "clear-text",
          "failure",
          "retry",
        ]) {
          const name = `${index === -1 ? "warmup" : "query"}-${view}-${index}-${action}`;
          mark("start", name);
          let text = "refresh";
          if (action === "apply") {
            await page
              .getByRole("button", { name: "More filters", exact: true })
              .click();
            await page
              .getByLabel("Priority", { exact: true })
              .selectOption("P1");
            await page
              .getByRole("button", { name: "Apply filters", exact: true })
              .click();
          } else if (action === "clear-filters") {
            await page
              .getByRole("button", { name: "Clear filters", exact: true })
              .click();
          } else if (action === "retry") {
            await page
              .getByLabel("Search failed")
              .getByRole("button", { name: "Retry", exact: true })
              .click();
          } else {
            text =
              action === "clear-text"
                ? ""
                : action === "text"
                  ? "ref"
                  : "refresh";
            if (action === "failure") failNextList = true;
            await field.fill(text);
          }
          if (action === "failure") {
            await expect(pane).toHaveAttribute("data-search-phase", "Error");
            mark("end", "");
            continue;
          }
          await showing();
          const requested = await pane.getAttribute("data-requested-identity");
          assert.equal(
            await pane.getAttribute("data-applied-identity"),
            requested,
          );
          text = Schema.decodeUnknownSync(
            Schema.Struct({ text: Schema.String }),
          )(JSON.parse(requested ?? "{}")).text;
          const expected =
            view === "All tasks"
              ? [
                  "Refresh Inbox",
                  "Refresh Today",
                  "Refresh Overdue",
                  "Refresh Scheduled",
                ]
              : view === "Today"
                ? ["Refresh Overdue", "Refresh Today"]
                : view === "Overdue"
                  ? ["Refresh Overdue"]
                  : view === "Scheduled"
                    ? ["Refresh Today", "Refresh Scheduled"]
                    : ["Refresh Inbox"];
          assert.deepEqual(
            (await page.locator(".task-title").allTextContents()).sort(),
            expected.sort(),
          );
          assert.deepEqual(
            await page.locator(".task-title mark").allTextContents(),
            text ? expected.map(() => "Refresh") : [],
          );
          mark("end", "");
        }
      }
    }
    exit = 0;
  }
  assert.equal(
    samples.filter((value) => value.name.startsWith("query-")).length,
    surface === "swift" ? 25 : 30,
    "Measured work count",
  );
  assert.equal(
    samples.filter((value) => value.name.startsWith("warmup-")).length,
    surface === "swift" ? 25 : 30,
    "Warmup work count",
  );
  assert.equal(
    samples.filter((value) => value.name.startsWith("full-")).length,
    5,
    "Full-refresh work count",
  );
  if (process.env.TODO_REFRESH_EXPECT_MINIMAL === "1") {
    for (const sample of samples.filter(
      (value) =>
        value.name.startsWith("query-") && !value.name.endsWith("failure"),
    )) {
      const dataCalls = calls.filter(
        (call) => call.interval === sample.name && call.path !== "/health",
      );
      assert.equal(
        dataCalls.length,
        /^query-(all|All tasks)-/.test(sample.name) ? 1 : 2,
        sample.name,
      );
    }
  }
} catch (error) {
  exit = 1;
  throw error;
} finally {
  await Promise.all(profilers);
  restoreSwiftBundle?.();
  await desktop?.close();
  proxy.stop(true);
  const stopped = new Promise<void>((done) =>
    server.once("close", () => done()),
  );
  const timer = setTimeout(() => server.kill("SIGKILL"), 2000);
  server.kill("SIGTERM");
  await stopped;
  clearTimeout(timer);
  writeFileSync(join(evidence, "server.log"), log);
  const artifactNames =
    surface === "swift"
      ? [resolve(artifact)]
      : [
          "preload.cjs",
          "verification/write-host.mjs",
          ...readdirSync(join(resolve(artifact), "renderer"), {
            recursive: true,
            encoding: "utf8",
          })
            .filter((name) =>
              statSync(join(resolve(artifact), "renderer", name)).isFile(),
            )
            .map((name) => `renderer/${name}`),
        ];
  const artifactFiles = Object.fromEntries(
    artifactNames.sort().map((name) => [
      name,
      createHash("sha256")
        .update(
          readFileSync(
            surface === "swift" ? name : join(resolve(artifact), name),
          ),
        )
        .digest("hex"),
    ]),
  );
  writeFileSync(
    join(evidence, "measurement.json"),
    JSON.stringify(
      {
        exit,
        serverPid: server.pid,
        serverExit: server.exitCode,
        serverSignal: server.signalCode,
        serverStopped: server.exitCode !== null || server.signalCode !== null,
        surface,
        measurementHarnessHash:
          surface === "swift"
            ? createHash("sha256")
                .update(
                  readFileSync(
                    join(
                      root,
                      "apps/macos/StateTests/RefreshMeasurementTests.swift",
                    ),
                  ),
                )
                .digest("hex")
            : null,
        artifact: resolve(artifact),
        binaryProvenance: binaries,
        loadBefore,
        cores: availableParallelism(),
        profiling: process.env.TODO_REFRESH_PROFILE === "1",
        loadAfter: command("uptime", []),
        artifactFiles,
        profileReceipts,
        artifactHash: createHash("sha256")
          .update(JSON.stringify(artifactFiles))
          .digest("hex"),
        recorderHash: createHash("sha256")
          .update(readFileSync(import.meta.filename))
          .digest("hex"),
        delay,
        calls,
        samples,
      },
      null,
      2,
    ),
  );
  rmSync(scratch, { recursive: true });
}
