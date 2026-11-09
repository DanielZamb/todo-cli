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
import type { ImportReport } from "@todo/domain";
import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { build } from "vite";
import { errorReply } from "../src/error-reply.ts";
import { Reply, Request } from "../src/protocol.ts";
import { taskRequest } from "../src/task-client.ts";
import { verifyDiscoveryReportErrors } from "./verify-discovery-report-errors.ts";

const root = resolve(import.meta.dirname, "../../..");
const evidence = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2] && !existsSync(evidence));
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-discovery-c-"));
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
const captures: string[] = [];
const replies: Reply[] = [];
let importFixture: ImportReport | null = null;
let server: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let log = "";
const cli = (profile: string, ...args: string[]) => {
  const result = spawnSync(
    binaries.cli,
    ["--profile", profile, "--format", "json", ...args],
    {
      env,
      input: "scratch verification passphrase\n",
      encoding: "utf8",
      timeout: 60000,
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  actions.push({ cli: args, profile, exit: result.status });
  return JSON.parse(result.stdout);
};
try {
  cli("work", "init", "--password-stdin");
  cli("work", "login", "--password-stdin");
  cli("personal", "login", "--password-stdin");
  cli("empty", "login", "--password-stdin");
  const draftTask = cli("work", "add", "Preserve this draft").task;
  const done = cli(
    "personal",
    "add",
    "Completed discovery Task",
    "--project",
    "Archive",
  ).task;
  cli(
    "personal",
    "done",
    done.id,
    "--expected-version",
    String(done.row_version),
  );
  cli("work", "add", "Directory Project Task", "--project", "ARG");
  server = spawn(binaries.server, [], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  writeFileSync(
    join(evidence, "server.json"),
    JSON.stringify({ pid: server.pid, scratch, binary: binaries.server }),
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
    await new Promise((done) => setTimeout(done, 40));
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
  const bundle = await build({
    configFile: join(root, "apps/electron/vite.config.ts"),
    root: join(root, "apps/electron"),
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      cssCodeSplit: false,
      lib: {
        entry: join(
          process.env.TODO_DISCOVERY_RENDERER_ROOT ??
            join(root, "apps/electron"),
          "src/renderer.tsx",
        ),
        name: "DiscoveryApp",
        formats: ["iife"],
      },
    },
  });
  const output = Array.isArray(bundle) ? bundle[0] : bundle;
  assert.ok(output && "output" in output);
  const script = output.output.find((item) => item.type === "chunk");
  assert.ok(script && script.type === "chunk");
  const styles = output.output
    .flatMap((item) =>
      item.type === "asset" && item.fileName.endsWith(".css")
        ? [
            typeof item.source === "string"
              ? item.source
              : new TextDecoder().decode(item.source),
          ]
        : [],
    )
    .join("\n");
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
  page.on("pageerror", (error) => errors.push(error.message));
  let delayTag = "";
  let release: (() => void) | undefined;
  let failTag = "";
  let emptyDirectory = false;
  let clipboard = "";
  await page.exposeFunction(
    "discoveryRequest",
    async (raw: unknown): Promise<Reply> => {
      const request = Schema.decodeUnknownSync(Request)(raw);
      actions.push({ request });
      if (request._tag === "importTasks" && importFixture) {
        const reply: Reply = { _tag: "importReport", report: importFixture };
        replies.push(reply);
        return reply;
      }
      if (request._tag === delayTag) {
        delayTag = "";
        await new Promise<void>((done) => {
          release = done;
        });
      }
      if (request._tag === failTag) {
        failTag = "";
        return errorReply({
          message: "Scratch discovery read failed.",
          exit_code: 1,
          exit_meaning: "runtime failure",
        });
      }
      switch (request._tag) {
        case "restore":
          return {
            _tag: "signedIn",
            profiles: await run(client.reads.profiles({ query: {} })),
          };
        case "windowMode":
          return { _tag: "windowMode", compact: true };
        case "setWindowMode":
          return { _tag: "windowMode", compact: request.compact };
        case "watch":
          await page.evaluate(
            (profile) =>
              window.dispatchEvent(
                new CustomEvent("discovery-notice", {
                  detail: { _tag: "connection", profile, state: "connected" },
                }),
              ),
            request.profile,
          );
          return { _tag: "ok" };
        case "draft":
          return { _tag: "ok" };
        case "copyTaskId":
          clipboard = request.task;
          return { _tag: "ok" };
        case "directory":
          if (emptyDirectory) return { _tag: "directory", profiles: [] };
          break;
        case "signIn":
        case "signOut":
        case "openDiagnostics":
        case "snapshotReveal":
        case "attachmentClipboard":
        case "pickAttachment":
        case "pasteAttachment":
        case "attachmentStatus":
        case "openAttachment":
          return { _tag: "ok" };
      }
      try {
        const reply = Schema.decodeUnknownSync(Reply)(
          await run(taskRequest(client, request)),
        );
        replies.push(reply);
        return reply;
      } catch (error) {
        return errorReply(error);
      }
    },
  );
  await page.route("http://127.0.0.1/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><head><style>${styles}</style></head><body><div id="root"></div></body></html>`,
    }),
  );
  await page.goto("http://127.0.0.1/");
  await page.evaluate(() => {
    window.desktop = {
      request: (request) => Reflect.get(window, "discoveryRequest")(request),
      filePath: () => "",
      subscribe: (listener) => {
        const handler = (event: Event) => {
          if (event instanceof CustomEvent) listener(event.detail);
        };
        window.addEventListener("discovery-notice", handler);
        return () => window.removeEventListener("discovery-notice", handler);
      },
    };
  });
  await page.addScriptTag({ content: script.code });
  const notify = async (detail: unknown) =>
    page.evaluate(
      (detail) =>
        window.dispatchEvent(new CustomEvent("discovery-notice", { detail })),
      detail,
    );
  await expect(
    page.getByRole("button", { name: "Navigate tasks", exact: true }),
  ).toBeVisible();
  const capture = async (state: string, dialog = true) => {
    for (const compact of [true, false])
      for (const dark of [false, true]) {
        await page.setViewportSize({
          width: compact ? 393 : 1100,
          height: compact ? 426 : 720,
        });
        await notify({ _tag: "windowMode", compact });
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle("dark", dark),
          dark,
        );
        await page.waitForTimeout(130);
        if (dialog) {
          const bounds = await page
            .locator(".discovery-dialog")
            .evaluate((dialog) => {
              const box = dialog.getBoundingClientRect();
              return {
                left: box.left,
                right: box.right,
                top: box.top,
                bottom: box.bottom,
                width: innerWidth,
                height: innerHeight,
                overflow: dialog.scrollWidth > dialog.clientWidth,
              };
            });
          assert.ok(
            bounds.left >= 0 &&
              bounds.right <= bounds.width &&
              bounds.top >= 0 &&
              bounds.bottom <= bounds.height &&
              !bounds.overflow,
            JSON.stringify(bounds),
          );
        }
        const path = join(
          evidence,
          `${state}-${compact ? "compact" : "full"}-${dark ? "dark" : "light"}.png`,
        );
        await page.screenshot({ path });
        captures.push(path);
      }
    await page.setViewportSize({ width: 393, height: 426 });
    await notify({ _tag: "windowMode", compact: true });
  };
  const open = async (name: string) => {
    await page
      .getByRole("button", { name: "Navigate tasks", exact: true })
      .click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };
  const close = async () => {
    await page.getByTestId("discovery-close").click();
    await expect(page.locator(".discovery-dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Navigate tasks", exact: true }),
    ).toBeFocused();
  };
  if (process.env.TODO_VERIFY_REPORT_ERRORS === "1") {
    await verifyDiscoveryReportErrors({
      page,
      cli,
      notify,
      replies,
      evidence,
      lookupRequestCount: () =>
        actions.filter(
          (item) =>
            item &&
            typeof item === "object" &&
            "request" in item &&
            item.request &&
            typeof item.request === "object" &&
            "_tag" in item.request &&
            item.request._tag === "lookup",
        ).length,
      setImportFixture: (report) => {
        importFixture = report;
      },
    });
  } else {
    delayTag = "directory";
    await open("Profiles and Projects");
    await expect(
      page.getByText("Loading Profiles and Projects…"),
    ).toBeVisible();
    await capture("directory-loading");
    release?.();
    await expect(page.getByTestId("discovery-directory-list")).toContainText(
      "ARG",
    );
    await expect(page.getByTestId("discovery-directory-list")).toContainText(
      "No Projects",
    );
    await expect(page.getByTestId("discovery-directory-list")).toContainText(
      "empty",
    );
    await expect(page.getByTestId("discovery-directory-list")).toContainText(
      (
        await run(
          client.reads.profiles({ query: { include_projects: "true" } }),
        )
      ).find((profile) => profile.id === "personal")?.projects?.[0]?.id ??
        "missing Project",
    );
    await capture("directory-showing");
    await close();
    emptyDirectory = true;
    await open("Profiles and Projects");
    await expect(page.getByText("No Profiles", { exact: true })).toBeVisible();
    await capture("directory-empty-controlled");
    await close();
    emptyDirectory = false;
    failTag = "directory";
    await open("Profiles and Projects");
    await expect(page.getByTestId("discovery-error")).toContainText(
      "error 1 - runtime failure",
    );
    await capture("directory-error");
    await page.getByTestId("discovery-directory-retry").click();
    await expect(page.getByTestId("discovery-directory-list")).toBeVisible();
    await notify({ _tag: "connection", profile: "work", state: "offline" });
    await expect(page.getByTestId("discovery-error")).toContainText("offline");
    await capture("directory-offline");
    await notify({ _tag: "connection", profile: "work", state: "connected" });
    await close();
    await open("Find Task by id");
    await capture("lookup-editing");
    const count = actions.length;
    await page.getByTestId("discovery-prefix").fill("not hex");
    await page.getByTestId("discovery-find").click();
    await expect(
      page.getByText(
        "Use 1 to 36 hexadecimal digits or hyphens. Spaces are not allowed.",
      ),
    ).toBeVisible();
    assert.equal(actions.length, count);
    await capture("lookup-invalid");
    await page
      .getByTestId("discovery-prefix")
      .fill("000000000000000000000000000000000000");
    await page.getByTestId("discovery-prefix").press("Enter");
    await expect(
      page.getByText("No matching Tasks", { exact: true }),
    ).toBeVisible();
    await capture("lookup-empty");
    await page.getByTestId("discovery-prefix").fill(done.id.slice(0, 8));
    delayTag = "lookup";
    await page.getByTestId("discovery-find").click();
    await expect(page.getByText("Finding Tasks…")).toBeVisible();
    await capture("lookup-requesting");
    release?.();
    await expect(page.getByTestId(`discovery-show-${done.id}`)).toBeVisible();
    await capture("lookup-showing");
    const idStyles = async () =>
      page
        .locator(".task-id-copy")
        .last()
        .evaluate((element) => {
          const code = element.querySelector("code");
          const button = element.querySelector("button");
          if (!code || !button) throw new Error("Expected id and Copy");
          const style = getComputedStyle(code);
          const rect = button.getBoundingClientRect();
          return {
            codeClass: code.className,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            color: style.color,
            copyWidth: rect.width,
            copyHeight: rect.height,
          };
        });
    const lookupIdStyles = await idStyles();
    await page
      .locator(".task-id-copy")
      .last()
      .screenshot({ path: join(evidence, "u1-lookup-id-copy-crop.png") });
    await page.getByTestId(`discovery-copy-${done.id}`).click();
    await expect(page.getByText("Copied", { exact: true })).toBeVisible();
    assert.equal(clipboard, done.id);
    await capture("lookup-copied");
    await page.getByTestId("discovery-prefix").fill("b");
    failTag = "lookup";
    await page.getByTestId("discovery-find").click();
    await expect(page.getByTestId("discovery-error")).toBeVisible();
    await capture("lookup-error");
    await notify({ _tag: "connection", profile: "work", state: "offline" });
    await capture("lookup-offline");
    await notify({ _tag: "connection", profile: "work", state: "connected" });
    await close();
    const listRequests = () =>
      actions.filter(
        (item) =>
          item &&
          typeof item === "object" &&
          "request" in item &&
          item.request &&
          typeof item.request === "object" &&
          "_tag" in item.request &&
          item.request._tag === "list",
      ).length;
    const beforeSameProfile = listRequests();
    await open("Find Task by id");
    await page.getByTestId("discovery-prefix").fill(draftTask.id);
    await page.getByTestId("discovery-find").click();
    await page.getByTestId(`discovery-show-${draftTask.id}`).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      draftTask.title,
    );
    await page.waitForTimeout(350);
    writeFileSync(
      join(evidence, "same-profile-show.json"),
      JSON.stringify(
        {
          beforeListRequests: beforeSameProfile,
          afterListRequests: listRequests(),
          requestedIdentity: await page
            .locator(".task-pane")
            .getAttribute("data-requested-identity"),
          appliedIdentity: await page
            .locator(".task-pane")
            .getAttribute("data-applied-identity"),
          stale: await page
            .locator(".task-pane")
            .getAttribute("data-search-stale"),
        },
        null,
        2,
      ),
    );
    await expect.poll(listRequests).toBeGreaterThan(beforeSameProfile);
    await expect(page.locator(".task-pane")).toHaveAttribute(
      "data-search-stale",
      "false",
    );
    const sameProfileIdentity = JSON.parse(
      (await page
        .locator(".task-pane")
        .getAttribute("data-applied-identity")) ?? "null",
    );
    assert.equal(sameProfileIdentity.filters.prefix, draftTask.id);
    await expect(
      page.getByText("Applying filters…", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator(".task-title").filter({ hasText: draftTask.title }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Back to tasks", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Navigate tasks", exact: true })
      .click();
    await page.getByRole("menuitemradio", { name: /^Inbox/ }).click();
    await page.getByText(draftTask.title, { exact: true }).click();
    await page
      .getByLabel("Title", { exact: true })
      .fill("Unsaved draft protected");
    await page
      .getByRole("button", { name: "Back to tasks", exact: true })
      .click();
    await open("Find Task by id");
    await page.getByTestId("discovery-prefix").fill(done.id);
    await page.getByTestId("discovery-find").click();
    await page.getByTestId(`discovery-show-${done.id}`).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "Completed discovery Task",
    );
    await expect(
      page.locator('button[aria-label="Profile"]').last(),
    ).toHaveAttribute("data-profile-id", "personal");
    await expect(page.locator(".task-pane")).toHaveAttribute(
      "data-search-stale",
      "false",
    );
    const applied = JSON.parse(
      (await page
        .locator(".task-pane")
        .getAttribute("data-applied-identity")) ?? "null",
    );
    assert.ok(JSON.stringify(applied).includes(done.id));
    assert.ok(JSON.stringify(applied).includes("tasks"));
    assert.equal(cli("personal", "show", done.id).task.status, "done");
    const detailIdStyles = await idStyles();
    assert.deepEqual(lookupIdStyles, detailIdStyles);
    assert.equal(detailIdStyles.copyWidth, detailIdStyles.copyHeight);
    await page
      .locator(".task-id-copy")
      .last()
      .screenshot({ path: join(evidence, "u1-detail-id-copy-crop.png") });
    writeFileSync(
      join(evidence, "u1-id-style-parity.json"),
      JSON.stringify({ lookupIdStyles, detailIdStyles }, null, 2),
    );
    const drafts = await page.evaluate(() => Object.values(localStorage));
    assert.ok(
      drafts.some((value) => value.includes("Unsaved draft protected")),
    );
    await page.screenshot({
      path: join(evidence, "show-done-from-inbox-draft-preserved.png"),
    });
    await page
      .getByRole("button", { name: "Back to tasks", exact: true })
      .click();
    await page.reload();
    await page.evaluate(() => {
      window.desktop = {
        request: (request) => Reflect.get(window, "discoveryRequest")(request),
        filePath: () => "",
        subscribe: (listener) => {
          const handler = (event: Event) => {
            if (event instanceof CustomEvent) listener(event.detail);
          };
          window.addEventListener("discovery-notice", handler);
          return () => window.removeEventListener("discovery-notice", handler);
        },
      };
    });
    await page.addScriptTag({ content: script.code });
    await expect(
      page.getByRole("button", { name: "Navigate tasks", exact: true }),
    ).toBeVisible();
    await open("Find Task by id");
    await page.getByTestId("discovery-prefix").fill(done.id);
    delayTag = "lookup";
    await page.getByTestId("discovery-find").click();
    await expect(page.getByText("Finding Tasks…")).toBeVisible();
    await page.getByTestId("discovery-prefix").fill("b");
    await page.getByTestId("discovery-prefix").fill(done.id);
    release?.();
    await expect(page.locator(".discovery-dialog")).toHaveAttribute(
      "data-discovery-state",
      "Editing",
    );
    await expect(page.getByTestId("discovery-results")).toHaveCount(0);
    delayTag = "lookup";
    await page.getByTestId("discovery-find").click();
    await expect(page.getByText("Finding Tasks…")).toBeVisible();
    await notify({ _tag: "signedIn" });
    await expect(page.locator(".discovery-dialog")).toHaveCount(0);
    release?.();
    await open("Find Task by id");
    await page.getByTestId("discovery-prefix").fill(done.id);
    await page.getByTestId("discovery-find").click();
    await expect(page.getByTestId(`discovery-show-${done.id}`)).toBeVisible();
    cli("personal", "rm", done.id, "--expected-version", "2");
    await page.getByTestId(`discovery-show-${done.id}`).click();
    const missing = page.getByTestId("task-lookup-status");
    await expect(missing).toContainText("Task not found in personal.");
    await expect(missing).toContainText("error 3 - not found or auth missing");
    await expect(missing).not.toContainText("/profiles/");
    await expect(missing).not.toContainText("todo ");
    await capture("show-missing-context", false);
    const lookupRequests = () =>
      actions.filter(
        (item) =>
          item &&
          typeof item === "object" &&
          "request" in item &&
          item.request &&
          typeof item.request === "object" &&
          "_tag" in item.request &&
          item.request._tag === "lookup",
      ).length;
    const beforePrefill = lookupRequests();
    await missing
      .getByRole("button", { name: "Find Task by id", exact: true })
      .click();
    await expect(page.getByTestId("discovery-prefix")).toHaveValue(done.id);
    assert.equal(lookupRequests(), beforePrefill);
    await capture("lookup-prefilled-missing");
    await page.getByTestId("discovery-find").click();
    await expect(
      page.getByText("No matching Tasks", { exact: true }),
    ).toBeVisible();
    await page.getByTestId("discovery-close").click();
    await page.setViewportSize({ width: 1100, height: 720 });
    await notify({ _tag: "windowMode", compact: false });
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page
      .locator('[role="menuitemradio"][data-profile-id="work"]')
      .click();
    await page.getByText(draftTask.title, { exact: true }).click();
    await page
      .getByLabel("Title", { exact: true })
      .fill("Keep the missing Task draft");
    cli("work", "rm", draftTask.id, "--expected-version", "1");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(missing).toContainText("Task not found in work.");
    await expect(missing).toContainText("error 3 - not found or auth missing");
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "Keep the missing Task draft",
    );
    await capture("editor-missing-context", false);
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        realHTTP: true,
        productionRenderer: true,
        nativeAppLaunched: false,
        keychain: false,
        clipboard: "existing IPC action bridged in memory",
        controlledStates: [
          "directory-empty",
          "network delays and runtime failure",
        ],
        rendererRoot:
          process.env.TODO_DISCOVERY_RENDERER_ROOT ??
          "production current checkout",
        reportErrorMode: process.env.TODO_VERIFY_REPORT_ERRORS === "1",
        cases:
          process.env.TODO_VERIFY_REPORT_ERRORS === "1"
            ? [
                "real stale batch/Attachment/import previews",
                "single attachMany detail preservation",
                "explicit typed import not-found fixture",
                "prefilled explicit Find recovery",
              ]
            : [
                "Compact navigation",
                "explicit submit and invalid no request",
                "directory metadata",
                "Copy feedback",
                "Show done from Inbox",
                "draft preserved",
                "reload",
                "production prefix ABA and credential notice invalidation",
                "real missing Task contextual exit pair",
              ],
        captures,
        binaries,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
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
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  writeFileSync(join(evidence, "server.log"), log);
  rmSync(scratch, { recursive: true, force: true });
}
