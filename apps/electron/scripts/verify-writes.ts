import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect } from "@playwright/test";
import { OpLogEntry, Task } from "@todo/domain";
import { Schema } from "effect";
import { openProfileDeletion, selectProfile } from "./profile-menu.ts";
import { verifyCompact } from "./verify-compact.ts";
import { verifyCompactPresentation } from "./verify-compact-presentation.ts";
import { verifyImport } from "./verify-import.ts";
import { verifyMetadata } from "./verify-metadata.ts";
import { verifyPresentationCorrectness } from "./verify-presentation-correctness.ts";

import { verifyProfileCompact } from "./verify-profile-compact.ts";
import { verifyTaskFilters } from "./verify-task-filters.ts";
import { verifyTransferRegressions } from "./verify-transfer-regressions.ts";

if (process.env.TODO_ELECTRON_VERIFY_HOST !== "1")
  throw new Error(
    "Host-only verification requires TODO_ELECTRON_VERIFY_HOST=1",
  );
const scratch = process.argv[2];
const evidence = process.argv[3];
if (!scratch?.includes("todo-s01-verify-") || !evidence)
  throw new Error("Expected provisioned scratch and evidence paths");
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
mkdirSync(join(env.HOME, ".todo-cli"), { recursive: true });
writeFileSync(
  join(env.HOME, ".todo-cli/config.json"),
  JSON.stringify({ db_path: env.TODO_DB }),
);
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
let serverStopping = false;
const stopServer = async () => {
  serverStopping = true;
  if (server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise<void>((done) =>
    server.once("exit", () => done()),
  );
  const timer = setTimeout(() => server.kill("SIGKILL"), 2000);
  server.kill("SIGTERM");
  await stopped;
  clearTimeout(timer);
};
const receipts: unknown[] = [];
let desktop: ElectronApplication | undefined;
let upstream = "";
const conflictRefresh = {
  armed: false,
  waiting: false,
  blocked: false,
  release: Promise.withResolvers<void>(),
};
const proxy = Bun.serve({
  idleTimeout: 0,
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const body = request.method === "GET" ? undefined : await request.text();
    let response: Response;
    try {
      response = await fetch(`${upstream}${url.pathname}${url.search}`, {
        method: request.method,
        headers: request.headers,
        ...(body ? { body } : {}),
      });
    } catch (error) {
      if (!serverStopping) throw error;
      return new Response("Scratch server stopped", { status: 503 });
    }
    if (
      conflictRefresh.armed &&
      url.pathname.endsWith("/revert") &&
      response.status === 409
    ) {
      conflictRefresh.armed = false;
      conflictRefresh.waiting = true;
    }
    if (conflictRefresh.waiting && url.pathname.endsWith("/projects")) {
      conflictRefresh.waiting = false;
      conflictRefresh.blocked = true;
      await conflictRefresh.release.promise;
    }
    if (url.pathname !== "/auth/sessions")
      receipts.push({
        method: request.method,
        path: url.pathname,
        status: response.status,
        ...(body ? { payload: JSON.parse(body) } : {}),
      });
    if (url.pathname.endsWith("/events") && response.body) {
      const reader = response.body.getReader();
      return new Response(
        new ReadableStream({
          async pull(controller) {
            try {
              const chunk = await reader.read();
              if (chunk.done) controller.close();
              else controller.enqueue(chunk.value);
            } catch (error) {
              if (serverStopping) controller.close();
              else controller.error(error);
            }
          },
          async cancel() {
            try {
              await reader.cancel();
            } catch (error) {
              if (!serverStopping) throw error;
            }
          },
        }),
        { status: response.status, headers: response.headers },
      );
    }
    return response;
  },
});
const cli = (...args: string[]) =>
  execFileSync(
    join(scratch, "todo"),
    [
      ...(!args.includes("--profile") ? ["--profile", "work"] : []),
      "--format",
      "json",
      ...args,
    ],
    {
      env,
      encoding: "utf8",
      input: args[0] === "login" ? "scratch verification passphrase\n" : "",
    },
  );
