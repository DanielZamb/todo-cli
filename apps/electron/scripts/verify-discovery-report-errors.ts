import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { ImportReport, ProfileId, TaskId, Version } from "@todo/domain";
import { Schema } from "effect";
import type { Reply } from "../src/protocol.ts";
import { settleRenderer } from "./settle-renderer.ts";

const Created = Schema.Struct({
  task: Schema.Struct({ id: TaskId, row_version: Version }),
});
export async function verifyDiscoveryReportErrors({
  page,
  cli,
  notify,
  replies,
  evidence,
  setImportFixture,
  lookupRequestCount,
}: {
  page: Page;
  cli: (profile: string, ...args: string[]) => unknown;
  notify: (detail: unknown) => Promise<unknown>;
  replies: Reply[];
  evidence: string;
  setImportFixture: (report: ImportReport | null) => void;
  lookupRequestCount: () => number;
}) {
  const reports: unknown[] = [];
  const screenshots: string[] = [];
  const appearance: unknown[] = [];
  const genericPairs: unknown[] = [];
  const create = (...args: string[]) =>
    Schema.decodeUnknownSync(Created)(cli("work", "add", ...args)).task;
  const open = async (name: string) => {
    await page
      .getByRole("button", { name: "Navigate tasks", exact: true })
      .click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };
  const shot = async (
    name: string,
    layouts: readonly boolean[] = [true],
    expectedPair?: string,
  ) => {
    for (const compact of layouts) {
      await page.setViewportSize({
        width: compact ? 393 : 1100,
        height: compact ? 426 : 720,
      });
      await notify({ _tag: "windowMode", compact });
      const status = page.getByTestId("task-lookup-status").first();
      if (!name.includes("MIXED") && (await status.count()))
        await status
          .getByRole("button", { name: "Find Task by id", exact: true })
          .scrollIntoViewIfNeeded();
      for (const dark of [false, true]) {
        if (name.includes("MIXED"))
          await page.locator(".import-list-scroll").evaluate((node) => {
            node.scrollTop = 0;
          });
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle("dark", dark),
          dark,
        );
        await settleRenderer(page);
        if (expectedPair) {
          const row = page
            .locator('[data-slot="dialog-content"][data-open]')
            .locator(
              ".batch-edit-row small[role=alert], .attachment-batch-row small[role=alert], .import-row-changes.import-rejected, .import-row .dependency-error-region, .import-table tbody tr td:last-child",
            )
            .first();
          await expect(row).toContainText(expectedPair);
          const text = await row.innerText();
          const whiteSpace = await row.evaluate(
            (node) => getComputedStyle(node).whiteSpace,
          );
          assert.equal(text.split("\n").at(-1), expectedPair);
          assert.equal(text.split(expectedPair).length - 1, 1);
          const dependencyStatus = await row.evaluate((node) =>
            node.classList.contains("dependency-error-region"),
          );
          if (dependencyStatus) {
            const pair = row.locator("p").last();
            await expect(pair).toHaveText(expectedPair);
            await expect(pair).toHaveClass(/text-muted-foreground/u);
            const geometry = await row.evaluate((node) => {
              const paragraphs = [...node.querySelectorAll("p")];
              const pair = paragraphs.at(-1)?.getBoundingClientRect();
              return {
                pair: pair?.toJSON(),
                previous: paragraphs
                  .slice(0, -1)
                  .map((p) => p.getBoundingClientRect().toJSON()),
              };
            });
            const pairBounds = geometry.pair;
            assert.ok(pairBounds);
            assert.ok(
              geometry.previous.every((p) => p.bottom <= pairBounds.top),
              JSON.stringify(geometry),
            );
          } else assert.equal(whiteSpace, "pre-line");
          genericPairs.push({
            name,
            compact,
            dark,
            expectedPair,
            text,
            whiteSpace,
            dependencyStatus,
          });
          writeFileSync(
            join(evidence, "generic-row-pairs.json"),
            JSON.stringify(genericPairs, null, 2),
          );
        }
        const style = await page.evaluate(() => {
          const popup = document.querySelector<HTMLElement>(
            '[data-slot="dialog-content"][data-open]',
          );
          if (!popup) throw new Error("Missing open dialog");
          const computed = getComputedStyle(popup);
          const box = popup.getBoundingClientRect();
          const hit = document.elementFromPoint(
            box.x + box.width / 2,
            box.y + Math.min(100, box.height / 2),
          );
          return {
            dark: document.documentElement.classList.contains("dark"),
            background: computed.backgroundColor,
            color: computed.color,
            opacity: computed.opacity,
            popupContainsHit: hit !== null && popup.contains(hit),
            rows: [
              ...popup.querySelectorAll(
                ".import-row, .import-table tbody tr, .batch-edit-row, .attachment-batch-row",
              ),
            ].map((row) => {
              const rect = row.getBoundingClientRect();
              const card = row
                .querySelector('[data-testid="task-lookup-status"]')
                ?.getBoundingClientRect();
              return {
                top: rect.top,
                bottom: rect.bottom,
                cardTop: card?.top ?? rect.top,
                cardBottom: card?.bottom ?? rect.bottom,
              };
            }),
            cards: [
              ...popup.querySelectorAll('[data-testid="task-lookup-status"]'),
            ].map((card) => ({
              background: getComputedStyle(card).backgroundColor,
              color: getComputedStyle(card).color,
            })),
          };
        });
        assert.equal(style.dark, dark);
        assert.equal(
          style.background,
          dark ? "rgb(36, 47, 39)" : "rgb(255, 255, 255)",
        );
        assert.equal(
          style.color,
          dark ? "rgb(240, 243, 239)" : "rgb(22, 29, 25)",
        );
        assert.equal(style.opacity, "1");
        assert.equal(style.popupContainsHit, true);
        for (const card of style.cards) {
          assert.equal(
            card.background,
            dark ? "rgb(29, 38, 32)" : "rgb(255, 255, 255)",
          );
          assert.equal(card.color, style.color);
        }
        for (let index = 0; index < style.rows.length; index++) {
          const row = style.rows[index];
          if (!row) throw new Error("Missing row");
          assert.ok(
            row.cardTop >= row.top && row.cardBottom <= row.bottom,
            "Recovery card must fit its row",
          );
          const next = style.rows[index + 1];
          if (next) assert.ok(row.bottom <= next.top, "Rows must not overlap");
        }
        appearance.push({ name, compact, ...style });
        writeFileSync(
          join(evidence, "report-appearance.json"),
          JSON.stringify(appearance, null, 2),
        );
        const path = join(
          evidence,
          `${name}-${compact ? "compact" : "full"}-${dark ? "dark" : "light"}.png`,
        );
        await page.screenshot({ path });
        screenshots.push(path);
        if (name.includes("MIXED")) {
          const rows = page.locator(
            compact ? ".import-row" : ".import-table tbody tr",
          );
          await expect(rows).toHaveCount(4);
          await rows.last().scrollIntoViewIfNeeded();
          const last = await rows.last().boundingBox();
          const viewport = await page
            .locator(".import-list-scroll")
            .boundingBox();
          assert.ok(
            last &&
              viewport &&
              last.y >= viewport.y &&
              last.y + last.height <= viewport.y + viewport.height + 1,
            "Final row must be reachable in the scroll viewport",
          );
          await settleRenderer(page);
          const lastPath = join(
            evidence,
            `${name}-last-row-${compact ? "compact" : "full"}-${dark ? "dark" : "light"}.png`,
          );
          await page.screenshot({ path: lastPath });
          screenshots.push(lastPath);
        }
      }
    }
    await page.setViewportSize({ width: 393, height: 426 });
    await notify({ _tag: "windowMode", compact: true });
    await settleRenderer(page);
  };
  const recover = async (task: string) => {
    const status = page.getByTestId("task-lookup-status").first();
    await expect(status).toContainText("Task not found in work.");
    await expect(status).toContainText("error 3 - not found or auth missing");
    await expect(status).not.toContainText("GET /");
    await expect(status).not.toContainText("todo ");
    const count = lookupRequestCount();
    await status
      .getByRole("button", { name: "Find Task by id", exact: true })
      .click();
    await expect(page.getByTestId("discovery-prefix")).toHaveValue(task);
    await page.waitForTimeout(300);
    assert.equal(lookupRequestCount(), count);
    await page.getByTestId("discovery-find").click();
    await expect(
      page.getByText("No matching Tasks", { exact: true }),
    ).toBeVisible();
    await page.getByTestId("discovery-close").click();
  };
  const target = create("Missing batch target");
  await open("Edit Tasks…");
  await page
    .getByRole("checkbox", { name: "Select Missing batch target", exact: true })
    .check();
  cli("work", "rm", target.id, "--expected-version", "1");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect
    .poll(() => replies.filter((reply) => reply._tag === "batchEdit").length)
    .toBe(1);
  const batch = replies.find((reply) => reply._tag === "batchEdit");
  assert.ok(batch?._tag === "batchEdit");
  reports.push({
    surface: "batch edit",
    source: "real HTTP",
    report: batch.report,
  });
  writeFileSync(
    join(evidence, "report-errors.json"),
    JSON.stringify(reports, null, 2),
  );
  await shot("batch-not-found");
  await expect(page.getByTestId("task-lookup-status")).toBeVisible();
  assert.equal(batch.report.items[0]?.error?.exit_code, 3);
  await recover(target.id);
  const genericBatch = create("Generic batch conflict target");
  await open("Edit Tasks…");
  await page
    .getByRole("checkbox", {
      name: "Select Generic batch conflict target",
      exact: true,
    })
    .check();
  cli(
    "work",
    "edit",
    genericBatch.id,
    "--title",
    "Concurrent batch edit",
    "--expected-version",
    "1",
  );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect
    .poll(() => replies.filter((reply) => reply._tag === "batchEdit").length)
    .toBe(2);
  const batchConflict = replies
    .filter((reply) => reply._tag === "batchEdit")
    .at(-1);
  assert.ok(batchConflict?._tag === "batchEdit");
  assert.equal(batchConflict.report.items[0]?.error?.code, "occ_conflict");
  assert.equal(batchConflict.report.items[0]?.error?.exit_code, 4);
  reports.push({
    surface: "generic batch Conflict",
    source: "real HTTP",
    report: batchConflict.report,
  });
  await shot("batch-generic-conflict", [true], "error 4 - Conflict");
  await expect(page.locator(".batch-edit-row small[role=alert]")).toContainText(
    "Version 2",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const source = create(
    "Attachment report source",
    "--link",
    "https://example.com/reference",
    "--label",
    "Reference",
  );
  const attachmentTarget = create("Missing Attachment target");
  await notify({ _tag: "changed", profile: "work" });
  await page.getByText("Attachment report source", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Attachment actions for example.com",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Attach to Tasks…", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Select Missing Attachment target",
      exact: true,
    })
    .check();
  cli("work", "rm", attachmentTarget.id, "--expected-version", "1");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect
    .poll(
      () => replies.filter((reply) => reply._tag === "attachmentBatch").length,
    )
    .toBe(1);
  const attachments = replies.find((reply) => reply._tag === "attachmentBatch");
  assert.ok(attachments?._tag === "attachmentBatch");
  reports.push({
    surface: "Attachment batch",
    source: "real HTTP",
    report: attachments.report,
  });
  await shot("attachment-not-found");
  assert.equal(attachments.report.items[0]?.error?.exit_code, 3);
  await recover(attachmentTarget.id);
  const genericAttachment = create("Generic Attachment conflict target");
  await page
    .getByRole("button", {
      name: "Attachment actions for example.com",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Attach to Tasks…", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Select Generic Attachment conflict target",
      exact: true,
    })
    .check();
  cli(
    "work",
    "edit",
    genericAttachment.id,
    "--title",
    "Concurrent Attachment edit",
    "--expected-version",
    "1",
  );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect
    .poll(
      () => replies.filter((reply) => reply._tag === "attachmentBatch").length,
    )
    .toBe(2);
  const attachmentConflict = replies
    .filter((reply) => reply._tag === "attachmentBatch")
    .at(-1);
  assert.ok(attachmentConflict?._tag === "attachmentBatch");
  assert.equal(attachmentConflict.report.items[0]?.error?.code, "occ_conflict");
  assert.equal(attachmentConflict.report.items[0]?.error?.exit_code, 4);
  reports.push({
    surface: "generic Attachment Conflict",
    source: "real HTTP",
    report: attachmentConflict.report,
  });
  await shot("attachment-generic-conflict", [true], "error 4 - Conflict");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const singleConflict = await page.evaluate(
    (task) =>
      window.desktop.request({
        _tag: "attachMany",
        profile: task.profile,
        payload: {
          task_id: task.id,
          from_version: task.version,
          attachments: [{ kind: "link", url: "https://example.com/reference" }],
        },
      }),
    {
      profile: Schema.decodeUnknownSync(ProfileId)("work"),
      id: genericAttachment.id,
      version: genericAttachment.row_version,
    },
  );
  assert.equal(singleConflict._tag, "conflict");
  if (singleConflict._tag !== "conflict")
    throw new Error("Expected Attachment Conflict");
  assert.equal(singleConflict.exit_detail, "error 4 - Conflict");
  assert.equal(singleConflict.latest?.row_version, 2);
  reports.push({
    surface: "single attachMany Conflict pair",
    source: "real HTTP",
    reply: singleConflict,
  });
  const single = await page.evaluate(
    async (task) =>
      window.desktop.request({
        _tag: "attachMany",
        profile: task.profile,
        payload: {
          task_id: task.id,
          from_version: task.version,
          attachments: [{ kind: "link", url: "https://example.com/reference" }],
        },
      }),
    {
      profile: Schema.decodeUnknownSync(ProfileId)("work"),
      id: attachmentTarget.id,
      version: source.row_version,
    },
  );
  assert.equal(single._tag, "error");
  if (single._tag !== "error") throw new Error("Expected rejected Attachment");
  assert.equal(single.details?.profile.id, "work");
  assert.equal(single.details?.task_id, attachmentTarget.id);
  reports.push({
    surface: "single attachMany adapter",
    source: "real HTTP",
    reply: single,
  });
  await page
    .getByRole("button", { name: "Back to tasks", exact: true })
    .click();
  const imported = create(
    "Missing import target",
    "--external-id",
    "report-import-gone",
  );
  await open("Import…");
  const file = {
    name: "missing-import.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        {
          external_id: "report-import-gone",
          task_id: imported.id,
          from_version: 1,
          title: "Updated missing import target",
        },
      ]),
    ),
  };
  await page.getByLabel("Import file", { exact: true }).setInputFiles(file);
  cli("work", "rm", imported.id, "--expected-version", "1");
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect
    .poll(() => replies.filter((reply) => reply._tag === "importReport").length)
    .toBe(1);
  const importedReply = replies.find((reply) => reply._tag === "importReport");
  assert.ok(importedReply?._tag === "importReport");
  assert.equal(importedReply.report.items[0]?.error?.code, "task_deleted");
  assert.equal(importedReply.report.items[0]?.error?.exit_code, 2);
  reports.push({
    surface: "import",
    source: "real HTTP",
    actualCode: importedReply.report.items[0]?.error?.code,
    actualExitCode: importedReply.report.items[0]?.error?.exit_code,
    report: importedReply.report,
  });
  await shot(
    "import-real-rejection",
    [true, false],
    "error 2 - validation or usage",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const importConflictTask = create(
    "Import Conflict target",
    "--external-id",
    "report-import-occ",
  );
  await open("Import…");
  const conflictFile = {
    name: "import-conflict.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        {
          external_id: "report-import-occ",
          task_id: importConflictTask.id,
          from_version: 1,
          title: "Imported Conflict title",
        },
      ]),
    ),
  };
  await page
    .getByLabel("Import file", { exact: true })
    .setInputFiles(conflictFile);
  cli(
    "work",
    "edit",
    importConflictTask.id,
    "--title",
    "Concurrent import edit",
    "--expected-version",
    "1",
  );
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect
    .poll(() => replies.filter((reply) => reply._tag === "importReport").length)
    .toBe(2);
  const importConflict = replies
    .filter((reply) => reply._tag === "importReport")
    .at(-1);
  assert.ok(importConflict?._tag === "importReport");
  assert.equal(importConflict.report.items[0]?.error?.code, "occ_conflict");
  assert.equal(importConflict.report.items[0]?.error?.exit_code, 4);
  reports.push({
    surface: "generic import Conflict",
    source: "real HTTP",
    report: importConflict.report,
  });
  await shot("import-real-conflict", [true, false], "error 4 - Conflict");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const singleFixture = Schema.decodeUnknownSync(ImportReport)({
    generated_at: "2026-11-09T00:00:00Z",
    dry_run: true,
    items: [
      {
        external_id: "report-import-gone",
        task_id: imported.id,
        from_version: 1,
        outcome: "rejected",
        changed_fields: [],
        error: {
          code: "not_found",
          message:
            "Typed fixture with GET /profiles/work/tasks and GET /tasks/lookup",
          exit_code: 3,
          exit_meaning: "not found or auth missing",
          details: {
            current_version: null,
            profile: { id: "work", name: "work" },
            task_id: imported.id,
            recovery:
              "GET /profiles/work/tasks?prefix=aaa or GET /tasks/lookup?prefix=aaa",
          },
        },
      },
    ],
    totals: { created: 0, updated: 0, unchanged: 0, rejected: 1 },
  });
  const missing = singleFixture.items[0];
  assert.ok(missing);
  const fixture = Schema.decodeUnknownSync(ImportReport)({
    ...singleFixture,
    items: [
      {
        external_id: "normal-first",
        task_id: source.id,
        from_version: 1,
        outcome: "unchanged",
        changed_fields: [],
      },
      missing,
      {
        ...missing,
        external_id: "report-import-gone-second",
        task_id: attachmentTarget.id,
        error: {
          ...missing.error,
          details: {
            current_version: null,
            profile: { id: "work", name: "work" },
            task_id: attachmentTarget.id,
            recovery: "GET /profiles/work/tasks or GET /tasks/lookup",
          },
        },
      },
      {
        external_id: "normal-last",
        task_id: source.id,
        from_version: 1,
        outcome: "unchanged",
        changed_fields: [],
      },
    ],
    totals: { ...singleFixture.totals, unchanged: 2, rejected: 2 },
  });
  setImportFixture(fixture);
  const fixtureFile = {
    ...file,
    name: "mixed-report-TYPED-FIXTURE.json",
    buffer: Buffer.from(
      JSON.stringify([
        { external_id: "normal-first", title: "Normal first row" },
        { external_id: "report-import-gone", title: "Missing import target" },
        {
          external_id: "report-import-gone-second",
          title: "Second missing import target",
        },
        { external_id: "normal-last", title: "Normal final row" },
      ]),
    ),
  };
  await open("Import…");
  await page
    .getByLabel("Import file", { exact: true })
    .setInputFiles(fixtureFile);
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect(page.getByTestId("task-lookup-status")).toHaveCount(2);
  await shot("import-MIXED-TYPED-FIXTURE", [true, false]);
  const rowLayout = await page.locator(".import-row").evaluateAll((rows) =>
    rows.map((row) => {
      const rect = row.getBoundingClientRect();
      const card = row
        .querySelector('[data-testid="task-lookup-status"]')
        ?.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        cardBottom: card?.bottom ?? rect.bottom,
      };
    }),
  );
  writeFileSync(
    join(evidence, "report-row-layout.json"),
    JSON.stringify(rowLayout, null, 2),
  );
  assert.equal(rowLayout.length, 4);
  for (let index = 0; index + 1 < rowLayout.length; index++) {
    const row = rowLayout[index],
      next = rowLayout[index + 1];
    assert.ok(row && next);
    assert.ok(
      row.bottom <= next.top && row.cardBottom <= row.bottom,
      "Recovery cards must fit ordered rows",
    );
  }
  reports.push({
    surface: "import not-found",
    source: "explicit typed UI fixture, not backend evidence",
    report: fixture,
  });
  await recover(imported.id);
  setImportFixture(null);
  writeFileSync(
    join(evidence, "report-errors.json"),
    JSON.stringify({ reports, screenshots }, null, 2),
  );
}
