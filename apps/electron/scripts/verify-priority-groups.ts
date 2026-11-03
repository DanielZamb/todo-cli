import { execFileSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { _electron, type ElectronApplication, expect } from "@playwright/test";
import { CONTRACT_ID } from "@todo/api";
import { Task } from "@todo/domain";
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
let log = "";
const server = spawn(join(scratch, "server"), [], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
writeFileSync(
  join(evidence, "server.json"),
  JSON.stringify({ pid: server.pid, database: env.TODO_DB }),
);
server.stdout.on("data", (chunk) => {
  log += chunk;
});
server.stderr.on("data", (chunk) => {
  log += chunk;
});
let desktop: ElectronApplication | undefined;
const layouts: unknown[] = [];
try {
  await expect
    .poll(() => log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1], {
      timeout: 60000,
    })
    .toBeTruthy();
  const url = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
  expect(await (await fetch(`${url}/health`)).json()).toMatchObject({
    service: "todo-server",
    contract: CONTRACT_ID,
  });
  execFileSync(
    join(scratch, "todo"),
    ["--profile", "ui01-groups", "--format", "json", "init"],
    { env },
  );
  const session = Schema.decodeUnknownSync(
    Schema.Struct({ credential: Schema.String }),
  )(
    await (
      await fetch(`${url}/auth/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: "scratch verification passphrase" }),
      })
    ).json(),
  );
  const api = async (path: string, method: string, payload?: unknown) => {
    const response = await fetch(url + path, {
      method,
      headers: {
        Authorization: `Bearer ${session.credential}`,
        "Content-Type": "application/json",
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    expect(response.status).toBe(200);
    return response.json();
  };
  desktop = await _electron.launch({
    executablePath: createRequire(import.meta.url)("electron"),
    args: [resolve(import.meta.dirname, "../dist/verification/write-host.mjs")],
    env: {
      ...env,
      TODO_SERVER_URL: url,
      TODO_ELECTRON_DATA: join(scratch, "electron"),
    },
    timeout: 60000,
  });
  const page = await desktop.firstWindow();
  page.setDefaultTimeout(15000);
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await selectProfile(page, "ui01-groups");
  await page.getByRole("button", { name: "Compact mode", exact: true }).click();
  await expect(page.locator(".shell.compact")).toBeVisible();
  const groups = page.locator(".task-pane section[aria-label]");
  await expect
    .poll(() =>
      groups.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label")),
      ),
    )
    .toEqual(["P1", "P2", "P3", "P4"]);
  await expect(groups.locator(".empty-priority")).toHaveCount(4);
  const measure = async (screen: string) => {
    const geometry = await page
      .locator(".whole-task-groups")
      .evaluate((viewport) => {
        const top = Number(viewport.getAttribute("data-visible-top"));
        const bottom = Number(viewport.getAttribute("data-visible-bottom"));
        return {
          top,
          bottom,
          rows: Array.from(viewport.querySelectorAll(".task-row"), (row) => {
            const frame = row.getBoundingClientRect();
            return {
              top: frame.top,
              bottom: frame.bottom,
              height: frame.height,
            };
          }),
        };
      });
    expect(geometry.bottom).toBeGreaterThan(geometry.top);
    for (const row of geometry.rows) {
      expect(row.height).toBe(56);
      if (row.bottom > geometry.top + 0.5 && row.top < geometry.bottom - 0.5) {
        expect(row.top).toBeGreaterThanOrEqual(geometry.top - 0.5);
        expect(row.bottom).toBeLessThanOrEqual(geometry.bottom + 0.5);
      }
    }
    const primary = await page
      .getByRole("button", { name: "Quick add", exact: true })
      .boundingBox();
    expect(primary).not.toBeNull();
    expect((primary?.y ?? 0) + (primary?.height ?? 0)).toBeLessThanOrEqual(426);
    layouts.push({ screen, ...geometry, primaryAction: "Quick add" });
  };
  for (const appearance of ["light", "dark"] as const) {
    await setAppearance(page, appearance);
    await measure(`empty-${appearance}`);
    await page.screenshot({
      path: join(evidence, `priority-compact-empty-${appearance}.png`),
      animations: "disabled",
    });
  }
  const created: (typeof Task.Type)[] = [];
  for (const [priority, title] of [
    ["P4", "Review someday ideas"],
    ["P1", "Ship priority groups"],
    ["P3", "Review the release notes"],
    ["P1", "Check Compact row bounds"],
  ])
    created.push(
      Schema.decodeUnknownSync(Task)(
        await api("/profiles/ui01-groups/tasks", "POST", { title, priority }),
      ),
    );
  await expect(page.locator(".task-row")).toHaveCount(4);
  const membership = async () =>
    groups.evaluateAll((nodes) =>
      nodes.map((node) => ({
        priority: node.getAttribute("aria-label"),
        titles: Array.from(
          node.querySelectorAll(".task-title"),
          (title) => title.textContent,
        ).sort(),
      })),
    );
  const expected = [
    {
      priority: "P1",
      titles: ["Check Compact row bounds", "Ship priority groups"],
    },
    { priority: "P2", titles: [] },
    { priority: "P3", titles: ["Review the release notes"] },
    { priority: "P4", titles: ["Review someday ideas"] },
  ];
  await expect.poll(membership).toEqual(expected);
  await page.reload();
  await expect.poll(membership).toEqual(expected);
  for (const compact of [true, false]) {
    if (!compact) {
      await page
        .getByRole("button", { name: "Expand window", exact: true })
        .click();
      await expect(page.locator(".shell:not(.compact)")).toBeVisible();
    }
    for (const appearance of ["light", "dark"] as const) {
      await setAppearance(page, appearance);
      await expect.poll(membership).toEqual(expected);
      const bounds = await page.locator(".task-pane").evaluate((pane) => {
        const viewport = pane.getBoundingClientRect();
        return {
          viewport: { top: viewport.top, bottom: viewport.bottom },
          rows: Array.from(pane.querySelectorAll(".task-row"), (row) => {
            const r = row.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, height: r.height };
          }),
        };
      });
      if (compact) {
        await measure(`ready-${appearance}`);
        for (const row of bounds.rows) expect(row.height).toBe(56);
        await expect(
          page.getByRole("button", { name: "Quick add", exact: true }),
        ).toBeVisible();
      }
      layouts.push({
        compact,
        appearance,
        ...bounds,
        membership: await membership(),
      });
      await page.screenshot({
        path: join(
          evidence,
          `priority-${compact ? "compact" : "full"}-${appearance}.png`,
        ),
        animations: "disabled",
      });
    }
  }
  await page.getByRole("button", { name: "Compact mode", exact: true }).click();
  await expect(page.locator(".shell.compact")).toBeVisible();
  for (let index = 1; index <= 7; index++)
    await api("/profiles/ui01-groups/tasks", "POST", {
      title: `Dense priority Task ${index}`,
      priority: "P1",
      tag_names: ["review"],
    });
  await expect(page.locator(".task-row")).toHaveCount(11);
  for (const appearance of ["light", "dark"] as const) {
    await setAppearance(page, appearance);
    for (const [position, offset] of [
      ["top", 0],
      ["scrolled", 53],
      ["bottom", 10000],
    ] as const) {
      await page.locator(".whole-task-groups").evaluate((viewport, offset) => {
        viewport.scrollTop = offset;
      }, offset);
      await page.waitForTimeout(100);
      await measure(`dense-${position}-${appearance}`);
      await page.screenshot({
        path: join(
          evidence,
          `priority-compact-dense-${position}-${appearance}.png`,
        ),
        animations: "disabled",
      });
    }
  }
  const first = created.find((task) => task.title === "Ship priority groups");
  if (!first) throw new Error("Missing priority transition fixture");
  await api(`/profiles/ui01-groups/tasks/${first.id}`, "PATCH", {
    from_version: first.row_version,
    changes: { priority: "P2" },
  });
  await expect(
    groups.filter({
      has: page.getByText("Ship priority groups", { exact: true }),
    }),
  ).toHaveAttribute("aria-label", "P2");
  await page.reload();
  await expect(
    groups.filter({
      has: page.getByText("Ship priority groups", { exact: true }),
    }),
  ).toHaveAttribute("aria-label", "P2");
  await page.screenshot({
    path: join(evidence, "tasks.png"),
    animations: "disabled",
  });
  writeFileSync(
    join(evidence, "priority-layout.json"),
    JSON.stringify(layouts, null, 2),
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({
      status: "THIN_PASS_NATIVE_BLOCKED",
      priorities: ["P1", "P2", "P3", "P4"],
      emptyGroups: true,
      reload: true,
      livePriorityChange: true,
      noKeychain: true,
    }),
  );
} catch (error) {
  writeFileSync(join(evidence, "failure.txt"), String(error));
  if (desktop)
    await (await desktop.firstWindow()).screenshot({
      path: join(evidence, "failure.png"),
    });
  throw error;
} finally {
  if (desktop) await desktop.close();
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