let credential = "";
const api = async (path: string, method = "GET", payload?: unknown) => {
  const response = await fetch(`${upstream}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  expect(response.status).toBe(200);
  return response.json();
};
const tasks = async (profile = "work") =>
  Schema.decodeUnknownSync(Schema.Array(Task))(
    await api(`/profiles/${profile}/tasks`),
  );
const history = async (id: string, profile = "work") =>
  Schema.decodeUnknownSync(Schema.Array(OpLogEntry))(
    await api(`/profiles/${profile}/tasks/${id}/history`),
  );
const editCli = async (id: string, ...args: string[]) => {
  const task = (await tasks()).find((task) => task.id === id);
  if (!task) throw new Error("Missing CLI edit fixture");
  cli("edit", id, "--expected-version", String(task.row_version), ...args);
};
try {
  await expect
    .poll(() => log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1], {
      timeout: 60000,
    })
    .toBeTruthy();
  upstream = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
  expect(await (await fetch(`${upstream}/health`)).json()).toEqual({
    service: "todo-server",
  });
  credential = (
    await api("/auth/sessions", "POST", {
      passphrase: "scratch verification passphrase",
    })
  ).credential;
  cli("login");
  cli(
    "add",
    "Move this task",
    "--project",
    "Website",
    "--tag",
    "launch",
    "--due",
    "2026-10-28",
  );
  cli("add", "History task");
  cli("add", "Series draft");
  cli("add", "Revert race A");
  cli("add", "Revert race B");
  const electronHost: string = createRequire(import.meta.url)("electron");
  desktop = await _electron.launch({
    executablePath: electronHost,
    args: [resolve(import.meta.dirname, "../dist/verification/write-host.mjs")],
    env: {
      ...env,
      TODO_SERVER_URL: `http://127.0.0.1:${proxy.port}`,
      TODO_ELECTRON_DATA: join(scratch, "electron"),
    },
    timeout: 60000,
  });
  desktop.process().stderr?.on("data", (chunk) =>
    writeFileSync(join(evidence, "electron.log"), String(chunk), {
      flag: "a",
    }),
  );
  const page = await desktop.firstWindow();
  page.setDefaultTimeout(30000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await desktop.context().tracing.start({ screenshots: true, snapshots: true });
  const shot = (name: string) =>
    page.screenshot({
      path: join(evidence, `${name}.png`),
      animations: "disabled",
    });
  const select = async (title: string) => {
    await page.getByText(title, { exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
  };
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await verifyCompact({ desktop, page, scratch, evidence });
  await verifyCompactPresentation({ desktop, page, evidence, api });
  await verifyPresentationCorrectness({ desktop, page, evidence, api });
  await verifyMetadata({
    desktop,
    page,
    evidence,
    api,
    scratch,
    cli,
    serverURL: `http://127.0.0.1:${proxy.port}`,
  });
  await verifyTaskFilters({ page, desktop, evidence, api, cli });

  await verifyProfileCompact({ desktop, page, evidence, cli });
  cli("init", "--profile", "Delete proof");
  cli("login", "--profile", "Delete proof");
  cli("add", "Delete proof Task", "--profile", "Delete proof");
  await selectProfile(page, "personal");
  await selectProfile(page, "work");
  await selectProfile(page, "Delete proof");
  await expect(
    page.getByText("Delete proof Task", { exact: true }),
  ).toBeVisible();
  await openProfileDeletion(page, "Delete proof");
  await expect(page.getByRole("dialog")).toContainText(
    '"Delete proof" has 1 Task',
  );
  await expect(
    page.getByRole("button", { name: "Delete Profile and Task", exact: true }),
  ).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    await shot("profile-delete-refusal-" + theme);
  }
  await page
    .getByRole("button", { name: "Delete Tasks too…", exact: true })
    .click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    await shot("profile-delete-tasks-" + theme);
  }
  await page
    .getByRole("button", { name: "Delete Profile and Task", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(
    page.getByRole("menuitemradio", { name: "Delete proof", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("status", { name: "Profile deleted" }),
  ).toContainText('"Delete proof" was deleted. Switched to');
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await selectProfile(page, "work");
  await expect(page.getByText("Move this task", { exact: true })).toBeVisible();
  await api("/profiles/work", "DELETE", { with_tasks: true, dry_run: true });
  cli("init", "--profile", "External deletion");
  await selectProfile(page, "personal");
  await selectProfile(page, "work");
  await selectProfile(page, "External deletion");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(
    page.getByRole("menuitem", {
      name: 'Delete "External deletion"…',
      exact: true,
    }),
  ).toBeEnabled();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    await shot("profile-menu-" + theme);
  }
  await page
    .getByRole("menuitem", { name: 'Delete "External deletion"…', exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    'Delete "External deletion"?',
  );
  await expect(page.getByRole("dialog")).toContainText(
    "Todo saves a Snapshot first, so you can undo this in Settings › Snapshots.",
  );
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) =>
        document.documentElement.classList.toggle("dark", theme === "dark"),
      theme,
    );
    await shot("profile-delete-empty-" + theme);
  }
  cli("profile", "delete", "External deletion");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("status", { name: "Profile deleted" }),
  ).toContainText('"External deletion" was deleted. Switched to');
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await selectProfile(page, "work");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  await verifyTransferRegressions({ page, evidence, api });
  const compactTask = (await tasks()).find(
    (task) => task.title === "Compact mode task edited",
  );
  expect(compactTask?.row_version).toBe(2);
  if (!compactTask) throw new Error("Missing compact-mode creation");
  await api(`/profiles/work/tasks/${compactTask.id}?from_version=2`, "DELETE");
  await api("/profiles/work/tasks", "POST", { title: "P02 metadata task" });
  await expect(
    page.getByText("P02 metadata task", { exact: true }),
  ).toBeVisible();
  await select("P02 metadata task");
  await page
    .getByRole("combobox", { name: "Project", exact: true })
    .fill("Por");
  await expect(page.getByRole("option")).toHaveText(["Port", "Create “Por”"]);
  await shot("project-matching-create-row");
  await page
    .getByRole("combobox", { name: "Project", exact: true })
    .fill("Client Project");
  await expect(
    page.getByRole("option", { name: "Create “Client Project”", exact: true }),
  ).toBeVisible();
  await shot("project-create-row");
  await page
    .getByRole("option", { name: "Create “Client Project”", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Add Tag", exact: true })
    .fill("P02-FOCUS");
  await expect(
    page.getByRole("option", { name: "Create “p02-focus”", exact: true }),
  ).toBeVisible();
  await shot("tag-create-row");
  await page
    .getByRole("combobox", { name: "Add Tag", exact: true })
    .press("Enter");
  await page
    .getByRole("combobox", { name: "Add Tag", exact: true })
    .fill("ready");
  await page.getByRole("combobox", { name: "Add Tag", exact: true }).press(",");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Project", exact: true }),
  ).toHaveValue("Client Project");
  await expect(
    page.getByRole("button", { name: "Remove Tag p02-focus", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove Tag ready", exact: true }),
  ).toBeVisible();
  const metadataTask = (await tasks()).find(
    (task) => task.title === "P02 metadata task",
  );
  expect(metadataTask?.row_version).toBe(2);
  const projectDefinitions = await api("/profiles/work/projects");
  const tagDefinitions = await api("/profiles/work/tags");
  expect(
    projectDefinitions.find(
      (entry: { id: string }) => entry.id === metadataTask?.project_id,
    )?.name,
  ).toBe("Client Project");
  expect(
    tagDefinitions
      .filter((entry: { id: string }) =>
        metadataTask?.tags.some((id) => id === entry.id),
      )
      .map((entry: { name: string }) => entry.name)
      .sort(),
  ).toEqual(["p02-focus", "ready"]);
  const metadataRow = page
    .locator(".task-row")
    .filter({ hasText: "P02 metadata task" });
  await expect(metadataRow.locator(".task-meta")).toHaveText(
    "Client Project · #p02-focus · #ready",
  );
  await shot("metadata-saved-task");
  await page
    .getByRole("combobox", { name: "Project", exact: true })
    .fill("My Project");
  await page
    .getByRole("option", { name: "Create “My Project”", exact: true })
    .click();
  if (!metadataTask) throw new Error("Missing metadata task");
  await editCli(
    metadataTask.id,
    "--project",
    "Other Project",
    "--tag",
    "remote",
  );
  await expect(
    page.getByRole("button", { name: /Other Project/ }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Resolve task conflict" }),
  ).toContainText("Other Project");
  await expect(
    page.getByRole("dialog", { name: "Resolve task conflict" }),
  ).toContainText("My Project");
  await expect(
    page.getByRole("dialog", { name: "Resolve task conflict" }).locator("mark"),
  ).toHaveCount(0);
  await shot("metadata-conflict-names");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await select("Revert race A");
  const raceTask = (await tasks()).find(
    (task) => task.title === "Revert race A",
  );
  if (!raceTask) throw new Error("Missing Revert race Task");
  await editCli(raceTask.id, "--title", "Revert race A latest");
  await expect(
    page.locator(`[data-task-id="${raceTask.id}"] .task-title`),
  ).toHaveText("Revert race A latest");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Revert edited change", exact: true }),
  ).toBeVisible();
  conflictRefresh.armed = true;
  await page
    .getByRole("button", { name: "Revert edited change", exact: true })
    .click();
  await expect.poll(() => conflictRefresh.blocked).toBe(true);
  await page
    .getByRole("dialog", { name: "Task History", exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await select("Revert race B");
  conflictRefresh.release.resolve();
  await expect(page.locator('.editor button[type="submit"]')).toBeEnabled();
  await expect(
    page.getByRole("dialog", { name: "Resolve task conflict", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Revert race B",
  );
  expect((await tasks()).find((task) => task.id === raceTask.id)?.title).toBe(
    "Revert race A latest",
  );
  expect(
    (await tasks()).find((task) => task.title === "Revert race B")?.row_version,
  ).toBe(1);
  await shot("conflict-refresh-selection-preserved");
  cli("add", "C10 copy this task", "--project", "ARG", "--tag", "c10-focus");
  await expect(
    page.getByText("C10 copy this task", { exact: true }),
  ).toBeVisible();
  const copySource = (await tasks()).find(
    (task) => task.title === "C10 copy this task",
  );
  if (!copySource) throw new Error("Missing C10 copy fixture");
  await page
    .locator(`[data-task-id="${copySource.id}"] .task-content`)
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Copy to Profile", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Copy to Profile", exact: true }),
  ).toBeVisible();
  await shot("c10-copy-light");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await shot("c10-copy-dark");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await editCli(copySource.id, "--desc", "Latest C10 source");
  await page.getByRole("button", { name: "Copy task", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "This Task changed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "This Task changed", exact: true }),
  ).toContainText(
    "It was edited elsewhere and is now Version 2. Copy the latest Version to Personal?",
  );
  await expect(
    page.getByText("Choose each field to keep", { exact: false }),
  ).toHaveCount(0);
  await shot("c10-copy-conflict-light");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await shot("c10-copy-conflict-dark");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  const unchangedSource = (await tasks()).find(
    (task) => task.id === copySource.id,
  );
  const otherSourceTasks = (await tasks()).filter(
    (task) => task.id !== copySource.id,
  );
  await page.getByRole("button", { name: "Copy latest", exact: true }).click();
  await expect(page.getByLabel("Profile", { exact: true })).toHaveAttribute(
    "data-profile-id",
    "work",
  );
  const copiedTask = (await tasks("personal")).find(
    (task) => task.title === "C10 copy this task",
  );
  if (!copiedTask) throw new Error("Missing copied Task");
  expect([
    copiedTask.id !== copySource.id,
    copiedTask.created_at,
    copiedTask.description,
    copiedTask.row_version,
    copiedTask.occurrence,
  ]).toEqual([true, copySource.created_at, "Latest C10 source", 1, null]);
  expect((await tasks()).find((task) => task.id === copySource.id)).toEqual(
    unchangedSource,
  );
  expect((await tasks()).filter((task) => task.id !== copySource.id)).toEqual(
    otherSourceTasks,
  );
  await expect(
    page.getByText("Task copied to Personal", { exact: true }),
  ).toBeVisible();
  await shot("c10-copy-result-light");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await shot("c10-copy-result-dark");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  const copiedHistory = await history(copiedTask.id, "personal");
  expect(
    copiedHistory[0]?.event.kind === "TaskCreated"
      ? copiedHistory[0].event.copied_from
      : null,
  ).toEqual({
    profile_id: "work",
    profile_name: "work",
    source_task_id: copySource.id,
  });
  await page
    .getByRole("button", { name: "Open in Personal", exact: true })
    .click();
  await expect(page.getByLabel("Profile", { exact: true })).toHaveAttribute(
    "data-profile-id",
    "personal",
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "C10 copy this task",
  );
  await selectProfile(page, "work");
  await select("Move this task");
  const dueRow = page
    .locator(".task-row")
    .filter({ hasText: "Move this task" });
  await page.clock.setFixedTime(new Date("2026-10-28T15:00:00Z"));
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Move this task",
  );
  await expect(dueRow.locator(".task-dates")).toHaveText("Due Today");
  const dateOnlyDue = await dueRow.locator(".task-dates").innerText();
  await shot("date-only-due");
  await page.clock.setFixedTime(new Date());
  await shot("editor-recurrence");
  await page.getByLabel("Description").fill("Unsaved moved description");
  await page.getByRole("button", { name: "Task actions", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Move to Profile", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("menuitem", { name: "Reopen task", exact: true }),
  ).toHaveCount(0);
  await shot("task-actions-move");
  await page
    .getByRole("menuitem", { name: "Move to Profile", exact: true })
    .click();
  await expect(page.getByLabel("Destination Profile")).toHaveValue("personal");
  await shot("c10-move-picker-light");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await shot("c10-move-picker-dark");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  const move = (await tasks()).find((task) => task.title === "Move this task");
  if (!move) throw new Error("Missing move fixture");
  await editCli(move.id, "--desc", "Concurrent move edit");
  await page.getByRole("button", { name: "Move task", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "This Task changed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move latest", exact: true }).click();
  await expect(page.getByLabel("Profile", { exact: true })).toHaveAttribute(
    "data-profile-id",
    "work",
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Task moved to Personal", { exact: true }),
  ).toBeVisible();
  await shot("c10-move-result-light");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await shot("c10-move-result-dark");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  const moved = (await tasks("personal")).find((task) => task.id === move.id);

  expect(moved?.profile_id).toBe("personal");
  const movedProjects = await api("/profiles/personal/projects");
  const movedTags = await api("/profiles/personal/tags");
  expect(
    movedProjects.find(
      (entry: { id: string; name: string }) => entry.id === moved?.project_id,
    )?.name,
  ).toBe("Website");
  expect(
    movedTags
      .filter((entry: { id: string; name: string }) =>
        moved?.tags.some((id) => id === entry.id),
      )
      .map((entry: { name: string }) => entry.name),
  ).toEqual(["launch"]);
  expect(moved?.description).toBe("Concurrent move edit");
  expect((await tasks()).some((task) => task.id === move.id)).toBe(false);
  await page
    .getByRole("button", { name: "Open in Personal", exact: true })
    .click();
  await expect(page.getByLabel("Profile", { exact: true })).toHaveAttribute(
    "data-profile-id",
    "personal",
  );
  await expect(page.getByLabel("Description")).toHaveValue(
    "Unsaved moved description",
  );
  await selectProfile(page, "work");
  await select("History task");
  await page
    .getByRole("button", { name: "Complete History task", exact: true })
    .click();
  await page.getByRole("button", { name: "Task actions", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Reopen task", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("menuitem", { name: "Reopen task", exact: true })
    .click();
  await page.getByRole("button", { name: "Task actions", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Reopen task", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("menuitem", { name: "Cancel task", exact: true })
    .click();
  await page.getByRole("button", { name: "Task actions", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Reopen task", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("menuitem", { name: "Reopen task", exact: true })
    .click();
  const historyTask = (await tasks()).find(
    (task) => task.title === "History task",
  );
  if (!historyTask) throw new Error("Missing History fixture");
  await editCli(historyTask.id, "--title", "Changed by CLI");
  await page.getByRole("button", { name: "History", exact: true }).click();
  const edit = (await history(historyTask.id)).findLast(
    (entry) =>
      entry.outcome === "committed" && entry.event.kind === "TaskEdited",
  );
  if (!edit) throw new Error("Missing History edit");
  await expect(
    page.getByRole("button", {
      name: "Revert edited change",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".history-changes")).toContainText("History task");
  await expect(page.locator(".history-changes")).toContainText(
    "Changed by CLI",
  );
  await expect(page.locator(".history-dialog")).not.toContainText("Sequence");
  await expect(
    page
      .locator(".history-dialog li")
      .filter({ has: page.getByText("Created", { exact: true }) })
      .getByRole("button"),
  ).toHaveCount(0);
  await expect(page.locator(".history-dialog time").first()).toHaveAttribute(
    "title",
    /.+/,
  );
  await shot("history-revert");
  await page
    .getByRole("button", { name: "Revert edited change", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Resolve task conflict" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry action", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "History task",
  );
  expect(
    (await tasks()).find((task) => task.id === historyTask.id)?.title,
  ).toBe("History task");
  expect(
    (await history(historyTask.id)).findLast(
      (entry) => entry.outcome === "committed",
    )?.event.kind,
  ).toBe("TaskReverted");
  await page.getByRole("button", { name: "History", exact: true }).click();
  const revertedEdit = page
    .locator(".history-dialog li")
    .filter({ has: page.getByText("Edited", { exact: true }) });
  await expect(revertedEdit.getByRole("button")).toHaveCount(0);
  const rejected = page.locator('.history-dialog li[data-rejected="true"]');
  await expect(rejected).toContainText(
    "The task changed before this attempt was saved.",
  );
  await expect(rejected.getByRole("button")).toHaveCount(0);
  await shot("history-rejected-reverted");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await select("Series draft");
  await page.getByLabel("Recurrence", { exact: true }).click();
  await page.getByLabel("Repeat", { exact: true }).selectOption("weekly");
  await expect(page.getByRole("checkbox")).toHaveCount(7);
  for (const name of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    await expect(
      page.getByRole("checkbox", { name, exact: true }),
    ).toBeVisible();
  await page.getByRole("checkbox", { name: "Tue", exact: true }).check();
  await expect(page.locator(".recurrence-dialog code")).toHaveText(
    "FREQ=WEEKLY;BYDAY=MO,TU",
  );
  await shot("series-day-labels");
  await page.getByLabel("Repeat", { exact: true }).selectOption("weekdays");
  await shot("series-create");
  await page
    .getByRole("button", { name: "Create Series", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create Series", exact: true }),
  ).toBeHidden();
  const series = (await tasks()).find(
    (task) => task.title === "Series draft" && task.occurrence !== null,
  );
  if (!series) throw new Error("Missing created Series");
  expect(
    (await tasks()).filter((task) => task.title === "Series draft"),
  ).toHaveLength(2);
  await page.getByLabel("Recurrence", { exact: true }).click();
  await expect(page.getByLabel("Repeat", { exact: true })).toHaveValue(
    "weekdays",
  );
  await page.getByLabel("Repeat", { exact: true }).selectOption("weekly");
  await page.getByLabel("Wed", { exact: true }).check();
  await editCli(series.id, "--desc", "Concurrent Series edit");
  await page.getByRole("button", { name: "Save Series", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Resolve task conflict" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry action", exact: true }).click();
  await page.getByLabel("Recurrence", { exact: true }).click();
  await expect(page.getByLabel("Repeat", { exact: true })).toHaveValue(
    "weekly",
  );
  await expect(page.getByLabel("Wed", { exact: true })).toBeChecked();
  await shot("series-edit");
  const beforeSkip = (await tasks()).find((task) => task.id === series.id);
  await editCli(series.id, "--priority", "P1");
  await page
    .getByRole("button", { name: "Skip Occurrence", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Resolve task conflict" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry action", exact: true }).click();
  const afterSkip = await tasks();
  expect(afterSkip.find((task) => task.id === series.id)?.status).toBe(
    "cancelled",
  );
  const next = afterSkip.find(
    (task) =>
      task.occurrence?.series_id === series.occurrence?.series_id &&
      task.id !== series.id,
  );
  expect(next?.status).toBe("open");
  expect(next?.occurrence?.date).not.toBe(beforeSkip?.occurrence?.date);
  if (!next) throw new Error("Missing next Occurrence");
  await page.getByLabel("Recurrence", { exact: true }).click();
  await page
    .getByRole("button", { name: "Skip Occurrence", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    "validation",
  );
  await shot("series-server-rejection");
  expect(
    (await tasks()).filter(
      (task) =>
        task.occurrence?.series_id === series.occurrence?.series_id &&
        task.status === "open",
    ),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Task actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Close editor", exact: true })
    .click();
  await page.locator(`[data-task-id="${next.id}"] .task-content`).click();
  await page.getByLabel("Recurrence", { exact: true }).click();
  await expect(page.getByLabel("Repeat", { exact: true })).toHaveValue(
    "weekly",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const custom = Schema.decodeUnknownSync(Task)(
    await api("/profiles/work/series", "POST", {
      task: { title: "Custom Series" },
      recurrence: {
        dtstart: { kind: "date", date: "2026-11-01" },
        rrule: "FREQ=DAILY;INTERVAL=3;COUNT=8",
        exdate: [],
      },
    }),
  );
  await selectProfile(page, "personal");
  await selectProfile(page, "work");
  await select(custom.title);
  await page.getByLabel("Recurrence", { exact: true }).click();
  await expect(
    page.getByText("FREQ=DAILY;INTERVAL=3;COUNT=8", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save Series", exact: true }),
  ).toBeDisabled();
  await shot("series-custom-read-only");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  const createdRow = page
    .locator(".history-dialog li")
    .filter({ has: page.getByText("Created", { exact: true }) });
  await expect(createdRow.getByRole("button", { name: /Revert/ })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Task actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete task", exact: true })
    .click();
  await expect
    .poll(async () => (await tasks()).some((task) => task.id === custom.id))
    .toBe(false);
  await expect(page.getByText("Custom Series", { exact: true })).toBeHidden();
  const legacy = (await tasks()).find((task) => task.id === "legacy-1");
  if (!legacy) throw new Error("Missing migrated fixture");
  const completedLegacy = Schema.decodeUnknownSync(Task)(
    await api("/profiles/work/tasks/legacy-1/transition", "POST", {
      from_version: legacy.row_version,
      action: "complete",
    }),
  );
  await api(
    `/profiles/work/tasks/legacy-1?from_version=${completedLegacy.row_version}`,
    "DELETE",
  );
  const legacyNext = (await tasks()).find(
    (task) => task.occurrence?.series_id === "legacy-series:legacy-1",
  );
  if (!legacyNext) throw new Error("Missing migrated successor");
  await selectProfile(page, "personal");
  await selectProfile(page, "work");
  await page.locator(`[data-task-id="${legacyNext.id}"] .task-content`).click();
  await page.getByLabel("Recurrence", { exact: true }).click();
  await expect(page.getByLabel("Repeat", { exact: true })).toHaveValue("daily");
  await expect(
    page.getByRole("button", { name: "Skip Occurrence", exact: true }),
  ).toBeEnabled();
  await shot("legacy-successor-series");
  await page.getByLabel("Repeat", { exact: true }).selectOption("monthly-date");
  await page.getByLabel("Day of month", { exact: true }).fill("25");
  await page.getByRole("button", { name: "Save Series", exact: true }).click();
  await page.getByLabel("Recurrence", { exact: true }).click();
  await expect(page.getByLabel("Day of month", { exact: true })).toHaveValue(
    "25",
  );
  await page
    .getByLabel("Repeat", { exact: true })
    .selectOption("monthly-position");
  await page
    .getByLabel("Position in month", { exact: true })
    .selectOption("-1");
  await page.getByLabel("Day of week", { exact: true }).selectOption("FR");
  await page.getByRole("button", { name: "Save Series", exact: true }).click();
  await page.getByLabel("Recurrence", { exact: true }).click();
  await expect(page.getByLabel("Repeat", { exact: true })).toHaveValue(
    "monthly-position",
  );
  await expect(
    page.getByLabel("Position in month", { exact: true }),
  ).toHaveValue("-1");
  await expect(page.getByLabel("Day of week", { exact: true })).toHaveValue(
    "FR",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const a = Schema.decodeUnknownSync(Task)(
    await api("/profiles/work/series", "POST", {
      task: { title: "Deleted successor Series" },
      recurrence: {
        dtstart: { kind: "date", date: "2026-11-01" },
        rrule: "FREQ=DAILY",
        exdate: [],
      },
    }),
  );
  const completedA = Schema.decodeUnknownSync(Task)(
    await api(`/profiles/work/tasks/${a.id}/transition`, "POST", {
      from_version: a.row_version,
      action: "complete",
    }),
  );
  const b = (await tasks()).find(
    (task) =>
      task.id !== a.id &&
      task.occurrence?.series_id === a.occurrence?.series_id,
  );
  if (!b) throw new Error("Missing successor B");
  const editedB = Schema.decodeUnknownSync(Task)(
    await api(`/profiles/work/tasks/${b.id}/series`, "PATCH", {
      from_version: b.row_version,
      changes: {},
      recurrence: {
        dtstart: { kind: "date", date: "2026-11-01" },
        rrule: "FREQ=WEEKLY;BYDAY=MO",
        exdate: [],
      },
    }),
  );
  await api(
    `/profiles/work/tasks/${b.id}?from_version=${editedB.row_version}`,
    "DELETE",
  );
  await api(`/profiles/work/tasks/${a.id}/transition`, "POST", {
    from_version: completedA.row_version,
    action: "reopen",
  });
  await selectProfile(page, "personal");
  await selectProfile(page, "work");
  await page.locator(`[data-task-id="${a.id}"] .task-content`).click();
  await page.getByLabel("Recurrence", { exact: true }).click();
  await expect(page.getByLabel("Repeat", { exact: true })).toHaveValue(
    "weekly",
  );
  await shot("deleted-successor-rule");
  await page.getByRole("button", { name: "Save Series", exact: true }).click();
  await page.getByRole("button", { name: "Task actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Close editor", exact: true })
    .click();
  await verifyImport({ page, scratch, evidence, cli });
  await page.locator(`[data-task-id="${a.id}"] .task-content`).click();
  await page.getByLabel("Recurrence", { exact: true }).click();
  await expect(page.getByLabel("Repeat", { exact: true })).toHaveValue(
    "weekly",
  );
  await stopServer();
  await expect(
    page.getByRole("button", { name: "Save Series", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Series recurrence", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByText("Deleted successor Series", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Offline (read only)" }),
  ).toBeVisible();
  expect(pageErrors).toEqual([]);
  await shot("tasks");
  writeFileSync(
    join(evidence, "history.txt"),
    execFileSync(
      "sqlite3",
      [
        env.TODO_DB,
        "SELECT seq,outcome,reason,json_extract(event,'$.kind') FROM op_log ORDER BY seq;",
      ],
      { encoding: "utf8" },
    ),
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "THIN_PASS_NATIVE_BLOCKED",
        profileDeletion: {
          explicitTaskStep: true,
          switchesProfile: true,
          externalSseDeletion: true,
          externalDeletionDismissesConfirmation: true,
          compactBounds: true,
          compactLongProfileName: true,
        },
        metadataNames: true,
        conflictRefreshPreservesSelection: true,
        move: true,
        copy: true,
        transferSourceIsolation: true,
        copyProvenance: true,
        revert: true,
        seriesCreateEditSkip: true,
        customReadOnly: true,
        conflictActions: [
          "copy",
          "move",
          "revert",
          "editSeries",
          "skipOccurrence",
        ],
        serverRejectionReason: "validation",
        monthlyPresets: true,
        moveReturnsToSourceList: true,
        movedDraftPreserved: true,
        copyStaysInSourceProfile: true,
        transferOpenAction: true,
        legacyDeletedOriginal: true,
        deletedSuccessorRule: true,
        offlineDialogDismissal: true,
        deletedTaskRefreshed: true,
        readableHistory: {
          changedValues: true,
          rejectedReason: true,
          noCreationRevert: true,
          noRejectedRevert: true,
          noRepeatedRevert: true,
          localTimeTooltip: true,
        },
        noKeychain: true,
        compactMode: {
          contentSize: [393, 426],
          restoredFrame: true,
          draftPreserved: true,
          createdAndEdited: true,
          reloaded: true,
        },
        polish: {
          weekdayLabels: true,
          reopenOnlyDoneOrCancelled: true,
          visibleHistoryRevert: true,
          dateOnlyDue,
        },
        native:
          "HOLD. Verification host uses an in-memory scratch Session. No secure-storage, signed-app, native notification or restoration proof.",
        pageErrors,
      },
      null,
      2,
    ),
  );
  await desktop.context().tracing.stop({ path: join(evidence, "trace.zip") });
} catch (error) {
  writeFileSync(join(evidence, "failure.txt"), String(error));
  if (desktop) {
    const page = desktop.windows()[0];
    if (page) await page.screenshot({ path: join(evidence, "failure.png") });
  }
  throw error;
} finally {
  conflictRefresh.release.resolve();
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(receipts, null, 2),
  );
  writeFileSync(join(evidence, "server.log"), log);
  if (desktop) await desktop.close();
  proxy.stop(true);
  await stopServer();
}
