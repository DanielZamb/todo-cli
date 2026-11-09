import assert from "node:assert/strict";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication } from "@playwright/test";
import type {} from "../src/protocol.ts";

const root = process.cwd();
const evidence = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2] && !existsSync(evidence));
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-s01-verify-unauthorized-"));
const env: NodeJS.ProcessEnv & {
  HOME: string;
  TODO_DB: string;
  TODO_PORT: string;
  TODO_ELECTRON_DATA: string;
} = {
  ...process.env,
  HOME: join(scratch, "home"),
  TODO_DB: join(scratch, "todo.db"),
  TODO_PORT: "0",
  TODO_ELECTRON_VERIFY_HOST: "1",
  TODO_ELECTRON_VERIFY_BACKGROUND: "1",
  TODO_ELECTRON_DATA: join(scratch, "electron"),
};
delete env.ELECTRON_RUN_AS_NODE;
mkdirSync(env.HOME);
const binaries = JSON.parse(
  readFileSync(join(root, ".scratch/bin/build.json"), "utf8"),
);
const receipts: unknown[] = [];
let server: ChildProcess | undefined;
let desktop: ElectronApplication | undefined;
let log = "";
let upstream = "";
const credentials = new Map<string, string>();
let newestCredential = "";
const gate = {
  armed: false,
  reached: Promise.withResolvers<void>(),
  forward: Promise.withResolvers<void>(),
  response: Promise.withResolvers<void>(),
  release: Promise.withResolvers<void>(),
  status: 0,
  credential: "",
};
const proxy = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const authorization =
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const held =
      gate.armed &&
      url.pathname === "/tasks/lookup" &&
      url.searchParams.get("prefix") === "a";
    if (held) {
      gate.armed = false;
      gate.credential = credentials.get(authorization) ?? "unknown";
      gate.reached.resolve();
      await gate.forward.promise;
    }
    const response = await fetch(upstream + url.pathname + url.search, {
      method: request.method,
      headers: request.headers,
      ...(request.method === "GET" ? {} : { body: await request.text() }),
    });
    if (url.pathname.endsWith("/events"))
      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    const body = await response.text();
    if (url.pathname === "/auth/sessions" && response.ok) {
      const parsed = JSON.parse(body);
      newestCredential = parsed.credential;
      credentials.set(
        newestCredential,
        String.fromCharCode(65 + credentials.size),
      );
    }
    receipts.push({
      path: url.pathname,
      method: request.method,
      credential: credentials.get(authorization) ?? "none",
      status: response.status,
      ...(held ? { held: true } : {}),
    });
    if (held) {
      gate.status = response.status;
      gate.response.resolve();
      await gate.release.promise;
    }
    return new Response(body || null, {
      status: response.status,
      headers: response.headers,
    });
  },
});
const wait = async (condition: () => boolean, message: string) => {
  const deadline = Date.now() + 60000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, message);
    await new Promise((done) => setTimeout(done, 25));
  }
};
try {
  for (const command of ["init", "login"]) {
    const result = spawnSync(
      binaries.cli,
      ["--profile", "work", "--format", "json", command, "--password-stdin"],
      {
        env,
        encoding: "utf8",
        input: "scratch verification passphrase\n",
        timeout: 60000,
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    receipts.push({ cli: command, exit: result.status });
  }
  server = spawn(binaries.server, [], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (data) => {
    log += data.toString();
  });
  server.stderr?.on("data", (data) => {
    log += data.toString();
  });
  writeFileSync(
    join(evidence, "server.json"),
    JSON.stringify({ pid: server.pid, scratch, binary: binaries.server }),
  );
  await wait(() => /Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(log), log);
  upstream = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1] ?? "";
  desktop = await _electron.launch({
    executablePath: createRequire(join(root, "apps/electron/package.json"))(
      "electron",
    ),
    args: [join(root, "apps/electron/dist/verification/write-host.mjs")],
    env: { ...env, TODO_SERVER_URL: `http://127.0.0.1:${proxy.port}` },
    timeout: 60000,
  });
  writeFileSync(
    join(evidence, "host.json"),
    JSON.stringify({
      pid: desktop.process().pid,
      signed: false,
      background: true,
      safeStorage: false,
    }),
  );
  const page = await desktop.firstWindow();
  await page.waitForFunction(() => Boolean(window.desktop));
  await page.evaluate(() => {
    const notices: unknown[] = [];
    Reflect.set(window, "unauthorizedNotices", notices);
    window.desktop.subscribe((notice) => {
      if (notice._tag === "signedIn" || notice._tag === "signedOut")
        notices.push(notice._tag);
    });
  });
  const initial = await page.evaluate(() =>
    window.desktop.request({ _tag: "restore" }),
  );
  assert.equal(initial._tag, "signedIn");
  assert.equal(credentials.get(newestCredential), "A");
  gate.armed = true;
  await page.evaluate(() => {
    Reflect.set(
      window,
      "unauthorizedPending",
      window.desktop.request({ _tag: "lookup", prefix: "a" }),
    );
  });
  await gate.reached.promise;
  const signedOut = await page.evaluate(() =>
    window.desktop.request({ _tag: "signOut" }),
  );
  assert.equal(signedOut._tag, "signedOut");
  gate.forward.resolve();
  await gate.response.promise;
  assert.equal(gate.status, 401);
  assert.equal(gate.credential, "A");
  const signedInB = await page.evaluate(() =>
    window.desktop.request({
      _tag: "signIn",
      passphrase: "scratch verification passphrase",
    }),
  );
  assert.equal(signedInB._tag, "signedIn");
  assert.equal(credentials.get(newestCredential), "B");
  const before = await page.evaluate(() =>
    Reflect.get(window, "unauthorizedNotices"),
  );
  gate.release.resolve();
  const obsolete = await page.evaluate(() =>
    Reflect.get(window, "unauthorizedPending"),
  );
  const restoredB = await page.evaluate(() =>
    window.desktop.request({ _tag: "restore" }),
  );
  const after = await page.evaluate(() =>
    Reflect.get(window, "unauthorizedNotices"),
  );
  const replacement = {
    oldCredential: gate.credential,
    delayedStatus: gate.status,
    replacementCredential: "B",
    reply: obsolete._tag,
    restore: restoredB._tag,
    beforeNotices: before,
    afterNotices: after,
  };
  receipts.push({ replacement });
  const beforeControl = await page.evaluate(
    () => Reflect.get(window, "unauthorizedNotices").length,
  );
  await page.evaluate(() =>
    window.desktop.request({
      _tag: "signIn",
      passphrase: "scratch verification passphrase",
    }),
  );
  const currentLabel = credentials.get(newestCredential);
  const revoke = await fetch(upstream + "/auth/session", {
    method: "DELETE",
    headers: { authorization: `Bearer ${newestCredential}` },
  });
  assert.equal(revoke.status, 204);
  const current = await page.evaluate(() =>
    window.desktop.request({ _tag: "lookup", prefix: "b" }),
  );
  const restoredCurrent = await page.evaluate(() =>
    window.desktop.request({ _tag: "restore" }),
  );
  const currentNotices = await page.evaluate(() =>
    Reflect.get(window, "unauthorizedNotices"),
  );
  const control = {
    currentCredential: currentLabel,
    reply: current._tag,
    restore: restoredCurrent._tag,
    notices: currentNotices.slice(beforeControl),
  };
  receipts.push({ control });
  const expected = {
    replacement: {
      oldCredential: "A",
      delayedStatus: 401,
      replacementCredential: "B",
      reply: "error",
      restore: "signedIn",
      beforeNotices: ["signedOut", "signedIn"],
      afterNotices: ["signedOut", "signedIn"],
    },
    control: {
      currentCredential: "C",
      reply: "signedOut",
      restore: "signedOut",
      notices: ["signedIn", "signedOut"],
    },
  };
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        observed: { replacement, control },
        expected,
        binaries,
        sourceHead: spawnSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).stdout.trim(),
        nativeTodoLaunched: false,
        keychain: false,
      },
      null,
      2,
    ),
  );
  assert.deepEqual({ replacement, control }, expected);
} finally {
  gate.forward.resolve();
  gate.release.resolve();
  await desktop?.close();
  proxy.stop(true);
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise<void>((done) =>
      server?.once("exit", () => done()),
    );
    server.kill("SIGTERM");
    await Promise.race([exited, new Promise((done) => setTimeout(done, 2000))]);
    if (server.exitCode === null && server.signalCode === null)
      server.kill("SIGKILL");
    await exited;
  }
  writeFileSync(
    join(evidence, "receipts.json"),
    JSON.stringify(receipts, null, 2),
  );
  writeFileSync(join(evidence, "server.log"), log);
  rmSync(scratch, { recursive: true, force: true });
}
