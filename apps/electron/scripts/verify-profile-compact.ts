import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ElectronApplication, expect, type Page } from "@playwright/test";
import { selectProfile } from "./profile-menu.ts";

export async function verifyProfileCompact({
  desktop,
  page,
  evidence,
  cli,
}: {
  desktop: ElectronApplication;
  page: Page;
  evidence: string;
  cli: (...args: string[]) => string;
}) {
  const name = "Work planning and research for international launches";
  cli("init", "--profile", name);
  cli("login", "--profile", name);
  await selectProfile(page, "personal");
  await selectProfile(page, "work");
  await page.getByRole("button", { name: "Compact mode", exact: true }).click();
  await expect
    .poll(() =>
      desktop.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.getContentSize(),
      ),
    )
    .toEqual([393, 426]);
  const profileMenu = page.getByRole("button", {
    name: "Profile",
    exact: true,
  });
  await profileMenu.click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Profile", exact: true }),
  ).toContainText(name);
  const measurements: unknown[] = [];
  const failures: string[] = [];
  const capture = async (state: "menu" | "empty" | "refusal" | "tasks") => {
    const surface = page.getByRole(state === "menu" ? "menu" : "dialog");
    if (state === "menu")
      await page
        .getByRole("menuitem", { name: `Delete "${name}"…`, exact: true })
        .scrollIntoViewIfNeeded();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) =>
          document.documentElement.classList.toggle("dark", theme === "dark"),
        theme,
      );
      await surface.waitFor({ state: "visible" });
      await page.screenshot({
        path: join(evidence, `compact-profile-delete-${state}-${theme}.png`),
        animations: "disabled",
      });
      const result = await surface.evaluate(
        (element, { state, theme }) => {
          const rect = (value: Element) => {
            const { x, y, width, height, right, bottom } =
              value.getBoundingClientRect();
            return { x, y, width, height, right, bottom };
          };
          const bounds = rect(element);
          const controls = [
            ...element.querySelectorAll(
              'button,[role="menuitem"],[role="menuitemradio"]',
            ),
          ].map((control) => ({
            text: control.textContent?.trim() ?? "",
            ...rect(control),
          }));
          const cancel = controls.find((control) => control.text === "Cancel");
          const action = controls.find((control) =>
            /^Delete (Profile|Tasks too)/.test(control.text),
          );
          const gap =
            cancel && action
              ? Math.max(
                  action.x - cancel.right,
                  cancel.x - action.right,
                  action.y - cancel.bottom,
                  cancel.y - action.bottom,
                )
              : null;
          const textRects: ReturnType<typeof rect>[] = [];
          if (state === "menu") {
            const targets = element.querySelectorAll(
              '[role="menuitemradio"],[data-variant="destructive"]',
            );
            for (const target of targets) {
              const walker = document.createTreeWalker(
                target,
                NodeFilter.SHOW_TEXT,
              );
              while (walker.nextNode()) {
                const range = document.createRange();
                range.selectNodeContents(walker.currentNode);
                for (const box of range.getClientRects())
                  textRects.push({
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height,
                    right: box.right,
                    bottom: box.bottom,
                  });
              }
            }
          }
          const dominantActions = [...element.querySelectorAll("button")]
            .filter(
              (button) =>
                button.classList.contains("bg-primary") ||
                button.classList.contains("bg-destructive"),
            )
            .map((button) => button.textContent?.trim());
          const destructiveItems = element.querySelectorAll(
            '[data-variant="destructive"]',
          );
          const lastItem = element.querySelectorAll(
            '[role="menuitem"],[role="menuitemradio"]',
          );
          const deleteItem = destructiveItems[0];
          return {
            dominantActions,
            destructiveItemCount: destructiveItems.length,
            deleteLastAfterSeparator:
              deleteItem === lastItem[lastItem.length - 1] &&
              deleteItem?.previousElementSibling?.getAttribute("data-slot") ===
                "dropdown-menu-separator",
            state,
            theme,
            viewport: [innerWidth, innerHeight],
            bounds,
            controls,
            gap,
            textRects,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
          };
        },
        { state, theme },
      );
      measurements.push(result);
      const label = `${state}-${theme}`;
      if (result.viewport[0] !== 393 || result.viewport[1] !== 426)
        failures.push(`${label}: content size differs`);
      if (
        result.bounds.x < -0.5 ||
        result.bounds.y < -0.5 ||
        result.bounds.right > 393.5 ||
        result.bounds.bottom > 426.5
      )
        failures.push(`${label}: surface exceeds viewport`);
      if (result.scrollWidth > result.clientWidth + 1)
        failures.push(`${label}: horizontal overflow`);
      if (state !== "menu" && result.scrollHeight > result.clientHeight + 1)
        failures.push(`${label}: dialog content clipped`);
      for (const control of result.controls) {
        if (control.width < 32 || control.height < 32)
          failures.push(
            `${label}: ${control.text} target ${control.width}x${control.height}`,
          );
        if (
          control.x < result.bounds.x - 0.5 ||
          control.right > result.bounds.right + 0.5 ||
          control.y < result.bounds.y - 0.5 ||
          control.bottom > result.bounds.bottom + 0.5
        )
          failures.push(`${label}: control exceeds dialog`);
      }
      if (state !== "menu" && result.dominantActions.length !== 1)
        failures.push(`${label}: expected one dominant action`);
      if (
        state === "menu" &&
        (result.destructiveItemCount !== 1 || !result.deleteLastAfterSeparator)
      )
        failures.push(`${label}: Delete must be last after its separator`);
      if (state !== "menu" && (result.gap === null || result.gap < 8))
        failures.push(`${label}: Cancel/action gap below8`);
      for (const box of result.textRects)
        if (
          box.x < result.bounds.x - 0.5 ||
          box.right > result.bounds.right + 0.5 ||
          box.y < result.bounds.y - 0.5 ||
          box.bottom > result.bounds.bottom + 0.5
        )
          failures.push(`${label}: long Profile name clipped`);
    }
  };
  await profileMenu.click();
  await capture("menu");
  await page
    .getByRole("menuitem", { name: `Delete "${name}"…`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(`Delete "${name}"?`);
  await capture("empty");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  cli("add", "Compact Profile deletion Task", "--profile", name);
  await expect(
    page.getByText("Compact Profile deletion Task", { exact: true }),
  ).toBeVisible();
  await profileMenu.click();
  await page
    .getByRole("menuitem", { name: `Delete "${name}"…`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("has 1 Task.");
  await capture("refusal");
  await page
    .getByRole("button", { name: "Delete Tasks too…", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    `Delete "${name}" and its Task?`,
  );
  await expect(page.getByRole("dialog")).not.toContainText("its 1 Task");
  await capture("tasks");
  writeFileSync(
    join(evidence, "compact-profile-bounds.json"),
    JSON.stringify({ viewport: [393, 426], measurements, failures }, null, 2),
  );
  expect(failures).toEqual([]);
  await page
    .getByRole("button", { name: "Delete Profile and Task", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("status", { name: "Profile deleted" }),
  ).toContainText(`"${name}" was deleted. Switched to`);
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand window", exact: true })
    .click();
  await selectProfile(page, "work");
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
}
