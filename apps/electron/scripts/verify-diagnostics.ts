import { strict as assert } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  createServer,
  request as forwardRequest,
  type Server,
} from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect } from "@playwright/test";
import { DiagnosticsSnapshot } from "@todo/domain";
import { TasksResponse } from "@todo/domain/presentation";
import { Schema } from "effect";
import { setAppearance } from "./appearance.ts";

const scratch = process.argv[2] ?? "";
const evidence = process.argv[3] ?? "";
assert.ok(scratch.includes("todo-s01-verify-") && evidence.startsWith("/"));
const external = process.env.TODO_DIAGNOSTICS_URL;
const env: NodeJS.ProcessEnv & {
  HOME: string;
  TODO_DB: string;
  TODO_PORT: string;
  TODO_ELECTRON_DATA: string;
} = {
  ...process.env,
  HOME: process.env.TODO_DIAGNOSTICS_HOME || join(scratch, "home"),
  TODO_DB: process.env.TODO_DIAGNOSTICS_DB || join(scratch, "scratch.db"),
  TODO_PORT: "0",
  TODO_ELECTRON_VERIFY_HOST: "1",
  TODO_ELECTRON_DATA: join(scratch, "electron"),
};
env.TODO_ATTACHMENT_ROOT = join(dirname(env.TODO_DB), "attachments");
delete env.ELECTRON_RUN_AS_NODE;
mkdirSync(env.HOME, { recursive: true });
let log = "";
const server = external
  ? undefined
  : spawn(join(scratch, "server"), [], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
server?.stdout.on("data", (chunk: Buffer) => {
  log += chunk.toString();
});
server?.stderr.on("data", (chunk: Buffer) => {
  log += chunk.toString();
});
let desktop: ElectronApplication | undefined;
let proxy: Server | undefined;
let holdNext = false;
let rejectDiagnostics = false;
let held: (() => void) | undefined;
let release: (() => void) | undefined;
const stopServer = async () => {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exit = new Promise<void>((resolve) =>
    server.once("exit", () => resolve()),
  );
  const timer = setTimeout(() => server.kill("SIGKILL"), 3000);
  server.kill("SIGTERM");
  await exit;
  clearTimeout(timer);
};
try {
  let url = external || "";
  for (let attempt = 0; attempt < 1200 && !url; attempt++) {
    url = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
    if (url) break;
    assert.equal(server?.exitCode, null);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(url);
  const cli = (args: string[], input?: string, profile = "work") => {
    const result = spawnSync(
      process.env.TODO_CLI_BINARY || join(scratch, "todo"),
      ["--profile", profile, ...args],
      {
        env,
        ...(input === undefined ? {} : { input }),
        encoding: "utf8",
        timeout: 20000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  cli(["login", "--password-stdin"], "scratch verification passphrase\n");
  for (let index = 0; !external && index < 8; index++)
    cli([
      "add",
      `Diagnostics traffic ${index}`,
      ...(index === 0 ? ["--external-id", "private-c11-panel-id"] : []),
      "--format",
      "json",
    ]);
  const tasks = Schema.decodeUnknownSync(TasksResponse)(
    JSON.parse(cli(["list", "--format", "json"])),
  );
  if (!external) {
    assert.equal(tasks.tasks?.length, 8);
    const signIn = await fetch(`${url}/auth/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "scratch verification passphrase" }),
    });
    assert.equal(signIn.status, 200);
    const session = Schema.decodeUnknownSync(
      Schema.Struct({ credential: Schema.String }),
    )(await signIn.json());
    const imageTask = tasks.tasks?.at(-1);
    assert.ok(imageTask);
    const uploaded = await fetch(
      `${url}/profiles/work/tasks/${imageTask.id}/attachments/upload`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.credential}`,
        },
        body: JSON.stringify({
          from_version: imageTask.row_version,
          mime_type: "image/png",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7QAAAABJRU5ErkJggg==",
          label: "private-f11-panel-image",
        }),
      },
    );
    assert.equal(uploaded.status, 200);
    const tokenResponse = await fetch(`${url}/auth/tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.credential}`,
      },
      body: JSON.stringify({
        name: "Diagnostics agent",
        profile: "work",
        scope: "read-only",
      }),
    });
    assert.equal(tokenResponse.status, 200);
    const token = Schema.decodeUnknownSync(
      Schema.Struct({ credential: Schema.String }),
    )(await tokenResponse.json());
    const tokenRead = await fetch(`${url}/profiles/work/tasks`, {
      headers: { Authorization: `Bearer ${token.credential}` },
    });
    assert.equal(tokenRead.status, 200);
    await tokenRead.arrayBuffer();
    const task = tasks.tasks?.[0];
    assert.ok(task);
    const conflict = await fetch(`${url}/profiles/work/tasks/${task.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.credential}`,
      },
      body: JSON.stringify({
        from_version: 999,
        changes: { title: "Rejected diagnostics change" },
      }),
    });
    assert.equal(conflict.status, 409);
    await conflict.arrayBuffer();
  }
  const require = createRequire(import.meta.url);
  proxy = createServer((incoming, outgoing) => {
    const forward = forwardRequest(
      url + incoming.url,
      {
        method: incoming.method,
        headers:
          rejectDiagnostics && incoming.url === "/diagnostics"
            ? { ...incoming.headers, authorization: "Bearer ses_invalid" }
            : incoming.headers,
      },
      (response) => {
        if (holdNext && incoming.url === "/diagnostics") {
          holdNext = false;
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            release = () => {
              release = undefined;
              outgoing.writeHead(response.statusCode ?? 500, response.headers);
              outgoing.end(Buffer.concat(chunks));
            };
            held?.();
          });
        } else {
          outgoing.writeHead(response.statusCode ?? 500, response.headers);
          response.pipe(outgoing);
        }
      },
    );
    forward.on("error", () => outgoing.destroy());
    incoming.pipe(forward);
  });
  const proxyUrl = await new Promise<string>((resolve) =>
    proxy?.listen(0, "127.0.0.1", () => {
      const address = proxy?.address();
      assert.ok(address && typeof address !== "string");
      resolve(`http://127.0.0.1:${address.port}`);
    }),
  );
  desktop = await _electron.launch({
    executablePath: require("electron"),
    args: [resolve("dist/verification/write-host.mjs")],
    env: { ...env, TODO_SERVER_URL: proxyUrl },
    timeout: 60000,
  });
  const page = await desktop.firstWindow();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  const windowPromise = desktop.waitForEvent("window");
  await desktop.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()
      ?.items.find((item) => item.label === "Window")
      ?.submenu?.items.find((item) => item.label === "Diagnostics");
    if (item?.accelerator !== "CommandOrControl+Shift+D")
      throw new Error("Diagnostics menu or shortcut missing");
    item.click();
  });
  const diagnostics = await windowPromise;
  if (!external) {
    await expect(
      diagnostics
        .getByRole("region", { name: "Storage", exact: true })
        .getByText("Tasks with external ID", { exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      diagnostics.getByRole("region", { name: "Profiles", exact: true }),
    ).not.toContainText("private-c11-panel-id");
  }
  await expect(
    diagnostics.getByRole("heading", { name: "Diagnostics", exact: true }),
  ).toBeVisible();
  await expect(
    diagnostics.getByText("Live · refreshes every second"),
  ).toBeVisible({ timeout: 30000 });
  if (!external)
    await expect(
      diagnostics
        .getByRole("region", { name: "Profiles", exact: true })
        .getByText("8 Tasks", { exact: false }),
    ).toBeVisible();
  await expect(
    diagnostics
      .getByRole("region", { name: "Clients", exact: true })
      .getByText("electron", { exact: false }),
  ).toBeVisible({ timeout: 15000 });
  const appearance = async (dark: boolean) => {
    await setAppearance(page, dark ? "dark" : "light");
    await expect
      .poll(() =>
        diagnostics.evaluate(() =>
          document.documentElement.classList.contains("dark"),
        ),
      )
      .toBe(dark);
  };
  const size = async (width: number, height: number) => {
    await desktop?.evaluate(
      ({ BrowserWindow }, size) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.webContents.getURL().includes("view=diagnostics"))
          ?.setContentSize(size.width, size.height),
      { width, height },
    );
    await expect
      .poll(() => diagnostics.evaluate(() => [innerWidth, innerHeight]))
      .toEqual([width, height]);
    if (width < 700)
      await expect(diagnostics.locator(".diagnostics-page")).toHaveClass(
        /diagnostics-compact/,
      );
    else
      await expect(diagnostics.locator(".diagnostics-page")).not.toHaveClass(
        /diagnostics-compact/,
      );
  };
  const bounds = async (compact: boolean) => {
    const values = await diagnostics.evaluate(() => {
      const rect = (el: Element) => {
        const b = el.getBoundingClientRect();
        return {
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          bottom: b.bottom,
        };
      };
      const summaries = [
        ...document.querySelectorAll("[data-section-summary]"),
      ].map(rect);
      const targets = [
        ...document.querySelectorAll(
          ".diagnostics-controls button,.diagnostics-controls select",
        ),
      ].map(rect);
      const rows = [...document.querySelectorAll("[data-diagnostic-row]")]
        .filter(
          (el) => el.checkVisibility() && el.getBoundingClientRect().height > 0,
        )
        .map((el) => ({
          row: rect(el),
          panel: rect(el.closest("section") ?? el),
        }));
      return {
        summaries,
        targets,
        rows,
        width: innerWidth,
        height: innerHeight,
      };
    });
    for (const { row, panel } of values.rows) {
      assert.ok(row.y >= panel.y - 1);
      assert.ok(row.bottom <= panel.bottom + 1);
      assert.ok(row.height >= 12);
    }
    for (const target of values.targets) assert.ok(target.height >= 32);
    if (compact)
      assert.ok(
        values.summaries.filter((r) => r.y >= 0 && r.bottom <= values.height)
          .length >= 4,
        JSON.stringify(values),
      );
    return values;
  };
  const receipts: unknown[] = [];
  await size(393, 426);
  for (const dark of [false, true]) {
    await appearance(dark);
    receipts.push(await bounds(true));
    await diagnostics.screenshot({
      path: join(
        evidence,
        `compact-diagnostics-${dark ? "dark" : "light"}.png`,
      ),
    });
  }
  await diagnostics.keyboard.press("Meta+Shift+L");
  await expect(
    diagnostics.getByRole("button", { name: "Live updates" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    diagnostics.getByRole("button", { name: "Refresh diagnostics" }),
  ).toBeVisible();
  if (!external) {
    cli(["add", "While diagnostics paused", "--format", "json"]);
    await new Promise((resolve) => setTimeout(resolve, 1300));
    await diagnostics
      .getByRole("region", { name: "Profiles", exact: true })
      .locator("summary")
      .click();
    await expect(
      diagnostics
        .getByRole("region", { name: "Profiles", exact: true })
        .getByText("8 Tasks", { exact: false }),
    ).toBeVisible();
    await diagnostics
      .getByRole("button", { name: "Refresh diagnostics" })
      .click();
    await expect(
      diagnostics
        .getByRole("region", { name: "Profiles", exact: true })
        .getByText("9 Tasks", { exact: false }),
    ).toBeVisible();
    await diagnostics
      .getByRole("region", { name: "Profiles", exact: true })
      .locator("summary")
      .click();
  }
  for (const dark of [false, true]) {
    await appearance(dark);
    receipts.push(await bounds(true));
    await diagnostics.screenshot({
      path: join(
        evidence,
        `compact-diagnostics-paused-${dark ? "dark" : "light"}.png`,
      ),
    });
  }
  await diagnostics.getByRole("button", { name: "Live updates" }).click();
  await expect(
    diagnostics.getByRole("button", { name: "Refresh diagnostics" }),
  ).toHaveCount(0);
  await diagnostics.getByLabel("Diagnostics Profile").selectOption("personal");
  await diagnostics
    .getByRole("region", { name: "Operations", exact: true })
    .locator("summary")
    .click();
  await expect(
    diagnostics.getByText("No operations in this Profile."),
  ).toBeVisible();
  await diagnostics
    .getByRole("region", { name: "Operations", exact: true })
    .locator("summary")
    .click();
  for (const dark of [false, true]) {
    await appearance(dark);
    receipts.push(await bounds(true));
    await diagnostics.screenshot({
      path: join(
        evidence,
        `compact-diagnostics-empty-${dark ? "dark" : "light"}.png`,
      ),
    });
  }
  await diagnostics.getByLabel("Diagnostics Profile").selectOption("");
  if (!external) {
    cli(["init", "--format", "json"], undefined, "Archived");
    cli(["profile", "delete", "Archived", "--format", "json"]);
    await diagnostics
      .getByRole("region", { name: "Operations", exact: true })
      .locator("summary")
      .click();
    await expect(
      diagnostics
        .getByRole("region", { name: "Operations", exact: true })
        .getByText("Archived (deleted)", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await diagnostics
      .getByRole("region", { name: "Operations", exact: true })
      .locator("summary")
      .click();
    await expect(
      diagnostics
        .getByLabel("Diagnostics Profile")
        .getByRole("option", { name: "Archived", exact: true }),
    ).toHaveCount(0);
    const metadata = Schema.decodeUnknownSync(DiagnosticsSnapshot)(
      JSON.parse(cli(["diagnostics", "--server", url, "--format", "json"])),
    );
    assert.equal(metadata.storage.external_id_tasks, 1);
    assert.equal(metadata.storage.attachments, 1);
    assert.equal(metadata.storage.attachment_store_bytes, 67);
    assert.ok(!JSON.stringify(metadata).includes("private-f11-panel-image"));
    assert.ok(!JSON.stringify(metadata).includes("private-c11-panel-id"));
    assert.equal(metadata.profiles.length, 2);
    assert.equal(metadata.storage.entities.length, 2);
    assert.equal(
      metadata.storage.tables.find((t) => t.name === "profile_deletions")
        ?.count,
      1,
    );
    assert.equal(metadata.deleted_profiles[0]?.name, "Archived");
  }
  await size(1160, 840);
  for (const dark of [false, true]) {
    await appearance(dark);
    receipts.push(await bounds(false));
    await diagnostics.screenshot({
      path: join(
        evidence,
        `electron-diagnostics-${dark ? "dark" : "light"}.png`,
      ),
    });
  }
  await expect(
    diagnostics.getByRole("button", { name: /appearance/ }),
  ).toHaveCount(0);
  if (!external) {
    await diagnostics.getByRole("button", { name: "Live updates" }).click();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const arrived = new Promise<void>((resolve) => {
      held = resolve;
    });
    holdNext = true;
    const pending = diagnostics.evaluate(() =>
      window.desktop.request({ _tag: "diagnostics" }),
    );
    await arrived;
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      diagnostics.getByRole("region", { name: "Operations", exact: true }),
    ).toHaveCount(0);
    await expect(
      diagnostics.getByLabel("Diagnostics Profile").locator("option"),
    ).toHaveCount(1);
    release?.();
    await pending;
    await expect(
      diagnostics.getByRole("region", { name: "Operations", exact: true }),
    ).toHaveCount(0);
    await diagnostics.screenshot({
      path: join(evidence, "electron-diagnostics-signed-out.png"),
    });
    await page
      .getByLabel("Owner passphrase")
      .fill("scratch verification passphrase");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await diagnostics.getByRole("button", { name: "Live updates" }).click();
    await expect(
      diagnostics.getByRole("region", { name: "Operations", exact: true }),
    ).toBeVisible();
    rejectDiagnostics = true;
    await diagnostics.evaluate(() =>
      window.desktop.request({ _tag: "diagnostics" }),
    );
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tasks", exact: true }),
    ).toHaveCount(0);
    await expect(
      diagnostics.getByRole("region", { name: "Operations", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: join(evidence, "electron-main-diagnostics-401.png"),
    });
    rejectDiagnostics = false;
    await page
      .getByLabel("Owner passphrase")
      .fill("scratch verification passphrase");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      diagnostics.getByRole("region", { name: "Operations", exact: true }),
    ).toBeVisible();
    await size(393, 426);
    await stopServer();
    await expect(diagnostics.getByRole("alert")).toBeVisible({
      timeout: 30000,
    });
    for (const dark of [false, true]) {
      await appearance(dark);
      receipts.push(await bounds(true));
      await diagnostics.screenshot({
        path: join(
          evidence,
          `compact-diagnostics-error-${dark ? "dark" : "light"}.png`,
        ),
      });
    }
    await size(1160, 840);
    for (const dark of [false, true]) {
      await appearance(dark);
      receipts.push(await bounds(false));
      await diagnostics.screenshot({
        path: join(
          evidence,
          `electron-diagnostics-error-${dark ? "dark" : "light"}.png`,
        ),
      });
    }
  }
  writeFileSync(
    join(evidence, "bounds.json"),
    JSON.stringify(receipts, null, 2),
  );
  writeFileSync(
    join(evidence, "diagnostics-accessibility.txt"),
    await diagnostics.locator("body").innerText(),
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: external ? "ITERATIVE_PASS" : "PASS",
        signedAppLaunched: false,
        keychainAccessed: false,
        nativeKeyboardRoutingVerified: false,
        checks: external
          ? [
              "production window helper, menu and accelerator binding",
              "typed HttpApi read from persistent scratch server",
              "SSE subscriber kind",
              "Profile filter",
              "light and dark",
              "393x426 four visible summaries and minimum32px targets",
            ]
          : [
              "production window helper, menu and accelerator binding",
              "typed HttpApi diagnostics read",
              "eight CLI Tasks",
              "SSE subscriber kind",
              "Profile filter and empty state",
              "light and dark",
              "393x426 four visible summaries and minimum32px targets",
              "pause, manual refresh, resume and sign-out metadata clearing",
            ],
      },
      null,
      2,
    ),
  );
} finally {
  release?.();
  await desktop?.close();
  proxy?.closeAllConnections();
  await new Promise<void>((resolve) =>
    proxy ? proxy.close(() => resolve()) : resolve(),
  );
  await stopServer();
  writeFileSync(join(evidence, "server.log"), log);
}
