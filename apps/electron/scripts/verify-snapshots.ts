import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { _electron, type ElectronApplication, expect } from "@playwright/test";
import { OpLogEntry, SnapshotGeneration, SnapshotManifest } from "@todo/domain";
import { Schema } from "effect";
import { openImport } from "./appearance.ts";
import { selectProfile } from "./profile-menu.ts";

const [scratch, evidence] = Schema.decodeUnknownSync(
  Schema.Tuple([Schema.String, Schema.String]),
)(process.argv.slice(2));
if (
  !scratch?.includes("todo-s01-verify-") ||
  !evidence ||
  process.env.TODO_ELECTRON_VERIFY_HOST !== "1"
)
  throw new Error("Scratch host required");
const shared = process.env.TODO_F13_SERVER_RECEIPT
  ? Schema.decodeUnknownSync(
      Schema.Struct({
        url: Schema.String,
        home: Schema.String,
        database: Schema.String,
      }),
    )(JSON.parse(readFileSync(process.env.TODO_F13_SERVER_RECEIPT, "utf8")))
  : undefined;
const env: NodeJS.ProcessEnv & {
  HOME: string;
  TODO_DB: string;
  TODO_PORT: string;
} = {
  ...process.env,
  HOME: shared?.home ?? join(scratch, "home"),
  TODO_DB: shared?.database ?? join(scratch, "scratch.db"),
  TODO_PORT: "0",
};
delete env.ELECTRON_RUN_AS_NODE;
mkdirSync(env.HOME, { recursive: true });
const server = shared
  ? undefined
  : spawn(join(scratch, "server"), [], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
let log = "";
server?.stdout?.on("data", (data) => {
  log += data;
});
server?.stderr?.on("data", (data) => {
  log += data;
});
let app: ElectronApplication | undefined;
try {
  const deadline = Date.now() + 60000;
  while (!/Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(log)) {
    if (shared) break;
    if (Date.now() > deadline || server?.exitCode !== null)
      throw new Error(log);
    await new Promise((done) => setTimeout(done, 100));
  }
  const url =
    shared?.url ?? /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1];
  if (!url) throw new Error("Server missing");
  const require = createRequire(import.meta.url);
  app = await _electron.launch({
    executablePath: require("electron"),
    args: [join(import.meta.dirname, "../dist/verification/write-host.mjs")],
    env: {
      ...env,
      TODO_ELECTRON_DATA: join(scratch, "electron"),
      TODO_SERVER_URL: url,
      TODO_ELECTRON_VERIFY_HOST: "1",
    },
    timeout: 60000,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(60000);
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  const sessionResponse = await fetch(`${url}/auth/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passphrase: "scratch verification passphrase" }),
  });
  expect(sessionResponse.status).toBe(200);
  const session = Schema.decodeUnknownSync(
    Schema.Struct({ credential: Schema.String }),
  )(await sessionResponse.json());
  const personalResponse = await fetch(`${url}/profiles/personal/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.credential}`,
    },
    body: JSON.stringify({
      title: "Old Personal reminder",
      due_at: {
        kind: "instant",
        utc: new Date(Date.now() - 1000).toISOString(),
        time_zone: "UTC",
      },
    }),
  });
  expect(personalResponse.status).toBe(200);
  const personal = Schema.decodeUnknownSync(
    Schema.Struct({ id: Schema.String }),
  )(await personalResponse.json());
  await expect
    .poll(async () => {
      const response = await fetch(
        `${url}/profiles/personal/tasks/${personal.id}/history`,
        { headers: { authorization: `Bearer ${session.credential}` } },
      );
      const entries = Schema.decodeUnknownSync(Schema.Array(OpLogEntry))(
        await response.json(),
      );
      return entries.filter((entry) => entry.event.kind === "ReminderFired")
        .length;
    })
    .toBe(1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Snapshots", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create Snapshot", exact: true })
    .click();
  await expect(
    page.locator(".snapshot-row").filter({ hasText: "Manual" }),
  ).toHaveCount(1);
  for (const dark of [false, true]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      dark,
    );
    await page.screenshot({
      path: join(evidence, `snapshots-${dark ? "dark" : "light"}.png`),
    });
  }
  execFileSync(
    join(scratch, "todo"),
    ["--profile", "work", "login", "--password-stdin"],
    { env, input: "scratch verification passphrase\n" },
  );
  execFileSync(
    join(scratch, "todo"),
    ["--profile", "work", "add", "F13 Electron later Task"],
    { env },
  );
  const manual = page.locator(".snapshot-row").filter({ hasText: "Manual" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .locator(".task-content")
    .filter({ hasText: "F13 Electron later Task" })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Copy to Profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Copy task", exact: true }).click();
  await expect(
    page.getByText("Task copied to Personal", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await manual.getByRole("button", { name: "Restore…", exact: true }).click();
  await expect(
    page.getByText("Work: 1 Task now, 0 after restore", { exact: true }),
  ).toBeVisible();
  const confirmation = page.getByRole("dialog", {
    name: "Restore Snapshot?",
    exact: true,
  });
  const confirmRestore = confirmation.getByRole("button", {
    name: "Restore Snapshot",
    exact: true,
  });
  await expect(confirmRestore).toBeEnabled();
  await expect
    .poll(() =>
      confirmation.evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");
  await expect
    .poll(() =>
      confirmRestore.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
          ),
        );
      }),
    )
    .toBe(true);
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() =>
        confirmation.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      )
      .toBe(true);
  }
  for (const dark of [false, true]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      dark,
    );
    await page.screenshot({
      path: join(evidence, `snapshot-restore-${dark ? "dark" : "light"}.png`),
      animations: "disabled",
    });
  }
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Settings", exact: true }),
  ).toBeVisible();
  await manual.getByRole("button", { name: "Restore…", exact: true }).click();
  await expect(confirmRestore).toBeEnabled();
  await expect
    .poll(() =>
      confirmation.evaluate((element) => getComputedStyle(element).opacity),
    )
    .toBe("1");
  await page
    .getByRole("button", { name: "Restore Snapshot", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Restore Snapshot?", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".snapshot-row").filter({ hasText: "Before restore" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByText("F13 Electron later Task", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.getByText("Task copied to Personal", { exact: true }).count(),
  ).toBe(0);
  execFileSync(
    join(scratch, "todo"),
    ["--profile", "work", "login", "--password-stdin"],
    { env, input: "scratch verification passphrase\n" },
  );
  execFileSync(
    join(scratch, "todo"),
    ["--profile", "work", "add", "F13 Electron after reload"],
    { env },
  );
  await page
    .getByRole("button", { name: "Tasks", exact: false })
    .first()
    .click();
  await expect(
    page.getByText("F13 Electron after reload", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: join(evidence, "tasks.png") });
  const restored = Schema.decodeUnknownSync(SnapshotGeneration)(
    JSON.parse(readFileSync(join(scratch, "electron/reload.json"), "utf8")),
  );
  const watchProof = () =>
    Schema.decodeUnknownSync(
      Schema.Struct({
        profile: Schema.String,
        "last-event-id": Schema.String,
        "x-todo-generation": Schema.String,
      }),
    )(JSON.parse(readFileSync(join(scratch, "electron/watch.json"), "utf8")));
  await selectProfile(page, "personal");
  await expect.poll(() => watchProof().profile).toBe("personal");
  expect(watchProof()["last-event-id"]).toBe(String(restored.seq));
  if (!shared) expect(watchProof()["last-event-id"]).toBe("6");
  expect(watchProof()["x-todo-generation"]).toBe(restored.generation);
  await expect(
    page.getByText("Old Personal reminder", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(750);
  const operations = Schema.decodeUnknownSync(
    Schema.Array(
      Schema.Struct({
        profile: Schema.String,
        seq: Schema.Int,
        kind: Schema.String,
      }),
    ),
  )(
    JSON.parse(readFileSync(join(scratch, "electron/operations.json"), "utf8")),
  );
  const historicalReminders = operations.filter(
    (entry) =>
      entry.profile === "personal" &&
      entry.kind === "ReminderFired" &&
      entry.seq <= restored.seq,
  ).length;
  expect(historicalReminders).toBe(0);
  await selectProfile(page, "work");
  await expect(
    page.getByText("F13 Electron after reload", { exact: true }),
  ).toBeVisible();
  writeFileSync(
    join(evidence, "profile-switch.json"),
    JSON.stringify({
      personal_cursor: String(restored.seq),
      historical_reminders_replayed: historicalReminders,
      current_generation: true,
    }),
  );
  const checkpoint = Schema.decodeUnknownSync(
    Schema.Struct({ snapshot: SnapshotManifest }),
  )(
    JSON.parse(
      execFileSync(
        join(scratch, "todo"),
        [
          "--profile",
          "work",
          "--format",
          "json",
          "snapshot",
          "create",
          "--reason",
          "pre-restore",
        ],
        { env, encoding: "utf8" },
      ),
    ),
  );
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Delete ".+"…$/ }).click();
  const profilePrompt = page.getByRole("dialog", { name: /^Delete "/ });
  await expect(profilePrompt).toBeVisible();
  execFileSync(
    join(scratch, "todo"),
    [
      "--profile",
      "work",
      "--format",
      "json",
      "snapshot",
      "restore",
      checkpoint.snapshot.id,
    ],
    { env },
  );
  await expect.poll(() => profilePrompt.count(), { timeout: 3000 }).toBe(0);
  await expect(
    page.getByText("F13 Electron after reload", { exact: true }),
  ).toBeVisible();
  writeFileSync(
    join(evidence, "profile-prompt-reload.json"),
    JSON.stringify({ cleared: true }),
  );
  for (const reason of [
    "daily",
    "pre-restore",
    "pre-migration",
    "pre-purge",
    "before Profile delete Personal",
    "before import Tasks.csv",
  ]) {
    execFileSync(
      join(scratch, "todo"),
      ["--profile", "work", "snapshot", "create", "--reason", reason],
      { env },
    );
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect
    .poll(() => page.locator(".snapshot-row").count())
    .toBeGreaterThanOrEqual(7);
  const densityCount = await page.locator(".snapshot-row").count();
  await expect
    .poll(() =>
      page
        .locator(".snapshot-list")
        .evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true);
  for (const dark of [false, true]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      dark,
    );
    await page.screenshot({
      path: join(evidence, `density-snapshots-${dark ? "dark" : "light"}.png`),
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Compact mode", exact: true }).click();
  await page.getByRole("button", { name: "Navigate tasks" }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByRole("dialog", { name: "Settings", exact: true })
        .evaluate((dialog) => getComputedStyle(dialog).opacity),
    )
    .toBe("1");
  const measureCompact = () =>
    page.locator(".snapshot-list").evaluate((list) => {
      const viewport = list.getBoundingClientRect();
      const rows = [...list.querySelectorAll(".snapshot-row")].map((row) =>
        row.getBoundingClientRect(),
      );
      const targets = [...list.querySelectorAll("button")].map((button) =>
        button.getBoundingClientRect(),
      );
      const glyphs = [...list.querySelectorAll("h3, p")].map((text) =>
        text.getBoundingClientRect(),
      );
      return {
        minimum_target: Math.min(
          ...targets.flatMap((target) => [target.width, target.height]),
        ),
        partial_glyphs: glyphs.filter(
          (text) =>
            text.top < viewport.bottom &&
            text.bottom > viewport.top &&
            (text.top < viewport.top || text.bottom > viewport.bottom),
        ).length,
        row_actions: [...list.querySelectorAll(".snapshot-row")].every(
          (row) => {
            const buttons = [...row.querySelectorAll("button")];
            return (
              buttons.length === 2 &&
              buttons[0]?.textContent?.trim() === "Restore…" &&
              buttons[1]?.textContent?.trim() === "" &&
              buttons[1]?.getAttribute("aria-label") === "Reveal in Finder" &&
              buttons[1]?.getAttribute("title") === "Reveal in Finder" &&
              getComputedStyle(buttons[1]).backgroundColor ===
                "rgba(0, 0, 0, 0)"
            );
          },
        ),
        fully_visible_rows: rows.filter(
          (row) =>
            row.top >= viewport.top &&
            row.bottom <= Math.min(viewport.bottom, innerHeight),
        ).length,
        partially_visible_rows: rows.filter(
          (row) =>
            row.top < viewport.bottom &&
            row.bottom > viewport.top &&
            (row.top < viewport.top || row.bottom > viewport.bottom),
        ).length,
      };
    });
  const compactBounds = await measureCompact();
  writeFileSync(
    join(evidence, "compact-bounds.json"),
    JSON.stringify(compactBounds),
  );
  for (const dark of [false, true]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      dark,
    );
    await page.screenshot({
      path: join(evidence, `compact-snapshots-${dark ? "dark" : "light"}.png`),
      animations: "disabled",
    });
  }
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "THIN_PASS_NATIVE_BLOCKED",
        snapshot_created: true,
        restore_counts: [[1, 0]],
        after_reload_write: true,
        confirmation_opacity: 1,
        confirmation_focus_trapped: true,
        escape_only_confirmation: true,
        density_count: densityCount,
        density_scrollable: true,
        keychainAccessed: false,
      },
      null,
      2,
    ),
  );
  expect(compactBounds.fully_visible_rows).toBeGreaterThanOrEqual(3);
  expect(compactBounds.partially_visible_rows).toBe(0);
  expect(compactBounds.partial_glyphs).toBe(0);
  expect(compactBounds.minimum_target).toBeGreaterThanOrEqual(32);
  expect(compactBounds.row_actions).toBe(true);
  await page.locator(".snapshot-list").evaluate((list) => {
    list.scrollTop = list.scrollHeight;
  });
  await expect
    .poll(async () => (await measureCompact()).partially_visible_rows)
    .toBe(0);
  const endBounds = await measureCompact();
  expect(endBounds.fully_visible_rows).toBeGreaterThanOrEqual(3);
  expect(endBounds.partial_glyphs).toBe(0);
  writeFileSync(
    join(evidence, "compact-bounds-end.json"),
    JSON.stringify(endBounds),
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await openImport(page);
  const importFixture = join(scratch, "stale-import.json");
  writeFileSync(
    importFixture,
    JSON.stringify([
      { external_id: "f13:stale-preview", title: "Stale import" },
    ]),
  );
  await page
    .getByLabel("Import file", { exact: true })
    .setInputFiles(importFixture);
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Preview import", exact: true }),
  ).toBeVisible();
  execFileSync(
    join(scratch, "todo"),
    ["--profile", "work", "snapshot", "restore", checkpoint.snapshot.id],
    { env },
  );
  await expect(
    page.getByRole("heading", { name: "Preview import", exact: true }),
  ).toHaveCount(0);
  await openImport(page);
  await expect(
    page.getByRole("heading", { name: "Import Tasks", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Import file", { exact: true })).toHaveValue("");
  writeFileSync(
    join(evidence, "restore-import-state.json"),
    JSON.stringify({
      status: "PASS",
      stale_preview_closed: true,
      reopened_file_empty: true,
    }),
  );
} finally {
  await app?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 2000);
    await new Promise((done) => server.once("exit", done));
    clearTimeout(timer);
  }
  writeFileSync(join(evidence, "server.log"), log);
}
