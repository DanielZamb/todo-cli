import type { Page } from "@playwright/test";

export async function selectProfile(page: Page, id: string) {
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page
    .getByRole("menuitemradio")
    .and(page.locator(`[data-profile-id=${JSON.stringify(id)}]`))
    .click();
}

export async function openProfileDeletion(page: Page, name: string) {
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page
    .getByRole("menuitem", { name: `Delete "${name}"…`, exact: true })
    .click();
}
