import assert from "node:assert/strict";
import {
  type ChildProcess,
  execFileSync,
  spawn,
  spawnSync,
} from "node:child_process";
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
import { ProfileId } from "@todo/domain";
import { Effect, Schema } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";
import { build } from "vite";
import { errorReply, exitDetail } from "../src/error-reply.ts";
import { taskHttpClient } from "../src/http-client.ts";
import { Reply, Request } from "../src/protocol.ts";
import { taskRequest } from "../src/task-client.ts";
import { buildGraphBrowser } from "./build-graph-browser.ts";
import { writeDagCaptureManifest } from "./dag-capture-manifest.ts";
import { settleRenderer } from "./settle-renderer.ts";

const root = resolve(import.meta.dirname, "../../..");
const evidence = resolve(process.argv[2] ?? "");
assert.ok(
  process.argv[2] && !existsSync(evidence),
  "Choose a fresh evidence directory",
);
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-dag-e-"));
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
let server: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let log = "";
const actions: unknown[] = [];
const manifest: { png: string; receipt: string; [key: string]: unknown }[] = [];
const cli = (...args: string[]) => {
  const result = spawnSync(
    binaries.cli,
    ["--profile", "work", "--format", "json", ...args],
    {
      env,
      encoding: "utf8",
      input: "scratch verification passphrase\n",
      timeout: 60000,
    },
  );
  actions.push({ cli: args, exit: result.status });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
};
try {
  cli("init", "--password-stdin");
  cli("login", "--password-stdin");
  const blocker = cli(
    "add",
    "Confirm the API contract",
    "--priority",
    "P4",
  ).task;
  const blocked = cli(
    "add",
    "Ship the client",
    "--priority",
    "P1",
    "--depends-on",
    blocker.id,
  ).task;
  const resolved = cli(
    "add",
    "Cancelled prerequisite",
    "--priority",
    "P4",
  ).task;
  cli("cancel", resolved.id, "--expected-version", "1");
  const ready = cli(
    "add",
    "Prepare release notes",
    "--priority",
    "P1",
    "--depends-on",
    resolved.id,
  ).task;
  const done = cli("add", "Resolved checklist", "--priority", "P4").task;
  cli("done", done.id, "--expected-version", "1");
  const untouched = cli(
    "add",
    "Independent Task without Dependencies",
    "--priority",
    "P4",
  ).task;
  const plain = cli("add", "Review tomorrow", "--priority", "P1").task;
  server = spawn(binaries.server, [], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  writeFileSync(
    join(evidence, "server.json"),
    JSON.stringify({ pid: server.pid, scratch, binaries }),
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
  let credential: string | undefined;
  const client = await run(taskHttpClient(base, () => credential));
  credential = (
    await run(
      client.signIn.signIn({
        payload: { passphrase: "scratch verification passphrase" },
      }),
    )
  ).credential;
  execFileSync("sh", [join(root, "scripts/disk-guard.sh")], {
    stdio: "inherit",
  });
  const bundle = await build({
    configFile: join(root, "apps/electron/vite.config.ts"),
    root: join(root, "apps/electron"),
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      cssCodeSplit: false,
      lib: {
        entry: join(root, "apps/electron/src/renderer.tsx"),
        name: "DagApp",
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
  const graphOutput = await buildGraphBrowser();
  let failRender = false;
  let clipboard = "";
  let delay = false;
  let release: (() => void) | undefined;
  await page.exposeFunction(
    "dagRequest",
    async (raw: unknown): Promise<Reply> => {
      const request = Schema.decodeUnknownSync(Request)(raw);
      actions.push({ request });
      if (request._tag === "depend" && delay) {
        delay = false;
        await new Promise<void>((done) => {
          release = done;
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
                new CustomEvent("dag-notice", {
                  detail: { _tag: "connection", profile, state: "connected" },
                }),
              ),
            request.profile,
          );
          return { _tag: "ok" };
        case "draft":
        case "copyMermaid":
          clipboard = request.text;
          return { _tag: "ok" };
        case "copyTaskId":
        case "openDiagnostics":
        case "snapshotReveal":
        case "attachmentClipboard":
        case "pickAttachment":
        case "pasteAttachment":
        case "attachmentStatus":
        case "openAttachment":
          return { _tag: "ok" };
        case "signIn":
        case "signOut":
          return { _tag: "ok" };
      }
      try {
        const reply = Schema.decodeUnknownSync(Reply)(
          await run(taskRequest(client, request)),
        );
        if (reply._tag === "graph" && failRender) {
          failRender = false;
          return {
            ...reply,
            report: { ...reply.report, mermaid: "flowchart TD\nn0[" },
          };
        }
        return reply;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "_tag" in error &&
          error._tag === "Conflict" &&
          "latest" in error
        )
          return Schema.decodeUnknownSync(Reply)({
            _tag: "conflict",
            latest: error.latest,
            exit_detail: exitDetail(error),
          });
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
  await page.route("http://127.0.0.1/graph-browser/*", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    assert.ok(name && ["index.html", "graph.js", "graph.css"].includes(name));
    return route.fulfill({
      path: join(graphOutput, name),
      contentType: name.endsWith(".html")
        ? "text/html"
        : name.endsWith(".js")
          ? "text/javascript"
          : "text/css",
    });
  });
  await page.goto("http://127.0.0.1/");
  await page.evaluate(() => {
    window.desktop = {
      request: (request) => Reflect.get(window, "dagRequest")(request),
      filePath: () => "",
      subscribe: (listener) => {
        const receive = (event: Event) => {
          if (event instanceof CustomEvent) listener(event.detail);
        };
        window.addEventListener("dag-notice", receive);
        return () => window.removeEventListener("dag-notice", receive);
      },
    };
  });
  await page.addScriptTag({ content: script.code });
  const capture = async (
    state: string,
    description: string,
    layout = "compact",
  ) => {
    for (const dark of [false, true]) {
      await page.evaluate((dark) => {
        if (document.documentElement.classList.contains("dark") !== dark)
          window.dispatchEvent(
            new CustomEvent("dag-notice", { detail: { _tag: "toggleTheme" } }),
          );
      }, dark);
      await settleRenderer(page);
      const png = `${state}-${layout}-${dark ? "dark" : "light"}.png`;
      const geometry = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        actions: [
          ...document.querySelectorAll(
            '[data-testid="dependency-delete-confirm"], [data-testid="dependency-delete-cancel"], [data-testid="dependency-picker-close"]',
          ),
        ].map((element) => {
          const box = element.getBoundingClientRect();
          return {
            id: element.getAttribute("data-testid"),
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            visible:
              box.top >= 0 &&
              box.bottom <= innerHeight &&
              box.left >= 0 &&
              box.right <= innerWidth,
          };
        }),
      }));
      assert.equal(geometry.overflow, false);
      assert.ok(
        geometry.actions.every((item) => item.visible),
        JSON.stringify(geometry),
      );
      await page.screenshot({ path: join(evidence, png) });
      const receipt = `${state}-compact-${dark ? "dark" : "light"}.json`;
      writeFileSync(
        join(evidence, receipt),
        JSON.stringify(
          {
            state,
            description,
            geometry,
            requestCount: actions.length,
            checkboxes: await page
              .getByRole("checkbox")
              .evaluateAll((elements) =>
                elements.map((element) =>
                  element instanceof HTMLInputElement
                    ? {
                        id: element.getAttribute("data-testid"),
                        checked: element.checked,
                        disabled: element.disabled,
                      }
                    : {
                        id: element.getAttribute("data-testid"),
                        checked:
                          element.getAttribute("aria-checked") === "true",
                        disabled:
                          element.hasAttribute("disabled") ||
                          element.getAttribute("aria-disabled") === "true",
                      },
                ),
              ),
            visibleText: await page.locator("body").innerText(),
            scope:
              "production renderer + real compiled scratch HTTP; native Session/safeStorage pending",
          },
          null,
          2,
        ),
      );
      manifest.push({
        client: "electron",
        state,
        layout,
        appearance: dark ? "dark" : "light",
        png,
        receipt,
        geometry,
        ids: await page
          .locator("[data-testid]")
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("data-testid")),
          ),
      });
    }
  };
  await expect(
    page.getByRole("button", { name: "More filters" }),
  ).toBeVisible();
  await expect(page.locator(`[data-task-id="${blocked.id}"]`)).toBeVisible();
  await expect(page.getByTestId(`dependency-state-${blocked.id}`)).toHaveText(
    "Blocked · 1",
  );
  await expect(page.getByTestId(`dependency-state-${ready.id}`)).toHaveText(
    "Ready",
  );
  await expect(page.getByTestId(`dependency-state-${plain.id}`)).toHaveCount(0);
  await capture(
    "rows",
    "Ready and Blocked metadata badges; no-blocker Task has no badge",
  );
  await page.getByRole("button", { name: "More filters" }).click();
  await expect(page.getByTestId("filter-ready")).toBeVisible();
  await capture(
    "filters",
    "Ready and Blocked controls reuse the existing filter draft/dialog",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "More filters" }).click();
  await page.locator("#filter-status").selectOption("closed");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator(`[data-task-id="${done.id}"]`)).toBeVisible();
  await page.locator(".task-groups").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByTestId(`dependency-state-${done.id}`)).toHaveCount(0);
  await expect(page.getByTestId(`dependency-state-${resolved.id}`)).toHaveCount(
    0,
  );
  await capture(
    "rows-terminal",
    "Done and cancelled Tasks have no Dependency badge",
  );
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.locator("#task-order").selectOption("topo");
  await expect(
    page.getByRole("heading", { name: "Dependency order", exact: true }),
  ).toBeVisible();
  await capture(
    "order",
    "Dependency order comes from the whole-Profile server order",
  );
  await page.locator(`[data-task-id="${blocked.id}"] .task-content`).click();
  await page.getByTestId("dependency-add").click();
  await expect(
    page.getByTestId(`dependency-choice-${blocker.id}`),
  ).toBeChecked();
  await capture("picker-depends-on", "Checked existing blockers remain first");
  await page.getByTestId("dependency-blocks").click();
  await capture(
    "picker-blocks",
    "Header states that Ship the client blocks the chosen Task",
  );
  delay = true;
  await page.getByTestId(`dependency-choice-${plain.id}`).check();
  await expect(
    page.getByTestId(`dependency-pending-${plain.id}`),
  ).toBeVisible();
  await capture(
    "picker-pending",
    "Pending candidate disables its immediate write",
  );
  assert.ok(release);
  release();
  await expect(page.getByTestId(`dependency-choice-${plain.id}`)).toBeChecked();
  await page.getByTestId(`dependency-choice-${blocker.id}`).check();
  await expect(page.getByTestId("dependency-error")).toContainText(
    "This Dependency would create a loop.",
  );
  await expect(page.getByTestId("dependency-error")).toContainText(
    "error 2 - validation or usage",
  );
  const visibleCandidates = await page
    .locator(".dependency-choice")
    .evaluateAll(
      (elements) =>
        elements.filter((element) => {
          const box = element.getBoundingClientRect();
          const parent = element
            .closest(".dependency-scroll")
            ?.getBoundingClientRect();
          return parent && box.top >= parent.top && box.bottom <= parent.bottom;
        }).length,
    );
  if (visibleCandidates < 2) {
    await page.screenshot({
      path: join(evidence, "refusal-geometry-incident.png"),
    });
    writeFileSync(
      join(evidence, "refusal-geometry-incident.json"),
      JSON.stringify(
        await page
          .locator('[data-testid="dependency-picker"]')
          .evaluate((root) =>
            [...root.querySelectorAll("*")]
              .filter((element) =>
                element.matches(
                  '[data-slot="dialog-title"], [data-slot="dialog-footer"], [data-testid="dependency-direction"], [data-testid="dependency-search"], .dependency-scroll, .dependency-choice, .dependency-error-region, .dependency-witness',
                ),
              )
              .map((element) => {
                const box = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return {
                  tag: element.tagName,
                  classes: element.className,
                  text: element.textContent,
                  x: box.x,
                  y: box.y,
                  width: box.width,
                  height: box.height,
                  margin: style.margin,
                  padding: style.padding,
                  lineHeight: style.lineHeight,
                  flexShrink: style.flexShrink,
                  scrollTop: element.scrollTop,
                };
              }),
          ),
        null,
        2,
      ),
    );
  }
  assert.ok(
    visibleCandidates >= 2,
    `Refusal must retain two whole candidate rows, got ${visibleCandidates}`,
  );

  await capture(
    "picker-refusal",
    "Real compiled server cycle refusal retains intent and actual exit pair",
  );
  await page.getByTestId("dependency-picker-close").click();
  const openDelete = async () => {
    await page
      .getByRole("button", { name: "Task actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Delete task", exact: true })
      .click();
    await expect(page.getByTestId("dependency-delete-confirm")).toBeEnabled();
    await expect(page.getByTestId("dependency-delete-cancel")).toBeFocused();
  };
  await openDelete();
  await capture(
    "delete-both",
    "Delete previews both incident directions and defaults to Cancel",
  );
  const current = cli("show", plain.id).task;
  cli(
    "undepend",
    plain.id,
    "--from",
    blocked.id,
    "--expected-version",
    String(current.row_version),
  );
  await page.getByTestId("dependency-delete-confirm").click();
  await expect(page.getByTestId("dependency-delete-changed")).toBeVisible();
  await capture(
    "delete-changed",
    "Changed fingerprint refreshes preview and requires new explicit confirmation",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page.locator(`[data-task-id="${untouched.id}"] .task-content`).click();
  await openDelete();
  await expect(page.getByTestId("dependency-delete-dialog")).toContainText(
    "This Task has no Dependencies.",
  );
  await capture(
    "delete-empty",
    "Every Delete confirms, including no-edge Tasks",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page.locator(`[data-task-id="${ready.id}"] .task-content`).click();
  await openDelete();
  await capture(
    "delete-blockers",
    "Blockers-only preview explicitly marks a cancelled endpoint",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page.locator(`[data-task-id="${blocker.id}"] .task-content`).click();
  await openDelete();
  await capture(
    "delete-dependents",
    "Dependents-only preview is reviewed before Delete",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page.locator(`[data-task-id="${blocked.id}"] .task-content`).click();
  const openGraph = async () => {
    await page
      .getByRole("button", { name: "Task actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "View Dependencies", exact: true })
      .click();
    await expect(page.getByTestId("dependency-graph-details")).toBeVisible();
  };
  await openGraph();
  await expect(page.getByTestId("dependency-graph-diagram")).toHaveCount(0);
  await capture(
    "graph-list",
    "Compact opens on the accessible Depends on, Blocks, Lightest next and root details list",
  );
  await page.getByRole("button", { name: "Diagram", exact: true }).click();
  await expect(
    page
      .frameLocator('[data-testid="dependency-graph-diagram"]')
      .locator(".pele-node:not(.graph-hidden)"),
  ).toHaveCount(2);
  await capture(
    "graph-diagram",
    "Explicit Diagram toggle draws the canonical local Pele resource",
  );
  await page.getByTestId("dependency-graph-copy-mermaid").click();
  assert.equal(
    clipboard,
    (
      await run(
        client.tasks.graph({
          params: {
            profile: Schema.decodeUnknownSync(ProfileId)("work"),
            task: blocked.id,
          },
        }),
      )
    ).mermaid,
  );
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("dag-notice", {
        detail: { _tag: "windowMode", compact: false },
      }),
    ),
  );
  await capture(
    "graph-full",
    "Full window diagram has native details beside it",
    "full",
  );
  await page.getByTestId("dependency-graph-close").click();
  await page.setViewportSize({ width: 393, height: 426 });
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("dag-notice", {
        detail: { _tag: "windowMode", compact: true },
      }),
    ),
  );
  failRender = true;
  await openGraph();
  await page.getByRole("button", { name: "Diagram", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Couldn't draw Dependencies." }),
  ).toBeVisible();
  await expect(page.getByTestId("dependency-graph-details")).toBeVisible();
  await capture(
    "graph-pele-fallback",
    "A controlled malformed export reaches real Pele; failure keeps accessible list and Retry",
  );
  await page.getByTestId("dependency-graph-retry").click();
  await expect(
    page
      .frameLocator('[data-testid="dependency-graph-diagram"]')
      .locator(".pele-node:not(.graph-hidden)"),
  ).toHaveCount(2);
  await page.getByTestId("dependency-graph-close").click();
  let lastDependent = "";
  for (let index = 0; index < 20; index++)
    lastDependent = cli(
      "add",
      `Long Dependency witness ${index + 1}: review the implementation and retain the complete Task title`,
      "--priority",
      "P4",
      "--depends-on",
      blocked.id,
    ).task.id;
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await page.locator(`[data-task-id="${blocked.id}"] .task-content`).click();
  await openDelete();
  await page
    .getByTestId("dependency-delete-blocks")
    .locator("li")
    .last()
    .scrollIntoViewIfNeeded();
  await capture(
    "delete-long-last",
    "Longest incident list reaches its last row while Cancel and Delete remain in the Compact viewport",
  );
  await page.getByTestId("dependency-delete-cancel").click();
  await page.getByTestId("dependency-add").click();
  await expect(
    page.getByTestId(`dependency-choice-${lastDependent}`),
  ).toBeAttached();
  await page
    .getByTestId(`dependency-choice-${lastDependent}`)
    .scrollIntoViewIfNeeded();
  await capture(
    "picker-long-last",
    "Profile-wide candidate list reaches its last long row while Close remains in the Compact viewport",
  );
  await page.getByTestId("dependency-picker-close").click();
  assert.equal(cli("show", plain.id).task.title, "Review tomorrow");
  assert.deepEqual(errors, []);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "CHECKPOINT2_PARTIAL",
        exit: 0,
        binaries,
        fixture: { blocker, blocked, resolved, ready, plain },
        limits: [
          "No native Electron IPC/safeStorage proof",
          "Checkpoint1 includes only current implemented states; long-list geometry and complete matrix follow",
        ],
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
  writeDagCaptureManifest(root, evidence, manifest);
  writeFileSync(join(evidence, "server.log"), log);
  rmSync(scratch, { recursive: true, force: true });
}
