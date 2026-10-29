import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect as baseExpect, type Page } from "@playwright/test";
import { TaskViewSchema } from "@todo/domain/presentation";
import { Schema } from "effect";
import { openImport, setAppearance } from "./appearance.ts";
import { verifyImportRaces } from "./verify-import-races.ts";

const expect = baseExpect.configure({ timeout: 60000 });

export async function verifyImport({
  page,
  scratch,
  evidence,
  cli,
}: {
  page: Page;
  scratch: string;
  evidence: string;
  cli: (...args: string[]) => string;
}) {
  const createdIds: string[] = [];
  const layouts: {
    screen: string;
    compact: boolean;
    wholeRows: number;
    partialRows: number;
    summaryHeight: number;
    targetHeights: number[];
  }[] = [];
  let lastExternalId = "";
  for (const compact of [false, true]) {
    if (compact)
      await page
        .getByRole("button", { name: "Compact mode", exact: true })
        .click();
    for (const dark of [false, true]) {
      if (dark) await setAppearance(page, "dark");
      const name = `${compact ? "compact-" : ""}import-${dark ? "dark" : "light"}`;
      const prefix = `electron:${name}:${basename(evidence)}`;
      const a = Schema.decodeUnknownSync(
        Schema.Struct({ task: TaskViewSchema }),
      )(
        JSON.parse(
          cli("add", "Repository original", "--external-id", `${prefix}:a`),
        ),
      ).task;
      createdIds.push(a.id);
      lastExternalId = `${prefix}:a`;
      cli(
        "add",
        "Validate the dashboard refresh",
        "--external-id",
        `${prefix}:b`,
      );
      const file = join(scratch, `${name}.json`);
      writeFileSync(
        file,
        JSON.stringify([
          {
            external_id: `${prefix}:c`,
            title: "Enable weekly telemetry export",
            project_name: "ARG",
            tag_names: ["telemetry", "scheduler"],
          },
          {
            external_id: `${prefix}:a`,
            title: "Jira: draft the ETL follow-up",
            description: "Confirm monitoring cleanup.",
          },
          {
            external_id: `${prefix}:b`,
            title: "Validate the dashboard refresh",
          },
          { external_id: `${prefix}:d` },
        ]),
      );
      const open = () => openImport(page);
      const shot = async (state: string) => {
        const bounds = await page
          .getByRole("dialog")
          .evaluate(async (dialog) => {
            await Promise.allSettled(
              dialog
                .getAnimations({ subtree: true })
                .map((animation) => animation.finished),
            );
            const viewport = dialog
              .querySelector(".import-list-scroll")
              ?.getBoundingClientRect();
            const rows = [...dialog.querySelectorAll(".import-row")].map(
              (row) => row.getBoundingClientRect(),
            );
            const wholeRows = viewport
              ? rows.filter(
                  (row) =>
                    row.top >= viewport.top && row.bottom <= viewport.bottom,
                ).length
              : 0;
            const intersecting = viewport
              ? rows.filter(
                  (row) =>
                    row.top < viewport.bottom && row.bottom > viewport.top,
                ).length
              : 0;
            return {
              wholeRows,
              partialRows: intersecting - wholeRows,
              summaryHeight:
                dialog.querySelector(".import-summary")?.getBoundingClientRect()
                  .height ?? 0,
              buttons: [...dialog.querySelectorAll("button")].map((button) => ({
                text: button.textContent,
                slot: button.getAttribute("data-slot"),
                height: button.getBoundingClientRect().height,
              })),
              targetHeights: [...dialog.querySelectorAll("button")].map(
                (button) => button.getBoundingClientRect().height,
              ),
            };
          });
        writeFileSync(
          join(evidence, "layout-latest.json"),
          JSON.stringify(bounds, null, 2),
        );
        for (const height of bounds.targetHeights)
          expect(height).toBeGreaterThanOrEqual(32);
        if (compact && ["preview", "result", "long-preview"].includes(state)) {
          expect(bounds.wholeRows).toBeGreaterThanOrEqual(4);
          expect(bounds.partialRows).toBe(0);
          expect(bounds.summaryHeight).toBeLessThanOrEqual(18);
        }
        layouts.push({ screen: `${name}-${state}`, compact, ...bounds });
        return page.screenshot({
          path: join(evidence, `${name}-${state}.png`),
          animations: "disabled",
        });
      };
      await open();
      await expect(
        page.getByRole("heading", { name: "Import Tasks", exact: true }),
      ).toBeVisible();
      await shot("file");
      await page.getByLabel("Import file", { exact: true }).setInputFiles(file);
      await page
        .getByRole("button", { name: "Preview changes", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Preview import", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".import-summary")).toHaveText(
        compact
          ? "1 created · 1 updated · 1 unchanged · 1 rejected"
          : "1 created1 updated1 unchanged1 rejected",
      );
      await expect(
        compact
          ? page
              .getByRole("list", { name: "Import preview" })
              .getByRole("listitem")
          : page
              .getByRole("table", { name: "Import preview" })
              .locator("tbody tr"),
      ).toHaveCount(4);
      if (compact) {
        const apply = await page
          .getByRole("button", { name: /^Apply \d+ changes?$/ })
          .boundingBox();
        expect(
          apply?.y !== undefined &&
            apply.y + apply.height <= (page.viewportSize()?.height ?? 426),
        ).toBe(true);
      }
      await expect(
        page.getByRole("button", { name: "Apply 2 changes", exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByText("1 rejected item will be skipped.", { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("dialog")).toContainText(
        "New Task · Title, Project, Tags",
      );
      await expect(
        page
          .locator(".import-file-heading")
          .getByRole("button", { name: "Change…", exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(".import-footer").getByRole("button"),
      ).toHaveCount(2);
      await shot("preview");
      await page.getByRole("button", { name: /^Apply \d+ changes?$/ }).click();
      await expect(
        page.getByRole("heading", { name: "Import results", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".import-summary")).toHaveText(
        compact
          ? "1 created · 1 updated · 1 unchanged · 1 rejected"
          : "1 created1 updated1 unchanged1 rejected",
      );
      await shot("result");
      await page.getByRole("button", { name: "Done", exact: true }).click();
      const shown = Schema.decodeUnknownSync(
        Schema.Struct({ task: TaskViewSchema }),
      )(JSON.parse(cli("show", a.id))).task;
      expect([shown.title, shown.row_version, shown.external_id]).toEqual([
        "Jira: draft the ETL follow-up",
        2,
        `${prefix}:a`,
      ]);
      writeFileSync(
        file,
        JSON.stringify([
          { external_id: `${prefix}:a`, title: "My repository draft" },
        ]),
      );
      await open();
      await page.getByLabel("Import file", { exact: true }).setInputFiles(file);
      await page
        .getByRole("button", { name: "Preview changes", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Preview import", exact: true }),
      ).toBeVisible();
      cli(
        "edit",
        a.id,
        "--expected-version",
        "2",
        "--title",
        "Concurrent repository edit",
      );
      await page.getByRole("button", { name: /^Apply \d+ changes?$/ }).click();
      await expect(page.getByText("Conflict", { exact: true })).toBeVisible();
      await expect(page.locator(".import-summary")).toHaveText(
        compact ? "1 rejected" : "0 created0 updated0 unchanged1 rejected",
      );
      await shot("conflict");
      await page.getByRole("button", { name: "Done", exact: true }).click();
      const final = Schema.decodeUnknownSync(
        Schema.Struct({ task: TaskViewSchema }),
      )(JSON.parse(cli("show", a.id))).task;
      expect([final.title, final.row_version]).toEqual([
        "Concurrent repository edit",
        3,
      ]);
      writeFileSync(
        file,
        JSON.stringify(
          Array.from({ length: 12 }, (_, i) => ({
            external_id: prefix + ":scroll:" + i,
            title:
              [
                "Enable weekly telemetry export",
                "Review the repository inventory",
                "Validate the dashboard refresh",
              ][i % 3] +
              " " +
              (i + 1),
            project_name: "ARG",
            tag_names: ["telemetry"],
          })),
        ),
      );
      await open();
      await page.getByLabel("Import file", { exact: true }).setInputFiles(file);
      await page
        .getByRole("button", { name: "Preview changes", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Preview import", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".import-summary")).toHaveText(
        compact ? "12 created" : "12 created0 updated0 unchanged0 rejected",
      );
      const scroll = page.locator(".import-list-scroll");
      const viewport = await scroll.boundingBox();
      const footer = await page.locator(".import-footer-region").boundingBox();
      expect(
        viewport !== null &&
          footer !== null &&
          viewport.height >= 100 &&
          viewport.y + viewport.height <= footer.y,
      ).toBe(true);
      await shot("long-preview");
      await scroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect(
        page.getByText("Validate the dashboard refresh 12", { exact: true }),
      ).toBeVisible();
      const last = await page
        .getByText("Validate the dashboard refresh 12", { exact: true })
        .boundingBox();
      expect(
        last !== null && footer !== null && last.y + last.height <= footer.y,
      ).toBe(true);
      const replacement = join(scratch, name + "-replacement.json");
      writeFileSync(
        replacement,
        JSON.stringify([
          {
            external_id: prefix + ":replacement",
            title: "Choose the current file",
          },
        ]),
      );
      const selection = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Change…", exact: true }).click();
      await (await selection).setFiles(replacement);
      await expect(
        page.getByText("1 Task ready to preview", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Import Tasks", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Preview changes", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "Choose the current file",
      );
      await expect(
        page.getByRole("button", { name: "Apply 1 change", exact: true }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
    await setAppearance(page, "light");
  }
  await page
    .getByRole("button", { name: "Expand window", exact: true })
    .click();
  const closeFile = join(scratch, "close-missing.json");
  writeFileSync(
    closeFile,
    JSON.stringify([
      { external_id: lastExternalId, title: "Concurrent repository edit" },
    ]),
  );
  await openImport(page);
  await page
    .getByLabel("Import file", { exact: true })
    .setInputFiles(closeFile);
  await page
    .getByLabel("Cancel missing Tasks with external ids", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Preview import", exact: true }),
  ).toBeVisible();
  const firstId = createdIds[0];
  if (!firstId) throw new Error("Missing import creation");
  cli(
    "edit",
    firstId,
    "--expected-version",
    "3",
    "--title",
    "Keep concurrent missing Task",
  );
  await page.getByRole("button", { name: /^Apply \d+ changes?$/ }).click();
  await expect(page.getByText("Conflict", { exact: true })).toBeVisible();
  const preserved = Schema.decodeUnknownSync(
    Schema.Struct({ task: TaskViewSchema }),
  )(JSON.parse(cli("show", firstId))).task;
  expect([preserved.title, preserved.status, preserved.row_version]).toEqual([
    "Keep concurrent missing Task",
    "open",
    4,
  ]);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await verifyImportRaces(page, scratch, evidence, cli);
  writeFileSync(
    join(evidence, "import-layout.json"),
    JSON.stringify(layouts, null, 2),
  );
  writeFileSync(
    join(evidence, "import-result.json"),
    JSON.stringify(
      {
        passed: true,
        counts: { created: 1, updated: 1, unchanged: 1, rejected: 1 },
        conflict: true,
        closeMissingPinsVersions: true,
        appearances: ["light", "dark"],
        compact: true,
        noKeychain: true,
      },
      null,
      2,
    ),
  );
}
