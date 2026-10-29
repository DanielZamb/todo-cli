import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ElectronApplication, expect, type Page } from "@playwright/test";
import { Task } from "@todo/domain";
import { Schema } from "effect";
import { setAppearance } from "./appearance.ts";

export async function verifyCompactPresentation({
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
  const measurements: unknown[] = [];
  const editors: unknown[] = [];
  const fixtures: Array<typeof Task.Type> = [];
  for (let index = 1; index <= 8; index++)
    fixtures.push(
      Schema.decodeUnknownSync(Task)(
        await api("/profiles/work/tasks", "POST", {
          title: `U02 presentation fixture ${index}`,
          project_name: "Todo",
          tag_names: ["deep focus", "release planning", "international launch"],
          due_at: { kind: "date", date: "2026-10-28" },
          scheduled_at: { kind: "date", date: "2026-10-29" },
        }),
      ),
    );
  const plainTask = Schema.decodeUnknownSync(Task)(
    await api("/profiles/work/tasks", "POST", { title: "U02 plain row" }),
  );
  if (
    await page
      .getByRole("button", { name: "Compact mode", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Compact mode", exact: true })
      .click();
  await expect
    .poll(() =>
      desktop.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.getContentSize(),
      ),
    )
    .toEqual([393, 426]);
  const shot = async (screen: string, theme: string) => {
    await page.screenshot({
      path: join(evidence, `u02-compact-${screen}-${theme}.png`),
      animations: "disabled",
    });
  };
  const measure = async (screen: string, theme: string) => {
    const geometry = await page.locator(".task-pane").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const title = element
        .querySelector(".view-title > button")
        ?.getBoundingClientRect();
      const actionCenters = [
        ...element.querySelectorAll(".actions button"),
      ].map((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.top + bounds.height / 2;
      });
      const rows = [...element.querySelectorAll(".task-row")].map((row) => {
        const bounds = row.getBoundingClientRect();
        const metadata = row.querySelector(".compact-row-metadata");
        const metadataBounds = metadata?.getBoundingClientRect();
        const titleBounds = row
          .querySelector(".task-title")
          ?.getBoundingClientRect();
        return {
          height: bounds.height,
          id: row.getAttribute("data-task-id"),
          hasMetadata: Boolean(metadata?.getAttribute("title")),
          centreY: bounds.top + bounds.height / 2,
          titleCentreY: titleBounds
            ? titleBounds.top + titleBounds.height / 2
            : null,
          metadata: [...row.querySelectorAll("[data-whole-metadata]")].map(
            (item) => item.textContent,
          ),
          whole: bounds.top >= rect.top && bounds.bottom <= rect.bottom,
          metadataHeight: metadataBounds?.height ?? 0,
          wholeMetadata: [
            ...row.querySelectorAll("[data-whole-metadata]"),
          ].every((item) => {
            const box = item.getBoundingClientRect();
            return (
              metadataBounds &&
              box.left >= metadataBounds.left &&
              box.right <= metadataBounds.right
            );
          }),
        };
      });
      const targets = [...element.querySelectorAll("button")]
        .filter((button) => {
          const bounds = button.getBoundingClientRect();
          return bounds.width && bounds.height;
        })
        .map((button) => ({
          name: button.getAttribute("aria-label") ?? button.textContent,
          width: button.getBoundingClientRect().width,
          height: button.getBoundingClientRect().height,
        }));
      return {
        rows,
        titleCenter: title ? title.top + title.height / 2 : null,
        actionCenters,
        targets,
        footer: element.querySelectorAll(".view-footer").length,
        headings: element.querySelectorAll(".list-heading").length,
        sections: element.querySelectorAll("section").length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        headerActions: [...element.querySelectorAll(".actions button")].map(
          (button) => button.getAttribute("aria-label"),
        ),
      };
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.footer).toBe(0);
    for (const center of geometry.actionCenters)
      expect(
        Math.abs(center - (geometry.titleCenter ?? -100)),
      ).toBeLessThanOrEqual(1);
    expect(geometry.headerActions).toEqual(
      geometry.rows.length ? ["Expand window", "Quick add"] : ["Expand window"],
    );
    if (geometry.sections === 1) expect(geometry.headings).toBe(0);
    for (const row of geometry.rows) {
      expect(row.height).toBe(56);
      expect(row.wholeMetadata).toBe(true);
      expect(row.metadataHeight).toBeLessThanOrEqual(18);
      if (!row.hasMetadata)
        expect(
          Math.abs((row.titleCentreY ?? -100) - row.centreY),
        ).toBeLessThanOrEqual(1);
      if (fixtures.some((task) => task.id === row.id)) {
        expect(row.metadata).toContain("Todo");
        expect(row.metadata.some((label) => label?.startsWith("#"))).toBe(true);
        expect(
          row.metadata.filter((label) => label?.startsWith("Due")),
        ).toHaveLength(1);
        expect(
          row.metadata.filter((label) => label?.startsWith("Scheduled")),
        ).toEqual([]);
      }
    }
    for (const target of geometry.targets) {
      expect(target.width, target.name ?? "").toBeGreaterThanOrEqual(32);
      expect(target.height, target.name ?? "").toBeGreaterThanOrEqual(32);
    }
    measurements.push({
      screen,
      theme,
      ...geometry,
      rowsVisible: geometry.rows.filter((row) => row.whole).length,
    });
  };
  for (const theme of ["light", "dark"] as const) {
    await setAppearance(page, theme);
    for (const view of [
      "All tasks",
      "Today",
      "Overdue",
      "Scheduled",
      "Inbox",
    ]) {
      await page
        .getByRole("button", { name: "Navigate tasks", exact: true })
        .click();
      await page
        .getByRole("menuitemradio", { name: new RegExp(`^${view}`) })
        .click();
      await expect(page.getByRole("menu")).toBeHidden();
      await page.waitForTimeout(150);
      await expect(page.locator(".view-footer")).toBeHidden();
      await shot(`list-${view.toLowerCase().replace(" ", "-")}`, theme);
      await measure(view, theme);
    }
    await page
      .getByRole("button", { name: "Navigate tasks", exact: true })
      .click();
    await page.getByRole("menuitemradio", { name: /^All tasks/ }).click();
    const longProject =
      "International Platform Accessibility and Release Planning";
    const longTask = Schema.decodeUnknownSync(Task)(
      await api("/profiles/work/tasks", "POST", {
        title: "U02 long Project editor proof",
        project_name: longProject,
      }),
    );
    await page.locator(`[data-task-id="${longTask.id}"] .task-content`).click();
    await expect(
      page.getByRole("button", { name: "Back to tasks", exact: true }),
    ).toBeVisible();
    const heading = page.locator(".editor-heading");
    const save = await page
      .getByRole("button", { name: "Save changes", exact: true })
      .boundingBox();
    expect(save?.height).toBeGreaterThanOrEqual(32);
    expect(save && save.y + save.height <= 426).toBe(true);
    const before = await heading.boundingBox();
    await page.locator(".editor > form").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await heading.boundingBox()).toEqual(before);
    expect(
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .boundingBox(),
    ).toEqual(save);
    expect(
      await heading.evaluate((element) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        return {
          background: getComputedStyle(element).backgroundColor,
          aboveContent: element.contains(
            document.elementFromPoint(left + width / 2, top + height / 2),
          ),
        };
      }),
    ).toMatchObject({ aboveContent: true });
    expect(
      await heading.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ).not.toBe("rgba(0, 0, 0, 0)");
    await shot("editor-scrolled", theme);
    await page.locator(".editor > form").evaluate((element) => {
      element.scrollTop = 0;
    });
    await shot("editor", theme);
    await page.getByLabel("Project", { exact: true }).scrollIntoViewIfNeeded();
    const project = page.locator(".project-value");
    await expect(project).toHaveText(longProject);
    const projectLayout = await project.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const bounds = element.getBoundingClientRect();
      const lines = [...range.getClientRects()];
      return {
        bounds: bounds.toJSON(),
        lines: lines.map((line) => line.toJSON()),
        fits: lines.every(
          (line) =>
            line.left >= bounds.left &&
            line.right <= bounds.right &&
            line.top >= bounds.top &&
            line.bottom <= bounds.bottom,
        ),
      };
    });
    expect(projectLayout.fits).toBe(true);
    const fields = [];
    for (const field of await page
      .locator('.editor form [data-slot="field"]')
      .all()) {
      const geometry = await field.evaluate((element) => {
        const label = element.querySelector('[data-slot="field-label"]');
        const control = label?.nextElementSibling;
        if (!label || !control)
          return { label: null, stacked: false, fullWidth: false };
        const labelBounds = label.getBoundingClientRect(),
          controlBounds = control.getBoundingClientRect();
        return {
          label: label.textContent,
          labelBounds: labelBounds.toJSON(),
          controlBounds: controlBounds.toJSON(),
          stacked:
            labelBounds.bottom <= controlBounds.top &&
            Math.abs(labelBounds.left - controlBounds.left) <= 1,
          fullWidth:
            Math.abs(
              controlBounds.width - element.getBoundingClientRect().width,
            ) <= 1,
        };
      });
      expect(geometry.stacked).toBe(true);
      expect(geometry.fullWidth).toBe(true);
      fields.push(geometry);
    }
    expect(fields).toHaveLength(10);
    editors.push({
      theme,
      header: before,
      save,
      project: projectLayout,
      fields,
    });
    await shot("editor-project", theme);
    await page
      .getByRole("button", { name: "Back to tasks", exact: true })
      .click();
    await api(`/profiles/work/tasks/${longTask.id}?from_version=1`, "DELETE");
    await page.getByRole("button", { name: "Quick add", exact: true }).click();
    await page
      .getByLabel("Task title", { exact: true })
      .fill("Plan the next release");
    await shot("quick-add", theme);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Navigate tasks", exact: true })
      .click();
    await shot("settings-entry", theme);
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    await shot("settings", theme);
    await page
      .getByRole("button", { name: "Appearance…", exact: true })
      .click();
    await shot("appearance", theme);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page
      .getByRole("menuitemradio", { name: "Personal", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Profile", exact: true }),
    ).toContainText("Personal");
    await page
      .getByRole("button", { name: "Navigate tasks", exact: true })
      .click();
    await page.getByRole("menuitemradio", { name: /^Inbox/ }).click();
    await expect(
      page.getByText("No tasks here.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".task-row")).toHaveCount(0);
    await shot("empty", theme);
    const empty = await page.locator('[data-slot="empty"]').boundingBox();
    const emptyAction = await page
      .locator('[data-slot="empty"]')
      .getByRole("button")
      .boundingBox();
    expect(empty).toBeTruthy();
    expect(emptyAction?.height).toBeGreaterThanOrEqual(32);
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page
      .getByRole("menuitemradio", { name: "Work", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Navigate tasks", exact: true })
      .click();
    await page.getByRole("menuitemradio", { name: /^All tasks/ }).click();
    await expect(page.locator(".complete").first()).toBeEnabled();
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.send("todo:notice", {
        _tag: "connection",
        state: "offline",
      }),
    );
    await expect(
      page.getByRole("button", { name: "Reconnect", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".compact-state button")).toHaveCount(1);
    await shot("offline", theme);
    await page.getByRole("button", { name: "Reconnect", exact: true }).click();
    await expect(page.locator(".compact-state")).toBeHidden();
    await desktop.evaluate(({ BrowserWindow }) => {
      process.emit("todo:verify-list-failure");
      BrowserWindow.getAllWindows()[0]?.webContents.send("todo:notice", {
        _tag: "changed",
        profile: "work",
      });
    });
    await expect(page.locator(".compact-state button")).toHaveText("Retry");
    await shot("error", theme);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.locator(".compact-state")).toBeHidden();
    await page
      .getByRole("button", { name: "Expand window", exact: true })
      .click();
    await expect(page.locator(".shell")).not.toHaveClass(/compact/);
    await page.screenshot({
      path: join(evidence, `u02-full-list-${theme}.png`),
      animations: "disabled",
    });
    await expect(page.locator(".view-footer > .quiet")).not.toHaveText(
      "1 tasks",
    );
    const dates = page.locator(
      `[data-task-id="${fixtures[0]?.id}"] .task-dates`,
    );
    await expect(dates).toContainText("Due");
    await expect(dates).toContainText("Scheduled");
    await page
      .getByRole("button", { name: "Compact mode", exact: true })
      .click();
    await expect(page.locator(".shell")).toHaveClass(/compact/);
  }
  await setAppearance(page, "light");
  await page
    .getByRole("button", { name: "Expand window", exact: true })
    .click();
  for (const task of fixtures)
    await api(`/profiles/work/tasks/${task.id}?from_version=1`, "DELETE");
  await api(`/profiles/work/tasks/${plainTask.id}?from_version=1`, "DELETE");
  writeFileSync(
    join(evidence, "u02-compact-layout.json"),
    JSON.stringify(measurements, null, 2),
  );
  writeFileSync(
    join(evidence, "u02-editor-layout.json"),
    JSON.stringify(editors, null, 2),
  );
}
