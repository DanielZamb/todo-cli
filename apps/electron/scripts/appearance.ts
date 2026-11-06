import { expect, type Page } from "@playwright/test";

export async function setAppearance(page: Page, appearance: "light" | "dark") {
  if (
    (await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    )) ===
    (appearance === "dark")
  )
    return;
  const button = page.getByRole("button", {
    name: appearance === "dark" ? "Dark appearance" : "Light appearance",
    exact: true,
  });
  await button
    .or(page.getByRole("button", { name: "Navigate tasks", exact: true }))
    .click();
  const settings = page.getByRole("menuitem", {
    name: "Settings",
    exact: true,
  });
  const applied = () =>
    page
      .evaluate(() => document.documentElement.classList.contains("dark"))
      .then((dark) => dark === (appearance === "dark"));
  await expect
    .poll(async () => (await applied()) || (await settings.isVisible()))
    .toBe(true);
  if (await applied()) return;
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Appearance…", exact: true }).click();
  await button.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

export async function openImport(page: Page) {
  if (await page.locator(".compact").count()) {
    await page
      .getByRole("button", { name: "Navigate tasks", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Import…", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Import…", exact: true }).click();
  }
}
