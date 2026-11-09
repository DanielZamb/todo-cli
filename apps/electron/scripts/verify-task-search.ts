import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect } from "@playwright/test";
import { CONTRACT_ID } from "@todo/api";
import { ProjectSummary, Task, TaskRead } from "@todo/domain";
import { Schema } from "effect";
import { setAppearance } from "./appearance.ts";
import { openProfileDeletion, selectProfile } from "./profile-menu.ts";

const scratch = process.argv[2];
const evidence = process.argv[3];
if (
  process.env.TODO_ELECTRON_VERIFY_HOST !== "1" ||
  !scratch?.includes("todo-s01-verify-") ||
  !evidence
)
  throw new Error("Expected unsigned scratch host and evidence paths");
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
const receipts: unknown[] = [];
const checks: unknown[] = [];
const filteredReplies: { text: string; tasks: readonly TaskRead[] }[] = [];
let log = "";
const server = spawn(join(scratch, "server"), [], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (data) => {
  log += data;
});
server.stderr.on("data", (data) => {
  log += data;
});
let desktop: ElectronApplication | undefined;
let upstream = "";
let failText: string | null = null;
let syntheticProjectSuperset = false;
type ResponseGate = {
  text: string;
  profile: string;
  error: boolean;
  reached: boolean;
  release: ReturnType<typeof Promise.withResolvers<void>>;
};
let hold: ResponseGate | null = null;
const held: ResponseGate[] = [];
const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
let eventConnections = 0;
const proxy = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const forwarded = new URL(url);
    if (
      syntheticProjectSuperset &&
      url.pathname === "/profiles/work/tasks" &&
      url.searchParams.has("project")
    )
      forwarded.searchParams.delete("project");
    const response = await fetch(
      `${upstream}${forwarded.pathname}${forwarded.search}`,
      {
        method: request.method,
        headers: request.headers,
        ...(request.method === "GET" ? {} : { body: await request.text() }),
      },
    );
    if (url.pathname.endsWith("/events") && response.body) {
      eventConnections++;
      const reader = response.body.getReader();
      let active: ReadableStreamDefaultController<Uint8Array> | undefined;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            active = controller;
            streams.add(controller);
          },
          async pull(controller) {
            try {
              const chunk = await reader.read();
              if (!streams.has(controller)) return;
              if (chunk.done) {
                streams.delete(controller);
                controller.close();
              } else controller.enqueue(chunk.value);
            } catch (error) {
              if (streams.delete(controller)) controller.error(error);
            }
          },
          async cancel() {
            if (active) streams.delete(active);
            await reader.cancel().catch(() => {});
          },
        }),
        { status: response.status, headers: response.headers },
      );
    }
    const text = url.searchParams.get("text");
    const filtered = url.pathname.endsWith("/tasks") && text !== null;
    let body = await response.text();
    if (
      syntheticProjectSuperset &&
      url.pathname === "/profiles/work/projects" &&
      response.status === 200
    ) {
      const rows = Schema.decodeUnknownSync(Schema.Array(ProjectSummary))(
        JSON.parse(body),
      );
      body = JSON.stringify(
        rows.map((row) =>
          row.name === "Other" ? { ...row, name: "Small" } : row,
        ),
      );
    }
    const gate =
      filtered &&
      hold?.text === text &&
      url.pathname === `/profiles/${hold.profile}/tasks`
        ? hold
        : null;
    if (gate) {
      hold = null;
      gate.reached = true;
      await gate.release.promise;
    }
    const status =
      filtered && (failText === text || gate?.error) ? 503 : response.status;
    if (filtered && status === 200)
      filteredReplies.push({
        text,
        tasks: Schema.decodeUnknownSync(Schema.Array(TaskRead))(
          JSON.parse(body),
        ),
      });
    if (url.pathname !== "/auth/sessions")
      receipts.push({
        path: url.pathname + url.search,
        status,
        body: status === 503 ? "controlled failure" : JSON.parse(body),
      });
    return new Response(status === 503 ? "Scratch search failure" : body, {
      status,
      headers: response.headers,
    });
  },
});
const stopServer = async () => {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise<void>((done) => server.once("exit", () => done()));
  const timer = setTimeout(() => server.kill("SIGKILL"), 2000);
  server.kill("SIGTERM");
  await exited;
  clearTimeout(timer);
};
const cli = (...args: string[]) => {
  const result = spawnSync(
    join(scratch, "todo"),
    ["--profile", "work", "--format", "json", ...args],
    {
      env,
      encoding: "utf8",
      input: args[0] === "login" ? "scratch verification passphrase\n" : "",
    },
  );
  receipts.push({
    cli: args,
    exit: result.status,
    stdout: args[0] === "login" ? "credential omitted" : result.stdout,
    stderr: result.stderr,
  });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
};
let credential = "";
const api = async (path: string, method = "GET", payload?: unknown) => {
  const response = await fetch(upstream + path, {
    method,
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const value: unknown = await response.json();
  if (path !== "/auth/sessions")
    receipts.push({
      api: path,
      method,
      status: response.status,
      response: value,
    });
  expect(response.status).toBe(200);
  return value;
};
const arm = (text: string, error = false, profile = "work") => {
  const gate = {
    text,
    error,
    profile,
    reached: false,
    release: Promise.withResolvers<void>(),
  };
  held.push(gate);
  hold = gate;
  return gate;
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
    contract: CONTRACT_ID,
    build: expect.any(String),
  });
  credential = Schema.decodeUnknownSync(
    Schema.Struct({ credential: Schema.String }),
  )(
    await api("/auth/sessions", "POST", {
      passphrase: "scratch verification passphrase",
    }),
  ).credential;
  cli("login");
  const fixtures = [];
  for (const [title, description] of [
    ["Renovar el pasaporte", "Search fixture"],
    ["😀 Canción de cuna", "Search fixture"],
    ["Rent: pay by Friday", "Search fixture"],
    ["Pay rent today", "Search fixture"],
    [
      "Search receipt",
      "A long introduction before the key phrase. Find the blue Canción receipt in the cabinet, then file it away.",
    ],
    ["Rent drafts", "Search fixture"],
    ["Rent drift", "Search fixture"],
  ])
    fixtures.push(
      Schema.decodeUnknownSync(Task)(
        await api("/profiles/work/tasks", "POST", {
          title,
          description,
          priority: "P2",
          energy: 2,
          estimate_min: 15,
          project_name: "Search Project",
          tag_names: ["search-tag"],
        }),
      ),
    );
  const passport = fixtures[0];
  const song = fixtures[1];
  const receipt = fixtures[4];
  if (!passport || !song || !receipt)
    throw new Error("Missing search fixtures");
  await api("/profiles/personal/tasks", "POST", {
    title: "Personal pasaporte",
    priority: "P3",
  });
  desktop = await _electron.launch({
    executablePath: createRequire(import.meta.url)("electron"),
    args: [resolve(import.meta.dirname, "../dist/verification/write-host.mjs")],
    env: {
      ...env,
      TODO_SERVER_URL: `http://127.0.0.1:${proxy.port}`,
      TODO_ELECTRON_DATA: join(scratch, "electron"),
    },
    timeout: 60000,
  });
  const page = await desktop.firstWindow();
  checks.push({
    verificationWindows: await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => ({
        id: window.id,
        visible: window.isVisible(),
        focused: window.isFocused(),
      })),
    ),
  });
  page.setDefaultTimeout(30000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await desktop.context().tracing.start({ screenshots: true, snapshots: true });
  const pane = page.locator(".task-pane");
  const field = page.getByRole("textbox", {
    name: "Search tasks",
    exact: true,
  });
  const titles = () => page.locator(".task-title").allTextContents();
  const showing = async (text: string) => {
    await expect(field).toHaveValue(text);
    await expect(pane).toHaveAttribute("data-search-phase", "Showing");
    await expect(pane).toHaveAttribute("data-search-stale", "false");
    const identity = await pane.getAttribute("data-applied-identity");
    expect(identity && JSON.parse(identity).text).toBe(text);
  };
  const query = async (text: string, expected: string[]) => {
    await field.fill(text);
    await showing(text);
    await expect(
      page.locator(".list-heading").filter({ hasText: /\b0 tasks\b/ }),
    ).toHaveCount(0);
    expect((await titles()).toSorted()).toEqual(expected.toSorted());
    expect(await titles()).toEqual(
      filteredReplies
        .findLast((reply) => reply.text === text)
        ?.tasks.map((task) => task.title),
    );
    checks.push({
      query: text,
      titles: await titles(),
      applied: await pane.getAttribute("data-applied-identity"),
    });
  };
  const shot = async (name: string) => {
    await expect(page.locator("#compact-search")).toBeVisible();
    await page.screenshot({
      path: join(evidence, `${name}.png`),
      animations: "disabled",
    });
    const bounds = await page
      .locator(
        "#compact-search, .task-filters, .search-results, .search-excerpt, .search-error, .task-id-copy, [role=dialog]",
      )
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          tag: node.tagName,
          classes: node.className,
          text: node.textContent,
          rect: node.getBoundingClientRect().toJSON(),
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        })),
      );
    checks.push({ capture: name, viewport: page.viewportSize(), bounds });
    const visibleBounds = await page
      .locator(
        "#compact-search, .task-id-copy, .task-id-value code, .task-id-copy button, .task-filter-dialog",
      )
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.getBoundingClientRect().toJSON())
          .filter((rect) => rect.width && rect.height),
      );
    const size = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }));
    for (const rect of visibleBounds) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(size.width);
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.bottom).toBeLessThanOrEqual(size.height);
    }
    checks.push({ captureBounds: name, size, visibleBounds });
    const targets = await page
      .locator("#compact-search, .task-id-copy button")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.getBoundingClientRect().toJSON())
          .filter((rect) => rect.width && rect.height),
      );
    for (const rect of targets) {
      expect(rect.width).toBeGreaterThanOrEqual(32);
      expect(rect.height).toBeGreaterThanOrEqual(32);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  };
  const navigate = async (view: string, compact: boolean) => {
    if (compact) {
      await page
        .getByRole("button", { name: "Navigate tasks", exact: true })
        .click();
      await page
        .getByRole("menuitemradio", { name: new RegExp(`^${view}`) })
        .click();
    } else
      await page
        .getByRole("navigation", { name: "Planning views" })
        .getByRole("button", { name: new RegExp(`^${view}`) })
        .click();
  };
  const assertRetained = async (
    text: string,
    oldTitles: string[],
    phase: string,
  ) => {
    await expect(field).toHaveValue(text);
    await expect(pane).toHaveAttribute("data-search-phase", phase);
    await expect(pane).toHaveAttribute("data-search-stale", "true");
    expect(await titles()).toEqual(oldTitles);
  };
  await showing("");
  await expect.poll(() => eventConnections).toBe(1);
  failText = "reno";
  await field.fill("reno");
  await expect(pane).toHaveAttribute("data-search-phase", "Error");
  await expect(page.getByLabel("Search failed")).toContainText(
    "Couldn't search. Showing tasks without search.",
  );
  failText = null;
  await field.fill("");
  await showing("");
  await page.getByRole("button", { name: "Compact mode", exact: true }).click();
  await expect
    .poll(() =>
      desktop?.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.getContentSize(),
      ),
    )
    .toEqual([393, 426]);
  for (const compact of [true, false]) {
    if (!compact)
      await page
        .getByRole("button", { name: "Expand window", exact: true })
        .click();
    for (const theme of ["light", "dark"] as const) {
      await setAppearance(page, theme);
      const prefix = `${compact ? "compact" : "full"}-${theme}`;
      await query("reno", ["Renovar el pasaporte"]);
      await shot(`${prefix}-ready`);
      const delayed = arm("cancion");
      await field.fill("cancion");
      await assertRetained("cancion", ["Renovar el pasaporte"], "Debouncing");
      await shot(`${prefix}-typing`);
      await expect.poll(() => delayed.reached).toBe(true);
      await assertRetained("cancion", ["Renovar el pasaporte"], "Requesting");
      await shot(`${prefix}-requesting`);
      delayed.release.resolve();
      await showing("cancion");
      expect((await titles()).toSorted()).toEqual(
        ["Search receipt", "😀 Canción de cuna"].toSorted(),
      );
      expect(
        await page
          .locator(`[data-task-id="${song.id}"] .task-title mark`)
          .allTextContents(),
      ).toEqual(["Canción"]);
      expect(
        await page
          .locator(`[data-task-id="${receipt.id}"] .search-excerpt mark`)
          .allTextContents(),
      ).toEqual(["Canción"]);
      await shot(`${prefix}-description`);
      await expect(page.locator(".search-excerpt")).toContainText(/^…/);
      expect(
        await page.locator(".search-excerpt").evaluate((element) => ({
          scrollLeft: element.scrollLeft,
          overflow: getComputedStyle(element).textOverflow,
        })),
      ).toEqual({ scrollLeft: 0, overflow: "ellipsis" });
      expect(
        await page
          .locator(".search-results mark")
          .first()
          .evaluate((mark) => getComputedStyle(mark).backgroundColor),
      ).toBe(theme === "light" ? "rgb(221, 239, 216)" : "rgb(52, 88, 63)");
      const excerptBounds = await page
        .locator(".search-excerpt")
        .evaluate((element) => ({
          viewport: element.getBoundingClientRect().toJSON(),
          mark: element.querySelector("mark")?.getBoundingClientRect().toJSON(),
        }));
      expect(excerptBounds.mark?.left).toBeGreaterThanOrEqual(
        excerptBounds.viewport.left,
      );
      expect(excerptBounds.mark?.right).toBeLessThanOrEqual(
        excerptBounds.viewport.right,
      );
      checks.push({ descriptionCentered: prefix, excerptBounds });
      await query("no-matching-word", []);
      await expect(
        page.getByRole("button", { name: "Clear search", exact: true }),
      ).toHaveCount(1);
      expect(
        await page.locator('[data-slot="empty"] button').allTextContents(),
      ).toEqual(["Clear search"]);
      await expect(
        page.getByRole("button", { name: "Quick add", exact: true }),
      ).toHaveCount(0);
      await shot(`${prefix}-empty`);
      await page
        .getByRole("button", { name: "Clear search", exact: true })
        .click();
      await showing("");
      await query("reno", ["Renovar el pasaporte"]);
      failText = "pasaprote";
      await field.fill("pasaprote");
      await assertRetained("pasaprote", ["Renovar el pasaporte"], "Error");
      await expect(page.getByLabel("Search failed")).toContainText(
        'Couldn\'t search. Showing results for "reno".',
      );
      await shot(`${prefix}-error`);
      await expect(page.getByLabel("Search failed")).toHaveAttribute(
        "role",
        "status",
      );
      expect(
        await page
          .getByLabel("Search failed")
          .evaluate((element) => getComputedStyle(element).borderTopWidth),
      ).toBe("0px");
      await desktop.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send("todo:notice", {
          _tag: "connection",
          profile: "work",
          state: "offline",
        });
      });
      await expect(
        page
          .getByLabel("Search failed")
          .getByRole("button", { name: "Retry", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Reconnect", exact: true }),
      ).toHaveCount(1);
      await shot(`${prefix}-offline-search`);
      const beforeConnectedNotice = receipts.length;
      await desktop.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send("todo:notice", {
          _tag: "connection",
          profile: "work",
          state: "connected",
        });
      });
      await expect
        .poll(() => receipts.length)
        .toBeGreaterThan(beforeConnectedNotice);
      await expect(pane).toHaveAttribute("data-search-phase", "Error");
      const failedCount = receipts.length;
      await page.waitForTimeout(450);
      expect(receipts.length).toBe(failedCount);
      failText = null;
      await page
        .getByLabel("Search failed")
        .getByRole("button", { name: "Retry", exact: true })
        .click();
      await showing("pasaprote");
      await page
        .getByRole("button", { name: "More filters", exact: true })
        .click();
      await page.getByLabel("Id starts with", { exact: true }).fill("zz");
      await expect(
        page.getByLabel("Id starts with", { exact: true }),
      ).toHaveAttribute("aria-invalid", "true");
      await page
        .getByRole("button", { name: "Apply filters", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Filter tasks" }),
      ).toBeVisible();
      await page
        .getByLabel("Id starts with", { exact: true })
        .fill(passport.id.slice(0, 8).toUpperCase());
      await page.getByLabel("Priority", { exact: true }).selectOption("P2");
      await page.getByLabel("Energy", { exact: true }).selectOption("2");
      await page
        .getByLabel("Estimated time, minutes", { exact: true })
        .fill("15");
      await page.locator(".task-filter-grid").evaluate((element) => {
        element.scrollTop = 0;
      });
      await shot(`${prefix}-filters-prefix`);
      await page
        .getByRole("button", { name: "Apply filters", exact: true })
        .click();
      await showing("pasaprote");
      expect(await titles()).toEqual(["Renovar el pasaporte"]);
      await page
        .getByRole("button", { name: "More filters", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Clear all", exact: true })
        .click();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page.getByLabel("Active filters")).toContainText(
        "Id starts with",
      );
      await page
        .getByRole("button", { name: "Clear filters", exact: true })
        .click();
      await showing("pasaprote");
      await page
        .locator(`[data-task-id="${passport.id}"] .task-content`)
        .click();
      await expect(page.getByLabel("Task id", { exact: true })).toHaveText(
        passport.id,
      );
      const titleBounds = await page
        .getByLabel("Title", { exact: true })
        .boundingBox();
      const idBounds = await page
        .getByLabel("Task id", { exact: true })
        .boundingBox();
      expect(
        titleBounds &&
          idBounds &&
          idBounds.y >= titleBounds.y + titleBounds.height,
      ).toBe(true);
      await expect(field).toBeVisible();
      await page
        .getByLabel("Title", { exact: true })
        .fill("Keep this editor draft");
      await page.keyboard.press("Meta+f");
      await expect(field).toBeFocused();
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
        "Keep this editor draft",
      );
      await page.getByLabel("Title", { exact: true }).fill(passport.title);
      await page
        .getByRole("button", { name: "Copy task id", exact: true })
        .click();
      await expect(page.locator(".task-id-copy [role=status]")).toHaveText(
        "Copied",
      );
      expect(
        await desktop.evaluate(async ({ clipboard }) => clipboard.readText()),
      ).toBe(passport.id);
      await shot(`${prefix}-detail-copied`);
      await expect(page.locator(".task-id-copy [role=status]")).toHaveText("");
      await desktop.evaluate(() => {
        process.emit("todo:verify-copy-failure");
      });
      await page
        .getByRole("button", { name: "Copy task id", exact: true })
        .click();
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "Couldn't copy task id. Try again." }),
      ).toBeVisible();
      await shot(`${prefix}-detail-copy-failed`);
      await page
        .getByRole("button", { name: "Dismiss copy error", exact: true })
        .click();
      await expect(
        page.getByText("Couldn't copy task id. Try again.", { exact: true }),
      ).toBeHidden();
      expect(cli("show", passport.id).task.row_version).toBe(1);
      await page.keyboard.press("Meta+f");
      await expect(field).toBeFocused();
      await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
      await field.press("Escape");
      await showing("");
      if (compact) {
        await page
          .getByRole("button", { name: "Back to tasks", exact: true })
          .click();
      } else {
        await page
          .getByRole("button", { name: "Task actions", exact: true })
          .click();
        await page
          .getByRole("menuitem", { name: "Close editor", exact: true })
          .click();
      }
      await page
        .getByRole("button", { name: "Quick add", exact: true })
        .click();
      const quick = page.getByRole("dialog", { name: "New task", exact: true });
      await expect(
        quick.getByLabel("Task title", { exact: true }),
      ).toBeFocused();
      await quick
        .getByLabel("Task title", { exact: true })
        .fill("Keep this Quick add draft");
      await expect(quick.locator("#compact-search")).toHaveCount(0);
      await expect(field).toBeVisible();
      const searchBounds = await field.boundingBox();
      const quickBounds = await quick.boundingBox();
      expect(
        searchBounds &&
          quickBounds &&
          searchBounds.y + searchBounds.height <= quickBounds.y,
      ).toBe(true);
      expect(
        await field.evaluate((input) => {
          const rect = input.getBoundingClientRect();
          return (
            document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            ) === input
          );
        }),
      ).toBe(true);
      await page.keyboard.press("Meta+f");
      await expect(field).toBeFocused();
      await expect(quick.getByLabel("Task title", { exact: true })).toHaveValue(
        "Keep this Quick add draft",
      );
      await field.fill("reno");
      await showing("reno");
      await expect(quick.getByLabel("Task title", { exact: true })).toHaveValue(
        "Keep this Quick add draft",
      );
      await shot(`${prefix}-quick-add-search`);
      await field.press("Escape");
      await showing("");
      await expect(quick).toBeVisible();
      await quick.getByRole("button", { name: "Close", exact: true }).click();
      checks.push({
        toolbarAvailable: prefix,
        detailDraftPreserved: true,
        quickAddDraftPreserved: true,
        cmdF: true,
        esc: true,
      });
    }
    if (compact) {
      await query("pasaprote", ["Renovar el pasaporte"]);
      await navigate("Inbox", true);
      await showing("pasaprote");
      await navigate("All tasks", true);
      await showing("pasaprote");
      await selectProfile(page, "personal");
      await showing("pasaprote");
      expect(await titles()).toEqual(["Personal pasaporte"]);
      await selectProfile(page, "work");
      await showing("pasaprote");
      checks.push({ compactProfileAndViewTextPersistence: true });
    }
  }
  await setAppearance(page, "light");
  await query("ovar", []);
  await query("pasaprote", ["Renovar el pasaporte"]);
  await query("pay rent", ["Rent: pay by Friday", "Pay rent today"]);
  await query('"pay rent"', ["Pay rent today"]);
  await query('"pay re', ["Pay rent today"]);
  await query("rent -draft", [
    "Rent: pay by Friday",
    "Pay rent today",
    "Rent drift",
  ]);
  await query("canción", ["😀 Canción de cuna", "Search receipt"]);
  const wire = Schema.decodeUnknownSync(Schema.Array(TaskRead))(
    await api("/profiles/work/tasks?text=cancion"),
  );
  expect(
    wire
      .toSorted((a, b) => a.title.localeCompare(b.title))
      .map((task) => [task.title, task.search_matches]),
  ).toEqual([
    ["😀 Canción de cuna", [{ field: "title", start: 3, end: 10 }]],
    ["Search receipt", [{ field: "description", start: 57, end: 64 }]],
  ]);
  expect(
    cli("list", "--text", "cancion")
      .tasks.toSorted((a: TaskRead, b: TaskRead) =>
        a.title.localeCompare(b.title),
      )
      .map((task: TaskRead) => [task.title, task.search_matches]),
  ).toEqual(
    wire
      .toSorted((a, b) => a.title.localeCompare(b.title))
      .map((task) => [task.title, task.search_matches]),
  );
  for (const error of [false, true]) {
    await query("reno", ["Renovar el pasaporte"]);
    const gate = arm("cancion", error);
    await field.fill("cancion");
    await expect.poll(() => gate.reached).toBe(true);
    await field.fill("pasaprote");
    gate.release.resolve();
    await assertRetained("pasaprote", ["Renovar el pasaporte"], "Debouncing");
    await showing("pasaprote");
    await expect(page.getByLabel("Search failed")).toHaveCount(0);
    checks.push({
      oldResponseDuringDebounce: error ? "error" : "success",
      applied: await pane.getAttribute("data-applied-identity"),
    });
    const older = arm("cancion", error);
    await field.fill("cancion");
    await expect.poll(() => older.reached).toBe(true);
    await field.fill("reno");
    await showing("reno");
    older.release.resolve();
    await page.waitForTimeout(100);
    await showing("reno");
    expect(await titles()).toEqual(["Renovar el pasaporte"]);
    checks.push({ oldResponseAfterSuccess: error ? "error" : "success" });
  }
  const aba = arm("cancion");
  await field.fill("cancion");
  await expect.poll(() => aba.reached).toBe(true);
  await field.fill("reno");
  await field.fill("cancion");
  aba.release.resolve();
  await assertRetained("cancion", ["Renovar el pasaporte"], "Debouncing");
  await showing("cancion");
  checks.push({ aba: "latest issue only" });
  const clearing = arm("reno", true);
  await field.fill("reno");
  await expect.poll(() => clearing.reached).toBe(true);
  await field.press("Escape");
  await showing("");
  clearing.release.resolve();
  await page.waitForTimeout(100);
  await showing("");
  checks.push({ clearDiscardsObsoleteError: true });
  await query("reno", ["Renovar el pasaporte"]);
  const viewGate = arm("cancion", true);
  await field.fill("cancion");
  await expect.poll(() => viewGate.reached).toBe(true);
  await navigate("Inbox", false);
  await showing("cancion");
  viewGate.release.resolve();
  await page.waitForTimeout(100);
  await showing("cancion");
  expect((await titles()).toSorted()).toEqual(
    ["Search receipt", "😀 Canción de cuna"].toSorted(),
  );
  await navigate("Tasks", false);
  await showing("cancion");
  const profileGate = arm("pasaprote", true);
  await field.fill("pasaprote");
  await expect.poll(() => profileGate.reached).toBe(true);
  await selectProfile(page, "personal");
  await showing("pasaprote");
  expect(await titles()).toEqual(["Personal pasaporte"]);
  profileGate.release.resolve();
  await page.waitForTimeout(100);
  await showing("pasaprote");
  await desktop.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("todo:notice", {
      _tag: "connection",
      profile: "work",
      state: "offline",
    });
  });
  await expect(
    page.getByRole("button", { name: "Reconnect", exact: true }),
  ).toHaveCount(0);
  await selectProfile(page, "work");
  await showing("pasaprote");
  checks.push({
    profileAndViewTextPersistence: true,
    obsoleteProfileNotice: "discarded",
  });
  failText = "cancion";
  await field.fill("cancion");
  await expect(pane).toHaveAttribute("data-search-phase", "Error");
  const beforeReconnect = eventConnections;
  failText = null;
  for (const controller of streams) controller.close();
  streams.clear();
  await expect.poll(() => eventConnections).toBeGreaterThan(beforeReconnect);
  await showing("cancion");
  checks.push({
    automaticRecovery: "SSE reconnect",
    requestedText: "cancion",
    eventConnections,
  });
  failText = "reno";
  await field.fill("reno");
  await expect(pane).toHaveAttribute("data-search-phase", "Error");
  failText = null;
  cli("add", "Renovar SSE op recovery");
  await showing("reno");
  expect((await titles()).toSorted()).toEqual(
    ["Renovar el pasaporte", "Renovar SSE op recovery"].toSorted(),
  );
  checks.push({
    automaticRecovery: "current-Profile SSE op",
    titles: await titles(),
  });
  const project = await page
    .getByLabel("Filter by Project")
    .locator("option")
    .filter({ hasText: "Search Project" })
    .getAttribute("value");
  const tag = await page
    .getByLabel("Filter by Tag")
    .locator("option")
    .filter({ hasText: "search-tag" })
    .getAttribute("value");
  if (!project || !tag) throw new Error("Missing metadata filter options");
  await page.getByLabel("Filter by Project").selectOption(project);
  await page.getByLabel("Filter by Tag").selectOption(tag);
  await showing("reno");
  expect(await titles()).toEqual(["Renovar el pasaporte"]);
  checks.push({ projectTagAndText: true });
  await field.fill("");
  await showing("");
  const selectorClearStart = receipts.length;
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await showing("");
  const selectorClearReads = receipts
    .slice(selectorClearStart)
    .filter(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "path" in entry &&
        typeof entry.path === "string" &&
        /^\/profiles\/work\/tasks(?:\?|$)/.test(entry.path),
    );
  expect(selectorClearReads).toHaveLength(1);
  checks.push({ selectorClearReads: 1 });
  await expect(page.locator(".search-excerpt")).toHaveCount(0);
  await query("cancion", ["😀 Canción de cuna", "Search receipt"]);
  const staleDescription = arm("reno");
  await field.fill("reno");
  await expect.poll(() => staleDescription.reached).toBe(true);
  expect(await page.locator(".search-excerpt mark").allTextContents()).toEqual([
    "Canción",
  ]);
  expect(
    JSON.parse((await pane.getAttribute("data-applied-identity")) ?? "null")
      .text,
  ).toBe("cancion");
  staleDescription.release.resolve();
  await showing("reno");
  checks.push({ staleDescriptionKeepsAppliedSpans: true });
  for (const [index, error] of [false, true].entries()) {
    await query("cancion", ["😀 Canción de cuna", "Search receipt"]);
    const old = arm("reno", error);
    await field.fill("reno");
    await expect.poll(() => old.reached).toBe(true);
    const title =
      index === 0 ? "😀 Renovar newest snapshot" : "😀 Renovar final snapshot";
    cli(
      "edit",
      passport.id,
      "--expected-version",
      String(index + 1),
      "--title",
      title,
    );
    await expect(
      page.locator(`[data-task-id="${passport.id}"] .task-title`),
    ).toHaveText(title);
    await showing("reno");
    old.release.resolve();
    await page.waitForTimeout(100);
    await showing("reno");
    await expect(
      page.locator(`[data-task-id="${passport.id}"] .task-title`),
    ).toHaveText(title);
    expect(
      await page
        .locator(`[data-task-id="${passport.id}"] .task-title mark`)
        .allTextContents(),
    ).toEqual(["Renovar"]);
    await expect(page.getByLabel("Search failed")).toHaveCount(0);
    checks.push({
      sameQuerySseRace: error ? "obsolete error" : "obsolete success",
      title,
    });
  }
  const catalogProfile = "catalog-r1";
  const initialized = spawnSync(
    join(scratch, "todo"),
    ["--profile", catalogProfile, "--format", "json", "init"],
    { env, encoding: "utf8" },
  );
  receipts.push({
    cli: ["--profile", catalogProfile, "init"],
    exit: initialized.status,
    stdout: initialized.stdout,
    stderr: initialized.stderr,
  });
  expect(initialized.status).toBe(0);
  await api(`/profiles/${catalogProfile}/tasks`, "POST", {
    title: "Renovar catalog",
    project_name: "Catalog original",
    tag_names: ["catalog-original"],
  });
  await navigate("Tasks", false);
  await showing("reno");
  await selectProfile(page, catalogProfile);
  await field.fill("reno");
  await showing("reno");
  await expect
    .poll(() => {
      const path = join(scratch, "electron", "operations.json");
      if (!existsSync(path)) return 0;
      const operations = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.Struct({ profile: Schema.String, kind: Schema.String }),
        ),
      )(JSON.parse(readFileSync(path, "utf8")));
      return operations.filter(
        (entry) =>
          entry.profile === catalogProfile && entry.kind === "TaskCreated",
      ).length;
    })
    .toBe(1);
  await expect
    .poll(
      () =>
        filteredReplies.filter(
          (reply) =>
            reply.text === "reno" &&
            reply.tasks.some((task) => task.profile_id === catalogProfile),
        ).length,
    )
    .toBeGreaterThanOrEqual(2);
  await showing("reno");
  const catalogCount = page
    .getByRole("navigation", { name: "Planning views" })
    .getByRole("button", { name: /^Tasks/ })
    .locator(".nav-count");
  await expect(catalogCount).toHaveText("1");
  for (const [index, failing] of [false, true].entries()) {
    const currentText = index === 0 ? "reno" : "renov";
    const nextText = index === 0 ? "renov" : "reno";
    const oldFull = arm(currentText, failing, catalogProfile);
    const projectName = `Updated catalog ${index}`;
    const tagName = `updated-catalog-${index}`;
    await api(`/profiles/${catalogProfile}/tasks`, "POST", {
      title: `Catalog sentinel ${index}`,
      project_name: projectName,
      tag_names: [tagName],
    });
    await expect.poll(() => oldFull.reached).toBe(true);
    await field.fill(nextText);
    await showing(nextText);
    expect(await titles()).toEqual(["Renovar catalog"]);
    await expect(catalogCount).toHaveText(index === 0 ? "2" : "3");
    await expect(
      page
        .getByLabel("Filter by Project")
        .locator("option")
        .filter({ hasText: projectName }),
    ).toHaveCount(1);
    await expect(
      page
        .getByLabel("Filter by Tag")
        .locator("option")
        .filter({ hasText: tagName }),
    ).toHaveCount(1);
    await openProfileDeletion(page, catalogProfile);
    await expect(
      page.getByRole("dialog", { name: 'Delete "catalog-r1"?' }),
    ).toContainText(index === 0 ? /2 tasks/i : /3 tasks/i);
    await page
      .getByRole("dialog", { name: 'Delete "catalog-r1"?' })
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    oldFull.release.resolve();
    await page.waitForTimeout(100);
    await showing(nextText);
    await expect(catalogCount).toHaveText(index === 0 ? "2" : "3");
    await expect(
      page
        .getByLabel("Filter by Project")
        .locator("option")
        .filter({ hasText: projectName }),
    ).toHaveCount(1);
    await expect(page.getByLabel("Search failed")).toHaveCount(0);
    checks.push({
      fullSupersededByQuery: failing ? "obsolete error" : "obsolete success",
      owedCatalogRefreshed: true,
      taskCount: index === 0 ? 2 : 3,
      projectName,
      tagName,
    });
  }
  const failedFull = arm("reno", true, catalogProfile);
  await api(`/profiles/${catalogProfile}/tasks`, "POST", {
    title: "Catalog sentinel 2",
    project_name: "Updated catalog 2",
    tag_names: ["updated-catalog-2"],
  });
  await expect.poll(() => failedFull.reached).toBe(true);
  failedFull.release.resolve();
  await expect(pane).toHaveAttribute("data-search-phase", "Error");
  await expect(catalogCount).toHaveText("3");
  await field.fill("renov");
  await showing("renov");
  await expect(catalogCount).toHaveText("4");
  await expect(
    page
      .getByLabel("Filter by Project")
      .locator("option")
      .filter({ hasText: "Updated catalog 2" }),
  ).toHaveCount(1);
  await expect(
    page
      .getByLabel("Filter by Tag")
      .locator("option")
      .filter({ hasText: "updated-catalog-2" }),
  ).toHaveCount(1);
  expect(await titles()).toEqual(["Renovar catalog"]);
  checks.push({ queryAfterFailedFullRefreshesCatalog: true, taskCount: 4 });
  await selectProfile(page, "work");
  await field.fill("reno");
  await showing("reno");
  await page.getByRole("button", { name: "More filters", exact: true }).click();
  await page.getByLabel("Priority", { exact: true }).selectOption("P2");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await showing("reno");
  const dialogError = arm("cancion", true);
  await field.fill("cancion");
  await expect.poll(() => dialogError.reached).toBe(true);
  await page.getByRole("button", { name: "More filters", exact: true }).click();
  await page.getByLabel("Priority", { exact: true }).selectOption("P3");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await showing("cancion");
  dialogError.release.resolve();
  await page.waitForTimeout(100);
  await showing("cancion");
  await expect(page.getByLabel("Active filters")).toHaveText("P3");
  expect(await titles()).toEqual([]);
  await page.getByRole("button", { name: "More filters", exact: true }).click();
  await expect(page.getByLabel("Priority", { exact: true })).toHaveValue("P3");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  checks.push({ obsoleteErrorCannotRollbackDialog: true });
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await showing("cancion");
  failText = "reno";
  await field.fill("reno");
  await expect(pane).toHaveAttribute("data-search-phase", "Error");
  failText = null;
  await field.fill("cancion");
  await showing("cancion");
  checks.push({ inputRecoversError: true });
  await page.getByRole("button", { name: "More filters", exact: true }).click();
  await page.getByLabel("Priority", { exact: true }).selectOption("P2");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await showing("cancion");
  failText = "cancion";
  await page.getByRole("button", { name: "More filters", exact: true }).click();
  await page.getByLabel("Priority", { exact: true }).selectOption("P3");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText:
        "Could not apply filters. Your previous filters are still active.",
    }),
  ).toBeVisible();
  await expect(field).toHaveValue("cancion");
  await expect(page.getByLabel("Active filters")).toHaveText("P2");
  expect((await titles()).toSorted()).toEqual(
    ["😀 Canción de cuna", "Search receipt"].toSorted(),
  );
  failText = null;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await showing("cancion");
  checks.push({ currentDialogFailureRollsBackAndRetainsText: true });
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await field.fill("");
  await showing("");
  const broadTasks = [];
  for (let index = 0; index < 3; index++)
    broadTasks.push(
      Schema.decodeUnknownSync(Task)(
        await api("/profiles/work/tasks", "POST", {
          title: `Budget probe ${index}`,
          description: "\ufdfa".repeat(100000),
        }),
      ),
    );
  await expect
    .poll(
      async () =>
        (await titles()).filter((title) => title.startsWith("Budget probe "))
          .length,
    )
    .toBe(3);
  const unsearchedTitles = await titles();
  await field.fill("probe");
  await expect(pane).toHaveAttribute("data-search-phase", "Error");
  await expect(field).toBeFocused();
  const recovery =
    "Search is too broad. Narrow the search with a Project, Tag or Status filter, use fewer or shorter words, or quote a phrase.";
  const expectRefusal = async (context: string) => {
    await expect(page.getByLabel("Search failed").locator("span")).toHaveText(
      recovery,
    );
    await expect(
      page.getByLabel("Search failed").locator(".search-error-context"),
    ).toHaveText(context);
    await expect(
      page
        .getByLabel("Search failed")
        .getByRole("button", { name: "Retry", exact: true }),
    ).toHaveCount(0);
  };
  await expectRefusal("Showing tasks without search.");
  expect(await titles()).toEqual(unsearchedTitles);
  let shrinking = broadTasks[0];
  if (!shrinking) throw new Error("Missing budget recovery Task");
  const resizeDescription = async (description: string) => {
    if (!shrinking) throw new Error("Missing budget recovery Task");
    shrinking = Schema.decodeUnknownSync(Task)(
      await api(`/profiles/work/tasks/${shrinking.id}`, "PATCH", {
        from_version: shrinking.row_version,
        changes: { description },
      }),
    );
  };
  await resizeDescription("Small description");
  await showing("probe");
  await field.fill("rent");
  await showing("rent");
  const retainedTitles = await titles();
  expect(retainedTitles.length).toBeGreaterThan(0);
  await resizeDescription("\ufdfa".repeat(100000));
  await expect(pane).toHaveAttribute("data-search-phase", "Error");
  await field.fill("probe");
  await expect(pane).toHaveAttribute("data-search-phase", "Error");
  await expect(field).toBeFocused();
  for (const compact of [false, true]) {
    if (compact)
      await page
        .getByRole("button", { name: "Compact mode", exact: true })
        .click();
    for (const theme of ["light", "dark"] as const) {
      await setAppearance(page, theme);
      await expectRefusal('Showing results for "rent".');
      await expect(field).toHaveValue("probe");
      expect(
        await page
          .getByLabel("Search failed")
          .locator("span")
          .evaluate((element) => element.scrollHeight <= element.clientHeight),
      ).toBe(true);
      expect(await titles()).toEqual(retainedTitles);
      await shot(`${compact ? "compact" : "full"}-${theme}-budget-error`);
    }
  }
  await resizeDescription("Small description");
  await showing("probe");
  expect((await titles()).toSorted()).toEqual([
    "Budget probe 0",
    "Budget probe 1",
    "Budget probe 2",
  ]);
  await expect(page.getByLabel("Search failed")).toHaveCount(0);
  checks.push({
    deterministicRefusal: true,
    retryAbsent: true,
    typedText: "probe",
    contextWithoutSearch: "Showing tasks without search.",
    contextWithSearch: 'Showing results for "rent".',
    retainedTitles,
    recoveryBySseAfterShrink: true,
  });
  await field.fill("");
  await showing("");
  for (const task of broadTasks) {
    const latest = Schema.decodeUnknownSync(Task)(
      await api(`/profiles/work/tasks/${task.id}`),
    );
    cli("rm", latest.id, "--expected-version", String(latest.row_version));
  }
  const scopeTasks = [];
  for (let index = 0; index < 3; index++)
    scopeTasks.push(
      Schema.decodeUnknownSync(Task)(
        await api("/profiles/work/tasks", "POST", {
          title: `Scope probe ${index}`,
          description: "ordinary",
          project_name: index === 0 ? "Small" : "Other",
          tag_names: [index === 0 ? "keep" : "other"],
        }),
      ),
    );
  const scope = scopeTasks[0];
  if (!scope) throw new Error("Missing scoped Task");
  await field.fill("probe");
  await showing("probe");
  const ordinary = filteredReplies.findLast(
    (reply) => reply.text === "probe",
  )?.tasks;
  if (!ordinary) throw new Error("Missing ordinary response");
  for (const [selector, label, id] of [
    ["Filter by Project", "Small", scope.project_id],
    ["Filter by Tag", "keep", scope.tags[0]],
  ] as const) {
    if (!id) throw new Error("Missing definition id");
    await page.getByLabel("Filter by Project").selectOption("");
    await showing("probe");
    await page.getByLabel("Filter by Tag").selectOption("");
    await showing("probe");
    await page.getByLabel(selector).selectOption(id);
    await showing("probe");
    expect(await titles()).toEqual(["Scope probe 0"]);
    expect(await page.locator(".task-title mark").allTextContents()).toEqual([
      "probe",
    ]);
    const after = filteredReplies.findLast(
      (reply) => reply.text === "probe",
    )?.tasks;
    expect(JSON.stringify(after?.filter((row) => row.id === scope.id))).toBe(
      JSON.stringify(ordinary.filter((row) => row.id === scope.id)),
    );
    checks.push({ ordinaryScope: label, byteIdenticalRowsAndSpans: true });
  }
  await field.fill("");
  await showing("");
  await page.getByLabel("Filter by Tag").selectOption("");
  await showing("");
  for (const task of scopeTasks)
    await api(`/profiles/work/tasks/${task.id}`, "PATCH", {
      from_version: 1,
      changes: { description: "\ufdfa".repeat(100000) },
    });
  await field.fill("probe");
  await expect(pane).toHaveAttribute("data-search-phase", "Error");
  for (const [selector, id] of [
    ["Filter by Project", scope.project_id],
    ["Filter by Tag", scope.tags[0]],
  ] as const) {
    if (!id) throw new Error("Missing definition id");
    await field.fill("");
    await showing("");
    await page.getByLabel("Filter by Project").selectOption("");
    await showing("");
    await page.getByLabel("Filter by Tag").selectOption("");
    await showing("");
    await page.getByLabel(selector).selectOption(id);
    await showing("");
    await field.fill("probe");
    await showing("probe");
    expect(await titles()).toEqual(["Scope probe 0"]);
    await expect(page.getByLabel("Search failed")).toHaveCount(0);
    expect(
      filteredReplies
        .findLast((reply) => reply.text === "probe")
        ?.tasks.map((row) => ({
          id: row.id,
          search_matches: row.search_matches,
        })),
    ).toEqual([
      { id: scope.id, search_matches: [{ field: "title", start: 6, end: 11 }] },
    ]);
  }
  expect(
    cli("list", "--text", "probe", "--project", "Small").tasks.map(
      (row: TaskRead) => ({
        title: row.title,
        search_matches: row.search_matches,
      }),
    ),
  ).toEqual([
    {
      title: "Scope probe 0",
      search_matches: [{ field: "title", start: 6, end: 11 }],
    },
  ]);
  expect(
    cli("list", "--text", "probe", "--tag", "keep").tasks.map(
      (row: TaskRead) => ({
        title: row.title,
        search_matches: row.search_matches,
      }),
    ),
  ).toEqual([
    {
      title: "Scope probe 0",
      search_matches: [{ field: "title", start: 6, end: 11 }],
    },
  ]);
  checks.push({ projectAndTagRecoverMeteredWork: true });
  await field.fill("");
  await showing("");
  await page.getByLabel("Filter by Project").selectOption("");
  await showing("");
  await page.getByLabel("Filter by Tag").selectOption("");
  await showing("");
  for (const task of scopeTasks)
    await api(`/profiles/work/tasks/${task.id}`, "PATCH", {
      from_version: 2,
      changes: { description: "ordinary" },
    });
  const recoverySeed =
    process.env.SEC_SEARCH_RECOVERY_SEED ??
    join(scratch, "search-recovery-seed");
  if (process.env.SEC_SEARCH_RECOVERY_SEED === undefined) {
    const compiled = spawnSync(
      "bun",
      [
        "build",
        "--compile",
        resolve(
          import.meta.dirname,
          "../../../.agents/skills/verify-task-search/seed-recovery.ts",
        ),
        "--outfile",
        recoverySeed,
      ],
      { cwd: scratch, encoding: "utf8" },
    );
    receipts.push({
      compiledRecoverySeed: recoverySeed,
      exit: compiled.status,
      stderr: compiled.stderr,
    });
    expect(compiled.status).toBe(0);
  }
  const seeded = spawnSync(recoverySeed, ["work"], { env, encoding: "utf8" });
  receipts.push({
    compiledRawAppendSeed: "keep/KEEP from raw append or old data",
    exit: seeded.status,
    stderr: seeded.stderr,
  });
  expect(seeded.status).toBe(0);
  const collision = Schema.decodeUnknownSync(
    Schema.Array(Schema.Struct({ task: Task })),
  )(JSON.parse(seeded.stdout));
  await field.fill("collision");
  await showing("collision");
  await expect.poll(async () => (await titles()).length).toBe(2);
  const allCollision = filteredReplies.findLast(
    (reply) => reply.text === "collision",
  )?.tasks;
  if (!allCollision) throw new Error("Missing collision response");
  for (const item of collision) {
    const tagId = item.task.tags[0];
    if (!tagId) throw new Error("Missing case-fold Tag id");
    await page.getByLabel("Filter by Tag").selectOption(tagId);
    await showing("collision");
    expect(await titles()).toEqual([item.task.title]);
    expect(await page.locator(".task-title mark").allTextContents()).toEqual([
      "Collision",
    ]);
    const superset = filteredReplies.findLast(
      (reply) => reply.text === "collision",
    )?.tasks;
    expect(superset?.length).toBe(2);
    expect(
      JSON.stringify(superset?.filter((row) => row.tags.includes(tagId))),
    ).toBe(
      JSON.stringify(allCollision.filter((row) => row.tags.includes(tagId))),
    );
  }
  checks.push({ rawAppendCaseFoldTagSupersetKeepsSelectedId: true });
  await page.getByLabel("Filter by Tag").selectOption("");
  await showing("collision");
  syntheticProjectSuperset = true;
  await field.fill("");
  await showing("");
  await field.fill("collision");
  await showing("collision");
  for (const item of collision) {
    if (!item.task.project_id) throw new Error("Missing Project id");
    await page
      .getByLabel("Filter by Project")
      .selectOption(item.task.project_id);
    await showing("collision");
    expect(await titles()).toEqual([item.task.title]);
    expect(await page.locator(".task-title mark").allTextContents()).toEqual([
      "Collision",
    ]);
    const superset = filteredReplies.findLast(
      (reply) => reply.text === "collision",
    )?.tasks;
    expect(superset?.length).toBe(2);
    expect(
      JSON.stringify(
        superset?.filter((row) => row.project_id === item.task.project_id),
      ),
    ).toBe(
      JSON.stringify(
        allCollision.filter((row) => row.project_id === item.task.project_id),
      ),
    );
  }
  checks.push({ syntheticSameNameProjectSupersetKeepsSelectedId: true });
  syntheticProjectSuperset = false;
  expect(pageErrors).toEqual([]);
  await page.screenshot({
    path: join(evidence, "tasks.png"),
    animations: "disabled",
  });
  await desktop.context().tracing.stop({ path: join(evidence, "trace.zip") });
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "THIN_PASS_NATIVE_BLOCKED",
        taskSearch: true,
        pageErrors,
        native:
          "HOLD: unsigned scratch host; signing, Keychain, native app and production cursor persistence unproven",
      },
      null,
      2,
    ),
  );
} catch (error) {
  writeFileSync(join(evidence, "failure.txt"), String(error));
  if (desktop) {
    const page = desktop.windows()[0];
    if (page) {
      await page.screenshot({ path: join(evidence, "failure.png") });
      writeFileSync(join(evidence, "failure-dom.html"), await page.content());
    }
  }
  throw error;
} finally {
  for (const gate of held) gate.release.resolve();
  if (desktop) await desktop.close();
  proxy.stop(true);
  await stopServer();
  writeFileSync(join(evidence, "server.log"), log);
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(receipts, null, 2),
  );
  writeFileSync(
    join(evidence, "task-search.json"),
    JSON.stringify(checks, null, 2),
  );
  writeFileSync(
    join(evidence, "binary-provenance.json"),
    readFileSync(
      resolve(import.meta.dirname, "../../../.scratch/bin/build.json"),
    ),
  );
}
