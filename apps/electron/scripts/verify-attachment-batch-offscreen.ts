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
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { TodoApi } from "@todo/api";
import { ProfileId } from "@todo/domain";
import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { build } from "vite";
import { localAttachmentStatus } from "../src/attachment-files.ts";
import { Reply, Request } from "../src/protocol.ts";
import { taskRequest } from "../src/task-client.ts";

const root = resolve(import.meta.dirname, "../../..");
const evidence = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2] && !existsSync(evidence));
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-cli01-electron-"));
const home = join(scratch, "home");
mkdirSync(home);
const binaries = JSON.parse(
  readFileSync(join(root, ".scratch/bin/build.json"), "utf8"),
);
const env = {
  ...process.env,
  HOME: home,
  TODO_DB: join(scratch, "todo.db"),
  TODO_PORT: "0",
};
const actions: unknown[] = [];
let server: ChildProcess | undefined;
let log = "";
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const cli = (...args: string[]) => {
  const result = spawnSync(
    binaries.cli,
    ["--profile", "work", "--format", "json", ...args],
    {
      env,
      input: "scratch verification passphrase\n",
      encoding: "utf8",
      timeout: 60000,
    },
  );
  actions.push({ args, exit: result.status, stdout: result.stdout });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
};
try {
  cli("init", "--password-stdin");
  cli("login", "--password-stdin");
  const source = cli(
    "add",
    "Reference",
    "--link",
    "t3-thread://v2/electron/thread",
    "--label",
    "thread",
  ).task;
  const a = cli("add", "Approve the release notes").task;
  const b = cli("add", "Confirm the import contract").task;
  for (const title of [
    "Review the attachment labels",
    "Review next week",
    "Plan the handoff",
  ])
    cli("add", title);
  server = spawn(binaries.server, [], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  writeFileSync(
    join(evidence, "server.json"),
    JSON.stringify({ pid: server.pid, binary: binaries.server, scratch }),
  );
  server.stdout?.on("data", (data) => {
    log += data.toString();
  });
  server.stderr?.on("data", (data) => {
    log += data.toString();
  });
  const deadline = Date.now() + 60000;
  while (!/Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(log)) {
    assert.ok(Date.now() < deadline && server.exitCode === null, log);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  const base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1];
  assert.ok(base);
  const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
    Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));
  let credential = "";
  const client = await run(
    HttpApiClient.make(TodoApi, {
      baseUrl: base,
      transformClient: (http) =>
        HttpClient.mapRequest(http, (request) =>
          HttpClientRequest.bearerToken(request, credential),
        ),
    }),
  );
  credential = (
    await run(
      client.signIn.signIn({
        payload: { passphrase: "scratch verification passphrase" },
      }),
    )
  ).credential;
  const sourceTask = await run(
    client.tasks.show({
      params: {
        profile: Schema.decodeUnknownSync(ProfileId)("work"),
        task: source.id,
      },
    }),
  );
  const bundle = await build({
    configFile: join(root, "apps/electron/vite.config.ts"),
    root: join(root, "apps/electron"),
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      cssCodeSplit: false,
      lib: {
        entry: join(import.meta.dirname, "attachment-batch-preview.tsx"),
        name: "CLI01",
        formats: ["iife"],
      },
    },
  });
  const output = Array.isArray(bundle) ? bundle[0] : bundle;
  assert.ok(output && "output" in output);
  const script = output.output.find((chunk) => chunk.type === "chunk");
  const styles = output.output
    .flatMap((asset) =>
      asset.type === "asset" && asset.fileName.endsWith(".css")
        ? [
            typeof asset.source === "string"
              ? asset.source
              : new TextDecoder().decode(asset.source),
          ]
        : [],
    )
    .join("\n");
  assert.ok(script && script.type === "chunk");
  browser = await chromium.launch({
    headless: true,
    ...(process.env.TODO_HEADLESS_CHROMIUM
      ? { executablePath: process.env.TODO_HEADLESS_CHROMIUM }
      : {}),
    env: { ...process.env, HOME: home },
    args: ["--password-store=basic"],
  });
  const page = await browser.newPage({ viewport: { width: 393, height: 426 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    writeFileSync(join(evidence, "page-errors.json"), JSON.stringify(errors));
  });
  await page.exposeFunction("request", async (raw: unknown) => {
    const request = Schema.decodeUnknownSync(Request)(raw);
    if (request._tag === "attachmentStatus")
      return {
        _tag: "attachmentStatus",
        ...localAttachmentStatus(request.attachment),
      };
    if (request._tag === "attachmentClipboard")
      return { _tag: "attachmentClipboard", hasImage: false };
    if (
      request._tag !== "attachmentTargets" &&
      request._tag !== "attachmentBatch"
    )
      throw new Error(`Unexpected request: ${request._tag}`);
    const reply = await run(taskRequest(client, request));
    actions.push({ request, reply });
    return Schema.decodeUnknownSync(Reply)(reply);
  });
  await page.setContent(
    `<html><head><style>${styles}</style></head><body><div id="root"></div></body></html>`,
  );
  await page.evaluate((task) => {
    window.cli01Task = task;
    window.desktop = {
      request: (request) => Reflect.get(window, "request")(request),
      filePath: () => "",
      subscribe: () => () => {},
    };
  }, sourceTask);
  await page.addScriptTag({ content: script.code });
  await page.waitForTimeout(300);
  writeFileSync(join(evidence, "initial.html"), await page.content());
  assert.deepEqual(errors, []);
  await page.getByRole("button", { name: "Attachment actions for v2" }).click();
  await page.getByRole("menuitem", { name: "Attach to Tasks…" }).click();
  await page
    .getByRole("checkbox", { name: `Select ${a.title}`, exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: `Select ${b.title}`, exact: true })
    .check();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("Ready to attach", { exact: true })).toHaveCount(
    2,
  );
  assert.equal(cli("show", a.id).task.row_version, 1);
  const capture = async (state: string) => {
    for (const compact of [true, false])
      for (const dark of [false, true]) {
        await page.setViewportSize({
          width: compact ? 393 : 1100,
          height: compact ? 426 : 720,
        });
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle("dark", dark),
          dark,
        );
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .map((animation) => animation.finished.catch(() => {})),
          );
        });
        await page
          .getByRole("region", { name: "Attachment target Tasks" })
          .evaluate((element) => {
            element.scrollTop = 0;
          });
        const bounds = await page.getByRole("dialog").boundingBox();
        assert.ok(
          bounds &&
            bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.y + bounds.height <= (compact ? 426 : 720),
        );
        const list = await page
          .getByRole("region", { name: "Attachment target Tasks" })
          .boundingBox();
        const footer = await page
          .locator(".attachment-batch-footer")
          .boundingBox();
        assert.ok(
          list && footer && list.y + list.height <= footer.y + 1,
          "Task list overlaps the footer",
        );
        const targets = await page
          .locator(".attachment-batch-footer button")
          .evaluateAll((buttons) =>
            buttons.map((button) => button.getBoundingClientRect().height),
          );
        assert.ok(
          targets.every((height) => height >= 32),
          "Footer targets must be at least 32px",
        );
        await page.screenshot({
          path: join(
            evidence,
            `${compact ? "compact" : "full"}-${state}-${dark ? "dark" : "light"}.png`,
          ),
        });
      }
  };
  await capture("preview");
  await page
    .getByRole("button", { name: "Attach to 2 Tasks", exact: true })
    .click();
  await expect(page.getByText("Attached", { exact: true })).toHaveCount(2);
  assert.equal(cli("show", a.id).task.row_version, 2);
  assert.equal(
    cli("show", b.id).task.attachments[0].url,
    "t3-thread://v2/electron/thread",
  );
  await capture("attached");
  await page
    .getByRole("button", { name: "Attach to 2 Tasks", exact: true })
    .click();
  await expect(
    page.getByText("Task changed. Read its current Version and retry.", {
      exact: true,
    }),
  ).toHaveCount(2);
  assert.equal(cli("show", a.id).task.row_version, 2);
  await capture("conflict");
  await page.getByRole("button", { name: "Reload Tasks", exact: true }).click();
  await expect(
    page.getByText("Task changed. Read its current Version and retry.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("Already attached", { exact: true })).toHaveCount(
    2,
  );
  await page
    .getByRole("textbox", { name: "Attachment label for selected Tasks" })
    .fill("Shared");
  await page
    .getByRole("checkbox", { name: "Select Reference", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Attach to 3 Tasks", exact: true })
    .click();
  await expect(page.getByText("Attached", { exact: true })).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Attach to 3 Tasks", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove attachment v2", exact: true }),
  ).toHaveCount(2);
  assert.equal(cli("show", source.id).task.row_version, 2);
  assert.deepEqual(errors, []);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        realHTTP: true,
        nativeAppLaunched: false,
        keychain: false,
        cases: [
          "menu",
          "many-targets",
          "preview",
          "apply",
          "conflict",
          "reload",
          "unchanged",
        ],
        binaries,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise<void>((resolve) =>
      server?.once("exit", () => resolve()),
    );
    server.kill("SIGTERM");
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    if (server.exitCode === null && server.signalCode === null)
      server.kill("SIGKILL");
    await exited;
  }
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  writeFileSync(join(evidence, "server.log"), log);
  rmSync(scratch, { recursive: true, force: true });
}
