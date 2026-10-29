import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { Task } from "@todo/domain";
import { Schema } from "effect";

export async function verifyTagLayout({
  page,
  evidence,
  api,
}: {
  page: Page;
  evidence: string;
  api: (path: string, method?: string, payload?: unknown) => Promise<unknown>;
}) {
  const measurements: unknown[] = [];
  for (const compact of [false, true]) {
    if (compact)
      await page
        .getByRole("button", { name: "Compact mode", exact: true })
        .click();
    for (const count of [0, 1, 3, 8]) {
      const task = Schema.decodeUnknownSync(Task)(
        await api("/profiles/work/tasks", "POST", {
          title: `Tag layout ${compact ? "compact" : "full"} ${count}`,
          tag_names: [
            "alpha",
            "beta",
            "gamma",
            "delta",
            "epsilon",
            "zeta",
            "eta",
            "theta",
          ].slice(0, count),
        }),
      );
      await page.locator(`[data-task-id="${task.id}"] .task-content`).click();
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
        task.title,
      );
      const field = page.locator(".tag-input");
      await field.scrollIntoViewIfNeeded();
      await expect(
        field.getByRole("button", { name: /^Remove Tag / }),
      ).toHaveCount(count);
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle("dark", dark),
          theme === "dark",
        );
        const geometry = await field.evaluate((element) => {
          const field = element.getBoundingClientRect();
          const trigger = element
            .querySelector(".combobox-chevron")
            ?.getBoundingClientRect();
          const input = element.querySelector("input")?.getBoundingClientRect();
          const chips = [
            ...element.querySelectorAll('[aria-label^="Remove Tag "]'),
          ].map((chip) => chip.getBoundingClientRect());
          const rows = new Set(
            [...chips, ...(input ? [input] : [])].map((rect) =>
              Math.round(rect.top),
            ),
          );
          return {
            height: field.height,
            rows: rows.size,
            triggerAtEnd: trigger ? field.right - trigger.right <= 12 : false,
            triggerCentered: trigger
              ? Math.abs(
                  (trigger.top + trigger.bottom) / 2 -
                    (field.top + field.bottom) / 2,
                ) <= 2
              : false,
            growsWithRows: field.height <= rows.size * 28 + 8,
            noOverflow: element.scrollWidth <= element.clientWidth,
          };
        });
        measurements.push({ compact, count, theme, ...geometry });
        await page.screenshot({
          path: join(
            evidence,
            `u01-tags-${compact ? "compact" : "full"}-${count}-${theme}.png`,
          ),
          animations: "disabled",
        });
      }
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark"),
      );
      if (compact)
        await page
          .getByRole("button", { name: "Back to tasks", exact: true })
          .click();
      else {
        await page
          .getByRole("button", { name: "Task actions", exact: true })
          .click();
        await page
          .getByRole("menuitem", { name: "Close editor", exact: true })
          .click();
      }
      await api(`/profiles/work/tasks/${task.id}?from_version=1`, "DELETE");
    }
    if (compact)
      await page
        .getByRole("button", { name: "Expand window", exact: true })
        .click();
  }
  writeFileSync(
    join(evidence, "u01-tag-layout.json"),
    JSON.stringify(measurements, null, 2),
  );
  if (process.env.TODO_U01_OBSERVE !== "1")
    for (const measurement of measurements)
      expect(measurement).toMatchObject({
        triggerAtEnd: true,
        triggerCentered: true,
        growsWithRows: true,
        noOverflow: true,
      });
}
