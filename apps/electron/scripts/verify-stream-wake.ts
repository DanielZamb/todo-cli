import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { _electron, expect } from "@playwright/test";
import { hiddenHostOptions } from "./hidden-host.ts";

const scratch = process.argv[2];
const evidence = process.argv[3];
if (!scratch?.includes("todo-s01-verify-") || !evidence)
  throw new Error("Expected scratch host and evidence paths");
const env: NodeJS.ProcessEnv & {
  HOME: string;
  TODO_DB: string;
  TODO_PORT: string;
} = {
  ...process.env,
  HOME: join(scratch, "home"),
  TODO_DB: join(scratch, "scratch.db"),
  TODO_PORT: "0",
};
delete env.ELECTRON_RUN_AS_NODE;
mkdirSync(env.HOME, { recursive: true });
let log = "";
const server = spawn(join(scratch, "server"), [], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => {
  log += chunk;
});
server.stderr.on("data", (chunk) => {
  log += chunk;
});
let upstream = "";
let streamGate: ReturnType<typeof Promise.withResolvers<void>> | undefined;
let replyGate: ReturnType<typeof Promise.withResolvers<void>> | undefined;
let readGate: ReturnType<typeof Promise.withResolvers<void>> | undefined;
let readHeld = false;
let replyHeld = false;
let forwarded = 0;
const proxy = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const response = await fetch(upstream + url.pathname + url.search, {
      method: request.method,
      headers: request.headers,
      ...(request.method === "GET" ? {} : { body: await request.text() }),
    });
    if (request.method === "PATCH" && replyGate) {
      replyHeld = true;
      await replyGate.promise;
    }
    if (
      readGate &&
      request.method === "GET" &&
      url.pathname.endsWith("/tasks")
    ) {
      const gate = readGate;
      readGate = undefined;
      readHeld = true;
      const body = await response.arrayBuffer();
      await gate.promise;
      return new Response(body, {
        status: response.status,
        headers: response.headers,
      });
    }
    if (url.pathname.endsWith("/events") && response.body) {
      const reader = response.body.getReader();
      return new Response(
        new ReadableStream({
          async pull(controller) {
            try {
              const chunk = await reader.read();
              if (chunk.done) {
                controller.close();
                return;
              }
              if (streamGate) await streamGate.promise;
              if (
                new TextDecoder()
                  .decode(chunk.value)
                  .includes("event: operation")
              )
                forwarded++;
              controller.enqueue(chunk.value);
            } catch (error) {
              controller.error(error);
            }
          },
          cancel() {
            return reader.cancel();
          },
        }),
        { headers: response.headers },
      );
    }
    return response;
  },
});
let desktop: Awaited<ReturnType<typeof _electron.launch>> | undefined;
const receipts: unknown[] = [];
try {
  await expect
    .poll(() => log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1], {
      timeout: 60000,
    })
    .toBeTruthy();
  upstream = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
  const signIn = await fetch(`${upstream}/auth/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase: "scratch verification passphrase" }),
  });
  const session: { credential: string } = await signIn.json();
  const api = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(upstream + path, {
      method,
      headers: {
        Authorization: `Bearer ${session.credential}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    expect(response.status).toBe(200);
    return response.json();
  };
  desktop = await _electron.launch(
    hiddenHostOptions({
      env: {
        ...env,
        TODO_SERVER_URL: `http://127.0.0.1:${proxy.port}`,
        TODO_ELECTRON_DATA: join(scratch, "electron"),
      },
      timeout: 60000,
    }),
  );
  const page = await desktop.firstWindow();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  for (const order of ["reply-first", "stream-first", "refresh-in-flight"]) {
    const original = `Before ${order}`;
    const title = `Saved ${order}`;
    const task: { id: string } = await api("/profiles/work/tasks", "POST", {
      title: original,
    });
    await expect(page.getByText(original, { exact: true })).toBeVisible();
    await page.getByText(original, { exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      original,
    );
    await page.getByLabel("Title", { exact: true }).fill(title);
    const oldForwarded = forwarded;
    const gate = Promise.withResolvers<void>();
    if (order === "stream-first") replyGate = gate;
    else streamGate = gate;
    const heldRead = Promise.withResolvers<void>();
    if (order === "refresh-in-flight") readGate = heldRead;
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    if (order === "stream-first") {
      await expect.poll(() => replyHeld).toBe(true);
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeDisabled();
      gate.resolve();
      replyGate = undefined;
    } else if (order === "refresh-in-flight") {
      await expect.poll(() => readHeld).toBe(true);
      streamGate = undefined;
      gate.resolve();
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      heldRead.resolve();
    } else {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      expect(forwarded).toBe(oldForwarded);
      streamGate = undefined;
      gate.resolve();
    }
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeEnabled();
    await expect.poll(() => forwarded).toBeGreaterThan(oldForwarded);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
    const saved: { title: string; row_version: number } = await api(
      `/profiles/work/tasks/${task.id}`,
    );
    expect([saved.title, saved.row_version]).toEqual([title, 2]);
    receipts.push({ order, title, version: saved.row_version, correct: true });
  }
  await page.screenshot({ path: join(evidence, "tasks.png") });
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      { passed: true, mode: "THIN_PASS_NATIVE_BLOCKED", receipts },
      null,
      2,
    ),
  );
} finally {
  streamGate?.resolve();
  replyGate?.resolve();
  readGate?.resolve();
  await desktop?.close();
  proxy.stop(true);
  if (server.exitCode === null) {
    const stopped = new Promise<void>((resolve) =>
      server.once("exit", () => resolve()),
    );
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 2000);
    await stopped;
    clearTimeout(timer);
  }
  writeFileSync(join(evidence, "server.log"), log);
}
