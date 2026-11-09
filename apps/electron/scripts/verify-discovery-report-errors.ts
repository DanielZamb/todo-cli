import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { ImportReport, ProfileId, TaskId, Version } from "@todo/domain";
import { Schema } from "effect";
import type { Reply } from "../src/protocol.ts";

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
  const create = (...args: string[]) =>
    Schema.decodeUnknownSync(Created)(cli("work", "add", ...args)).task;
  const open = async (name: string) => {
    await page
      .getByRole("button", { name: "Navigate tasks", exact: true })
      .click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };
  const shot = async (name: string) => {
    const status = page.getByTestId("task-lookup-status");
    if (await status.count())
      await status
        .getByRole("button", { name: "Find Task by id", exact: true })
        .scrollIntoViewIfNeeded();
    for (const dark of [false, true]) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        dark,
      );
      const path = join(
        evidence,
        `${name}-compact-${dark ? "dark" : "light"}.png`,
      );
      await page.screenshot({ path });
      screenshots.push(path);
    }
  };
  const recover = async (task: string) => {
    const status = page.getByTestId("task-lookup-status");
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
  reports.push({
    surface: "import",
    source: "real HTTP",
    actualCode: importedReply.report.items[0]?.error?.code,
    actualExitCode: importedReply.report.items[0]?.error?.exit_code,
    report: importedReply.report,
  });
  await shot("import-real-rejection");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const fixture = Schema.decodeUnknownSync(ImportReport)({
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
  setImportFixture(fixture);
  await open("Import…");
  await page.getByLabel("Import file", { exact: true }).setInputFiles(file);
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect(page.getByTestId("task-lookup-status")).toBeVisible();
  await shot("import-not-found-TYPED-FIXTURE");
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
