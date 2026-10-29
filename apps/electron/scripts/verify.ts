import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import {
  _electron,
  type ElectronApplication,
  expect,
  type Page,
} from "@playwright/test";
import { selectProfile } from "./profile-menu.ts";

if (
  process.env.TODO_VERIFY_NATIVE_UI !== "1" ||
  process.env.TODO_ELECTRON_VERIFY_HOST === "1"
)
  throw new Error(
    "HOLD: signed verification requires current native consent. Use verify.sh host mode for writes without Keychain.",
  );
const hostOnly = process.env.TODO_ELECTRON_VERIFY_HOST === "1";
const electronHost: string = createRequire(import.meta.url)("electron");
const scratch = process.argv[2];
const evidence = process.argv[3];
if (!scratch || !evidence || !existsSync(join(scratch, "scratch.db")))
  throw new Error(
    "Expected provisioned scratch and absolute evidence directory",
  );
const actions: unknown[] = [];
const save = (file: string, value: unknown) =>
  writeFileSync(join(evidence, file), JSON.stringify(value, null, 2));
const env: NodeJS.ProcessEnv & { HOME: string; TODO_DB: string } = {
  ...process.env,
  HOME: join(scratch, "home"),
  TODO_DB: join(scratch, "scratch.db"),
  TODO_PORT: "0",
};
delete env.ELECTRON_RUN_AS_NODE;
mkdirSync(join(env.HOME, ".todo-cli"), { recursive: true });
writeFileSync(
  join(env.HOME, ".todo-cli/config.json"),
  JSON.stringify({ db_path: env.TODO_DB }),
);
let serverLog = "";
const startServer = (port: string) => {
  const child = spawn(join(scratch, "server"), [], {
    env: { ...env, TODO_PORT: port },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    serverLog += chunk;
  });
  child.stderr.on("data", (chunk) => {
    serverLog += chunk;
  });
  return child;
};
let server = startServer("0");
const stopServer = async () => {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise<void>((done) =>
    server.once("exit", () => done()),
  );
  const timer = setTimeout(() => server.kill("SIGKILL"), 2000);
  server.kill("SIGTERM");
  await stopped;
  clearTimeout(timer);
};
let upstream = "";
const streamRequests: { path: string; lastEventId: string | null }[] = [];
let delay:
  | { path: string; method: string; captured: () => void; wait: Promise<void> }
  | undefined;
