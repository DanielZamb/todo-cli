import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect } from "@playwright/test";
import { CONTRACT_ID } from "@todo/api";
import { ProfileId, Task } from "@todo/domain";
import { Schema } from "effect";
import { setAppearance } from "./appearance.ts";
import { selectProfile } from "./profile-menu.ts";

const [scratch, evidence] = process.argv.slice(2);
if (
  !scratch?.includes("todo-s01-verify-") ||
  !evidence ||
  process.env.TODO_ELECTRON_VERIFY_HOST !== "1"
)
  throw new Error("Scratch compiled host only");
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
server.stdout.on("data", (data) => {
  log += data;
});
server.stderr.on("data", (data) => {
  log += data;
});
let upstream = "";
let mode: "old" | "fake" | "live" = "old";
const requests: { mode: string; method: string; path: string }[] = [];
const proxy = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url);
    requests.push({
      mode,
      method: request.method,
      path: url.pathname + url.search,
    });
    if (url.pathname === "/health" && mode !== "live")
      return Response.json(
        mode === "old"
          ? { service: "todo-server" }
          : {
              service: "todo-server",
              build: "verify-old",
              contract: "stale-contract",
            },
      );
    return fetch(upstream + url.pathname + url.search, {
      method: request.method,
      headers: request.headers,
      ...(request.method === "GET" ? {} : { body: await request.text() }),
    });
  },
});
let desktop: ElectronApplication | undefined;
const layouts: unknown[] = [];
try {
  await expect
    .poll(() => log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1], {
      timeout: 60000,
    })
    .toBeTruthy();
  upstream = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
  expect(await (await fetch(upstream + "/health")).json()).toMatchObject({
    service: "todo-server",
    contract: CONTRACT_ID,
  });
  execFileSync(
    join(scratch, "todo"),
    ["--profile", "guardrails", "--format", "json", "init"],
    { env },
  );
  const session = Schema.decodeUnknownSync(
    Schema.Struct({ credential: Schema.String }),
  )(
    await (
      await fetch(upstream + "/auth/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: "scratch verification passphrase" }),
      })
    ).json(),
  );
  const api = async (path: string, payload: unknown) => {
    const response = await fetch(upstream + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.credential}`,
      },
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(200);
    return Schema.decodeUnknownSync(Task)(await response.json());
  };
  for (const [title, action] of [
    ["Guardrail open", null],
    ["Guardrail open two", null],
    ["Guardrail done", "complete"],
    ["Guardrail cancelled", "cancel"],
  ] as const) {
    const task = await api("/profiles/guardrails/tasks", { title });
    if (action)
      await api(`/profiles/guardrails/tasks/${task.id}/transition`, {
        from_version: 1,
        action,
      });
  }
  desktop = await _electron.launch({
    executablePath: createRequire(import.meta.url)("electron"),
    args: [resolve(import.meta.dirname, "../dist/verification/write-host.mjs")],
    env: {
      ...env,
      TODO_ELECTRON_DATA: join(scratch, "electron"),
      TODO_SERVER_URL: `http://127.0.0.1:${proxy.port}`,
    },
    timeout: 60000,
  });
  const page = await desktop.firstWindow();
  page.setDefaultTimeout(30000);
  const heading = page.getByRole("heading", {
    name: "Todo server is out of date",
    exact: true,
  });
  await expect(heading).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("unknown");
  const oldReply = await page.evaluate(
    (profile) =>
      window.desktop.request({ _tag: "list", profile, view: "tasks" }),
    Schema.decodeUnknownSync(ProfileId)("guardrails"),
  );
  expect(oldReply._tag).toBe("outdatedServer");
  mode = "fake";
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("verify-old");
  for (const compact of [true, false]) {
    await page
      .getByRole("button", {
        name: compact ? "Compact mode" : "Expand window",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: compact ? "Expand window" : "Compact mode",
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        desktop?.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.getContentSize(),
        ),
      )
      .toMatchObject(compact ? [393, 426] : [1280, expect.any(Number)]);
    layouts.push({
      compact,
      mode,
      size: await desktop.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.getContentSize(),
      ),
      controls: await page.locator("button").evaluateAll((buttons) =>
        buttons.map((button) => ({
          name: button.getAttribute("aria-label") ?? button.textContent,
          visible: button.getBoundingClientRect().width > 0,
        })),
      ),
    });
    writeFileSync(
      join(evidence, "layout-states.json"),
      JSON.stringify(layouts, null, 2),
    );
    for (const appearance of ["light", "dark"] as const) {
      await setAppearance(page, appearance);
      await expect(heading).toBeVisible();
      const bounds = await page.getByRole("alert").boundingBox();
      expect(bounds).not.toBeNull();
      expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
        page.viewportSize()?.height ?? (compact ? 426 : 927),
      );
      await page.screenshot({
        path: join(
          evidence,
          `outdated-${compact ? "compact" : "full"}-${appearance}.png`,
        ),
        animations: "disabled",
      });
    }
  }
  expect(
    requests.filter(
      (request) =>
        request.mode !== "live" &&
        /^\/profiles\/[^/]+\/tasks/.test(request.path),
    ),
  ).toEqual([]);
  mode = "live";
  const stillBlocked = await page.evaluate(
    (profile) =>
      window.desktop.request({ _tag: "list", profile, view: "tasks" }),
    Schema.decodeUnknownSync(ProfileId)("guardrails"),
  );
  expect(stillBlocked._tag).toBe("outdatedServer");
  expect(
    requests.filter((request) =>
      /^\/profiles\/[^/]+\/tasks/.test(request.path),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await page
    .getByLabel("Owner passphrase", { exact: true })
    .fill("scratch verification passphrase");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await selectProfile(page, "guardrails");
  const titles = () =>
    page
      .locator(".task-row .task-title")
      .allTextContents()
      .then((titles) => titles.sort());
  const navigate = async (compact: boolean, name: string) => {
    if (compact) {
      await page
        .getByRole("button", { name: "Navigate tasks", exact: true })
        .click();
      await page
        .getByRole("menuitemradio", { name: new RegExp(`^${name}`) })
        .click();
    } else
      await page
        .getByRole("navigation", { name: "Planning views" })
        .getByRole("button", { name: new RegExp(`^${name}`) })
        .click();
  };
  const receipt: unknown[] = [];
  for (const compact of [true, false]) {
    await page
      .getByRole("button", {
        name: compact ? "Compact mode" : "Expand window",
        exact: true,
      })
      .click();
    await expect(
      page.locator(compact ? ".shell.compact" : ".shell:not(.compact)"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: compact ? "Expand window" : "Compact mode",
        exact: true,
      }),
    ).toBeVisible();
    for (const appearance of ["light", "dark"] as const) {
      await setAppearance(page, appearance);
      await navigate(compact, compact ? "All tasks" : "Tasks");
      for (const [status, expected] of [
        ["open", ["Guardrail open", "Guardrail open two"]],
        ["closed", ["Guardrail cancelled", "Guardrail done"]],
      ] as const) {
        await page
          .getByRole("button", { name: "More filters", exact: true })
          .click();
        const dialog = page.getByRole("dialog", {
          name: "Filter tasks",
          exact: true,
        });
        await expect(
          dialog.getByLabel("Status", { exact: true }),
        ).toBeEnabled();
        await dialog.getByLabel("Status", { exact: true }).selectOption(status);
        await dialog
          .getByRole("button", { name: "Apply filters", exact: true })
          .click();
        await expect.poll(titles).toEqual(expected);
        receipt.push({ compact, appearance, status, titles: await titles() });
      }
      await navigate(compact, "Inbox");
      await expect
        .poll(titles)
        .toEqual(["Guardrail open", "Guardrail open two"]);
      await page
        .getByRole("button", { name: "More filters", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Filter tasks",
        exact: true,
      });
      await expect(dialog.getByLabel("Status", { exact: true })).toBeDisabled();
      await expect(
        dialog.getByText("Planning views show open Tasks only.", {
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: join(
          evidence,
          `planning-status-${compact ? "compact" : "full"}-${appearance}.png`,
        ),
        animations: "disabled",
      });
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    }
  }
  await page.screenshot({
    path: join(evidence, "tasks.png"),
    animations: "disabled",
  });
  writeFileSync(
    join(evidence, "requests.json"),
    JSON.stringify(requests, null, 2),
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "THIN_PASS_NATIVE_BLOCKED",
        oldHealthBlocked: true,
        fakeContractBlocked: true,
        staleTaskRequests: [],
        filters: receipt,
        nativeUI: "HOLD",
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (desktop) {
    const page = await desktop.firstWindow();
    await page.screenshot({ path: join(evidence, "failure.png") });
    writeFileSync(join(evidence, "failure.html"), await page.content());
  }
  throw error;
} finally {
  if (desktop) await desktop.close();
  proxy.stop(true);
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise<void>((done) =>
      server.once("exit", () => done()),
    );
    const timer = setTimeout(() => server.kill("SIGKILL"), 2000);
    server.kill("SIGTERM");
    await stopped;
    clearTimeout(timer);
  }
  writeFileSync(join(evidence, "server.log"), log);
}
