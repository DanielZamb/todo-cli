import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ElectronApplication, expect, type Page } from "@playwright/test";
import { Task } from "@todo/domain";
import { Schema } from "effect";
import { setAppearance } from "./appearance.ts";
import { selectProfile } from "./profile-menu.ts";

export async function verifyTaskFilters({
  page,
  desktop,
  evidence,
  api,
  cli,
  disconnect,
}: {
  page: Page;
  desktop: ElectronApplication;
  evidence: string;
  api: (path: string, method?: string, payload?: unknown) => Promise<unknown>;
  cli: (...args: string[]) => string;
  disconnect?: () => Promise<void>;
}) {
  const fixtures: Task[] = [];
  for (const payload of [
    {
      title: "Filter launch revenue",
      priority: "P1",
      energy: 3,
      estimate_min: 45,
      project_name: "Client Launch",
      tag_names: ["revenue", "review"],
    },
    {
      title: "Filter dated revenue",
      project_name: "Client Launch",
      tag_names: ["revenue"],
      due_at: { kind: "date", date: "2030-11-01" },
    },
    {
      title: "Filter scheduled revenue",
      project_name: "Client Launch",
      tag_names: ["revenue"],
      scheduled_at: { kind: "date", date: "2030-11-02" },
    },
    {
      title: "Filter historical revenue",
      project_name: "Client Launch",
      tag_names: ["revenue"],
      due_at: { kind: "date", date: "1880-11-01" },
    },
    {
      title: "Filter operations revenue",
      project_name: "Operations",
      tag_names: ["revenue"],
    },
    {
      title: "Filter launch compliance",
      project_name: "Client Launch",
      tag_names: ["compliance"],
    },
  ])
    fixtures.push(
      Schema.decodeUnknownSync(Task)(
        await api("/profiles/work/tasks", "POST", payload),
      ),
    );
  const first = fixtures.find((task) => task.title === "Filter launch revenue");
  if (!first) throw new Error("Missing filter fixture");
  await api(`/profiles/work/tasks/${first.id}/attachments`, "POST", {
    from_version: 1,
    location: { kind: "link", url: "https://example.test/enterprise/contract" },
    label: "Enterprise contract",
  });
  const completed = Schema.decodeUnknownSync(Task)(
    await api("/profiles/work/tasks", "POST", {
      title: "Filter completed revenue",
      project_name: "Client Launch",
      tag_names: ["revenue"],
    }),
  );
  fixtures.push(
    Schema.decodeUnknownSync(Task)(
      await api(`/profiles/work/tasks/${completed.id}/transition`, "POST", {
        from_version: 1,
        action: "complete",
      }),
    ),
  );
  const navigate = async (name: string, compact: boolean) => {
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
  const project = page.getByLabel("Filter by Project", { exact: true });
  const tag = page.getByLabel("Filter by Tag", { exact: true });
  const filters = page.getByRole("group", {
    name: "Task filters",
    exact: true,
  });
  const clear = () =>
    filters.getByRole("button", { name: "Clear filters", exact: true }).click();
  const titles = async () =>
    (await page.locator(".task-row .task-title").allTextContents()).sort();
  const receipts: unknown[] = [];
  for (const compact of [false, true]) {
    if (compact)
      await page
        .getByRole("button", { name: "Compact mode", exact: true })
        .click();
    if (compact)
      expect(
        await desktop.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.getContentSize(),
        ),
      ).toEqual([393, 426]);
    for (const appearance of ["light", "dark"] as const) {
      await setAppearance(page, appearance);
      await navigate(compact ? "All tasks" : "Tasks", compact);
      await project.selectOption({ label: "Client Launch" });
      await tag.selectOption({ label: "revenue" });
      await expect
        .poll(titles)
        .toEqual([
          "Filter completed revenue",
          "Filter dated revenue",
          "Filter historical revenue",
          "Filter launch revenue",
          "Filter scheduled revenue",
        ]);
      await page.screenshot({
        path: join(
          evidence,
          `filters-tasks-${compact ? "compact" : "full"}-${appearance}.png`,
        ),
        animations: "disabled",
      });
      await navigate("Inbox", compact);
      await expect(project).toHaveValue("");
      await expect(tag).toHaveValue("");
      await project.selectOption({ label: "Client Launch" });
      await tag.selectOption({ label: "revenue" });
      await expect.poll(titles).toEqual(["Filter launch revenue"]);
      const geometry = await filters.evaluate((element) => ({
        width: document.documentElement.clientWidth,
        right: element.getBoundingClientRect().right,
        targets: [...element.querySelectorAll("select, button")].map(
          (control) => {
            const rect = control.getBoundingClientRect();
            return {
              width: rect.width,
              height: rect.height,
              right: rect.right,
            };
          },
        ),
      }));
      expect(geometry.right).toBeLessThanOrEqual(geometry.width);
      for (const target of geometry.targets) {
        expect(target.height).toBeGreaterThanOrEqual(32);
        expect(target.width).toBeGreaterThanOrEqual(32);
        expect(target.right).toBeLessThanOrEqual(geometry.width);
      }
      receipts.push({ compact, appearance, titles: await titles(), geometry });
      await page.screenshot({
        path: join(
          evidence,
          `filters-inbox-${compact ? "compact" : "full"}-${appearance}.png`,
        ),
        animations: "disabled",
      });
      await tag.selectOption({ label: "compliance" });
      await expect.poll(titles).toEqual(["Filter launch compliance"]);
      await project.selectOption({ label: "Operations" });
      await expect(
        page.getByText("No matching tasks", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: join(
          evidence,
          `filters-empty-${compact ? "compact" : "full"}-${appearance}.png`,
        ),
        animations: "disabled",
      });
      await clear();
      await expect(project).toHaveValue("");
      await expect(tag).toHaveValue("");
      await expect(
        page.getByText("Filter operations revenue", { exact: true }),
      ).toBeVisible();
      await navigate(compact ? "All tasks" : "Tasks", compact);
      await project.selectOption({ label: "Client Launch" });
      await tag.selectOption({ label: "revenue" });
      await page
        .getByRole("button", { name: "More filters", exact: true })
        .click();
      let dialog = page.getByRole("dialog", {
        name: "Filter tasks",
        exact: true,
      });
      await dialog.getByLabel("Status", { exact: true }).selectOption("open");
      await dialog.getByLabel("Priority", { exact: true }).selectOption("P1");
      await dialog.getByLabel("Energy", { exact: true }).selectOption("3");
      await dialog
        .getByLabel("Estimated time, minutes", { exact: true })
        .fill("45");
      await dialog
        .getByLabel("Attachment contains", { exact: true })
        .fill("enterprise");
      await dialog.evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      const panel = await dialog.evaluate((element) => {
        const footer = element
          .querySelector('[data-slot="dialog-footer"]')
          ?.getBoundingClientRect();
        return {
          viewport: window.innerHeight,
          bottom: footer?.bottom,
          buttons: [
            ...element.querySelectorAll('[data-slot="dialog-footer"] button'),
          ].map((button) => button.getBoundingClientRect().toJSON()),
        };
      });
      expect(panel.bottom).toBeLessThanOrEqual(panel.viewport);
      for (const button of panel.buttons)
        expect(button.height).toBeGreaterThanOrEqual(32);
      receipts.push({ compact, appearance, panel });
      await page.screenshot({
        path: join(
          evidence,
          `filters-panel-${compact ? "compact" : "full"}-${appearance}.png`,
        ),
        animations: "disabled",
      });
      await dialog
        .getByRole("button", { name: "Apply filters", exact: true })
        .click();
      await expect.poll(titles).toEqual(["Filter launch revenue"]);
      await expect(
        page.getByLabel("Active filters", { exact: true }),
      ).toContainText("Energy 3");
      await page.screenshot({
        path: join(
          evidence,
          `filters-combined-${compact ? "compact" : "full"}-${appearance}.png`,
        ),
        animations: "disabled",
      });
      const choices: [string, string, string][] = [
        ["Status", "closed", "Filter completed revenue"],
        ["Due date", "2030-11-01", "Filter dated revenue"],
        ["Scheduled date", "2030-11-02", "Filter scheduled revenue"],
        ["Due date", "1880-11-01", "Filter historical revenue"],
      ];
      for (const [field, value, expected] of choices) {
        await page
          .getByRole("button", { name: "More filters", exact: true })
          .click();
        dialog = page.getByRole("dialog", {
          name: "Filter tasks",
          exact: true,
        });
        await dialog
          .getByRole("button", { name: "Clear all", exact: true })
          .click();
        if (field === "Status")
          await dialog.getByLabel(field, { exact: true }).selectOption(value);
        else {
          await dialog.getByLabel(field, { exact: true }).selectOption("on");
          await dialog
            .getByRole("button", { name: new RegExp(`^${field} on:`) })
            .click();
          let calendar = page.locator('[data-slot="popover-content"]');
          await calendar
            .getByRole("button", { name: "Clear date", exact: true })
            .click();
          await expect(
            dialog.getByRole("button", {
              name: `${field} on: Choose date`,
              exact: true,
            }),
          ).toBeVisible();
          await expect(dialog.getByLabel(field, { exact: true })).toHaveValue(
            "on",
          );
          await dialog
            .getByRole("button", { name: "Apply filters", exact: true })
            .click();
          await expect(dialog.getByRole("alert")).toContainText(
            "Enter a valid date",
          );
          await dialog
            .getByRole("button", {
              name: `${field} on: Choose date`,
              exact: true,
            })
            .click();
          calendar = page.locator('[data-slot="popover-content"]');
          const years = calendar.getByRole("combobox", {
            name: "Choose the Year",
            exact: true,
          });
          const navigationBounds = () =>
            calendar.locator("select").evaluateAll((controls) =>
              controls.map((control) => {
                const rect = control.getBoundingClientRect();
                return {
                  label: control.getAttribute("aria-label"),
                  top: rect.top,
                  bottom: rect.bottom,
                  reachable:
                    rect.top >= 0 &&
                    rect.bottom <= document.documentElement.clientHeight &&
                    rect.left >= 0 &&
                    rect.right <= document.documentElement.clientWidth,
                };
              }),
            );
          await expect.poll(navigationBounds).toEqual([
            expect.objectContaining({
              label: "Choose the Month",
              reachable: true,
            }),
            expect.objectContaining({
              label: "Choose the Year",
              reachable: true,
            }),
          ]);
          for (const label of ["Choose the Month", "Choose the Year"]) {
            await calendar
              .getByRole("combobox", { name: label, exact: true })
              .click();
            await page.keyboard.press("Escape");
            await page.evaluate(async () => {
              const popup = document.querySelector(
                '[data-slot="popover-content"]',
              );
              await Promise.all(
                popup
                  ?.getAnimations({ subtree: true })
                  .map((animation) => animation.finished.catch(() => {})) ?? [],
              );
            });
            if (!(await calendar.isVisible()))
              await dialog
                .getByRole("button", {
                  name: `${field} on: Choose date`,
                  exact: true,
                })
                .click();
          }
          const popup = await calendar.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return {
              top: rect.top,
              bottom: rect.bottom,
              viewport: document.documentElement.clientHeight,
              height: element.clientHeight,
              scrollHeight: element.scrollHeight,
            };
          });
          expect(popup.top).toBeGreaterThanOrEqual(0);
          expect(popup.bottom).toBeLessThanOrEqual(popup.viewport);
          receipts.push({
            compact,
            appearance,
            field,
            value,
            calendar: { navigation: await navigationBounds(), popup },
            pointerControls: ["Choose the Month", "Choose the Year"],
          });
          const targetYear = Number(value.slice(0, 4));
          for (let step = 0; step < 100; step++) {
            const available = (
              await years
                .locator("option")
                .evaluateAll((options) =>
                  options.map((option) => Number(option.getAttribute("value"))),
                )
            ).sort((a, b) => a - b);
            if (available.includes(targetYear)) break;
            const boundary =
              targetYear < Math.min(...available)
                ? Math.min(...available)
                : Math.max(...available);
            await years.selectOption(String(boundary));
          }
          await years.selectOption(String(targetYear));
          await calendar
            .getByRole("combobox", { name: "Choose the Month", exact: true })
            .selectOption(String(Number(value.slice(5, 7)) - 1));
          const month = new Date(`${value}T12:00:00`).toLocaleDateString(
            "en-US",
            { month: "long" },
          );
          await calendar
            .getByRole("button", {
              name: new RegExp(
                `${month} ${Number(value.slice(8))}(st|nd|rd|th)?, ${value.slice(0, 4)}`,
              ),
            })
            .click();
          await expect(
            calendar.getByRole("button", { name: "Add time", exact: true }),
          ).toHaveCount(0);
          if (targetYear < 1900)
            await page.screenshot({
              path: join(
                evidence,
                `filters-historical-calendar-${compact ? "compact" : "full"}-${appearance}.png`,
              ),
              animations: "disabled",
            });
          await calendar
            .getByRole("button", { name: "Apply", exact: true })
            .click();
        }
        await dialog
          .getByRole("button", { name: "Apply filters", exact: true })
          .click();
        await expect.poll(titles).toEqual([expected]);
      }
      await page
        .getByRole("button", { name: "More filters", exact: true })
        .click();
      dialog = page.getByRole("dialog", { name: "Filter tasks", exact: true });
      await dialog
        .getByRole("button", { name: "Clear all", exact: true })
        .click();
      const largeEstimate = "99999999999999999999999999999999999999";
      await dialog
        .getByLabel("Estimated time, minutes", { exact: true })
        .fill(largeEstimate);
      await dialog
        .getByRole("button", { name: "Apply filters", exact: true })
        .click();
      await expect(
        page.getByLabel("Active filters", { exact: true }),
      ).toHaveText(`${largeEstimate} min`);
      await expect.poll(titles).toEqual([]);
      await clear();
    }
    if (compact)
      await page
        .getByRole("button", { name: "Expand window", exact: true })
        .click();
  }
  await setAppearance(page, "light");
  await navigate("Inbox", false);
  await project.selectOption({ label: "Client Launch" });
  await tag.selectOption({ label: "revenue" });
  const secondClient = Schema.decodeUnknownSync(
    Schema.Struct({
      task: Schema.Struct({ id: Schema.String, row_version: Schema.Number }),
    }),
  )(
    JSON.parse(
      cli(
        "add",
        "Filter second client revenue",
        "--project",
        "Client Launch",
        "--tag",
        "revenue",
      ),
    ),
  ).task;
  await expect
    .poll(titles)
    .toEqual(["Filter launch revenue", "Filter second client revenue"]);
  await expect(project.locator("option:checked")).toHaveText("Client Launch");
  await expect(tag.locator("option:checked")).toHaveText("revenue");
  await selectProfile(page, "personal");
  await expect(project).toHaveValue("");
  await expect(tag).toHaveValue("");
  await expect(
    page.getByText("Filter launch revenue", { exact: true }),
  ).toBeHidden();
  await selectProfile(page, "work");
  for (const task of fixtures) {
    const latest = Schema.decodeUnknownSync(Task)(
      await api(`/profiles/work/tasks/${task.id}`),
    );
    await api(
      `/profiles/work/tasks/${task.id}?from_version=${latest.row_version}`,
      "DELETE",
    );
  }
  await api(
    `/profiles/work/tasks/${secondClient.id}?from_version=${secondClient.row_version}`,
    "DELETE",
  );
  await navigate("Tasks", false);
  if (disconnect) {
    await page
      .getByRole("button", { name: "More filters", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Filter tasks",
      exact: true,
    });
    await dialog.getByLabel("Status", { exact: true }).selectOption("open");
    await dialog
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(page.getByLabel("Active filters", { exact: true })).toHaveText(
      "open",
    );
    const cachedTitles = await titles();
    expect(cachedTitles.length).toBeGreaterThan(0);
    await disconnect();
    await page
      .getByRole("button", { name: "More filters", exact: true })
      .click();
    await dialog.getByLabel("Status", { exact: true }).selectOption("closed");
    await dialog
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({
        hasText:
          "Could not apply filters. Your previous filters are still active.",
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Active filters", { exact: true })).toHaveText(
      "open",
    );
    await expect.poll(titles).toEqual(cachedTitles);
    await clear();
    await expect
      .poll(() => page.locator(".task-row").count())
      .toBeGreaterThan(0);
    await expect(
      page.getByLabel("Active filters", { exact: true }),
    ).toHaveCount(0);
  }
  writeFileSync(
    join(evidence, "task-filters.json"),
    JSON.stringify(
      {
        status: "PASS",
        intersections: receipts,
        liveRefresh: true,
        profileReset: true,
        offlineClear: Boolean(disconnect),
        offlineReplacementPreservesCriteria: Boolean(disconnect),
      },
      null,
      2,
    ),
  );
}