const hold = (method: string, path: string) => {
  let captured = () => {};
  let release = () => {};
  const started = new Promise<void>((done) => {
    captured = done;
  });
  const wait = new Promise<void>((done) => {
    release = done;
  });
  delay = { path, method, captured, wait };
  return { started, release };
};
const proxy = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  fetch: async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/events"))
      streamRequests.push({
        path: url.pathname,
        lastEventId: request.headers.get("last-event-id"),
      });
    let response: Response;
    try {
      response = await fetch(`${upstream}${url.pathname}${url.search}`, {
        method: request.method,
        headers: request.headers,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? null
            : await request.arrayBuffer(),
        signal: request.signal,
      });
    } catch {
      return new Response("Upstream offline", { status: 503 });
    }
    const gate = delay;
    if (gate && request.method === gate.method && url.pathname === gate.path) {
      delay = undefined;
      gate.captured();
      await gate.wait;
    }
    const reader = response.body?.getReader();
    if (!reader) return response;
    return new Response(
      new ReadableStream({
        async pull(controller) {
          try {
            const chunk = await reader.read();
            if (chunk.done) controller.close();
            else controller.enqueue(chunk.value);
          } catch {
            controller.close();
          }
        },
        cancel: () => reader.cancel().catch(() => undefined),
      }),
      { status: response.status, headers: response.headers },
    );
  },
});
let desktop: ElectronApplication | undefined;
let page: Page | undefined;
const cli = (...args: string[]) => {
  const output = execFileSync(
    join(scratch, "todo"),
    ["--profile", "work", "--format", "json", ...args],
    {
      env,
      input: args[0] === "login" ? "scratch verification passphrase\n" : "",
      encoding: "utf8",
    },
  );
  actions.push({
    action: "compiled CLI",
    args,
    output: args[0] === "login" ? "Session stored" : output,
  });
  return output;
};
const refreshSelection = async (window: Page) => {
  const nav = window.getByRole("navigation", { name: "Planning views" });
  const selected = await nav
    .locator('[aria-current="page"] .nav-title')
    .textContent();
  const name = selected?.trim();
  if (!name) throw new Error("Missing selected planning view");
  await nav
    .getByRole("button", { name: name === "Tasks" ? /^Today/ : /^Tasks/ })
    .click();
  await nav.getByRole("button", { name: new RegExp(`^${name}`) }).click();
};
const launch = async (base: string) => {
  actions.push({
    action: "launch compiled Electron",
    data: join(scratch, "electron"),
  });
  const instance = await _electron.launch({
    executablePath: hostOnly
      ? electronHost
      : resolve(
          import.meta.dirname,
          "../../../dist/signed.noindex/electron/Todo.app/Contents/MacOS/Electron",
        ),
    args: hostOnly ? [resolve(import.meta.dirname, "..")] : [],
    timeout: 15000,
    env: {
      ...env,
      ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
      TODO_SERVER_URL: base,
      TODO_ELECTRON_DATA: join(scratch, "electron"),
    },
  });
  desktop = instance;
  instance.process().stdout?.on("data", (chunk) => {
    writeFileSync(join(evidence, "electron.log"), String(chunk), { flag: "a" });
  });
  instance.process().stderr?.on("data", (chunk) => {
    writeFileSync(join(evidence, "electron.log"), String(chunk), { flag: "a" });
  });
  const window = await instance.firstWindow({ timeout: 15000 });
  window.setDefaultTimeout(10000);
  await window.emulateMedia({ reducedMotion: "reduce" });
  window.on("pageerror", (error) =>
    actions.push({ action: "pageerror", message: String(error) }),
  );
  await instance
    .context()
    .tracing.start({ screenshots: true, snapshots: true });
  return { instance, window };
};
try {
  await expect
    .poll(
      () => serverLog.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1],
      { timeout: 10000 },
    )
    .toBeTruthy();
  const serverBase = serverLog.match(
    /Listening on (http:\/\/127\.0\.0\.1:\d+)/,
  )?.[1];
  if (!serverBase) throw new Error("Missing server URL");
  upstream = serverBase;
  const base = proxy.url.origin;
  expect(await (await fetch(`${base}/health`)).json()).toEqual({
    service: "todo-server",
  });
  cli("login", "--password-stdin");
  cli(
    "add",
    "CLI task before launch",
    "--priority",
    "P2",
    "--due",
    "2026-10-01",
  );
  const today = new Date().toISOString().slice(0, 10);
  cli("add", "Due today from CLI", "--due", today);
  cli("add", "Scheduled today from CLI", "--scheduled", today);
  cli("add", "Inbox with Project", "--project", "Website", "--tag", "launch");
  ({ instance: desktop, window: page } = await launch(base));
  await page.screenshot({
    animations: "disabled",
    path: join(evidence, "sign-in.png"),
  });
  await page
    .getByLabel("Owner passphrase")
    .fill("scratch verification passphrase");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.getByText("CLI task before launch", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Reconnecting", { exact: true })).toBeHidden();
  actions.push({
    action: "UI sign in and list",
    result: "CLI task before launch",
  });
  const secure = await desktop.evaluate(async ({ safeStorage, app }) => ({
    encrypted: await safeStorage.isAsyncEncryptionAvailable(),
    data: app.getPath("userData"),
  }));
  expect(secure.encrypted).toBe(true);
  expect(
    readFileSync(join(secure.data, "session.enc")).includes(
      Buffer.from("ses_"),
    ),
  ).toBe(false);
  await expect(page.getByLabel("Profile")).toHaveAttribute(
    "data-profile-id",
    "work",
  );
  await expect(
    page.getByRole("button", { name: "Profile", exact: true }),
  ).toHaveText("Work");
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toHaveCount(0);
  const initialCounts = {
    Tasks: 4,
    Today: 3,
    Overdue: 1,
    Scheduled: 1,
    Inbox: 1,
  };
  for (const [name, count] of Object.entries(initialCounts)) {
    await expect(
      page
        .getByRole("navigation", { name: "Planning views" })
        .getByRole("button", { name: new RegExp(`^${name}`) })
        .locator(".nav-count"),
    ).toHaveText(String(count));
  }
  const selectionColors: string[] = [];

  for (const view of ["Today", "Overdue", "Scheduled", "Inbox"]) {
    await page
      .getByRole("navigation", { name: "Planning views" })
      .getByRole("button", { name: new RegExp(`^${view}`) })
      .click();
    await expect(
      page.getByRole("heading", { name: view, exact: true }),
    ).toBeVisible();
    const expected =
      view === "Overdue"
        ? "CLI task before launch"
        : view === "Scheduled"
          ? "Scheduled today from CLI"
          : view === "Inbox"
            ? "Inbox with Project"
            : "Due today from CLI";
    await expect(page.getByText(expected, { exact: true })).toBeVisible();
    const selectedView = page
      .getByRole("navigation", { name: "Planning views" })
      .locator('[aria-current="page"]');
    selectionColors.push(
      await selectedView.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    );
    await page.screenshot({
      path: join(evidence, `${view.toLowerCase()}.png`),
    });
  }
  expect(new Set(selectionColors).size).toBe(1);
  const delayedView = hold("GET", "/profiles/work/views/today");
  await page
    .getByRole("navigation", { name: "Planning views" })
    .getByRole("button", { name: /^Today/ })
    .click();
  await delayedView.started;
  await page
    .getByRole("navigation", { name: "Planning views" })
    .getByRole("button", { name: /^Inbox/ })
    .click();
  await expect(
    page.getByRole("region", { name: "Inbox", exact: true }),
  ).toBeVisible();
  delayedView.release();
  await refreshSelection(page);
  await expect(
    page.getByRole("region", { name: "Inbox", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Due today", exact: true }),
  ).toBeHidden();
  actions.push({
    action: "Delayed real Today response released after Inbox",
    result: "Inbox remains selected with Inbox groups",
  });
  await selectProfile(page, "personal");
  await expect(
    page.getByText("CLI task before launch", { exact: true }),
  ).toBeHidden();
  await selectProfile(page, "work");
  await page
    .getByRole("navigation", { name: "Planning views" })
    .getByRole("button", { name: /^Tasks/ })
    .click();
  await expect(
    page.getByText("Inbox with Project", { exact: true }),
  ).toBeVisible();
  actions.push({
    action: "S04 discovery and four domain views",
    profileIsolation: true,
    project: "Website",
    tag: "launch",
  });
  await page
    .getByRole("button", { name: /Quick add/ })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Task title", exact: true })
    .fill("Prepare launch notes p1 @Website #launch");
  await expect(
    page.getByRole("button", { name: "Clear priority" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: join(evidence, "quick-add.png"),
  });
  const delayedCreate = hold("POST", "/profiles/work/tasks");
  await page
    .getByRole("textbox", { name: "Task title", exact: true })
    .press("Meta+Enter");
  await delayedCreate.started;
  try {
    await expect(
      page.getByRole("textbox", { name: "Task title", exact: true }),
    ).toBeDisabled();
  } finally {
    delayedCreate.release();
  }
  actions.push({
    action: "Delayed real quick-add creation",
    result: "draft input disabled until accepted reply",
  });
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Prepare launch notes",
  );
  await expect(page.getByLabel("Priority", { exact: true })).toHaveValue("P1");
  await expect(page.getByLabel("Project", { exact: true })).toHaveValue(
    "Website",
  );
  await expect(
    page.getByRole("button", { name: "Remove Tag launch", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove Tag launch", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove Tag launch", exact: true }),
  ).toBeHidden();
  await page.getByLabel("Add Tag", { exact: true }).fill("launch");
  await page.getByLabel("Add Tag", { exact: true }).press("Enter");
  await expect(
    page.getByRole("button", { name: "Remove Tag launch", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByLabel("Recurrence", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Project", { exact: true })).toHaveValue(
    "Website",
  );
  await expect(page.getByLabel("Estimate", { exact: true })).toBeVisible();
  await page.getByLabel("Estimate", { exact: true }).fill("25");
  await page
    .getByRole("heading", { name: "Task details", exact: true })
    .click();
  await page.screenshot({
    animations: "disabled",
    path: join(evidence, "editor.png"),
  });
  await page.getByLabel("Estimate", { exact: true }).fill("");
  actions.push({
    action: "UI quick add with Cmd+Enter",
    result: "Prepare launch notes in editor",
  });
  await page.getByLabel("Title", { exact: true }).fill("My launch notes");
  await page
    .getByLabel("Description Markdown")
    .fill("Draft survives Profile switches");
  await selectProfile(page, "personal");
  await expect(page.getByRole("region", { name: "Task editor" })).toBeHidden();
  await selectProfile(page, "work");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "My launch notes",
  );
  await expect(page.getByLabel("Description Markdown")).toHaveValue(
    "Draft survives Profile switches",
  );
  await page.getByLabel("Description Markdown").fill("");
  actions.push({
    action: "Profile switch away and back",
    result: "dirty title and description restored",
  });
  const external = JSON.parse(cli("list"));
  save("cli-list.json", external);
  const rows = external.data ?? external.tasks ?? external;
  if (!Array.isArray(rows))
    throw new Error(`Inspect CLI list shape: ${JSON.stringify(external)}`);
  const task = rows.find(
    (row: { title: string }) => row.title === "Prepare launch notes",
  );
  if (!task) throw new Error("Missing created Task in compiled CLI list");
  cli(
    "edit",
    task.id,
    "--expected-version",
    String(task.row_version),
    "--title",
    "Latest release notes",
  );
  await expect(
    page.getByText("Latest release notes", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "My launch notes",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Resolve task conflict" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save resolution" }),
  ).toBeDisabled();
  await expect(page.locator(".resolution-field legend")).toHaveText("Title");
  await expect(page.locator(".resolution-option")).toHaveCount(2);
  await expect(page.locator(".resolution-option mark").first()).toHaveText(
    "My launch",
  );
  await page.screenshot({
    animations: "disabled",
    path: join(evidence, "conflict.png"),
  });
  await page.getByRole("radio", { name: /Your change/ }).check();
  await page.getByRole("button", { name: "Save resolution" }).click();
  await expect(
    page.getByRole("heading", { name: "Resolve task conflict" }),
  ).toBeHidden();
  await expect(
    page.getByText("My launch notes", { exact: true }),
  ).toBeVisible();
  actions.push({
    action: "Conflict from compiled CLI edit",
    base: 1,
    latest: 2,
    choice: "Your change",
    result: "My launch notes",
  });
  const delayedHistory = hold("GET", `/profiles/work/tasks/${task.id}/history`);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await delayedHistory.started;
  await selectProfile(page, "personal");
  delayedHistory.release();
  await refreshSelection(page);
  await expect(page.getByRole("region", { name: "Task editor" })).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Task History" }),
  ).toBeHidden();
  await selectProfile(page, "work");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "My launch notes",
  );
  const delayedTaskHistory = hold(
    "GET",
    `/profiles/work/tasks/${task.id}/history`,
  );
  await page.getByRole("button", { name: "History", exact: true }).click();
  await delayedTaskHistory.started;
  await page.getByText("Inbox with Project", { exact: true }).click();
  delayedTaskHistory.release();
  await refreshSelection(page);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Inbox with Project",
  );
  await expect(
    page.getByRole("heading", { name: "Task History" }),
  ).toBeHidden();
  await page.getByText("My launch notes", { exact: true }).click();
  actions.push({
    action: "Delayed real History responses cross Profile and Task selections",
    result: "previous selection's History stays closed",
  });
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Task History" }),
  ).toBeVisible();
  await expect(
    page.locator('.history-dialog li[data-rejected="true"]'),
  ).toContainText("The task changed before this attempt was saved.");
  await page.screenshot({
    animations: "disabled",
    path: join(evidence, "history.png"),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete My launch notes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reopen My launch notes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reopen My launch notes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Complete My launch notes", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Description Markdown")
    .fill("Unsaved after transition");
  await page
    .getByRole("button", { name: "Complete My launch notes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reopen My launch notes", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Description Markdown")).toHaveValue(
    "Unsaved after transition",
  );
  await page
    .getByRole("button", { name: "Reopen My launch notes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Complete My launch notes", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Description Markdown")).toHaveValue(
    "Unsaved after transition",
  );
  await page.getByLabel("Description Markdown").fill("");
  const delayedSave = hold("PATCH", `/profiles/work/tasks/${task.id}`);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await delayedSave.started;
  await selectProfile(page, "personal");
  delayedSave.release();
  await refreshSelection(page);
  await expect(page.getByRole("region", { name: "Task editor" })).toBeHidden();
  expect(
    await page.evaluate(() => localStorage.getItem("editor:personal")),
  ).toBeNull();
  await selectProfile(page, "work");
  await expect(
    page.getByText("My launch notes", { exact: true }),
  ).toBeVisible();
  actions.push({
    action: "Delayed real accepted save crosses Profile switch",
    result: "no Work editor or draft in Personal",
  });
  cli("add", "Live task from CLI");
  await expect(
    page.getByText("Live task from CLI", { exact: true }),
  ).toBeVisible();
  actions.push({
    action: "External compiled CLI create via SSE",
    result: "Live task from CLI visible without Refresh",
  });
  const session = await (
    await fetch(`${base}/auth/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: "scratch verification passphrase" }),
    })
  ).json();
  const current = JSON.parse(cli("show", task.id)).task;
  const due = new Date(Date.now() + 1500).toISOString();
  const patched = await fetch(`${base}/profiles/work/tasks/${task.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.credential}`,
    },
    body: JSON.stringify({
      from_version: current.row_version,
      changes: {
        due_at: { kind: "instant", utc: due, time_zone: "America/Bogota" },
      },
    }),
  });
  expect(patched.status).toBe(200);
  const receipt = () =>
    JSON.parse(
      execFileSync(
        "sqlite3",
        [
          "-json",
          env.TODO_DB,
          "SELECT seq,event,outcome FROM op_log WHERE json_extract(event,'$.kind')='ReminderFired' ORDER BY seq;",
        ],
        { encoding: "utf8" },
      ) || "[]",
    );
  await expect.poll(() => receipt().length, { timeout: 10000 }).toBe(1);
  const reminder = receipt()[0];
  expect(JSON.parse(reminder.event).title).toBe("My launch notes");
  expect(reminder.outcome).toBe("committed");
  if (!hostOnly) {
    await expect
      .poll(
        () =>
          existsSync(join(evidence, "electron.log"))
            ? readFileSync(join(evidence, "electron.log"), "utf8")
            : "",
        { timeout: 15000 },
      )
      .toContain("Todo native notification shown");
    expect(readFileSync(join(evidence, "electron.log"), "utf8")).toContain(
      `seq: ${reminder.seq}`,
    );
    save("native-notification.json", {
      operation: { ...reminder, event: JSON.parse(reminder.event) },
      native: "Electron Notification show event observed in electron.log",
    });
    actions.push({
      action: "Public HTTP sets due instant; scheduler commits; SSE delivers",
      seq: reminder.seq,
      nativeEvent: "show",
    });
  } else {
    save("native-notification.json", {
      operation: { ...reminder, event: JSON.parse(reminder.event) },
      native: "BLOCKED: host-only drive cannot prove signed native delivery",
    });
  }
  const cursor = JSON.parse(
    readFileSync(join(scratch, "electron/state.json"), "utf8"),
  ).cursors.work;
  await stopServer();
  await expect(
    page.getByRole("alert").filter({ hasText: "Offline (read only)" }),
  ).toBeVisible();
  cli("add", "CLI after stream reconnect");
  server = startServer(new URL(serverBase).port);
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${base}/health`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 10000 },
    )
    .toBe(200);
  await expect(
    page.getByText("CLI after stream reconnect", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  expect(readFileSync(join(evidence, "electron.log"), "utf8")).toContain(
    `cursor: '${cursor}'`,
  );
  expect(streamRequests).toContainEqual({
    path: "/profiles/work/events",
    lastEventId: cursor,
  });
  actions.push({
    action: "Server drop and Last-Event-ID reconnect",
    cursor,
    result: "CLI after stream reconnect",
  });
  const notificationError = page
    .getByRole("alert")
    .filter({ hasText: "Could not show reminder" });
  if (await notificationError.isVisible()) {
    actions.push({
      action: "Host notification permission error",
      result:
        "visible error acknowledged through Retry before ready-state screenshots",
    });
    await notificationError
      .getByRole("button", { name: "Retry", exact: true })
      .click();
    await expect(notificationError).toBeHidden();
  }
  await page.getByRole("button", { name: "Task actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Close editor", exact: true })
    .click();
  await page.screenshot({
    animations: "disabled",
    path: join(evidence, "tasks.png"),
  });
  await page.getByRole("button", { name: "Dark appearance" }).click();
  await page.screenshot({
    animations: "disabled",
    path: join(evidence, "tasks-dark.png"),
  });
  await page
    .getByRole("button", { name: /Quick add/ })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Task title", exact: true })
    .fill("Draft across restart");
  await page
    .getByRole("textbox", { name: "Task title", exact: true })
    .press("Escape");
  await desktop.context().tracing.stop({ path: join(evidence, "trace.zip") });
  await desktop.close();
  desktop = undefined;
  const delayedDraftRestore = hold("GET", "/profiles/work/tasks");
  ({ instance: desktop, window: page } = await launch(base));
  await delayedDraftRestore.started;
  try {
    cli("add", "CLI during draft restoration");
    await expect(
      page.getByText("CLI during draft restoration", { exact: true }),
    ).toBeVisible();
  } finally {
    delayedDraftRestore.release();
  }
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Quick add/ })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Task title", exact: true }),
  ).toHaveValue("Draft across restart");
  if (!hostOnly)
    expect(
      readFileSync(join(evidence, "electron.log"), "utf8")
        .split("\n")
        .filter((line) =>
          line.includes(
            `Todo native notification shown { seq: ${reminder.seq}, profile: 'work' }`,
          ),
        ),
    ).toHaveLength(1);
  actions.push({
    action: "Compiled app restart",
    result: "safeStorage Session restored and quick add draft retained",
  });
  actions.push({
    action: "CLI SSE refresh supersedes initial draft restoration response",
    result: "Draft across restart restored by the newest refresh",
  });
  await page
    .getByRole("textbox", { name: "Task title", exact: true })
    .press("Escape");
  await stopServer();
  await expect(
    page.getByRole("alert").filter({ hasText: "Offline (read only)" }),
  ).toBeVisible({ timeout: 10000 });
  await page
    .getByRole("button", { name: /Quick add/ })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Add task", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    animations: "disabled",
    path: join(evidence, "offline.png"),
  });
  await desktop
    .context()
    .tracing.stop({ path: join(evidence, "restart-trace.zip") });
  const sql = execFileSync(
    "sqlite3",
    [
      env.TODO_DB,
      "SELECT seq,outcome,reason,json_extract(event,'$.kind') FROM op_log ORDER BY seq;",
    ],
    { encoding: "utf8" },
  );
  writeFileSync(join(evidence, "history.txt"), sql);
  expect(sql).toContain("rejected|conflict|");
  save("result.json", {
    status: hostOnly ? "THIN_PASS_NATIVE_BLOCKED" : "PASS",
    surface: "compiled Electron + compiled server + compiled CLI",
    safeStorage: true,
    conflict: true,
    cliSse: true,
    restart: true,
    offline: true,
    G2: hostOnly
      ? "BLOCKED: signed-app keychain approval pending"
      : "PASS: committed ReminderFired received through typed SSE and Electron native show event observed",
    deferred: ["Series", "Move to Profile", "Revert"],
  });
} catch (error) {
  if (page)
    await page
      .screenshot({ path: join(evidence, "failure.png") })
      .catch(() => undefined);
  save("failure.json", { error: String(error) });
  throw error;
} finally {
  save("actions.json", actions);
  save("stream-requests.json", streamRequests);
  writeFileSync(join(evidence, "server.log"), serverLog);
  if (desktop) {
    const child = desktop.process();
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await desktop.close().catch(() => undefined);
    clearTimeout(timer);
  }
  await stopServer();
  await proxy.stop(true);
}
