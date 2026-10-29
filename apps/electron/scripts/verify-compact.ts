import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ElectronApplication, expect, type Page } from "@playwright/test";
import { setAppearance } from "./appearance.ts";

export async function verifyCompact({
  desktop,
  page,
  scratch,
  evidence,
}: {
  desktop: ElectronApplication;
  page: Page;
  scratch: string;
  evidence: string;
}) {
  const bounds = () =>
    desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getBounds(),
    );
  const contentSize = () =>
    desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getContentSize(),
    );
  const expanded = await bounds();
  await page.getByRole("button", { name: "Compact mode", exact: true }).click();
  await expect.poll(contentSize).toEqual([393, 426]);
  await expect(page.locator(".sidebar")).toBeHidden();
  expect((await bounds())?.x).toBe(expanded?.x);
  expect((await bounds())?.y).toBe(expanded?.y);
  const shot = (name: string) =>
    page.screenshot({
      path: join(evidence, `${name}.png`),
      animations: "disabled",
    });
  await shot("compact-light");
  await setAppearance(page, "dark");
  await shot("compact-dark");
  await setAppearance(page, "light");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "Personal", exact: true })
    .click();
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Profile", exact: true }),
  ).toContainText("Personal");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Work", exact: true }).click();
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Profile", exact: true }),
  ).toContainText("Work");
  await page
    .getByRole("button", { name: "Navigate tasks", exact: true })
    .click();
  await shot("compact-navigation");
  await page.getByRole("menuitemradio", { name: /Inbox/ }).click();
  await expect(page.getByRole("menu")).toBeHidden();
  await page
    .getByRole("button", { name: "Navigate tasks", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: /All tasks/ }).click();
  await expect(page.getByRole("menu")).toBeHidden();
  await page.getByRole("button", { name: "Quick add", exact: true }).click();
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Compact mode task");
  await shot("compact-quick-add");
  const dialog = await page.getByRole("dialog").boundingBox();
  expect(dialog?.width).toBeLessThanOrEqual(393);
  expect(dialog?.height).toBeLessThanOrEqual(426);
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByText("Compact mode task", { exact: true }).click();
  await expect(page.locator(".task-pane")).toBeHidden();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Compact mode task edited");
  await shot("compact-editor");
  await page
    .getByRole("button", { name: "Expand window", exact: true })
    .click();
  await expect.poll(bounds).toEqual(expanded);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Compact mode task edited",
  );
  await page.getByRole("button", { name: "Compact mode", exact: true }).click();
  await expect.poll(contentSize).toEqual([393, 426]);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Compact mode task edited",
  );
  expect(
    JSON.parse(readFileSync(join(scratch, "electron/window.json"), "utf8")),
  ).toEqual({ compact: true });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand window", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Compact mode task edited",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".version")).toHaveText("Version 2");
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  await expect(
    page.getByText("Compact mode task edited", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Expand window", exact: true })
    .click();
  await expect.poll(bounds).toEqual(expanded);
}
