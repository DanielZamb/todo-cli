import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type ElectronApplication, expect, type Page } from "@playwright/test";
import { Task } from "@todo/domain";
import { Schema } from "effect";
import { openImport, setAppearance } from "./appearance.ts";

export async function verifyPresentationCorrectness({
  page,
  desktop,
  evidence,
  api,
}: {
  page: Page;
  desktop: ElectronApplication;
  evidence: string;
  api: (path: string, method?: string, payload?: unknown) => Promise<unknown>;
}) {
  const results: { name: string; passed: boolean; actual: unknown }[] = [];
  const task = Schema.decodeUnknownSync(Task)(
    await api("/profiles/work/tasks", "POST", {
      title: "U02 recovery fixture",
    }),
  );
  if (
    await page
      .getByRole("button", { name: "Compact mode", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Compact mode", exact: true })
      .click();
  await expect(page.locator(".shell")).toHaveClass(/compact/);
  const row = page.locator(`[data-task-id="${task.id}"]`);
  await expect(row).toBeVisible();
  await expect(page.locator(".connection-status")).toBeHidden();
  for (const theme of ["light", "dark"] as const) {
    await setAppearance(page, theme);
    for (const status of ["cancelled", "snoozed"]) {
      const statusRow = page.locator(`[data-task-id="${status}"]`);
      const label = statusRow.locator(".task-status");
      results.push({
        name: `Compact retains ${status} status in ${theme}`,
        passed:
          (await label.count()) === 1 &&
          (await label.innerText()).trim() === status,
        actual: await statusRow.innerText(),
      });
      if (await label.count()) {
        await label.scrollIntoViewIfNeeded();
        const bounds = await label.evaluate((element) => {
          const label = element.getBoundingClientRect();
          const row = element.closest(".task-row")?.getBoundingClientRect();
          return {
            width: label.width,
            whole: Boolean(
              row && label.left >= row.left && label.right <= row.right,
            ),
          };
        });
        expect(bounds.width).toBeGreaterThan(0);
        expect(bounds.whole).toBe(true);
        await page.screenshot({
          path: join(evidence, `compact-${status}-${theme}.png`),
          animations: "disabled",
        });
      }
    }
  }
  await setAppearance(page, "light");
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.send("todo:notice", {
      _tag: "notificationError",
      message: "Reminder unavailable.",
    }),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.body.textContent?.includes("Reminder unavailable.") ||
          document.querySelector(".compact-state")?.getAttribute("title") ===
            "Reminder unavailable.",
      ),
    )
    .toBe(true);
  const notice = {
    taskVisible: await row.isVisible(),
    noticeVisible: await page
      .getByRole("alert")
      .filter({ hasText: "Reminder unavailable." })
      .isVisible(),
    loadFailure: await page.locator(".compact-state").count(),
  };
  results.push({
    name: "unrelated notification error retains loaded Tasks",
    passed:
      notice.taskVisible && notice.noticeVisible && notice.loadFailure === 0,
    actual: notice,
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(row).toBeVisible();
  await desktop.evaluate(({ BrowserWindow }) => {
    process.emit("todo:verify-list-failure");
    BrowserWindow.getAllWindows()[0]?.webContents.send("todo:notice", {
      _tag: "changed",
      profile: "work",
    });
  });
  await expect(page.locator(".compact-state")).toBeVisible();
  await page.screenshot({
    path: join(evidence, "correctness-load-error.png"),
    animations: "disabled",
  });
  const reply = await desktop.evaluate(
    ({ BrowserWindow }) =>
      new Promise<string>((resolve) => {
        process.once("todo:verify-list-result", resolve);
        BrowserWindow.getAllWindows()[0]?.webContents.send("todo:notice", {
          _tag: "changed",
          profile: "work",
        });
      }),
  );
  expect(reply).toBe("tasks");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const recovered =
    (await row.isVisible()) &&
    (await page.locator(".compact-state").count()) === 0;
  results.push({
    name: "successful automatic list refresh clears load failure",
    passed: recovered,
    actual: { reply, recovered },
  });
  if (!recovered)
    await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(row).toBeVisible();
  await page
    .getByRole("button", { name: "Expand window", exact: true })
    .click();
  await expect(page.locator(".shell")).not.toHaveClass(/compact/);
  await api(`/profiles/work/tasks/${task.id}?from_version=1`, "DELETE");
  const midnight = await page.evaluate(() =>
    new Date(2026, 9, 28, 23, 59, 30).getTime(),
  );
  const dated = Schema.decodeUnknownSync(Task)(
    await api("/profiles/work/tasks", "POST", {
      title: "U02 idle midnight",
      due_at: { kind: "date", date: "2026-10-29" },
    }),
  );
  await page.clock.install({ time: midnight });
  await page.reload();
  const date = page.locator(`[data-task-id="${dated.id}"] .task-dates`);
  await expect(date).toHaveText("Due Tomorrow");
  await expect(page.locator(".connection-status")).toBeHidden();
  await page.waitForTimeout(250);
  await page.clock.fastForward(60_000);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    page.getByRole("heading", { name: "History", exact: true }),
  ).toHaveCount(0);
  const after = await date.innerText();
  results.push({
    name: "idle midnight changes Tomorrow to Today with History closed",
    passed: after === "Due Today",
    actual: after,
  });
  await page.clock.setSystemTime(new Date());
  await api(`/profiles/work/tasks/${dated.id}?from_version=1`, "DELETE");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await openImport(page);
  await page
    .getByLabel("Import file", { exact: true })
    .setInputFiles(
      resolve(import.meta.dirname, "../test/fixtures/single-task-import.json"),
    );
  const ready = await page.getByText(/Tasks? ready to preview$/).innerText();
  results.push({
    name: "single Task import count",
    passed: ready === "1 Task ready to preview",
    actual: ready,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  writeFileSync(
    join(evidence, "presentation-correctness.json"),
    JSON.stringify(results, null, 2),
  );
  expect(results.filter((result) => !result.passed)).toEqual([]);
}
